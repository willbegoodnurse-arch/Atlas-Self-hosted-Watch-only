import { describe, expect, it } from "vitest";
import {
  addMultipartPsbtFrame,
  assembleMultipartPsbt,
  createMultipartPsbtState,
  getMissingMultipartFrames,
  parseMultipartPsbtFrame,
  signedPsbtMultipartFrameMessage
} from "../psbt-multipart";

describe("signed PSBT multipart QR helpers", () => {
  it("parses pNofM frames without matching normal PSBT base64", () => {
    expect(parseMultipartPsbtFrame("p1of3 abcDEF012+/=")).toEqual({
      index: 1,
      total: 3,
      fragment: "abcDEF012+/="
    });
    expect(parseMultipartPsbtFrame(" P 2 OF 3   def ghi ")).toEqual({
      index: 2,
      total: 3,
      fragment: "defghi"
    });
    expect(parseMultipartPsbtFrame("cHNidP8BAHECAAAAAQ")).toBeNull();
    expect(parseMultipartPsbtFrame("p1of3")).toBeNull();
  });

  it("assembles frames in index order even when entered out of order", () => {
    let state = createMultipartPsbtState();
    state = addMultipartPsbtFrame(state, parseMultipartPsbtFrame("p3of3 bt")!).state;
    expect(getMissingMultipartFrames(state)).toEqual([1, 2]);
    state = addMultipartPsbtFrame(state, parseMultipartPsbtFrame("p1of3 signed-")!).state;
    state = addMultipartPsbtFrame(state, parseMultipartPsbtFrame("p2of3 ps")!).state;

    expect(getMissingMultipartFrames(state)).toEqual([]);
    expect(assembleMultipartPsbt(state)).toBe("signed-psbt");
  });

  it("treats duplicate identical frames as safe duplicates", () => {
    let state = createMultipartPsbtState();
    const first = addMultipartPsbtFrame(state, parseMultipartPsbtFrame("p1of2 abc")!);
    state = first.state;
    const duplicate = addMultipartPsbtFrame(state, parseMultipartPsbtFrame("p1of2 abc")!);

    expect(duplicate.status).toBe("duplicate");
    expect(duplicate.message).toMatch(/already captured/i);
    expect(assembleMultipartPsbt(duplicate.state)).toBeNull();
  });

  it("rejects same-index conflicts and total-count mismatches without changing state", () => {
    let state = createMultipartPsbtState();
    state = addMultipartPsbtFrame(state, parseMultipartPsbtFrame("p1of2 abc")!).state;

    const conflict = addMultipartPsbtFrame(state, parseMultipartPsbtFrame("p1of2 xyz")!);
    expect(conflict.status).toBe("error");
    expect(conflict.message).toMatch(/different data/i);
    expect(conflict.state).toEqual(state);

    const mismatch = addMultipartPsbtFrame(state, parseMultipartPsbtFrame("p2of3 def")!);
    expect(mismatch.status).toBe("error");
    expect(mismatch.message).toMatch(/total mismatch/i);
    expect(mismatch.state).toEqual(state);
  });

  it("keeps the Phase 57 unsupported message available for guidance paths", () => {
    expect(signedPsbtMultipartFrameMessage("p3of3 ghi")).toMatch(/frame 3 of 3/i);
  });
});
