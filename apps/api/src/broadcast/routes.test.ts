import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import cookie from "@fastify/cookie";
import Fastify from "fastify";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import { BIP32Factory } from "bip32";

bitcoin.initEccLib(ecc);
const bip32 = BIP32Factory(ecc);

const BTC = bitcoin.networks.bitcoin;
const TEST_SEED = Buffer.from("ab".repeat(32), "hex");
const testRoot = bip32.fromSeed(TEST_SEED, BTC);
const testAccountNode = testRoot.derivePath("m/84'/0'/0'");
const TEST_XPUB = testAccountNode.neutered().toBase58();
const recvNode = testAccountNode.derive(0).derive(0);
const TEST_RECV_ADDR = bitcoin.payments.p2wpkh({
  pubkey: Buffer.from(recvNode.publicKey),
  network: BTC
}).address!;
const EXTERNAL_ADDR = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq";
const FAKE_TXID = "a".repeat(64);
const BROADCAST_TXID = "b".repeat(64);

test("broadcast routes require auth, verification, and configured Bitcoin Core RPC", async () => {
  const originalEnv = snapshotEnv([
    "DATA_DIR",
    "SESSION_SECRET",
    "BROADCAST_BACKEND",
    "CORE_RPC_URL",
    "CORE_RPC_USERNAME",
    "CORE_RPC_PASSWORD",
    "CORE_RPC_TIMEOUT_MS"
  ]);
  const originalFetch = globalThis.fetch;

  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "watch-wallet-broadcast-"));
  process.env.SESSION_SECRET = "broadcast-route-test-session-secret";
  delete process.env.BROADCAST_BACKEND;
  delete process.env.CORE_RPC_URL;
  delete process.env.CORE_RPC_USERNAME;
  delete process.env.CORE_RPC_PASSWORD;

  const [
    { registerBroadcastRoutes },
    store,
    { createSession },
    { authConfig },
    { requireAuthenticatedSession }
  ] = await Promise.all([
    import("./routes.js"),
    import("../vault/store.js"),
    import("../auth/sessions.js"),
    import("../auth/config.js"),
    import("../auth/guard.js")
  ]);

  const server = Fastify({ logger: false });
  await server.register(cookie, { secret: authConfig.sessionSecret });
  await registerBroadcastRoutes(server, requireAuthenticatedSession);

  try {
    await store.initVault("correct horse battery staple");
    const wallet = await store.addWallet({
      name: "Broadcast route wallet",
      importText: TEST_XPUB,
      network: "mainnet",
      sourceDevice: "other",
      scriptType: "native-segwit",
      notes: null,
      gapLimit: 20
    });

    const token = createSession("admin", 60_000);
    const signedCookie = (server as unknown as { signCookie: (value: string) => string }).signCookie(token);
    const headers = {
      cookie: `${authConfig.sessionCookieName}=${signedCookie}`
    };
    const signedPsbt = makeSignedPsbt().toBase64();
    const unsignedPsbt = makeUnsignedPsbt().toBase64();

    const unauthenticatedStatus = await server.inject({
      method: "GET",
      url: "/api/broadcast/status"
    });
    assert.equal(unauthenticatedStatus.statusCode, 401);

    const unauthenticatedCoreStatus = await server.inject({
      method: "GET",
      url: "/api/broadcast/core/status"
    });
    assert.equal(unauthenticatedCoreStatus.statusCode, 401);

    const disabledStatus = await server.inject({
      method: "GET",
      url: "/api/broadcast/status",
      headers
    });
    assert.equal(disabledStatus.statusCode, 200);
    assert.deepEqual(disabledStatus.json(), {
      enabled: false,
      backend: "disabled",
      configured: false,
      message: "Broadcast backend is disabled."
    });

    const disabledCoreStatus = await server.inject({
      method: "GET",
      url: "/api/broadcast/core/status",
      headers
    });
    assert.equal(disabledCoreStatus.statusCode, 200);
    assert.deepEqual(disabledCoreStatus.json(), {
      enabled: false,
      backend: "disabled",
      configured: false,
      reachable: false,
      message: "Broadcast backend is disabled."
    });

    const disabledBroadcast = await server.inject({
      method: "POST",
      url: `/api/wallets/${wallet.id}/psbt/broadcast`,
      headers,
      payload: { psbtBase64: signedPsbt }
    });
    assert.equal(disabledBroadcast.statusCode, 503);
    assert.match(disabledBroadcast.json().error, /disabled/i);

    process.env.BROADCAST_BACKEND = "mempool";
    const unknownBackendStatus = await server.inject({
      method: "GET",
      url: "/api/broadcast/status",
      headers
    });
    assert.equal(unknownBackendStatus.statusCode, 200);
    assert.deepEqual(unknownBackendStatus.json(), {
      enabled: false,
      backend: "disabled",
      configured: false,
      message: "Broadcast backend is disabled."
    });

    const unknownBackendBroadcast = await server.inject({
      method: "POST",
      url: `/api/wallets/${wallet.id}/psbt/broadcast`,
      headers,
      payload: { psbtBase64: signedPsbt }
    });
    assert.equal(unknownBackendBroadcast.statusCode, 503);
    assert.match(unknownBackendBroadcast.json().error, /disabled/i);

    process.env.BROADCAST_BACKEND = "core";
    const missingConfigStatus = await server.inject({
      method: "GET",
      url: "/api/broadcast/status",
      headers
    });
    assert.equal(missingConfigStatus.statusCode, 200);
    assert.equal(missingConfigStatus.json().enabled, true);
    assert.equal(missingConfigStatus.json().backend, "core");
    assert.equal(missingConfigStatus.json().configured, false);
    assert.doesNotMatch(missingConfigStatus.body, /password|secret/i);

    const missingConfigCoreStatus = await server.inject({
      method: "GET",
      url: "/api/broadcast/core/status",
      headers
    });
    assert.equal(missingConfigCoreStatus.statusCode, 200);
    assert.equal(missingConfigCoreStatus.json().enabled, true);
    assert.equal(missingConfigCoreStatus.json().backend, "core");
    assert.equal(missingConfigCoreStatus.json().configured, false);
    assert.equal(missingConfigCoreStatus.json().reachable, false);
    assert.doesNotMatch(missingConfigCoreStatus.body, /password|secret|127\.0\.0\.1/);

    const missingConfigBroadcast = await server.inject({
      method: "POST",
      url: `/api/wallets/${wallet.id}/psbt/broadcast`,
      headers,
      payload: { psbtBase64: signedPsbt }
    });
    assert.equal(missingConfigBroadcast.statusCode, 503);
    assert.match(missingConfigBroadcast.json().error, /not configured/i);

    process.env.CORE_RPC_URL = "http://atlas_rpc_user:atlas_rpc_password@127.0.0.1:8332";
    process.env.CORE_RPC_USERNAME = "atlas_rpc_user";
    process.env.CORE_RPC_PASSWORD = "atlas_rpc_password";
    const embeddedCredentialStatus = await server.inject({
      method: "GET",
      url: "/api/broadcast/status",
      headers
    });
    assert.equal(embeddedCredentialStatus.statusCode, 200);
    assert.equal(embeddedCredentialStatus.json().enabled, true);
    assert.equal(embeddedCredentialStatus.json().configured, false);
    assert.doesNotMatch(embeddedCredentialStatus.body, /atlas_rpc_password|atlas_rpc_user|127\.0\.0\.1/);

    process.env.CORE_RPC_URL = "file:///tmp/bitcoin-cookie";
    const invalidProtocolStatus = await server.inject({
      method: "GET",
      url: "/api/broadcast/status",
      headers
    });
    assert.equal(invalidProtocolStatus.statusCode, 200);
    assert.equal(invalidProtocolStatus.json().configured, false);

    process.env.CORE_RPC_URL = "http://127.0.0.1:8332";
    process.env.CORE_RPC_USERNAME = "atlas_rpc_user";
    process.env.CORE_RPC_PASSWORD = "atlas_rpc_password";

    const rpcCalls: Array<{ body: { method: string; params: string[] }; auth: string | null }> = [];
    globalThis.fetch = (async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { method: string; params: string[] };
      rpcCalls.push({
        body,
        auth: init?.headers instanceof Headers ? init.headers.get("Authorization") : null
      });
      if (body.method === "getblockchaininfo") {
        return new Response(
          JSON.stringify({
            result: {
              chain: "main",
              blocks: 840_000,
              headers: 840_001,
              initialblockdownload: false
            }
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
      return new Response(JSON.stringify({ result: BROADCAST_TXID }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }) as typeof fetch;

    const reachableCoreStatus = await server.inject({
      method: "GET",
      url: "/api/broadcast/core/status",
      headers
    });
    assert.equal(reachableCoreStatus.statusCode, 200);
    assert.equal(reachableCoreStatus.json().enabled, true);
    assert.equal(reachableCoreStatus.json().backend, "core");
    assert.equal(reachableCoreStatus.json().configured, true);
    assert.equal(reachableCoreStatus.json().reachable, true);
    assert.equal(reachableCoreStatus.json().chain, "main");
    assert.equal(reachableCoreStatus.json().blocks, 840_000);
    assert.doesNotMatch(reachableCoreStatus.body, /atlas_rpc_password|atlas_rpc_user|127\.0\.0\.1/);

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          error: {
            code: -28,
            message: "loading block index atlas_rpc_password"
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )) as typeof fetch;

    const failingCoreStatus = await server.inject({
      method: "GET",
      url: "/api/broadcast/core/status",
      headers
    });
    assert.equal(failingCoreStatus.statusCode, 200);
    assert.equal(failingCoreStatus.json().enabled, true);
    assert.equal(failingCoreStatus.json().configured, true);
    assert.equal(failingCoreStatus.json().reachable, false);
    assert.equal(failingCoreStatus.json().message, "Bitcoin Core RPC status check failed.");
    assert.doesNotMatch(failingCoreStatus.body, /atlas_rpc_password|127\.0\.0\.1/);

    globalThis.fetch = (async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { method: string; params: string[] };
      rpcCalls.push({
        body,
        auth: init?.headers instanceof Headers ? init.headers.get("Authorization") : null
      });
      return new Response(JSON.stringify({ result: BROADCAST_TXID }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }) as typeof fetch;

    const validBroadcast = await server.inject({
      method: "POST",
      url: `/api/wallets/${wallet.id}/psbt/broadcast`,
      headers,
      payload: {
        psbtBase64: signedPsbt,
        txHex: "deadbeef",
        addressLimit: 100
      }
    });
    assert.equal(validBroadcast.statusCode, 200);
    assert.equal(validBroadcast.json().status, "broadcasted");
    assert.equal(validBroadcast.json().backend, "core");
    assert.equal(validBroadcast.json().txid, BROADCAST_TXID);
    assert.equal(rpcCalls.length, 2);
    assert.equal(rpcCalls[1].body.method, "sendrawtransaction");
    assert.notEqual(rpcCalls[1].body.params[0], "deadbeef");
    assert.match(rpcCalls[1].body.params[0], /^[0-9a-f]+$/i);
    assert.doesNotMatch(validBroadcast.body, /atlas_rpc_password|deadbeef/);

    const fetchCountAfterValid = rpcCalls.length;
    const unsignedBroadcast = await server.inject({
      method: "POST",
      url: `/api/wallets/${wallet.id}/psbt/broadcast`,
      headers,
      payload: { psbtBase64: unsignedPsbt }
    });
    assert.equal(unsignedBroadcast.statusCode, 409);
    assert.match(unsignedBroadcast.json().error, /warnings/i);
    assert.equal(rpcCalls.length, fetchCountAfterValid);

    const warningBroadcast = await server.inject({
      method: "POST",
      url: `/api/wallets/${wallet.id}/psbt/broadcast`,
      headers,
      payload: {
        psbtBase64: signedPsbt,
        expected: { feeSats: 1 }
      }
    });
    assert.equal(warningBroadcast.statusCode, 409);
    assert.match(warningBroadcast.json().error, /warnings/i);
    assert.equal(rpcCalls.length, fetchCountAfterValid);

    const invalidBroadcast = await server.inject({
      method: "POST",
      url: `/api/wallets/${wallet.id}/psbt/broadcast`,
      headers,
      payload: { psbtBase64: "not a psbt" }
    });
    assert.equal(invalidBroadcast.statusCode, 400);
    assert.match(invalidBroadcast.json().error, /invalid/i);
    assert.equal(rpcCalls.length, fetchCountAfterValid);

    const missingWalletBroadcast = await server.inject({
      method: "POST",
      url: "/api/wallets/wallet_missing/psbt/broadcast",
      headers,
      payload: { psbtBase64: signedPsbt }
    });
    assert.equal(missingWalletBroadcast.statusCode, 404);
    assert.equal(missingWalletBroadcast.json().error, "Wallet not found");
    assert.equal(rpcCalls.length, fetchCountAfterValid);

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          error: {
            code: -26,
            message: "min relay fee not met atlas_rpc_password"
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )) as typeof fetch;

    const rejectedBroadcast = await server.inject({
      method: "POST",
      url: `/api/wallets/${wallet.id}/psbt/broadcast`,
      headers,
      payload: { psbtBase64: signedPsbt }
    });
    assert.equal(rejectedBroadcast.statusCode, 502);
    assert.match(rejectedBroadcast.json().error, /rejected/i);
    assert.doesNotMatch(rejectedBroadcast.body, /atlas_rpc_password/);

    const leakedHex = "ab".repeat(120);
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          error: {
            code: -26,
            message: `bad transaction ${leakedHex} atlas_rpc_password`
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )) as typeof fetch;

    const hexLeakBroadcast = await server.inject({
      method: "POST",
      url: `/api/wallets/${wallet.id}/psbt/broadcast`,
      headers,
      payload: { psbtBase64: signedPsbt }
    });
    assert.equal(hexLeakBroadcast.statusCode, 502);
    assert.doesNotMatch(hexLeakBroadcast.body, new RegExp(leakedHex));
    assert.doesNotMatch(hexLeakBroadcast.body, /atlas_rpc_password/);
    assert.match(hexLeakBroadcast.body, /\[HEX-REDACTED\]/);

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          error: {
            code: -27,
            message: "transaction already in block chain"
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )) as typeof fetch;

    const alreadyKnownBroadcast = await server.inject({
      method: "POST",
      url: `/api/wallets/${wallet.id}/psbt/broadcast`,
      headers,
      payload: { psbtBase64: signedPsbt }
    });
    assert.equal(alreadyKnownBroadcast.statusCode, 409);
    assert.match(alreadyKnownBroadcast.json().error, /already.*known/i);

    store.lockVault();
    const lockedBroadcast = await server.inject({
      method: "POST",
      url: `/api/wallets/${wallet.id}/psbt/broadcast`,
      headers,
      payload: { psbtBase64: signedPsbt }
    });
    assert.equal(lockedBroadcast.statusCode, 423);
    assert.equal(lockedBroadcast.json().error, "Vault is locked");
  } finally {
    await server.close();
    globalThis.fetch = originalFetch;
    restoreEnv(originalEnv);
  }
});

