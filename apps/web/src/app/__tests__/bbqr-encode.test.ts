import { describe, it, expect } from "vitest";
import { encodeBbqrPsbt } from "../bbqr-encode";
import { parseBbqrFrame, decodeBase32 } from "../bbqr";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

const SMALL_PSBT_BASE64 = btoa("small-psbt-payload");
const MEDIUM_PSBT_BASE64 = btoa("x".repeat(500));
const LARGE_PSBT_BASE64 = btoa("y".repeat(2000));

describe("encodeBbqrPsbt", () => {
  it("produces frames that parseBbqrFrame can parse with correct headers", () => {
    const frames = encodeBbqrPsbt(MEDIUM_PSBT_BASE64);
    expect(frames.length).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < frames.length; i++) {
      const parsed = parseBbqrFrame(frames[i]);
      expect(parsed).not.toBeNull();
      expect(parsed!.encoding).toBe("2");
      expect(parsed!.fileType).toBe("P");
      expect(parsed!.total).toBe(frames.length);
      expect(parsed!.index).toBe(i);
    }
  });

  it("round-trips through existing decodeBase32: reassembled bytes match original", () => {
    const inputs = [SMALL_PSBT_BASE64, MEDIUM_PSBT_BASE64, LARGE_PSBT_BASE64];

    for (const original of inputs) {
      const frames = encodeBbqrPsbt(original);
      const parsed = frames.map((f) => parseBbqrFrame(f));
      expect(parsed.every((p) => p !== null)).toBe(true);

      const combinedData = parsed
        .sort((a, b) => a!.index - b!.index)
        .map((p) => p!.data)
        .join("");

      const decodedBytes = decodeBase32(combinedData);
      const recoveredBase64 = bytesToBase64(decodedBytes);
      expect(recoveredBase64).toBe(original);
    }
  });

  it("produces exactly 1 frame for a small PSBT", () => {
    const frames = encodeBbqrPsbt(SMALL_PSBT_BASE64);
    expect(frames.length).toBe(1);

    const parsed = parseBbqrFrame(frames[0]);
    expect(parsed).not.toBeNull();
    expect(parsed!.total).toBe(1);
    expect(parsed!.index).toBe(0);
  });

  it("produces more frames when maxFrameDataChars is smaller", () => {
    const defaultFrames = encodeBbqrPsbt(LARGE_PSBT_BASE64);
    const smallChunkFrames = encodeBbqrPsbt(LARGE_PSBT_BASE64, { maxFrameDataChars: 100 });

    expect(smallChunkFrames.length).toBeGreaterThan(defaultFrames.length);

    for (let i = 0; i < smallChunkFrames.length; i++) {
      const parsed = parseBbqrFrame(smallChunkFrames[i]);
      expect(parsed).not.toBeNull();
      expect(parsed!.total).toBe(smallChunkFrames.length);
      expect(parsed!.index).toBe(i);
    }
  });

  it("covers all indices 0..N-1 with no gaps", () => {
    const frames = encodeBbqrPsbt(LARGE_PSBT_BASE64, { maxFrameDataChars: 200 });
    const indices = frames.map((f) => parseBbqrFrame(f)!.index).sort((a, b) => a - b);
    const expected = Array.from({ length: frames.length }, (_, i) => i);
    expect(indices).toEqual(expected);
  });

  it("throws if PSBT would exceed 1295 frames", () => {
    const hugePsbt = btoa("z".repeat(10000));
    expect(() => encodeBbqrPsbt(hugePsbt, { maxFrameDataChars: 1 })).toThrow(
      /too large for BBQr/
    );
  });
});
