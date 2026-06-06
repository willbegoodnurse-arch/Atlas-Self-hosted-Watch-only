import { UR, UREncoder } from "@ngraveio/bc-ur";
import { Buffer } from "buffer";

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
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