function makeUnsignedPsbt(): bitcoin.Psbt {
  return makeP2wpkhPsbt(TEST_RECV_ADDR, 100_000, [
    { addr: EXTERNAL_ADDR, value: 90_000 }
  ]);
}

function makeSignedPsbt(): bitcoin.Psbt {
  const psbt = makeUnsignedPsbt();
  signAllInputs(psbt, recvNode);
  return psbt;
}

function makeP2wpkhPsbt(
  inputAddr: string,
  inputValue: number,
  outputs: Array<{ addr: string; value: number }>
): bitcoin.Psbt {
  const psbt = new bitcoin.Psbt({ network: BTC });
  const inputScript = bitcoin.address.toOutputScript(inputAddr, BTC);
  psbt.addInput({
    hash: FAKE_TXID,
    index: 0,
    witnessUtxo: { script: inputScript, value: BigInt(inputValue) }
  });
  for (const out of outputs) {
    psbt.addOutput({ address: out.addr, value: BigInt(out.value) });
  }
  return psbt;
}

function signAllInputs(psbt: bitcoin.Psbt, signerNode: ReturnType<typeof testAccountNode.derive>): void {
  const signer = {
    publicKey: Buffer.from(signerNode.publicKey),
    sign: (hash: Buffer): Buffer => Buffer.from(signerNode.sign(hash))
  };
  for (let i = 0; i < psbt.data.inputs.length; i++) {
    psbt.signInput(i, signer);
  }
}

function snapshotEnv(keys: string[]): Map<string, string | undefined> {
  return new Map(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot: Map<string, string | undefined>): void {
  for (const [key, value] of snapshot.entries()) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
