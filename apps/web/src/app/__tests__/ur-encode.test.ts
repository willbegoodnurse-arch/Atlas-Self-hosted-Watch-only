import { URDecoder } from "@ngraveio/bc-ur";
import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";
import { createUrPsbtDecoder, decodeUrPsbtPart, encodeUrPsbt } from "../ur-encode";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

const SMALL_PSBT_BASE64 = bytesToBase64(
  new Uint8Array([0x70, 0x73, 0x62, 0x74, 0xff, 0x01, 0x00])
);
const LARGE_PSBT_BASE64 = bytesToBase64(
  new Uint8Array(Array.from({ length: 1600 }, (_, index) => index % 251))
);

function decodeUrFrames(frames: string[]): Buffer {
  const decoder = new URDecoder(undefined, "crypto-psbt");
  for (const frame of frames) {
    decoder.receivePart(frame);
  }
  expect(decoder.isSuccess()).toBe(true);
  return Buffer.from(decoder.resultUR().decodeCBOR());
}

describe("encodeUrPsbt", () => {
  it("produces crypto-psbt UR frames", () => {
    const frames = encodeUrPsbt(SMALL_PSBT_BASE64);

    expect(frames.length).toBe(1);
    expect(frames[0].startsWith("ur:crypto-psbt/")).toBe(true);
  });

  it("round-trips through the bc-ur decoder", () => {
    const inputs = [SMALL_PSBT_BASE64, LARGE_PSBT_BASE64];

    for (const original of inputs) {
      const frames = encodeUrPsbt(original, { maxFragmentLength: 120 });
      expect(decodeUrFrames(frames).toString("base64")).toBe(original);
    }
  });

  it("uses animated sequence components when fragmented", () => {
    const frames = encodeUrPsbt(LARGE_PSBT_BASE64, { maxFragmentLength: 80 });

    expect(frames.length).toBeGreaterThan(1);
    expect(frames[0]).toMatch(/^ur:crypto-psbt\/1-[0-9]+\//);
  });

  it("round-trips fragmented UR frames when received out of order", () => {
    const frames = encodeUrPsbt(LARGE_PSBT_BASE64, { maxFragmentLength: 120 });
    const shuffledFrames = [
      ...frames.filter((_, index) => index % 2 === 1),
      ...frames.filter((_, index) => index % 2 === 0)
    ];

    expect(frames.length).toBeGreaterThan(1);
    expect(decodeUrFrames(shuffledFrames).toString("base64")).toBe(LARGE_PSBT_BASE64);
  });

  it("preserves PSBT magic bytes after bc-ur decoding", () => {
    const frames = encodeUrPsbt(SMALL_PSBT_BASE64);
    const decoded = decodeUrFrames(frames);

    expect(Array.from(decoded.slice(0, 5))).toEqual([0x70, 0x73, 0x62, 0x74, 0xff]);
  });

  it("keeps default animated UR frame payloads within a QR-friendly size", () => {
    const frames = encodeUrPsbt(LARGE_PSBT_BASE64);

    expect(Math.max(...frames.map((frame) => frame.length))).toBeLessThanOrEqual(500);
  });

  it("decodes a single UR crypto-psbt frame to base64", () => {
    const decoder = createUrPsbtDecoder();
    const frames = encodeUrPsbt(SMALL_PSBT_BASE64);
    const result = decodeUrPsbtPart(decoder, frames[0]);

    expect(result.status).toBe("complete");
    expect(result.psbtBase64).toBe(SMALL_PSBT_BASE64);
  });

  it("collects fragmented UR crypto-psbt frames out of order", () => {
    const decoder = createUrPsbtDecoder();
    const frames = encodeUrPsbt(LARGE_PSBT_BASE64, { maxFragmentLength: 120 });
    const shuffledFrames = [
      ...frames.filter((_, index) => index % 2 === 1),
      ...frames.filter((_, index) => index % 2 === 0)
    ];
    let latest = decodeUrPsbtPart(decoder, shuffledFrames[0]);

    expect(latest.status).toBe("partial");

    for (const frame of shuffledFrames.slice(1)) {
      latest = decodeUrPsbtPart(decoder, frame);
    }

    expect(latest.status).toBe("complete");
    expect(latest.psbtBase64).toBe(LARGE_PSBT_BASE64);
  });
});
