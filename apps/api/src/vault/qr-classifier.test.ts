import assert from "node:assert/strict";
import test from "node:test";
import { classifyQrPayload } from "./qr-classifier.js";

const xpub =
  "xpub6BvTm7YLvSRVjijq48yLuTA3eThj9nqZjsCyd48QXLW1cgmkThmXaWRiRJv7j59nxRSkPD2ux97rSFAFPFppMEUAsE7Zoqt8oBYguJz2Mtb";
const zpub =
  "zpub6rtpJPNNq6CeKuycgiXu7RBRDzQcPG9uJWbKQ4NCiuVzP3wW6WspGjCD3h1gUKKwZRgo8Mzm21GEkD2HpUUHkfPrwyfcRaaWA93NSnnKTaP";

test("classifies plain zpub as plain-xpub watch-only candidate", () => {
  const result = classifyQrPayload(zpub);
  assert.equal(result.format, "plain-xpub");
  assert.equal(result.animated, false);
  assert.equal(result.watchOnlyCandidate, true);
  assert.equal(result.warning, null);
});

test("classifies plain xpub as plain-xpub watch-only candidate", () => {
  const result = classifyQrPayload(xpub);
  assert.equal(result.format, "plain-xpub");
  assert.equal(result.watchOnlyCandidate, true);
  assert.equal(result.animated, false);
});

test("classifies wpkh() descriptor as descriptor", () => {
  const result = classifyQrPayload(`wpkh([abcd1234/84'/0'/0']${xpub}/0/*)`);
  assert.equal(result.format, "descriptor");
  assert.equal(result.watchOnlyCandidate, true);
  assert.equal(result.animated, false);
  assert.equal(result.warning, null);
});

test("classifies tr() descriptor as descriptor", () => {
  const result = classifyQrPayload(`tr([abcd1234/86'/0'/0']${xpub}/0/*)`);
  assert.equal(result.format, "descriptor");
  assert.equal(result.watchOnlyCandidate, true);
});

test("classifies sh(wpkh()) descriptor as descriptor", () => {
  const result = classifyQrPayload(`sh(wpkh([abcd1234/49'/0'/0']${xpub}/0/*))`);
  assert.equal(result.format, "descriptor");
  assert.equal(result.watchOnlyCandidate, true);
});

test("classifies key expression as key-expression", () => {
  const result = classifyQrPayload(`[abcd1234/84'/0'/0']${xpub}`);
  assert.equal(result.format, "key-expression");
  assert.equal(result.watchOnlyCandidate, true);
  assert.equal(result.animated, false);
});

test("classifies Coldcard JSON with xpub as coldcard-json", () => {
  const json = JSON.stringify({
    xfp: "AB12CD34",
    bip84: { deriv: "m/84'/0'/0'", xpub: zpub }
  });
  const result = classifyQrPayload(json);
  assert.equal(result.format, "coldcard-json");
  assert.equal(result.watchOnlyCandidate, true);
  assert.equal(result.warning, null);
});

test("classifies JSON without xpub as coldcard-json not watch-only", () => {
  const result = classifyQrPayload('{"xfp":"AABBCCDD"}');
  assert.equal(result.format, "coldcard-json");
  assert.equal(result.watchOnlyCandidate, false);
  assert.ok(result.warning);
});

test("classifies ur:crypto-account as crypto-account-ur", () => {
  const result = classifyQrPayload("ur:crypto-account/otadlewtaadaxaxaycynlyf");
  assert.equal(result.format, "crypto-account-ur");
  assert.equal(result.watchOnlyCandidate, true);
  assert.equal(result.animated, false);
  assert.ok(result.warning);
});

test("classifies ur:crypto-hdkey as crypto-hdkey-ur", () => {
  const result = classifyQrPayload("ur:crypto-hdkey/oxaxhdclaxzmfegdlp");
  assert.equal(result.format, "crypto-hdkey-ur");
  assert.equal(result.watchOnlyCandidate, true);
  assert.equal(result.animated, false);
  assert.ok(result.warning);
});

test("classifies ur:crypto-psbt as psbt-ur, not watch-only", () => {
  const result = classifyQrPayload("ur:crypto-psbt/lpaoaxlfaohhaadaao");
  assert.equal(result.format, "psbt-ur");
  assert.equal(result.watchOnlyCandidate, false);
  assert.ok(result.warning);
});

test("classifies raw base64 PSBT magic as psbt-ur", () => {
  const result = classifyQrPayload("cHNidP8BAAoBAAAAAA==");
  assert.equal(result.format, "psbt-ur");
  assert.equal(result.watchOnlyCandidate, false);
  assert.ok(result.warning);
});

test("classifies B$ BBQr prefix as bbqr animated", () => {
  const result = classifyQrPayload("B$ZZ0110AABBCCDD");
  assert.equal(result.format, "bbqr");
  assert.equal(result.animated, true);
  assert.equal(result.watchOnlyCandidate, false);
  assert.ok(result.warning);
});

test("classifies animated UR NofM frame as ur-animated with frame metadata", () => {
  const result = classifyQrPayload("ur:crypto-account/1of3/otadlewtaad");
  assert.equal(result.format, "ur-animated");
  assert.equal(result.animated, true);
  assert.equal(result.watchOnlyCandidate, true);
  assert.equal(result.frameIndex, 1);
  assert.equal(result.totalFrames, 3);
  assert.equal(result.warning, null);
});

test("classifies animated UR second frame correctly", () => {
  const result = classifyQrPayload("ur:crypto-account/2of3/somedata");
  assert.equal(result.format, "ur-animated");
  assert.equal(result.frameIndex, 2);
  assert.equal(result.totalFrames, 3);
});

test("classifyQrPayload is deterministic for same input", () => {
  const frame = `wpkh([abcd1234/84'/0'/0']${xpub}/0/*)`;
  assert.deepEqual(classifyQrPayload(frame), classifyQrPayload(frame));
});

test("unknown garbage returns unknown not watch-only", () => {
  const result = classifyQrPayload("some-random-garbage-payload-xyz");
  assert.equal(result.format, "unknown");
  assert.equal(result.watchOnlyCandidate, false);
});

test("empty string returns unknown not watch-only", () => {
  const result = classifyQrPayload("");
  assert.equal(result.format, "unknown");
  assert.equal(result.watchOnlyCandidate, false);
});
