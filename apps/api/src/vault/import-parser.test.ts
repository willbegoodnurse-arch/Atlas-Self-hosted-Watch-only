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
  assert.equal(parsed.importFormat, "bare-extended-public-key");
  assert.equal(parsed.type, "xpub");
  assert.equal(parsed.scriptType, "unknown");
  assert.equal(parsed.network, "mainnet");
  assert.ok(parsed.warnings.some((warning) => warning.includes("script type confirmation")));
});

test("detects ypub and zpub script types as bare extended public keys", () => {
  const nested = parseWalletImport({ importText: ypub, network: "mainnet" });
  assert.equal(nested.importFormat, "bare-extended-public-key");
  assert.equal(nested.scriptType, "nested-segwit");

  const native = parseWalletImport({ importText: zpub, network: "mainnet" });
  assert.equal(native.importFormat, "bare-extended-public-key");
  assert.equal(native.scriptType, "native-segwit");
  assert.equal(native.masterFingerprint, null);
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

  assert.equal(parsed.importFormat, "origin-extended-public-key");
  assert.equal(parsed.masterFingerprint, "abcd1234");
  assert.equal(parsed.accountPath, "m/84'/0'/0'");
  assert.equal(parsed.scriptType, "native-segwit");
});

test("parses zpub origin metadata fingerprint and path", () => {
  const parsed = parseWalletImport({
    importText: `[f23a9c1d/84h/0h/0h]${zpub}`,
    network: "mainnet"
  });

  assert.equal(parsed.importFormat, "origin-extended-public-key");
  assert.equal(parsed.type, "zpub");
  assert.equal(parsed.masterFingerprint, "f23a9c1d");
  assert.equal(parsed.accountPath, "m/84'/0'/0'");
  assert.equal(parsed.scriptType, "native-segwit");
});

test("parses zpub descriptor origin metadata as native segwit", () => {
  const parsed = parseWalletImport({
    importText: `wpkh([f23a9c1d/84'/0'/0']${zpub}/0/*)`,
    network: "mainnet"
  });

  assert.equal(parsed.importFormat, "descriptor");
  assert.equal(parsed.type, "zpub");
  assert.equal(parsed.masterFingerprint, "f23a9c1d");
  assert.equal(parsed.accountPath, "m/84'/0'/0'");
  assert.equal(parsed.scriptType, "native-segwit");
});

test("parses Sparrow-style multiline descriptor exports", () => {
  const parsed = parseWalletImport({
    importText: [
      "# Sparrow wallet descriptor export",
      "receive = wpkh([f23a9c1d/84'/0'/0']" + zpub + "/0/*)#abcd1234",
      "change = wpkh([f23a9c1d/84'/0'/0']" + zpub + "/1/*)#abcd1234"
    ].join("\n"),
    network: "mainnet"
  });

  assert.equal(parsed.importFormat, "descriptor");
  assert.equal(parsed.masterFingerprint, "f23a9c1d");
  assert.equal(parsed.accountPath, "m/84'/0'/0'");
  assert.equal(parsed.scriptType, "native-segwit");
  assert.equal(parsed.rawImport?.includes("Sparrow"), false);
});

test("parses origin extended public key embedded in text export", () => {
  const parsed = parseWalletImport({
    importText: `Keystore: [f23a9c1d/84'/0'/0']${zpub}`,
    network: "mainnet"
  });

  assert.equal(parsed.importFormat, "origin-extended-public-key");
  assert.equal(parsed.masterFingerprint, "f23a9c1d");
  assert.equal(parsed.accountPath, "m/84'/0'/0'");
  assert.equal(parsed.scriptType, "native-segwit");
});

test("invalid origin fingerprint is rejected without falling back to bare zpub", () => {
  const parsed = parseWalletImport({
    importText: `[nothex12/84'/0'/0']${zpub}`,
    network: "mainnet"
  });

  assert.equal(parsed.extendedPublicKey, null);
  assert.equal(parsed.importFormat, "origin-extended-public-key");
  assert.match(parsed.unsupportedReason ?? "", /fingerprint must be 8 hex/i);
});

