import assert from "node:assert/strict";
import test from "node:test";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import { BIP32Factory } from "bip32";
import { verifySignedPsbt, InvalidPsbtError } from "./verify.js";
import type { WalletRecord } from "../vault/types.js";

bitcoin.initEccLib(ecc);
const bip32 = BIP32Factory(ecc);

// ---------------------------------------------------------------------------
// Test key setup: derive wallet and signing keys from a known seed
// ---------------------------------------------------------------------------
const BTC = bitcoin.networks.bitcoin;
const TEST_SEED = Buffer.from("ab".repeat(32), "hex");
const testRoot = bip32.fromSeed(TEST_SEED, BTC);
const testAccountNode = testRoot.derivePath("m/84'/0'/0'");
const TEST_XPUB = testAccountNode.neutered().toBase58();

const recvNode = testAccountNode.derive(0).derive(0);
const TEST_RECV_ADDR = bitcoin.payments.p2wpkh({
  pubkey: Buffer.from(recvNode.publicKey),
  network: BTC
}).address!;

const chngNode = testAccountNode.derive(1).derive(0);
const TEST_CHNG_ADDR = bitcoin.payments.p2wpkh({
  pubkey: Buffer.from(chngNode.publicKey),
  network: BTC
}).address!;

// External address not derived from TEST_XPUB
const EXTERNAL_ADDR = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq";
const FAKE_TXID = "a".repeat(64);

