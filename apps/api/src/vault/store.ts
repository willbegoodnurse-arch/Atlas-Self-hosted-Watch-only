import crypto from "node:crypto";
import { deriveAddresses } from "@watch-wallet/bitcoin";
import type { AddressChain, DerivedAddress } from "@watch-wallet/bitcoin";
import { constants } from "node:fs";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { authConfig } from "../auth/config.js";
import {
  discoverNextUnusedReceiveAddress,
  lookupAddressBalanceRecords,
  lookupAddressUsageRecords
} from "../mempool/usage.js";
import { lookupWalletTransactions } from "../mempool/transactions.js";
import type { WalletTransactionsResult } from "../mempool/transactions.js";
import { lookupWalletUtxos } from "../mempool/utxos.js";
import type { WalletUtxosResult } from "../mempool/utxos.js";
import { createWalletPsbt } from "../psbt/build.js";
import type { CreatePsbtInput, CreatePsbtResult } from "../psbt/build.js";
import { verifySignedPsbt } from "../psbt/verify.js";
import type { VerifyPsbtInput, VerifyPsbtResult } from "../psbt/verify.js";
import {
  accountPathFor,
  defaultScriptTypeForExistingKey,
  detectExtendedPublicKeyType,
  parseWalletImport
} from "./import-parser.js";
import {
  deleteAddressLabels,
  deleteTransactionLabels,
  normalizeAddressLabelInput,
  normalizeAddressLabelDeleteInput,
  normalizeStoredAddressLabels,
  normalizeStoredTransactionLabels,
  normalizeTransactionLabelInput,
  normalizeTransactionLabelDeleteInput,
  normalizeWalletNotes,
  upsertAddressLabels,
  upsertTransactionLabels
} from "./labels.js";
import {
  createVaultEnvelope,
  encryptVaultWithKey,
  unlockVaultEnvelope
} from "./crypto.js";
import type {
  BitcoinNetwork,
  ExtendedPublicKeyType,
  ImportFormat,
  ScriptType,
  SourceDevice,
  VaultEnvelope,
  VaultPlaintext,
  WalletRecord
} from "./types.js";

const walletsFilePath = path.join(authConfig.dataDir, "wallets.enc");

type UnlockedVault = {
  key: Buffer;
  envelope: VaultEnvelope;
  plaintext: VaultPlaintext;
};

let unlockedVault: UnlockedVault | null = null;

export async function getVaultStatus() {
  return {
    initialized: await vaultFileExists(),
    unlocked: Boolean(unlockedVault),
    walletCount: unlockedVault?.plaintext.wallets.length ?? null
  };
}

export async function initVault(vaultPassword: string): Promise<void> {
  if (await vaultFileExists()) {
    throw new VaultAlreadyInitializedError();
  }

  const plaintext: VaultPlaintext = {
    version: 1,
    wallets: []
  };
  const { envelope, key } = await createVaultEnvelope(vaultPassword, plaintext);
  await writeVaultEnvelope(envelope);
  unlockedVault = {
    key,
    envelope,
    plaintext
  };
}

export async function unlockVault(vaultPassword: string): Promise<void> {
  const envelope = await readVaultEnvelope();
  const { plaintext, key } = await unlockVaultEnvelope(vaultPassword, envelope);
  plaintext.wallets = plaintext.wallets.map(normalizeWalletRecord);
  unlockedVault?.key.fill(0);
  unlockedVault = {
    key,
    envelope,
    plaintext
  };
}

export function lockVault(): void {
  unlockedVault?.key.fill(0);
  unlockedVault = null;
}

export function listWallets(): WalletRecord[] {
  return requireUnlockedVault().plaintext.wallets;
}

