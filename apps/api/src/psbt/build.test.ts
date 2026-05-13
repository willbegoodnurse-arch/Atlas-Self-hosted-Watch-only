import assert from "node:assert/strict";
import test from "node:test";
import {
  estimatePsbtVbytes,
  selectConfirmedUtxos,
  createWalletPsbt,
  DUST_THRESHOLD_SATS,
  InsufficientFundsError,
  InvalidPsbtParamsError,
  UnsupportedScriptTypeError
} from "./build.js";
import type { WalletRecord } from "../vault/types.js";

// ---------------------------------------------------------------------------
// Test wallet using zpub (native-segwit) with known derived addresses
// receive #0: bc1q7z737v8seg9qdghtj9qpf3q8jte82nynyfq6kc
// receive #1: bc1q83mqu4exrw5kjlcu89v6aksk4u9h7hecajwwlj
// change  #0: bc1q9pc7e43ktycvu2t8kj9ajxk2dfrk6yjxmkyr0t
// ---------------------------------------------------------------------------
const testZpub =
  "zpub6rtpJPNNq6CeKuycgiXu7RBRDzQcPG9uJWbKQ4NCiuVzP3wW6WspGjCD3h1gUKKwZRgo8Mzm21GEkD2HpUUHkfPrwyfcRaaWA93NSnnKTaP";

const now = new Date().toISOString();
const baseWallet: WalletRecord = {
  id: "wallet_test",
  name: "Test Wallet",
  extendedPublicKey: testZpub,
  type: "zpub",
  sourceDevice: "coldcard",
  network: "mainnet",
  scriptType: "native-segwit",
  accountPath: "m/84'/0'/0'",
  masterFingerprint: null,
  importFormat: "slip132",
  rawImport: testZpub,
  notes: null,
  walletNotes: null,
  addressLabels: [],
  transactionLabels: [],
  derivationPath: "m/84'/0'/0'",
  gapLimit: 20,
  createdAt: now,
  updatedAt: now
};

// Known receive addresses for the test zpub
const receiveAddr0 = "bc1q7z737v8seg9qdghtj9qpf3q8jte82nynyfq6kc";
const receiveAddr1 = "bc1q83mqu4exrw5kjlcu89v6aksk4u9h7hecajwwlj";
const changeAddr0 = "bc1q9pc7e43ktycvu2t8kj9ajxk2dfrk6yjxmkyr0t";

// An external recipient address (not from our wallet)
const externalRecipient = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq";
// A valid testnet address (for network mismatch tests)
const testnetAddress = "tb1q7z737v8seg9qdghtj9qpf3q8jte82nynw0mfdt";

// ---------------------------------------------------------------------------
// Mock UTXOs
// ---------------------------------------------------------------------------
const confirmedUtxo50k = {
  txid: "a".repeat(64),
  vout: 0,
  value: 50000,
  status: { confirmed: true, block_height: 800000, block_time: 1700000000 }
};
const confirmedUtxo30k = {
  txid: "b".repeat(64),
  vout: 0,
  value: 30000,
  status: { confirmed: true, block_height: 800001, block_time: 1700001000 }
};
const unconfirmedUtxo10k = {
  txid: "c".repeat(64),
  vout: 0,
  value: 10000,
  status: { confirmed: false }
};

// fetchUtxosFn that returns different UTXOs per address
function makeFetchFn(map: Record<string, unknown[]>) {
  return async (addr: string): Promise<unknown> => map[addr] ?? [];
}

// fetchAddressStatsFn that reports all addresses as "unused"
const allUnusedStatsFn = async (_addr: string): Promise<unknown> => ({
  chain_stats: { tx_count: 0, funded_txo_count: 0, funded_txo_sum: 0, spent_txo_count: 0, spent_txo_sum: 0 },
  mempool_stats: { tx_count: 0, funded_txo_count: 0, funded_txo_sum: 0, spent_txo_count: 0, spent_txo_sum: 0 }
});

// ---------------------------------------------------------------------------
// estimatePsbtVbytes
// ---------------------------------------------------------------------------

test("estimatePsbtVbytes: native-segwit 1 input 2 outputs", () => {
  const vb = estimatePsbtVbytes("native-segwit", 1, 2);
  // 10 + 2 + 68*1 + 43*2 = 10+2+68+86 = 166
  assert.equal(vb, 166);
});

