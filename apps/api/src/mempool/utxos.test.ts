import assert from "node:assert/strict";
import test from "node:test";
import {
  parseAddressUtxo,
  parseAddressUtxoArray,
  lookupWalletUtxos
} from "./utxos.js";

const addr1 = "bc1q7z737v8seg9qdghtj9qpf3q8jte82nynyfq6kc";
const addr2 = "bc1q83mqu4exrw5kjlcu89v6aksk4u9h7hecajwwlj";
const addr3 = "bc1qpzkfx0yhwqhsukyk8akh7nrmv9d22f05glgh6v";

const confirmedUtxo = {
  txid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  vout: 0,
  value: 50000,
  status: { confirmed: true, block_height: 800000, block_time: 1700000000 }
};

const unconfirmedUtxo = {
  txid: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  vout: 1,
  value: 2000,
  status: { confirmed: false }
};

test("parses valid confirmed UTXO payload", () => {
  const result = parseAddressUtxo(confirmedUtxo);
  assert.ok(result);
  assert.equal(result.txid, confirmedUtxo.txid);
  assert.equal(result.vout, 0);
  assert.equal(result.valueSats, 50000);
  assert.equal(result.status.confirmed, true);
  assert.equal(result.status.blockHeight, 800000);
  assert.equal(result.status.blockTime, 1700000000);
});

test("parses valid unconfirmed UTXO payload", () => {
  const result = parseAddressUtxo(unconfirmedUtxo);
  assert.ok(result);
  assert.equal(result.status.confirmed, false);
  assert.equal(result.status.blockHeight, null);
  assert.equal(result.status.blockTime, null);
});

test("parseAddressUtxo returns null for malformed input", () => {
  assert.equal(parseAddressUtxo(null), null);
  assert.equal(parseAddressUtxo("string"), null);
  assert.equal(parseAddressUtxo({ vout: 0, value: 1000 }), null);
  assert.equal(parseAddressUtxo({ txid: "abc", value: 1000 }), null);
  assert.equal(parseAddressUtxo({ txid: "abc", vout: 0 }), null);
});

test("parseAddressUtxoArray returns null for non-array", () => {
  assert.equal(parseAddressUtxoArray(null), null);
  assert.equal(parseAddressUtxoArray({}), null);
  assert.equal(parseAddressUtxoArray("string"), null);
});

test("parseAddressUtxoArray skips malformed entries", () => {
  const result = parseAddressUtxoArray([confirmedUtxo, null, "bad", unconfirmedUtxo]);
  assert.ok(result);
  assert.equal(result.length, 2);
});

test("wallet UTXO aggregation sums confirmed and unconfirmed sats", async () => {
  const result = await lookupWalletUtxos(
    [{ chain: "receive", index: 0, address: addr1, path: "m/84'/0'/0'/0/0" }],
    {
      fetchUtxosFn: async () => [confirmedUtxo, unconfirmedUtxo]
    }
  );

  assert.equal(result.status, "online");
  assert.equal(result.summary.totalUtxos, 2);
  assert.equal(result.summary.confirmedSats, 50000);
  assert.equal(result.summary.unconfirmedSats, 2000);
  assert.equal(result.summary.totalSats, 52000);
  assert.equal(result.summary.confirmedUtxos, 1);
  assert.equal(result.summary.unconfirmedUtxos, 1);
  assert.equal(result.summary.largestUtxoSats, 50000);
  assert.equal(result.summary.smallestUtxoSats, 2000);
});

test("deduplicates UTXOs by txid:vout across addresses", async () => {
  const duplicateUtxo = { ...confirmedUtxo };
  const result = await lookupWalletUtxos(
    [
      { chain: "receive", index: 0, address: addr1, path: "m/84'/0'/0'/0/0" },
      { chain: "receive", index: 1, address: addr2, path: "m/84'/0'/0'/0/1" }
    ],
    {
      fetchUtxosFn: async () => [duplicateUtxo]
    }
  );

  assert.equal(result.utxos.length, 1);
  assert.equal(result.summary.totalUtxos, 1);
});

test("one failed address returns partial status with remaining utxos", async () => {
  let call = 0;
  const result = await lookupWalletUtxos(
    [
      { chain: "receive", index: 0, address: addr1, path: null },
      { chain: "receive", index: 1, address: addr2, path: null }
    ],
    {
      fetchUtxosFn: async () => {
        call += 1;
        if (call === 1) throw new Error("timeout");
        return [confirmedUtxo];
      }
    }
  );

  assert.equal(result.status, "partial");
  assert.equal(result.failedAddresses.length, 1);
  assert.equal(result.utxos.length, 1);
});

