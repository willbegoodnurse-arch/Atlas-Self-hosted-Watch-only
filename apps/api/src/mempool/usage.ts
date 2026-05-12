import type { DerivedAddress } from "@watch-wallet/bitcoin";
import {
  MEMPOOL_LOOKUP_CONCURRENCY,
  errorMessage,
  fetchMempoolJson,
  fetchMempoolText,
  mapWithConcurrency,
  withMempoolRetry
} from "./request.js";

export type AddressUsage = "used" | "unused" | "unknown";

export type AddressUsageRecord = Omit<DerivedAddress, "usage"> & {
  usage: AddressUsage;
  txCount: number | null;
  confirmedTxCount: number | null;
  mempoolTxCount: number | null;
  lookupError: string | null;
};

export type AddressUsageLookup = {
  usage: AddressUsage;
  txCount: number | null;
  confirmedTxCount: number | null;
  mempoolTxCount: number | null;
  lookupError: string | null;
};

export type AddressStatsLookup = AddressUsageLookup & {
  confirmedBalance: number | null;
  unconfirmedBalance: number | null;
  totalBalance: number | null;
};

export type AddressBalanceRecord = AddressUsageRecord & {
  confirmedBalance: number | null;
  unconfirmedBalance: number | null;
  totalBalance: number | null;
};

export type BalanceSummary = {
  confirmedBalance: number;
  unconfirmedBalance: number;
  totalBalance: number;
};

export type NextUnusedReceiveResult = {
  nextUnusedReceiveAddress: AddressUsageRecord | null;
  checkedCount: number;
  gapLimit: number;
  maxDiscoveryLimit: number;
  discoveryComplete: boolean;
  lookupFailed: boolean;
};

type FetchAddressStats = (address: string) => Promise<unknown>;

export type FailedAddressLookup = {
  address: string;
  chain: "receive" | "change";
  index: number;
  error: string;
};

type CacheEntry = {
  expiresAt: number;
  value: AddressStatsLookup;
};

const usageCache = new Map<string, CacheEntry>();
const cacheTtlMs = 45_000;

type MempoolRequestConfig = {
  mode: string;
  url: string;
  cacheTtlSeconds: number;
};

export type MempoolHealth = {
  status: "online" | "degraded" | "offline";
  mode: string;
  url: string;
  baseUrl: string;
  tipHeight: number | null;
  latencyMs: number;
  checkedAt: string;
  errors: string[];
  checks: {
    tipHeight: {
      status: "ok" | "failed";
      error: string | null;
    };
  };
  cacheTtlSeconds: number;
};

export function getMempoolRequestConfig(): MempoolRequestConfig {
  return {
    mode: process.env.API_MODE ?? "mempool",
    url: sanitizeBaseUrl(process.env.MEMPOOL_API_URL ?? "http://localhost:8080/api"),
    cacheTtlSeconds: Math.round(cacheTtlMs / 1000)
  };
}

export function getMempoolApiConfig() {
  const config = getMempoolRequestConfig();
  const baseUrl = maskSensitiveUrl(config.url);
  return {
    ...config,
    url: baseUrl,
    baseUrl
  };
}

export async function checkMempoolHealth(options: {
  fetchTipHeight?: () => Promise<string>;
} = {}): Promise<MempoolHealth> {
  const requestConfig = getMempoolRequestConfig();
  const apiConfig = getMempoolApiConfig();
  const startedAt = Date.now();

  try {
    const tipText = options.fetchTipHeight
      ? await withMempoolRetry(options.fetchTipHeight)
      : await fetchMempoolText(`${requestConfig.url}/blocks/tip/height`);
    const height = Number(tipText);
    const tipHeight = Number.isInteger(height) && height > 0 ? height : null;
    const latencyMs = Date.now() - startedAt;

    if (tipHeight === null) {
      return buildMempoolHealth({
        ...apiConfig,
        status: "degraded",
        tipHeight,
        latencyMs,
        checkedAt: new Date().toISOString(),
        error: "invalid tip height payload"
      });
    }

    return {
      ...apiConfig,
      status: "online",
      tipHeight,
      latencyMs,
      checkedAt: new Date().toISOString(),
      errors: [],
      checks: {
        tipHeight: {
          status: "ok",
          error: null
        }
      }
    };
  } catch (error) {
    return buildMempoolHealth({
      ...apiConfig,
      status: "offline",
      tipHeight: null,
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
      error: errorMessage(error)
    });
  }
}

