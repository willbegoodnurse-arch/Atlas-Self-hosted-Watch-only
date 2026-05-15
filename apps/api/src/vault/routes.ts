import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { deriveAddresses } from "@watch-wallet/bitcoin";
import { requireAuthenticatedSession } from "../auth/guard.js";
import { getMempoolApiConfig } from "../mempool/usage.js";
import {
  InvalidWalletInputError,
  VaultAlreadyInitializedError,
  VaultLockedError,
  VaultNotInitializedError,
  WalletNotFoundError,
  addWallet,
  createPsbt,
  verifyPsbt,
  deleteWallet,
  deriveWalletAddresses,
  deriveWalletAddressUsage,
  deriveWalletBalance,
  deriveWalletNextReceiveAddress,
  getVaultStatus,
  getWalletTransactions,
  getWalletUtxos,
  initVault,
  listWallets,
  lockVault,
  deleteAddressLabel,
  deleteTransactionLabel,
  deleteUtxoNote,
  unlockVault,
  updateWalletNotes,
  upsertAddressLabel,
  upsertTransactionLabel,
  upsertUtxoNote,
  updateWallet
} from "./store.js";
import {
  LabelValidationError,
  normalizeAddressLabelDeleteInput,
  normalizeAddressLabelInput,
  normalizeOptionalNotes,
  normalizeTransactionLabelDeleteInput,
  normalizeTransactionLabelInput,
  normalizeUtxoNoteInput
} from "./labels.js";
import type { BitcoinNetwork, ScriptType, SourceDevice } from "./types.js";
import { parseWalletImport } from "./import-parser.js";
import {
  InsufficientFundsError,
  InvalidPsbtParamsError,
  UnsupportedScriptTypeError
} from "../psbt/build.js";
import { InvalidPsbtError } from "../psbt/verify.js";
import { redactSensitive, serializeWallet } from "./redact.js";

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