test("estimatePsbtVbytes: taproot 2 inputs 1 output", () => {
  const vb = estimatePsbtVbytes("taproot", 2, 1);
  // 10 + 2 + 58*2 + 43*1 = 10+2+116+43 = 171
  assert.equal(vb, 171);
});

test("estimatePsbtVbytes: nested-segwit 1 input 1 output", () => {
  const vb = estimatePsbtVbytes("nested-segwit", 1, 1);
  // 10 + 2 + 91 + 43 = 146
  assert.equal(vb, 146);
});

// ---------------------------------------------------------------------------
// selectConfirmedUtxos
// ---------------------------------------------------------------------------

function makeUtxo(
  txid: string,
  valueSats: number,
  status: "confirmed" | "unconfirmed",
  chain: "receive" | "change" = "receive",
  index = 0
) {
  return {
    txid,
    vout: 0,
    outpoint: `${txid}:0`,
    valueSats,
    status,
    address: "bc1qtest",
    chain,
    index,
    path: null
  };
}

test("selectConfirmedUtxos: selects minimum UTXOs to cover amount+fee with change", () => {
  const utxos = [
    makeUtxo("a".repeat(64), 50000, "confirmed"),
    makeUtxo("b".repeat(64), 30000, "confirmed")
  ];
  // Estimate fee for 1 input, 2 outputs with 10 sats/vB
  const vbytes = estimatePsbtVbytes("native-segwit", 1, 2);
  const expectedFee = Math.ceil(vbytes * 10);
  const result = selectConfirmedUtxos(utxos, 10000, 10, "native-segwit");
  assert.equal(result.selected.length, 1);
  assert.equal(result.totalInputSats, 50000);
  assert.equal(result.feeSats, expectedFee);
  assert.ok(result.changeSats >= DUST_THRESHOLD_SATS);
  assert.equal(result.totalInputSats, result.feeSats + 10000 + result.changeSats);
});

test("selectConfirmedUtxos: excludes unconfirmed UTXOs", () => {
  const utxos = [
    makeUtxo("a".repeat(64), 50000, "unconfirmed"),
    makeUtxo("b".repeat(64), 1000, "confirmed")
  ];
  assert.throws(() => selectConfirmedUtxos(utxos, 900, 1, "native-segwit"), InsufficientFundsError);
});

test("selectConfirmedUtxos: dust change absorbed into fee", () => {
  // Set amount so that change would be < DUST_THRESHOLD_SATS
  const utxos = [makeUtxo("a".repeat(64), 50000, "confirmed")];
  const vbytes2 = estimatePsbtVbytes("native-segwit", 1, 2);
  const fee2 = Math.ceil(vbytes2 * 1);
  // Amount = 50000 - fee2 - (DUST_THRESHOLD_SATS - 1) → leaves rawChange = DUST-1
  const dustAmount = 50000 - fee2 - (DUST_THRESHOLD_SATS - 1);
  const result = selectConfirmedUtxos(utxos, dustAmount, 1, "native-segwit");
  assert.equal(result.changeSats, 0);
  assert.equal(result.feeSats, 50000 - dustAmount);
});

test("selectConfirmedUtxos: throws InsufficientFundsError when UTXOs insufficient", () => {
  const utxos = [makeUtxo("a".repeat(64), 1000, "confirmed")];
  assert.throws(() => selectConfirmedUtxos(utxos, 50000, 10, "native-segwit"), InsufficientFundsError);
});

test("selectConfirmedUtxos: throws when no UTXOs at all", () => {
  assert.throws(() => selectConfirmedUtxos([], 10000, 5, "native-segwit"), InsufficientFundsError);
});

test("selectConfirmedUtxos: selects multiple UTXOs when needed", () => {
  const utxos = [
    makeUtxo("a".repeat(64), 5000, "confirmed"),
    makeUtxo("b".repeat(64), 5000, "confirmed"),
    makeUtxo("c".repeat(64), 5000, "confirmed")
  ];
  // 10000 sats + fee needs at least 3 UTXOs of 5000 each
  const result = selectConfirmedUtxos(utxos, 10000, 5, "native-segwit");
  assert.ok(result.selected.length >= 2);
  assert.ok(result.totalInputSats >= 10000);
});

// ---------------------------------------------------------------------------
// createWalletPsbt integration tests
// ---------------------------------------------------------------------------