export async function lookupAddressUsageRecords(
  addresses: DerivedAddress[],
  options: {
    fetchAddressStats?: FetchAddressStats;
    concurrency?: number;
  } = {}
): Promise<{ addresses: AddressUsageRecord[]; lookupFailed: boolean; failedAddresses: FailedAddressLookup[] }> {
  let lookupFailed = false;
  const failedAddresses: FailedAddressLookup[] = [];
  const records = await mapWithConcurrency(
    addresses,
    options.concurrency ?? MEMPOOL_LOOKUP_CONCURRENCY,
    async (address) => {
      const usage = await lookupAddressUsage(address.address, {
        fetchAddressStats: options.fetchAddressStats
      });
      if (usage.usage === "unknown") {
        lookupFailed = true;
        failedAddresses.push({
          address: address.address,
          chain: address.chain,
          index: address.index,
          error: usage.lookupError ?? "address lookup failed"
        });
      }
      return withUsage(address, usage);
    }
  );
  return { addresses: records, lookupFailed, failedAddresses };
}

export async function lookupAddressBalanceRecords(
  addresses: DerivedAddress[],
  options: {
    fetchAddressStats?: FetchAddressStats;
    concurrency?: number;
  } = {}
): Promise<{
  addresses: AddressBalanceRecord[];
  lookupFailed: boolean;
  failedAddresses: FailedAddressLookup[];
  balance: BalanceSummary;
}> {
  let lookupFailed = false;
  const failedAddresses: FailedAddressLookup[] = [];
  const records = await mapWithConcurrency(
    addresses,
    options.concurrency ?? MEMPOOL_LOOKUP_CONCURRENCY,
    async (address) => {
      const stats = await lookupAddressStats(address.address, {
        fetchAddressStats: options.fetchAddressStats
      });
      if (stats.usage === "unknown" || stats.totalBalance === null) {
        lookupFailed = true;
        failedAddresses.push({
          address: address.address,
          chain: address.chain,
          index: address.index,
          error: stats.lookupError ?? "balance lookup failed"
        });
      }
      return withBalance(address, stats);
    }
  );

  return {
    addresses: records,
    lookupFailed,
    failedAddresses,
    balance: aggregateBalance(records)
  };
}

export async function discoverNextUnusedReceiveAddress(
  receiveAddresses: DerivedAddress[],
  gapLimit: number,
  maxDiscoveryLimit: number,
  options: {
    fetchAddressStats?: FetchAddressStats;
  } = {}
): Promise<NextUnusedReceiveResult> {
  const limitedAddresses = receiveAddresses.slice(0, maxDiscoveryLimit);
  const checked: AddressUsageRecord[] = [];
  let lastUsedIndex = -1;
  let consecutiveUnused = 0;
  let lookupFailed = false;
  let consecutiveUnknown = 0;

  for (const address of limitedAddresses) {
    const usage = await lookupAddressUsage(address.address, {
      fetchAddressStats: options.fetchAddressStats
    });
    const record = withUsage(address, usage);
    checked.push(record);

    if (record.usage === "used") {
      lastUsedIndex = record.index;
      consecutiveUnused = 0;
      consecutiveUnknown = 0;
    } else if (record.usage === "unused") {
      consecutiveUnused += 1;
      consecutiveUnknown = 0;
    } else {
      lookupFailed = true;
      consecutiveUnused = 0;
      consecutiveUnknown += 1;
    }

    if (consecutiveUnused >= gapLimit || consecutiveUnknown >= Math.min(3, gapLimit)) {
      break;
    }
  }

  const nextIndex = lastUsedIndex + 1;
  const nextUnusedReceiveAddress =
    checked.find((address) => address.index === nextIndex && address.usage === "unused") ?? null;

  return {
    nextUnusedReceiveAddress,
    checkedCount: checked.length,
    gapLimit,
    maxDiscoveryLimit,
    discoveryComplete: consecutiveUnused >= gapLimit,
    lookupFailed
  };
}