type WalletImportPreviewBody = {
  extendedPublicKey?: string;
  importText?: string;
  sourceDevice?: string;
  scriptType?: string;
  network?: string;
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

type UtxoNoteBody = {
  txid?: unknown;
  vout?: unknown;
  note?: unknown;
};

type WalletAddressesQuery = {
  chain?: string;
  limit?: string;
};

type WalletTransactionsQuery = {
  chain?: string;
  addressLimit?: string;
  txLimit?: string;
  pages?: string;
};

type WalletUtxosQuery = {
  chain?: string;
  addressLimit?: string;
  includeUnconfirmed?: string;
};

type CreatePsbtBody = {
  recipientAddress?: string;
  amountSats?: number;
  recipients?: Array<{
    address?: unknown;
    amountSats?: unknown;
  }>;
  feeRateSatsPerVbyte?: number;
  selectedUtxos?: Array<{
    txid?: unknown;
    vout?: unknown;
  }>;
  addressLimit?: number;
};

type VerifyPsbtBody = {
  psbtBase64?: string;
  expected?: {
    recipientAddress?: string;
    amountSats?: number;
    changeAddress?: string | null;
    feeSats?: number;
  };
  addressLimit?: number;
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
        wallets: listWallets().map(serializeWallet)
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
      return reply.code(201).send({ wallet: serializeWallet(wallet) });
    } catch (error) {
      return handleVaultError(error, reply);
    }
  });

  server.post<{ Body: WalletImportPreviewBody }>("/api/wallets/import-preview", async (request, reply) => {
    if (!ensureAuthenticated(request, reply)) {
      return;
    }

    const validation = validateWalletImportPreviewBody(request.body);
    if (!validation.ok) {
      return reply.code(400).send({ error: validation.error });
    }

    try {
      const parsed = parseWalletImport(validation.value);
      if (!parsed.extendedPublicKey) {
        return reply.code(400).send({
          error: parsed.unsupportedReason ?? "Import text did not contain a supported watch-only extended public key"
        });
      }

      const scriptType = derivablePreviewScriptType(parsed.scriptType);
      const firstReceive = deriveAddresses({
        extendedPublicKey: parsed.extendedPublicKey,
        type: parsed.type ?? undefined,
        scriptType,
        accountPath: parsed.accountPath,
        network: parsed.network,
        chain: "receive",
        limit: 1
      }).addresses[0];

      if (!firstReceive) {
        return reply.code(400).send({
          error: "First receive address could not be derived. Verify key prefix, network, script type, and account path."
        });
      }

      return reply.send({
        keyType: parsed.type,
        network: parsed.network,
        scriptType: parsed.scriptType,
        accountPath: parsed.accountPath,
        masterFingerprint: parsed.masterFingerprint,
        importFormat: parsed.importFormat,
        firstReceiveAddress: firstReceive.address,
        firstReceivePath: firstReceive.path,
        warnings: parsed.warnings
      });
    } catch (error) {
      if (error instanceof Error && error.message === "This is a watch-only wallet. Private keys or seed phrases must never be imported.") {
        return reply.code(400).send({ error: error.message });
      }
      if (error instanceof InvalidWalletInputError) {
        return reply.code(400).send({ error: redactSensitive(error.message) });
      }

      return reply.code(400).send({
        error: "First receive address could not be derived. Verify key prefix, network, script type, and account path."
      });
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
          chain: validation.value.chain,
          addressLimit: validation.value.addressLimit,
          txLimit: validation.value.txLimit,
          pages: validation.value.pages,
          status: result.status,
          transactions: result.transactions,
          failedAddresses: result.failedAddresses,
          scanSummary: result.scanSummary,
          mempool: getMempoolApiConfig()
        });
      } catch (error) {
        return handleVaultError(error, reply);
      }
    }
  );

  server.get<{ Querystring: WalletUtxosQuery; Params: { id: string } }>(
    "/api/wallets/:id/utxos",
    async (request, reply) => {
      if (!ensureAuthenticated(request, reply)) {
        return;
      }

      const validation = validateUtxosQuery(request.query);
      if (!validation.ok) {
        return reply.code(400).send({ error: validation.error });
      }

      try {
        const { wallet, result } = await getWalletUtxos(
          request.params.id,
          validation.value
        );
        return reply.send({
          walletId: wallet.id,
          chain: validation.value.chain,
          addressLimit: validation.value.addressLimit,
          includeUnconfirmed: validation.value.includeUnconfirmed,
          unit: "sats",
          status: result.status,
          utxos: result.utxos,
          summary: result.summary,
          failedAddresses: result.failedAddresses,
          mempool: getMempoolApiConfig()
        });
      } catch (error) {
        return handleVaultError(error, reply);
      }
    }
  );

  server.post<{ Body: CreatePsbtBody; Params: { id: string } }>(
    "/api/wallets/:id/psbt",
    async (request, reply) => {
      if (!ensureAuthenticated(request, reply)) {
        return;
      }

      const validation = validateCreatePsbtBody(request.body);
      if (!validation.ok) {
        return reply.code(400).send({ error: validation.error });
      }

      try {
        const result = await createPsbt(request.params.id, validation.value);
        return reply.send(result);
      } catch (error) {
        return handleVaultError(error, reply);
      }
    }
  );

  server.post<{ Body: VerifyPsbtBody; Params: { id: string } }>(
    "/api/wallets/:id/psbt/verify",
    async (request, reply) => {
      if (!ensureAuthenticated(request, reply)) {
        return;
      }

      const validation = validateVerifyPsbtBody(request.body);
      if (!validation.ok) {
        return reply.code(400).send({ error: validation.error });
      }

      try {
        const result = await verifyPsbt(request.params.id, validation.value);
        return reply.send(result);
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
        return reply.send({ wallet: serializeWallet(wallet) });
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
        return reply.send({ wallet: serializeWallet(wallet) });
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
        return reply.send({ wallet: serializeWallet(wallet) });
      } catch (error) {
        return handleVaultError(error, reply);
      }
    }
  );

  server.patch<{ Body: AddressLabelBody; Params: { id: string } }>(
    "/api/wallets/:id/labels/address",
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
        return reply.send({ wallet: serializeWallet(wallet) });
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
        return reply.send({ wallet: serializeWallet(wallet) });
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
        return reply.send({ wallet: serializeWallet(wallet) });
      } catch (error) {
        return handleVaultError(error, reply);
      }
    }
  );

  server.patch<{ Body: UtxoNoteBody; Params: { id: string } }>(
    "/api/wallets/:id/labels/utxo",
    async (request, reply) => {
      if (!ensureAuthenticated(request, reply)) {
        return;
      }

      const validation = validateUtxoNoteBody(request.body);
      if (!validation.ok) {
        return reply.code(400).send({ error: validation.error });
      }

      try {
        const wallet = await upsertUtxoNote(request.params.id, validation.value);
        return reply.send({ wallet: serializeWallet(wallet) });
      } catch (error) {
        return handleVaultError(error, reply);
      }
    }
  );

  server.delete<{ Body: UtxoNoteBody; Params: { id: string } }>(
    "/api/wallets/:id/labels/utxo",
    async (request, reply) => {
      if (!ensureAuthenticated(request, reply)) {
        return;
      }

      const validation = validateUtxoNoteBody({ ...request.body, note: null });
      if (!validation.ok) {
        return reply.code(400).send({ error: validation.error });
      }

      try {
        const wallet = await deleteUtxoNote(request.params.id, validation.value);
        return reply.send({ wallet: serializeWallet(wallet) });
      } catch (error) {
        return handleVaultError(error, reply);
      }
    }
  );

  server.patch<{ Body: TransactionLabelBody; Params: { id: string } }>(
    "/api/wallets/:id/labels/transaction",
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
        return reply.send({ wallet: serializeWallet(wallet) });
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
        return reply.send({ wallet: serializeWallet(wallet) });
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

  server.get<{ Params: { id: string } }>(
    "/api/wallets/:id/xpub",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      if (!ensureAuthenticated(request, reply)) {
        return;
      }

      try {
        const wallets = listWallets();
        const wallet = wallets.find((w) => w.id === request.params.id);
        if (!wallet) return reply.code(404).send({ error: "Wallet not found" });
        request.log.info({ walletId: wallet.id, event: "xpub_reveal" }, "xpub reveal requested");
        return reply.send({
          walletId: wallet.id,
          extendedPublicKey: wallet.extendedPublicKey,
          type: wallet.type,
          network: wallet.network,
          warning:
            "This is your extended public key. Keep it private. Anyone with this key can see your full wallet history and addresses."
        });
      } catch (error) {
        return handleVaultError(error, reply);
      }
    }
  );
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

