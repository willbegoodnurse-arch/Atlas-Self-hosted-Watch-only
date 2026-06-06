import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import cookie from "@fastify/cookie";
import Fastify from "fastify";

const ZPUB =
  "zpub6rtpJPNNq6CeKuycgiXu7RBRDzQcPG9uJWbKQ4NCiuVzP3wW6WspGjCD3h1gUKKwZRgo8Mzm21GEkD2HpUUHkfPrwyfcRaaWA93NSnnKTaP";
const RECEIVE_ADDR_0 = "bc1q7z737v8seg9qdghtj9qpf3q8jte82nynyfq6kc";
const EXTERNAL_RECIPIENT = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq";

test("PSBT route accepts sub-1 sat/vB fee rates", async () => {
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "watch-wallet-psbt-route-"));
  process.env.SESSION_SECRET = "psbt-route-test-session-secret";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    if (url.includes(`/address/${RECEIVE_ADDR_0}/utxo`)) {
      return jsonResponse([
        {
          txid: "a".repeat(64),
          vout: 0,
          value: 50000,
          status: { confirmed: true, block_height: 800000, block_time: 1700000000 }
        }
      ]);
    }
    if (url.includes("/utxo")) {
      return jsonResponse([]);
    }
    return jsonResponse({
      chain_stats: { tx_count: 0, funded_txo_count: 0, funded_txo_sum: 0, spent_txo_count: 0, spent_txo_sum: 0 },
      mempool_stats: { tx_count: 0, funded_txo_count: 0, funded_txo_sum: 0, spent_txo_count: 0, spent_txo_sum: 0 }
    });
  };

  try {
    const [{ registerVaultRoutes }, store, { createSession }, { authConfig }] = await Promise.all([
      import("./routes.js"),
      import("./store.js"),
      import("../auth/sessions.js"),
      import("../auth/config.js")
    ]);

    const server = Fastify({ logger: false });
    await server.register(cookie, { secret: authConfig.sessionSecret });
    await registerVaultRoutes(server);

    await store.initVault("correct horse battery staple");
    const wallet = await store.addWallet({
      name: "PSBT route wallet",
      importText: ZPUB,
      network: "mainnet",
      sourceDevice: "other",
      scriptType: "native-segwit",
      notes: null,
      gapLimit: 20
    });

    const token = createSession("admin", 60_000);
    const signed = (server as unknown as { signCookie: (value: string) => string }).signCookie(token);
    const response = await server.inject({
      method: "POST",
      url: `/api/wallets/${wallet.id}/psbt`,
      headers: {
        cookie: `${authConfig.sessionCookieName}=${signed}`
      },
      payload: {
        recipientAddress: EXTERNAL_RECIPIENT,
        amountSats: 10000,
        feeRateSatsPerVbyte: 0.39
      }
    });

    assert.equal(response.statusCode, 200, response.body);
    const payload = response.json();
    assert.equal(payload.feeRateSatsPerVbyte, 0.39);
    assert.equal(payload.feeSats, Math.ceil(payload.estimatedVbytes * 0.39));
    assert.doesNotMatch(response.body, new RegExp(ZPUB));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}
