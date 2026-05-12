import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireAuthenticatedSession } from "../auth/guard.js";
import { getMempoolApiConfig } from "../mempool/usage.js";
import {
  InvalidWalletInputError,
  VaultAlreadyInitializedError,
  VaultLockedError,
  VaultNotInitializedError,
  WalletNotFoundError,
  addWallet,
  deleteWallet,
  deriveWalletAddresses,
  deriveWalletAddressUsage,
  deriveWalletBalance,
  deriveWalletNextReceiveAddress,
  getVaultStatus,
  getWalletTransactions,
  initVault,
  listWallets,
  lockVault,
  deleteAddressLabel,
  deleteTransactionLabel,
  unlockVault,
  updateWalletNotes,
  upsertAddressLabel,
  upsertTransactionLabel,
  updateWallet
} from "./store.js";
import {
  LabelValidationError,
  normalizeAddressLabelDeleteInput,
  normalizeAddressLabelInput,
  normalizeOptionalNotes,
  normalizeTransactionLabelDeleteInput,
  normalizeTransactionLabelInput
} from "./labels.js";
import type { BitcoinNetwork, ScriptType, SourceDevice } from "./types.js";

type VaultPasswordBody = {
  vaultPassword?: string;
};

type WalletCreateBody = {
  name?: string;
  extendedPublicKey?: string;
  importText?: string;
  sourceDevice?: string;
  scriptType?: string;
  network?: string;
  gapLimit?: number;
  notes?: string | null;
};

type WalletPatchBody = {
  name?: string;
  gapLimit?: number;
};

type WalletNotesBody = {
  notes?: unknown;
};

type AddressLabelBody = {
  chain?: unknown;
  index?: unknown;
  address?: unknown;
  label?: unknown;
  notes?: unknown;
};

type AddressLabelDeleteBody = {
  chain?: unknown;
  index?: unknown;
};

type TransactionLabelBody = {
  txid?: unknown;
  label?: unknown;
  notes?: unknown;
};

type TransactionLabelDeleteBody = {
  txid?: unknown;
};

type WalletAddressesQuery = {
  chain?: string;
  limit?: string;
};

type WalletTransactionsQuery = {
  chain?: string;
  addressLimit?: string;
  txLimit?: string;
};