export async function addWallet(input: {
  name: string;
  importText: string;
  network: BitcoinNetwork;
  sourceDevice?: SourceDevice;
  scriptType?: ScriptType;
  notes?: string | null;
  gapLimit: number;
}): Promise<WalletRecord> {
  const vault = requireUnlockedVault();
  const parsed = parseWalletImport({
    importText: input.importText,
    sourceDevice: input.sourceDevice,
    network: input.network,
    scriptType: input.scriptType,
    notes: input.notes
  });
  if (!parsed.extendedPublicKey || !parsed.type) {
    throw new InvalidWalletInputError(parsed.unsupportedReason ?? "Import did not contain a supported extended public key");
  }

  const now = new Date().toISOString();
  const wallet: WalletRecord = {
    id: `wallet_${crypto.randomUUID()}`,
    name: input.name,
    extendedPublicKey: parsed.extendedPublicKey,
    type: parsed.type,
    sourceDevice: parsed.sourceDevice,
    network: parsed.network,
    scriptType: parsed.scriptType,
    accountPath: parsed.accountPath,
    masterFingerprint: parsed.masterFingerprint,
    importFormat: parsed.importFormat,
    rawImport: parsed.rawImport,
    notes: parsed.notes,
    walletNotes: null,
    addressLabels: [],
    transactionLabels: [],
    derivationPath: parsed.accountPath ?? derivationPathFor(parsed.type, parsed.network, parsed.scriptType),
    gapLimit: input.gapLimit,
    createdAt: now,
    updatedAt: now
  };

  vault.plaintext.wallets.push(wallet);
  await saveUnlockedVault();
  return wallet;
}

export async function updateWallet(
  id: string,
  input: {
    name?: string;
    gapLimit?: number;
  }
): Promise<WalletRecord> {
  const vault = requireUnlockedVault();
  const wallet = vault.plaintext.wallets.find((candidate) => candidate.id === id);
  if (!wallet) {
    throw new WalletNotFoundError();
  }

  if (input.name !== undefined) {
    wallet.name = input.name;
  }

  if (input.gapLimit !== undefined) {
    wallet.gapLimit = input.gapLimit;
  }

  wallet.updatedAt = new Date().toISOString();
  await saveUnlockedVault();
  return wallet;
}

export async function updateWalletNotes(id: string, notes: string | null): Promise<WalletRecord> {
  const wallet = findWalletById(id);
  wallet.walletNotes = normalizeWalletNotes(notes);
  wallet.updatedAt = new Date().toISOString();
  await saveUnlockedVault();
  return wallet;
}

export async function upsertAddressLabel(
  id: string,
  input: {
    chain: unknown;
    index: unknown;
    address: unknown;
    label: unknown;
    notes?: unknown;
  }
): Promise<WalletRecord> {
  const wallet = findWalletById(id);
  const label = normalizeAddressLabelInput(input);
  wallet.addressLabels = upsertAddressLabels(
    wallet.addressLabels,
    label,
    new Date().toISOString()
  );
  wallet.updatedAt = new Date().toISOString();
  await saveUnlockedVault();
  return wallet;
}

export async function deleteAddressLabel(
  id: string,
  input: {
    chain: unknown;
    index: unknown;
  }
): Promise<WalletRecord> {
  const wallet = findWalletById(id);
  const label = normalizeAddressLabelDeleteInput(input);
  wallet.addressLabels = deleteAddressLabels(wallet.addressLabels, label.chain, label.index);
  wallet.updatedAt = new Date().toISOString();
  await saveUnlockedVault();
  return wallet;
}

export async function upsertTransactionLabel(
  id: string,
  input: {
    txid: unknown;
    label: unknown;
    notes?: unknown;
  }
): Promise<WalletRecord> {
  const wallet = findWalletById(id);
  const label = normalizeTransactionLabelInput(input);
  wallet.transactionLabels = upsertTransactionLabels(
    wallet.transactionLabels,
    label,
    new Date().toISOString()
  );
  wallet.updatedAt = new Date().toISOString();
  await saveUnlockedVault();
  return wallet;
}

export async function deleteTransactionLabel(
  id: string,
  input: {
    txid: unknown;
  }
): Promise<WalletRecord> {
  const wallet = findWalletById(id);
  const label = normalizeTransactionLabelDeleteInput(input);
  wallet.transactionLabels = deleteTransactionLabels(wallet.transactionLabels, label.txid);
  wallet.updatedAt = new Date().toISOString();
  await saveUnlockedVault();
  return wallet;
}