export function classifyMempoolAddressStats(value: unknown): AddressStatsLookup {
  if (!isRecord(value)) {
    return unknownStats();
  }

  const chainStats = value.chain_stats;
  const mempoolStats = value.mempool_stats;
  if (!isRecord(chainStats) || !isRecord(mempoolStats)) {
    return unknownStats();
  }

  const confirmedTxCount = readNonNegativeInteger(chainStats.tx_count);
  const mempoolTxCount = readNonNegativeInteger(mempoolStats.tx_count);
  const confirmedBalance = calculateBalance(chainStats);
  const unconfirmedBalance = calculateBalance(mempoolStats);
  if (
    confirmedTxCount === null ||
    mempoolTxCount === null ||
    confirmedBalance === null ||
    unconfirmedBalance === null
  ) {
    return unknownStats();
  }

  const txCount = confirmedTxCount + mempoolTxCount;
  return {
    usage: txCount > 0 ? "used" : "unused",
    txCount,
    confirmedTxCount,
    mempoolTxCount,
    confirmedBalance,
    unconfirmedBalance,
    totalBalance: confirmedBalance + unconfirmedBalance,
    lookupError: null
  };
}

export function aggregateBalance(addresses: Array<{
  confirmedBalance: number | null;
  unconfirmedBalance: number | null;
}>): BalanceSummary {
  const confirmedBalance = addresses.reduce(
    (sum, address) => sum + (address.confirmedBalance ?? 0),
    0
  );
  const unconfirmedBalance = addresses.reduce(
    (sum, address) => sum + (address.unconfirmedBalance ?? 0),
    0
  );

  return {
    confirmedBalance,
    unconfirmedBalance,
    totalBalance: confirmedBalance + unconfirmedBalance
  };
}

export function selectNextUnusedReceiveAddress(
  addresses: AddressUsageRecord[]
): AddressUsageRecord | null {
  const receiveAddresses = addresses.filter((address) => address.chain === "receive");
  const lastUsed = receiveAddresses
    .filter((address) => address.usage === "used")
    .reduce((highest, address) => Math.max(highest, address.index), -1);

  return (
    receiveAddresses.find(
      (address) => address.index === lastUsed + 1 && address.usage === "unused"
    ) ?? null
  );
}

export function shouldStopGapDiscovery(
  addresses: AddressUsageRecord[],
  gapLimit: number
): boolean {
  if (gapLimit < 1) {
    return true;
  }

  let consecutiveUnused = 0;
  for (const address of addresses) {
    if (address.usage === "unused") {
      consecutiveUnused += 1;
      if (consecutiveUnused >= gapLimit) {
        return true;
      }
    } else {
      consecutiveUnused = 0;
    }
  }
  return false;
}

export async function lookupAddressUsage(
  address: string,
  options: {
    fetchAddressStats?: FetchAddressStats;
  } = {}
): Promise<AddressUsageLookup> {
  return lookupAddressStats(address, options);
}

export async function lookupAddressStats(
  address: string,
  options: {
    fetchAddressStats?: FetchAddressStats;
  } = {}
): Promise<AddressStatsLookup> {
  let safeRequestUrl: string | null = null;
  try {
    if (options.fetchAddressStats) {
      try {
        const payload = await withMempoolRetry(() => options.fetchAddressStats!(address));
        return classifyMempoolAddressStats(payload);
      } catch (error) {
        return unknownStats(errorMessage(error));
      }
    }

    const config = getMempoolRequestConfig();
    const requestUrl = `${config.url}/address/${encodeURIComponent(address)}`;
    safeRequestUrl = `${getMempoolApiConfig().baseUrl}/address/${maskAddress(address)}`;
    const cacheKey = `${config.url}|${address}`;
    const cached = usageCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      debugMempoolLookup("cache hit", {
        requestUrl: safeRequestUrl,
        txCount: cached.value.txCount,
        confirmedTxCount: cached.value.confirmedTxCount,
        mempoolTxCount: cached.value.mempoolTxCount,
        usage: cached.value.usage
      });
      return cached.value;
    }

    debugMempoolLookup("request", {
      requestUrl: safeRequestUrl
    });

    const lookup = classifyMempoolAddressStats(await fetchMempoolJson(requestUrl));
    debugMempoolLookup("response", {
      requestUrl: safeRequestUrl,
      txCount: lookup.txCount,
      confirmedTxCount: lookup.confirmedTxCount,
      mempoolTxCount: lookup.mempoolTxCount,
      usage: lookup.usage
    });
    usageCache.set(cacheKey, {
      expiresAt: Date.now() + cacheTtlMs,
      value: lookup
    });
    pruneExpiredCache();
    return lookup;
  } catch (error) {
    debugMempoolLookup("fetch error", {
      requestUrl: safeRequestUrl,
      error: error instanceof Error ? error.message : String(error),
      usage: "unknown"
    });
    return unknownStats(errorMessage(error));
  }
}