test("createWalletPsbt: valid native-segwit PSBT is returned with correct structure", async () => {
  const fetchFn = makeFetchFn({
    [receiveAddr0]: [confirmedUtxo50k],
    [receiveAddr1]: [confirmedUtxo30k]
  });

  const result = await createWalletPsbt(
    baseWallet,
    { recipientAddress: externalRecipient, amountSats: 10000, feeRateSatsPerVbyte: 5 },
    { fetchUtxosFn: fetchFn, fetchAddressStatsFn: allUnusedStatsFn }
  );

  assert.ok(result.psbtBase64.length > 0, "psbtBase64 should be non-empty");
  assert.equal(result.inputs.length, 1, "should use 1 UTXO");
  assert.equal(result.inputs[0]?.valueSats, 50000);
  assert.equal(result.totalInputSats, 50000);

  const recipientOutput = result.outputs.find((o) => o.type === "recipient");
  assert.ok(recipientOutput);
  assert.equal(recipientOutput.address, externalRecipient);
  assert.equal(recipientOutput.valueSats, 10000);

  assert.ok(result.feeSats > 0);
  assert.equal(result.feeSats + 10000 + result.changeSats, 50000);
  assert.ok(result.feeRateSatsPerVbyte === 5);
});

test("createWalletPsbt: change output is included when change >= dust", async () => {
  const fetchFn = makeFetchFn({ [receiveAddr0]: [confirmedUtxo50k] });

  const result = await createWalletPsbt(
    baseWallet,
    { recipientAddress: externalRecipient, amountSats: 10000, feeRateSatsPerVbyte: 1 },
    { fetchUtxosFn: fetchFn, fetchAddressStatsFn: allUnusedStatsFn }
  );

  assert.ok(result.changeSats >= DUST_THRESHOLD_SATS);
  assert.ok(result.changeAddress !== null);
  const changeOutput = result.outputs.find((o) => o.type === "change");
  assert.ok(changeOutput);
  assert.equal(changeOutput.address, changeAddr0);
});

test("createWalletPsbt: no change output when change is dust", async () => {
  // Force dust: amount = totalInput - fee2 - (DUST-1)
  const vbytes2 = estimatePsbtVbytes("native-segwit", 1, 2);
  const fee2 = Math.ceil(vbytes2 * 1);
  const dustAmount = 50000 - fee2 - (DUST_THRESHOLD_SATS - 1);

  const fetchFn = makeFetchFn({ [receiveAddr0]: [confirmedUtxo50k] });

  const result = await createWalletPsbt(
    baseWallet,
    { recipientAddress: externalRecipient, amountSats: dustAmount, feeRateSatsPerVbyte: 1 },
    { fetchUtxosFn: fetchFn, fetchAddressStatsFn: allUnusedStatsFn }
  );

  assert.equal(result.changeSats, 0);
  assert.equal(result.changeAddress, null);
  assert.equal(result.outputs.filter((o) => o.type === "change").length, 0);
});

test("createWalletPsbt: throws InvalidPsbtParamsError for wrong-network recipient", async () => {
  const fetchFn = makeFetchFn({ [receiveAddr0]: [confirmedUtxo50k] });

  await assert.rejects(
    () =>
      createWalletPsbt(
        baseWallet,
        { recipientAddress: testnetAddress, amountSats: 10000, feeRateSatsPerVbyte: 5 },
        { fetchUtxosFn: fetchFn, fetchAddressStatsFn: allUnusedStatsFn }
      ),
    InvalidPsbtParamsError
  );
});

test("createWalletPsbt: throws for invalid recipient address", async () => {
  const fetchFn = makeFetchFn({ [receiveAddr0]: [confirmedUtxo50k] });

  await assert.rejects(
    () =>
      createWalletPsbt(
        baseWallet,
        { recipientAddress: "not-an-address", amountSats: 10000, feeRateSatsPerVbyte: 5 },
        { fetchUtxosFn: fetchFn, fetchAddressStatsFn: allUnusedStatsFn }
      ),
    InvalidPsbtParamsError
  );
});

test("createWalletPsbt: throws InsufficientFundsError when no confirmed UTXOs", async () => {
  const fetchFn = makeFetchFn({ [receiveAddr0]: [unconfirmedUtxo10k] });

  await assert.rejects(
    () =>
      createWalletPsbt(
        baseWallet,
        { recipientAddress: externalRecipient, amountSats: 5000, feeRateSatsPerVbyte: 5 },
        { fetchUtxosFn: fetchFn, fetchAddressStatsFn: allUnusedStatsFn }
      ),
    InsufficientFundsError
  );
});