export async function deleteWallet(id: string): Promise<void> {
  const vault = requireUnlockedVault();
  const walletIndex = vault.plaintext.wallets.findIndex((wallet) => wallet.id === id);
  if (walletIndex === -1) {
    throw new WalletNotFoundError();
  }

  vault.plaintext.wallets.splice(walletIndex, 1);
  await saveUnlockedVault();
}

export function deriveWalletAddresses(
  id: string,
  input: {
    chain: AddressChain | "both";
    limit: number;
  }
) {
  const vault = requireUnlockedVault();
  const wallet = vault.plaintext.wallets.find((candidate) => candidate.id === id);
  if (!wallet) {
    throw new WalletNotFoundError();
  }

  return {
    wallet,
    result: deriveAddresses({
      extendedPublicKey: wallet.extendedPublicKey,
      type: wallet.type,
      scriptType: derivableScriptType(wallet),
      accountPath: wallet.accountPath ?? wallet.derivationPath,
      network: wallet.network,
      chain: input.chain,
      limit: input.limit
    })
  };
}

export async function deriveWalletAddressUsage(
  id: string,
  input: {
    chain: AddressChain | "both";
    limit: number;
  }
) {
  const { wallet, result } = deriveWalletAddresses(id, input);
  const usage = await lookupAddressUsageRecords(result.addresses);

  return {
    wallet,
    result: {
      ...result,
      usageStatus: usage.lookupFailed ? "partial" : "ready",
      addresses: usage.addresses,
      lookupFailed: usage.lookupFailed
    }
  };
}

export async function deriveWalletNextReceiveAddress(id: string) {
  const vault = requireUnlockedVault();
  const wallet = vault.plaintext.wallets.find((candidate) => candidate.id === id);
  if (!wallet) {
    throw new WalletNotFoundError();
  }

  const maxDiscoveryLimit = Math.min(200, Math.max(wallet.gapLimit * 5, wallet.gapLimit));
  const result = deriveAddresses({
    extendedPublicKey: wallet.extendedPublicKey,
    type: wallet.type,
    scriptType: derivableScriptType(wallet),
    accountPath: wallet.accountPath ?? wallet.derivationPath,
    network: wallet.network,
    chain: "receive",
    limit: maxDiscoveryLimit
  });
  const discovery = await discoverNextUnusedReceiveAddress(
    result.addresses,
    wallet.gapLimit,
    maxDiscoveryLimit
  );

  return {
    wallet,
    result: {
      network: result.network,
      scriptType: result.scriptType,
      ...discovery
    }
  };
}

export async function deriveWalletBalance(
  id: string,
  input: {
    chain: AddressChain | "both";
    limit: number;
  }
) {
  const { wallet, result } = deriveWalletAddresses(id, input);
  const balance = await lookupAddressBalanceRecords(result.addresses);
  const receiveBalance = balance.addresses.filter((address) => address.chain === "receive");
  const changeBalance = balance.addresses.filter((address) => address.chain === "change");

  return {
    wallet,
    result: {
      network: result.network,
      scriptType: result.scriptType,
      status:
        balance.failedAddresses.length === 0
          ? "online"
          : balance.failedAddresses.length === balance.addresses.length
            ? "offline"
            : "partial",
      usageStatus: balance.lookupFailed ? "partial" : "ready",
      lookupFailed: balance.lookupFailed,
      failedAddresses: balance.failedAddresses,
      balance: balance.balance,
      receiveBalance: sumAddressBalances(receiveBalance),
      changeBalance: sumAddressBalances(changeBalance),
      addresses: balance.addresses
    }
  };
}

export async function getWalletTransactions(
  id: string,
  input: {
    chain: "receive" | "change" | "both";
    addressLimit: number;
    txLimit: number;
    pages: number;
  }
): Promise<{ wallet: WalletRecord; result: WalletTransactionsResult }> {
  const { wallet, result: addressResult } = deriveWalletAddresses(id, {
    chain: input.chain,
    limit: input.addressLimit
  });

  const walletAddresses = addressResult.addresses.map((a: DerivedAddress) => ({
    chain: a.chain,
    index: a.index,
    address: a.address
  }));

  const result = await lookupWalletTransactions(walletAddresses, input.txLimit, {
    pages: input.pages
  });
  return { wallet, result };
}

