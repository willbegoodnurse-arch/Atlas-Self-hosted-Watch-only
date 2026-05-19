import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import {
  clearBtcKrwPriceCache,
  lookupBtcKrwPrice,
  parseUpbitBtcKrwTicker,
  registerMarketRoutes
} from "./btc-krw.js";

test("parseUpbitBtcKrwTicker reads KRW-BTC trade_price", () => {
  assert.equal(parseUpbitBtcKrwTicker([{ market: "KRW-BTC", trade_price: 143_000_000 }]), 143_000_000);
});

test("malformed Upbit ticker response returns offline fallback", async () => {
  clearBtcKrwPriceCache();
  const result = await lookupBtcKrwPrice({
    fetchFn: async () => new Response(JSON.stringify([{ market: "KRW-BTC", trade_price: "143000000" }])) as Response,
    now: () => new Date("2026-05-19T00:00:00.000Z")
  });

  assert.deepEqual(result, {
    market: "KRW-BTC",
    priceKrw: null,
    source: "upbit",
    checkedAt: "2026-05-19T00:00:00.000Z",
    status: "offline",
    error: "price-unavailable"
  });
});

test("fetch failure returns safe fallback without affecting other APIs", async () => {
  clearBtcKrwPriceCache();
  const result = await lookupBtcKrwPrice({
    fetchFn: async () => {
      throw new Error("network includes payload that must not be echoed");
    },
    now: () => new Date("2026-05-19T00:00:01.000Z")
  });

  assert.equal(result.status, "offline");
  assert.equal(result.error, "price-unavailable");
  assert.equal(result.priceKrw, null);
  assert(!JSON.stringify(result).includes("payload that must not be echoed"));
});

test("5 second cache TTL reduces duplicate Upbit calls", async () => {
  clearBtcKrwPriceCache();
  let calls = 0;
  const fetchFn = async () => {
    calls += 1;
    return new Response(JSON.stringify([{ market: "KRW-BTC", trade_price: 150_000_000 }])) as Response;
  };

  const first = await lookupBtcKrwPrice({
    fetchFn,
    now: () => new Date("2026-05-19T00:00:00.000Z")
  });
  const second = await lookupBtcKrwPrice({
    fetchFn,
    now: () => new Date("2026-05-19T00:00:04.999Z")
  });

  assert.equal(calls, 1);
  assert.equal(first.priceKrw, 150_000_000);
  assert.equal(second.priceKrw, 150_000_000);
});

test("stale cache is returned when refresh fails after TTL", async () => {
  clearBtcKrwPriceCache();
  let calls = 0;
  const fetchFn = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify([{ market: "KRW-BTC", trade_price: 151_000_000 }])) as Response;
    }
    throw new Error("upstream unavailable");
  };

  await lookupBtcKrwPrice({
    fetchFn,
    now: () => new Date("2026-05-19T00:00:00.000Z")
  });
  const stale = await lookupBtcKrwPrice({
    fetchFn,
    now: () => new Date("2026-05-19T00:00:06.000Z")
  });

  assert.equal(stale.status, "stale");
  assert.equal(stale.priceKrw, 151_000_000);
  assert.equal(stale.error, "price-unavailable");
});

test("market endpoint returns only sanitized ticker fields", async () => {
  clearBtcKrwPriceCache();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify([{
      market: "KRW-BTC",
      trade_price: 152_000_000,
      raw_payload: "must-not-return"
    }])) as Response;

  const server = Fastify({ logger: false });
  await registerMarketRoutes(server);
  const response = await server.inject({ method: "GET", url: "/api/market/btc-krw" });

  globalThis.fetch = originalFetch;
  await server.close();

  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body) as Record<string, unknown>;
  assert.equal(body.priceKrw, 152_000_000);
  assert.equal(body.source, "upbit");
  assert(!response.body.includes("must-not-return"));
});
