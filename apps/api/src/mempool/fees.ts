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
  return {
    fastestFee: readFee(value.fastestFee),
    halfHourFee: readFee(value.halfHourFee),
    hourFee: readFee(value.hourFee),
    economyFee: readFee(value.economyFee),
    minimumFee: readFee(value.minimumFee)
  };
}

export async function lookupFeeEstimates(
  options: { fetchFeesFn?: () => Promise<unknown> } = {}
): Promise<FeeEstimatePreset | null> {
  const { url } = getMempoolRequestConfig();
  const fetchFeesFn =
    options.fetchFeesFn ??
    (() => fetchMempoolJson(`${url}/v1/fees/recommended`));

  try {
    return parseFeeEstimates(await fetchFeesFn());
  } catch {
    return null;
  }
}

function readFee(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}
