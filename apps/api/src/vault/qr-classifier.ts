export type QrPayloadFormat =
  | "bare-extended-public-key"
  | "descriptor"
  | "origin-extended-public-key"
  | "coldcard-json"
  | "crypto-account-ur"
  | "crypto-hdkey-ur"
  | "ur-xpub"
  | "ur-animated"
  | "bbqr"
  | "psbt-ur"
  | "unknown";

export type QrPayloadClassification = {
  format: QrPayloadFormat;
  animated: boolean;
  watchOnlyCandidate: boolean;
  frameIndex: number | null;
  totalFrames: number | null;
  warning: string | null;
};

const xpubPattern = /\b(xpub|ypub|zpub|tpub|upub|vpub)[1-9A-HJ-NP-Za-km-z]{40,}\b/;

export function classifyQrPayload(frame: string): QrPayloadClassification {
  const trimmed = frame.trim();
  if (!trimmed) {
    return notWatchOnly("unknown", null);
  }

  // BBQr: Coldcard multipart format
  if (trimmed.startsWith("B$")) {
    return {
      format: "bbqr",
      animated: true,
      watchOnlyCandidate: false,
      frameIndex: null,
      totalFrames: null,
      warning:
        "BBQr multipart QR detected. Export a descriptor or Generic JSON from Coldcard and import via Paste or File."
    };
  }

  // Raw PSBT base64 magic bytes (70 73 62 74 ff = cHNidP8B in base64)
  if (trimmed.startsWith("cHNidP8B")) {
    return {
      format: "psbt-ur",
      animated: false,
      watchOnlyCandidate: false,
      frameIndex: null,
      totalFrames: null,
      warning:
        "PSBT signing request detected. PSBT is not a watch-only wallet export. Use xpub or descriptor export instead."
    };
  }

  const lower = trimmed.toLowerCase();

  if (lower.startsWith("ur:")) {
    // PSBT UR
    if (lower.startsWith("ur:crypto-psbt")) {
      return {
        format: "psbt-ur",
        animated: isAnimatedUr(trimmed),
        watchOnlyCandidate: false,
        frameIndex: urFrameIndex(trimmed),
        totalFrames: urTotalFrames(trimmed),
        warning:
          "PSBT signing request detected. PSBT is not a watch-only wallet export."
      };
    }

    const animated = isAnimatedUr(trimmed);
    const frameIndex = urFrameIndex(trimmed);
    const totalFrames = urTotalFrames(trimmed);

    // Animated UR (any type, multi-part)
    if (animated) {
      return {
        format: "ur-animated",
        animated: true,
        watchOnlyCandidate: true,
        frameIndex,
        totalFrames,
        warning: null
      };
    }

    if (lower.startsWith("ur:crypto-account")) {
      return {
        format: "crypto-account-ur",
        animated: false,
        watchOnlyCandidate: true,
        frameIndex: null,
        totalFrames: null,
        warning:
          "crypto-account UR detected. Full BCUR decoding is not available yet. Use descriptor or xpub export if possible."
      };
    }

    if (lower.startsWith("ur:crypto-hdkey")) {
      return {
        format: "crypto-hdkey-ur",
        animated: false,
        watchOnlyCandidate: true,
        frameIndex: null,
        totalFrames: null,
        warning:
          "crypto-hdkey UR detected. Full decoding is not available yet. Use xpub or descriptor export if possible."
      };
    }

    return {
      format: "ur-xpub",
      animated: false,
      watchOnlyCandidate: true,
      frameIndex: null,
      totalFrames: null,
      warning: "UR payload detected. Full decoding is not available yet."
    };
  }

  // Descriptor (strip checksum)
  if (findDescriptorCandidate(trimmed)) {
    return {
      format: "descriptor",
      animated: false,
      watchOnlyCandidate: true,
      frameIndex: null,
      totalFrames: null,
      warning: null
    };
  }

  // Key expression [fingerprint/path]xpub
  if (/\[[0-9a-fA-F]{8}(?:\/[^\]]+)?\](xpub|ypub|zpub|tpub|upub|vpub)/.test(trimmed)) {
    return {
      format: "origin-extended-public-key",
      animated: false,
      watchOnlyCandidate: true,
      frameIndex: null,
      totalFrames: null,
      warning: null
    };
  }

  // JSON (Coldcard-like)
  if (trimmed.startsWith("{")) {
    const hasXpub = xpubPattern.test(trimmed);
    return {
      format: "coldcard-json",
      animated: false,
      watchOnlyCandidate: hasXpub,
      frameIndex: null,
      totalFrames: null,
      warning: hasXpub ? null : "JSON detected but no supported extended public key found."
    };
  }

  // Plain xpub/ypub/zpub/tpub/upub/vpub
  if (xpubPattern.test(trimmed)) {
    return {
      format: "bare-extended-public-key",
      animated: false,
      watchOnlyCandidate: true,
      frameIndex: null,
      totalFrames: null,
      warning: null
    };
  }

  return notWatchOnly("unknown", null);
}

function isAnimatedUr(value: string): boolean {
  return /^ur:[^/]+\/\d+of\d+\//i.test(value) || /^ur:[^/]+\/\d+-\d+\//i.test(value);
}

function urFrameIndex(value: string): number | null {
  const m =
    value.match(/^ur:[^/]+\/(\d+)of\d+\//i) ??
    value.match(/^ur:[^/]+\/(\d+)-\d+\//i);
  return m?.[1] !== undefined ? parseInt(m[1], 10) : null;
}

function urTotalFrames(value: string): number | null {
  const m =
    value.match(/^ur:[^/]+\/\d+of(\d+)\//i) ??
    value.match(/^ur:[^/]+\/\d+-(\d+)\//i);
  return m?.[1] !== undefined ? parseInt(m[1], 10) : null;
}

function findDescriptorCandidate(value: string): string | null {
  const descriptorPrefixes = ["sh(wpkh(", "wpkh(", "pkh(", "tr("];
  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const start = descriptorPrefixes
      .map((prefix) => line.indexOf(prefix))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b)[0];
    if (start === undefined) {
      continue;
    }
    const candidate = line.slice(start).trim().split(/\s+/)[0] ?? "";
    if (descriptorPrefixes.some((prefix) => candidate.startsWith(prefix))) {
      return candidate;
    }
  }
  return null;
}

function notWatchOnly(format: QrPayloadFormat, warning: string | null): QrPayloadClassification {
  return {
    format,
    animated: false,
    watchOnlyCandidate: false,
    frameIndex: null,
    totalFrames: null,
    warning
  };
}
