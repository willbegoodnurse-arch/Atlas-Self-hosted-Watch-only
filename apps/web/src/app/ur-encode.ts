import { UR, URDecoder, UREncoder } from "@ngraveio/bc-ur";
import { Buffer } from "buffer";

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function encodeCborByteString(bytes: Uint8Array): Buffer {
  const length = bytes.length;
  if (length < 24) {
    return Buffer.concat([Buffer.from([0x40 + length]), Buffer.from(bytes)]);
  }
  if (length <= 0xff) {
    return Buffer.concat([Buffer.from([0x58, length]), Buffer.from(bytes)]);
  }
  if (length <= 0xffff) {
    return Buffer.concat([
      Buffer.from([0x59, (length >> 8) & 0xff, length & 0xff]),
      Buffer.from(bytes)
    ]);
  }
  if (length <= 0xffffffff) {
    return Buffer.concat([
      Buffer.from([
        0x5a,
        (length >>> 24) & 0xff,
        (length >>> 16) & 0xff,
        (length >>> 8) & 0xff,
        length & 0xff
      ]),
      Buffer.from(bytes)
    ]);
  }
  throw new Error("PSBT too large for animated UR export.");
}

export function encodeUrPsbt(
  psbtBase64: string,
  options?: { maxFragmentLength?: number }
): string[] {
  const bytes = base64ToBytes(psbtBase64);
  const cbor = encodeCborByteString(bytes);
  const ur = new UR(cbor, "crypto-psbt");
  const encoder = new UREncoder(ur, options?.maxFragmentLength ?? 200);
  return encoder.encodeWhole();
}

export type DecodeUrPsbtPartResult =
  | {
      status: "complete";
      psbtBase64: string;
      message: string;
    }
  | {
      status: "partial";
      psbtBase64: null;
      message: string;
      progress: number;
      receivedIndexes: number[];
      expectedPartCount: number;
    }
  | {
      status: "error";
      psbtBase64: null;
      message: string;
    };

export function createUrPsbtDecoder(): URDecoder {
  return new URDecoder(undefined, "crypto-psbt");
}

export function decodeUrPsbtPart(decoder: URDecoder, part: string): DecodeUrPsbtPartResult {
  try {
    decoder.receivePart(part.trim());
    if (decoder.isError()) {
      return {
        status: "error",
        psbtBase64: null,
        message: decoder.resultError() || "Unable to decode UR crypto-psbt frame."
      };
    }
    if (decoder.isSuccess()) {
      const bytes = decoder.resultUR().decodeCBOR();
      return {
        status: "complete",
        psbtBase64: bytesToBase64(bytes),
        message: "UR crypto-psbt complete. Ready to verify signed PSBT."
      };
    }
    const progress = decoder.getProgress();
    const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));
    return {
      status: "partial",
      psbtBase64: null,
      message: `UR crypto-psbt frame captured (${percent}% complete). Keep scanning frames.`,
      progress,
      receivedIndexes: decoder.receivedPartIndexes(),
      expectedPartCount: decoder.expectedPartCount()
    };
  } catch (error) {
    return {
      status: "error",
      psbtBase64: null,
      message: error instanceof Error ? error.message : "Unable to decode UR crypto-psbt frame."
    };
  }
}
