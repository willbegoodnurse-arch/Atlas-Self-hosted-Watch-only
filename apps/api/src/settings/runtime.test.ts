import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import {
  getSafeRuntimeSettings,
  registerRuntimeSettingsRoute
} from "./runtime.js";

const ALL_ENV_KEYS = [
  "API_MODE",
  "MEMPOOL_API_URL",
  "MEMPOOL_WEB_URL",
  "BROADCAST_BACKEND",
  "CORE_RPC_URL",
  "CORE_RPC_USERNAME",
  "CORE_RPC_PASSWORD",
  "FULCRUM_HOST",
  "FULCRUM_PORT",
  "FULCRUM_TLS_PORT",
  "FULCRUM_USE_TLS",
  "DEFAULT_NETWORK",
  "DEFAULT_CURRENCY",
  "DEFAULT_UNIT",
  "SESSION_SECRET",
  "RPC_PASSWORD",
  "TOTP_SECRET"
];

test("runtime settings returns only safe settings", () => {
  const original = snapshotEnv(ALL_ENV_KEYS);

  try {
    process.env.API_MODE = "mempool";
    process.env.MEMPOOL_API_URL =
      "https://user:pass@mempool.example/api?token=secret-token&view=compact";
    process.env.MEMPOOL_WEB_URL = "http://raspberrypi.local:8080";
    process.env.BROADCAST_BACKEND = "core";
    process.env.CORE_RPC_URL = "http://127.0.0.1:8332";
    process.env.CORE_RPC_USERNAME = "runtime_rpc_user";
    process.env.CORE_RPC_PASSWORD = "runtime_rpc_password";
    delete process.env.FULCRUM_HOST;
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
      "backendKind",
      "broadcastBackend",
      "broadcastCoreConfigured",
      "defaultCurrency",
      "defaultNetwork",
      "defaultUnit",
      "fulcrum",
      "isLocalMempool",
      "mempoolApiHost",
      "mempoolApiUrl",
      "mempoolWebUrl",
      "mempoolWebUrlConfigured"
    ]);

    assert.equal(settings.apiMode, "mempool");
    assert.equal(settings.backendKind, "mempool-public");
    assert.equal(settings.mempoolApiHost, "mempool.example");
    assert.equal(settings.isLocalMempool, false);
    assert.equal(settings.mempoolWebUrl, "http://raspberrypi.local:8080");
    assert.equal(settings.mempoolWebUrlConfigured, true);
    assert.equal(settings.broadcastBackend, "core");
    assert.equal(settings.broadcastCoreConfigured, true);
    assert.equal(settings.fulcrum.configured, false);
    assert.equal(settings.fulcrum.host, null);
    assert.equal(settings.defaultNetwork, "mainnet");
    assert.equal(settings.defaultCurrency, "KRW");
    assert.equal(settings.defaultUnit, "BTC");
    assert.equal(
      settings.mempoolApiUrl,
      "https://****:****@mempool.example/api?token=****&view=compact"
    );
    assert.doesNotMatch(serialized, /do-not-return|secret-token|runtime_rpc|pass(?!port)/);
  } finally {
    restoreEnv(original);
  }
});

test("runtime settings includes backendKind and does not expose secrets", () => {
  const original = snapshotEnv(ALL_ENV_KEYS);

  try {
    process.env.API_MODE = "mempool";
    process.env.MEMPOOL_API_URL = "https://mempool.space/api";
    process.env.MEMPOOL_WEB_URL = "https://user:secret@mempool.local";
    process.env.BROADCAST_BACKEND = "core";
    process.env.CORE_RPC_URL = "http://127.0.0.1:8332";
    delete process.env.CORE_RPC_USERNAME;
    delete process.env.CORE_RPC_PASSWORD;
    delete process.env.FULCRUM_HOST;
    process.env.SESSION_SECRET = "super-secret-session-key";
    process.env.RPC_PASSWORD = "super-secret-rpc-password";
    process.env.TOTP_SECRET = "super-secret-totp";

    const settings = getSafeRuntimeSettings();
    const serialized = JSON.stringify(settings);

    assert.equal(typeof settings.backendKind, "string");
    assert.ok(
      ["mempool-public", "mempool-local", "fulcrum", "unknown"].includes(
        settings.backendKind
      )
    );
    assert.equal(settings.backendKind, "mempool-public");
    assert.equal(settings.mempoolWebUrl, null);
    assert.equal(settings.mempoolWebUrlConfigured, false);
    assert.equal(settings.broadcastBackend, "core");
    assert.equal(settings.broadcastCoreConfigured, false);
    assert.doesNotMatch(serialized, /super-secret/);
  } finally {
    restoreEnv(original);
  }
});

test("runtime settings detects local mempool URL", () => {
  const original = snapshotEnv(["API_MODE", "MEMPOOL_API_URL", "FULCRUM_HOST"]);

  try {
    process.env.API_MODE = "mempool";
    process.env.MEMPOOL_API_URL = "http://192.168.0.23:8080/api";
    delete process.env.FULCRUM_HOST;

    const settings = getSafeRuntimeSettings();

    assert.equal(settings.backendKind, "mempool-local");
    assert.equal(settings.isLocalMempool, true);
    assert.equal(settings.mempoolApiHost, "192.168.0.23");
  } finally {
    restoreEnv(original);
  }
});

test("runtime settings reports fulcrum as configured when FULCRUM_HOST is set", () => {
  const original = snapshotEnv(ALL_ENV_KEYS);

  try {
    process.env.API_MODE = "mempool";
    process.env.MEMPOOL_API_URL = "https://mempool.space/api";
    process.env.FULCRUM_HOST = "127.0.0.1";
    process.env.FULCRUM_PORT = "50001";
    process.env.FULCRUM_TLS_PORT = "50002";
    process.env.FULCRUM_USE_TLS = "false";

    const settings = getSafeRuntimeSettings();

    assert.equal(settings.fulcrum.configured, true);
    assert.equal(settings.fulcrum.host, "127.0.0.1");
    assert.equal(settings.fulcrum.port, 50001);
    assert.equal(settings.fulcrum.tlsPort, 50002);
    assert.equal(settings.fulcrum.useTls, false);
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
  await registerRuntimeSettingsRoute(server, () => ({
    username: "admin",
    expiresAt: Date.now() + 1_000
  }));

  const response = await server.inject({
    method: "GET",
    url: "/api/settings/runtime"
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(typeof payload.apiMode, "string");
  assert.equal(typeof payload.mempoolApiUrl, "string");
  assert.equal(typeof payload.backendKind, "string");
  assert.equal(typeof payload.broadcastBackend, "string");
  assert.equal(typeof payload.broadcastCoreConfigured, "boolean");
  assert.equal(typeof payload.mempoolWebUrlConfigured, "boolean");
  assert.ok(typeof payload.isLocalMempool === "boolean");
  assert.ok(typeof payload.fulcrum === "object" && payload.fulcrum !== null);
  assert.equal(payload.sessionSecret, undefined);
  assert.equal(payload.rpcPassword, undefined);
  assert.equal(payload.coreRpcPassword, undefined);
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
