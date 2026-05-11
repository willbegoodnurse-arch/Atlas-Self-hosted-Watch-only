import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateBalance,
  classifyMempoolAddressStats,
  discoverNextUnusedReceiveAddress,
  lookupAddressBalanceRecords,
  lookupAddressUsageRecords,
  selectNextUnusedReceiveAddress,
  shouldStopGapDiscovery
} from "./usage.js";
import type { AddressUsageRecord } from "./usage.js";

function address(index: number, usage: AddressUsageRecord["usage"] = "unknown"): AddressUsageRecord {
  return {
    chain: "receive",
    index,
    path: `m/84'/0'/0'/0/${index}`,
    address: `bc1qtest${index}`,
    usage,
    txCount: usage === "used" ? 1 : usage === "unused" ? 0 : null,
    confirmedTxCount: usage === "used" ? 1 : usage === "unused" ? 0 : null,
    mempoolTxCount: 0
  };
}

test("classifies mempool stats with any confirmed or mempool tx as used", () => {
  assert.equal(
    classifyMempoolAddressStats({
      chain_stats: { tx_count: 2, funded_txo_sum: 1, spent_txo_sum: 0 },
      mempool_stats: { tx_count: 0, funded_txo_sum: 0, spent_txo_sum: 0 }
    }).usage,
    "used"
  );
  assert.equal(
    classifyMempoolAddressStats({
      chain_stats: { tx_count: 0, funded_txo_sum: 0, spent_txo_sum: 0 },
      mempool_stats: { tx_count: 1, funded_txo_sum: 1, spent_txo_sum: 0 }
    }).usage,
    "used"
  );
});

test("classifies zero tx counts as unused", () => {
  const result = classifyMempoolAddressStats({
    chain_stats: { tx_count: 0, funded_txo_sum: 0, spent_txo_sum: 0 },
    mempool_stats: { tx_count: 0, funded_txo_sum: 0, spent_txo_sum: 0 }
  });

  assert.equal(result.usage, "unused");
  assert.equal(result.txCount, 0);
});

test("calculates confirmed and unconfirmed address balances from mempool stats", () => {
  const result = classifyMempoolAddressStats({
    chain_stats: {
      tx_count: 2,
      funded_txo_sum: 150_000,
      spent_txo_sum: 50_000
    },
    mempool_stats: {
      tx_count: 1,
      funded_txo_sum: 20_000,
      spent_txo_sum: 5_000
    }
  });

  assert.equal(result.confirmedBalance, 100_000);
  assert.equal(result.unconfirmedBalance, 15_000);
  assert.equal(result.totalBalance, 115_000);
});

test("treats an empty address as zero balance", () => {
  const result = classifyMempoolAddressStats({
    chain_stats: {
      tx_count: 0,
      funded_txo_sum: 0,
      spent_txo_sum: 0
    },
    mempool_stats: {
      tx_count: 0,
      funded_txo_sum: 0,
      spent_txo_sum: 0
    }
  });

  assert.equal(result.usage, "unused");
  assert.equal(result.confirmedBalance, 0);
  assert.equal(result.unconfirmedBalance, 0);
  assert.equal(result.totalBalance, 0);
});

test("classifies malformed API payloads as unknown", () => {
  assert.equal(classifyMempoolAddressStats({}).usage, "unknown");
  assert.equal(classifyMempoolAddressStats(null).usage, "unknown");
});

test("marks individual address lookup failures as unknown without throwing", async () => {
  const result = await lookupAddressUsageRecords(
    [
      {
        chain: "receive",
        index: 0,
        path: "m/84'/0'/0'/0/0",
        address: "bc1qfailure",
        usage: "unknown"
      }
    ],
    {
      fetchAddressStats: async () => {
        throw new Error("network unavailable");
      }
    }
  );

  assert.equal(result.lookupFailed, true);
  assert.equal(result.addresses[0]?.usage, "unknown");
});

