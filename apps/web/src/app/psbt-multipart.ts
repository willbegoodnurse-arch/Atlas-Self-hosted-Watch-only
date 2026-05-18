export type MultipartPsbtFrame = {
  index: number;
  total: number;
  fragment: string;
};

export type MultipartPsbtState = {
  totalFrames: number | null;
  frames: Record<number, string>;
};

export type AddMultipartPsbtFrameResult = {
  state: MultipartPsbtState;
  status: "captured" | "duplicate" | "complete" | "error";
  message: string;
};

const multipartFramePattern = /^p\s*(\d{1,3})\s*of\s*(\d{1,3})[\s:;-]+([A-Za-z0-9+/=_-][A-Za-z0-9+/=_\s-]*)$/i;

export function createMultipartPsbtState(): MultipartPsbtState {
  return {
    totalFrames: null,
    frames: {}
  };
}

export function parseMultipartPsbtFrame(input: string): MultipartPsbtFrame | null {
  const match = input.trim().match(multipartFramePattern);
  if (!match) {
    return null;
  }

  const index = Number(match[1]);
  const total = Number(match[2]);
  const fragment = match[3].replace(/\s+/g, "");
  if (!Number.isInteger(index) || !Number.isInteger(total) || index < 1 || total < 1 || index > total) {
    return null;
  }
  if (total > 100 || fragment.length === 0) {
    return null;
  }

  return { index, total, fragment };
}

export function getMissingMultipartFrames(state: MultipartPsbtState): number[] {
  if (!state.totalFrames) {
    return [];
  }

  const missing: number[] = [];
  for (let index = 1; index <= state.totalFrames; index += 1) {
    if (!state.frames[index]) {
      missing.push(index);
    }
  }
  return missing;
}

export function assembleMultipartPsbt(state: MultipartPsbtState): string | null {
  const missing = getMissingMultipartFrames(state);
  if (!state.totalFrames || missing.length > 0) {
    return null;
  }

  const fragments: string[] = [];
  for (let index = 1; index <= state.totalFrames; index += 1) {
    fragments.push(state.frames[index]);
  }
  return fragments.join("");
}

export function addMultipartPsbtFrame(
  current: MultipartPsbtState,
  frame: MultipartPsbtFrame
): AddMultipartPsbtFrameResult {
  if (current.totalFrames !== null && current.totalFrames !== frame.total) {
    return {
      state: current,
      status: "error",
      message: "Multipart signed PSBT frame total mismatch. Clear multipart frames and scan one PSBT again."
    };
  }

  const existing = current.frames[frame.index];
  if (existing !== undefined && existing !== frame.fragment) {
    return {
      state: current,
      status: "error",
      message: `Multipart signed PSBT frame conflict: frame ${frame.index} already has different data. Clear multipart frames and scan again.`
    };
  }

  const nextState: MultipartPsbtState = {
    totalFrames: current.totalFrames ?? frame.total,
    frames: {
      ...current.frames,
      [frame.index]: frame.fragment
    }
  };
  const missing = getMissingMultipartFrames(nextState);
  if (missing.length === 0) {
    return {
      state: nextState,
      status: "complete",
      message: `All ${frame.total} frames captured. Ready to verify signed PSBT.`
    };
  }

  const waiting = formatFrameList(missing);
  const prefix =
    existing === frame.fragment
      ? `Multipart signed PSBT frame ${frame.index} of ${frame.total} already captured.`
      : `Multipart signed PSBT frame ${frame.index} of ${frame.total} captured.`;
  return {
    state: nextState,
    status: existing === frame.fragment ? "duplicate" : "captured",
    message: `${prefix} Waiting for ${waiting}.`
  };
}

export function formatFrameList(frames: number[]): string {
  if (frames.length === 0) {
    return "no frames";
  }
  if (frames.length === 1) {
    return `frame ${frames[0]}`;
  }
  const allButLast = frames.slice(0, -1).map((frame) => `frame ${frame}`);
  return `${allButLast.join(", ")} and frame ${frames[frames.length - 1]}`;
}

export function signedPsbtMultipartFrameMessage(input: string): string | null {
  const frame = parseMultipartPsbtFrame(input);
  if (!frame) {
    return null;
  }
  return `This looks like multipart signed PSBT QR frame ${frame.index} of ${frame.total}. Atlas currently requires a complete signed PSBT base64, a signed PSBT file, or a single-frame signed PSBT QR.`;
}
