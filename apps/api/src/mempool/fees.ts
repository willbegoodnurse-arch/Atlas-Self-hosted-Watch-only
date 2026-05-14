import { fetchMempoolJson } from "./request.js";
import { getMempoolRequestConfig } from "./usage.js";

export type FeeEstimatePreset = {
  fastestFee: number | null;
  halfHourFee: number | null;
  hourFee: number | null;
  economyFee: number | null;
  minimumFee: number | null;
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
  return hasAnyFee(estimates) ? estimates : null;
}

export async function lookupFeeEstimates(
  options: {
    fetchFeesFn?: () => Promise<unknown>;
    fetchJson?: (url: string) => Promise<unknown>;
  } = {}
): Promise<FeeEstimatePreset | null> {
  const { url } = getMempoolRequestConfig();
  if (options.fetchFeesFn) {
    try {
      return parseFeeEstimates(await options.fetchFeesFn());
    } catch {
      return null;
    }
  }

  const fetchJson = options.fetchJson ?? fetchMempoolJson;
  const candidates = [
    `${url}/v1/fees/recommended`,
    `${url}/fees/recommended`
  ];

  for (const candidate of candidates) {
    try {
      const estimates = parseFeeEstimates(await fetchJson(candidate));
      if (estimates) {
        return estimates;
      }
    } catch {
      // Try the next known mempool-compatible fee path.
    }
  }

  return null;
}

function readFee(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function hasAnyFee(estimates: FeeEstimatePreset): boolean {
  return Object.values(estimates).some((fee) => fee !== null);
}
