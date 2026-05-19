import type { FastifyInstance } from "fastify";

const UPBIT_BTC_KRW_TICKER_URL = "https://api.upbit.com/v1/ticker?markets=KRW-BTC";
const MARKET = "KRW-BTC";
const SOURCE = "upbit";
const PRICE_CACHE_TTL_MS = 5_000;
const PRICE_REQUEST_TIMEOUT_MS = 3_500;

export type BtcKrwPriceStatus = "online" | "stale" | "offline";

export type BtcKrwPriceResponse = {
  market: typeof MARKET;
  priceKrw: number | null;
  source: typeof SOURCE;
  checkedAt: string;
  status: BtcKrwPriceStatus;
  error?: "price-unavailable";
};

type CachedPrice = {
  priceKrw: number;
  checkedAt: string;
  fetchedAtMs: number;
};

let cachedPrice: CachedPrice | null = null;
let inFlightLookup: Promise<BtcKrwPriceResponse> | null = null;

export async function registerMarketRoutes(server: FastifyInstance): Promise<void> {
  server.get("/api/market/btc-krw", async () => lookupBtcKrwPrice());
}

export async function lookupBtcKrwPrice(
  options: {
    fetchFn?: typeof fetch;
    now?: () => Date;
  } = {}
): Promise<BtcKrwPriceResponse> {
  const now = options.now ?? (() => new Date());
  const nowDate = now();
  const nowMs = nowDate.getTime();
  if (cachedPrice && nowMs - cachedPrice.fetchedAtMs < PRICE_CACHE_TTL_MS) {
    return onlineResponse(cachedPrice);
  }

  if (inFlightLookup) {
    return inFlightLookup;
  }

  inFlightLookup = fetchBtcKrwPrice(options.fetchFn ?? fetch, nowDate, nowMs)
    .finally(() => {
      inFlightLookup = null;
    });
  return inFlightLookup;
}

export function parseUpbitBtcKrwTicker(raw: unknown): number | null {
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }
  const ticker = raw[0];
  if (typeof ticker !== "object" || ticker === null) {
    return null;
  }
  const value = ticker as Record<string, unknown>;
  if (value.market !== MARKET) {
    return null;
  }
  const price = value.trade_price;
  return typeof price === "number" && Number.isFinite(price) && price > 0 ? price : null;
}

export function clearBtcKrwPriceCache(): void {
  cachedPrice = null;
  inFlightLookup = null;
}

async function fetchBtcKrwPrice(
  fetchFn: typeof fetch,
  nowDate: Date,
  nowMs: number
): Promise<BtcKrwPriceResponse> {
  try {
    const response = await fetchFn(UPBIT_BTC_KRW_TICKER_URL, {
      headers: {
        accept: "application/json"
      },
      signal: AbortSignal.timeout(PRICE_REQUEST_TIMEOUT_MS)
    });
    if (!response.ok) {
      return unavailableResponse(nowDate);
    }
    const priceKrw = parseUpbitBtcKrwTicker(await response.json());
    if (priceKrw === null) {
      return unavailableResponse(nowDate);
    }
    cachedPrice = {
      priceKrw,
      checkedAt: nowDate.toISOString(),
      fetchedAtMs: nowMs
    };
    return onlineResponse(cachedPrice);
  } catch {
    return unavailableResponse(nowDate);
  }
}

function onlineResponse(price: CachedPrice): BtcKrwPriceResponse {
  return {
    market: MARKET,
    priceKrw: price.priceKrw,
    source: SOURCE,
    checkedAt: price.checkedAt,
    status: "online"
  };
}

function unavailableResponse(nowDate: Date): BtcKrwPriceResponse {
  if (cachedPrice) {
    return {
      market: MARKET,
      priceKrw: cachedPrice.priceKrw,
      source: SOURCE,
      checkedAt: cachedPrice.checkedAt,
      status: "stale",
      error: "price-unavailable"
    };
  }
  return {
    market: MARKET,
    priceKrw: null,
    source: SOURCE,
    checkedAt: nowDate.toISOString(),
    status: "offline",
    error: "price-unavailable"
  };
}