export async function registerVaultRoutes(server: FastifyInstance): Promise<void> {
  server.post<{ Body: VaultPasswordBody }>("/api/vault/init", async (request, reply) => {
    if (!ensureAuthenticated(request, reply)) {
      return;
    }

    const vaultPassword = validateVaultPassword(request.body?.vaultPassword);
    if (!vaultPassword.ok) {
      return reply.code(400).send({ error: vaultPassword.error });
    }

    try {
      await initVault(vaultPassword.value);
      return reply.code(201).send(await getVaultStatus());
    } catch (error) {
      return handleVaultError(error, reply);
    }
  });

  server.post<{ Body: VaultPasswordBody }>("/api/vault/unlock", async (request, reply) => {
    if (!ensureAuthenticated(request, reply)) {
      return;
    }

    const vaultPassword = validateVaultPassword(request.body?.vaultPassword);
    if (!vaultPassword.ok) {
      return reply.code(400).send({ error: vaultPassword.error });
    }

    try {
      await unlockVault(vaultPassword.value);
      return reply.send(await getVaultStatus());
    } catch (error) {
      return handleVaultError(error, reply);
    }
  });

  server.post("/api/vault/lock", async (request, reply) => {
    if (!ensureAuthenticated(request, reply)) {
      return;
    }

    lockVault();
    return reply.send(await getVaultStatus());
  });

  server.get("/api/vault/status", async (request, reply) => {
    if (!ensureAuthenticated(request, reply)) {
      return;
    }

    return reply.send(await getVaultStatus());
  });

  server.get("/api/wallets", async (request, reply) => {
    if (!ensureAuthenticated(request, reply)) {
      return;
    }

    try {
      return reply.send({
        wallets: listWallets()
      });
    } catch (error) {
      return handleVaultError(error, reply);
    }
  });

  server.post<{ Body: WalletCreateBody }>("/api/wallets", async (request, reply) => {
    if (!ensureAuthenticated(request, reply)) {
      return;
    }

    const validation = validateCreateWalletBody(request.body);
    if (!validation.ok) {
      return reply.code(400).send({ error: validation.error });
    }

    try {
      const wallet = await addWallet(validation.value);
      return reply.code(201).send({ wallet });
    } catch (error) {
      return handleVaultError(error, reply);
    }
  });

  server.get<{ Querystring: WalletAddressesQuery; Params: { id: string } }>(
    "/api/wallets/:id/addresses",
    async (request, reply) => {
      if (!ensureAuthenticated(request, reply)) {
        return;
      }

      const validation = validateAddressesQuery(request.query);
      if (!validation.ok) {
        return reply.code(400).send({ error: validation.error });
      }

      try {
        const { wallet, result } = deriveWalletAddresses(request.params.id, validation.value);
        return reply.send({
          walletId: wallet.id,
          network: result.network,
          scriptType: result.scriptType,
          usageStatus: result.usageStatus,
          addresses: result.addresses
        });
      } catch (error) {
        return handleVaultError(error, reply);
      }
    }
  );

  server.get<{ Querystring: WalletAddressesQuery; Params: { id: string } }>(
    "/api/wallets/:id/address-usage",
    async (request, reply) => {
      if (!ensureAuthenticated(request, reply)) {
        return;
      }

      const validation = validateAddressesQuery(request.query);
      if (!validation.ok) {
        return reply.code(400).send({ error: validation.error });
      }

      try {
        const { wallet, result } = await deriveWalletAddressUsage(
          request.params.id,
          validation.value
        );
        const nextReceive =
          validation.value.chain === "receive" || validation.value.chain === "both"
            ? await deriveWalletNextReceiveAddress(request.params.id)
            : null;

        return reply.send({
          walletId: wallet.id,
          network: result.network,
          scriptType: result.scriptType,
          usageStatus: result.usageStatus,
          addresses: result.addresses,
          nextUnusedReceiveAddress:
            nextReceive?.result.nextUnusedReceiveAddress ?? null,
          discovery: nextReceive
            ? {
                checkedCount: nextReceive.result.checkedCount,
                gapLimit: nextReceive.result.gapLimit,
                maxDiscoveryLimit: nextReceive.result.maxDiscoveryLimit,
                complete: nextReceive.result.discoveryComplete
              }
            : null,
          mempool: {
            ...getMempoolApiConfig(),
            lookupFailed:
              result.lookupFailed || Boolean(nextReceive?.result.lookupFailed)
          },
          lookupError:
            result.lookupFailed || nextReceive?.result.lookupFailed
              ? "usage lookup failed"
              : null
        });
      } catch (error) {
        return handleVaultError(error, reply);
      }
    }
  );

  server.get<{ Params: { id: string } }>(
    "/api/wallets/:id/next-receive-address",
    async (request, reply) => {
      if (!ensureAuthenticated(request, reply)) {
        return;
      }

      try {
        const { wallet, result } = await deriveWalletNextReceiveAddress(request.params.id);
        return reply.send({
          walletId: wallet.id,
          network: result.network,
          scriptType: result.scriptType,
          nextUnusedReceiveAddress: result.nextUnusedReceiveAddress,
          discovery: {
            checkedCount: result.checkedCount,
            gapLimit: result.gapLimit,
            maxDiscoveryLimit: result.maxDiscoveryLimit,
            complete: result.discoveryComplete
          },
          mempool: {
            ...getMempoolApiConfig(),
            lookupFailed: result.lookupFailed
          },
          lookupError: result.lookupFailed ? "usage lookup failed" : null
        });
      } catch (error) {
        return handleVaultError(error, reply);
      }
    }
  );

  server.get<{ Querystring: WalletAddressesQuery; Params: { id: string } }>(
    "/api/wallets/:id/balance",
    async (request, reply) => {
      if (!ensureAuthenticated(request, reply)) {
        return;
      }

      const validation = validateAddressesQuery(request.query);
      if (!validation.ok) {
        return reply.code(400).send({ error: validation.error });
      }

      try {
        const { wallet, result } = await deriveWalletBalance(
          request.params.id,
          validation.value
        );
        const nextReceive =
          validation.value.chain === "receive" || validation.value.chain === "both"
            ? await deriveWalletNextReceiveAddress(request.params.id)
            : null;

        return reply.send({
          walletId: wallet.id,
          network: result.network,
          scriptType: result.scriptType,
          status: result.status,
          usageStatus: result.usageStatus,
          unit: "sats",
          confirmedBalance: result.balance.confirmedBalance,
          unconfirmedBalance: result.balance.unconfirmedBalance,
          totalBalance: result.balance.totalBalance,
          receiveBalance: result.receiveBalance,
          changeBalance: result.changeBalance,
          addresses: result.addresses,
          failedAddresses: result.failedAddresses,
          nextUnusedReceiveAddress:
            nextReceive?.result.nextUnusedReceiveAddress ?? null,
          discovery: nextReceive
            ? {
                checkedCount: nextReceive.result.checkedCount,
                gapLimit: nextReceive.result.gapLimit,
                maxDiscoveryLimit: nextReceive.result.maxDiscoveryLimit,
                complete: nextReceive.result.discoveryComplete
              }
            : null,
          mempool: {
            ...getMempoolApiConfig(),
            lookupFailed:
              result.lookupFailed || Boolean(nextReceive?.result.lookupFailed)
          },
          lookupError: result.lookupFailed ? "balance lookup failed" : null,
          nextReceiveLookupError: nextReceive?.result.lookupFailed
            ? "next receive lookup incomplete"
            : null
        });
      } catch (error) {
        return handleVaultError(error, reply);
      }
    }
  );

  server.get<{ Querystring: WalletTransactionsQuery; Params: { id: string } }>(
    "/api/wallets/:id/transactions",
    async (request, reply) => {
      if (!ensureAuthenticated(request, reply)) {
        return;
      }

      const validation = validateTransactionsQuery(request.query);
      if (!validation.ok) {
        return reply.code(400).send({ error: validation.error });
      }

      try {
        const { wallet, result } = await getWalletTransactions(
          request.params.id,
          validation.value
        );
        return reply.send({
          walletId: wallet.id,
          status: result.status,
          transactions: result.transactions,
          failedAddresses: result.failedAddresses,
          mempool: getMempoolApiConfig()
        });
      } catch (error) {
        return handleVaultError(error, reply);
      }
    }
  );

  server.patch<{ Body: WalletPatchBody; Params: { id: string } }>(
    "/api/wallets/:id",
    async (request, reply) => {
      if (!ensureAuthenticated(request, reply)) {
        return;
      }

      const validation = validatePatchWalletBody(request.body);
      if (!validation.ok) {
        return reply.code(400).send({ error: validation.error });
      }

      try {
        const wallet = await updateWallet(request.params.id, validation.value);
        return reply.send({ wallet });
      } catch (error) {
        return handleVaultError(error, reply);
      }
    }
  );

  server.patch<{ Body: WalletNotesBody; Params: { id: string } }>(
    "/api/wallets/:id/notes",
    async (request, reply) => {
      if (!ensureAuthenticated(request, reply)) {
        return;
      }

      const validation = validateWalletNotesBody(request.body);
      if (!validation.ok) {
        return reply.code(400).send({ error: validation.error });
      }

      try {
        const wallet = await updateWalletNotes(request.params.id, validation.value.notes);
        return reply.send({ wallet });
      } catch (error) {
        return handleVaultError(error, reply);
      }
    }
  );

  server.patch<{ Body: AddressLabelBody; Params: { id: string } }>(
    "/api/wallets/:id/address-labels",
    async (request, reply) => {
      if (!ensureAuthenticated(request, reply)) {
        return;
      }

      const validation = validateAddressLabelBody(request.body);
      if (!validation.ok) {
        return reply.code(400).send({ error: validation.error });
      }

      try {
        const wallet = await upsertAddressLabel(request.params.id, validation.value);
        return reply.send({ wallet });
      } catch (error) {
        return handleVaultError(error, reply);
      }
    }
  );

  server.delete<{ Body: AddressLabelDeleteBody; Params: { id: string } }>(
    "/api/wallets/:id/address-labels",
    async (request, reply) => {
      if (!ensureAuthenticated(request, reply)) {
        return;
      }

      const validation = validateAddressLabelDeleteBody(request.body);
      if (!validation.ok) {
        return reply.code(400).send({ error: validation.error });
      }

      try {
        const wallet = await deleteAddressLabel(request.params.id, validation.value);
        return reply.send({ wallet });
      } catch (error) {
        return handleVaultError(error, reply);
      }
    }
  );

  server.patch<{ Body: TransactionLabelBody; Params: { id: string } }>(
    "/api/wallets/:id/transaction-labels",
    async (request, reply) => {
      if (!ensureAuthenticated(request, reply)) {
        return;
      }

      const validation = validateTransactionLabelBody(request.body);
      if (!validation.ok) {
        return reply.code(400).send({ error: validation.error });
      }

      try {
        const wallet = await upsertTransactionLabel(request.params.id, validation.value);
        return reply.send({ wallet });
      } catch (error) {
        return handleVaultError(error, reply);
      }
    }
  );

  server.delete<{ Body: TransactionLabelDeleteBody; Params: { id: string } }>(
    "/api/wallets/:id/transaction-labels",
    async (request, reply) => {
      if (!ensureAuthenticated(request, reply)) {
        return;
      }

      const validation = validateTransactionLabelDeleteBody(request.body);
      if (!validation.ok) {
        return reply.code(400).send({ error: validation.error });
      }

      try {
        const wallet = await deleteTransactionLabel(request.params.id, validation.value);
        return reply.send({ wallet });
      } catch (error) {
        return handleVaultError(error, reply);
      }
    }
  );

  server.delete<{ Params: { id: string } }>("/api/wallets/:id", async (request, reply) => {
    if (!ensureAuthenticated(request, reply)) {
      return;
    }

    try {
      await deleteWallet(request.params.id);
      return reply.code(204).send();
    } catch (error) {
      return handleVaultError(error, reply);
    }
  });
}

