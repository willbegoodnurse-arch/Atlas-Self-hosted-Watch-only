import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import cookie from "@fastify/cookie";
import Fastify from "fastify";

const XPUB =
  "xpub6BvTm7YLvSRVjijq48yLuTA3eThj9nqZjsCyd48QXLW1cgmkThmXaWRiRJv7j59nxRSkPD2ux97rSFAFPFppMEUAsE7Zoqt8oBYguJz2Mtb";
const WIF = "5KYZdUEo39z3FPrtuX2QbbwGnNP5zTd7yyr2SC1j299sBCnWjss";

test("label and note routes store metadata safely", async () => {
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "watch-wallet-labels-"));
  process.env.SESSION_SECRET = "route-test-session-secret";

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
    name: "Route test wallet",
    importText: XPUB,
    network: "mainnet",
    sourceDevice: "other",
    scriptType: "native-segwit",
    notes: null,
    gapLimit: 20
  });

  const token = createSession("admin", 60_000);
  const signed = (server as unknown as { signCookie: (value: string) => string }).signCookie(token);
  const headers = {
    cookie: `${authConfig.sessionCookieName}=${signed}`
  };

  const addressResponse = await server.inject({
    method: "PATCH",
    url: `/api/wallets/${wallet.id}/labels/address`,
    headers,
    payload: {
      chain: "receive",
      index: 0,
      address: "bc1qexampleaddress",
      label: "<script>alert(1)</script>",
      notes: "plain text only"
    }
  });

  assert.equal(addressResponse.statusCode, 200);
  const addressPayload = addressResponse.json();
  assert.equal(addressPayload.wallet.addressLabels[0].label, "<script>alert(1)</script>");
  assert.doesNotMatch(addressResponse.body, new RegExp(XPUB));

  const utxoResponse = await server.inject({
    method: "PATCH",
    url: `/api/wallets/${wallet.id}/labels/utxo`,
    headers,
    payload: {
      txid: "a".repeat(64),
      vout: 1,
      note: "Available for PSBT planning"
    }
  });

  assert.equal(utxoResponse.statusCode, 200);
  assert.equal(utxoResponse.json().wallet.utxoNotes[0].note, "Available for PSBT planning");
  assert.doesNotMatch(utxoResponse.body, new RegExp(XPUB));

  const clearUtxoResponse = await server.inject({
    method: "PATCH",
    url: `/api/wallets/${wallet.id}/labels/utxo`,
    headers,
    payload: {
      txid: "a".repeat(64),
      vout: 1,
      note: ""
    }
  });

  assert.equal(clearUtxoResponse.statusCode, 200);
  assert.deepEqual(clearUtxoResponse.json().wallet.utxoNotes, []);

  const txResponse = await server.inject({
    method: "PATCH",
    url: `/api/wallets/${wallet.id}/labels/transaction`,
    headers,
    payload: {
      txid: "b".repeat(64),
      notes: "Tax lot note"
    }
  });

  assert.equal(txResponse.statusCode, 200);
  assert.equal(txResponse.json().wallet.transactionLabels[0].notes, "Tax lot note");

  const clearTxResponse = await server.inject({
    method: "PATCH",
    url: `/api/wallets/${wallet.id}/labels/transaction`,
    headers,
    payload: {
      txid: "b".repeat(64),
      notes: ""
    }
  });

  assert.equal(clearTxResponse.statusCode, 200);
  assert.deepEqual(clearTxResponse.json().wallet.transactionLabels, []);

  const secretResponse = await server.inject({
    method: "PATCH",
    url: `/api/wallets/${wallet.id}/labels/utxo`,
    headers,
    payload: {
      txid: "c".repeat(64),
      vout: 0,
      note: WIF
    }
  });

  assert.equal(secretResponse.statusCode, 400);
  assert.doesNotMatch(secretResponse.body, new RegExp(WIF));

  store.lockVault();
  const lockedResponse = await server.inject({
    method: "PATCH",
    url: `/api/wallets/${wallet.id}/labels/utxo`,
    headers,
    payload: {
      txid: "d".repeat(64),
      vout: 0,
      note: "Tracked UTXO"
    }
  });

  assert.equal(lockedResponse.statusCode, 423);
  assert.equal(lockedResponse.json().error, "Vault is locked");

  await server.close();
});
