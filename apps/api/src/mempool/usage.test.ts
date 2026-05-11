import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyMempoolAddressStats,
  discoverNextUnusedReceiveAddress,
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
      chain_stats: { tx_count: 2 },
      mempool_stats: { tx_count: 0 }
    }).usage,
    "used"
  );
  assert.equal(
    classifyMempoolAddressStats({
      chain_stats: { tx_count: 0 },
      mempool_stats: { tx_count: 1 }
    }).usage,
    "used"
  );
});

test("classifies zero tx counts as unused", () => {
  const result = classifyMempoolAddressStats({
    chain_stats: { tx_count: 0 },
    mempool_stats: { tx_count: 0 }
  });

  assert.equal(result.usage, "unused");
  assert.equal(result.txCount, 0);
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
        chain_stats: { tx_count: used ? 1 : 0 },
        mempool_stats: { tx_count: 0 }
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
