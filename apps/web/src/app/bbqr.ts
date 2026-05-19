export type BbqrFrame = {
  encoding: "H" | "2" | "Z";
  fileType: string;
  total: number;
  index: number;
  data: string;
};

export type BbqrCollectorState = {
  encoding: "H" | "2" | "Z" | null;
  fileType: string | null;
  total: number | null;
  frames: Record<number, string>;
};

export type BbqrCollectorResult = {
  state: BbqrCollectorState;
  status: "captured" | "duplicate" | "complete" | "error";
  message: string;
};

const bbqrPattern = /^B\$([H2Z])([A-Z])([0-9A-Z]{2})([0-9A-Z]{2})([0-9A-Z]*)$/;
const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function createBbqrCollectorState(): BbqrCollectorState {
  return {
    encoding: null,
    fileType: null,
    total: null,
    frames: {}
  };
}

export function parseBbqrFrame(input: string): BbqrFrame | null {
  const match = input.trim().toUpperCase().match(bbqrPattern);
  if (!match) {
    return null;
  }
  const total = parseInt(match[3], 36);
  const index = parseInt(match[4], 36);
  if (!Number.isInteger(total) || !Number.isInteger(index) || total < 1 || index < 0 || index >= total) {
    return null;
  }
  return {
    encoding: match[1] as "H" | "2" | "Z",
    fileType: match[2],
    total,
    index,
    data: match[5]
  };
}

export function addBbqrFrame(state: BbqrCollectorState, frame: BbqrFrame): BbqrCollectorResult {
  if (state.total !== null && state.total !== frame.total) {
    return { state, status: "error", message: "BBQr frame total mismatch. Clear BBQr frames and scan one export again." };
  }
  if (state.encoding !== null && state.encoding !== frame.encoding) {
    return { state, status: "error", message: "BBQr encoding mismatch. Clear BBQr frames and scan one export again." };
  }
  if (state.fileType !== null && state.fileType !== frame.fileType) {
    return { state, status: "error", message: "BBQr file type mismatch. Clear BBQr frames and scan one export again." };
  }
  const existing = state.frames[frame.index];
  if (existing !== undefined && existing !== frame.data) {
    return {
      state,
      status: "error",
      message: `BBQr frame conflict: frame ${frame.index + 1} already has different data. Clear BBQr frames and scan again.`
    };
  }
  const nextState: BbqrCollectorState = {
    encoding: state.encoding ?? frame.encoding,
    fileType: state.fileType ?? frame.fileType,
    total: state.total ?? frame.total,
    frames: {
      ...state.frames,
      [frame.index]: frame.data
    }
  };
  const missing = getMissingBbqrFrames(nextState);
  if (missing.length === 0) {
    return { state: nextState, status: "complete", message: `All ${frame.total} BBQr frames captured. Previewing watch-only wallet import.` };
  }
  const prefix =
    existing === frame.data
      ? `Coldcard Generic JSON frame ${frame.index + 1} already captured.`
      : `Coldcard Generic JSON frame ${frame.index + 1} captured.`;
  return {
    state: nextState,
    status: existing === frame.data ? "duplicate" : "captured",
    message: `${prefix} Waiting for remaining BBQr frames: ${missing.join(", ")}.`
  };
}

export function getMissingBbqrFrames(state: BbqrCollectorState): number[] {
  if (!state.total) {
    return [];
  }
  const missing: number[] = [];
  for (let index = 0; index < state.total; index += 1) {
    if (state.frames[index] === undefined) {
      missing.push(index + 1);
    }
  }
  return missing;
}

export function assembleBbqrPayload(state: BbqrCollectorState): string | null {
  if (!state.total || getMissingBbqrFrames(state).length > 0) {
    return null;
  }
  if (state.fileType !== "J" && state.fileType !== "U") {
    throw new Error("Unsupported BBQr format. Atlas only imports Coldcard Generic JSON/Text watch-only exports.");
  }
  const encoded = Array.from({ length: state.total }, (_, index) => state.frames[index] ?? "").join("");
  const bytes =
    state.encoding === "H"
      ? decodeHex(encoded)
      : state.encoding === "2"
        ? decodeBase32(encoded)
        : null;
  if (!bytes) {
    throw new Error("Unsupported BBQr format. Zlib-compressed BBQr is not supported for wallet import yet.");
  }
  const decoded = new TextDecoder().decode(bytes).trim();
  if (!decoded.startsWith("{")) {
    throw new Error("Unsupported BBQr format. Decoded payload was not Coldcard Generic JSON.");
  }
  return decoded;
}

function decodeHex(value: string): Uint8Array {
  if (!/^[0-9A-F]*$/.test(value) || value.length % 2 !== 0) {
    throw new Error("Invalid BBQr hex payload.");
  }
  const bytes = new Uint8Array(value.length / 2);
  for (let i = 0; i < value.length; i += 2) {
    bytes[i / 2] = parseInt(value.slice(i, i + 2), 16);
  }
  return bytes;
}

function decodeBase32(value: string): Uint8Array {
  const clean = value.replace(/=+$/g, "").toUpperCase();
  if (!/^[A-Z2-7]*$/.test(clean)) {
    throw new Error("Invalid BBQr base32 payload.");
  }
  let bits = 0;
  let bitCount = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    bits = (bits << 5) | base32Alphabet.indexOf(char);
    bitCount += 5;
    while (bitCount >= 8) {
      bytes.push((bits >> (bitCount - 8)) & 0xff);
      bitCount -= 8;
    }
  }
  return new Uint8Array(bytes);
}