function ensureAuthenticated(request: FastifyRequest, reply: FastifyReply): boolean {
  return Boolean(requireAuthenticatedSession(request, reply));
}

function validateCreateWalletBody(body: WalletCreateBody | undefined):
  | {
      ok: true;
      value: {
        name: string;
        importText: string;
        network: BitcoinNetwork;
        sourceDevice: SourceDevice;
        scriptType: ScriptType;
        notes: string | null;
        gapLimit: number;
      };
    }
  | { ok: false; error: string } {
  const name = sanitizeWalletName(body?.name);
  if (!name) {
    return { ok: false, error: "Wallet name must be 1-80 characters" };
  }

  const importText = sanitizeImportText(body?.importText ?? body?.extendedPublicKey);
  if (!importText) {
    return { ok: false, error: "Import text must contain an xpub, descriptor, key expression, JSON, or UR payload" };
  }

  const network = sanitizeNetwork(body?.network);
  if (!network) {
    return { ok: false, error: "Network must be mainnet, testnet, or signet" };
  }

  const gapLimit = sanitizeGapLimit(body?.gapLimit);
  if (!gapLimit) {
    return { ok: false, error: "Gap limit must be an integer from 1 to 200" };
  }

  const sourceDevice = sanitizeSourceDevice(body?.sourceDevice);
  const scriptType = sanitizeScriptType(body?.scriptType);

  return {
    ok: true,
    value: {
      name,
      importText,
      network,
      sourceDevice,
      scriptType,
      notes: sanitizeNotes(body?.notes),
      gapLimit
    }
  };
}

