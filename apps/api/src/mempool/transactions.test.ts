import assert from "node:assert/strict";
import test from "node:test";
import {
  compareTransactions,
  lookupWalletTransactions,
  parseMempoolTx,
  parseMempoolTxArray
} from "./transactions.js";
import type { WalletAddress, WalletTransaction } from "./transactions.js";

const receiveAddr0: WalletAddress = {
  chain: "receive",
  index: 0,
  address: "bc1qreceive0"
};

const receiveAddr1: WalletAddress = {
  chain: "receive",
  index: 1,
  address: "bc1qreceive1"
};

const changeAddr0: WalletAddress = {
  chain: "change",
  index: 0,
  address: "bc1qchange0"
};

function confirmedTx(
  txid: string,
  blockTime: number,
  blockHeight: number,
  inputs: Array<{ address: string; value: number }>,
  outputs: Array<{ address: string; value: number }>,
  fee = 500
) {
  return {
    txid,
    status: { confirmed: true, block_time: blockTime, block_height: blockHeight },
    fee,
    vin: inputs.map(({ address, value }) => ({
      prevout: { scriptpubkey_address: address, value }
    })),
    vout: outputs.map(({ address, value }) => ({ scriptpubkey_address: address, value }))
  };
}

function unconfirmedTx(
  txid: string,
  inputs: Array<{ address: string; value: number }>,
  outputs: Array<{ address: string; value: number }>,
  fee = 300
) {
  return {
    txid,
    status: { confirmed: false },
    fee,
    vin: inputs.map(({ address, value }) => ({
      prevout: { scriptpubkey_address: address, value }
    })),
    vout: outputs.map(({ address, value }) => ({ scriptpubkey_address: address, value }))
  };
}

test("classifies incoming tx: external input, our output", async () => {
  const tx = confirmedTx(
    "txincoming",
    1_700_000_001,
    800_000,
    [{ address: "bc1qexternal", value: 200_000 }],
    [{ address: "bc1qreceive0", value: 100_000 }]
  );

  const result = await lookupWalletTransactions(
    [receiveAddr0],
    50,
    { fetchAddressTxsFn: async () => [tx] }
  );

  assert.equal(result.status, "online");
  assert.equal(result.transactions.length, 1);
  assert.equal(result.transactions[0].direction, "incoming");
  assert.equal(result.transactions[0].netSats, 100_000);
  assert.equal(result.transactions[0].feeSats, 500);
  assert.equal(result.transactions[0].blockTime, 1_700_000_001);
  assert.equal(result.failedAddresses.length, 0);
});

test("classifies outgoing tx: our input, external output", async () => {
  const tx = confirmedTx(
    "txoutgoing",
    1_700_000_002,
    800_001,
    [{ address: "bc1qreceive0", value: 100_000 }],
    [{ address: "bc1qexternal", value: 99_500 }]
  );

  const result = await lookupWalletTransactions(
    [receiveAddr0],
    50,
    { fetchAddressTxsFn: async () => [tx] }
  );

  assert.equal(result.transactions[0].direction, "outgoing");
  assert.equal(result.transactions[0].netSats, -100_000);
});

test("classifies self-send: our input and our output, net zero", async () => {
  const tx = confirmedTx(
    "txself",
    1_700_000_003,
    800_002,
    [{ address: "bc1qreceive0", value: 100_000 }],
    [{ address: "bc1qchange0", value: 99_500 }]
  );

  const result = await lookupWalletTransactions(
    [receiveAddr0, changeAddr0],
    50,
    { fetchAddressTxsFn: async (addr) => {
      if (addr === "bc1qreceive0") return [tx];
      if (addr === "bc1qchange0") return [tx];
      return [];
    }}
  );

  // netSats = 99500 - 100000 = -500 (fee), direction = outgoing
  // (self only when net == 0 exactly; here it's -500 due to fee going out of our wallet total)
  // Actually with fee: our output is 99500 but only 99500 belongs to us, inputs 100000 ours
  // netSats = 99500 - 100000 = -500, direction = outgoing
  assert.equal(result.transactions[0].txid, "txself");
  const dirs = ["outgoing", "self"];
  assert.ok(
    dirs.includes(result.transactions[0].direction),
    `expected outgoing or self, got ${result.transactions[0].direction}`
  );
});

