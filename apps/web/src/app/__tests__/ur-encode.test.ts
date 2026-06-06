import { URDecoder } from "@ngraveio/bc-ur";
import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";
import { encodeUrPsbt } from "../ur-encode";

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
      const decoder = new URDecoder(undefined, "crypto-psbt");

      for (const frame of frames) {
        decoder.receivePart(frame);
      }

      expect(decoder.isSuccess()).toBe(true);
      const decodedBytes = decoder.resultUR().decodeCBOR();
      expect(Buffer.from(decodedBytes).toString("base64")).toBe(original);
    }
  });

  it("uses animated sequence components when fragmented", () => {
    const frames = encodeUrPsbt(LARGE_PSBT_BASE64, { maxFragmentLength: 80 });

    expect(frames.length).toBeGreaterThan(1);
    expect(frames[0]).toMatch(/^ur:crypto-psbt\/1-[0-9]+\//);
  });
});
