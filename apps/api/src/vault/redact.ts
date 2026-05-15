import type { WalletRecord } from "./types.js";

const xpubLikePattern = /\b(x|y|z|t|u|v)(pub|prv)[1-9A-HJ-NP-Za-km-z]{40,}/g;
const wifPattern = /\b[5KL][1-9A-HJ-NP-Za-km-z]{50,51}\b/g;
const psbtPattern = /\bcHNidP8B[0-9A-Za-z+/=]{16,}\b/g;
const namedSecretPattern =
  /\b(CORE_RPC_PASSWORD|SESSION_SECRET|watch_wallet_session|rpcpassword|password|passwordConfirm|vaultPassword|totpCode|totpSecret)\s*[:=]\s*("[^"]*"|'[^']*'|[^,\s}]+)/gi;

export function maskXpub(key: string): string {
  if (key.length < 12) return "***";
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

export function redactSensitive(value: string): string {
  return value
    .replace(namedSecretPattern, (_match, key: string) => `${key}=[REDACTED]`)
    .replace(xpubLikePattern, (match) => maskXpub(match))
    .replace(wifPattern, "[WIF-REDACTED]")
    .replace(psbtPattern, "[PSBT-REDACTED]");
}

export type WalletSummary = Omit<WalletRecord, "extendedPublicKey" | "rawImport"> & {
  extendedPublicKey: string;
  rawImport: string | null;
};

export function serializeWallet(wallet: WalletRecord): WalletSummary {
  return {
    ...wallet,
    extendedPublicKey: maskXpub(wallet.extendedPublicKey),
    rawImport: wallet.rawImport ? redactSensitive(wallet.rawImport) : null
  };
}
