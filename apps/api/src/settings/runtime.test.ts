import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import {
  getSafeRuntimeSettings,
  registerRuntimeSettingsRoute
} from "./runtime.js";

test("runtime settings returns only safe settings", () => {
  const original = snapshotEnv([
    "API_MODE",
    "MEMPOOL_API_URL",
    "DEFAULT_NETWORK",
    "DEFAULT_CURRENCY",
    "DEFAULT_UNIT",
    "SESSION_SECRET",
    "RPC_PASSWORD",
    "TOTP_SECRET"
  ]);

  try {
    process.env.API_MODE = "mempool";
    process.env.MEMPOOL_API_URL = "https://user:pass@mempool.example/api?token=secret-token&view=compact";
    process.env.DEFAULT_NETWORK = "mainnet";
    process.env.DEFAULT_CURRENCY = "KRW";
    process.env.DEFAULT_UNIT = "BTC";
    process.env.SESSION_SECRET = "do-not-return-session-secret";
    process.env.RPC_PASSWORD = "do-not-return-rpc-password";
    process.env.TOTP_SECRET = "do-not-return-totp-secret";

    const settings = getSafeRuntimeSettings();
    const serialized = JSON.stringify(settings);

    assert.deepEqual(Object.keys(settings).sort(), [
      "apiMode",
      "defaultCurrency",
      "defaultNetwork",
      "defaultUnit",
      "mempoolApiUrl"
    ]);
    assert.equal(settings.apiMode, "mempool");
    assert.equal(settings.defaultNetwork, "mainnet");
    assert.equal(settings.defaultCurrency, "KRW");
    assert.equal(settings.defaultUnit, "BTC");
    assert.equal(settings.mempoolApiUrl, "https://****:****@mempool.example/api?token=****&view=compact");
    assert.doesNotMatch(serialized, /do-not-return|secret-token|pass/);
  } finally {
    restoreEnv(original);
  }
});

test("runtime settings endpoint requires authentication", async () => {
  const server = Fastify({ logger: false });
  await registerRuntimeSettingsRoute(server, (_request, reply) => {
    reply.code(401).send({ error: "Authentication required" });
    return null;
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/settings/runtime"
  });

  assert.equal(response.statusCode, 401);
  await server.close();
});

test("runtime settings endpoint returns safe settings for authenticated users", async () => {
  const server = Fastify({ logger: false });
  await registerRuntimeSettingsRoute(server, () => ({ username: "admin", expiresAt: Date.now() + 1_000 }));

  const response = await server.inject({
    method: "GET",
    url: "/api/settings/runtime"
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(typeof payload.apiMode, "string");
  assert.equal(typeof payload.mempoolApiUrl, "string");
  assert.equal(payload.sessionSecret, undefined);
  assert.equal(payload.rpcPassword, undefined);
  await server.close();
});

function snapshotEnv(keys: string[]): Map<string, string | undefined> {
  return new Map(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot: Map<string, string | undefined>): void {
  for (const [key, value] of snapshot) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
