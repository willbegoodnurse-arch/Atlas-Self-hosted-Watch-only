import assert from "node:assert/strict";
import test from "node:test";
import {
  lookupFeeEstimateResult,
  lookupFeeEstimates,
  parseFeeEstimates,
  parseMempoolBlockFeeEstimates
} from "./fees.js";

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

test("parseFeeEstimates corrects out-of-order recommended fee payloads", () => {
  const parsed = parseFeeEstimates({
    fastestFee: 0.4,
    halfHourFee: 2,
    hourFee: 3,
    economyFee: 0.9,
    minimumFee: 0.4
  });

  assert.deepEqual(parsed, {
    fastestFee: 3,
    halfHourFee: 2,
    hourFee: 2,
    economyFee: 0.9,
    minimumFee: 0.4
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

test("lookupFeeEstimateResult reports sanitized 503 diagnostics", async () => {
  const result = await lookupFeeEstimateResult({
    fetchJson: async () => {
      const { MempoolHttpError } = await import("./request.js");
      throw new MempoolHttpError(503);
    }
  });

  assert.equal(result.status, "unavailable");
  assert.equal(result.estimates, null);
  assert.deepEqual(result.attempts.map((attempt) => ({
    path: attempt.path,
    status: attempt.status,
    httpStatus: attempt.httpStatus,
    error: attempt.error
  })), [
    { path: "/v1/fees/recommended", status: "failed", httpStatus: 503, error: "HTTP 503" },
    { path: "/fees/recommended", status: "failed", httpStatus: 503, error: "HTTP 503" },
    { path: "/v1/fees/mempool-blocks", status: "failed", httpStatus: 503, error: "HTTP 503" }
  ]);
});

test("parseMempoolBlockFeeEstimates derives conservative presets from block medians", () => {
  const parsed = parseMempoolBlockFeeEstimates([
    { medianFee: 9.2 },
    { medianFee: 6 },
    { medianFee: 3 },
    { medianFee: 1.5 }
  ]);

  assert.deepEqual(parsed, {
    fastestFee: 9.2,
    halfHourFee: 6,
    hourFee: 3,
    economyFee: 1.5,
    minimumFee: 1.5
  });
});

test("parseMempoolBlockFeeEstimates maps feeRange to high medium and slow priorities", () => {
  const parsed = parseMempoolBlockFeeEstimates([
    { feeRange: [0.3872355683040517, 0.9, 2, 3], medianFee: 0.3872355683040517 },
    { feeRange: [0.3, 0.7, 1.2], medianFee: 0.3 }
  ]);

  assert.deepEqual(parsed, {
    fastestFee: 3,
    halfHourFee: 2,
    hourFee: 2,
    economyFee: 0.9,
    minimumFee: 0.3872355683040517
  });
});

test("parseMempoolBlockFeeEstimates sorts block medians before assigning presets", () => {
  const parsed = parseMempoolBlockFeeEstimates([
    { medianFee: 0.3872355683040517 },
    { medianFee: 0.9 },
    { medianFee: 2 },
    { medianFee: 3 }
  ]);

  assert.deepEqual(parsed, {
    fastestFee: 3,
    halfHourFee: 2,
    hourFee: 0.9,
    economyFee: 0.3872355683040517,
    minimumFee: 0.3872355683040517
  });
});

test("lookupFeeEstimateResult falls back to local mempool block medians", async () => {
  const requested: string[] = [];
  const result = await lookupFeeEstimateResult({
    fetchJson: async (url) => {
      requested.push(url);
      if (!url.endsWith("/v1/fees/mempool-blocks")) {
        throw new Error("Service Unavailable");
      }
      return [{ medianFee: 11 }, { medianFee: 7 }, { medianFee: 4 }];
    }
  });

  assert.equal(result.status, "online");
  assert.equal(result.source, "mempool-blocks");
  assert.equal(result.estimates?.fastestFee, 11);
  assert.deepEqual(requested.map((url) => url.replace(/^.*\/api/, "/api")), [
    "/api/v1/fees/recommended",
    "/api/fees/recommended",
    "/api/v1/fees/mempool-blocks"
  ]);
});

test("parseFeeEstimates returns null when payload has no usable fees", () => {
  assert.equal(parseFeeEstimates({ fastestFee: 0, hourFee: null }), null);
});
