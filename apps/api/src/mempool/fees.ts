import { MempoolHttpError, errorMessage, fetchMempoolJson } from "./request.js";
import { getMempoolRequestConfig } from "./usage.js";

export type FeeEstimatePreset = {
  fastestFee: number | null;
  halfHourFee: number | null;
  hourFee: number | null;
  economyFee: number | null;
  minimumFee: number | null;
};

export type FeeEstimateSource = "recommended" | "mempool-blocks";

export type FeeEstimateLookupAttempt = {
  path: string;
  status: "ok" | "failed";
  httpStatus: number | null;
  error: string | null;
};

export type FeeEstimateLookupResult = {
  status: "online" | "unavailable";
  estimates: FeeEstimatePreset | null;
  source: FeeEstimateSource | null;
  checkedAt: string;
  attempts: FeeEstimateLookupAttempt[];
  message: string | null;
};

export function parseFeeEstimates(raw: unknown): FeeEstimatePreset | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const value = raw as Record<string, unknown>;
  const estimates = {
    fastestFee: readFee(value.fastestFee),
    halfHourFee: readFee(value.halfHourFee),
    hourFee: readFee(value.hourFee),
    economyFee: readFee(value.economyFee),
    minimumFee: readFee(value.minimumFee)
  };
  return hasAnyFee(estimates) && isRecommendedFeePresetConsistent(estimates) ? estimates : null;
}

export function parseMempoolBlockFeeEstimates(raw: unknown): FeeEstimatePreset | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const firstFeeRange = raw
    .map(readFeeRange)
    .find((range) => range.length > 0);

  if (firstFeeRange) {
    return derivePresetsFromFeeRange(firstFeeRange);
  }

  const medians = raw
    .map((block) => {
      if (typeof block !== "object" || block === null) {
        return null;
      }
      return readFee((block as Record<string, unknown>).medianFee);
    })
    .filter((fee): fee is number => fee !== null);

  if (medians.length === 0) {
    return null;
  }

  const sortedDesc = [...medians].sort((a, b) => b - a);
  const slowest = sortedDesc[sortedDesc.length - 1] ?? null;
  const estimate = {
    fastestFee: sortedDesc[0] ?? null,
    halfHourFee: sortedDesc[1] ?? sortedDesc[0] ?? null,
    hourFee: sortedDesc[2] ?? sortedDesc[1] ?? sortedDesc[0] ?? null,
    economyFee: slowest,
    minimumFee: slowest
  };
  return hasAnyFee(estimate) ? estimate : null;
}

export async function lookupFeeEstimates(
  options: {
    fetchFeesFn?: () => Promise<unknown>;
    fetchJson?: (url: string) => Promise<unknown>;
  } = {}
): Promise<FeeEstimatePreset | null> {
  const result = await lookupFeeEstimateResult(options);
  return result.estimates;
}

export async function lookupFeeEstimateResult(
  options: {
    fetchFeesFn?: () => Promise<unknown>;
    fetchJson?: (url: string) => Promise<unknown>;
  } = {}
): Promise<FeeEstimateLookupResult> {
  const { url } = getMempoolRequestConfig();
  const checkedAt = new Date().toISOString();
  if (options.fetchFeesFn) {
    try {
      const estimates = parseFeeEstimates(await options.fetchFeesFn());
      return estimates
        ? onlineResult(estimates, "recommended", checkedAt, [{ path: "custom", status: "ok", httpStatus: null, error: null }])
        : unavailableResult(checkedAt, [{ path: "custom", status: "failed", httpStatus: null, error: "no usable fee estimates" }]);
    } catch (error) {
      return unavailableResult(checkedAt, [failedAttempt("custom", error)]);
    }
  }

  const fetchJson = options.fetchJson ?? fetchMempoolJson;
  const candidates = [
    { path: "/v1/fees/recommended", parser: parseFeeEstimates, source: "recommended" as const },
    { path: "/fees/recommended", parser: parseFeeEstimates, source: "recommended" as const }
  ];
  const attempts: FeeEstimateLookupAttempt[] = [];

  for (const candidate of candidates) {
    try {
      const estimates = candidate.parser(await fetchJson(`${url}${candidate.path}`));
      if (estimates) {
        attempts.push({ path: candidate.path, status: "ok", httpStatus: null, error: null });
        return onlineResult(estimates, candidate.source, checkedAt, attempts);
      }
      attempts.push({ path: candidate.path, status: "failed", httpStatus: null, error: "no usable fee estimates" });
    } catch (error) {
      attempts.push(failedAttempt(candidate.path, error));
      // Try the next known mempool-compatible fee path.
    }
  }

  return unavailableResult(checkedAt, attempts);
}