function validateWalletImportPreviewBody(body: WalletImportPreviewBody | undefined):
  | {
      ok: true;
      value: {
        importText: string;
        network: BitcoinNetwork;
        sourceDevice: SourceDevice;
        scriptType: ScriptType;
      };
    }
  | { ok: false; error: string } {
  const importText = sanitizeImportText(body?.importText ?? body?.extendedPublicKey);
  if (!importText) {
    return { ok: false, error: "Import text must contain an xpub, descriptor, key expression, JSON, or UR payload" };
  }

  const network = sanitizeNetwork(body?.network);
  if (!network) {
    return { ok: false, error: "Network must be mainnet, testnet, or signet" };
  }

  return {
    ok: true,
    value: {
      importText,
      network,
      sourceDevice: sanitizeSourceDevice(body?.sourceDevice),
      scriptType: sanitizeScriptType(body?.scriptType)
    }
  };
}

function derivablePreviewScriptType(scriptType: ScriptType): "legacy" | "nested-segwit" | "native-segwit" | "taproot" {
  if (
    scriptType !== "legacy" &&
    scriptType !== "nested-segwit" &&
    scriptType !== "native-segwit" &&
    scriptType !== "taproot"
  ) {
    throw new InvalidWalletInputError(
      "Script type is unknown; choose legacy, nested SegWit, native SegWit, or taproot before deriving addresses."
    );
  }
  return scriptType;
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
        pages: number;
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
  if (!Number.isInteger(parsedTxLimit) || parsedTxLimit < 1 || parsedTxLimit > 300) {
    return { ok: false, error: "Transaction limit must be an integer from 1 to 300" };
  }

  const parsedPages = query.pages === undefined ? 1 : Number(query.pages);
  if (!Number.isInteger(parsedPages) || parsedPages < 1 || parsedPages > 3) {
    return { ok: false, error: "Pages must be an integer from 1 to 3" };
  }

  return {
    ok: true,
    value: {
      chain,
      addressLimit: parsedAddressLimit,
      txLimit: parsedTxLimit,
      pages: parsedPages
    }
  };
}