function validatePatchWalletBody(body: WalletPatchBody | undefined):
  | {
      ok: true;
      value: {
        name?: string;
        gapLimit?: number;
      };
    }
  | { ok: false; error: string } {
  const value: { name?: string; gapLimit?: number } = {};

  if (body?.name !== undefined) {
    const name = sanitizeWalletName(body.name);
    if (!name) {
      return { ok: false, error: "Wallet name must be 1-80 characters" };
    }
    value.name = name;
  }

  if (body?.gapLimit !== undefined) {
    const gapLimit = sanitizeGapLimit(body.gapLimit);
    if (!gapLimit) {
      return { ok: false, error: "Gap limit must be an integer from 1 to 200" };
    }
    value.gapLimit = gapLimit;
  }

  if (value.name === undefined && value.gapLimit === undefined) {
    return { ok: false, error: "No supported wallet fields were provided" };
  }

  return { ok: true, value };
}

function validateAddressesQuery(query: WalletAddressesQuery):
  | { ok: true; value: { chain: "receive" | "change" | "both"; limit: number } }
  | { ok: false; error: string } {
  const chain = query.chain ?? "both";
  if (chain !== "receive" && chain !== "change" && chain !== "both") {
    return { ok: false, error: "Address chain must be receive, change, or both" };
  }

  const parsedLimit = query.limit === undefined ? 20 : Number(query.limit);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 200) {
    return { ok: false, error: "Address limit must be an integer from 1 to 200" };
  }

  return {
    ok: true,
    value: {
      chain,
      limit: parsedLimit
    }
  };
}

function validateTransactionsQuery(query: WalletTransactionsQuery):
  | {
      ok: true;
      value: {
        chain: "receive" | "change" | "both";
        addressLimit: number;
        txLimit: number;
      };
    }
  | { ok: false; error: string } {
  const chain = query.chain ?? "both";
  if (chain !== "receive" && chain !== "change" && chain !== "both") {
    return { ok: false, error: "Address chain must be receive, change, or both" };
  }

  const parsedAddressLimit = query.addressLimit === undefined ? 20 : Number(query.addressLimit);
  if (!Number.isInteger(parsedAddressLimit) || parsedAddressLimit < 1 || parsedAddressLimit > 100) {
    return { ok: false, error: "Address limit must be an integer from 1 to 100" };
  }

  const parsedTxLimit = query.txLimit === undefined ? 50 : Number(query.txLimit);
  if (!Number.isInteger(parsedTxLimit) || parsedTxLimit < 1 || parsedTxLimit > 200) {
    return { ok: false, error: "Transaction limit must be an integer from 1 to 200" };
  }

  return {
    ok: true,
    value: {
      chain,
      addressLimit: parsedAddressLimit,
      txLimit: parsedTxLimit
    }
  };
}

