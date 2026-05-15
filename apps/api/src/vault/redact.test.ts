import assert from "node:assert/strict";
import test from "node:test";
import { maskXpub, redactSensitive, serializeWallet } from "./redact.js";
import type { WalletRecord } from "./types.js";

const ZPUB =
  "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtHitvf3UfTuVDe8aM";
const XPUB =
  "xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC7bkwSAFSMYX2MZfKXdouf3oD3HK68yd3JnEFN8FNpuVhqzCj8vgW6q1oHEfP3q1RFHp28HxqtQ";
const YPUB =
  "ypub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtHitvf3UfTuVDe8aM";
const TPUB =
  "tpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtHitvf3UfTuVDe8aM";
const UPUB =
  "upub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtHitvf3UfTuVDe8aM";
const VPUB =
  "vpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtHitvf3UfTuVDe8aM";
const XPRV =
  "xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqhuCo73sNSMSH8E5p4jy2eQDsz4yoqU8A4HMsNm5ZuMfzS5n4F8tV";
const YPRV =
  "yprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqhuCo73sNSMSH8E5p4jy2eQDsz4yoqU8A4HMsNm5ZuMfzS5n4F8tV";
const ZPRV =
  "zprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqhuCo73sNSMSH8E5p4jy2eQDsz4yoqU8A4HMsNm5ZuMfzS5n4F8tV";
const WIF = "5KYZdUEo39z3FPrtuX2QbbwGnNP5zTd7yyr2SC1j299sBCnWjss";
const PSBT = "cHNidP8BAHECAAAAAf//////////////////////////////////////////AAAAAAD/////";

