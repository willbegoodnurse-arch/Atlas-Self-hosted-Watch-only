import crypto from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { authConfig } from "../auth/config.js";
import {
  createVaultEnvelope,
  encryptVaultWithKey,
  unlockVaultEnvelope
} from "./crypto.js";
import type {
  BitcoinNetwork,
  ExtendedPublicKeyType,
  ScriptType,
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
  extendedPublicKey: string;
  network: BitcoinNetwork;
  gapLimit: number;
}): Promise<WalletRecord> {
  const vault = requireUnlockedVault();
  const type = detectExtendedPublicKeyType(input.extendedPublicKey);
  const now = new Date().toISOString();
  const wallet: WalletRecord = {
    id: `wallet_${crypto.randomUUID()}`,
    name: input.name,
    extendedPublicKey: input.extendedPublicKey,
    type,
    network: input.network,
    scriptType: scriptTypeForKeyType(type),
    derivationPath: derivationPathFor(type, input.network),
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

export async function deleteWallet(id: string): Promise<void> {
  const vault = requireUnlockedVault();
  const walletIndex = vault.plaintext.wallets.findIndex((wallet) => wallet.id === id);
  if (walletIndex === -1) {
    throw new WalletNotFoundError();
  }

  vault.plaintext.wallets.splice(walletIndex, 1);
  await saveUnlockedVault();
}

export function detectExtendedPublicKeyType(value: string): ExtendedPublicKeyType {
  if (value.startsWith("xpub")) {
    return "xpub";
  }
  if (value.startsWith("ypub")) {
    return "ypub";
  }
  if (value.startsWith("zpub")) {
    return "zpub";
  }

  throw new InvalidWalletInputError("Extended public key must start with xpub, ypub, or zpub");
}

export function derivationPathFor(
  type: ExtendedPublicKeyType,
  network: BitcoinNetwork
): string {
  const coinType = network === "mainnet" ? "0" : "1";
  const purpose = type === "xpub" ? "44" : type === "ypub" ? "49" : "84";
  return `m/${purpose}'/${coinType}'/0'`;
}

export function scriptTypeForKeyType(type: ExtendedPublicKeyType): ScriptType {
  if (type === "xpub") {
    return "p2pkh";
  }
  if (type === "ypub") {
    return "p2sh-p2wpkh";
  }
  return "p2wpkh";
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

export class VaultAlreadyInitializedError extends Error {}
export class VaultNotInitializedError extends Error {}
export class VaultLockedError extends Error {}
export class InvalidWalletInputError extends Error {}
export class WalletNotFoundError extends Error {}
