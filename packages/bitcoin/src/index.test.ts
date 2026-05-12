import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveAddresses,
  detectExtendedPublicKeyKind
} from "./index.js";

const testVectors = {
  xpub:
    "xpub6BvTm7YLvSRVjijq48yLuTA3eThj9nqZjsCyd48QXLW1cgmkThmXaWRiRJv7j59nxRSkPD2ux97rSFAFPFppMEUAsE7Zoqt8oBYguJz2Mtb",
  ypub:
    "ypub6YFNF5Zk96yp8XpcifDBpksvD2Mmvmoh4qMJQD1WXce3UzryjQ3DTKwFmVQjtm2dcCEsxwxeM3PSAr9bLpazresF9nyzmvabqqu7bJv3x9v",
  zpub:
    "zpub6rtpJPNNq6CeKuycgiXu7RBRDzQcPG9uJWbKQ4NCiuVzP3wW6WspGjCD3h1gUKKwZRgo8Mzm21GEkD2HpUUHkfPrwyfcRaaWA93NSnnKTaP"
} as const;

describe("deriveAddresses", () => {
  it("derives native SegWit zpub receive addresses", () => {
    const result = deriveAddresses({
      extendedPublicKey: testVectors.zpub,
      network: "mainnet",
      chain: "receive",
      limit: 3
    });

    assert.equal(result.scriptType, "native-segwit");
    assert.deepEqual(
      result.addresses.map((address) => address.address),
      [
        "bc1q7z737v8seg9qdghtj9qpf3q8jte82nynyfq6kc",
        "bc1q83mqu4exrw5kjlcu89v6aksk4u9h7hecajwwlj",
        "bc1qpzkfx0yhwqhsukyk8akh7nrmv9d22f05glgh6v"
      ]
    );
  });

  it("derives nested SegWit ypub receive addresses", () => {
    const result = deriveAddresses({
      extendedPublicKey: testVectors.ypub,
      network: "mainnet",
      chain: "receive",
      limit: 1
    });

    assert.equal(result.scriptType, "nested-segwit");
    assert.equal(result.addresses[0]?.address, "3ESJPhmPgV6kpDXG173xsSqgY9hDYYwtZj");
  });

  it("derives legacy xpub receive addresses", () => {
    const result = deriveAddresses({
      extendedPublicKey: testVectors.xpub,
      network: "mainnet",
      chain: "receive",
      limit: 1
    });

    assert.equal(result.scriptType, "legacy");
    assert.equal(result.addresses[0]?.address, "12Etsmqp76ToVNfBZbfwMmhixqc19J7X8g");
  });

  it("derives different receive and change addresses", () => {
    const result = deriveAddresses({
      extendedPublicKey: testVectors.zpub,
      network: "mainnet",
      chain: "both",
      limit: 1
    });

    const receive = result.addresses.find((address) => address.chain === "receive");
    const change = result.addresses.find((address) => address.chain === "change");
    assert.ok(receive);
    assert.ok(change);
    assert.notEqual(receive.address, change.address);
    assert.equal(change.path, "m/84'/0'/0'/1/0");
  });

  it("derives unique index 0, 1, and 2 addresses", () => {
    const result = deriveAddresses({
      extendedPublicKey: testVectors.xpub,
      network: "mainnet",
      chain: "receive",
      limit: 3
    });

    assert.equal(new Set(result.addresses.map((address) => address.address)).size, 3);
  });

  it("returns safe errors for invalid extended public keys", () => {
    assert.throws(
      () =>
        deriveAddresses({
          extendedPublicKey: "zpub-invalid",
          network: "mainnet",
          chain: "receive",
          limit: 1
        }),
      /Invalid extended public key/
    );

    assert.throws(() => detectExtendedPublicKeyKind("not-a-watch-key"), /xpub, ypub, zpub/);
  });

  it("allows xpub material to derive native SegWit when metadata confirms it", () => {
    const result = deriveAddresses({
      extendedPublicKey: testVectors.xpub,
      type: "xpub",
      scriptType: "native-segwit",
      accountPath: "m/84'/0'/0'",
      network: "mainnet",
      chain: "receive",
      limit: 1
    });

    assert.equal(result.scriptType, "native-segwit");
    assert.match(result.addresses[0]?.address ?? "", /^bc1q/);
    assert.equal(result.addresses[0]?.path, "m/84'/0'/0'/0/0");
  });

  // ---------------------------------------------------------------------------
  // Phase 13: taproot / BIP86 address derivation
  // ---------------------------------------------------------------------------

  it("derives taproot BIP86 mainnet receive addresses (bc1p prefix)", () => {
    const result = deriveAddresses({
      extendedPublicKey: testVectors.xpub,
      type: "xpub",
      scriptType: "taproot",
      accountPath: "m/86'/0'/0'",
      network: "mainnet",
      chain: "receive",
      limit: 3
    });

    assert.equal(result.scriptType, "taproot");
    assert.equal(result.addresses.length, 3);
    for (const addr of result.addresses) {
      assert.match(addr.address, /^bc1p/, `expected bc1p prefix, got ${addr.address}`);
    }
    assert.equal(result.addresses[0]?.path, "m/86'/0'/0'/0/0");
  });

  it("derives taproot BIP86 change address", () => {
    const result = deriveAddresses({
      extendedPublicKey: testVectors.xpub,
      type: "xpub",
      scriptType: "taproot",
      accountPath: "m/86'/0'/0'",
      network: "mainnet",
      chain: "change",
      limit: 1
    });

    assert.match(result.addresses[0]?.address ?? "", /^bc1p/);
    assert.equal(result.addresses[0]?.path, "m/86'/0'/0'/1/0");
  });

  it("derives unique taproot addresses across indices 0, 1, 2", () => {
    const result = deriveAddresses({
      extendedPublicKey: testVectors.xpub,
      type: "xpub",
      scriptType: "taproot",
      accountPath: "m/86'/0'/0'",
      network: "mainnet",
      chain: "receive",
      limit: 3
    });

    const addrs = result.addresses.map((a) => a.address);
    assert.equal(new Set(addrs).size, 3, "taproot addresses at indices 0/1/2 must be unique");
  });

  it("derives taproot testnet address with tb1p prefix", () => {
    // Use xpub with explicit network=testnet override; tpub would normally be testnet
    const result = deriveAddresses({
      extendedPublicKey: testVectors.xpub,
      type: "xpub",
      scriptType: "taproot",
      accountPath: "m/86'/1'/0'",
      network: "testnet",
      chain: "receive",
      limit: 1
    });

    assert.equal(result.scriptType, "taproot");
    assert.match(result.addresses[0]?.address ?? "", /^tb1p/, `expected tb1p prefix, got ${result.addresses[0]?.address}`);
  });

  it("taproot receive and change addresses differ", () => {
    const result = deriveAddresses({
      extendedPublicKey: testVectors.xpub,
      type: "xpub",
      scriptType: "taproot",
      accountPath: "m/86'/0'/0'",
      network: "mainnet",
      chain: "both",
      limit: 1
    });

    const receive = result.addresses.find((a) => a.chain === "receive");
    const change = result.addresses.find((a) => a.chain === "change");
    assert.ok(receive && change);
    assert.notEqual(receive.address, change.address);
  });
});