function validateWalletNotesBody(body: WalletNotesBody | undefined):
  | { ok: true; value: { notes: string | null } }
  | { ok: false; error: string } {
  try {
    return {
      ok: true,
      value: {
        notes: normalizeOptionalNotes(body?.notes)
      }
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid wallet notes"
    };
  }
}

function validateAddressLabelBody(body: AddressLabelBody | undefined):
  | {
      ok: true;
      value: {
        chain: "receive" | "change";
        index: number;
        address: string;
        label: string;
        notes: string | null;
      };
    }
  | { ok: false; error: string } {
  try {
    return { ok: true, value: normalizeAddressLabelInput(body ?? {}) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid address label"
    };
  }
}

function validateAddressLabelDeleteBody(body: AddressLabelDeleteBody | undefined):
  | { ok: true; value: { chain: "receive" | "change"; index: number } }
  | { ok: false; error: string } {
  try {
    return { ok: true, value: normalizeAddressLabelDeleteInput(body ?? {}) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid address label delete request"
    };
  }
}

function validateTransactionLabelBody(body: TransactionLabelBody | undefined):
  | {
      ok: true;
      value: {
        txid: string;
        label: string;
        notes: string | null;
      };
    }
  | { ok: false; error: string } {
  try {
    return { ok: true, value: normalizeTransactionLabelInput(body ?? {}) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid transaction label"
    };
  }
}

function validateTransactionLabelDeleteBody(body: TransactionLabelDeleteBody | undefined):
  | { ok: true; value: { txid: string } }
  | { ok: false; error: string } {
  try {
    return { ok: true, value: normalizeTransactionLabelDeleteInput(body ?? {}) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid transaction label delete request"
    };
  }
}

function validateVaultPassword(value: unknown):
  | { ok: true; value: string }
  | { ok: false; error: string } {
  if (typeof value !== "string" || value.length < 12) {
    return { ok: false, error: "Vault password must be at least 12 characters" };
  }

  return { ok: true, value };
}

function sanitizeWalletName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= 80 ? trimmed : null;
}

function sanitizeImportText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length < 8 || trimmed.length > 12000) {
    return null;
  }

  return trimmed;
}

function sanitizeNetwork(value: unknown): BitcoinNetwork | null {
  return value === "mainnet" || value === "testnet" || value === "signet" ? value : null;
}

function sanitizeSourceDevice(value: unknown): SourceDevice {
  const sourceDevice = typeof value === "string" ? value : "other";
  const allowed: SourceDevice[] = [
    "coldcard", "keystone", "seedsigner", "krux", "passport-core", "jade", "other"
  ];
  return allowed.includes(sourceDevice as SourceDevice) ? sourceDevice as SourceDevice : "other";
}

function sanitizeScriptType(value: unknown): ScriptType {
  const scriptType = typeof value === "string" ? value : "unknown";
  const allowed: ScriptType[] = ["legacy", "nested-segwit", "native-segwit", "taproot", "unknown"];
  return allowed.includes(scriptType as ScriptType) ? scriptType as ScriptType : "unknown";
}

function sanitizeNotes(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 500) : null;
}

function sanitizeGapLimit(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 200) {
    return null;
  }

  return value;
}

function handleVaultError(error: unknown, reply: FastifyReply) {
  if (error instanceof VaultAlreadyInitializedError) {
    return reply.code(409).send({ error: "Vault is already initialized" });
  }

  if (error instanceof VaultNotInitializedError) {
    return reply.code(404).send({ error: "Vault is not initialized" });
  }

  if (error instanceof VaultLockedError) {
    return reply.code(423).send({ error: "Vault is locked" });
  }

  if (error instanceof WalletNotFoundError) {
    return reply.code(404).send({ error: "Wallet not found" });
  }

  if (error instanceof InvalidWalletInputError) {
    return reply.code(400).send({ error: error.message });
  }

  if (error instanceof LabelValidationError) {
    return reply.code(400).send({ error: error.message });
  }

  if (error instanceof Error && /Unsupported state|authenticate|bad decrypt|Invalid vault/.test(error.message)) {
    return reply.code(401).send({ error: "Invalid vault password" });
  }

  throw error;
}