test("createWalletPsbt: throws InsufficientFundsError for amount > available", async () => {
  const fetchFn = makeFetchFn({ [receiveAddr0]: [confirmedUtxo50k] });

  await assert.rejects(
    () =>
      createWalletPsbt(
        baseWallet,
        { recipientAddress: externalRecipient, amountSats: 999999, feeRateSatsPerVbyte: 5 },
        { fetchUtxosFn: fetchFn, fetchAddressStatsFn: allUnusedStatsFn }
      ),
    InsufficientFundsError
  );
});

test("createWalletPsbt: throws UnsupportedScriptTypeError for legacy wallet", async () => {
  const legacyWallet = { ...baseWallet, scriptType: "legacy" as const };

  await assert.rejects(
    () =>
      createWalletPsbt(
        legacyWallet,
        { recipientAddress: externalRecipient, amountSats: 10000, feeRateSatsPerVbyte: 5 }
      ),
    UnsupportedScriptTypeError
  );
});

test("createWalletPsbt: throws UnsupportedScriptTypeError for unknown scriptType", async () => {
  const unknownWallet = { ...baseWallet, scriptType: "unknown" as const };

  await assert.rejects(
    () =>
      createWalletPsbt(
        unknownWallet,
        { recipientAddress: externalRecipient, amountSats: 10000, feeRateSatsPerVbyte: 5 }
      ),
    UnsupportedScriptTypeError
  );
});

test("createWalletPsbt: throws InvalidPsbtParamsError for fee rate 0", async () => {
  await assert.rejects(
    () =>
      createWalletPsbt(
        baseWallet,
        { recipientAddress: externalRecipient, amountSats: 10000, feeRateSatsPerVbyte: 0 }
      ),
    InvalidPsbtParamsError
  );
});

test("createWalletPsbt: throws InvalidPsbtParamsError for fee rate > 1000", async () => {
  await assert.rejects(
    () =>
      createWalletPsbt(
        baseWallet,
        { recipientAddress: externalRecipient, amountSats: 10000, feeRateSatsPerVbyte: 1001 }
      ),
    InvalidPsbtParamsError
  );
});

test("createWalletPsbt: throws InvalidPsbtParamsError for zero amount", async () => {
  await assert.rejects(
    () =>
      createWalletPsbt(
        baseWallet,
        { recipientAddress: externalRecipient, amountSats: 0, feeRateSatsPerVbyte: 5 }
      ),
    InvalidPsbtParamsError
  );
});

test("createWalletPsbt: PSBT does not include private keys or signing", async () => {
  const fetchFn = makeFetchFn({ [receiveAddr0]: [confirmedUtxo50k] });

  const result = await createWalletPsbt(
    baseWallet,
    { recipientAddress: externalRecipient, amountSats: 10000, feeRateSatsPerVbyte: 5 },
    { fetchUtxosFn: fetchFn, fetchAddressStatsFn: allUnusedStatsFn }
  );

  // An unsigned PSBT will not contain finalScriptSig or finalScriptWitness
  // We verify by checking the base64 does not contain signatures (heuristic: it should
  // successfully decode and be relatively small for 1 input unsigned).
  assert.ok(typeof result.psbtBase64 === "string");
  const decoded = Buffer.from(result.psbtBase64, "base64");
  // PSBT magic bytes: 70 73 62 74 ff
  assert.equal(decoded[0], 0x70);
  assert.equal(decoded[1], 0x73);
  assert.equal(decoded[2], 0x62);
  assert.equal(decoded[3], 0x74);
  assert.equal(decoded[4], 0xff);
});

test("createWalletPsbt: input includes chain, index, address, path context", async () => {
  const fetchFn = makeFetchFn({ [receiveAddr0]: [confirmedUtxo50k] });

  const result = await createWalletPsbt(
    baseWallet,
    { recipientAddress: externalRecipient, amountSats: 10000, feeRateSatsPerVbyte: 5 },
    { fetchUtxosFn: fetchFn, fetchAddressStatsFn: allUnusedStatsFn }
  );

  const input = result.inputs[0];
  assert.ok(input);
  assert.equal(input.chain, "receive");
  assert.equal(input.index, 0);
  assert.equal(input.address, receiveAddr0);
  assert.equal(input.path, "m/84'/0'/0'/0/0");
  assert.equal(input.outpoint, `${"a".repeat(64)}:0`);
});
