const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeBase32(bytes: Uint8Array): string {
  let bits = 0;
  let bitCount = 0;
  let result = "";
  for (const byte of bytes) {
    bits = (bits << 8) | byte;
    bitCount += 8;
    while (bitCount >= 5) {
      result += BASE32_ALPHABET[(bits >> (bitCount - 5)) & 0x1f];
      bitCount -= 5;
    }
  }
  if (bitCount > 0) {
    result += BASE32_ALPHABET[(bits << (5 - bitCount)) & 0x1f];
  }
  return result;
}

export function encodeBbqrPsbt(
  psbtBase64: string,
  options?: { maxFrameDataChars?: number }
): string[] {
  const maxChars = options?.maxFrameDataChars ?? 1000;
  const bytes = base64ToBytes(psbtBase64);
  const encoded = encodeBase32(bytes);

  const total = Math.ceil(encoded.length / maxChars) || 1;
  if (total > 1295) {
    throw new Error(
      `PSBT too large for BBQr: requires ${total} frames but maximum is 1295.`
    );
  }

  const frames: string[] = [];
  for (let i = 0; i < total; i++) {
    const chunk = encoded.slice(i * maxChars, (i + 1) * maxChars);
    const totalStr = total.toString(36).toUpperCase().padStart(2, "0");
    const indexStr = i.toString(36).toUpperCase().padStart(2, "0");
    frames.push("B$" + "2" + "P" + totalStr + indexStr + chunk);
  }
  return frames;
}