const now = new Date().toISOString();
function makeWallet(overrides: Partial<WalletRecord> = {}): WalletRecord {
  return {
    id: "wallet_1",
    name: "Test",
    extendedPublicKey: ZPUB,
    type: "zpub",
    sourceDevice: "other",
    network: "mainnet",
    scriptType: "native-segwit",
    accountPath: "m/84'/0'/0'",
    masterFingerprint: null,
    importFormat: "bare-extended-public-key",
    rawImport: null,
    notes: null,
    walletNotes: null,
    addressLabels: [],
    utxoNotes: [],
    transactionLabels: [],
    derivationPath: "m/84'/0'/0'",
    gapLimit: 20,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// maskXpub
// ---------------------------------------------------------------------------

test("maskXpub: keeps 8-char prefix and 4-char suffix", () => {
  const masked = maskXpub(ZPUB);
  assert.equal(masked.slice(0, 8), ZPUB.slice(0, 8));
  assert.equal(masked.slice(-4), ZPUB.slice(-4));
});

test("maskXpub: contains ellipsis separating prefix and suffix", () => {
  const masked = maskXpub(ZPUB);
  assert.ok(masked.includes("..."));
  assert.equal(masked, `${ZPUB.slice(0, 8)}...${ZPUB.slice(-4)}`);
});

test("maskXpub: hides the middle portion", () => {
  const masked = maskXpub(ZPUB);
  const middle = ZPUB.slice(8, -4);
  assert.ok(!masked.includes(middle));
});

test("maskXpub: short key returns ***", () => {
  assert.equal(maskXpub("short"), "***");
  assert.equal(maskXpub(""), "***");
  assert.equal(maskXpub("12345678901"), "***");
});

// ---------------------------------------------------------------------------
// redactSensitive
// ---------------------------------------------------------------------------

test("redactSensitive: replaces full zpub in a string", () => {
  const result = redactSensitive(`key: ${ZPUB}`);
  assert.ok(!result.includes(ZPUB));
  assert.ok(result.includes("zpub6rFR..."));
});

test("redactSensitive: replaces full xpub in a string", () => {
  const result = redactSensitive(`Import: ${XPUB} end`);
  assert.ok(!result.includes(XPUB));
});

test("redactSensitive: replaces xprv key", () => {
  const result = redactSensitive(`secret: ${XPRV}`);
  assert.ok(!result.includes(XPRV));
});

test("redactSensitive: replaces WIF private key with [WIF-REDACTED]", () => {
  const result = redactSensitive(`wif=${WIF}`);
  assert.ok(!result.includes(WIF));
  assert.ok(result.includes("[WIF-REDACTED]"));
});

test("redactSensitive: replaces ypub key", () => {
  const result = redactSensitive(`key: ${YPUB}`);
  assert.ok(!result.includes(YPUB));
  assert.ok(result.includes("ypub6rFR..."));
});

test("redactSensitive: replaces tpub key", () => {
  const result = redactSensitive(`key: ${TPUB}`);
  assert.ok(!result.includes(TPUB));
  assert.ok(result.includes("tpub6rFR..."));
});

test("redactSensitive: replaces upub key", () => {
  const result = redactSensitive(`key: ${UPUB}`);
  assert.ok(!result.includes(UPUB));
});

test("redactSensitive: replaces vpub key", () => {
  const result = redactSensitive(`key: ${VPUB}`);
  assert.ok(!result.includes(VPUB));
});

test("redactSensitive: replaces yprv key", () => {
  const result = redactSensitive(`secret: ${YPRV}`);
  assert.ok(!result.includes(YPRV));
});

test("redactSensitive: replaces zprv key", () => {
  const result = redactSensitive(`secret: ${ZPRV}`);
  assert.ok(!result.includes(ZPRV));
});

test("redactSensitive: passes safe strings unchanged", () => {
  const safe = "wallet name: My Savings, network: mainnet";
  assert.equal(redactSensitive(safe), safe);
});

test("redactSensitive: redacts xpub embedded in JSON string", () => {
  const json = JSON.stringify({ key: ZPUB, other: "hello" });
  const result = redactSensitive(json);
  assert.ok(!result.includes(ZPUB));
  assert.ok(result.includes("zpub6rFR..."));
});

test("redactSensitive: does not redact short xpub-like prefix without enough characters", () => {
  const short = "zpub6rFR7y4";
  assert.equal(redactSensitive(short), short);
});

test("redactSensitive: redacts multiple keys in same string", () => {
  const s = `first=${XPUB} second=${ZPUB}`;
  const result = redactSensitive(s);
  assert.ok(!result.includes(XPUB));
  assert.ok(!result.includes(ZPUB));
});

test("redactSensitive: redacts PSBT-like payloads", () => {
  const result = redactSensitive(`psbt=${PSBT}`);
  assert.ok(!result.includes(PSBT));
  assert.ok(result.includes("[PSBT-REDACTED]"));
});

test("redactSensitive: redacts named secrets and auth material", () => {
  const result = redactSensitive("SESSION_SECRET=super-secret watch_wallet_session=signed-cookie vaultPassword: hunter2");
  assert.ok(!result.includes("super-secret"));
  assert.ok(!result.includes("signed-cookie"));
  assert.ok(!result.includes("hunter2"));
  assert.ok(result.includes("SESSION_SECRET=[REDACTED]"));
  assert.ok(result.includes("watch_wallet_session=[REDACTED]"));
  assert.ok(result.includes("vaultPassword=[REDACTED]"));
});

// ---------------------------------------------------------------------------
// serializeWallet
// ---------------------------------------------------------------------------

test("serializeWallet: extendedPublicKey in output is masked", () => {
  const w = makeWallet();
  const s = serializeWallet(w);
  assert.equal(s.extendedPublicKey, maskXpub(ZPUB));
  assert.ok(!s.extendedPublicKey.includes(ZPUB.slice(8, -4)));
});

test("serializeWallet: JSON.stringify does not contain full xpub", () => {
  const w = makeWallet();
  const json = JSON.stringify(serializeWallet(w));
  assert.ok(!json.includes(ZPUB));
});

test("serializeWallet: rawImport with embedded xpub is redacted", () => {
  const w = makeWallet({ rawImport: `wpkh(${ZPUB}/0/*)` });
  const s = serializeWallet(w);
  assert.ok(s.rawImport !== null && !s.rawImport.includes(ZPUB));
});

test("serializeWallet: null rawImport stays null", () => {
  const w = makeWallet({ rawImport: null });
  assert.equal(serializeWallet(w).rawImport, null);
});

test("serializeWallet: other fields are preserved", () => {
  const w = makeWallet({ id: "abc", name: "Cold", network: "testnet", scriptType: "taproot", gapLimit: 50 });
  const s = serializeWallet(w);
  assert.equal(s.id, "abc");
  assert.equal(s.name, "Cold");
  assert.equal(s.network, "testnet");
  assert.equal(s.scriptType, "taproot");
  assert.equal(s.gapLimit, 50);
});
