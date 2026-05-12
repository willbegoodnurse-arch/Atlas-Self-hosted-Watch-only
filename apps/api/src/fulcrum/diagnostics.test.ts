import assert from "node:assert/strict";
import test from "node:test";
import { checkFulcrumConnectivity } from "./diagnostics.js";

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

test("fulcrum status returns not-configured when FULCRUM_HOST is not set", async () => {
  const original = snapshotEnv(["FULCRUM_HOST", "FULCRUM_PORT", "FULCRUM_USE_TLS"]);
  try {
    delete process.env.FULCRUM_HOST;

    const result = await checkFulcrumConnectivity();

    assert.equal(result.status, "not-configured");
    assert.equal(result.host, null);
    assert.equal(result.latencyMs, null);
    assert.equal(result.error, null);
  } finally {
    restoreEnv(original);
  }
});

test("fulcrum status returns not-configured when FULCRUM_HOST is empty string", async () => {
  const original = snapshotEnv(["FULCRUM_HOST", "FULCRUM_PORT", "FULCRUM_USE_TLS"]);
  try {
    process.env.FULCRUM_HOST = "   ";

    const result = await checkFulcrumConnectivity();

    assert.equal(result.status, "not-configured");
    assert.equal(result.host, null);
  } finally {
    restoreEnv(original);
  }
});

test("fulcrum status returns offline JSON instead of throwing on connection failure", async () => {
  const original = snapshotEnv(["FULCRUM_HOST", "FULCRUM_PORT", "FULCRUM_USE_TLS"]);
  try {
    process.env.FULCRUM_HOST = "127.0.0.1";
    process.env.FULCRUM_PORT = "50001";
    process.env.FULCRUM_USE_TLS = "false";

    const result = await checkFulcrumConnectivity({
      connector: async () => {
        throw new Error("ECONNREFUSED: connection refused");
      }
    });

    assert.equal(result.status, "offline");
    assert.ok(result.error !== null && result.error.length > 0);
    assert.equal(result.host, "127.0.0.1");
    assert.equal(result.latencyMs, null);
  } finally {
    restoreEnv(original);
  }
});

test("fulcrum status returns online when connector succeeds", async () => {
  const original = snapshotEnv(["FULCRUM_HOST", "FULCRUM_PORT", "FULCRUM_USE_TLS"]);
  try {
    process.env.FULCRUM_HOST = "127.0.0.1";
    process.env.FULCRUM_PORT = "50001";
    process.env.FULCRUM_USE_TLS = "false";

    const result = await checkFulcrumConnectivity({
      connector: async () => {
        // simulate successful TCP connect
      }
    });

    assert.equal(result.status, "online");
    assert.equal(result.host, "127.0.0.1");
    assert.ok(typeof result.latencyMs === "number" && result.latencyMs >= 0);
    assert.equal(result.error, null);
  } finally {
    restoreEnv(original);
  }
});
