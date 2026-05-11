import crypto from "node:crypto";
import type { VaultEnvelope, VaultPlaintext } from "./types.js";

const cipherName = "aes-256-gcm" as const;
const kdfName = "scrypt" as const;
const keyLength = 32;

export const defaultScryptParams = {
  N: 32768,
  r: 8,
  p: 1,
  keyLength
} as const;

export async function createVaultEnvelope(
  vaultPassword: string,
  plaintext: VaultPlaintext
): Promise<{ envelope: VaultEnvelope; key: Buffer }> {
  const salt = crypto.randomBytes(16);
  const key = await deriveVaultKey(vaultPassword, salt, defaultScryptParams);
  const envelope = encryptVaultWithKey(key, plaintext, salt.toString("base64"), defaultScryptParams);
  return { envelope, key };
}

export async function unlockVaultEnvelope(
  vaultPassword: string,
  envelope: VaultEnvelope
): Promise<{ plaintext: VaultPlaintext; key: Buffer }> {
  const key = await deriveVaultKey(
    vaultPassword,
    Buffer.from(envelope.kdf.salt, "base64"),
    envelope.kdf.params
  );

  try {
    return {
      plaintext: decryptVaultWithKey(key, envelope),
      key
    };
  } catch (error) {
    key.fill(0);
    throw error;
  }
}

export function encryptVaultWithKey(
  key: Buffer,
  plaintext: VaultPlaintext,
  salt: string,
  params: VaultEnvelope["kdf"]["params"]
): VaultEnvelope {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(cipherName, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(plaintext), "utf8"),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  return {
    version: 1,
    kdf: {
      name: kdfName,
      salt,
      params
    },
    cipher: {
      name: cipherName,
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64")
    },
    ciphertext: ciphertext.toString("base64")
  };
}

function decryptVaultWithKey(key: Buffer, envelope: VaultEnvelope): VaultPlaintext {
  const decipher = crypto.createDecipheriv(
    cipherName,
    key,
    Buffer.from(envelope.cipher.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(envelope.cipher.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final()
  ]);

  return parseVaultPlaintext(JSON.parse(plaintext.toString("utf8")));
}

async function deriveVaultKey(
  vaultPassword: string,
  salt: Buffer,
  params: VaultEnvelope["kdf"]["params"]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(vaultPassword, salt, params.keyLength, {
      N: params.N,
      r: params.r,
      p: params.p,
      maxmem: 64 * 1024 * 1024
    }, (error, key) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(key);
    });
  });
}

function parseVaultPlaintext(value: unknown): VaultPlaintext {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.wallets)) {
    throw new Error("Invalid vault plaintext");
  }

  return {
    version: 1,
    wallets: value.wallets
  } as VaultPlaintext;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
