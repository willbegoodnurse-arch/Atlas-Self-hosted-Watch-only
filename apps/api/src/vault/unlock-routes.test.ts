import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import cookie from "@fastify/cookie";
import Fastify from "fastify";

test("vault unlock route rate limits repeated invalid password attempts", async () => {
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "watch-wallet-vault-unlock-"));
  process.env.SESSION_SECRET = "vault-unlock-route-test-session-secret";

  const [
    { registerVaultRoutes },
    store,
    { createSession },
    { authConfig },
    { clearAllVaultUnlockFailures }
  ] = await Promise.all([
    import("./routes.js"),
    import("./store.js"),
    import("../auth/sessions.js"),
    import("../auth/config.js"),
    import("./unlock-attempts.js")
  ]);

  clearAllVaultUnlockFailures();
  const server = Fastify({ logger: false });
  await server.register(cookie, { secret: authConfig.sessionSecret });
  await registerVaultRoutes(server);

  await store.initVault("correct horse battery staple");
  store.lockVault();

  const token = createSession("admin", 60_000);
  const signed = (server as unknown as { signCookie: (value: string) => string }).signCookie(token);
  const headers = {
    cookie: `${authConfig.sessionCookieName}=${signed}`
  };

  for (let index = 0; index < 5; index += 1) {
    const response = await server.inject({
      method: "POST",
      url: "/api/vault/unlock",
      headers,
      payload: {
        vaultPassword: "wrong horse battery staple"
      }
    });
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error, "Invalid vault password");
    assert.doesNotMatch(response.body, /wrong horse battery staple/);
  }

  const lockedResponse = await server.inject({
    method: "POST",
    url: "/api/vault/unlock",
    headers,
    payload: {
      vaultPassword: "correct horse battery staple"
    }
  });

  assert.equal(lockedResponse.statusCode, 429);
  assert.equal(lockedResponse.json().error, "Too many vault unlock attempts");
  assert.match(lockedResponse.headers["retry-after"] as string, /^\d+$/);

  clearAllVaultUnlockFailures();
  const successResponse = await server.inject({
    method: "POST",
    url: "/api/vault/unlock",
    headers,
    payload: {
      vaultPassword: "correct horse battery staple"
    }
  });

  assert.equal(successResponse.statusCode, 200);
  assert.equal(successResponse.json().unlocked, true);

  await server.close();
});
