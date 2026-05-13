import assert from "node:assert/strict";
import test from "node:test";
import { lookupFeeEstimates, parseFeeEstimates } from "./fees.js";

test("parseFeeEstimates reads mempool recommended fee payload", () => {
  const parsed = parseFeeEstimates({
    fastestFee: 12,
    halfHourFee: 8.5,
    hourFee: 4,
    economyFee: 2,
    minimumFee: 1
  });

  assert.deepEqual(parsed, {
    fastestFee: 12,
    halfHourFee: 8.5,
    hourFee: 4,
    economyFee: 2,
    minimumFee: 1
  });
});

test("lookupFeeEstimates returns null when backend is unavailable", async () => {
  const parsed = await lookupFeeEstimates({
    fetchFeesFn: async () => {
      throw new Error("offline");
    }
  });

  assert.equal(parsed, null);
});