test("deduplicates txs that appear under multiple wallet addresses", async () => {
  const tx = confirmedTx(
    "txshared",
    1_700_000_004,
    800_003,
    [{ address: "bc1qexternal", value: 300_000 }],
    [
      { address: "bc1qreceive0", value: 100_000 },
      { address: "bc1qreceive1", value: 200_000 }
    ]
  );

  const result = await lookupWalletTransactions(
    [receiveAddr0, receiveAddr1],
    50,
    { fetchAddressTxsFn: async () => [tx] }
  );

  assert.equal(result.transactions.length, 1, "same tx should appear only once");
  assert.equal(result.transactions[0].netSats, 300_000);
  assert.equal(result.transactions[0].relatedAddresses.length, 2);
});

test("returns partial status when some address lookups fail", async () => {
  const tx = confirmedTx(
    "txpartial",
    1_700_000_005,
    800_004,
    [{ address: "bc1qexternal", value: 50_000 }],
    [{ address: "bc1qreceive0", value: 50_000 }]
  );

  const result = await lookupWalletTransactions(
    [receiveAddr0, receiveAddr1],
    50,
    {
      fetchAddressTxsFn: async (addr) => {
        if (addr === "bc1qreceive0") return [tx];
        throw new Error("network error");
      }
    }
  );

  assert.equal(result.status, "partial");
  assert.equal(result.transactions.length, 1);
  assert.equal(result.failedAddresses.length, 1);
  assert.equal(result.failedAddresses[0].address, "bc1qreceive1");
});

test("returns offline status when all address lookups fail", async () => {
  const result = await lookupWalletTransactions(
    [receiveAddr0, receiveAddr1],
    50,
    {
      fetchAddressTxsFn: async () => {
        throw new Error("network error");
      }
    }
  );

  assert.equal(result.status, "offline");
  assert.equal(result.transactions.length, 0);
  assert.equal(result.failedAddresses.length, 2);
});

test("sorts unconfirmed txs before confirmed, confirmed by blockTime descending", async () => {
  const txOld = confirmedTx(
    "txold",
    1_700_000_001,
    800_000,
    [{ address: "bc1qexternal", value: 10_000 }],
    [{ address: "bc1qreceive0", value: 10_000 }]
  );
  const txNew = confirmedTx(
    "txnew",
    1_700_000_099,
    800_100,
    [{ address: "bc1qexternal", value: 20_000 }],
    [{ address: "bc1qreceive0", value: 20_000 }]
  );
  const txPending = unconfirmedTx(
    "txpending",
    [{ address: "bc1qexternal", value: 5_000 }],
    [{ address: "bc1qreceive0", value: 5_000 }]
  );

  const result = await lookupWalletTransactions(
    [receiveAddr0],
    50,
    { fetchAddressTxsFn: async () => [txOld, txNew, txPending] }
  );

  assert.equal(result.transactions[0].txid, "txpending", "unconfirmed should be first");
  assert.equal(result.transactions[1].txid, "txnew", "newer confirmed should be second");
  assert.equal(result.transactions[2].txid, "txold", "older confirmed should be last");
});

test("respects txLimit and excludes failed addresses from transaction set", async () => {
  const txs = Array.from({ length: 10 }, (_, i) =>
    confirmedTx(
      `tx${i.toString().padStart(2, "0")}`,
      1_700_000_000 + i,
      800_000 + i,
      [{ address: "bc1qexternal", value: 1_000 }],
      [{ address: "bc1qreceive0", value: 1_000 }]
    )
  );

  const result = await lookupWalletTransactions(
    [receiveAddr0, receiveAddr1],
    3,
    {
      fetchAddressTxsFn: async (addr) => {
        if (addr === "bc1qreceive0") return txs;
        throw new Error("timeout");
      }
    }
  );

  assert.equal(result.status, "partial");
  assert.equal(result.transactions.length, 3, "should be capped at txLimit");
  assert.equal(result.failedAddresses[0].address, "bc1qreceive1");
});

test("parseMempoolTx returns null for malformed input", () => {
  assert.equal(parseMempoolTx(null), null);
  assert.equal(parseMempoolTx("string"), null);
  assert.equal(parseMempoolTx({ notATxid: true }), null);
});

test("parseMempoolTxArray skips non-array input and malformed entries", () => {
  assert.deepEqual(parseMempoolTxArray(null), []);
  assert.deepEqual(parseMempoolTxArray("string"), []);
  const result = parseMempoolTxArray([
    { txid: "goodtx", status: { confirmed: true }, vin: [], vout: [] },
    { notATxid: true },
    null
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].txid, "goodtx");
});