test("invalid descriptor origin fingerprint is rejected without falling back to descriptor key", () => {
  const parsed = parseWalletImport({
    importText: `wpkh([badf00dZ/84'/0'/0']${zpub}/0/*)`,
    network: "mainnet"
  });

  assert.equal(parsed.extendedPublicKey, null);
  assert.equal(parsed.importFormat, "descriptor");
  assert.match(parsed.unsupportedReason ?? "", /fingerprint must be 8 hex/i);
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

test("extracts Coldcard Generic JSON p2wpkh metadata", () => {
  const parsed = parseWalletImport({
    importText: JSON.stringify({
      xfp: "AB12CD34",
      p2wpkh: zpub,
      p2wpkh_deriv: "m/84'/0'/0'"
    }),
    sourceDevice: "coldcard",
    network: "mainnet"
  });

  assert.equal(parsed.extendedPublicKey, zpub);
  assert.equal(parsed.sourceDevice, "coldcard");
  assert.equal(parsed.importFormat, "coldcard-json");
  assert.equal(parsed.masterFingerprint, "ab12cd34");
  assert.equal(parsed.accountPath, "m/84'/0'/0'");
  assert.equal(parsed.scriptType, "native-segwit");
});

test("extracts Coldcard Generic JSON bip84 _pub metadata before xpub fallback", () => {
  const parsed = parseWalletImport({
    importText: JSON.stringify({
      chain: "BTC",
      xfp: "AB12CD34",
      account: 0,
      xpub,
      bip84: {
        deriv: "m/84'/0'/0'",
        _pub: zpub,
        xpub,
        first: "bc1qatlasreceive000000000000000000000000000"
      }
    }),
    sourceDevice: "coldcard",
    network: "mainnet"
  });

  assert.equal(parsed.extendedPublicKey, zpub);
  assert.equal(parsed.sourceDevice, "coldcard");
  assert.equal(parsed.masterFingerprint, "ab12cd34");
  assert.equal(parsed.accountPath, "m/84'/0'/0'");
  assert.equal(parsed.scriptType, "native-segwit");
});

test("rejects private material inside Coldcard Generic JSON", () => {
  assert.throws(
    () => parseWalletImport({
      importText: JSON.stringify({
        xfp: "AB12CD34",
        p2wpkh: zpub,
        private_key: "5KYZdUEo39z3FPrtuX2QbbwGnNP5zTd7yyr2SC1j299sBCnWjss"
      }),
      sourceDevice: "coldcard",
      network: "mainnet"
    }),
    /watch-only wallet/
  );
});

test("malformed JSON and JSON without watch-only key return safe unsupported results", () => {
  const malformed = parseWalletImport({
    importText: '{"xfp":"AB12CD34",',
    sourceDevice: "coldcard",
    network: "mainnet"
  });
  assert.equal(malformed.extendedPublicKey, null);
  assert.match(malformed.unsupportedReason ?? "", /Unsupported import format/);

  const noKey = parseWalletImport({
    importText: '{"xfp":"AB12CD34"}',
    sourceDevice: "coldcard",
    network: "mainnet"
  });
  assert.equal(noKey.importFormat, "coldcard-json");
  assert.equal(noKey.extendedPublicKey, null);
  assert.match(noKey.unsupportedReason ?? "", /Unsupported JSON export/);
});

test("imports a single-frame hex BBQr Coldcard Generic JSON payload", () => {
  const json = JSON.stringify({
    xfp: "AB12CD34",
    p2wpkh: zpub,
    p2wpkh_deriv: "m/84'/0'/0'"
  });
  const frame = `B$HJ0100${Buffer.from(json, "utf8").toString("hex").toUpperCase()}`;
  const parsed = parseWalletImport({
    importText: frame,
    network: "mainnet"
  });

  assert.equal(parsed.extendedPublicKey, zpub);
  assert.equal(parsed.sourceDevice, "coldcard");
  assert.equal(parsed.importFormat, "coldcard-generic-json-bbqr");
  assert.equal(parsed.masterFingerprint, "ab12cd34");
  assert.equal(parsed.accountPath, "m/84'/0'/0'");
});

test("imports a single-frame base32 BBQr Coldcard Generic JSON payload", () => {
  const json = JSON.stringify({
    xfp: "AB12CD34",
    bip84: {
      deriv: "m/84'/0'/0'",
      _pub: zpub,
      xpub
    }
  });
  const frame = `B$2J0100${base32NoPadding(Buffer.from(json, "utf8"))}`;
  const parsed = parseWalletImport({
    importText: frame,
    network: "mainnet"
  });

  assert.equal(parsed.extendedPublicKey, zpub);
  assert.equal(parsed.sourceDevice, "coldcard");
  assert.equal(parsed.importFormat, "coldcard-generic-json-bbqr");
  assert.equal(parsed.masterFingerprint, "ab12cd34");
  assert.equal(parsed.accountPath, "m/84'/0'/0'");
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

test("detects ur:crypto-hdkey as crypto-hdkey-ur without throwing", () => {
  const parsed = parseWalletImport({
    importText: "ur:crypto-hdkey/oxaxhdclaxzmfegdlp",
    network: "mainnet"
  });

  assert.equal(parsed.importFormat, "crypto-hdkey-ur");
  assert.equal(parsed.extendedPublicKey, null);
  assert.match(parsed.unsupportedReason ?? "", /UR decoding/);
});

test("detects ur:crypto-psbt as psbt-ur with unsupportedReason", () => {
  const parsed = parseWalletImport({
    importText: "ur:crypto-psbt/lpaoaxlfaohhaadaao",
    network: "mainnet"
  });

  assert.equal(parsed.importFormat, "psbt-ur");
  assert.equal(parsed.extendedPublicKey, null);
  assert.match(parsed.unsupportedReason ?? "", /PSBT/);
  assert.equal(parsed.rawImport, null);
});

test("detects raw PSBT base64 as psbt-ur with unsupportedReason", () => {
  const parsed = parseWalletImport({
    importText: "cHNidP8BAAoBAAAAAA==",
    network: "mainnet"
  });

  assert.equal(parsed.importFormat, "psbt-ur");
  assert.equal(parsed.extendedPublicKey, null);
  assert.match(parsed.unsupportedReason ?? "", /PSBT/);
  assert.equal(parsed.rawImport, null);
});

test("detects BBQr B$ prefix as bbqr with unsupportedReason", () => {
  const parsed = parseWalletImport({
    importText: "B$ZZ0110AABBCCDDEE",
    network: "mainnet"
  });

  assert.equal(parsed.importFormat, "bbqr");
  assert.equal(parsed.extendedPublicKey, null);
  assert.match(parsed.unsupportedReason ?? "", /BBQr/);
  assert.equal(parsed.rawImport, null);
});

function base32NoPadding(bytes: Buffer): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let bitCount = 0;
  let output = "";
  for (const byte of bytes) {
    bits = (bits << 8) | byte;
    bitCount += 8;
    while (bitCount >= 5) {
      output += alphabet[(bits >> (bitCount - 5)) & 31];
      bitCount -= 5;
    }
  }
  if (bitCount > 0) {
    output += alphabet[(bits << (5 - bitCount)) & 31];
  }
  return output;
}