export async function getWalletUtxos(
  id: string,
  input: {
    chain: "receive" | "change" | "both";
    addressLimit: number;
    includeUnconfirmed: boolean;
  }
): Promise<{ wallet: WalletRecord; result: WalletUtxosResult }> {
  const { wallet, result: addressResult } = deriveWalletAddresses(id, {
    chain: input.chain,
    limit: input.addressLimit
  });

  const walletAddresses = addressResult.addresses.map((a: DerivedAddress) => ({
    chain: a.chain,
    index: a.index,
    address: a.address,
    path: a.path
  }));

  const result = await lookupWalletUtxos(walletAddresses, {
    includeUnconfirmed: input.includeUnconfirmed
  });
  return { wallet, result };
}

export async function createPsbt(
  id: string,
  input: CreatePsbtInput
): Promise<CreatePsbtResult> {
  const wallet = findWalletById(id);
  return createWalletPsbt(wallet, input);
}

export async function verifyPsbt(
  id: string,
  input: VerifyPsbtInput
): Promise<VerifyPsbtResult> {
  const wallet = findWalletById(id);
  return verifySignedPsbt(wallet, input);
}

export function derivationPathFor(
  type: ExtendedPublicKeyType,
  network: BitcoinNetwork,
  scriptType: ScriptType = defaultScriptTypeForExistingKey(type)
): string {
  return accountPathFor(scriptType, network) ?? accountPathFor(defaultScriptTypeForExistingKey(type), network) ?? "m/84'/0'/0'";
}

export function scriptTypeForKeyType(type: ExtendedPublicKeyType): ScriptType {
  return defaultScriptTypeForExistingKey(type);
}

export function normalizeWalletRecord(value: WalletRecord): WalletRecord {
  const legacyScriptType = normalizeLegacyScriptType(value.scriptType);
  const type = value.type ?? detectExtendedPublicKeyType(value.extendedPublicKey);
  const network = value.network ?? "mainnet";
  const scriptType = legacyScriptType ?? defaultScriptTypeForExistingKey(value.extendedPublicKey);
  const accountPath = value.accountPath ?? value.derivationPath ?? accountPathFor(scriptType, network);

  return {
    ...value,
    type,
    sourceDevice: normalizeSourceDevice(value.sourceDevice),
    network,
    scriptType,
    accountPath,
    masterFingerprint: normalizeFingerprint(value.masterFingerprint),
    importFormat: normalizeImportFormat(value.importFormat) ?? importFormatForExistingKey(type),
    rawImport: typeof value.rawImport === "string" ? value.rawImport : null,
    notes: typeof value.notes === "string" ? value.notes : null,
    walletNotes: normalizeWalletNotes(value.walletNotes),
    addressLabels: normalizeStoredAddressLabels(value.addressLabels),
    transactionLabels: normalizeStoredTransactionLabels(value.transactionLabels),
    derivationPath: value.derivationPath ?? accountPath ?? derivationPathFor(type, network, scriptType),
    gapLimit: value.gapLimit
  };
}

function findWalletById(id: string): WalletRecord {
  const vault = requireUnlockedVault();
  const wallet = vault.plaintext.wallets.find((candidate) => candidate.id === id);
  if (!wallet) {
    throw new WalletNotFoundError();
  }
  return wallet;
}

function derivableScriptType(wallet: WalletRecord): "legacy" | "nested-segwit" | "native-segwit" | "taproot" {
  if (
    wallet.scriptType !== "legacy" &&
    wallet.scriptType !== "nested-segwit" &&
    wallet.scriptType !== "native-segwit" &&
    wallet.scriptType !== "taproot"
  ) {
    throw new InvalidWalletInputError(
      "Script type is unknown; edit the wallet import metadata before deriving addresses"
    );
  }
  return wallet.scriptType;
}

function normalizeLegacyScriptType(value: unknown): ScriptType | null {
  if (value === "p2pkh" || value === "legacy") {
    return "legacy";
  }
  if (value === "p2sh-p2wpkh" || value === "nested-segwit") {
    return "nested-segwit";
  }
  if (value === "p2wpkh" || value === "native-segwit") {
    return "native-segwit";
  }
  if (value === "taproot" || value === "unknown") {
    return value;
  }
  return null;
}

