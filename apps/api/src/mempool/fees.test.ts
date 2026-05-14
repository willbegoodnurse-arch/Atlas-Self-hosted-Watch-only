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

test("lookupFeeEstimates falls back to alternate mempool fee path", async () => {
  const requested: string[] = [];
  const parsed = await lookupFeeEstimates({
    fetchJson: async (url) => {
      requested.push(url);
      if (url.endsWith("/v1/fees/recommended")) {
        throw new Error("unavailable");
      }
      return {
        fastestFee: 10,
        halfHourFee: 7,
        hourFee: 3,
        economyFee: 2,
        minimumFee: 1
      };
    }
  });

  assert.deepEqual(requested.map((url) => url.replace(/^.*\/api/, "/api")), [
    "/api/v1/fees/recommended",
    "/api/fees/recommended"
  ]);
  assert.equal(parsed?.fastestFee, 10);
});

test("parseFeeEstimates returns null when payload has no usable fees", () => {
  assert.equal(parseFeeEstimates({ fastestFee: 0, hourFee: null }), null);
});