function validateUtxosQuery(query: WalletUtxosQuery):
  | {
      ok: true;
      value: {
        chain: "receive" | "change" | "both";
        addressLimit: number;
        includeUnconfirmed: boolean;
      };
    }
  | { ok: false; error: string } {
  const chain = query.chain ?? "both";
  if (chain !== "receive" && chain !== "change" && chain !== "both") {
    return { ok: false, error: "Address chain must be receive, change, or both" };
  }

  const parsedLimit = query.addressLimit === undefined ? 20 : Number(query.addressLimit);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    return { ok: false, error: "Address limit must be an integer from 1 to 100" };
  }

  const includeUnconfirmed = query.includeUnconfirmed === "false" ? false : true;

  return {
    ok: true,
    value: { chain, addressLimit: parsedLimit, includeUnconfirmed }
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

function validateUtxoNoteBody(body: UtxoNoteBody | undefined):
  | {
      ok: true;
      value: {
        txid: string;
        vout: number;
        note: string | null;
      };
    }
  | { ok: false; error: string } {
  try {
    return { ok: true, value: normalizeUtxoNoteInput(body ?? {}) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid UTXO note"
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
    return reply.code(400).send({ error: redactSensitive(error.message) });
  }

  if (error instanceof LabelValidationError) {
    return reply.code(400).send({ error: redactSensitive(error.message) });
  }

  if (error instanceof InvalidPsbtParamsError || error instanceof UnsupportedScriptTypeError) {
    return reply.code(400).send({ error: redactSensitive(error.message) });
  }

  if (error instanceof InsufficientFundsError) {
    return reply.code(422).send({ error: redactSensitive(error.message) });
  }

  if (error instanceof InvalidPsbtError) {
    return reply.code(400).send({ error: redactSensitive(error.message) });
  }

  if (error instanceof Error && /Unsupported state|authenticate|bad decrypt|Invalid vault/.test(error.message)) {
    return reply.code(401).send({ error: "Invalid vault password" });
  }

  throw error;
}

function validateVerifyPsbtBody(body: VerifyPsbtBody | undefined):
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

function validateCreatePsbtBody(body: CreatePsbtBody | undefined):
  | {
      ok: true;
      value: {
        recipientAddress?: string;
        amountSats?: number;
        recipients?: Array<{
          address: string;
          amountSats: number;
        }>;
        feeRateSatsPerVbyte: number;
        selectedUtxos?: Array<{
          txid: string;
          vout: number;
        }>;
        addressLimit: number;
      };
    }
  | { ok: false; error: string } {
  const feeRateSatsPerVbyte = body?.feeRateSatsPerVbyte;
  if (
    typeof feeRateSatsPerVbyte !== "number" ||
    !Number.isFinite(feeRateSatsPerVbyte) ||
    feeRateSatsPerVbyte < 1 ||
    feeRateSatsPerVbyte > 1000
  ) {
    return { ok: false, error: "feeRateSatsPerVbyte must be a number from 1 to 1000" };
  }

  const recipientsValidation = validatePsbtRecipients(body);
  if (!recipientsValidation.ok) {
    return recipientsValidation;
  }

  const selectedUtxosValidation = validateSelectedUtxos(body?.selectedUtxos);
  if (!selectedUtxosValidation.ok) {
    return selectedUtxosValidation;
  }

  const rawLimit = body?.addressLimit;
  const addressLimit = rawLimit === undefined ? 20 : rawLimit;
  if (!Number.isInteger(addressLimit) || addressLimit < 1 || addressLimit > 100) {
    return { ok: false, error: "addressLimit must be an integer from 1 to 100" };
  }

  return {
    ok: true,
    value: {
      ...recipientsValidation.value,
      feeRateSatsPerVbyte,
      selectedUtxos: selectedUtxosValidation.value,
      addressLimit
    }
  };
}

function validatePsbtRecipients(body: CreatePsbtBody | undefined):
  | {
      ok: true;
      value: {
        recipientAddress?: string;
        amountSats?: number;
        recipients?: Array<{ address: string; amountSats: number }>;
      };
    }
  | { ok: false; error: string } {
  if (Array.isArray(body?.recipients)) {
    if (body.recipients.length === 0) {
      return { ok: false, error: "At least one recipient output is required" };
    }
    if (body.recipients.length > 10) {
      return { ok: false, error: "At most 10 recipient outputs are supported" };
    }

    const recipients = [];
    for (const recipient of body.recipients) {
      if (typeof recipient.address !== "string" || recipient.address.trim().length === 0) {
        return { ok: false, error: "recipient address is required" };
      }
      if (typeof recipient.amountSats !== "number" || !Number.isInteger(recipient.amountSats) || recipient.amountSats < 1) {
        return { ok: false, error: "recipient amountSats must be a positive integer" };
      }
      recipients.push({
        address: recipient.address.trim(),
        amountSats: recipient.amountSats
      });
    }
    return { ok: true, value: { recipients } };
  }

  const recipientAddress = body?.recipientAddress;
  if (typeof recipientAddress !== "string" || recipientAddress.trim().length === 0) {
    return { ok: false, error: "recipientAddress is required" };
  }

  const amountSats = body?.amountSats;
  if (typeof amountSats !== "number" || !Number.isInteger(amountSats) || amountSats < 1) {
    return { ok: false, error: "amountSats must be a positive integer" };
  }

  return { ok: true, value: { recipientAddress: recipientAddress.trim(), amountSats } };
}

function validateSelectedUtxos(value: CreatePsbtBody["selectedUtxos"]):
  | { ok: true; value: Array<{ txid: string; vout: number }> | undefined }
  | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, error: "selectedUtxos must include at least one UTXO" };
  }
  if (value.length > 100) {
    return { ok: false, error: "At most 100 selected UTXOs are supported" };
  }

  const selectedUtxos = [];
  for (const item of value) {
    if (typeof item.txid !== "string" || !/^[0-9a-fA-F]{64}$/.test(item.txid)) {
      return { ok: false, error: "selected UTXO txid must be 64 hex characters" };
    }
    if (typeof item.vout !== "number" || !Number.isInteger(item.vout) || item.vout < 0) {
      return { ok: false, error: "selected UTXO vout must be a non-negative integer" };
    }
    selectedUtxos.push({ txid: item.txid.toLowerCase(), vout: item.vout });
  }

  return { ok: true, value: selectedUtxos };
}
