import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import {
  isStateChangingApiRequest,
  registerTrustedOriginGuard,
  validateTrustedRequestOrigin
} from "./trusted-origin.js";

const trustedOrigins = ["http://localhost:3010", "https://atlas.local"];

test("validateTrustedRequestOrigin accepts trusted Origin header", () => {
  assert.deepEqual(
    validateTrustedRequestOrigin({
      origin: "https://atlas.local",
      referer: undefined,
      trustedOrigins
    }),
    { ok: true }
  );
});

test("validateTrustedRequestOrigin accepts trusted Referer fallback", () => {
  assert.deepEqual(
    validateTrustedRequestOrigin({
      origin: undefined,
      referer: "http://localhost:3010/wallets/test",
      trustedOrigins
    }),
    { ok: true }
  );
});

test("validateTrustedRequestOrigin rejects missing or untrusted origins", () => {
  assert.deepEqual(
    validateTrustedRequestOrigin({
      origin: undefined,
      referer: undefined,
      trustedOrigins
    }),
    { ok: false, reason: "missing-origin" }
  );

  assert.deepEqual(
    validateTrustedRequestOrigin({
      origin: "https://evil.example",
      referer: undefined,
      trustedOrigins
    }),
    { ok: false, reason: "untrusted-origin" }
  );
});

test("isStateChangingApiRequest only targets mutating API requests", () => {
  assert.equal(isStateChangingApiRequest({ method: "POST", url: "/api/vault/unlock" }), true);
  assert.equal(isStateChangingApiRequest({ method: "PATCH", url: "/api/wallets/test" }), true);
  assert.equal(isStateChangingApiRequest({ method: "GET", url: "/api/wallets" }), false);
  assert.equal(isStateChangingApiRequest({ method: "POST", url: "/health" }), false);
});

test("registerTrustedOriginGuard blocks untrusted mutating API requests only", async () => {
  const server = Fastify({ logger: false });
  await registerTrustedOriginGuard(server, trustedOrigins);
  server.post("/api/vault/lock", async () => ({ ok: true }));
  server.get("/api/vault/status", async () => ({ ok: true }));

  const trusted = await server.inject({
    method: "POST",
    url: "/api/vault/lock",
    headers: {
      origin: "https://atlas.local"
    }
  });
  assert.equal(trusted.statusCode, 200);

  const untrusted = await server.inject({
    method: "POST",
    url: "/api/vault/lock",
    headers: {
      origin: "https://evil.example"
    }
  });
  assert.equal(untrusted.statusCode, 403);
  assert.equal(untrusted.json().error, "Trusted browser origin required");

  const missingOriginRead = await server.inject({
    method: "GET",
    url: "/api/vault/status"
  });
  assert.equal(missingOriginRead.statusCode, 200);

  await server.close();
});