const now = new Date().toISOString();
const testWallet: WalletRecord = {
  id: "wallet_test",
  name: "Test Wallet",
  extendedPublicKey: TEST_XPUB,
  type: "xpub",
  sourceDevice: "other",
  network: "mainnet",
  scriptType: "native-segwit",
  accountPath: "m/84'/0'/0'",
  masterFingerprint: null,
  importFormat: "plain-xpub",
  rawImport: null,
  notes: null,
  walletNotes: null,
  addressLabels: [],
  utxoNotes: [],
  transactionLabels: [],
  derivationPath: "m/84'/0'/0'",
  gapLimit: 20,
  createdAt: now,
  updatedAt: now
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeP2wpkhPsbt(
  inputAddr: string,
  inputValue: number,
  outputs: Array<{ addr: string; value: number }>
): bitcoin.Psbt {
  const psbt = new bitcoin.Psbt({ network: BTC });
  const inputScript = bitcoin.address.toOutputScript(inputAddr, BTC);
  psbt.addInput({
    hash: FAKE_TXID,
    index: 0,
    witnessUtxo: { script: inputScript, value: BigInt(inputValue) }
  });
  for (const out of outputs) {
    psbt.addOutput({ address: out.addr, value: BigInt(out.value) });
  }
  return psbt;
}

function signAllInputs(psbt: bitcoin.Psbt, signerNode: ReturnType<typeof testAccountNode.derive>): void {
  const signer = {
    publicKey: Buffer.from(signerNode.publicKey),
    sign: (hash: Buffer): Buffer => Buffer.from(signerNode.sign(hash))
  };
  for (let i = 0; i < psbt.data.inputs.length; i++) {
    psbt.signInput(i, signer);
  }
}

// ---------------------------------------------------------------------------
// Tests: error cases
// ---------------------------------------------------------------------------

test("verifySignedPsbt: throws InvalidPsbtError for invalid base64", async () => {
  await assert.rejects(
    () => verifySignedPsbt(testWallet, { psbtBase64: "!!!not-base64!!!" }),
    InvalidPsbtError
  );
});

test("verifySignedPsbt: throws InvalidPsbtError for valid base64 but not a PSBT", async () => {
  await assert.rejects(
    () => verifySignedPsbt(testWallet, { psbtBase64: Buffer.from("hello world").toString("base64") }),
    InvalidPsbtError
  );
});

// ---------------------------------------------------------------------------
// Tests: signing state
// ---------------------------------------------------------------------------

test("verifySignedPsbt: unsigned PSBT has signed=false, finalizable=false", async () => {
  const psbt = makeP2wpkhPsbt(TEST_RECV_ADDR, 100_000, [
    { addr: EXTERNAL_ADDR, value: 90_000 }
  ]);
  const result = await verifySignedPsbt(testWallet, { psbtBase64: psbt.toBase64() });
  assert.equal(result.signed, false);
  assert.equal(result.finalizable, false);
  assert.equal(result.extractable, false);
  assert.equal(result.txHex, null);
  assert.equal(result.txid, null);
});

test("verifySignedPsbt: signed PSBT has signed=true and is finalizable", async () => {
  const psbt = makeP2wpkhPsbt(TEST_RECV_ADDR, 100_000, [
    { addr: EXTERNAL_ADDR, value: 90_000 }
  ]);
  signAllInputs(psbt, recvNode);
  const result = await verifySignedPsbt(testWallet, { psbtBase64: psbt.toBase64() });
  assert.equal(result.signed, true);
  assert.equal(result.finalizable, true);
  assert.equal(result.extractable, true);
  assert.ok(result.txHex !== null && result.txHex.length > 0);
  assert.ok(result.txid !== null && result.txid.length === 64);
});

test("verifySignedPsbt: finalized PSBT has extractable=true and txHex present", async () => {
  const psbt = makeP2wpkhPsbt(TEST_RECV_ADDR, 100_000, [
    { addr: EXTERNAL_ADDR, value: 90_000 }
  ]);
  signAllInputs(psbt, recvNode);
  psbt.finalizeAllInputs();
  const result = await verifySignedPsbt(testWallet, { psbtBase64: psbt.toBase64() });
  assert.equal(result.extractable, true);
  assert.ok(typeof result.txHex === "string" && result.txHex.length > 0);
  assert.ok(typeof result.txid === "string" && result.txid.length === 64);
});

// ---------------------------------------------------------------------------
// Tests: fee calculation
// ---------------------------------------------------------------------------

test("verifySignedPsbt: computes feeSats correctly from witnessUtxo values", async () => {
  const psbt = makeP2wpkhPsbt(TEST_RECV_ADDR, 100_000, [
    { addr: EXTERNAL_ADDR, value: 90_000 }
  ]);
  const result = await verifySignedPsbt(testWallet, { psbtBase64: psbt.toBase64() });
  assert.equal(result.feeSats, 10_000);
});

test("verifySignedPsbt: feeSats with two outputs is total_in minus total_out", async () => {
  const psbt = makeP2wpkhPsbt(TEST_RECV_ADDR, 200_000, [
    { addr: EXTERNAL_ADDR, value: 100_000 },
    { addr: TEST_CHNG_ADDR, value: 95_000 }
  ]);
  const result = await verifySignedPsbt(testWallet, { psbtBase64: psbt.toBase64() });
  assert.equal(result.feeSats, 5_000);
});

// ---------------------------------------------------------------------------
// Tests: input/output ownership
// ---------------------------------------------------------------------------

test("verifySignedPsbt: input from wallet address is marked belongsToWallet=true", async () => {
  const psbt = makeP2wpkhPsbt(TEST_RECV_ADDR, 100_000, [
    { addr: EXTERNAL_ADDR, value: 90_000 }
  ]);
  const result = await verifySignedPsbt(testWallet, { psbtBase64: psbt.toBase64() });
  assert.equal(result.inputs.length, 1);
  assert.equal(result.inputs[0].address, TEST_RECV_ADDR);
  assert.equal(result.inputs[0].belongsToWallet, true);
});

test("verifySignedPsbt: input from external address is marked belongsToWallet=false", async () => {
  const psbt = makeP2wpkhPsbt(EXTERNAL_ADDR, 100_000, [
    { addr: EXTERNAL_ADDR, value: 90_000 }
  ]);
  const result = await verifySignedPsbt(testWallet, { psbtBase64: psbt.toBase64() });
  assert.equal(result.inputs[0].belongsToWallet, false);
});

test("verifySignedPsbt: wallet output is classified as change", async () => {
  const psbt = makeP2wpkhPsbt(TEST_RECV_ADDR, 100_000, [
    { addr: EXTERNAL_ADDR, value: 80_000 },
    { addr: TEST_CHNG_ADDR, value: 15_000 }
  ]);
  const result = await verifySignedPsbt(testWallet, { psbtBase64: psbt.toBase64() });
  const changeOut = result.outputs.find((o) => o.address === TEST_CHNG_ADDR);
  assert.ok(changeOut);
  assert.equal(changeOut.type, "change");
  assert.equal(changeOut.belongsToWallet, true);
});

test("verifySignedPsbt: sole external output is classified as recipient", async () => {
  const psbt = makeP2wpkhPsbt(TEST_RECV_ADDR, 100_000, [
    { addr: EXTERNAL_ADDR, value: 90_000 }
  ]);
  const result = await verifySignedPsbt(testWallet, { psbtBase64: psbt.toBase64() });
  const extOut = result.outputs.find((o) => o.address === EXTERNAL_ADDR);
  assert.ok(extOut);
  assert.equal(extOut.type, "recipient");
});

test("verifySignedPsbt: multiple external outputs remain as external", async () => {
  const psbt = makeP2wpkhPsbt(TEST_RECV_ADDR, 200_000, [
    { addr: EXTERNAL_ADDR, value: 90_000 },
    { addr: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", value: 90_000 }
  ]);
  const result = await verifySignedPsbt(testWallet, { psbtBase64: psbt.toBase64() });
  const externalOuts = result.outputs.filter((o) => !o.belongsToWallet && o.address !== null);
  assert.ok(externalOuts.every((o) => o.type === "external"));
});

// ---------------------------------------------------------------------------
// Tests: expected checks
// ---------------------------------------------------------------------------

test("verifySignedPsbt: recipientMatches=true when expected recipient is in outputs", async () => {
  const psbt = makeP2wpkhPsbt(TEST_RECV_ADDR, 100_000, [
    { addr: EXTERNAL_ADDR, value: 90_000 }
  ]);
  const result = await verifySignedPsbt(testWallet, {
    psbtBase64: psbt.toBase64(),
    expected: { recipientAddress: EXTERNAL_ADDR }
  });
  assert.equal(result.checks.recipientMatches, true);
  assert.equal(result.errors.length, 0);
});

test("verifySignedPsbt: recipientMatches=false and error when expected recipient missing", async () => {
  const psbt = makeP2wpkhPsbt(TEST_RECV_ADDR, 100_000, [
    { addr: EXTERNAL_ADDR, value: 90_000 }
  ]);
  const result = await verifySignedPsbt(testWallet, {
    psbtBase64: psbt.toBase64(),
    expected: { recipientAddress: TEST_CHNG_ADDR }
  });
  assert.equal(result.checks.recipientMatches, false);
  assert.ok(result.errors.some((e) => e.includes("not found in outputs")));
  assert.equal(result.status, "invalid");
});

test("verifySignedPsbt: amountMatches=true when output value equals expected", async () => {
  const psbt = makeP2wpkhPsbt(TEST_RECV_ADDR, 100_000, [
    { addr: EXTERNAL_ADDR, value: 90_000 }
  ]);
  const result = await verifySignedPsbt(testWallet, {
    psbtBase64: psbt.toBase64(),
    expected: { recipientAddress: EXTERNAL_ADDR, amountSats: 90_000 }
  });
  assert.equal(result.checks.amountMatches, true);
});

test("verifySignedPsbt: amountMatches=false and error when output value differs", async () => {
  const psbt = makeP2wpkhPsbt(TEST_RECV_ADDR, 100_000, [
    { addr: EXTERNAL_ADDR, value: 90_000 }
  ]);
  const result = await verifySignedPsbt(testWallet, {
    psbtBase64: psbt.toBase64(),
    expected: { recipientAddress: EXTERNAL_ADDR, amountSats: 80_000 }
  });
  assert.equal(result.checks.amountMatches, false);
  assert.ok(result.errors.some((e) => e.includes("Amount mismatch")));
});

test("verifySignedPsbt: changeAddressMatches=true when change address is wallet-owned", async () => {
  const psbt = makeP2wpkhPsbt(TEST_RECV_ADDR, 100_000, [
    { addr: EXTERNAL_ADDR, value: 80_000 },
    { addr: TEST_CHNG_ADDR, value: 15_000 }
  ]);
  const result = await verifySignedPsbt(testWallet, {
    psbtBase64: psbt.toBase64(),
    expected: { recipientAddress: EXTERNAL_ADDR, changeAddress: TEST_CHNG_ADDR }
  });
  assert.equal(result.checks.changeAddressMatches, true);
});

test("verifySignedPsbt: feeMatches=false and warning when fee differs from expected", async () => {
  const psbt = makeP2wpkhPsbt(TEST_RECV_ADDR, 100_000, [
    { addr: EXTERNAL_ADDR, value: 90_000 }
  ]);
  const result = await verifySignedPsbt(testWallet, {
    psbtBase64: psbt.toBase64(),
    expected: { feeSats: 5_000 }
  });
  assert.equal(result.checks.feeMatches, false);
  assert.ok(result.warnings.some((w) => w.includes("Fee mismatch")));
});

test("verifySignedPsbt: feeMatches=true when fee equals expected", async () => {
  const psbt = makeP2wpkhPsbt(TEST_RECV_ADDR, 100_000, [
    { addr: EXTERNAL_ADDR, value: 90_000 }
  ]);
  const result = await verifySignedPsbt(testWallet, {
    psbtBase64: psbt.toBase64(),
    expected: { feeSats: 10_000 }
  });
  assert.equal(result.checks.feeMatches, true);
});

// ---------------------------------------------------------------------------
// Tests: status
// ---------------------------------------------------------------------------

test("verifySignedPsbt: status is valid for signed PSBT with wallet inputs, no mismatch", async () => {
  const psbt = makeP2wpkhPsbt(TEST_RECV_ADDR, 100_000, [
    { addr: EXTERNAL_ADDR, value: 90_000 }
  ]);
  signAllInputs(psbt, recvNode);
  const result = await verifySignedPsbt(testWallet, { psbtBase64: psbt.toBase64() });
  assert.equal(result.status, "valid");
  assert.equal(result.warnings.length, 0);
  assert.equal(result.errors.length, 0);
});

test("verifySignedPsbt: status is warning for unsigned PSBT", async () => {
  const psbt = makeP2wpkhPsbt(TEST_RECV_ADDR, 100_000, [
    { addr: EXTERNAL_ADDR, value: 90_000 }
  ]);
  const result = await verifySignedPsbt(testWallet, { psbtBase64: psbt.toBase64() });
  assert.equal(result.status, "warning");
  assert.ok(result.warnings.some((w) => w.includes("not fully signed")));
});

test("verifySignedPsbt: status is invalid when expected recipient not found", async () => {
  const psbt = makeP2wpkhPsbt(TEST_RECV_ADDR, 100_000, [
    { addr: EXTERNAL_ADDR, value: 90_000 }
  ]);
  signAllInputs(psbt, recvNode);
  const result = await verifySignedPsbt(testWallet, {
    psbtBase64: psbt.toBase64(),
    expected: { recipientAddress: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4" }
  });
  assert.equal(result.status, "invalid");
  assert.ok(result.errors.length > 0);
});