function buildMempoolHealth(input: {
  status: "degraded" | "offline";
  mode: string;
  url: string;
  baseUrl: string;
  tipHeight: number | null;
  latencyMs: number;
  checkedAt: string;
  error: string;
  cacheTtlSeconds: number;
}): MempoolHealth {
  return {
    mode: input.mode,
    url: input.url,
    baseUrl: input.baseUrl,
    cacheTtlSeconds: input.cacheTtlSeconds,
    status: input.status,
    tipHeight: input.tipHeight,
    latencyMs: input.latencyMs,
    checkedAt: input.checkedAt,
    errors: [input.error],
    checks: {
      tipHeight: {
        status: "failed",
        error: input.error
      }
    }
  };
}

function withUsage(address: DerivedAddress, usage: AddressUsageLookup): AddressUsageRecord {
  return {
    ...address,
    usage: usage.usage,
    txCount: usage.txCount,
    confirmedTxCount: usage.confirmedTxCount,
    mempoolTxCount: usage.mempoolTxCount,
    lookupError: usage.lookupError
  };
}

function withBalance(address: DerivedAddress, stats: AddressStatsLookup): AddressBalanceRecord {
  return {
    ...withUsage(address, stats),
    confirmedBalance: stats.confirmedBalance,
    unconfirmedBalance: stats.unconfirmedBalance,
    totalBalance: stats.totalBalance
  };
}

function unknownStats(error = "invalid address stats payload"): AddressStatsLookup {
  return {
    usage: "unknown",
    txCount: null,
    confirmedTxCount: null,
    mempoolTxCount: null,
    confirmedBalance: null,
    unconfirmedBalance: null,
    totalBalance: null,
    lookupError: error
  };
}

function calculateBalance(stats: Record<string, unknown>): number | null {
  const funded = readNonNegativeInteger(stats.funded_txo_sum);
  const spent = readNonNegativeInteger(stats.spent_txo_sum);
  return funded === null || spent === null ? null : funded - spent;
}

function sanitizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function maskSensitiveUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.username) {
      url.username = "****";
    }
    if (url.password) {
      url.password = "****";
    }
    for (const key of Array.from(url.searchParams.keys())) {
      if (/token|secret|password|auth|key/i.test(key)) {
        url.searchParams.set(key, "****");
      }
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return value.replace(/([?&][^=]*(?:token|secret|password|auth|key)[^=]*=)[^&]+/gi, "$1****");
  }
}

function maskRequestUrl(value: string): string {
  return maskSensitiveUrl(value).replace(/\/address\/([^/?]+)/, (_match, address: string) => `/address/${maskAddress(address)}`);
}

function readNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function pruneExpiredCache(): void {
  const now = Date.now();
  for (const [key, value] of usageCache.entries()) {
    if (value.expiresAt <= now) {
      usageCache.delete(key);
    }
  }
}

function debugMempoolLookup(event: string, details: Record<string, unknown>): void {
  if (!isDevelopmentMode()) {
    return;
  }

  console.debug("watch wallet mempool lookup", {
    event,
    ...details
  });
}

function isDevelopmentMode(): boolean {
  return (
    process.env.MEMPOOL_DEBUG === "true" ||
    process.env.API_DEBUG === "true" ||
    process.env.npm_lifecycle_event === "dev" ||
    process.env.NODE_ENV !== "production"
  );
}

function maskAddress(address: string): string {
  if (address.length <= 14) {
    return "********";
  }

  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
