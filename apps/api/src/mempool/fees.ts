import { MempoolHttpError, errorMessage, fetchMempoolJson } from "./request.js";
import { getMempoolRequestConfig } from "./usage.js";

export type FeeEstimatePreset = {
  fastestFee: number | null;
  halfHourFee: number | null;
  hourFee: number | null;
  economyFee: number | null;
  minimumFee: number | null;
};

export type FeeEstimateSource = "recommended" | "precise" | "projected-blocks";

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

export function parseProjectedMempoolFeeEstimates(
  blocksRaw: unknown,
  mempoolInfoRaw: unknown = null
): FeeEstimatePreset | null {
  if (!Array.isArray(blocksRaw)) {
    return null;
  }

  const blocks = blocksRaw
    .map(parseProjectedMempoolBlock)
    .filter((block): block is ProjectedMempoolBlock => block !== null);
  const minimumFee = readMempoolMinimumFee(mempoolInfoRaw) ?? readMinimumFeeFromBlocks(blocks);
  if (minimumFee === null) {
    return null;
  }
  if (blocks.length === 0) {
    return fillPreset(minimumFee);
  }

  const firstMedianFee = optimizeProjectedBlockMedianFee(blocks[0], blocks[1], null, minimumFee);
  const secondMedianFee = blocks[1]
    ? optimizeProjectedBlockMedianFee(blocks[1], blocks[2], firstMedianFee, minimumFee)
    : minimumFee;
  const thirdMedianFee = blocks[2]
    ? optimizeProjectedBlockMedianFee(blocks[2], blocks[3], secondMedianFee, minimumFee)
    : minimumFee;

  let fastestFee = Math.max(minimumFee, firstMedianFee);
  let halfHourFee = Math.max(minimumFee, secondMedianFee);
  let hourFee = Math.max(minimumFee, thirdMedianFee);
  const economyFee = Math.max(minimumFee, Math.min(2 * minimumFee, thirdMedianFee));

  fastestFee = Math.max(fastestFee, halfHourFee, hourFee, economyFee);
  halfHourFee = Math.max(halfHourFee, hourFee, economyFee);
  hourFee = Math.max(hourFee, economyFee);

  return {
    fastestFee: roundFee(fastestFee),
    halfHourFee: roundFee(halfHourFee),
    hourFee: roundFee(hourFee),
    economyFee: roundFee(economyFee),
    minimumFee: roundFee(minimumFee)
  };
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
    { path: "/v1/fees/precise", parser: parseFeeEstimates, source: "precise" as const },
    { path: "/fees/precise", parser: parseFeeEstimates, source: "precise" as const },
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

  const projected = await lookupProjectedBlockFeeEstimate(fetchJson, url, attempts);
  if (projected) {
    return onlineResult(projected, "projected-blocks", checkedAt, attempts);
  }

  return unavailableResult(checkedAt, attempts);
}

type ProjectedMempoolBlock = {
  blockVSize: number;
  medianFee: number;
  feeRange: number[];
};

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

function parseProjectedMempoolBlock(block: unknown): ProjectedMempoolBlock | null {
  if (typeof block !== "object" || block === null) {
    return null;
  }
  const value = block as Record<string, unknown>;
  const blockVSize = readNonNegativeNumber(value.blockVSize);
  const medianFee = readNonNegativeNumber(value.medianFee);
  if (blockVSize === null || medianFee === null) {
    return null;
  }
  return {
    blockVSize,
    medianFee,
    feeRange: readFeeRange(block)
  };
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

function readNonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function readMempoolMinimumFee(raw: unknown): number | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const value = raw as Record<string, unknown>;
  const minimumBtcPerKvbyte = readNonNegativeNumber(value.mempoolminfee);
  if (minimumBtcPerKvbyte === null || minimumBtcPerKvbyte <= 0) {
    return null;
  }
  return roundFee(minimumBtcPerKvbyte * 100_000);
}

function readMinimumFeeFromBlocks(blocks: ProjectedMempoolBlock[]): number | null {
  const fees = blocks
    .flatMap((block) => block.feeRange)
    .filter((fee) => fee > 0)
    .sort((a, b) => a - b);
  return fees[0] ?? null;
}

function fillPreset(fee: number): FeeEstimatePreset {
  return {
    fastestFee: fee,
    halfHourFee: fee,
    hourFee: fee,
    economyFee: fee,
    minimumFee: fee
  };
}

function optimizeProjectedBlockMedianFee(
  block: ProjectedMempoolBlock | undefined,
  nextBlock: ProjectedMempoolBlock | undefined,
  previousFee: number | null,
  minimumFee: number
): number {
  if (!block || block.blockVSize <= 0) {
    return minimumFee;
  }
  const useFee = previousFee !== null ? (block.medianFee + previousFee) / 2 : block.medianFee;
  if (block.blockVSize <= 500_000 || block.medianFee < minimumFee) {
    return minimumFee;
  }
  if (block.blockVSize <= 950_000 && !nextBlock) {
    const multiplier = (block.blockVSize - 500_000) / 500_000;
    return Math.max(roundFee(useFee * multiplier), minimumFee);
  }
  return Math.max(roundFee(useFee), minimumFee);
}

function roundFee(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
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
    message: source === "projected-blocks"
      ? "Local mempool estimate derived from current projected mempool blocks."
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

async function lookupProjectedBlockFeeEstimate(
  fetchJson: (url: string) => Promise<unknown>,
  baseUrl: string,
  attempts: FeeEstimateLookupAttempt[]
): Promise<FeeEstimatePreset | null> {
  for (const blockPath of ["/v1/fees/mempool-blocks", "/fees/mempool-blocks"]) {
    try {
      const blocks = await fetchJson(`${baseUrl}${blockPath}`);
      attempts.push({ path: blockPath, status: "ok", httpStatus: null, error: null });
      const mempoolInfo = await lookupMempoolInfo(fetchJson, baseUrl, attempts);
      const estimates = parseProjectedMempoolFeeEstimates(blocks, mempoolInfo);
      if (estimates) {
        return estimates;
      }
      attempts.push({ path: `${blockPath} + mempool`, status: "failed", httpStatus: null, error: "no usable projected fee estimates" });
    } catch (error) {
      attempts.push(failedAttempt(blockPath, error));
    }
  }
  return null;
}

async function lookupMempoolInfo(
  fetchJson: (url: string) => Promise<unknown>,
  baseUrl: string,
  attempts: FeeEstimateLookupAttempt[]
): Promise<unknown> {
  for (const mempoolPath of ["/mempool", "/v1/mempool"]) {
    try {
      const mempoolInfo = await fetchJson(`${baseUrl}${mempoolPath}`);
      attempts.push({ path: mempoolPath, status: "ok", httpStatus: null, error: null });
      return mempoolInfo;
    } catch (error) {
      attempts.push(failedAttempt(mempoolPath, error));
    }
  }
  return null;
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
