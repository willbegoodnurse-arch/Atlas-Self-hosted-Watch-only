import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { authConfig } from "./config.js";

export type AuthRecord = {
  username: string;
  passwordHash: string;
  totpSecret: string;
  twoFactorEnabled: boolean;
  createdAt: string;
};

const allowedKeys = new Set([
  "username",
  "passwordHash",
  "totpSecret",
  "twoFactorEnabled",
  "createdAt"
]);

const authFilePath = path.join(authConfig.dataDir, "auth.json");

export async function readAuthRecord(): Promise<AuthRecord | null> {
  try {
    const raw = await readFile(authFilePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<AuthRecord>;
    assertAuthRecordShape(parsed);
    return parsed;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function writeAuthRecord(record: AuthRecord): Promise<void> {
  assertAuthRecordShape(record);
  await mkdir(authConfig.dataDir, { recursive: true });
  const tempPath = `${authFilePath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  await rename(tempPath, authFilePath);
}

function assertAuthRecordShape(record: Partial<AuthRecord>): asserts record is AuthRecord {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unexpected auth record field: ${key}`);
    }
  }

  if (
    typeof record.username !== "string" ||
    typeof record.passwordHash !== "string" ||
    typeof record.totpSecret !== "string" ||
    typeof record.twoFactorEnabled !== "boolean" ||
    typeof record.createdAt !== "string"
  ) {
    throw new Error("Invalid auth record shape");
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

