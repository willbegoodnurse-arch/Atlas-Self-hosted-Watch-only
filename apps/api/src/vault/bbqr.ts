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
  errorCode?: string;
};

export type BbqrSafeMetadata = {
  prefix: string;
  rawLength: number;
  encoding: string | null;
  fileType: string | null;
  total: number | null;
  index: number | null;
  displayIndex: number | null;
  valid: boolean;
  errorCode: string | null;
};

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
  const trimmed = input.trim();
  const metadata = inspectBbqrFrame(trimmed);
  if (!metadata.valid || metadata.encoding === null || metadata.fileType === null || metadata.total === null || metadata.index === null) {
    return null;
  }

  if (metadata.encoding !== "H" && metadata.encoding !== "2" && metadata.encoding !== "Z") {
    return null;
  }

  return {
    encoding: metadata.encoding,
    fileType: metadata.fileType,
    total: metadata.total,
    index: metadata.index,
    data: trimmed.slice(8).toUpperCase()
  };
}

export function inspectBbqrFrame(input: string): BbqrSafeMetadata {
  const trimmed = input.trim();
  const prefix = trimmed.slice(0, 2);
  if (!trimmed.startsWith("B$")) {
    return safeMetadata(prefix, trimmed.length, null, null, null, null, "not-bbqr");
  }
  if (trimmed.length < 8) {
    return safeMetadata(prefix, trimmed.length, null, null, null, null, "short-header");
  }

  const encoding = trimmed[2]?.toUpperCase() ?? null;
  const fileType = trimmed[3]?.toUpperCase() ?? null;
  const totalText = trimmed.slice(4, 6).toUpperCase();
  const indexText = trimmed.slice(6, 8).toUpperCase();
  if (!/^[0-9A-Z]{2}$/.test(totalText) || !/^[0-9A-Z]{2}$/.test(indexText)) {
    return safeMetadata(prefix, trimmed.length, encoding, fileType, null, null, "invalid-header-number");
  }

  const total = parseInt(totalText, 36);
  const index = parseInt(indexText, 36);
  if (!Number.isInteger(total) || total < 1) {
    return safeMetadata(prefix, trimmed.length, encoding, fileType, total, index, "invalid-total");
  }
  if (!Number.isInteger(index) || index < 0 || index >= total) {
    return safeMetadata(prefix, trimmed.length, encoding, fileType, total, index, "invalid-index");
  }
  if (encoding !== "H" && encoding !== "2" && encoding !== "Z") {
    return safeMetadata(prefix, trimmed.length, encoding, fileType, total, index, "unsupported-encoding");
  }
  if (!fileType || !/^[A-Z]$/.test(fileType)) {
    return safeMetadata(prefix, trimmed.length, encoding, fileType, total, index, "unsupported-file-type");
  }

  return safeMetadata(prefix, trimmed.length, encoding, fileType, total, index, null);
}

export function addBbqrFrame(state: BbqrCollectorState, frame: BbqrFrame): BbqrCollectorResult {
  if (state.total !== null && state.total !== frame.total) {
    return {
      state,
      status: "error",
      message: "Different BBQr set detected. Clear BBQr frames and scan one export again.",
      errorCode: "different-set"
    };
  }
  if (state.encoding !== null && state.encoding !== frame.encoding) {
    return {
      state,
      status: "error",
      message: "Different BBQr set detected. Clear BBQr frames and scan one export again.",
      errorCode: "different-set"
    };
  }
  if (state.fileType !== null && state.fileType !== frame.fileType) {
    return {
      state,
      status: "error",
      message: "Different BBQr set detected. Clear BBQr frames and scan one export again.",
      errorCode: "different-set"
    };
  }

  const existing = state.frames[frame.index];
  if (existing !== undefined && existing !== frame.data) {
    return {
      state,
      status: "error",
      message: `BBQr frame conflict: frame ${frame.index + 1} already has different data. Clear BBQr frames and scan again.`,
      errorCode: "frame-conflict"
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
    return {
      state: nextState,
      status: "complete",
      message: `All ${frame.total} BBQr frames captured. Previewing watch-only wallet import.`
    };
  }

  const prefix =
    existing === frame.data
      ? `Coldcard Generic JSON frame ${frame.index + 1} already captured.`
      : `Coldcard Generic JSON frame ${frame.index + 1} captured.`;
  return {
    state: nextState,
    status: existing === frame.data ? "duplicate" : "captured",
    message: `${prefix} Waiting for remaining BBQr frames: ${formatMissingFrames(missing)}.`
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
    throw new Error("Compressed BBQr is not yet supported.");
  }

  const decoded = new TextDecoder().decode(bytes).trim();
  if (!decoded.startsWith("{") || !decoded.endsWith("}")) {
    throw new Error("Unsupported BBQr format. Decoded payload was not Coldcard Generic JSON.");
  }
  return decoded;
}

export function getCapturedBbqrFrameCount(state: BbqrCollectorState): number {
  return Object.keys(state.frames).length;
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

function formatMissingFrames(frames: number[]): string {
  if (frames.length === 1) {
    return `${frames[0]}`;
  }
  return frames.join(", ");
}

function safeMetadata(
  prefix: string,
  rawLength: number,
  encoding: string | null,
  fileType: string | null,
  total: number | null,
  index: number | null,
  errorCode: string | null
): BbqrSafeMetadata {
  return {
    prefix,
    rawLength,
    encoding,
    fileType,
    total,
    index,
    displayIndex: index === null ? null : index + 1,
    valid: errorCode === null,
    errorCode
  };
}
