import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateBalance,
  checkMempoolHealth,
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
    mempoolTxCount: 0,
    lookupError: usage === "unknown" ? "test lookup failed" : null
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

test("mempool health returns offline JSON on fetch failure", async () => {
  const result = await checkMempoolHealth({
    fetchTipHeight: async () => {
      throw new Error("network timeout");
    }
  });

  assert.equal(result.status, "offline");
  assert.equal(result.tipHeight, null);
  assert.equal(result.checks.tipHeight.status, "failed");
  assert.match(result.errors[0] ?? "", /network timeout/);
});

test("mempool health retries once on timeout error and succeeds", async () => {
  let calls = 0;
  const result = await checkMempoolHealth({
    fetchTipHeight: async () => {
      calls += 1;
      if (calls === 1) {
        const err = new Error("The operation was aborted due to timeout");
        err.name = "TimeoutError";
        throw err;
      }
      return "850000";
    }
  });

  assert.equal(calls, 2, "should have retried once");
  assert.equal(result.status, "online");
  assert.equal(result.tipHeight, 850000);
});

test("mempool health returns offline JSON when both retry attempts timeout", async () => {
  let calls = 0;
  const result = await checkMempoolHealth({
    fetchTipHeight: async () => {
      calls += 1;
      const err = new Error("The operation was aborted due to timeout");
      err.name = "TimeoutError";
      throw err;
    }
  });

  assert.equal(calls, 2, "should have attempted twice");
  assert.equal(result.status, "offline");
  assert.equal(result.tipHeight, null);
  assert.match(result.errors[0] ?? "", /timeout/i);
  assert.equal(result.checks.tipHeight.status, "failed");
});

test("mempool health includes checkedAt and latencyMs", async () => {
  const result = await checkMempoolHealth({
    fetchTipHeight: async () => "800000"
  });

  assert.equal(result.status, "online");
  assert.equal(result.tipHeight, 800000);
  assert.equal(typeof result.checkedAt, "string");
  assert.ok(Number.isFinite(Date.parse(result.checkedAt)));
  assert.equal(typeof result.latencyMs, "number");
  assert.ok(result.latencyMs >= 0);
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
  assert.equal(result.failedAddresses[0]?.error, "network unavailable");
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
  assert.equal(result.failedAddresses[0]?.chain, "receive");
  assert.equal(result.failedAddresses[0]?.index, 0);
  assert.equal(result.failedAddresses[0]?.error, "mempool unavailable");
  assert.deepEqual(result.balance, {
    confirmedBalance: 0,
    unconfirmedBalance: 0,
    totalBalance: 0
  });
});

test("balance lookup succeeds after one retry", async () => {
  let calls = 0;
  const result = await lookupAddressBalanceRecords(
    [
      {
        chain: "receive",
        index: 0,
        path: "m/84'/0'/0'/0/0",
        address: "bc1qretry",
        usage: "unknown"
      }
    ],
    {
      fetchAddressStats: async () => {
        calls += 1;
        if (calls === 1) {
          throw new TypeError("fetch failed");
        }
        return {
          chain_stats: {
            tx_count: 1,
            funded_txo_sum: 10_000,
            spent_txo_sum: 2_000
          },
          mempool_stats: {
            tx_count: 0,
            funded_txo_sum: 0,
            spent_txo_sum: 0
          }
        };
      }
    }
  );

  assert.equal(calls, 2);
  assert.equal(result.lookupFailed, false);
  assert.equal(result.failedAddresses.length, 0);
  assert.equal(result.balance.totalBalance, 8_000);
});

test("one failed balance address returns partial data without throwing", async () => {
  const result = await lookupAddressBalanceRecords(
    [
      {
        chain: "receive",
        index: 0,
        path: "m/84'/0'/0'/0/0",
        address: "bc1qok",
        usage: "unknown"
      },
      {
        chain: "change",
        index: 0,
        path: "m/84'/0'/0'/1/0",
        address: "bc1qfail",
        usage: "unknown"
      }
    ],
    {
      fetchAddressStats: async (candidate) => {
        if (candidate === "bc1qfail") {
          throw new Error("timeout");
        }
        return {
          chain_stats: {
            tx_count: 1,
            funded_txo_sum: 5_000,
            spent_txo_sum: 1_000
          },
          mempool_stats: {
            tx_count: 0,
            funded_txo_sum: 0,
            spent_txo_sum: 0
          }
        };
      }
    }
  );

  assert.equal(result.lookupFailed, true);
  assert.equal(result.failedAddresses.length, 1);
  assert.equal(result.failedAddresses[0]?.chain, "change");
  assert.equal(result.failedAddresses[0]?.error, "timeout");
  assert.equal(result.balance.totalBalance, 4_000);
});

test("all failed balance addresses preserve failure reasons", async () => {
  const result = await lookupAddressBalanceRecords(
    [
      {
        chain: "receive",
        index: 0,
        path: "m/84'/0'/0'/0/0",
        address: "bc1qfail0",
        usage: "unknown"
      },
      {
        chain: "change",
        index: 0,
        path: "m/84'/0'/0'/1/0",
        address: "bc1qfail1",
        usage: "unknown"
      }
    ],
    {
      fetchAddressStats: async () => {
        throw new Error("connect timeout");
      }
    }
  );

  assert.equal(result.lookupFailed, true);
  assert.equal(result.failedAddresses.length, 2);
  assert.equal(result.failedAddresses.every((failed) => failed.error === "connect timeout"), true);
  assert.deepEqual(result.balance, {
    confirmedBalance: 0,
    unconfirmedBalance: 0,
    totalBalance: 0
  });
});

test("address balance lookup does not retry malformed payloads as success", async () => {
  let calls = 0;
  const result = await lookupAddressBalanceRecords(
    [
      {
        chain: "receive",
        index: 0,
        path: "m/84'/0'/0'/0/0",
        address: "bc1qmalformed",
        usage: "unknown"
      }
    ],
    {
      fetchAddressStats: async () => {
        calls += 1;
        return {};
      }
    }
  );

  assert.equal(calls, 1);
  assert.equal(result.lookupFailed, true);
  assert.equal(result.addresses[0]?.usage, "unknown");
  assert.equal(result.failedAddresses[0]?.error, "invalid address stats payload");
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