test("aggregates address balances into wallet totals", async () => {
  const result = await lookupAddressBalanceRecords(
    [
      {
        chain: "receive",
        index: 0,
        path: "m/84'/0'/0'/0/0",
        address: "bc1qbalance0",
        usage: "unknown"
      },
      {
        chain: "change",
        index: 0,
        path: "m/84'/0'/0'/1/0",
        address: "bc1qbalance1",
        usage: "unknown"
      }
    ],
    {
      fetchAddressStats: async (candidate) => ({
        chain_stats: {
          tx_count: 1,
          funded_txo_sum: candidate.endsWith("0") ? 40_000 : 7_000,
          spent_txo_sum: candidate.endsWith("0") ? 10_000 : 2_000
        },
        mempool_stats: {
          tx_count: 0,
          funded_txo_sum: candidate.endsWith("0") ? 3_000 : 0,
          spent_txo_sum: 0
        }
      })
    }
  );

  assert.equal(result.lookupFailed, false);
  assert.deepEqual(result.balance, {
    confirmedBalance: 35_000,
    unconfirmedBalance: 3_000,
    totalBalance: 38_000
  });
});

test("keeps failed balance lookups graceful and excludes unknown balances from totals", async () => {
  const result = await lookupAddressBalanceRecords(
    [
      {
        chain: "receive",
        index: 0,
        path: "m/84'/0'/0'/0/0",
        address: "bc1qbalancefailure",
        usage: "unknown"
      }
    ],
    {
      fetchAddressStats: async () => {
        throw new Error("mempool unavailable");
      }
    }
  );

  assert.equal(result.lookupFailed, true);
  assert.equal(result.addresses[0]?.usage, "unknown");
  assert.deepEqual(result.balance, {
    confirmedBalance: 0,
    unconfirmedBalance: 0,
    totalBalance: 0
  });
});

test("aggregates an empty wallet balance to zero", () => {
  assert.deepEqual(aggregateBalance([]), {
    confirmedBalance: 0,
    unconfirmedBalance: 0,
    totalBalance: 0
  });
});

test("selects the address after the highest used receive index", () => {
  const selected = selectNextUnusedReceiveAddress([
    address(0, "used"),
    address(1, "used"),
    address(2, "unused"),
    address(3, "unused")
  ]);

  assert.equal(selected?.index, 2);
});

test("does not select an unknown address as next unused", () => {
  const selected = selectNextUnusedReceiveAddress([
    address(0, "used"),
    address(1, "unknown"),
    address(2, "unused")
  ]);

  assert.equal(selected, null);
});

test("detects the gap limit discovery stop condition", () => {
  assert.equal(
    shouldStopGapDiscovery([address(0, "used"), address(1, "unused"), address(2, "unused")], 2),
    true
  );
  assert.equal(
    shouldStopGapDiscovery([address(0, "used"), address(1, "unused"), address(2, "used")], 2),
    false
  );
});

test("discovers next unused receive address and stops after the configured gap", async () => {
  const derived = Array.from({ length: 6 }, (_, index) => ({
    chain: "receive" as const,
    index,
    path: `m/84'/0'/0'/0/${index}`,
    address: `bc1qderived${index}`,
    usage: "unknown" as const
  }));

  const discovery = await discoverNextUnusedReceiveAddress(derived, 2, 6, {
    fetchAddressStats: async (candidate) => {
      const used = candidate.endsWith("0") || candidate.endsWith("2");
      return {
        chain_stats: {
          tx_count: used ? 1 : 0,
          funded_txo_sum: used ? 1 : 0,
          spent_txo_sum: 0
        },
        mempool_stats: {
          tx_count: 0,
          funded_txo_sum: 0,
          spent_txo_sum: 0
        }
      };
    }
  });

  assert.equal(discovery.nextUnusedReceiveAddress?.index, 3);
  assert.equal(discovery.discoveryComplete, true);
  assert.equal(discovery.checkedCount, 5);
});

test("does not return a next unused address when lookup only returns unknown", async () => {
  const derived = Array.from({ length: 3 }, (_, index) => ({
    chain: "receive" as const,
    index,
    path: `m/84'/0'/0'/0/${index}`,
    address: `bc1qunknown${index}`,
    usage: "unknown" as const
  }));

  const discovery = await discoverNextUnusedReceiveAddress(derived, 2, 3, {
    fetchAddressStats: async () => {
      throw new Error("mempool unavailable");
    }
  });

  assert.equal(discovery.nextUnusedReceiveAddress, null);
  assert.equal(discovery.lookupFailed, true);
});