test("all failed addresses returns offline", async () => {
  const result = await lookupWalletUtxos(
    [
      { chain: "receive", index: 0, address: addr1, path: null },
      { chain: "receive", index: 1, address: addr2, path: null }
    ],
    {
      fetchUtxosFn: async () => { throw new Error("connection refused"); }
    }
  );

  assert.equal(result.status, "offline");
  assert.equal(result.failedAddresses.length, 2);
  assert.equal(result.utxos.length, 0);
});

test("includeUnconfirmed=false excludes unconfirmed UTXOs", async () => {
  const result = await lookupWalletUtxos(
    [{ chain: "receive", index: 0, address: addr1, path: null }],
    {
      fetchUtxosFn: async () => [confirmedUtxo, unconfirmedUtxo],
      includeUnconfirmed: false
    }
  );

  assert.equal(result.utxos.length, 1);
  assert.equal(result.utxos[0]?.status, "confirmed");
  assert.equal(result.summary.unconfirmedUtxos, 0);
  assert.equal(result.summary.totalSats, 50000);
});

test("address context includes chain, index, address, path", async () => {
  const result = await lookupWalletUtxos(
    [
      { chain: "receive", index: 0, address: addr1, path: "m/84'/0'/0'/0/0" },
      { chain: "change", index: 1, address: addr2, path: "m/84'/0'/0'/1/1" }
    ],
    {
      fetchUtxosFn: async (addr) =>
        addr === addr1 ? [confirmedUtxo] : [{ ...unconfirmedUtxo, txid: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" }]
    }
  );

  const receiveUtxo = result.utxos.find((u) => u.chain === "receive");
  const changeUtxo = result.utxos.find((u) => u.chain === "change");
  assert.ok(receiveUtxo);
  assert.equal(receiveUtxo.chain, "receive");
  assert.equal(receiveUtxo.index, 0);
  assert.equal(receiveUtxo.address, addr1);
  assert.equal(receiveUtxo.path, "m/84'/0'/0'/0/0");
  assert.ok(changeUtxo);
  assert.equal(changeUtxo.chain, "change");
  assert.equal(changeUtxo.index, 1);
  assert.equal(changeUtxo.path, "m/84'/0'/0'/1/1");
});

test("UTXOs are sorted by value desc, confirmed first among equal value", async () => {
  const result = await lookupWalletUtxos(
    [
      { chain: "receive", index: 0, address: addr1, path: null },
      { chain: "receive", index: 1, address: addr2, path: null },
      { chain: "receive", index: 2, address: addr3, path: null }
    ],
    {
      fetchUtxosFn: async (addr) => {
        if (addr === addr1) return [{ ...confirmedUtxo, value: 10000, txid: "cc" + "a".repeat(62) }];
        if (addr === addr2) return [{ ...confirmedUtxo, value: 50000, txid: "dd" + "a".repeat(62) }];
        return [{ ...unconfirmedUtxo, value: 50000, txid: "ee" + "a".repeat(62) }];
      }
    }
  );

  assert.equal(result.utxos[0]?.valueSats, 50000);
  assert.equal(result.utxos[0]?.status, "confirmed");
  assert.equal(result.utxos[1]?.valueSats, 50000);
  assert.equal(result.utxos[1]?.status, "unconfirmed");
  assert.equal(result.utxos[2]?.valueSats, 10000);
});

test("empty wallet returns zero summary with online status", async () => {
  const result = await lookupWalletUtxos(
    [{ chain: "receive", index: 0, address: addr1, path: null }],
    { fetchUtxosFn: async () => [] }
  );

  assert.equal(result.status, "online");
  assert.equal(result.summary.totalUtxos, 0);
  assert.equal(result.summary.totalSats, 0);
  assert.equal(result.summary.largestUtxoSats, null);
  assert.equal(result.summary.smallestUtxoSats, null);
});

test("outpoint field is txid:vout", async () => {
  const result = await lookupWalletUtxos(
    [{ chain: "receive", index: 0, address: addr1, path: null }],
    { fetchUtxosFn: async () => [confirmedUtxo] }
  );

  assert.equal(result.utxos[0]?.outpoint, `${confirmedUtxo.txid}:0`);
});
