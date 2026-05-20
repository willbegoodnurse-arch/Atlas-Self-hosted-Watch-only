import { describe, expect, it } from "vitest";
import {
  addBbqrFrame,
  assembleBbqrPayload,
  createBbqrCollectorState,
  getCapturedBbqrFrameCount,
  getMissingBbqrFrames,
  inspectBbqrFrame,
  parseBbqrFrame
} from "../bbqr";

describe("wallet import BBQr helpers", () => {
  it("captures incomplete Coldcard Generic JSON BBQr frames with a waiting message", () => {
    const frame = parseBbqrFrame("B$2J0700ABCDEF");
    expect(frame).not.toBeNull();
    const result = addBbqrFrame(createBbqrCollectorState(), frame!);

    expect(result.status).toBe("captured");
    expect(result.message).toMatch(/Coldcard Generic JSON frame 1 captured/i);
    expect(result.message).toMatch(/Waiting for remaining BBQr frames/i);
    expect(getCapturedBbqrFrameCount(result.state)).toBe(1);
    expect(getMissingBbqrFrames(result.state)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(assembleBbqrPayload(result.state)).toBeNull();
  });

  it("parses Coldcard base36 header metadata without exposing body content", () => {
    const metadata = inspectBbqrFrame("B$2J0700ABCDEF");

    expect(parseInt("07", 36)).toBe(7);
    expect(parseInt("00", 36)).toBe(0);
    expect(metadata).toMatchObject({
      prefix: "B$",
      encoding: "2",
      fileType: "J",
      total: 7,
      index: 0,
      displayIndex: 1,
      valid: true
    });
    expect(JSON.stringify(metadata)).not.toContain("ABCDEF");
  });

  it("assembles hex Generic JSON BBQr frames out of order", () => {
    const json = JSON.stringify({
      xfp: "F23A9C1D",
      p2wpkh: "zpub6rtpJPNNq6CeKuycgiXu7RBRDzQcPG9uJWbKQ4NCiuVzP3wW6WspGjCD3h1gUKKwZRgo8Mzm21GEkD2HpUUHkfPrwyfcRaaWA93NSnnKTaP"
    });
    const hex = Array.from(new TextEncoder().encode(json), (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
    const first = hex.slice(0, Math.ceil(hex.length / 2));
    const second = hex.slice(Math.ceil(hex.length / 2));
    let state = createBbqrCollectorState();

    state = addBbqrFrame(state, parseBbqrFrame(`B$HJ0201${second}`)!).state;
    const result = addBbqrFrame(state, parseBbqrFrame(`B$HJ0200${first}`)!);

    expect(result.status).toBe("complete");
    expect(assembleBbqrPayload(result.state)).toBe(json);
  });

  it("assembles base32 Generic JSON BBQr frames out of order and ignores exact duplicates", () => {
    const json = JSON.stringify({
      xfp: "F23A9C1D",
      bip84: {
        deriv: "m/84'/0'/0'",
        _pub: "zpub6rtpJPNNq6CeKuycgiXu7RBRDzQcPG9uJWbKQ4NCiuVzP3wW6WspGjCD3h1gUKKwZRgo8Mzm21GEkD2HpUUHkfPrwyfcRaaWA93NSnnKTaP"
      }
    });
    const encoded = base32NoPadding(new TextEncoder().encode(json));
    const parts = splitIntoParts(encoded, 7);
    let state = createBbqrCollectorState();

    state = addBbqrFrame(state, parseBbqrFrame(`B$2J0706${parts[6]}`)!).state;
    state = addBbqrFrame(state, parseBbqrFrame(`B$2J0700${parts[0]}`)!).state;
    state = addBbqrFrame(state, parseBbqrFrame(`B$2J0700${parts[0]}`)!).state;
    for (const index of [1, 2, 3, 4, 5]) {
      state = addBbqrFrame(state, parseBbqrFrame(`B$2J07${index.toString(36).padStart(2, "0").toUpperCase()}${parts[index]}`)!).state;
    }

    expect(getCapturedBbqrFrameCount(state)).toBe(7);
    expect(assembleBbqrPayload(state)).toBe(json);
  });

  it("keeps existing state for unsupported frames and reports conflicts", () => {
    const first = parseBbqrFrame("B$2J0200ABCDEF")!;
    let state = addBbqrFrame(createBbqrCollectorState(), first).state;

    expect(parseBbqrFrame("not a bbqr")).toBeNull();
    expect(getCapturedBbqrFrameCount(state)).toBe(1);

    const conflict = addBbqrFrame(state, parseBbqrFrame("B$2J0200ZZZZZZ")!);
    expect(conflict.status).toBe("error");
    expect(conflict.errorCode).toBe("frame-conflict");
    expect(getCapturedBbqrFrameCount(conflict.state)).toBe(1);

    const mismatch = addBbqrFrame(state, parseBbqrFrame("B$2U0201ABCDEF")!);
    expect(mismatch.status).toBe("error");
    expect(mismatch.errorCode).toBe("different-set");
  });
});

function base32NoPadding(bytes: Uint8Array): string {
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

function splitIntoParts(value: string, total: number): string[] {
  const size = Math.ceil(value.length / total);
  return Array.from({ length: total }, (_, index) => value.slice(index * size, (index + 1) * size));
}
