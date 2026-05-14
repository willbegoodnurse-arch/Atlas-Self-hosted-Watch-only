import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { InvalidPsbtError } from "../psbt/verify.js";
import {
  VaultLockedError,
  WalletNotFoundError,
  verifyPsbt
} from "../vault/store.js";
import {
  BroadcastError,
  broadcastTransaction,
  getBroadcastStatus,
  getCoreRpcDiagnosticStatus
} from "./index.js";

type AuthGuard = (request: FastifyRequest, reply: FastifyReply) => unknown;

type BroadcastPsbtBody = {
  psbtBase64?: string;
  txHex?: unknown;
  expected?: {
    recipientAddress?: string;
    amountSats?: number;
    changeAddress?: string | null;
    feeSats?: number;
  };
  addressLimit?: number;
};

export async function registerBroadcastRoutes(
  server: FastifyInstance,
  requireSession: AuthGuard
): Promise<void> {
  server.get("/api/broadcast/status", async (request, reply) => {
    if (!requireSession(request, reply)) {
      return;
    }
    return reply.send(getBroadcastStatus());
  });

  server.get("/api/broadcast/core/status", async (request, reply) => {
    if (!requireSession(request, reply)) {
      return;
    }
    return reply.send(await getCoreRpcDiagnosticStatus());
  });

  server.post<{ Body: BroadcastPsbtBody; Params: { id: string } }>(
    "/api/wallets/:id/psbt/broadcast",
    async (request, reply) => {
      if (!requireSession(request, reply)) {
        return;
      }

      const validation = validateBroadcastBody(request.body);
      if (!validation.ok) {
        return reply.code(400).send({ error: validation.error });
      }

      try {
        const result = await verifyPsbt(request.params.id, validation.value);

        if (result.status === "invalid") {
          return reply.code(400).send({
            error: "Broadcast blocked because the signed PSBT is invalid.",
            errors: result.errors
          });
        }

        if (result.status === "warning") {
          return reply.code(409).send({
            error: "Broadcast blocked because the signed PSBT has warnings.",
            warnings: result.warnings
          });
        }

        if (!result.extractable || !result.txHex) {
          return reply.code(400).send({
            error: "Broadcast unavailable because no extractable transaction hex was produced."
          });
        }

        const broadcast = await broadcastTransaction(result.txHex);
        request.log.info(
          { walletId: request.params.id, backend: broadcast.backend, txid: broadcast.txid },
          "signed transaction broadcast"
        );

        return reply.send({
          status: "broadcasted",
          backend: broadcast.backend,
          txid: broadcast.txid
        });
      } catch (error) {
        return handleBroadcastRouteError(error, reply);
      }
    }
  );
}

function validateBroadcastBody(body: BroadcastPsbtBody | undefined):
  | {
      ok: true;
      value: {
        psbtBase64: string;
        expected?: {
          recipientAddress?: string;
          amountSats?: number;
          changeAddress?: string | null;
          feeSats?: number;
        };
        addressLimit: number;
      };
    }
  | { ok: false; error: string } {
  const psbtBase64 = body?.psbtBase64;
  if (typeof psbtBase64 !== "string" || psbtBase64.trim().length === 0) {
    return { ok: false, error: "psbtBase64 is required" };
  }

  const rawLimit = body?.addressLimit;
  const addressLimit = rawLimit === undefined ? 100 : rawLimit;
  if (!Number.isInteger(addressLimit) || addressLimit < 1 || addressLimit > 200) {
    return { ok: false, error: "addressLimit must be an integer from 1 to 200" };
  }

  const expected = body?.expected;
  if (expected !== undefined && expected !== null) {
    if (expected.recipientAddress !== undefined && typeof expected.recipientAddress !== "string") {
      return { ok: false, error: "expected.recipientAddress must be a string" };
    }
    if (
      expected.amountSats !== undefined &&
      (!Number.isInteger(expected.amountSats) || expected.amountSats < 1)
    ) {
      return { ok: false, error: "expected.amountSats must be a positive integer" };
    }
    if (
      expected.changeAddress !== undefined &&
      expected.changeAddress !== null &&
      typeof expected.changeAddress !== "string"
    ) {
      return { ok: false, error: "expected.changeAddress must be a string or null" };
    }
    if (
      expected.feeSats !== undefined &&
      (!Number.isInteger(expected.feeSats) || expected.feeSats < 0)
    ) {
      return { ok: false, error: "expected.feeSats must be a non-negative integer" };
    }
  }

  return {
    ok: true,
    value: {
      psbtBase64: psbtBase64.trim(),
      expected: expected
        ? {
            recipientAddress: expected.recipientAddress,
            amountSats: expected.amountSats,
            changeAddress: expected.changeAddress,
            feeSats: expected.feeSats
          }
        : undefined,
      addressLimit
    }
  };
}

function handleBroadcastRouteError(error: unknown, reply: FastifyReply) {
  if (error instanceof VaultLockedError) {
    return reply.code(423).send({ error: "Vault is locked" });
  }

  if (error instanceof WalletNotFoundError) {
    return reply.code(404).send({ error: "Wallet not found" });
  }

  if (error instanceof InvalidPsbtError) {
    return reply.code(400).send({
      error: "Broadcast blocked because the signed PSBT is invalid.",
      errors: [error.message]
    });
  }

  if (error instanceof BroadcastError) {
    const statusCode =
      error.kind === "disabled" || error.kind === "missing-config" || error.kind === "unavailable"
        ? 503
        : error.kind === "already-known"
          ? 409
          : 502;

    return reply.code(statusCode).send({
      error: error.message,
      rpcCode: error.rpcCode,
      rpcMessage: error.rpcMessage
    });
  }

  throw error;
}
