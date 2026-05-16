import assert from "node:assert/strict";
import test from "node:test";
import {
  lookupFeeEstimateResult,
  lookupFeeEstimates,
  parseFeeEstimates,
  parseInitDataFeeEstimates,
  parseProjectedMempoolFeeEstimates
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

test("parseFeeEstimates preserves authoritative recommended fee fields", () => {
  const parsed = parseFeeEstimates({
    fastestFee: 73.2,
    halfHourFee: 3,
    hourFee: 2,
    economyFee: 0.9,
    minimumFee: 0.4
  });

  assert.deepEqual(parsed, {
    fastestFee: 73.2,
    halfHourFee: 3,
    hourFee: 2,
    economyFee: 0.9,
    minimumFee: 0.4
  });
});

test("parseFeeEstimates rejects out-of-order recommended fee payloads instead of promoting stale values", () => {
  const parsed = parseFeeEstimates({
    fastestFee: 0.4,
    halfHourFee: 2,
    hourFee: 3,
    economyFee: 0.9,
    minimumFee: 0.4
  });

  assert.equal(parsed, null);
});

test("parseFeeEstimates treats empty near-zero recommendations as unavailable", () => {
  assert.equal(parseFeeEstimates({
    fastestFee: 0,
    halfHourFee: 0,
    hourFee: 0,
    economyFee: 0,
    minimumFee: 0
  }), null);
});

test("parseInitDataFeeEstimates reads the frontend websocket fee buckets", () => {
  const parsed = parseInitDataFeeEstimates({
    "mempool-blocks": [{ blockVSize: 120_000, medianFee: 73.2 }],
    mempoolInfo: { mempoolminfee: 0.000004 },
    fees: {
      fastestFee: 1,
      halfHourFee: 0.65,
      hourFee: 0.4,
      economyFee: 0.4,
      minimumFee: 0.4
    }
  });

  assert.deepEqual(parsed, {
    fastestFee: 1,
    halfHourFee: 0.65,
    hourFee: 0.4,
    economyFee: 0.4,
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
      if (url.endsWith("/v1/fees/precise") || url.endsWith("/fees/precise")) {
        throw new Error("unavailable");
      }
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
    "/api/v1/fees/precise",
    "/api/fees/precise",
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
    { path: "/v1/fees/precise", status: "failed", httpStatus: 503, error: "HTTP 503" },
    { path: "/fees/precise", status: "failed", httpStatus: 503, error: "HTTP 503" },
    { path: "/v1/fees/recommended", status: "failed", httpStatus: 503, error: "HTTP 503" },
    { path: "/fees/recommended", status: "failed", httpStatus: 503, error: "HTTP 503" },
    { path: "/v1/init-data", status: "failed", httpStatus: 503, error: "HTTP 503" },
    { path: "/init-data", status: "failed", httpStatus: 503, error: "HTTP 503" },
    { path: "/v1/fees/mempool-blocks", status: "failed", httpStatus: 503, error: "HTTP 503" },
    { path: "/fees/mempool-blocks", status: "failed", httpStatus: 503, error: "HTTP 503" }
  ]);
});

test("parseProjectedMempoolFeeEstimates reproduces mempool UI priority buckets", () => {
  const parsed = parseProjectedMempoolFeeEstimates([
    { blockVSize: 1_000_000, medianFee: 2.5, feeRange: [0.45, 1, 2, 2.5, 4, 5, 6] },
    { blockVSize: 1_000_000, medianFee: 1, feeRange: [0.9, 1, 1, 1, 1, 1, 1] },
    { blockVSize: 1_000_000, medianFee: 0.7, feeRange: [0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9] }
  ], { mempoolminfee: 0.0000045 });

  assert.deepEqual(parsed, {
    fastestFee: 3,
    halfHourFee: 2,
    hourFee: 1.225,
    economyFee: 0.9,
    minimumFee: 0.45
  });
});

test("parseProjectedMempoolFeeEstimates keeps sub-1 sat/vB values from current mempool data", () => {
  const parsed = parseProjectedMempoolFeeEstimates([
    { blockVSize: 1_000_000, medianFee: 0.8, feeRange: [0.2, 0.3, 0.5, 0.8, 1, 1.2, 1.5] }
  ], { mempoolminfee: 0.000002 });

  assert.deepEqual(parsed, {
    fastestFee: 1.3,
    halfHourFee: 0.5,
    hourFee: 0.2,
    economyFee: 0.2,
    minimumFee: 0.2
  });
});

test("parseProjectedMempoolFeeEstimates adjusts stale high median down when current mempool block is not full", () => {
  const parsed = parseProjectedMempoolFeeEstimates([
    { blockVSize: 120_000, medianFee: 73.2, feeRange: [0.4, 12, 18, 73.2] }
  ], { mempoolminfee: 0.000004 });

  assert.deepEqual(parsed, {
    fastestFee: 1,
    halfHourFee: 0.65,
    hourFee: 0.4,
    economyFee: 0.4,
    minimumFee: 0.4
  });
});

test("parseProjectedMempoolFeeEstimates returns null when no mempool-based fee source is usable", () => {
  assert.equal(parseProjectedMempoolFeeEstimates([], null), null);
  assert.equal(parseProjectedMempoolFeeEstimates([
    { blockVSize: 0, medianFee: 0, feeRange: [0, 0, 0] }
  ], null), null);
});

test("lookupFeeEstimateResult uses precise live local mempool endpoint first", async () => {
  const result = await lookupFeeEstimateResult({
    fetchJson: async (url) => {
      if (url.endsWith("/v1/fees/precise")) {
        return {
          fastestFee: 3,
          halfHourFee: 2,
          hourFee: 1.35,
          economyFee: 0.9,
          minimumFee: 0.45
        };
      }
      throw new Error("unexpected endpoint");
    }
  });

  assert.equal(result.status, "online");
  assert.equal(result.source, "precise");
  assert.equal(result.estimates?.fastestFee, 3);
  assert.equal(result.estimates?.economyFee, 0.9);
});

test("lookupFeeEstimateResult derives from live projected mempool blocks when fee endpoints are unavailable", async () => {
  const requested: string[] = [];
  const result = await lookupFeeEstimateResult({
    fetchJson: async (url) => {
      requested.push(url);
      if (url.endsWith("/v1/fees/mempool-blocks")) {
        return [
          { blockVSize: 1_000_000, medianFee: 2.5, feeRange: [0.45, 1, 2, 2.5, 4, 5, 6] },
          { blockVSize: 1_000_000, medianFee: 1, feeRange: [0.9, 1, 1, 1, 1, 1, 1] },
          { blockVSize: 1_000_000, medianFee: 0.7, feeRange: [0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9] }
        ];
      }
      if (url.endsWith("/mempool")) {
        return { mempoolminfee: 0.0000045 };
      }
      throw new Error("Service Unavailable");
    }
  });

  assert.equal(result.status, "online");
  assert.equal(result.source, "projected-blocks");
  assert.equal(result.estimates?.fastestFee, 3);
  assert.equal(result.estimates?.halfHourFee, 2);
  assert.equal(result.estimates?.economyFee, 0.9);
  assert.deepEqual(requested.map((url) => url.replace(/^.*\/api/, "/api")), [
    "/api/v1/fees/precise",
    "/api/fees/precise",
    "/api/v1/fees/recommended",
    "/api/fees/recommended",
    "/api/v1/init-data",
    "/api/init-data",
    "/api/v1/fees/mempool-blocks",
    "/api/mempool"
  ]);
});

test("lookupFeeEstimateResult uses frontend init-data fees before reconstructing projected blocks", async () => {
  const requested: string[] = [];
  const result = await lookupFeeEstimateResult({
    fetchJson: async (url) => {
      requested.push(url);
      if (
        url.endsWith("/v1/fees/precise") ||
        url.endsWith("/fees/precise") ||
        url.endsWith("/v1/fees/recommended") ||
        url.endsWith("/fees/recommended")
      ) {
        throw new Error("Service Unavailable");
      }
      if (url.endsWith("/v1/init-data")) {
        return {
          fees: {
            fastestFee: 3,
            halfHourFee: 2,
            hourFee: 0.9,
            economyFee: 0.4,
            minimumFee: 0.4
          },
          "mempool-blocks": [{ blockVSize: 120_000, medianFee: 73.2 }]
        };
      }
      throw new Error("unexpected endpoint");
    }
  });

  assert.equal(result.status, "online");
  assert.equal(result.source, "init-data");
  assert.deepEqual(result.estimates, {
    fastestFee: 3,
    halfHourFee: 2,
    hourFee: 0.9,
    economyFee: 0.4,
    minimumFee: 0.4
  });
  assert.deepEqual(requested.map((url) => url.replace(/^.*\/api/, "/api")), [
    "/api/v1/fees/precise",
    "/api/fees/precise",
    "/api/v1/fees/recommended",
    "/api/fees/recommended",
    "/api/v1/init-data"
  ]);
});

test("lookupFeeEstimateResult does not promote stale high medians from sparse projected blocks", async () => {
  const result = await lookupFeeEstimateResult({
    fetchJson: async (url) => {
      if (url.endsWith("/v1/fees/mempool-blocks")) {
        return [{ blockVSize: 120_000, medianFee: 73.2, feeRange: [0.4, 73.2] }];
      }
      if (url.endsWith("/mempool")) {
        return { mempoolminfee: 0.000004 };
      }
      throw new Error("Service Unavailable");
    }
  });

  assert.equal(result.status, "online");
  assert.equal(result.source, "projected-blocks");
  assert.equal(result.estimates?.fastestFee, 1);
  assert.equal(result.estimates?.hourFee, 0.4);
});

test("lookupFeeEstimateResult uses alternate recommended endpoint before falling back to manual fees", async () => {
  const result = await lookupFeeEstimateResult({
    fetchJson: async (url) => {
      if (url.endsWith("/v1/fees/precise") || url.endsWith("/fees/precise")) {
        throw new Error("Service Unavailable");
      }
      if (url.endsWith("/v1/fees/recommended")) {
        return {
          fastestFee: 0,
          halfHourFee: 0,
          hourFee: 0,
          economyFee: 0,
          minimumFee: 0
        };
      }
      if (!url.endsWith("/fees/recommended")) {
        throw new Error("unexpected endpoint");
      }
      return {
        fastestFee: 3,
        halfHourFee: 2,
        hourFee: 1,
        economyFee: 0.5,
        minimumFee: 0.25
      };
    }
  });

  assert.equal(result.status, "online");
  assert.equal(result.source, "recommended");
  assert.equal(result.estimates?.fastestFee, 3);
  assert.equal(result.estimates?.economyFee, 0.5);
});

test("parseFeeEstimates returns null when payload has no usable fees", () => {
  assert.equal(parseFeeEstimates({ fastestFee: 0, hourFee: null }), null);
});
