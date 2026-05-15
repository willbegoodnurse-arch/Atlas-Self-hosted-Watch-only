import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import cookie from "@fastify/cookie";
import Fastify from "fastify";

const ZPUB =
  "zpub6rtpJPNNq6CeKuycgiXu7RBRDzQcPG9uJWbKQ4NCiuVzP3wW6WspGjCD3h1gUKKwZRgo8Mzm21GEkD2HpUUHkfPrwyfcRaaWA93NSnnKTaP";
const WIF = "5KYZdUEo39z3FPrtuX2QbbwGnNP5zTd7yyr2SC1j299sBCnWjss";

test("wallet import preview derives first receive address without echoing the xpub", async () => {
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "watch-wallet-import-preview-"));
  process.env.SESSION_SECRET = "import-preview-route-test-session-secret";

  const [{ registerVaultRoutes }, store, { createSession }, { authConfig }] = await Promise.all([
    import("./routes.js"),
    import("./store.js"),
    import("../auth/sessions.js"),
    import("../auth/config.js")
  ]);

  const server = Fastify({ logger: false });
  await server.register(cookie, { secret: authConfig.sessionSecret });
  await registerVaultRoutes(server);

  const token = createSession("admin", 60_000);
  const signed = (server as unknown as { signCookie: (value: string) => string }).signCookie(token);
  const headers = {
    cookie: `${authConfig.sessionCookieName}=${signed}`
  };

  const previewResponse = await server.inject({
    method: "POST",
    url: "/api/wallets/import-preview",
    headers,
    payload: {
      importText: ZPUB,
      network: "mainnet",
      sourceDevice: "other",
      scriptType: "native-segwit"
    }
  });

  assert.equal(previewResponse.statusCode, 200);
  const previewPayload = previewResponse.json();
  assert.equal(previewPayload.keyType, "zpub");
  assert.equal(previewPayload.network, "mainnet");
  assert.equal(previewPayload.scriptType, "native-segwit");
  assert.equal(previewPayload.masterFingerprint, null);
  assert.equal(previewPayload.accountPath, "m/84'/0'/0'");
  assert.match(previewPayload.firstReceiveAddress, /^bc1q/);
  assert.equal(previewPayload.firstReceivePath, "m/84'/0'/0'/0/0");
  assert.doesNotMatch(previewResponse.body, new RegExp(ZPUB));

  const descriptorResponse = await server.inject({
    method: "POST",
    url: "/api/wallets/import-preview",
    headers,
    payload: {
      importText: `wpkh([f23a9c1d/84'/0'/0']${ZPUB}/0/*)`,
      network: "mainnet",
      sourceDevice: "other",
      scriptType: "native-segwit"
    }
  });

  assert.equal(descriptorResponse.statusCode, 200);
  const descriptorPayload = descriptorResponse.json();
  assert.equal(descriptorPayload.masterFingerprint, "f23a9c1d");
  assert.equal(descriptorPayload.accountPath, "m/84'/0'/0'");
  assert.equal(descriptorPayload.scriptType, "native-segwit");
  assert.match(descriptorPayload.firstReceiveAddress, /^bc1q/);
  assert.doesNotMatch(descriptorResponse.body, new RegExp(ZPUB));

  const secretResponse = await server.inject({
    method: "POST",
    url: "/api/wallets/import-preview",
    headers,
    payload: {
      importText: WIF,
      network: "mainnet",
      sourceDevice: "other",
      scriptType: "legacy"
    }
  });

  assert.equal(secretResponse.statusCode, 400);
  assert.doesNotMatch(secretResponse.body, new RegExp(WIF));

  await store.initVault("correct horse battery staple");
  store.lockVault();

  const lockedCreateResponse = await server.inject({
    method: "POST",
    url: "/api/wallets",
    headers,
    payload: {
      name: "Locked vault wallet",
      importText: ZPUB,
      network: "mainnet",
      sourceDevice: "other",
      scriptType: "native-segwit",
      notes: null,
      gapLimit: 20
    }
  });

  assert.equal(lockedCreateResponse.statusCode, 423);
  assert.equal(lockedCreateResponse.json().error, "Vault is locked");
  assert.doesNotMatch(lockedCreateResponse.body, new RegExp(ZPUB));

  await server.close();
});