function readFee(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function readFeeRange(block: unknown): number[] {
  if (typeof block !== "object" || block === null) {
    return [];
  }
  const feeRange = (block as Record<string, unknown>).feeRange;
  if (!Array.isArray(feeRange)) {
    return [];
  }
  return feeRange
    .map(readFee)
    .filter((fee): fee is number => fee !== null)
    .sort((a, b) => a - b);
}

function derivePresetsFromFeeRange(feeRange: number[]): FeeEstimatePreset | null {
  const unique = [...new Set(feeRange)].sort((a, b) => a - b);
  if (unique.length === 0) {
    return null;
  }

  const estimates = {
    fastestFee: unique[unique.length - 1] ?? null,
    halfHourFee: quantileFee(unique, 0.66),
    hourFee: quantileFee(unique, 0.5),
    economyFee: quantileFee(unique, 0.25),
    minimumFee: unique[0] ?? null
  };
  return hasAnyFee(estimates) ? estimates : null;
}

function quantileFee(sortedAsc: number[], quantile: number): number | null {
  if (sortedAsc.length === 0) {
    return null;
  }
  const index = Math.min(sortedAsc.length - 1, Math.max(0, Math.round((sortedAsc.length - 1) * quantile)));
  return sortedAsc[index] ?? null;
}

function isRecommendedFeePresetConsistent(estimates: FeeEstimatePreset): boolean {
  let previous: number | null = null;
  for (const fee of [
    estimates.fastestFee,
    estimates.halfHourFee,
    estimates.hourFee,
    estimates.economyFee,
    estimates.minimumFee
  ]) {
    if (fee === null) {
      continue;
    }
    if (previous !== null && fee > previous) {
      return false;
    }
    previous = fee;
  }
  return true;
}

function hasAnyFee(estimates: FeeEstimatePreset): boolean {
  return Object.values(estimates).some((fee) => fee !== null);
}

function onlineResult(
  estimates: FeeEstimatePreset,
  source: FeeEstimateSource,
  checkedAt: string,
  attempts: FeeEstimateLookupAttempt[]
): FeeEstimateLookupResult {
  return {
    status: "online",
    estimates,
    source,
    checkedAt,
    attempts,
    message: source === "mempool-blocks"
      ? "Historical block-derived fee estimates are not current mempool recommendations. Review values manually before use."
      : null
  };
}

function unavailableResult(checkedAt: string, attempts: FeeEstimateLookupAttempt[]): FeeEstimateLookupResult {
  return {
    status: "unavailable",
    estimates: null,
    source: null,
    checkedAt,
    attempts,
    message: "Local mempool fee estimates are unavailable. Manual fee entry remains available."
  };
}

function failedAttempt(path: string, error: unknown): FeeEstimateLookupAttempt {
  return {
    path,
    status: "failed",
    httpStatus: error instanceof MempoolHttpError ? error.status : null,
    error: sanitizeFeeError(error)
  };
}

function sanitizeFeeError(error: unknown): string {
  if (error instanceof MempoolHttpError) {
    return `HTTP ${error.status}`;
  }
  const message = errorMessage(error);
  if (/timeout|abort/i.test(message)) {
    return "request timed out";
  }
  if (/fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|network/i.test(message)) {
    return "network error";
  }
  return "fee endpoint unavailable";
}
