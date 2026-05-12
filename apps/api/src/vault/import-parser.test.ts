import assert from "node:assert/strict";
import test from "node:test";
import {
  parseWalletImport,
  watchOnlyImportError
} from "./import-parser.js";

const xpub =
  "xpub6BvTm7YLvSRVjijq48yLuTA3eThj9nqZjsCyd48QXLW1cgmkThmXaWRiRJv7j59nxRSkPD2ux97rSFAFPFppMEUAsE7Zoqt8oBYguJz2Mtb";
const ypub =
  "ypub6YFNF5Zk96yp8XpcifDBpksvD2Mmvmoh4qMJQD1WXce3UzryjQ3DTKwFmVQjtm2dcCEsxwxeM3PSAr9bLpazresF9nyzmvabqqu7bJv3x9v";
const zpub =
  "zpub6rtpJPNNq6CeKuycgiXu7RBRDzQcPG9uJWbKQ4NCiuVzP3wW6WspGjCD3h1gUKKwZRgo8Mzm21GEkD2HpUUHkfPrwyfcRaaWA93NSnnKTaP";
const tpub = `tpub${"A".repeat(80)}`;

test("detects xpub as plain import with script confirmation required", () => {
  const parsed = parseWalletImport({ importText: xpub, network: "mainnet" });
  assert.equal(parsed.importFormat, "plain-xpub");
  assert.equal(parsed.type, "xpub");
  assert.equal(parsed.scriptType, "unknown");
  assert.equal(parsed.network, "mainnet");
  assert.ok(parsed.warnings.some((warning) => warning.includes("script type confirmation")));
});

test("detects ypub and zpub slip132 script types", () => {
  const nested = parseWalletImport({ importText: ypub, network: "mainnet" });
  assert.equal(nested.importFormat, "slip132");
  assert.equal(nested.scriptType, "nested-segwit");

  const native = parseWalletImport({ importText: zpub, network: "mainnet" });
  assert.equal(native.importFormat, "slip132");
  assert.equal(native.scriptType, "native-segwit");
});

test("detects tpub/upub/vpub as testnet candidates", () => {
  const parsed = parseWalletImport({ importText: tpub, network: "mainnet" });
  assert.equal(parsed.type, "tpub");
  assert.equal(parsed.network, "testnet");
  assert.equal(parsed.scriptType, "unknown");
});

test("parses native SegWit descriptor origin metadata", () => {
  const parsed = parseWalletImport({
    importText: `wpkh([abcd1234/84'/0'/0']${xpub}/0/*)`,
    network: "mainnet"
  });

  assert.equal(parsed.importFormat, "descriptor");
  assert.equal(parsed.scriptType, "native-segwit");
  assert.equal(parsed.masterFingerprint, "abcd1234");
  assert.equal(parsed.accountPath, "m/84'/0'/0'");
});

test("parses nested SegWit and taproot descriptors", () => {
  const nested = parseWalletImport({
    importText: `sh(wpkh([abcd1234/49h/0h/0h]${xpub}/0/*))`,
    network: "mainnet"
  });
  assert.equal(nested.scriptType, "nested-segwit");
  assert.equal(nested.accountPath, "m/49'/0'/0'");

  const taproot = parseWalletImport({
    importText: `tr([abcd1234/86'/0'/0']${xpub}/0/*)`,
    network: "mainnet"
  });
  assert.equal(taproot.scriptType, "taproot");
  assert.equal(taproot.masterFingerprint, "abcd1234");
  assert.equal(taproot.accountPath, "m/86'/0'/0'");
  assert.equal(taproot.unsupportedReason, null, "taproot descriptor should now be derivable");
});

test("tr() descriptor with xpub is stored as taproot with BIP86 account path", () => {
  const parsed = parseWalletImport({
    importText: `tr([deadbeef/86'/0'/0']${xpub}/0/*)`,
    network: "mainnet"
  });
  assert.equal(parsed.importFormat, "descriptor");
  assert.equal(parsed.scriptType, "taproot");
  assert.equal(parsed.accountPath, "m/86'/0'/0'");
  assert.equal(parsed.masterFingerprint, "deadbeef");
  assert.equal(parsed.unsupportedReason, null);
  assert.ok(parsed.extendedPublicKey !== null);
});

test("private key taproot descriptor is rejected", () => {
  assert.throws(
    () => parseWalletImport({
      importText: `tr([abcd1234/86'/0'/0']xprv${"A".repeat(80)}/0/*)`,
      network: "mainnet"
    }),
    /watch-only/i
  );
});

test("parses key expression fingerprint and path", () => {
  const parsed = parseWalletImport({
    importText: `[abcd1234/84'/0'/0']${xpub}`,
    network: "mainnet",
    scriptType: "native-segwit"
  });

  assert.equal(parsed.importFormat, "key-expression");
  assert.equal(parsed.masterFingerprint, "abcd1234");
  assert.equal(parsed.accountPath, "m/84'/0'/0'");
  assert.equal(parsed.scriptType, "native-segwit");
});

test("rejects private keys and seed phrases", () => {
  assert.throws(
    () => parseWalletImport({ importText: `xprv${"A".repeat(80)}`, network: "mainnet" }),
    new RegExp(watchOnlyImportError.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  );
  assert.throws(
    () => parseWalletImport({
      importText: "abandon ability able about above absent absorb abstract absurd abuse access accident",
      network: "mainnet"
    }),
    /watch-only wallet/
  );
});

test("extracts Coldcard-like JSON xfp and bip84 xpub", () => {
  const parsed = parseWalletImport({
    importText: JSON.stringify({
      xfp: "AB12CD34",
      bip84: {
        deriv: "m/84'/0'/0'",
        xpub: zpub
      }
    }),
    sourceDevice: "coldcard",
    network: "mainnet"
  });

  assert.equal(parsed.sourceDevice, "coldcard");
  assert.equal(parsed.importFormat, "coldcard-json");
  assert.equal(parsed.masterFingerprint, "ab12cd34");
  assert.equal(parsed.scriptType, "native-segwit");
});

test("detects unsupported UR payloads without throwing", () => {
  const parsed = parseWalletImport({
    importText: "ur:crypto-account/otadlewtaad...",
    sourceDevice: "keystone",
    network: "mainnet"
  });

  assert.equal(parsed.importFormat, "crypto-account-ur");
  assert.equal(parsed.extendedPublicKey, null);
  assert.match(parsed.unsupportedReason ?? "", /UR decoding/);
});
