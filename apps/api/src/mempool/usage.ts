import type { DerivedAddress } from "@watch-wallet/bitcoin";

export type AddressUsage = "used" | "unused" | "unknown";

export type AddressUsageRecord = Omit<DerivedAddress, "usage"> & {
  usage: AddressUsage;
  txCount: number | null;
  confirmedTxCount: number | null;
  mempoolTxCount: number | null;
};

export type AddressUsageLookup = {
  usage: AddressUsage;
  txCount: number | null;
  confirmedTxCount: number | null;
  mempoolTxCount: number | null;
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

type CacheEntry = {
  expiresAt: number;
  value: AddressUsageLookup;
};

const usageCache = new Map<string, CacheEntry>();
const cacheTtlMs = 45_000;
const requestTimeoutMs = 4_000;

export function getMempoolApiConfig() {
  return {
    mode: process.env.API_MODE ?? "mempool",
    url: sanitizeBaseUrl(process.env.MEMPOOL_API_URL ?? "http://localhost:8080/api"),
    cacheTtlSeconds: Math.round(cacheTtlMs / 1000)
  };
}

export async function lookupAddressUsageRecords(
  addresses: DerivedAddress[],
  options: {
    fetchAddressStats?: FetchAddressStats;
    concurrency?: number;
  } = {}
): Promise<{ addresses: AddressUsageRecord[]; lookupFailed: boolean }> {
  const records: AddressUsageRecord[] = new Array(addresses.length);
  let lookupFailed = false;
  let cursor = 0;
  const workerCount = Math.min(Math.max(options.concurrency ?? 4, 1), addresses.length || 1);

  async function worker() {
    while (cursor < addresses.length) {
      const currentIndex = cursor;
      cursor += 1;
      const address = addresses[currentIndex];
      const usage = await lookupAddressUsage(address.address, {
        fetchAddressStats: options.fetchAddressStats
      });
      if (usage.usage === "unknown") {
        lookupFailed = true;
      }
      records[currentIndex] = withUsage(address, usage);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return { addresses: records, lookupFailed };
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

export function classifyMempoolAddressStats(value: unknown): AddressUsageLookup {
  if (!isRecord(value)) {
    return unknownUsage();
  }

  const chainStats = value.chain_stats;
  const mempoolStats = value.mempool_stats;
  if (!isRecord(chainStats) || !isRecord(mempoolStats)) {
    return unknownUsage();
  }

  const confirmedTxCount = readNonNegativeInteger(chainStats.tx_count);
  const mempoolTxCount = readNonNegativeInteger(mempoolStats.tx_count);
  if (confirmedTxCount === null || mempoolTxCount === null) {
    return unknownUsage();
  }

  const txCount = confirmedTxCount + mempoolTxCount;
  return {
    usage: txCount > 0 ? "used" : "unused",
    txCount,
    confirmedTxCount,
    mempoolTxCount
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
  let safeRequestUrl: string | null = null;
  try {
    if (options.fetchAddressStats) {
      try {
        return classifyMempoolAddressStats(await options.fetchAddressStats(address));
      } catch {
        return unknownUsage();
      }
    }

    const config = getMempoolApiConfig();
    const requestUrl = `${config.url}/address/${encodeURIComponent(address)}`;
    safeRequestUrl = `${config.url}/address/${maskAddress(address)}`;
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

    const response = await fetch(requestUrl, {
      signal: AbortSignal.timeout(requestTimeoutMs)
    });
    if (!response.ok) {
      debugMempoolLookup("http error", {
        requestUrl: safeRequestUrl,
        httpStatus: response.status,
        usage: "unknown"
      });
      return unknownUsage();
    }

    const lookup = classifyMempoolAddressStats(await response.json());
    debugMempoolLookup("response", {
      requestUrl: safeRequestUrl,
      httpStatus: response.status,
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
    return unknownUsage();
  }
}

function withUsage(address: DerivedAddress, usage: AddressUsageLookup): AddressUsageRecord {
  return {
    ...address,
    usage: usage.usage,
    txCount: usage.txCount,
    confirmedTxCount: usage.confirmedTxCount,
    mempoolTxCount: usage.mempoolTxCount
  };
}

function unknownUsage(): AddressUsageLookup {
  return {
    usage: "unknown",
    txCount: null,
    confirmedTxCount: null,
    mempoolTxCount: null
  };
}

function sanitizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
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