function normalizeSourceDevice(value: unknown): SourceDevice {
  const devices: SourceDevice[] = [
    "coldcard", "keystone", "seedsigner", "krux", "passport-core", "jade", "other"
  ];
  return devices.includes(value as SourceDevice) ? value as SourceDevice : "other";
}

function normalizeImportFormat(value: unknown): ImportFormat | null {
  const formats: ImportFormat[] = [
    "plain-xpub", "slip132", "descriptor", "key-expression", "coldcard-json",
    "crypto-account-ur", "ur-xpub", "passport-setup-qr", "unknown"
  ];
  return formats.includes(value as ImportFormat) ? value as ImportFormat : null;
}

function normalizeFingerprint(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-fA-F]{8}$/.test(value) ? value.toLowerCase() : null;
}

function importFormatForExistingKey(type: ExtendedPublicKeyType): ImportFormat {
  return type === "xpub" || type === "tpub" ? "plain-xpub" : "slip132";
}

async function saveUnlockedVault(): Promise<void> {
  const vault = requireUnlockedVault();
  vault.envelope = encryptVaultWithKey(
    vault.key,
    vault.plaintext,
    vault.envelope.kdf.salt,
    vault.envelope.kdf.params
  );
  await writeVaultEnvelope(vault.envelope);
}

async function readVaultEnvelope(): Promise<VaultEnvelope> {
  try {
    return parseVaultEnvelope(JSON.parse(await readFile(walletsFilePath, "utf8")));
  } catch (error) {
    if (isFileNotFoundError(error)) {
      throw new VaultNotInitializedError();
    }
    throw error;
  }
}

async function writeVaultEnvelope(envelope: VaultEnvelope): Promise<void> {
  await mkdir(authConfig.dataDir, { recursive: true });
  const tempPath = `${walletsFilePath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(envelope, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  await rename(tempPath, walletsFilePath);
}

async function vaultFileExists(): Promise<boolean> {
  try {
    await access(walletsFilePath, constants.F_OK);
    return true;
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return false;
    }
    throw error;
  }
}

function requireUnlockedVault(): UnlockedVault {
  if (!unlockedVault) {
    throw new VaultLockedError();
  }

  return unlockedVault;
}

function parseVaultEnvelope(value: unknown): VaultEnvelope {
  if (!isRecord(value) || value.version !== 1) {
    throw new Error("Invalid vault envelope");
  }

  const kdf = value.kdf;
  const cipher = value.cipher;
  if (!isRecord(kdf) || !isRecord(cipher)) {
    throw new Error("Invalid vault envelope");
  }

  if (
    kdf.name !== "scrypt" ||
    typeof kdf.salt !== "string" ||
    !isRecord(kdf.params) ||
    typeof kdf.params.N !== "number" ||
    typeof kdf.params.r !== "number" ||
    typeof kdf.params.p !== "number" ||
    typeof kdf.params.keyLength !== "number" ||
    cipher.name !== "aes-256-gcm" ||
    typeof cipher.iv !== "string" ||
    typeof cipher.authTag !== "string" ||
    typeof value.ciphertext !== "string"
  ) {
    throw new Error("Invalid vault envelope");
  }

  return value as VaultEnvelope;
}

function isFileNotFoundError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sumAddressBalances(
  addresses: Array<{
    confirmedBalance: number | null;
    unconfirmedBalance: number | null;
  }>
) {
  const confirmedBalance = addresses.reduce(
    (sum, address) => sum + (address.confirmedBalance ?? 0),
    0
  );
  const unconfirmedBalance = addresses.reduce(
    (sum, address) => sum + (address.unconfirmedBalance ?? 0),
    0
  );

  return {
    confirmedBalance,
    unconfirmedBalance,
    totalBalance: confirmedBalance + unconfirmedBalance
  };
}

export class VaultAlreadyInitializedError extends Error {}
export class VaultNotInitializedError extends Error {}
export class VaultLockedError extends Error {}
export class InvalidWalletInputError extends Error {}
export class WalletNotFoundError extends Error {}
