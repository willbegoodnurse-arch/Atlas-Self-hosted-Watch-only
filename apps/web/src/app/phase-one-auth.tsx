"use client";

import { Fragment, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import type { IScannerControls } from "@zxing/browser";
import type { ReactNode } from "react";
import {
  addMultipartPsbtFrame,
  assembleMultipartPsbt,
  createMultipartPsbtState,
  parseMultipartPsbtFrame,
  type MultipartPsbtFrame,
  type MultipartPsbtState
} from "./psbt-multipart";
import {
  addBbqrFrame,
  assembleBbqrPayload,
  createBbqrCollectorState,
  getCapturedBbqrFrameCount,
  getBbqrFileTypeLabel,
  getMissingBbqrFrames,
  inspectBbqrFrame,
  parseBbqrFrame,
  type BbqrSafeMetadata,
  type BbqrCollectorState
} from "./bbqr";
import { encodeBbqrPsbt } from "./bbqr-encode";
import { createUrPsbtDecoder, decodeUrPsbtPart, encodeUrPsbt } from "./ur-encode";
export { signedPsbtMultipartFrameMessage } from "./psbt-multipart";

type SessionResponse = {
  authenticated: boolean;
  setupComplete: boolean;
  user: {
    username: string;
  } | null;
};

type SetupResponse = {
  setupComplete: boolean;
  twoFactorEnabled: boolean;
  otpauthUrl: string;
  qrCodeDataUrl: string;
};

type VaultStatus = {
  initialized: boolean;
  unlocked: boolean;
  walletCount: number | null;
  autoLockMinutes: number | null;
};

export type WalletRecord = {
  id: string;
  name: string;
  extendedPublicKey: string;
  type: ExtendedPublicKeyType;
  sourceDevice: SourceDevice;
  network: "mainnet" | "testnet" | "signet";
  scriptType: WalletScriptType;
  accountPath: string | null;
  masterFingerprint: string | null;
  importFormat: ImportFormat;
  rawImport: string | null;
  notes: string | null;
  walletNotes: string | null;
  addressLabels: AddressLabel[];
  utxoNotes: UtxoNote[];
  transactionLabels: TransactionLabel[];
  derivationPath: string;
  gapLimit: number;
  createdAt: string;
  updatedAt: string;
};

type WalletImportPreviewResponse = {
  keyType: ExtendedPublicKeyType | null;
  network: WalletRecord["network"];
  scriptType: WalletScriptType;
  accountPath: string | null;
  masterFingerprint: string | null;
  importFormat: ImportFormat;
  firstReceiveAddress: string;
  firstReceivePath: string;
  warnings: string[];
};

type AddressLabel = {
  chain: "receive" | "change";
  index: number;
  address: string;
  label: string;
  notes: string | null;
  updatedAt: string;
};

type TransactionLabel = {
  txid: string;
  label: string;
  notes: string | null;
  updatedAt: string;
};

type UtxoNote = {
  txid: string;
  vout: number;
  note: string;
  updatedAt: string;
};

type ExtendedPublicKeyType = "xpub" | "ypub" | "zpub" | "tpub" | "upub" | "vpub";
type SourceDevice =
  | "coldcard"
  | "keystone"
  | "seedsigner"
  | "krux"
  | "passport-core"
  | "jade"
  | "other";
type WalletScriptType = "legacy" | "nested-segwit" | "native-segwit" | "taproot" | "unknown";
type ImportFormat =
  | "bare-extended-public-key"
  | "origin-extended-public-key"
  | "descriptor"
  | "coldcard-json"
  | "coldcard-generic-json-bbqr"
  | "crypto-account-ur"
  | "crypto-hdkey-ur"
  | "ur-xpub"
  | "passport-setup-qr"
  | "bbqr"
  | "psbt-ur"
  | "unknown";

export type DerivedAddress = {
  chain: "receive" | "change";
  index: number;
  path: string;
  address: string;
  usage: "used" | "unused" | "unknown";
  txCount?: number | null;
  confirmedTxCount?: number | null;
  mempoolTxCount?: number | null;
  confirmedBalance?: number | null;
  unconfirmedBalance?: number | null;
  totalBalance?: number | null;
  lookupError?: string | null;
};

type BalanceSummary = {
  confirmedBalance: number;
  unconfirmedBalance: number;
  totalBalance: number;
};

type WalletBalanceResponse = {
  walletId: string;
  network: WalletRecord["network"];
  scriptType: WalletRecord["scriptType"];
  status?: "online" | "partial" | "offline";
  usageStatus: "unknown" | "partial" | "ready";
  unit: "sats";
  confirmedBalance: number;
  unconfirmedBalance: number;
  totalBalance: number;
  receiveBalance?: BalanceSummary;
  changeBalance?: BalanceSummary;
  addresses: DerivedAddress[];
  failedAddresses?: Array<{
    address: string;
    chain: "receive" | "change";
    index: number;
    error: string;
  }>;
  nextUnusedReceiveAddress?: DerivedAddress | null;
  lookupError?: string | null;
  nextReceiveLookupError?: string | null;
  discovery?: {
    checkedCount: number;
    gapLimit: number;
    maxDiscoveryLimit: number;
    complete: boolean;
  } | null;
  mempool?: {
    mode: string;
    url: string;
    lookupFailed?: boolean;
  };
};

type MarketPriceResponse = {
  market: "KRW-BTC";
  priceKrw: number | null;
  source: "upbit";
  checkedAt: string;
  status: "online" | "stale" | "offline";
  error?: "price-unavailable";
};

type WalletAddressesResponse = {
  walletId: string;
  network: WalletRecord["network"];
  scriptType: WalletRecord["scriptType"];
  usageStatus: "unknown" | "partial" | "ready";
  addresses: DerivedAddress[];
};

type MempoolStatusResponse = {
  status: "online" | "degraded" | "offline";
  mode: string;
  url: string;
  baseUrl?: string;
  tipHeight: number | null;
  latencyMs?: number;
  checkedAt?: string;
  errors?: string[];
  checks?: {
    tipHeight?: {
      status: "ok" | "failed";
      error: string | null;
    };
  };
  cacheTtlSeconds: number;
};

type FulcrumRuntimeConfig = {
  host: string | null;
  port: number;
  tlsPort: number;
  useTls: boolean;
  configured: boolean;
};

type FulcrumStatusResponse = {
  status: "online" | "offline" | "not-configured";
  host: string | null;
  port: number;
  useTls: boolean;
  latencyMs: number | null;
  checkedAt: string;
  error: string | null;
};

type RuntimeSettingsResponse = {
  apiMode: string;
  backendKind: "mempool-public" | "mempool-local" | "fulcrum" | "unknown";
  mempoolApiUrl: string;
  mempoolApiHost: string;
  isLocalMempool: boolean;
  mempoolWebUrl: string | null;
  mempoolWebUrlConfigured: boolean;
  broadcastBackend: "disabled" | "core";
  broadcastCoreConfigured: boolean;
  fulcrum: FulcrumRuntimeConfig;
  defaultNetwork: string;
  defaultCurrency: string;
  defaultUnit: string;
};

type AppStatusResponse = {
  status: string;
  watchOnly?: boolean;
  storagePolicy?: string;
  service?: string;
  version?: string;
  commit?: string;
};

type BalanceUnit = "btc" | "sats";
type SettingsLanguage = "en" | "ko";

type SettingsMessageKey =
  | "settings.button"
  | "settings.title"
  | "settings.close"
  | "settings.display"
  | "settings.security"
  | "settings.network"
  | "settings.broadcast"
  | "settings.backup"
  | "settings.diagnostics"
  | "settings.language"
  | "settings.defaultBalanceUnit"
  | "settings.showKrw"
  | "settings.vaultStatus"
  | "settings.autoLock"
  | "settings.totp"
  | "settings.watchOnly"
  | "settings.lockVaultNow"
  | "settings.mempoolStatus"
  | "settings.marketStatus"
  | "settings.apiMode"
  | "settings.tipHeight"
  | "settings.backend"
  | "settings.localMempool"
  | "settings.publicFallback"
  | "settings.walletsLocation"
  | "settings.backupChecklist"
  | "settings.appVersion"
  | "settings.apiHealth"
  | "settings.dockerStatus"
  | "settings.english"
  | "settings.korean";

const SETTINGS_MESSAGES: Record<SettingsLanguage, Record<SettingsMessageKey, string>> = {
  en: {
    "settings.button": "Settings",
    "settings.title": "Settings",
    "settings.close": "Close",
    "settings.display": "Display",
    "settings.security": "Security",
    "settings.network": "Network",
    "settings.broadcast": "Broadcast",
    "settings.backup": "Backup",
    "settings.diagnostics": "Diagnostics",
    "settings.language": "Language",
    "settings.defaultBalanceUnit": "Default balance unit",
    "settings.showKrw": "Show KRW estimate",
    "settings.vaultStatus": "Vault status",
    "settings.autoLock": "Auto-lock timeout",
    "settings.totp": "TOTP enabled",
    "settings.watchOnly": "Watch-only mode enforced",
    "settings.lockVaultNow": "Lock vault now",
    "settings.mempoolStatus": "Mempool status",
    "settings.marketStatus": "Market price status",
    "settings.apiMode": "API mode",
    "settings.tipHeight": "Current tip height",
    "settings.backend": "Backend",
    "settings.localMempool": "Local mempool web URL configured",
    "settings.publicFallback": "Public fallback",
    "settings.walletsLocation": "wallets.enc location",
    "settings.backupChecklist": "Backup checklist",
    "settings.appVersion": "App version / commit",
    "settings.apiHealth": "API health",
    "settings.dockerStatus": "Docker hardened status",
    "settings.english": "English",
    "settings.korean": "Korean"
  },
  ko: {
    "settings.button": "설정",
    "settings.title": "설정",
    "settings.close": "닫기",
    "settings.display": "표시",
    "settings.security": "보안",
    "settings.network": "네트워크",
    "settings.broadcast": "브로드캐스트",
    "settings.backup": "백업",
    "settings.diagnostics": "진단",
    "settings.language": "언어",
    "settings.defaultBalanceUnit": "기본 잔고 단위",
    "settings.showKrw": "KRW 추정 표시",
    "settings.vaultStatus": "볼트 상태",
    "settings.autoLock": "자동 잠금 시간",
    "settings.totp": "TOTP 활성화",
    "settings.watchOnly": "Watch-only 모드 적용",
    "settings.lockVaultNow": "지금 볼트 잠금",
    "settings.mempoolStatus": "Mempool 상태",
    "settings.marketStatus": "시세 상태",
    "settings.apiMode": "API 모드",
    "settings.tipHeight": "현재 tip height",
    "settings.backend": "백엔드",
    "settings.localMempool": "로컬 mempool 웹 URL 설정",
    "settings.publicFallback": "공개 fallback",
    "settings.walletsLocation": "wallets.enc 위치",
    "settings.backupChecklist": "백업 체크리스트",
    "settings.appVersion": "앱 버전 / 커밋",
    "settings.apiHealth": "API 상태",
    "settings.dockerStatus": "Docker hardening 상태",
    "settings.english": "English",
    "settings.korean": "한국어"
  }
};

type BroadcastStatusResponse = {
  enabled: boolean;
  backend: "disabled" | "core";
  configured: boolean;
  reachable?: boolean;
  chain?: string;
  blocks?: number;
  headers?: number;
  initialBlockDownload?: boolean;
  message?: string;
};

type BroadcastResponse = {
  status: "broadcasted";
  backend: "core";
  txid: string;
  message?: string;
  mempool?: {
    configured: boolean;
    txUrl: string | null;
    lookupStatus: "pending" | "unavailable";
    message: string;
  };
};

type WalletTransactionRelatedAddress = {
  address: string;
  chain: "receive" | "change";
  index: number;
  role: "input" | "output";
  valueSats: number;
};

export type WalletTransaction = {
  txid: string;
  status: "confirmed" | "unconfirmed" | "unknown";
  direction: "incoming" | "outgoing" | "self" | "unknown";
  netSats: number;
  feeSats: number | null;
  blockHeight: number | null;
  blockTime: number | null;
  confirmations?: number | null;
  relatedAddresses: WalletTransactionRelatedAddress[];
};

type WalletScanSummary = {
  receiveScanned: number;
  changeScanned: number;
  pagesPerAddress: number;
  uniqueTransactions: number;
  failedLookups: number;
  truncated: boolean;
};

export type WalletUtxo = {
  txid: string;
  vout: number;
  outpoint: string;
  valueSats: number;
  status: "confirmed" | "unconfirmed";
  blockHeight: number | null;
  blockTime: number | null;
  address: string;
  chain: "receive" | "change";
  index: number;
  path: string | null;
};

type UtxoSummary = {
  totalUtxos: number;
  confirmedUtxos: number;
  unconfirmedUtxos: number;
  totalSats: number;
  confirmedSats: number;
  unconfirmedSats: number;
  largestUtxoSats: number | null;
  smallestUtxoSats: number | null;
};

type WalletUtxosResponse = {
  walletId: string;
  chain: string;
  addressLimit: number;
  includeUnconfirmed: boolean;
  unit: "sats";
  status: "online" | "partial" | "offline";
  utxos: WalletUtxo[];
  summary: UtxoSummary;
  failedAddresses: Array<{
    address: string;
    chain: "receive" | "change";
    index: number;
    error: string;
  }>;
};

export type CreatePsbtResponse = {
  psbtBase64: string;
  inputs: Array<{
    txid: string;
    vout: number;
    outpoint: string;
    valueSats: number;
    address: string;
    chain: "receive" | "change";
    index: number;
    path: string | null;
  }>;
  outputs: Array<{
    address: string;
    valueSats: number;
    type: "recipient" | "change";
    chain?: "receive" | "change" | null;
    index?: number | null;
    path?: string | null;
    usage?: "used" | "unused" | "unknown" | null;
  }>;
  feeSats: number;
  feeRateSatsPerVbyte: number;
  estimatedVbytes: number;
  totalInputSats: number;
  changeAddress: string | null;
  changeSats: number;
  changeAddressUsage?: "used" | "unused" | "unknown" | null;
  changeAddressWarning?: string | null;
};

export type FeeEstimatesResponse = {
  status: "online" | "unavailable";
  estimates: {
    fastestFee: number | null;
    halfHourFee: number | null;
    hourFee: number | null;
    economyFee: number | null;
    minimumFee: number | null;
  } | null;
  source?: "recommended" | "precise" | "init-data" | "projected-blocks" | null;
  diagnostic?: string | null;
  error?: string;
};

export function resolveFeeEstimateUiState(response: FeeEstimatesResponse): {
  estimates: FeeEstimatesResponse["estimates"];
  message: string;
} {
  if (response.status !== "online" || !response.estimates) {
    return {
      estimates: null,
      message: response.error ?? response.diagnostic ?? "Fee estimates unavailable. Enter a custom fee rate."
    };
  }

  return {
    estimates: response.estimates,
    message:
      response.source === "projected-blocks"
        ? "Local mempool estimate derived from current projected mempool blocks."
        : ""
  };
}

export function mapSelectedUtxosForPsbt(
  selectedUtxos: Array<Pick<WalletUtxo, "txid" | "vout">>
): Array<{ txid: string; vout: number }> | undefined {
  return selectedUtxos.length
    ? selectedUtxos.map((utxo) => ({ txid: utxo.txid, vout: utxo.vout }))
    : undefined;
}

export function selectFeePresetRate(
  estimates: FeeEstimatesResponse["estimates"] | null,
  kind: "fastest" | "medium" | "slow"
): number | null {
  if (!estimates) {
    return null;
  }
  if (kind === "fastest") {
    return estimates.fastestFee;
  }
  if (kind === "medium") {
    return estimates.halfHourFee ?? estimates.hourFee;
  }
  return estimates.hourFee ?? estimates.economyFee ?? estimates.minimumFee;
}

export function formatFeeRate(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "";
  }
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return rounded.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
    useGrouping: false
  });
}

export function feeEstimateSourceLabel(source: FeeEstimatesResponse["source"]): string {
  if (source === "recommended" || source === "precise" || source === "init-data" || source === "projected-blocks") {
    return "Local mempool estimate";
  }
  return "Local mempool unavailable - manual entry required";
}

export function isUsedEmptyReceiveAddress(address: DerivedAddress): boolean {
  if (address.chain !== "receive" || address.usage !== "used") {
    return false;
  }

  const totalBalance =
    typeof address.totalBalance === "number"
      ? address.totalBalance
      : typeof address.confirmedBalance === "number" || typeof address.unconfirmedBalance === "number"
        ? (address.confirmedBalance ?? 0) + (address.unconfirmedBalance ?? 0)
        : null;

  return totalBalance === 0;
}

export function selectDefaultReceiveAddresses(
  addresses: DerivedAddress[],
  displayLimit: number
): DerivedAddress[] {
  const limit = Math.max(0, displayLimit);
  const visibleReceiveAddresses = addresses.filter(
    (address) => address.chain === "receive" && !isUsedEmptyReceiveAddress(address)
  );
  const unused = visibleReceiveAddresses.filter((address) => address.usage === "unused");

  if (unused.length >= limit) {
    return unused.slice(0, limit);
  }

  const selected = [...unused];
  for (const address of visibleReceiveAddresses) {
    if (selected.length >= limit) {
      break;
    }
    if (!selected.some((selectedAddress) => selectedAddress.chain === address.chain && selectedAddress.index === address.index && selectedAddress.address === address.address)) {
      selected.push(address);
    }
  }
  return selected;
}

export function formatTransactionStatus(tx: Pick<WalletTransaction, "status" | "confirmations">): string {
  if (tx.status !== "confirmed" || typeof tx.confirmations !== "number" || tx.confirmations < 1) {
    return tx.status;
  }
  return `confirmed · ${tx.confirmations} ${tx.confirmations === 1 ? "confirmation" : "confirmations"}`;
}

export async function copyTextToClipboard(text: string): Promise<"clipboard" | "fallback"> {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return "clipboard";
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    if (!document.execCommand?.("copy")) {
      throw new Error("copy command rejected");
    }
    return "fallback";
  } finally {
    textarea.remove();
  }
}

export const SIGNED_PSBT_SINGLE_QR_MAX_CHARS = 2950;
export const SIGNED_PSBT_QR_TOO_LARGE_MESSAGE =
  "This signed PSBT may be too large for single-frame QR. Use file upload or paste for now.";
export const SIGNED_PSBT_CAMERA_FALLBACK_MESSAGE =
  "Camera scanning requires HTTPS, localhost, or a trusted tunnel such as Tailscale Serve. You can still paste or upload a signed PSBT manually.";
export const SIGNED_PSBT_UNSUPPORTED_UR_MESSAGE =
  "Signed PSBT UR import requires ur:crypto-psbt. Use base64, pNofM multipart text, or a signed PSBT file for other formats.";

export function isSignedPsbtSingleQrCandidate(payload: string): boolean {
  return payload.trim().length > 0 && payload.trim().length <= SIGNED_PSBT_SINGLE_QR_MAX_CHARS;
}

function extractSignedPsbtBase64Payload(payload: string): {
  psbtBase64: string | null;
  message: string;
  unsupported: boolean;
  invalid: boolean;
} {
  const trimmed = payload.trim();
  const compact = trimmed.replace(/\s+/g, "");
  const lower = trimmed.toLowerCase();

  if (!trimmed) {
    return {
      psbtBase64: null,
      message: "QR scan was empty. Keep the signed PSBT QR in view.",
      unsupported: false,
      invalid: true
    };
  }

  if (lower.startsWith("ur:crypto-psbt")) {
    return {
      psbtBase64: null,
      message: "Multipart signed PSBT QR detected, but this format is not supported yet. Use base64 PSBT QR, paste, or file import.",
      unsupported: true,
      invalid: false
    };
  }

  if (trimmed.startsWith("B$")) {
    return {
      psbtBase64: null,
      message: "Multipart signed PSBT QR detected, but this format is not supported yet. Use base64 PSBT QR, paste, or file import.",
      unsupported: true,
      invalid: false
    };
  }

  const psbtPrefix = trimmed.match(/^psbt:\s*(.+)$/i);
  if (psbtPrefix?.[1]) {
    return classifySignedPsbtBase64Candidate(psbtPrefix[1], "Signed PSBT QR detected. Verifying signed PSBT...");
  }

  if (lower.startsWith("bitcoin:")) {
    try {
      const query = trimmed.includes("?") ? trimmed.slice(trimmed.indexOf("?")) : "";
      const params = new URLSearchParams(query);
      const psbt = params.get("psbt");
      if (psbt) {
        return classifySignedPsbtBase64Candidate(decodeURIComponent(psbt), "Signed PSBT QR detected. Verifying signed PSBT...");
      }
    } catch {
      return {
        psbtBase64: null,
        message: "Invalid PSBT QR payload. Use base64 PSBT QR, paste, or file import.",
        unsupported: false,
        invalid: true
      };
    }
  }

  return classifySignedPsbtBase64Candidate(compact, "Signed PSBT QR detected. Verifying signed PSBT...");
}

function classifySignedPsbtBase64Candidate(candidate: string, successMessage: string) {
  const compact = candidate.trim().replace(/\s+/g, "");
  if (!compact.startsWith("cHNidP8B")) {
    return {
      psbtBase64: null,
      message: "QR scanned, but it is not a supported signed PSBT payload. Use a base64 PSBT QR or paste/file import.",
      unsupported: true,
      invalid: false
    };
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(compact)) {
    return {
      psbtBase64: null,
      message: "Invalid PSBT QR payload. Use base64 PSBT QR, paste, or file import.",
      unsupported: false,
      invalid: true
    };
  }
  return {
    psbtBase64: compact,
    message: successMessage,
    unsupported: false,
    invalid: false
  };
}

export function formatSecurityAddressDisplay(address: string): string {
  const raw = address.trim();
  if (!raw) return "";

  const bech32Prefix = raw.match(/^(bc1|tb1|bcrt1)[qp]/i)?.[0] ?? "";
  const prefix = bech32Prefix || (raw.length > 12 ? raw.slice(0, 4) : "");
  const body = prefix ? raw.slice(prefix.length) : raw;
  const sections = body.match(/.{1,8}/g) ?? [];
  const groupedSections = sections.map((section) => section.match(/.{1,4}/g)?.join(" ") ?? section);

  return [prefix, ...groupedSections].filter(Boolean).join(" · ");
}

function SecurityAddress({
  address,
  unavailableText = "address unavailable"
}: {
  address: string | null | undefined;
  unavailableText?: string;
}) {
  const rawAddress = address?.trim() ?? "";
  if (!rawAddress) {
    return <span className="security-address security-address-unavailable">{unavailableText}</span>;
  }

  return (
    <code className="security-address" data-raw-address={rawAddress} title={rawAddress}>
      {formatSecurityAddressDisplay(rawAddress)}
    </code>
  );
}

type VerifyPsbtResponse = {
  status: "valid" | "warning" | "invalid";
  signed: boolean;
  finalizable: boolean;
  extractable: boolean;
  txHex: string | null;
  txid: string | null;
  vsize: number | null;
  feeSats: number | null;
  feeRateSatsPerVbyte: number | null;
  inputs: Array<{
    txid: string;
    vout: number;
    valueSats: number | null;
    address: string | null;
    belongsToWallet: boolean;
  }>;
  outputs: Array<{
    address: string | null;
    valueSats: number;
    type: "recipient" | "change" | "external" | "unknown";
    belongsToWallet: boolean;
  }>;
  checks: {
    recipientMatches: boolean | null;
    amountMatches: boolean | null;
    changeAddressMatches: boolean | null;
    feeMatches: boolean | null;
    hasWalletChange: boolean;
    hasUnexpectedExternalOutputs: boolean;
  };
  warnings: string[];
  errors: string[];
};

type WalletTransactionsResponse = {
  walletId: string;
  chain: string;
  addressLimit: number;
  txLimit: number;
  pages: number;
  status: "online" | "partial" | "offline";
  transactions: WalletTransaction[];
  failedAddresses: Array<{
    address: string;
    chain: "receive" | "change";
    index: number;
    error: string;
  }>;
  scanSummary?: WalletScanSummary;
  mempool: {
    mode: string;
    url: string;
    cacheTtlSeconds: number;
  };
};

type ViewState = "loading" | "setup" | "verify-totp" | "login" | "dashboard";
type AuthMode = "signup" | "signin";
type StatusKind = "online" | "locked" | "degraded" | "offline";

type AuthShellProps = {
  apiUrl: string;
  initialWalletId?: string | null;
};

export function AuthShell({ apiUrl, initialWalletId = null }: AuthShellProps) {
  const [view, setView] = useState<ViewState>("loading");
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("signup");
  const [message, setMessage] = useState("");
  const [setupUsername, setSetupUsername] = useState("admin");
  const [setupPassword, setSetupPassword] = useState("");
  const [setupPasswordConfirm, setSetupPasswordConfirm] = useState("");
  const [setupTotpCode, setSetupTotpCode] = useState("");
  const [setupQr, setSetupQr] = useState<SetupResponse | null>(null);
  const [loginUsername, setLoginUsername] = useState("admin");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginTotpCode, setLoginTotpCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refreshSession();
  }, []);

  async function refreshSession() {
    setView("loading");
    setMessage("");

    try {
      const nextSession = await apiRequest<SessionResponse>(apiUrl, "/api/auth/session");
      setSession(nextSession);

      if (nextSession.authenticated) {
        setView("dashboard");
      } else if (nextSession.setupComplete) {
        setAuthMode("signin");
        setView("login");
      } else {
        setAuthMode("signup");
        setView("setup");
      }
    } catch (error) {
      console.error("Atlas session request failed", {
        url: buildApiUrl(apiUrl, "/api/auth/session"),
        error
      });
      setMessage(error instanceof Error ? error.message : "Unable to reach the API");
      setAuthMode("signup");
      setView("setup");
    }
  }

  function showSignup() {
    setMessage("");
    setAuthMode("signup");
    setView("setup");
  }

  function showSignin() {
    setMessage("");
    setAuthMode("signin");
    setView("login");
  }

  async function handleSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const response = await apiRequest<SetupResponse>(apiUrl, "/api/auth/setup", {
        method: "POST",
        body: JSON.stringify({
          username: setupUsername,
          password: setupPassword,
          passwordConfirm: setupPasswordConfirm
        })
      });
      setSetupQr(response);
      setView("verify-totp");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const nextSession = await apiRequest<SessionResponse>(apiUrl, "/api/auth/totp/verify", {
        method: "POST",
        body: JSON.stringify({
          username: setupUsername,
          password: setupPassword,
          totpCode: setupTotpCode
        })
      });
      setSession(nextSession);
      setSetupPassword("");
      setSetupPasswordConfirm("");
      setSetupTotpCode("");
      if (window.location.pathname !== "/") {
        window.location.assign("/");
        return;
      }
      setView("dashboard");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "TOTP verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const form = event.currentTarget;
    const submittedUsername = readFormInput(form, "username") ?? loginUsername;
    const submittedPassword = readFormInput(form, "password") ?? loginPassword;
    const submittedTotpCode = readFormInput(form, "totpCode") ?? loginTotpCode;

    try {
      const nextSession = await apiRequest<SessionResponse>(apiUrl, "/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: submittedUsername,
          password: submittedPassword,
          totpCode: submittedTotpCode
        })
      });
      setSession(nextSession);
      setLoginUsername(submittedUsername);
      setLoginPassword("");
      setLoginTotpCode("");
      if (window.location.pathname !== "/") {
        window.location.assign("/");
        return;
      }
      setView("dashboard");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    setMessage("");

    try {
      await apiRequest(apiUrl, "/api/vault/lock", {
        method: "POST"
      }).catch(() => undefined);
      await apiRequest(apiUrl, "/api/auth/logout", {
        method: "POST"
      });
      setSession(null);
      if (window.location.pathname !== "/") {
        window.location.assign("/");
        return;
      }
      setView("login");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Logout failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <section className={view === "dashboard" ? "auth-panel app-panel" : "auth-panel"}>
        <div className="brand-row">
          <div>
            <h1>{view === "dashboard" ? (initialWalletId ? "Wallet detail" : "ATLAS") : "Secure access"}</h1>
          </div>
        </div>

        {message ? <p className="status-message">{message}</p> : null}

        {view === "loading" ? <p className="muted">Checking session...</p> : null}
        {view === "setup" || view === "login" ? (
          <AuthModeSwitch mode={authMode} onSignin={showSignin} onSignup={showSignup} />
        ) : null}
        {view === "setup" ? (
          <SetupForm
            busy={busy}
            username={setupUsername}
            password={setupPassword}
            passwordConfirm={setupPasswordConfirm}
            onSubmit={handleSetup}
            setUsername={setSetupUsername}
            setPassword={setSetupPassword}
            setPasswordConfirm={setSetupPasswordConfirm}
          />
        ) : null}
        {view === "verify-totp" ? (
          <TotpVerifyForm
            busy={busy}
            qr={setupQr}
            code={setupTotpCode}
            onSubmit={handleVerifyTotp}
            setCode={setSetupTotpCode}
          />
        ) : null}
        {view === "login" ? (
          <LoginForm
            busy={busy}
            username={loginUsername}
            password={loginPassword}
            totpCode={loginTotpCode}
            onSubmit={handleLogin}
            setUsername={setLoginUsername}
            setPassword={setLoginPassword}
            setTotpCode={setLoginTotpCode}
          />
        ) : null}
        {view === "dashboard" ? (
          <DashboardShell
            apiUrl={apiUrl}
            busy={busy}
            initialWalletId={initialWalletId}
            session={session}
            onLogout={handleLogout}
          />
        ) : null}
      </section>
    </main>
  );
}

function AuthModeSwitch({
  mode,
  onSignin,
  onSignup
}: {
  mode: AuthMode;
  onSignin: () => void;
  onSignup: () => void;
}) {
  return (
    <div className="auth-mode-switch">
      <button
        className={mode === "signup" ? "compact-button" : "secondary-button compact-button"}
        type="button"
        onClick={onSignup}
      >
        Sign up
      </button>
      <button
        className={mode === "signin" ? "compact-button" : "secondary-button compact-button"}
        type="button"
        onClick={onSignin}
      >
        Sign in
      </button>
    </div>
  );
}

function readFormInput(form: HTMLFormElement, name: string): string | null {
  const field = form.elements.namedItem(name);
  if (field instanceof HTMLInputElement) {
    return field.value;
  }
  return null;
}

export function normalizeSettingsLanguage(value: unknown): SettingsLanguage {
  return value === "ko" ? "ko" : "en";
}

function settingsText(language: SettingsLanguage, key: SettingsMessageKey): string {
  return SETTINGS_MESSAGES[normalizeSettingsLanguage(language)][key] ?? SETTINGS_MESSAGES.en[key];
}

function formatYesNo(value: boolean, language: SettingsLanguage): string {
  if (language === "ko") {
    return value ? "예" : "아니오";
  }
  return value ? "yes" : "no";
}

function StatusBadge({
  label,
  status
}: {
  label: string;
  status: StatusKind;
}) {
  const statusText: Record<StatusKind, string> = {
    degraded: "Degraded",
    locked: "Locked",
    offline: "Offline",
    online: "Online"
  };
  return <span className={`status-badge status-${status}`}>{label} {statusText[status]}</span>;
}
function TerminalSkeleton({ label, rows }: { label: string; rows: number }) {
  return (
    <div className="terminal-panel skeleton-panel" aria-busy="true">
      <p className="terminal-heading">{label}</p>
      {Array.from({ length: rows }, (_, index) => (
        <span className="skeleton-line" key={index} />
      ))}
    </div>
  );
}

function SetupForm({
  busy,
  username,
  password,
  passwordConfirm,
  onSubmit,
  setUsername,
  setPassword,
  setPasswordConfirm
}: {
  busy: boolean;
  username: string;
  password: string;
  passwordConfirm: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  setUsername: (value: string) => void;
  setPassword: (value: string) => void;
  setPasswordConfirm: (value: string) => void;
}) {
  return (
    <form className="form-stack" onSubmit={onSubmit}>
      <label>
        <span>Username</span>
        <input
          autoComplete="username"
          minLength={3}
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </label>
      <label>
        <span>Password</span>
        <input
          autoComplete="new-password"
          minLength={12}
          required
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <label>
        <span>Confirm password</span>
        <input
          autoComplete="new-password"
          minLength={12}
          required
          type="password"
          value={passwordConfirm}
          onChange={(event) => setPasswordConfirm(event.target.value)}
        />
      </label>
      <button disabled={busy} type="submit">
        Create admin
      </button>
    </form>
  );
}

function TotpVerifyForm({
  busy,
  qr,
  code,
  onSubmit,
  setCode
}: {
  busy: boolean;
  qr: SetupResponse | null;
  code: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  setCode: (value: string) => void;
}) {
  return (
    <form className="form-stack" onSubmit={onSubmit}>
      {qr ? (
        <div className="qr-box">
          <img alt="TOTP setup QR code" height={240} src={qr.qrCodeDataUrl} width={240} />
        </div>
      ) : null}
      <label>
        <span>6-digit code</span>
        <input
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={6}
          minLength={6}
          pattern="[0-9]{6}"
          required
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
      </label>
      <button disabled={busy} type="submit">
        Verify TOTP
      </button>
    </form>
  );
}

function LoginForm({
  busy,
  username,
  password,
  totpCode,
  onSubmit,
  setUsername,
  setPassword,
  setTotpCode
}: {
  busy: boolean;
  username: string;
  password: string;
  totpCode: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  setUsername: (value: string) => void;
  setPassword: (value: string) => void;
  setTotpCode: (value: string) => void;
}) {
  return (
    <form className="form-stack" onSubmit={onSubmit}>
      <label>
        <span>Username</span>
        <input
          autoComplete="username"
          name="username"
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </label>
      <label>
        <span>Password</span>
        <input
          autoComplete="current-password"
          name="password"
          required
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <label>
        <span>TOTP code</span>
        <input
          autoComplete="one-time-code"
          inputMode="numeric"
          name="totpCode"
          maxLength={6}
          minLength={6}
          pattern="[0-9]{6}"
          required
          value={totpCode}
          onChange={(event) => setTotpCode(event.target.value)}
        />
      </label>
      <button disabled={busy} type="submit">
        Log in
      </button>
    </form>
  );
}

function DashboardShell({
  apiUrl,
  busy,
  initialWalletId,
  session,
  onLogout
}: {
  apiUrl: string;
  busy: boolean;
  initialWalletId?: string | null;
  session: SessionResponse | null;
  onLogout: () => void;
}) {
  return (
    <VaultWorkspace
      apiUrl={apiUrl}
      initialWalletId={initialWalletId}
      session={session}
      shellBusy={busy}
      onLogout={onLogout}
    />
  );
}

function AppSidebar({
  activeItem,
  onOpenSettings
}: {
  activeItem: "dashboard" | "import-wallet" | "settings" | null;
  onOpenSettings: () => void;
}) {
  const dashboardActive = activeItem === "dashboard";
  const importWalletActive = activeItem === "import-wallet";
  const settingsActive = activeItem === "settings";

  return (
    <aside className="app-sidebar" aria-label="Navigation">
      <nav className="sidebar-nav">
        <a
          aria-current={dashboardActive ? "page" : undefined}
          className={dashboardActive ? "sidebar-link is-active" : "sidebar-link"}
          href="/"
        >
          Dashboard
        </a>
        <a
          aria-current={importWalletActive ? "page" : undefined}
          className={importWalletActive ? "sidebar-link is-active" : "sidebar-link"}
          href="/#import-wallet"
        >
          Import wallet
        </a>
        <button
          type="button"
          aria-pressed={settingsActive}
          className={settingsActive ? "sidebar-link is-active" : "sidebar-link"}
          onClick={onOpenSettings}
        >
          Settings
        </button>
      </nav>
    </aside>
  );
}
function VaultWorkspace({
  apiUrl,
  initialWalletId = null,
  session,
  shellBusy,
  onLogout
}: {
  apiUrl: string;
  initialWalletId?: string | null;
  session: SessionResponse | null;
  shellBusy: boolean;
  onLogout: () => void;
}) {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [mempoolStatus, setMempoolStatus] = useState<MempoolStatusResponse | null>(null);
  const [mempoolStatusError, setMempoolStatusError] = useState("");
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettingsResponse | null>(null);
  const [fulcrumStatus, setFulcrumStatus] = useState<FulcrumStatusResponse | null>(null);
  const [wallets, setWallets] = useState<WalletRecord[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLanguage, setSettingsLanguage] = useState<SettingsLanguage>("en");
  const [dashboardBalanceUnit, setDashboardBalanceUnit] = useState<BalanceUnit>("btc");
  const [showKrwEstimate, setShowKrwEstimate] = useState(true);
  const [importContextActive, setImportContextActive] = useState(false);
  const detailWalletId = initialWalletId ? decodeURIComponent(initialWalletId) : null;

  useEffect(() => {
    void refreshVault();
  }, []);

  useEffect(() => {
    function syncImportContext() {
      setImportContextActive(window.location.hash === "#import-wallet");
    }

    syncImportContext();
    window.addEventListener("hashchange", syncImportContext);
    return () => window.removeEventListener("hashchange", syncImportContext);
  }, []);

  async function refreshVault() {
    setMessage("");

    try {
      void refreshMempoolStatus();
      const nextStatus = await apiRequest<VaultStatus>(apiUrl, "/api/vault/status");
      setStatus(nextStatus);
      if (nextStatus.unlocked) {
        const response = await apiRequest<{ wallets: WalletRecord[] }>(apiUrl, "/api/wallets");
        setWallets(response.wallets);
      } else {
        setWallets([]);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load vault");
    }
  }

  async function refreshMempoolStatus() {
    const [statusResult, settingsResult, fulcrumResult] = await Promise.allSettled([
      apiRequest<MempoolStatusResponse>(apiUrl, "/api/status/mempool"),
      apiRequest<RuntimeSettingsResponse>(apiUrl, "/api/settings/runtime"),
      apiRequest<FulcrumStatusResponse>(apiUrl, "/api/status/fulcrum")
    ]);

    if (statusResult.status === "fulfilled") {
      setMempoolStatus(statusResult.value);
      setMempoolStatusError("");
    } else {
      setMempoolStatus(null);
      setMempoolStatusError(
        statusResult.reason instanceof Error ? statusResult.reason.message : "Mempool status unavailable"
      );
    }

    if (settingsResult.status === "fulfilled") {
      setRuntimeSettings(settingsResult.value);
    } else {
      setRuntimeSettings(null);
    }

    if (fulcrumResult.status === "fulfilled") {
      setFulcrumStatus(fulcrumResult.value);
    } else {
      setFulcrumStatus(null);
    }
  }

  async function handleInit(vaultPassword: string) {
    setBusy(true);
    setMessage("");

    try {
      const nextStatus = await apiRequest<VaultStatus>(apiUrl, "/api/vault/init", {
        method: "POST",
        body: JSON.stringify({ vaultPassword })
      });
      setStatus(nextStatus);
      setWallets([]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Vault initialization failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlock(vaultPassword: string) {
    setBusy(true);
    setMessage("");

    try {
      await apiRequest<VaultStatus>(apiUrl, "/api/vault/unlock", {
        method: "POST",
        body: JSON.stringify({ vaultPassword })
      });
      await refreshVault();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Vault unlock failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleLock() {
    setBusy(true);
    setMessage("");

    try {
      const nextStatus = await apiRequest<VaultStatus>(apiUrl, "/api/vault/lock", {
        method: "POST"
      });
      setStatus(nextStatus);
      setWallets([]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Vault lock failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateWallet(input: {
    name: string;
    importText: string;
    network: WalletRecord["network"];
    sourceDevice: SourceDevice;
    scriptType: WalletScriptType;
    notes: string | null;
    gapLimit: number;
  }) {
    setBusy(true);
    setMessage("");

    try {
      const response = await apiRequest<{ wallet: WalletRecord }>(apiUrl, "/api/wallets", {
        method: "POST",
        body: JSON.stringify(input)
      });
      setWallets((current) => [...current, response.wallet]);
      setStatus((current) =>
        current ? { ...current, walletCount: (current.walletCount ?? 0) + 1 } : current
      );
      await refreshVault();
      setMessage("Wallet saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet registration failed");
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateWallet(id: string, input: { name: string; gapLimit: number }) {
    setBusy(true);
    setMessage("");

    try {
      const response = await apiRequest<{ wallet: WalletRecord }>(apiUrl, `/api/wallets/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input)
      });
      setWallets((current) =>
        current.map((wallet) => (wallet.id === response.wallet.id ? response.wallet : wallet))
      );
      await refreshVault();
      setMessage("Wallet updated");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet update failed");
      throw error;
    } finally {
      setBusy(false);
    }
  }

  function handleReplaceWallet(updatedWallet: WalletRecord) {
    setWallets((current) =>
      current.map((wallet) => (wallet.id === updatedWallet.id ? updatedWallet : wallet))
    );
  }

  async function handleDeleteWallet(id: string) {
    setBusy(true);
    setMessage("");

    try {
      await apiRequest(apiUrl, `/api/wallets/${id}`, {
        method: "DELETE"
      });
      setWallets((current) => current.filter((wallet) => wallet.id !== id));
      setStatus((current) =>
        current ? { ...current, walletCount: Math.max((current.walletCount ?? 1) - 1, 0) } : current
      );
      await refreshVault();
      setMessage("Wallet deleted");
      if (detailWalletId === id) {
        window.location.assign("/");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet delete failed");
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return <TerminalSkeleton label="LOADING VAULT" rows={3} />;
  }

  const detailWallet =
    detailWalletId ? wallets.find((wallet) => wallet.id === detailWalletId) ?? null : null;
  const mempoolBadgeStatus: StatusKind =
    mempoolStatus?.status === "online"
      ? "online"
      : mempoolStatus?.status === "offline" || mempoolStatusError
        ? "offline"
        : "degraded";

  if (!status.initialized) {
    return (
      <div className="vault-gate">
        <div className="toolbar-row dashboard-toolbar-panel">
          <p className="muted">Signed in as {session?.user?.username ?? "admin"}</p>
          <button className="secondary-button compact-button" disabled={shellBusy} type="button" onClick={onLogout}>
            Log out
          </button>
        </div>
        {message ? <p className="status-message">{message}</p> : null}
        <VaultInitForm busy={busy} onSubmit={handleInit} />
      </div>
    );
  }

  if (!status.unlocked) {
    return (
      <div className="vault-gate">
        <div className="toolbar-row dashboard-toolbar-panel">
          <p className="muted">Signed in as {session?.user?.username ?? "admin"}</p>
          <button className="secondary-button compact-button" disabled={shellBusy} type="button" onClick={onLogout}>
            Log out
          </button>
        </div>
        {message ? <p className="status-message">{message}</p> : null}
        <VaultUnlockForm busy={busy} onSubmit={handleUnlock} />
      </div>
    );
  }

  return (
    <div className="dashboard-shell">
      <AppSidebar
        activeItem={
          settingsOpen
            ? "settings"
            : importContextActive
              ? "import-wallet"
              : "dashboard"
        }
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className="dashboard-main">
        <div className="toolbar-row dashboard-toolbar-panel">
          <p className="muted">Signed in as {session?.user?.username ?? "admin"}</p>
          <div className="button-row">
            {initialWalletId ? (
              <a className="secondary-button compact-button" href="/">
                Back to dashboard
              </a>
            ) : null}
            <button className="secondary-button compact-button" type="button" onClick={() => setSettingsOpen(true)}>
              {settingsText(settingsLanguage, "settings.button")}
            </button>
            <button className="secondary-button compact-button" disabled={busy} type="button" onClick={handleLock}>
              Lock vault
            </button>
            <button className="secondary-button compact-button" disabled={shellBusy} type="button" onClick={onLogout}>
              Log out
            </button>
          </div>
        </div>
        <div className="vault-workspace">
          {message ? <p className="status-message">{message}</p> : null}
          {detailWalletId ? (
            detailWallet ? (
              <WalletDetailView
                apiUrl={apiUrl}
                fulcrumStatus={fulcrumStatus}
                mempoolBadgeStatus={mempoolBadgeStatus}
                mempoolStatus={mempoolStatus}
                mempoolStatusError={mempoolStatusError}
                runtimeSettings={runtimeSettings}
                wallet={detailWallet}
                onRefreshConnection={refreshMempoolStatus}
                onWalletChange={handleReplaceWallet}
              />
            ) : (
              <div className="terminal-panel empty-state">
                <p className="terminal-heading">Wallet not found</p>
                <p className="muted">This vault does not contain the requested wallet.</p>
                <a className="secondary-button compact-button" href="/">
                  Back to dashboard
                </a>
              </div>
            )
          ) : (
            <>
              <DashboardBalanceHero
                apiUrl={apiUrl}
                defaultBalanceUnit={dashboardBalanceUnit}
                showKrwEstimate={showKrwEstimate}
                wallets={wallets}
              />
              <WalletList
                apiUrl={apiUrl}
                busy={busy}
                wallets={wallets}
                onDelete={handleDeleteWallet}
                onUpdate={handleUpdateWallet}
              />
              <WalletCreateForm
                apiUrl={apiUrl}
                busy={busy}
                vaultUnlocked={true}
                onSubmit={handleCreateWallet}
              />
            </>
          )}
        </div>
      </div>
      {settingsOpen ? (
        <SettingsModal
          apiUrl={apiUrl}
          balanceUnit={dashboardBalanceUnit}
          busy={busy}
          language={settingsLanguage}
          mempoolStatus={mempoolStatus}
          runtimeSettings={runtimeSettings}
          session={session}
          showKrwEstimate={showKrwEstimate}
          vaultStatus={status}
          onBalanceUnitChange={setDashboardBalanceUnit}
          onClose={() => setSettingsOpen(false)}
          onLanguageChange={(nextLanguage) => setSettingsLanguage(normalizeSettingsLanguage(nextLanguage))}
          onLockVault={async () => {
            await handleLock();
            setSettingsOpen(false);
          }}
          onShowKrwEstimateChange={setShowKrwEstimate}
        />
      ) : null}
    </div>
  );
}

export function SettingsModal({
  apiUrl,
  balanceUnit,
  busy,
  language,
  mempoolStatus,
  runtimeSettings,
  session,
  showKrwEstimate,
  vaultStatus,
  onBalanceUnitChange,
  onClose,
  onLanguageChange,
  onLockVault,
  onShowKrwEstimateChange
}: {
  apiUrl: string;
  balanceUnit: BalanceUnit;
  busy: boolean;
  language: SettingsLanguage;
  mempoolStatus: MempoolStatusResponse | null;
  runtimeSettings: RuntimeSettingsResponse | null;
  session: SessionResponse | null;
  showKrwEstimate: boolean;
  vaultStatus: VaultStatus | null;
  onBalanceUnitChange: (unit: BalanceUnit) => void;
  onClose: () => void;
  onLanguageChange: (language: SettingsLanguage) => void;
  onLockVault: () => Promise<void>;
  onShowKrwEstimateChange: (show: boolean) => void;
}) {
  const [apiHealth, setApiHealth] = useState<AppStatusResponse | null>(null);
  const [apiHealthState, setApiHealthState] = useState<"loading" | "online" | "offline">("loading");
  const [marketPrice, setMarketPrice] = useState<MarketPriceResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refreshSettingsStatus() {
      const [healthResult, marketResult] = await Promise.allSettled([
        apiRequest<AppStatusResponse>(apiUrl, "/api/status"),
        apiRequest<MarketPriceResponse>(apiUrl, "/api/market/btc-krw")
      ]);

      if (cancelled) {
        return;
      }

      if (healthResult.status === "fulfilled") {
        setApiHealth(healthResult.value);
        setApiHealthState("online");
      } else {
        setApiHealth(null);
        setApiHealthState("offline");
      }

      if (marketResult.status === "fulfilled") {
        setMarketPrice(marketResult.value);
      } else {
        setMarketPrice({
          market: "KRW-BTC",
          priceKrw: null,
          source: "upbit",
          checkedAt: new Date().toISOString(),
          status: "offline",
          error: "price-unavailable"
        });
      }
    }

    void refreshSettingsStatus();

    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  const t = (key: SettingsMessageKey) => settingsText(language, key);
  const apiMode = describeApiConnectionMode(apiUrl);
  const broadcastBackend = runtimeSettings?.broadcastBackend === "core" ? "Bitcoin Core" : "disabled";
  const appVersion =
    apiHealth?.commit || apiHealth?.version
      ? [apiHealth.version, apiHealth.commit].filter(Boolean).join(" / ")
      : "not embedded";
  const dockerStatus =
    apiMode === "same-origin"
      ? "Configured for same-origin mode. Runtime verification requires scripts/check-raspi-runtime.sh."
      : "Direct API mode. Runtime verification requires scripts/check-raspi-runtime.sh.";

  return (
    <PortalModal ariaLabel={t("settings.title")} panelClassName="settings-dialog" onClose={onClose}>
      <div className="settings-modal-header">
        <div>
          <p className="eyebrow">{t("settings.title")}</p>
          <h2>{t("settings.title")}</h2>
        </div>
        <button className="secondary-button compact-button" type="button" onClick={onClose}>
          {t("settings.close")}
        </button>
      </div>

      <div className="settings-modal-body">
        <section className="settings-section" aria-labelledby="settings-display">
          <h3 id="settings-display">{t("settings.display")}</h3>
          <div className="settings-row">
            <span>{t("settings.defaultBalanceUnit")}</span>
            <div className="segmented-control" aria-label={t("settings.defaultBalanceUnit")}>
              <button
                aria-pressed={balanceUnit === "btc"}
                className={balanceUnit === "btc" ? "compact-button" : "secondary-button compact-button"}
                type="button"
                onClick={() => onBalanceUnitChange("btc")}
              >
                BTC
              </button>
              <button
                aria-pressed={balanceUnit === "sats"}
                className={balanceUnit === "sats" ? "compact-button" : "secondary-button compact-button"}
                type="button"
                onClick={() => onBalanceUnitChange("sats")}
              >
                sats
              </button>
            </div>
          </div>
          <label className="settings-row settings-toggle-row">
            <span>{t("settings.showKrw")}</span>
            <input
              checked={showKrwEstimate}
              type="checkbox"
              onChange={(event) => onShowKrwEstimateChange(event.currentTarget.checked)}
            />
          </label>
        </section>

        <section className="settings-section" aria-labelledby="settings-security">
          <h3 id="settings-security">{t("settings.security")}</h3>
          <SettingsValue label={t("settings.vaultStatus")} value={vaultStatus?.unlocked ? "unlocked" : "locked"} />
          <SettingsValue
            label={t("settings.autoLock")}
            value={vaultStatus?.autoLockMinutes ? `${vaultStatus.autoLockMinutes} minutes` : "not configured"}
          />
          <SettingsValue label={t("settings.totp")} value={formatYesNo(Boolean(session?.setupComplete), language)} />
          <SettingsValue label={t("settings.watchOnly")} value="enforced" />
          <p className="settings-note">Atlas does not store seed phrases or private keys. Atlas cannot sign transactions.</p>
          <button
            className="secondary-button compact-button"
            disabled={busy || !vaultStatus?.unlocked}
            type="button"
            onClick={() => void onLockVault()}
          >
            {t("settings.lockVaultNow")}
          </button>
        </section>

        <section className="settings-section" aria-labelledby="settings-network">
          <h3 id="settings-network">{t("settings.network")}</h3>
          <SettingsValue label={t("settings.mempoolStatus")} value={mempoolStatus?.status ?? "unavailable"} />
          <SettingsValue label={t("settings.marketStatus")} value={marketPrice?.status ?? "unavailable"} />
          <SettingsValue label={t("settings.apiMode")} value={apiMode} />
          <SettingsValue
            label={t("settings.tipHeight")}
            value={mempoolStatus?.tipHeight ? String(mempoolStatus.tipHeight) : "unavailable"}
          />
        </section>

        <section className="settings-section" aria-labelledby="settings-broadcast">
          <h3 id="settings-broadcast">{t("settings.broadcast")}</h3>
          <SettingsValue label={t("settings.backend")} value={broadcastBackend} />
          <SettingsValue
            label={t("settings.localMempool")}
            value={formatYesNo(Boolean(runtimeSettings?.mempoolWebUrlConfigured), language)}
          />
          <SettingsValue label={t("settings.publicFallback")} value="disabled" />
          <p className="settings-note">
            Atlas broadcasts only valid signed transactions. Atlas does not sign. Unsigned, invalid, or warning PSBTs cannot be broadcast.
          </p>
        </section>

        <section className="settings-section" aria-labelledby="settings-backup">
          <h3 id="settings-backup">{t("settings.backup")}</h3>
          <SettingsValue label={t("settings.walletsLocation")} value="apps/api/data/wallets.enc" />
          <SettingsValue label={t("settings.backupChecklist")} value="docs/backup-restore.md" />
          <p className="settings-note">
            Back up wallets.enc and auth.json securely. Do not store the vault password next to backups.
          </p>
        </section>

        <section className="settings-section" aria-labelledby="settings-diagnostics">
          <h3 id="settings-diagnostics">{t("settings.diagnostics")}</h3>
          <SettingsValue label={t("settings.appVersion")} value={appVersion} />
          <SettingsValue label={t("settings.apiHealth")} value={apiHealthState} />
          <SettingsValue label={t("settings.dockerStatus")} value={dockerStatus} />
        </section>

        <section className="settings-section" aria-labelledby="settings-language">
          <h3 id="settings-language">{t("settings.language")}</h3>
          <div className="segmented-control" aria-label={t("settings.language")}>
            <button
              aria-pressed={language === "ko"}
              className={language === "ko" ? "compact-button" : "secondary-button compact-button"}
              type="button"
              onClick={() => onLanguageChange("ko")}
            >
              한국어
            </button>
            <button
              aria-pressed={language === "en"}
              className={language === "en" ? "compact-button" : "secondary-button compact-button"}
              type="button"
              onClick={() => onLanguageChange("en")}
            >
              English
            </button>
          </div>
        </section>
      </div>
    </PortalModal>
  );
}

function SettingsValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="settings-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function DashboardBalanceHero({
  apiUrl,
  defaultBalanceUnit = "btc",
  showKrwEstimate = true,
  wallets
}: {
  apiUrl: string;
  defaultBalanceUnit?: BalanceUnit;
  showKrwEstimate?: boolean;
  wallets: WalletRecord[];
}) {
  const [totalBalanceSats, setTotalBalanceSats] = useState<number | null>(null);
  const [balanceState, setBalanceState] = useState<"loading" | "ready" | "partial" | "offline">("loading");
  const [balanceUnit, setBalanceUnit] = useState<BalanceUnit>(defaultBalanceUnit);
  const [marketPrice, setMarketPrice] = useState<MarketPriceResponse | null>(null);

  useEffect(() => {
    setBalanceUnit(defaultBalanceUnit);
  }, [defaultBalanceUnit]);

  useEffect(() => {
    let cancelled = false;

    if (wallets.length === 0) {
      setTotalBalanceSats(0);
      setBalanceState("ready");
      return;
    }

    setBalanceState("loading");
    void Promise.allSettled(
      wallets.map((wallet) =>
        apiRequest<WalletBalanceResponse>(
          apiUrl,
          `/api/wallets/${wallet.id}/balance?chain=both&limit=${wallet.gapLimit}`
        )
      )
    ).then((results) => {
      if (cancelled) {
        return;
      }
      const fulfilled = results.filter(
        (result): result is PromiseFulfilledResult<WalletBalanceResponse> => result.status === "fulfilled"
      );
      setTotalBalanceSats(fulfilled.reduce((sum, result) => sum + result.value.totalBalance, 0));
      setBalanceState(
        fulfilled.length === results.length
          ? "ready"
          : fulfilled.length > 0
            ? "partial"
            : "offline"
      );
    });

    return () => {
      cancelled = true;
    };
  }, [apiUrl, wallets]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    async function refreshPrice() {
      try {
        const price = await apiRequest<MarketPriceResponse>(apiUrl, "/api/market/btc-krw");
        if (!cancelled) {
          setMarketPrice(price);
        }
      } catch {
        if (!cancelled) {
          setMarketPrice((previous) => previous
            ? { ...previous, status: "stale", error: "price-unavailable" }
            : {
                market: "KRW-BTC",
                priceKrw: null,
                source: "upbit",
                checkedAt: new Date().toISOString(),
                status: "offline",
                error: "price-unavailable"
              });
        }
      }
    }

    void refreshPrice();
    timer = window.setInterval(() => {
      void refreshPrice();
    }, 5_000);

    return () => {
      cancelled = true;
      if (timer !== null) {
        window.clearInterval(timer);
      }
    };
  }, [apiUrl]);

  const statusText =
    balanceState === "loading"
      ? "Syncing balances"
      : balanceState === "partial"
        ? "Partial balance data"
        : balanceState === "offline"
          ? "Balance unavailable"
          : "";

  return (
    <section className="dashboard-hero" aria-label="Wallet balance overview">
      <div className="dashboard-hero-content">
        <div>
          <p className="eyebrow">Total Balance</p>
          <p className="hero-balance">
            {balanceState === "loading" ? "Syncing..." : formatBalance(totalBalanceSats ?? 0, balanceUnit)}
          </p>
          {showKrwEstimate ? (
            <p className="hero-krw-price">
              {formatKrwBalance(totalBalanceSats ?? 0, marketPrice)}
            </p>
          ) : null}
          {statusText ? <p className="muted">{statusText}</p> : null}
        </div>
        <div className="balance-unit-toggle" aria-label="Total balance unit">
          <button
            aria-pressed={balanceUnit === "btc"}
            className={balanceUnit === "btc" ? "compact-button" : "secondary-button compact-button"}
            type="button"
            onClick={() => setBalanceUnit("btc")}
          >
            BTC
          </button>
          <button
            aria-pressed={balanceUnit === "sats"}
            className={balanceUnit === "sats" ? "compact-button" : "secondary-button compact-button"}
            type="button"
            onClick={() => setBalanceUnit("sats")}
          >
            sats
          </button>
        </div>
      </div>
    </section>
  );
}

function VaultInitForm({
  busy,
  onSubmit
}: {
  busy: boolean;
  onSubmit: (vaultPassword: string) => void;
}) {
  const [vaultPassword, setVaultPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localMessage, setLocalMessage] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (vaultPassword !== confirmPassword) {
      setLocalMessage("Vault passwords do not match");
      return;
    }

    setLocalMessage("");
    onSubmit(vaultPassword);
    setVaultPassword("");
    setConfirmPassword("");
  }

  return (
    <form className="form-stack vault-section" onSubmit={handleSubmit}>
      <h2>Initialize vault</h2>
      {localMessage ? <p className="status-message">{localMessage}</p> : null}
      <label>
        <span>Vault password</span>
        <input
          autoComplete="new-password"
          minLength={12}
          required
          type="password"
          value={vaultPassword}
          onChange={(event) => setVaultPassword(event.target.value)}
        />
      </label>
      <label>
        <span>Confirm vault password</span>
        <input
          autoComplete="new-password"
          minLength={12}
          required
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
      </label>
      <button disabled={busy} type="submit">
        Create encrypted vault
      </button>
    </form>
  );
}

function VaultUnlockForm({
  busy,
  onSubmit
}: {
  busy: boolean;
  onSubmit: (vaultPassword: string) => void;
}) {
  const [vaultPassword, setVaultPassword] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(vaultPassword);
    setVaultPassword("");
  }

  return (
    <form className="form-stack vault-section" onSubmit={handleSubmit}>
      <h2>Unlock vault</h2>
      <label>
        <span>Vault password</span>
        <input
          autoComplete="current-password"
          minLength={12}
          required
          type="password"
          value={vaultPassword}
          onChange={(event) => setVaultPassword(event.target.value)}
        />
      </label>
      <button disabled={busy} type="submit">
        Unlock
      </button>
    </form>
  );
}

export function WalletCreateForm({
  apiUrl,
  busy,
  vaultUnlocked,
  onSubmit
}: {
  apiUrl: string;
  busy: boolean;
  vaultUnlocked: boolean;
  onSubmit: (input: {
    name: string;
    importText: string;
    network: WalletRecord["network"];
    sourceDevice: SourceDevice;
    scriptType: WalletScriptType;
    notes: string | null;
    gapLimit: number;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [importText, setImportText] = useState("");
  const [sourceDevice, setSourceDevice] = useState<SourceDevice>("other");
  const [network, setNetwork] = useState<WalletRecord["network"]>("mainnet");
  const [scriptType, setScriptType] = useState<WalletScriptType>("unknown");
  const [notes, setNotes] = useState("");
  const [importMethod, setImportMethod] = useState<"paste" | "file" | "qr">("paste");
  const [gapLimit, setGapLimit] = useState(20);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerMessage, setScannerMessage] = useState("");
  const [qrFrames, setQrFrames] = useState<string[]>([]);
  const [qrFrameTotal, setQrFrameTotal] = useState<number | null>(null);
  const [qrFrameFormat, setQrFrameFormat] = useState<string>("");
  const [bbqrState, setBbqrState] = useState<BbqrCollectorState>(() => createBbqrCollectorState());
  const [scanEventCount, setScanEventCount] = useState(0);
  const [lastScanMetadata, setLastScanMetadata] = useState<BbqrSafeMetadata | null>(null);
  const [lastScanErrorCode, setLastScanErrorCode] = useState<string | null>(null);
  const [lastScanSource, setLastScanSource] = useState<"camera" | "manual" | "paste" | null>(null);
  const [manualBbqrFrame, setManualBbqrFrame] = useState("");
  const [hideImportPayload, setHideImportPayload] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [preview, setPreview] = useState<WalletImportPreviewResponse | null>(null);
  const [previewMessage, setPreviewMessage] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const scannerControls = useRef<IScannerControls | null>(null);
  const scannerVideo = useRef<HTMLVideoElement | null>(null);
  const bbqrStateRef = useRef<BbqrCollectorState>(createBbqrCollectorState());
  const detected = useMemo(() => detectImportMetadata(importText, network, sourceDevice), [
    importText,
    network,
    sourceDevice
  ]);
  const effectiveScriptType = scriptType !== "unknown" ? scriptType : detected.scriptType;
  const effectiveAccountPath = detected.accountPath ?? accountPathFor(effectiveScriptType, network);
  const networkMismatch =
    detected.network !== null &&
    !(detected.network === "testnet" && (network === "testnet" || network === "signet")) &&
    detected.network !== network;
  const mismatchMessage = networkMismatch ? keyNetworkMismatchMessage(detected.type, network) : "";
  const saveDisabledReason = getWalletSaveDisabledReason({
    busy,
    vaultUnlocked,
    name,
    importText,
    detected,
    effectiveScriptType,
    accountPath: effectiveAccountPath,
    networkMismatchMessage: mismatchMessage,
    preview,
    previewLoading,
    previewMessage,
    gapLimit
  });
  const canSave = !saveDisabledReason;
  const capturedBbqrFrames = getCapturedBbqrFrameCount(bbqrState);
  const missingBbqrFrames = getMissingBbqrFrames(bbqrState);
  const bbqrFileTypeLabel = getBbqrFileTypeLabel(bbqrState.fileType ?? lastScanMetadata?.fileType ?? null);

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  useEffect(() => {
    if (detected.scriptType !== "unknown") {
      setScriptType(detected.scriptType);
    }
  }, [detected.scriptType]);

  useEffect(() => {
    setSaveMessage("");
  }, [name, importText, network, sourceDevice, scriptType, gapLimit]);

  useEffect(() => {
    let cancelled = false;
    const canPreview =
      Boolean(detected.extendedPublicKey) &&
      !detected.privateInput &&
      !detected.unsupportedReason &&
      !networkMismatch &&
      effectiveScriptType !== "unknown";

    setPreview(null);
    setPreviewMessage("");

    if (!canPreview) {
      setPreviewLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setPreviewLoading(true);

    const timer = window.setTimeout(() => {
      void apiRequest<WalletImportPreviewResponse>(apiUrl, "/api/wallets/import-preview", {
        method: "POST",
        body: JSON.stringify({
          importText,
          network,
          sourceDevice,
          scriptType: effectiveScriptType
        })
      })
        .then((result) => {
          if (cancelled) {
            return;
          }
          setPreview(result);
          setPreviewMessage("");
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }
          setPreview(null);
          setPreviewMessage(
            error instanceof Error
              ? error.message
              : "First receive address could not be derived. Verify key prefix, network, script type, and account path."
          );
        })
        .finally(() => {
          if (!cancelled) {
            setPreviewLoading(false);
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    apiUrl,
    detected.extendedPublicKey,
    detected.privateInput,
    detected.unsupportedReason,
    effectiveScriptType,
    importText,
    network,
    networkMismatch,
    sourceDevice
  ]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveDisabledReason) {
      setSaveMessage(saveDisabledReason);
      return;
    }

    setSaveMessage("");
    try {
      await onSubmit({
        name,
        importText,
        network,
        sourceDevice,
        scriptType: effectiveScriptType,
        notes: notes.trim() || null,
        gapLimit
      });
      setName("");
      setImportText("");
      setHideImportPayload(false);
      setSourceDevice("other");
      setScriptType("unknown");
      setNotes("");
      setGapLimit(20);
      setPreview(null);
      setPreviewMessage("");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Wallet registration failed");
    }
  }

  async function handleFileImport(file: File | undefined) {
    if (!file) {
      return;
    }
    setImportText(await file.text());
    setHideImportPayload(false);
    setImportMethod("file");
  }

  function handleImportTextChange(value: string) {
    setHideImportPayload(false);
    const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const bbqrLines = lines.filter((line) => line.startsWith("B$"));
    if (bbqrLines.length > 0 && bbqrLines.length === lines.length) {
      setImportMethod("paste");
      setImportText("");
      for (const line of bbqrLines) {
        captureBbqrFrame(line, "paste");
      }
      return;
    }
    setImportText(value);
  }

  async function startScanner() {
    const cameraUnavailableMessage = getCameraUnavailableMessage();
    if (cameraUnavailableMessage) {
      setScannerMessage(cameraUnavailableMessage);
      setScannerOpen(true);
      return;
    }

    stopScanner();
    setScannerOpen(true);
    setScannerMessage("Starting camera...");

    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader(undefined, {
        delayBetweenScanAttempts: 100,
        delayBetweenScanSuccess: 100
      });
      const videoElement = await waitForScannerVideo();
      scannerControls.current = await reader.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        },
        videoElement,
        (result) => {
          if (!result) {
            return;
          }

          const scannedValue = result.getText();
          const classification = classifyQrFrame(scannedValue);

          if (classification.format === "psbt-ur") {
            setScannerMessage("PSBT signing request detected. This wallet only accepts watch-only exports (xpub, descriptor, JSON).");
            stopScanner();
            setScannerOpen(false);
            return;
          }

          if (classification.format === "bbqr") {
            captureBbqrFrame(scannedValue, "camera");
            return;
          }

          if (classification.animated) {
            setQrFrames((prev) => prev.includes(scannedValue) ? prev : [...prev, scannedValue]);
            setQrFrameTotal(classification.totalFrames);
            setQrFrameFormat(classification.format);
            setScannerMessage("Animated QR detected. Keep scanning until all frames are collected, then use Try Import.");
            return;
          }

          if (!classification.watchOnlyCandidate) {
            setScannerMessage("QR did not contain a supported watch-only import payload.");
            return;
          }

          setImportText(scannedValue);
          setHideImportPayload(false);
          setScannerMessage("Watch-only import QR scanned.");
          stopScanner();
          setScannerOpen(false);
        }
      );
      setScannerMessage("Point the camera at an xpub, descriptor, key expression, JSON, or UR QR.");
    } catch (error) {
      stopScanner();
      setScannerMessage(getCameraStartErrorMessage(error));
    }
  }

  function stopScanner() {
    scannerControls.current?.stop();
    scannerControls.current = null;
    const stream = scannerVideo.current?.srcObject;
    if (typeof MediaStream !== "undefined" && stream instanceof MediaStream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (scannerVideo.current) {
      scannerVideo.current.srcObject = null;
    }
  }

  function closeScanner() {
    stopScanner();
    setScannerOpen(false);
  }

  async function waitForScannerVideo(): Promise<HTMLVideoElement> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (scannerVideo.current) {
        return scannerVideo.current;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 25));
    }
    throw new Error("Camera view was not ready. Close the scanner and try again.");
  }

  function resetFrames() {
    setQrFrames([]);
    setQrFrameTotal(null);
    setQrFrameFormat("");
    const emptyState = createBbqrCollectorState();
    bbqrStateRef.current = emptyState;
    setBbqrState(emptyState);
    setLastScanMetadata(null);
    setLastScanErrorCode(null);
    setLastScanSource(null);
    setScannerMessage("Frames cleared. Point the camera at the animated QR again.");
  }

  function captureBbqrFrame(scannedValue: string, source: "camera" | "manual" | "paste") {
    setScanEventCount((count) => count + 1);
    setLastScanSource(source);
    const metadata = inspectBbqrFrame(scannedValue);
    setLastScanMetadata(metadata);
    setLastScanErrorCode(metadata.errorCode);
    const frame = parseBbqrFrame(scannedValue);
    if (!frame) {
      setScannerMessage("Unsupported BBQr format.");
      return;
    }
    const result = addBbqrFrame(bbqrStateRef.current, frame);
    bbqrStateRef.current = result.state;
    setBbqrState(result.state);
    setQrFrameTotal(frame.total);
    setQrFrameFormat("bbqr");
    setLastScanErrorCode(result.errorCode ?? null);
    if (result.status === "error") {
      setScannerMessage(result.message);
      return;
    }
    try {
      const payload = assembleBbqrPayload(result.state);
      if (payload) {
        const payloadDetection = detectImportMetadata(payload, network, "coldcard");
        setImportText(payload);
        setHideImportPayload(true);
        setSourceDevice("coldcard");
        setImportMethod(source === "camera" ? "qr" : "paste");
        if (payloadDetection.extendedPublicKey && !payloadDetection.privateInput && !payloadDetection.unsupportedReason) {
          setScannerMessage(`All ${frame.total} BBQr frames captured. Import preview is loading.`);
          stopScanner();
          setScannerOpen(false);
        } else {
          setScannerMessage(payloadDetection.unsupportedReason ?? "Complete BBQr payload is not a supported Coldcard Generic JSON watch-only export.");
        }
        return;
      }
      setScannerMessage(result.message);
    } catch (error) {
      setScannerMessage(error instanceof Error ? error.message : "Unsupported BBQr format.");
    }
  }

  function submitManualBbqrFrame() {
    const frames = manualBbqrFrame
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (frames.length === 0) {
      return;
    }
    for (const frame of frames) {
      captureBbqrFrame(frame, "manual");
    }
    setManualBbqrFrame("");
  }

  function tryImportFromFrames() {
    for (const frame of qrFrames) {
      const embedded = extractExtendedPublicKey(frame);
      if (embedded) {
        setImportText(frame);
        setHideImportPayload(false);
        setScannerMessage("Extracted watch-only data from animated QR frames.");
        stopScanner();
        setScannerOpen(false);
        return;
      }
    }
    if (qrFrames.length > 0) {
      setImportText(qrFrames[0]!);
      setHideImportPayload(false);
      setScannerMessage("Using first QR frame — animated UR decoding is limited. Verify the import preview carefully.");
      stopScanner();
      setScannerOpen(false);
      return;
    }
    setScannerMessage("No frames collected yet. Point the camera at the animated QR.");
  }

  return (
    <form id="import-wallet" className="form-stack vault-section" onSubmit={handleSubmit}>
      <h2>Import watch-only wallet</h2>
      {!vaultUnlocked ? (
        <p className="status-message">Vault is locked. Unlock the vault before saving a wallet.</p>
      ) : null}
      <div className="form-grid">
        <label>
          <span>Wallet name</span>
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          <span>Source device</span>
          <select
            value={sourceDevice}
            onChange={(event) => setSourceDevice(event.target.value as SourceDevice)}
          >
            {sourceDeviceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Network</span>
          <select
            value={network}
            onChange={(event) => setNetwork(event.target.value as WalletRecord["network"])}
          >
            <option value="mainnet">mainnet</option>
            <option value="testnet">testnet</option>
            <option value="signet">signet</option>
          </select>
        </label>
        <label>
          <span>Script type</span>
          <select
            value={scriptType}
            onChange={(event) => setScriptType(event.target.value as WalletScriptType)}
          >
            <option value="unknown">unknown / confirm manually</option>
            <option value="legacy">legacy</option>
            <option value="nested-segwit">nested segwit</option>
            <option value="native-segwit">native segwit</option>
            <option value="taproot">taproot</option>
          </select>
        </label>
      </div>
      {networkMismatch ? (
        <p className="status-message">{mismatchMessage}</p>
      ) : null}

      <div className="tab-row">
        <button
          className={importMethod === "paste" ? "compact-button" : "secondary-button compact-button"}
          type="button"
          onClick={() => setImportMethod("paste")}
        >
          Paste
        </button>
        <button
          className={importMethod === "file" ? "compact-button" : "secondary-button compact-button"}
          type="button"
          onClick={() => setImportMethod("file")}
        >
          File
        </button>
        <button
          className={importMethod === "qr" ? "compact-button" : "secondary-button compact-button"}
          type="button"
          onClick={() => {
            setImportMethod("qr");
            void startScanner();
          }}
        >
          QR Scan
        </button>
      </div>
      <p className="muted">
        Camera QR scanning requires HTTPS or localhost. LAN HTTP addresses such as
        http://172.30.x.x may be blocked by Brave/Chrome. Paste xpub/zpub text,
        descriptors, JSON/UR watch-only exports, or use file import instead.
      </p>
      <label>
        <span className="field-header">
          <span>Import payload</span>
          <button
            className="secondary-button compact-button"
            type="button"
            onClick={() => void startScanner()}
          >
            Scan QR
          </button>
        </span>
        <textarea
          autoComplete="off"
          className="import-textarea"
          required
          spellCheck={false}
          value={hideImportPayload ? "Coldcard Generic JSON BBQr captured. Full payload hidden." : importText}
          onChange={(event) => handleImportTextChange(event.target.value)}
          placeholder="Paste xpub/ypub/zpub/tpub/upub/vpub, [fingerprint/path]xpub, descriptor, JSON, or UR text"
        />
      </label>
      {!scannerOpen && (qrFrameFormat === "bbqr" || capturedBbqrFrames > 0 || lastScanMetadata) ? (
        <BbqrProgressPanel
          captured={capturedBbqrFrames}
          lastErrorCode={lastScanErrorCode}
          lastMetadata={lastScanMetadata}
          missingFrames={missingBbqrFrames}
          scanEventCount={scanEventCount}
          scanSource={lastScanSource}
          total={bbqrState.total}
        />
      ) : null}
      {importMethod === "file" ? (
        <label>
          <span>Import file</span>
          <input
            accept=".json,.txt,.descriptor,text/plain,application/json"
            type="file"
            onChange={(event) => void handleFileImport(event.target.files?.[0])}
          />
        </label>
      ) : null}
      <div className="form-grid">
        <label>
          <span>Detected key</span>
          <input
            readOnly
            value={detected.type
              ? `${detected.type} — ${describeKeyType(detected.type)}`
              : "Waiting for watch-only import"}
          />
        </label>
        <label>
          <span>Selected network</span>
          <input readOnly value={network} />
        </label>
        <label>
          <span>Selected script type</span>
          <input readOnly value={formatScriptType(effectiveScriptType)} />
        </label>
        <label>
          <span>Account path</span>
          <input readOnly value={effectiveAccountPath ?? ""} />
        </label>
        <label>
          <span>Fingerprint</span>
          <input readOnly value={detected.masterFingerprint ?? "not provided"} />
        </label>
        <label>
          <span>Import format</span>
          <input readOnly value={detected.importFormat} />
        </label>
        <label>
          <span>Gap limit</span>
          <input
            max={200}
            min={1}
            required
            type="number"
            value={gapLimit}
            onChange={(event) => setGapLimit(Number(event.target.value))}
          />
        </label>
        <label>
          <span>Notes</span>
          <input value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
      </div>
      <DeviceGuidance sourceDevice={sourceDevice} />
      {detected.privateInput ? (
        <p className="status-message">{detected.unsupportedReason ?? watchOnlyImportError}</p>
      ) : null}
      {detected.warnings.length ? (
        <div className="terminal-panel import-preview">
          {detected.warnings.map((warning) => (
            <p className="muted" key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}
      {detected.unsupportedReason && !detected.privateInput ? <p className="status-message">{detected.unsupportedReason}</p> : null}
      <div className="terminal-panel import-preview">
        <p className="terminal-heading">First receive check</p>
        {previewLoading ? <p className="muted">Deriving first receive address...</p> : null}
        {preview ? (
          <>
            <p className="muted">
              First receive address derived. Verify the fingerprint, account path, script type, and address
              against your external signer before receiving funds.
            </p>
            <dl className="identity-grid">
              <div>
                <dt>Master fingerprint</dt>
                <dd>{preview.masterFingerprint ?? "not provided"}</dd>
              </div>
              <div>
                <dt>Account path</dt>
                <dd>{preview.accountPath ?? effectiveAccountPath ?? "not provided"}</dd>
              </div>
              <div>
                <dt>Script type</dt>
                <dd>{formatScriptType(preview.scriptType)}</dd>
              </div>
              <div>
                <dt>Key/import type</dt>
                <dd>{preview.keyType ?? "unknown"} / {preview.importFormat}</dd>
              </div>
            </dl>
            <code className="preview-code">{preview.firstReceiveAddress}</code>
            <p className="technical-line">path: {preview.firstReceivePath}</p>
            {!preview.masterFingerprint ? (
              <p className="psbt-status-warning muted">
                Bare extended public keys usually do not include master fingerprint metadata. To verify wallet identity,
                compare the account path, script type, and first receive address with the external signer.
              </p>
            ) : null}
          </>
        ) : null}
        {!previewLoading && previewMessage ? <p className="status-message">{previewMessage}</p> : null}
        {!previewLoading && !preview && !previewMessage ? (
          <p className="muted">
            Paste a supported watch-only import and choose the matching network/script type to preview the first receive address.
          </p>
        ) : null}
      </div>
      <div className="terminal-panel import-save-status">
        <p className="terminal-heading">Save check</p>
        <p className={saveDisabledReason ? "status-message" : "muted"}>
          {saveDisabledReason ?? "Ready to save. Vault is unlocked and the first receive address was derived."}
        </p>
        {saveMessage ? <p className="status-message">{saveMessage}</p> : null}
      </div>
      <button disabled={busy || !canSave} type="submit">
        Save wallet
      </button>
      {scannerOpen ? (
        <PortalModal ariaLabel="Scan watch-only import QR" panelClassName="scanner-dialog" onClose={closeScanner}>
          <div className="wallet-card-header">
            <h2>Scan QR</h2>
            <button className="secondary-button compact-button" type="button" onClick={closeScanner}>
              Close
            </button>
          </div>
          <p className="muted">
            Camera QR scanning requires HTTPS or localhost. If camera access is blocked,
            paste xpub/zpub text, a descriptor, or a watch-only export file instead.
          </p>
          <div className="scanner-fallback-row">
            <button
              className="secondary-button compact-button"
              type="button"
              onClick={() => {
                closeScanner();
                setImportMethod("paste");
              }}
            >
              Use Paste
            </button>
            <button
              className="secondary-button compact-button"
              type="button"
              onClick={() => {
                closeScanner();
                setImportMethod("file");
              }}
            >
              Use File
            </button>
          </div>
          <div className="scanner-preview scanner-preview--watch-only">
            <video ref={scannerVideo} className="scanner-video scanner-video--watch-only" muted playsInline />
            <div aria-hidden="true" className="scanner-guide" />
          </div>
          {qrFrameFormat ? (
            <p className="muted">
              format: {qrFrameFormat}{qrFrameFormat === "bbqr" ? ` • type: ${bbqrFileTypeLabel}` : ""} &bull; frames: {qrFrameFormat === "bbqr" ? capturedBbqrFrames : qrFrames.length}{qrFrameTotal ? `/${qrFrameTotal}` : ""}
            </p>
          ) : null}
          {qrFrameFormat === "bbqr" || capturedBbqrFrames > 0 || lastScanMetadata ? (
            <BbqrProgressPanel
              captured={capturedBbqrFrames}
              lastErrorCode={lastScanErrorCode}
              lastMetadata={lastScanMetadata}
              missingFrames={missingBbqrFrames}
              scanEventCount={scanEventCount}
              scanSource={lastScanSource}
              total={bbqrState.total}
            />
          ) : null}
          <label className="form-stack">
            <span>Paste BBQr frame</span>
            <textarea
              aria-label="Paste BBQr frame"
              className="import-textarea"
              value={manualBbqrFrame}
              onChange={(event) => setManualBbqrFrame(event.target.value)}
              placeholder="Paste one or more B$2J... frames, one per line"
              rows={3}
            />
          </label>
          <button
            className="secondary-button compact-button"
            disabled={!manualBbqrFrame.trim()}
            type="button"
            onClick={submitManualBbqrFrame}
          >
            Add BBQr frame
          </button>
          {qrFrames.length > 0 || capturedBbqrFrames > 0 ? (
            <div className="tab-row">
              <button className="secondary-button compact-button" type="button" onClick={resetFrames}>
                Reset
              </button>
              {qrFrameFormat !== "bbqr" ? (
                <button className="compact-button" type="button" onClick={tryImportFromFrames}>
                  Try Import
                </button>
              ) : null}
            </div>
          ) : null}
          {scannerMessage ? <p className="status-message">{scannerMessage}</p> : null}
        </PortalModal>
      ) : null}
    </form>
  );
}

const watchOnlyImportError =
  "This is a watch-only wallet. Private keys or seed phrases must never be imported.";

function BbqrProgressPanel({
  captured,
  lastErrorCode,
  lastMetadata,
  missingFrames,
  scanEventCount,
  scanSource,
  total
}: {
  captured: number;
  lastErrorCode: string | null;
  lastMetadata: BbqrSafeMetadata | null;
  missingFrames: number[];
  scanEventCount: number;
  scanSource: "camera" | "manual" | "paste" | null;
  total: number | null;
}) {
  const fileTypeLabel = getBbqrFileTypeLabel(lastMetadata?.fileType ?? null);
  return (
    <div className="terminal-panel import-preview">
      <p className="terminal-heading">BBQr scanner status</p>
      <p>scan seen: {scanEventCount}{scanSource ? ` (${scanSource})` : ""}</p>
      <p>raw length: {lastMetadata?.rawLength ?? 0} • last prefix: {lastMetadata?.prefix || "none"}</p>
      {lastMetadata?.valid ? (
        <p>
          bbqr header: encoding={lastMetadata.encoding}, type={fileTypeLabel}, frame={lastMetadata.displayIndex}/{lastMetadata.total}, which={lastMetadata.index}
        </p>
      ) : null}
      <p>captured: {captured}{total ? `/${total}` : ""}</p>
      <p>missing: {missingFrames.length ? missingFrames.join(", ") : "none"}</p>
      {missingFrames.length > 0 ? <p>Missing frames: {missingFrames.join(", ")}</p> : null}
      <p>last error: {lastErrorCode ?? "none"}</p>
      {missingFrames.length > 0 ? (
        <p className="muted">Keep the QR visible. Atlas will collect missing frames across multiple loops.</p>
      ) : null}
      <dl className="identity-grid">
        <div>
          <dt>Scan seen</dt>
          <dd>{scanEventCount}</dd>
        </div>
        <div>
          <dt>Last prefix</dt>
          <dd>{lastMetadata?.prefix || "none"}</dd>
        </div>
        <div>
          <dt>Raw length</dt>
          <dd>{lastMetadata?.rawLength ?? 0}</dd>
        </div>
        <div>
          <dt>BBQr header</dt>
          <dd>
            {lastMetadata?.valid
              ? `encoding=${lastMetadata.encoding}, type=${fileTypeLabel}, frame=${lastMetadata.displayIndex}/${lastMetadata.total}`
              : "not valid yet"}
          </dd>
        </div>
        <div>
          <dt>Captured</dt>
          <dd>{captured}{total ? `/${total}` : ""}</dd>
        </div>
        <div>
          <dt>Missing</dt>
          <dd>{missingFrames.length ? missingFrames.join(",") : "none"}</dd>
        </div>
        <div>
          <dt>Last error</dt>
          <dd>{lastErrorCode ?? "none"}</dd>
        </div>
      </dl>
    </div>
  );
}

function getCameraUnavailableMessage(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (!window.isSecureContext) {
    return "Camera scanning requires a secure browser context. Use HTTPS, localhost, or a trusted tunnel such as Tailscale Serve. You can still paste xpub/zpub text, descriptors, or watch-only export text manually.";
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return "Camera access is not available in this browser. Use Paste/File import for xpub/zpub text, descriptors, or watch-only exports, or open Atlas over HTTPS/localhost.";
  }

  return null;
}

function getCameraStartErrorMessage(error: unknown): string {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";

  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera permission was denied. Allow camera access in the browser site settings, or use Paste/File import for xpub/zpub text, descriptors, or watch-only exports.";
  }

  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No camera device was found. Use Paste/File import for xpub/zpub text, descriptors, or watch-only exports.";
  }

  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The camera is already in use or could not be started. Close other camera apps or use Paste/File import.";
  }

  return error instanceof Error ? error.message : "Unable to start QR scanner. Use Paste/File import.";
}

const sourceDeviceOptions: Array<{ value: SourceDevice; label: string }> = [
  { value: "coldcard", label: "Coldcard" },
  { value: "keystone", label: "Keystone" },
  { value: "seedsigner", label: "SeedSigner" },
  { value: "krux", label: "Krux" },
  { value: "passport-core", label: "Passport Core" },
  { value: "jade", label: "Jade" },
  { value: "other", label: "Other" }
];

function DeviceGuidance({ sourceDevice }: { sourceDevice: SourceDevice }) {
  const guidance: Record<SourceDevice, string> = {
    coldcard: "Coldcard: use Export Wallet > Generic JSON or Descriptor. Atlas can collect Generic JSON/Text BBQr frames for watch-only import. Confirm XFP, account path, and script type.",
    keystone: "Keystone: animated crypto-account UR QR is detected via frame collection — scan all frames then use Try Import. Descriptor file import is also available. Verify the first receive address on-device.",
    seedsigner: "SeedSigner: static xpub or UR xpub QR is supported. For animated UR, scan all frames then use Try Import. Verify fingerprint, derivation path, and script type.",
    krux: "Krux: xpub/ypub/zpub QR or SD card text export. Verify fingerprint, derivation path, and script type match the device display.",
    "passport-core": "Passport Core: animated setup QR is detected via frame collection — scan all frames then use Try Import. Descriptor or xpub export also supported. Verify the first receive address on Passport.",
    jade: "Jade: use Account Export > Xpub or descriptor export. Verify the first receive address on the device before receiving funds.",
    other: "Other device: prefer descriptor or [fingerprint/path]xpub import. Confirm script type, account path, and first receive address before receiving funds."
  };

  return (
    <div className="terminal-panel import-preview">
      <p className="terminal-heading">Import guidance</p>
      <p className="muted">{guidance[sourceDevice]}</p>
    </div>
  );
}

function WalletList({
  apiUrl,
  busy,
  wallets,
  onDelete,
  onUpdate
}: {
  apiUrl: string;
  busy: boolean;
  wallets: WalletRecord[];
  onDelete: (id: string) => Promise<void>;
  onUpdate: (id: string, input: { name: string; gapLimit: number }) => Promise<void>;
}) {
  if (wallets.length === 0) {
    return (
      <div id="wallets" className="terminal-panel empty-state">
        <p className="terminal-heading">No wallets yet</p>
        <p className="muted">Import an xpub, zpub, descriptor, or watch-only export to begin monitoring.</p>
        <a className="primary-link-button compact-button" href="#import-wallet">
          Import wallet
        </a>
      </div>
    );
  }

  return (
    <section id="wallets" className="wallet-selector-section" aria-label="Wallet selector">
      <div className="wallet-card-header compact-section-header">
        <h2>Wallets</h2>
      </div>
      <div className="wallet-list" role="list">
        {wallets.map((wallet) => (
          <WalletCard
            apiUrl={apiUrl}
            busy={busy}
            key={wallet.id}
            wallet={wallet}
            onDelete={onDelete}
            onUpdate={onUpdate}
          />
        ))}
      </div>
    </section>
  );
}

export function WalletCard({
  apiUrl,
  busy,
  wallet,
  onDelete,
  onUpdate
}: {
  apiUrl: string;
  busy: boolean;
  wallet: WalletRecord;
  onDelete: (id: string) => Promise<void>;
  onUpdate: (id: string, input: { name: string; gapLimit: number }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [miniBalance, setMiniBalance] = useState<BalanceSummary | null>(null);
  const [miniBalanceStatus, setMiniBalanceStatus] = useState<"loading" | "ready" | "degraded" | "offline">("loading");
  const [name, setName] = useState(wallet.name);
  const [gapLimit, setGapLimit] = useState(wallet.gapLimit);
  const [revealXpubOpen, setRevealXpubOpen] = useState(false);

  useEffect(() => {
    setName(wallet.name);
    setGapLimit(wallet.gapLimit);
  }, [wallet.name, wallet.gapLimit]);

  useEffect(() => {
    let cancelled = false;
    setMiniBalanceStatus("loading");
    void apiRequest<WalletBalanceResponse>(
      apiUrl,
      `/api/wallets/${wallet.id}/balance?chain=both&limit=${wallet.gapLimit}`
    )
      .then((response) => {
        if (cancelled) {
          return;
        }
        setMiniBalance({
          confirmedBalance: response.confirmedBalance,
          unconfirmedBalance: response.unconfirmedBalance,
          totalBalance: response.totalBalance
        });
        setMiniBalanceStatus(response.lookupError ? "degraded" : "ready");
      })
      .catch(() => {
        if (!cancelled) {
          setMiniBalance(null);
          setMiniBalanceStatus("offline");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiUrl, wallet.id, wallet.gapLimit]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await onUpdate(wallet.id, { name, gapLimit });
      setEditing(false);
    } catch {
      // The parent component displays the API error.
    }
  }

  const walletHref = `/wallets/${encodeURIComponent(wallet.id)}`;

  return (
    <article className="wallet-card wallet-selector-card" role="listitem">
      <div className="wallet-card-header">
        <div>
          <h2>
            <a className="wallet-title-link" href={walletHref}>
              {wallet.name}
            </a>
          </h2>
          <p className="muted">
            {deviceLabel(wallet.sourceDevice)} / {wallet.network} / {wallet.type} / {wallet.scriptType}
          </p>
        </div>
        <div className="button-row wallet-card-actions">
          <a className="primary-link-button compact-button" href={`${walletHref}#receive`}>
            Receive
          </a>
          <a className="secondary-button compact-button" href={`${walletHref}#create-psbt`}>
            Send
          </a>
          <button
            className="secondary-button compact-button"
            type="button"
            onClick={() => setEditing((current) => !current)}
          >
            Edit
          </button>
          {deleteConfirming ? (
            <>
              <button
                className="danger-button compact-button"
                disabled={busy}
                type="button"
                onClick={() => void onDelete(wallet.id)}
              >
                Confirm remove
              </button>
              <button
                className="secondary-button compact-button"
                type="button"
                onClick={() => setDeleteConfirming(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              className="secondary-button compact-button"
              type="button"
              onClick={() => setDeleteConfirming(true)}
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {deleteConfirming ? (
        <div className="terminal-panel remove-confirm-panel">
          <p className="muted">
            Remove <strong>{wallet.name}</strong> from the vault?
            This removes the watch-only wallet data only — it does not affect funds or the real wallet.
            You can re-add it later using the xpub/ypub/zpub.
          </p>
        </div>
      ) : null}

      {editing ? (
        <form className="form-grid edit-grid" onSubmit={handleSubmit}>
          <label>
            <span>Wallet name</span>
            <input required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            <span>Gap limit</span>
            <input
              max={200}
              min={1}
              required
              type="number"
              value={gapLimit}
              onChange={(event) => setGapLimit(Number(event.target.value))}
            />
          </label>
          <button disabled={busy} type="submit">
            Save changes
          </button>
        </form>
      ) : null}

      <dl className="wallet-mini-balance">
        <div>
          <dt>Total</dt>
          <dd>
            {miniBalanceStatus === "loading"
              ? "syncing…"
              : miniBalance != null
                ? formatBalance(miniBalance.totalBalance, "sats")
                : "—"}
          </dd>
        </div>
        <div>
          <dt>Confirmed</dt>
          <dd>
            {miniBalanceStatus === "loading"
              ? "…"
              : miniBalance != null
                ? formatBalance(miniBalance.confirmedBalance, "sats")
                : "—"}
          </dd>
        </div>
        <div>
          <dt>Unconfirmed</dt>
          <dd>
            {miniBalanceStatus === "loading"
              ? "…"
              : miniBalance != null
                ? formatBalance(miniBalance.unconfirmedBalance, "sats")
                : "—"}
          </dd>
        </div>
      </dl>

      <dl className="wallet-details">
        <div>
          <dt>Derivation path</dt>
          <dd>{wallet.derivationPath}</dd>
        </div>
        <div>
          <dt>Gap limit</dt>
          <dd>{wallet.gapLimit}</dd>
        </div>
        <div className="full-span">
          <dt>Extended public key</dt>
          <dd className="key-row">
            <code>{wallet.extendedPublicKey}</code>
            <button
              className="secondary-button compact-button"
              type="button"
              onClick={() => setRevealXpubOpen(true)}
            >
              Reveal
            </button>
          </dd>
        </div>
        <div className="full-span">
          <dt>MFP</dt>
          <dd>
            <FingerprintRevealControl fingerprint={wallet.masterFingerprint} />
          </dd>
        </div>
      </dl>
      {revealXpubOpen ? (
        <XpubRevealModal
          apiUrl={apiUrl}
          walletId={wallet.id}
          walletName={wallet.name}
          onClose={() => setRevealXpubOpen(false)}
        />
      ) : null}
    </article>
  );
}

const XPUB_REVEAL_AUTO_CLOSE_SECONDS = 60;

export function FingerprintRevealControl({ fingerprint }: { fingerprint: string | null }) {
  const [revealed, setRevealed] = useState(false);

  if (!fingerprint) {
    return <span className="muted">not provided</span>;
  }

  return (
    <span className="key-row fingerprint-reveal-control">
      <code>{revealed ? fingerprint : "********"}</code>
      <button
        className="secondary-button compact-button"
        type="button"
        onClick={() => setRevealed((current) => !current)}
      >
        {revealed ? "Close" : "Reveal"}
      </button>
    </span>
  );
}

export function PortalModal({
  ariaLabel,
  children,
  panelClassName = "",
  onClose
}: {
  ariaLabel: string;
  children: ReactNode;
  panelClassName?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
    };
  }, []);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="portal-modal-root">
      <div aria-hidden="true" className="portal-modal-backdrop" />
      <div
        aria-label={ariaLabel}
        aria-modal="true"
        className={panelClassName ? `portal-modal-panel ${panelClassName}` : "portal-modal-panel"}
        role="dialog"
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

function getWalletSaveDisabledReason({
  busy,
  vaultUnlocked,
  name,
  importText,
  detected,
  effectiveScriptType,
  accountPath,
  networkMismatchMessage,
  preview,
  previewLoading,
  previewMessage,
  gapLimit
}: {
  busy: boolean;
  vaultUnlocked: boolean;
  name: string;
  importText: string;
  detected: ReturnType<typeof detectImportMetadata>;
  effectiveScriptType: WalletScriptType;
  accountPath: string | null;
  networkMismatchMessage: string;
  preview: WalletImportPreviewResponse | null;
  previewLoading: boolean;
  previewMessage: string;
  gapLimit: number;
}): string | null {
  if (busy) {
    return "Atlas is still processing the previous action.";
  }
  if (!vaultUnlocked) {
    return "Vault is locked. Unlock vault first.";
  }
  if (!name.trim()) {
    return "Wallet name is required.";
  }
  if (!importText.trim()) {
    return "Paste a watch-only extended public key.";
  }
  if (detected.privateInput) {
    return "Private keys and seed phrases are rejected.";
  }
  if (detected.unsupportedReason) {
    return detected.unsupportedReason;
  }
  if (!detected.extendedPublicKey) {
    return "Paste a watch-only extended public key.";
  }
  if (networkMismatchMessage) {
    return networkMismatchMessage;
  }
  if (effectiveScriptType === "unknown") {
    return "Network/script type does not match this key prefix, or the script type still needs confirmation.";
  }
  if (!accountPath) {
    return "Account path is required or invalid.";
  }
  if (!Number.isInteger(gapLimit) || gapLimit < 1 || gapLimit > 200) {
    return "Gap limit must be an integer from 1 to 200.";
  }
  if (previewLoading) {
    return "First receive address is still being derived.";
  }
  if (previewMessage) {
    return previewMessage;
  }
  if (!preview) {
    return "First receive address could not be derived.";
  }
  return null;
}

export function XpubRevealModal({
  apiUrl,
  walletId,
  walletName,
  onClose
}: {
  apiUrl: string;
  walletId: string;
  walletName: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"warning" | "revealed">("warning");
  const [xpub, setXpub] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(XPUB_REVEAL_AUTO_CLOSE_SECONDS);

  useEffect(() => {
    if (step !== "revealed") return;
    setSecondsLeft(XPUB_REVEAL_AUTO_CLOSE_SECONDS);
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          onClose();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [step, onClose]);

  async function handleReveal() {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await apiRequest<{ walletId: string; extendedPublicKey: string }>(
        apiUrl,
        `/api/wallets/${walletId}/xpub`
      );
      setXpub(data.extendedPublicKey);
      setStep("revealed");
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Failed to load extended public key");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PortalModal ariaLabel="Reveal extended public key" onClose={onClose}>
      {step === "warning" ? (
        <>
          <div className="wallet-card-header">
            <h3>Reveal extended public key</h3>
            <button className="secondary-button compact-button" type="button" onClick={onClose} disabled={loading}>
              Close
            </button>
          </div>
          <p className="muted">
            <strong>{walletName}</strong> - your extended public key reveals your complete wallet
            address history and all future addresses. Anyone who obtains it can monitor your
            entire Bitcoin activity.
          </p>
          <p className="muted">
            It is not a private key and cannot spend funds, but it is privacy-sensitive. Only
            reveal it if you need to copy it for a specific purpose.
          </p>
          {fetchError ? <p className="status-message error">{fetchError}</p> : null}
          <div className="tab-row">
            <button
              className="compact-button"
              type="button"
              onClick={() => void handleReveal()}
              disabled={loading}
            >
              {loading ? "Revealing..." : "Reveal"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="wallet-card-header">
            <h3>Extended public key</h3>
            <span className="muted">Auto-closing in {secondsLeft}s</span>
          </div>
          <p className="muted">Keep this private. Do not share it unless you trust the recipient.</p>
          <code className="xpub-reveal-code">{xpub}</code>
          <div className="tab-row">
            <button className="compact-button" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </>
      )}
    </PortalModal>
  );
}

export function WalletIdentityPanel({
  apiUrl,
  wallet
}: {
  apiUrl: string;
  wallet: WalletRecord;
}) {
  const [receivePreview, setReceivePreview] = useState<DerivedAddress[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const accountPath = wallet.accountPath ?? wallet.derivationPath ?? null;
  const fingerprintMissing = !wallet.masterFingerprint;

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setMessage("");
    setReceivePreview([]);

    void apiRequest<WalletAddressesResponse>(
      apiUrl,
      `/api/wallets/${wallet.id}/addresses?chain=receive&limit=5`
    )
      .then((response) => {
        if (cancelled) {
          return;
        }
        const addresses = response.addresses.slice(0, 5);
        setReceivePreview(addresses);
        setStatus(addresses.length > 0 ? "ready" : "error");
        setMessage(addresses.length > 0 ? "" : "Receive addresses could not be derived. Do not receive funds until this wallet is verified.");
      })
      .catch((error) => {
        if (!cancelled) {
          setReceivePreview([]);
          setStatus("error");
          setMessage(error instanceof Error ? error.message : "Receive addresses could not be derived.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiUrl, wallet.id]);

  return (
    <section className="wallet-identity-panel terminal-panel" aria-labelledby="wallet-identity-heading">
      <div className="wallet-card-header">
        <div>
          <h2 id="wallet-identity-heading">Signer verification</h2>
          <p className="muted">
            Verify this fingerprint, account path, and receive address preview against your external signer before receiving funds.
          </p>
        </div>
        <span className={fingerprintMissing ? "status-badge status-degraded" : "status-badge status-online"}>
          {fingerprintMissing ? "fingerprint missing" : "fingerprint present"}
        </span>
      </div>

      <dl className="identity-grid">
        <div>
          <dt>Master fingerprint</dt>
          <dd>
            <FingerprintRevealControl fingerprint={wallet.masterFingerprint} />
          </dd>
        </div>
        <div>
          <dt>Account path</dt>
          <dd>{accountPath ?? "not provided"}</dd>
        </div>
        <div>
          <dt>Script type</dt>
          <dd>{formatScriptType(wallet.scriptType)}</dd>
        </div>
        <div>
          <dt>Network</dt>
          <dd>{wallet.network}</dd>
        </div>
        <div>
          <dt>Source device</dt>
          <dd>{deviceLabel(wallet.sourceDevice)}</dd>
        </div>
        <div>
          <dt>Key / import type</dt>
          <dd>{wallet.type} / {wallet.importFormat}</dd>
        </div>
      </dl>

      <div className="identity-receive-check">
        <p className="terminal-heading">Signer address check</p>
        {status === "loading" ? <p className="muted">Deriving receive address preview...</p> : null}
        {receivePreview.length > 0 ? (
          <div className="signer-address-list">
            {receivePreview.map((address) => (
              <div className="signer-address-row" key={`${address.chain}-${address.index}`}>
                <span className="terminal-meta">receive #{address.index}</span>
                <code className="preview-code">{address.address}</code>
              </div>
            ))}
          </div>
        ) : null}
        {status === "error" ? (
          <p className="status-message">
            {message || "Receive address preview unavailable. Do not receive funds until this watch-only wallet is verified against the signer."}
          </p>
        ) : null}
      </div>

      {fingerprintMissing ? (
        <p className="psbt-status-warning muted">
          Master fingerprint was not provided. Prefer a descriptor or signer export that includes fingerprint and path.
        </p>
      ) : null}
    </section>
  );
}

function WalletDetailView({
  apiUrl,
  fulcrumStatus,
  mempoolBadgeStatus,
  mempoolStatus,
  mempoolStatusError,
  runtimeSettings,
  wallet,
  onRefreshConnection,
  onWalletChange
}: {
  apiUrl: string;
  fulcrumStatus: FulcrumStatusResponse | null;
  mempoolBadgeStatus: StatusKind;
  mempoolStatus: MempoolStatusResponse | null;
  mempoolStatusError: string;
  runtimeSettings: RuntimeSettingsResponse | null;
  wallet: WalletRecord;
  onRefreshConnection: () => Promise<void>;
  onWalletChange: (wallet: WalletRecord) => void;
}) {
  const [balanceUnit, setBalanceUnit] = useState<"sats" | "btc">("sats");
  const [, setBalanceBadgeStatus] = useState<StatusKind>("degraded");
  const [, setTxBadgeStatus] = useState<StatusKind>("degraded");
  const [refreshToken, setRefreshToken] = useState(0);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [receivePanelOpen, setReceivePanelOpen] = useState(false);
  const [psbtWorkflowOpen, setPsbtWorkflowOpen] = useState(false);
  const [psbtInitialOutpoints, setPsbtInitialOutpoints] = useState<string[]>([]);
  const warnings = walletSafetyWarnings(wallet);
  const accountPath = wallet.accountPath ?? wallet.derivationPath ?? "not provided";

  useEffect(() => {
    function openFromHash() {
      if (window.location.hash === "#receive") {
        setReceivePanelOpen(true);
      }
      if (window.location.hash === "#create-psbt") {
        setPsbtInitialOutpoints([]);
        setPsbtWorkflowOpen(true);
      }
      if (window.location.hash === "#utxo") {
        setPsbtInitialOutpoints([]);
        setPsbtWorkflowOpen(true);
      }
    }

    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);

  async function refreshAll() {
    setRefreshingAll(true);
    try {
      await onRefreshConnection();
      setRefreshToken((current) => current + 1);
    } finally {
      setRefreshingAll(false);
    }
  }

  function openPsbtWorkflow(selectedOutpoints: string[] = []) {
    setPsbtInitialOutpoints(selectedOutpoints);
    setPsbtWorkflowOpen(true);
  }

  function clearWalletHash() {
    if (typeof window !== "undefined" && window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }

  function closeReceivePanel() {
    setReceivePanelOpen(false);
    clearWalletHash();
  }

  function closePsbtWorkflow() {
    setPsbtWorkflowOpen(false);
    clearWalletHash();
  }

  return (
    <div className="wallet-detail-page">
      <div className="wallet-detail-header terminal-panel">
        <div>
          <div className="wallet-identity-line">
            <span className="phase-pill">{deviceAlias(wallet.sourceDevice)}</span>
            <h2>{wallet.name}</h2>
          </div>
          <p className="wallet-identity-meta">
            {deviceLabel(wallet.sourceDevice)} / {wallet.network} / {formatScriptType(wallet.scriptType)} / {accountPath} / fpr {wallet.masterFingerprint ?? "not provided"}
          </p>
          <div className="hero-actions wallet-detail-actions">
            <button className="primary-link-button wallet-primary-action" type="button" onClick={() => setReceivePanelOpen(true)}>
              Receive
            </button>
            <button className="secondary-button" type="button" onClick={() => openPsbtWorkflow()}>
              Send
            </button>
          </div>
          {mempoolStatusError || mempoolBadgeStatus !== "online" ? (
            <ConnectionPanel
              error={mempoolStatusError}
              fulcrumStatus={fulcrumStatus}
              mempoolStatus={mempoolStatus}
              refreshing={refreshingAll}
              runtimeSettings={runtimeSettings}
              onRefreshAll={() => void refreshAll()}
            />
          ) : null}
          <WalletNotesEditor apiUrl={apiUrl} wallet={wallet} onWalletChange={onWalletChange} />
          <details id="settings" className="metadata-details">
            <summary>Import details</summary>
            <div className="metadata-grid">
              <div>
                <dt>Import format</dt>
                <dd>{wallet.importFormat ?? "unknown"}</dd>
              </div>
              <div>
                <dt>Key type</dt>
                <dd>{wallet.type}</dd>
              </div>
              <div>
                <dt>Notes</dt>
                <dd>{wallet.notes ?? "not provided"}</dd>
              </div>
              <div>
                <dt>Raw import</dt>
                <dd>{wallet.rawImport ? maskRawImport(wallet.rawImport) : "not stored"}</dd>
              </div>
            </div>
            {warnings.length ? (
              <div className="metadata-warnings">
                {warnings.map((warning) => (
                  <p className="muted" key={warning}>{warning}</p>
                ))}
              </div>
            ) : null}
          </details>
        </div>
      </div>
      <WalletIdentityPanel apiUrl={apiUrl} wallet={wallet} />
      <TransactionHistoryPanel
        apiUrl={apiUrl}
        backendKind={runtimeSettings?.backendKind ?? "unknown"}
        balanceUnit={balanceUnit}
        onTxStatusChange={setTxBadgeStatus}
        refreshToken={refreshToken}
        wallet={wallet}
        onWalletChange={onWalletChange}
      />
      {receivePanelOpen ? (
        <PortalModal
          ariaLabel="Receive bitcoin"
          panelClassName="receive-flow-modal"
          onClose={closeReceivePanel}
        >
          <div className="wallet-card-header">
            <div>
              <p className="terminal-heading">Receive</p>
              <h2>{wallet.name}</h2>
            </div>
            <button className="secondary-button compact-button" type="button" onClick={closeReceivePanel}>
              Close
            </button>
          </div>
          <WalletAddressPanel
            apiUrl={apiUrl}
            balanceUnit={balanceUnit}
            mempoolBadgeStatus={mempoolBadgeStatus}
            onBalanceStatusChange={setBalanceBadgeStatus}
            refreshToken={refreshToken}
            setBalanceUnit={setBalanceUnit}
            wallet={wallet}
            onWalletChange={onWalletChange}
          />
        </PortalModal>
      ) : null}
      {psbtWorkflowOpen ? (
        <PortalModal
          ariaLabel="Create unsigned PSBT"
          panelClassName="psbt-workflow-modal"
          onClose={closePsbtWorkflow}
        >
          <div className="wallet-card-header">
            <div>
              <p className="terminal-heading">Unsigned PSBT workflow</p>
              <h2>Send</h2>
            </div>
            <button className="secondary-button compact-button" type="button" onClick={closePsbtWorkflow}>
              Close
            </button>
          </div>
          <CreatePsbtBuilderPanel
            apiUrl={apiUrl}
            balanceUnit={balanceUnit}
            initialSelectedOutpoints={psbtInitialOutpoints}
            wallet={wallet}
          />
          <VerifyPsbtPanel
            apiUrl={apiUrl}
            balanceUnit={balanceUnit}
            wallet={wallet}
          />
        </PortalModal>
      ) : null}
    </div>
  );
}

export function CreatePsbtBuilderPanel({
  apiUrl,
  balanceUnit,
  initialSelectedOutpoints = [],
  wallet
}: {
  apiUrl: string;
  balanceUnit: "sats" | "btc";
  initialSelectedOutpoints?: string[];
  wallet: WalletRecord;
}) {
  const [builderUtxos, setBuilderUtxos] = useState<WalletUtxo[]>([]);
  const [utxoLoadStatus, setUtxoLoadStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [utxoLoadMessage, setUtxoLoadMessage] = useState("");
  const [selectedOutpoints, setSelectedOutpoints] = useState<string[]>(initialSelectedOutpoints);
  const [utxoSelectorOpen, setUtxoSelectorOpen] = useState(initialSelectedOutpoints.length > 0);
  const [recipients, setRecipients] = useState([
    { id: "recipient-1", address: "", amount: "", unit: "sats" as "sats" | "btc" }
  ]);
  const [feeRateInput, setFeeRateInput] = useState("5");
  const [feeEstimates, setFeeEstimates] = useState<FeeEstimatesResponse["estimates"] | null>(null);
  const [feeEstimateMessage, setFeeEstimateMessage] = useState("");
  const [feeEstimateSourceKind, setFeeEstimateSourceKind] = useState<FeeEstimatesResponse["source"]>(null);
  const [feePresetSource, setFeePresetSource] = useState<"Custom" | "Fastest" | "Medium" | "Slow">("Custom");
  const [addressLimit, setAddressLimit] = useState(20);
  const [psbtResult, setPsbtResult] = useState<CreatePsbtResponse | null>(null);
  const [psbtStatus, setPsbtStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [psbtMessage, setPsbtMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [exportFormat, setExportFormat] = useState<"text" | "qr" | "animated" | "bbqr">("text");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrExportMessage, setQrExportMessage] = useState("");
  const [bbqrFrames, setBbqrFrames] = useState<string[]>([]);
  const [bbqrFrameIndex, setBbqrFrameIndex] = useState(0);
  const [bbqrDataUrl, setBbqrDataUrl] = useState("");
  const [bbqrExportMessage, setBbqrExportMessage] = useState("");
  const [urFrames, setUrFrames] = useState<string[]>([]);
  const [urFrameIndex, setUrFrameIndex] = useState(0);
  const [urDataUrl, setUrDataUrl] = useState("");
  const [urExportMessage, setUrExportMessage] = useState("");

  useEffect(() => {
    void refreshBuilderUtxos();
    void refreshFeeEstimates();
  }, [wallet.id, addressLimit]);

  useEffect(() => {
    setSelectedOutpoints(initialSelectedOutpoints);
    if (initialSelectedOutpoints.length > 0) {
      setUtxoSelectorOpen(true);
    }
  }, [initialSelectedOutpoints]);

  const selectedUtxos = useMemo(
    () => builderUtxos.filter((utxo) => selectedOutpoints.includes(utxo.outpoint)),
    [builderUtxos, selectedOutpoints]
  );
  const selectedInputSats = selectedUtxos.reduce((sum, utxo) => sum + utxo.valueSats, 0);
  const selectedHasUnconfirmed = selectedUtxos.some((utxo) => utxo.status === "unconfirmed");
  const selectedHasUnknownClassification = false;
  const draftPlan = buildDraftSpendingPlan();

  useEffect(() => {
    if (!psbtResult || exportFormat !== "qr") {
      setQrDataUrl("");
      setQrExportMessage("");
      return;
    }

    setQrExportMessage("Preparing single QR...");
    void QRCode.toDataURL(psbtResult.psbtBase64, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 320
    })
      .then((dataUrl) => {
        setQrDataUrl(dataUrl);
        setQrExportMessage("");
      })
      .catch(() => {
        setQrDataUrl("");
        setQrExportMessage("This PSBT is too large for a single QR. Use text export or wait for animated QR / BBQr support.");
      });
  }, [psbtResult, exportFormat]);

  useEffect(() => {
    if (!psbtResult || exportFormat !== "bbqr") {
      setBbqrFrames([]);
      setBbqrFrameIndex(0);
      setBbqrDataUrl("");
      setBbqrExportMessage("");
      return;
    }
    try {
      const frames = encodeBbqrPsbt(psbtResult.psbtBase64);
      setBbqrFrames(frames);
      setBbqrFrameIndex(0);
      setBbqrExportMessage("");
    } catch {
      setBbqrFrames([]);
      setBbqrFrameIndex(0);
      setBbqrDataUrl("");
      setBbqrExportMessage("BBQr encoding failed. Use text export instead.");
    }
  }, [psbtResult, exportFormat]);

  useEffect(() => {
    if (bbqrFrames.length === 0) {
      setBbqrDataUrl("");
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(bbqrFrames[bbqrFrameIndex], {
      errorCorrectionLevel: "L",
      margin: 2,
      width: 320
    }).then((dataUrl) => {
      if (!cancelled) setBbqrDataUrl(dataUrl);
    }).catch(() => {
      if (!cancelled) {
        setBbqrDataUrl("");
        setBbqrExportMessage("Failed to render BBQr frame. Use text export instead.");
      }
    });
    return () => { cancelled = true; };
  }, [bbqrFrames, bbqrFrameIndex]);

  useEffect(() => {
    if (bbqrFrames.length <= 1) return;
    const timer = setInterval(() => {
      setBbqrFrameIndex((prev) => (prev + 1) % bbqrFrames.length);
    }, 500);
    return () => clearInterval(timer);
  }, [bbqrFrames]);

  useEffect(() => {
    if (!psbtResult || exportFormat !== "animated") {
      setUrFrames([]);
      setUrFrameIndex(0);
      setUrDataUrl("");
      setUrExportMessage("");
      return;
    }
    try {
      const frames = encodeUrPsbt(psbtResult.psbtBase64);
      setUrFrames(frames);
      setUrFrameIndex(0);
      setUrExportMessage("");
    } catch {
      setUrFrames([]);
      setUrFrameIndex(0);
      setUrDataUrl("");
      setUrExportMessage("Animated UR encoding failed. Use text export or BBQr instead.");
    }
  }, [psbtResult, exportFormat]);

  useEffect(() => {
    if (urFrames.length === 0) {
      setUrDataUrl("");
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(urFrames[urFrameIndex], {
      errorCorrectionLevel: "L",
      margin: 2,
      width: 320
    }).then((dataUrl) => {
      if (!cancelled) setUrDataUrl(dataUrl);
    }).catch(() => {
      if (!cancelled) {
        setUrDataUrl("");
        setUrExportMessage("Failed to render animated UR frame. Use text export or BBQr instead.");
      }
    });
    return () => { cancelled = true; };
  }, [urFrames, urFrameIndex]);

  useEffect(() => {
    if (urFrames.length <= 1) return;
    const timer = setInterval(() => {
      setUrFrameIndex((prev) => (prev + 1) % urFrames.length);
    }, 500);
    return () => clearInterval(timer);
  }, [urFrames]);

  async function refreshBuilderUtxos() {
    setUtxoLoadStatus("loading");
    setUtxoLoadMessage("");
    try {
      const response = await apiRequest<WalletUtxosResponse>(
        apiUrl,
        `/api/wallets/${wallet.id}/utxos?chain=both&addressLimit=${addressLimit}&includeUnconfirmed=true`
      );
      setBuilderUtxos(response.utxos ?? []);
      setSelectedOutpoints((current) =>
        current.filter((outpoint) => response.utxos.some((utxo) => utxo.outpoint === outpoint))
      );
      setUtxoLoadStatus("loaded");
    } catch (error) {
      setUtxoLoadMessage(error instanceof Error ? error.message : "Backend unavailable while loading tracked UTXOs");
      setUtxoLoadStatus("error");
    }
  }

  async function refreshFeeEstimates() {
    setFeeEstimateMessage("");
    try {
      const response = await apiRequest<FeeEstimatesResponse>(apiUrl, "/api/fees/recommended");
      const feeUi = resolveFeeEstimateUiState(response);
      setFeeEstimates(feeUi.estimates);
      setFeeEstimateMessage(feeUi.message);
      setFeeEstimateSourceKind(response.source ?? null);
    } catch {
      setFeeEstimates(null);
      setFeeEstimateMessage("Fee estimates unavailable. Enter a custom fee rate.");
      setFeeEstimateSourceKind(null);
    }
  }

  function toggleUtxo(utxo: WalletUtxo) {
    setSelectedOutpoints((current) =>
      current.includes(utxo.outpoint)
        ? current.filter((outpoint) => outpoint !== utxo.outpoint)
        : [...current, utxo.outpoint]
    );
    setPsbtResult(null);
  }

  function addRecipient() {
    setRecipients((current) => [
      ...current,
      { id: `recipient-${Date.now()}-${current.length}`, address: "", amount: "", unit: "sats" as const }
    ]);
    setPsbtResult(null);
  }

  function removeRecipient(id: string) {
    setRecipients((current) => current.length === 1 ? current : current.filter((recipient) => recipient.id !== id));
    setPsbtResult(null);
  }

  function updateRecipient(
    id: string,
    patch: Partial<{ address: string; amount: string; unit: "sats" | "btc" }>
  ) {
    setRecipients((current) =>
      current.map((recipient) => recipient.id === id ? { ...recipient, ...patch } : recipient)
    );
    setPsbtResult(null);
  }

  function applyFeePreset(kind: "fastest" | "medium" | "slow") {
    const value = selectFeePresetRate(feeEstimates, kind);
    if (value !== null) {
      setFeeRateInput(formatFeeRate(value));
      setFeePresetSource(kind === "fastest" ? "Fastest" : kind === "medium" ? "Medium" : "Slow");
      setPsbtResult(null);
    }
  }

  async function handleCreate() {
    if (draftPlan.errors.length > 0) {
      setPsbtMessage(draftPlan.errors[0] ?? "Spending plan is incomplete.");
      setPsbtStatus("error");
      return;
    }

    setPsbtStatus("loading");
    setPsbtMessage("");
    setPsbtResult(null);

    try {
      const result = await apiRequest<CreatePsbtResponse>(
        apiUrl,
        `/api/wallets/${wallet.id}/psbt`,
        {
          method: "POST",
          body: JSON.stringify({
            recipients: draftPlan.recipients,
            selectedUtxos: mapSelectedUtxosForPsbt(selectedUtxos),
            feeRateSatsPerVbyte: draftPlan.feeRate,
            addressLimit
          }),
          headers: { "Content-Type": "application/json" }
        }
      );
      setPsbtResult(result);
      setPsbtStatus("done");
    } catch (error) {
      setPsbtMessage(error instanceof Error ? error.message : "Failed to create unsigned PSBT");
      setPsbtStatus("error");
    }
  }

  async function copyPsbt() {
    if (!psbtResult) return;
    try {
      await copyTextToClipboard(psbtResult.psbtBase64);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setPsbtMessage("Clipboard copy failed. Select and copy manually.");
    }
  }

  function downloadPsbt() {
    if (!psbtResult) return;
    const blob = new Blob([psbtResult.psbtBase64], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${wallet.name.replace(/\s+/g, "-")}-unsigned.psbt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function goToVerification() {
    const verify = document.getElementById("signed-psbt-verification") as HTMLDetailsElement | null;
    if (verify) {
      verify.open = true;
      verify.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function buildDraftSpendingPlan() {
    const errors: string[] = [];
    const warnings: string[] = [];
    const parsedRecipients: Array<{ address: string; amountSats: number }> = [];

    for (const recipient of recipients) {
      const address = recipient.address.trim();
      if (!address) {
        errors.push("Invalid recipient address: recipient address is required.");
      } else if (!looksLikeAddressForWalletNetwork(address, wallet.network)) {
        errors.push("Invalid recipient address for this wallet network.");
      }
      const parsed = parseAmountToSats(recipient.amount, recipient.unit);
      if (parsed.error) {
        errors.push(parsed.error);
      } else if (parsed.sats !== null) {
        if (parsed.sats < 546) {
          errors.push("Output below dust threshold.");
        }
        parsedRecipients.push({ address: recipient.address.trim(), amountSats: parsed.sats });
      }
    }

    const feeRate = parseFeeRate(feeRateInput);
    if (feeRate === null) {
      errors.push("Fee rate invalid.");
    }

    const recipientTotalSats = parsedRecipients.reduce((sum, recipient) => sum + recipient.amountSats, 0);
    const estimatedVbytes = selectedUtxos.length > 0
      ? estimateBuilderVbytes(wallet.scriptType, selectedUtxos.length, parsedRecipients.length + 1)
      : null;
    const estimatedFeeSats = feeRate !== null && estimatedVbytes !== null ? Math.ceil(estimatedVbytes * feeRate) : null;
    const changeSats = estimatedFeeSats !== null ? selectedInputSats - recipientTotalSats - estimatedFeeSats : null;

    if (selectedUtxos.length > 0 && estimatedVbytes === null) {
      errors.push("This wallet script type is not supported for PSBT creation.");
    }
    if (selectedUtxos.length > 0 && estimatedFeeSats === null) {
      errors.push("Fee unavailable.");
    } else if (
      selectedUtxos.length > 0 &&
      estimatedFeeSats !== null &&
      selectedInputSats < recipientTotalSats + estimatedFeeSats
    ) {
      errors.push("Amount exceeds selected input.");
    }
    if (changeSats !== null && changeSats > 0 && changeSats < 546) {
      warnings.push("Dust warning: change is below dust threshold and may be absorbed into the fee.");
    }
    if (changeSats !== null && changeSats >= 546) {
      warnings.push("Change address will be selected from wallet change derivation when the unsigned PSBT is created.");
    }
    if (selectedHasUnconfirmed) {
      warnings.push("One or more selected tracked UTXOs is unconfirmed.");
    }
    if (selectedUtxos.length === 0) {
      warnings.push("No manual UTXO selected. Atlas will use automatic confirmed coin selection when creating the unsigned PSBT.");
    }
    if (feeRate !== null && feeRate >= 100) {
      warnings.push("Unusually high fee rate. Review the sat/vB value before creating the unsigned PSBT.");
    }
    if (estimatedFeeSats !== null && recipientTotalSats > 0 && estimatedFeeSats > recipientTotalSats * 0.1) {
      warnings.push("Unusually high fee compared with recipient outputs. Review the fee before signing externally.");
    }

    return {
      recipients: parsedRecipients,
      recipientTotalSats,
      feeRate,
      estimatedVbytes,
      estimatedFeeSats,
      changeSats,
      errors: [...new Set(errors)],
      warnings
    };
  }

  return (
    <section id="create-psbt" className="psbt-workflow-panel">
      <div className="wallet-card-header">
        <p className="terminal-heading">Send</p>
      </div>

      <div className="psbt-safety-notice muted">
        Creates an unsigned PSBT only. Sign it with an external wallet that holds the private keys.
        Nothing is broadcast from this step. Never enter seed phrases or private keys here.
        Verify every recipient, change output, amount, and fee on the signing device before signing.
        A compromised browser can change what you see; the cold signing device is the final authority.
      </div>

      <div className="wallet-card-header">
        <div>
          <p className="terminal-heading">Coin selection</p>
          <p className="muted technical-line">
            {selectedUtxos.length > 0
              ? `${selectedUtxos.length} selected / ${formatBalance(selectedInputSats, "sats")} (${formatBalance(selectedInputSats, "btc")})`
              : "Automatic coin selection"}
            {selectedHasUnconfirmed ? " / includes unconfirmed" : ""}
            {selectedHasUnknownClassification ? " / includes unknown classification" : ""}
          </p>
        </div>
        <div className="button-row">
          <button
            className="secondary-button compact-button"
            type="button"
            onClick={() => setUtxoSelectorOpen((current) => !current)}
          >
            {utxoSelectorOpen ? "Hide UTXOs" : "Select UTXOs"}
          </button>
          {selectedUtxos.length > 0 ? (
            <button
              className="secondary-button compact-button"
              type="button"
              onClick={() => setSelectedOutpoints([])}
            >
              Clear selection
            </button>
          ) : null}
          <button className="secondary-button compact-button" type="button" onClick={() => void refreshBuilderUtxos()}>
            {utxoLoadStatus === "loading" ? "Loading..." : "Refresh UTXOs"}
          </button>
        </div>
      </div>

      {utxoLoadMessage ? <p className="status-message">{utxoLoadMessage}</p> : null}

      {utxoSelectorOpen ? (
        <div className="psbt-utxo-select-list">
          {utxoLoadStatus === "loading" ? <TerminalSkeleton label="LOADING UTXOS" rows={3} /> : null}
          {builderUtxos.map((utxo) => {
            const addressLabel = getAddressLabel(wallet, utxo.chain, utxo.index);
            const txLabel = getTransactionLabel(wallet, utxo.txid);
            const utxoNote = getUtxoNote(wallet, utxo.txid, utxo.vout);
            return (
              <label
                className={`psbt-utxo-select-row ${selectedOutpoints.includes(utxo.outpoint) ? "is-selected" : ""}`}
                key={utxo.outpoint}
              >
                <input
                  checked={selectedOutpoints.includes(utxo.outpoint)}
                  type="checkbox"
                  onChange={() => toggleUtxo(utxo)}
                />
                <span>
                  <strong>{formatBalance(utxo.valueSats, "sats")}</strong>
                  <span className="muted"> ({formatBalance(utxo.valueSats, "btc")})</span>
                </span>
                <code>{truncateMiddle(utxo.txid, 18)}:{utxo.vout}</code>
                <span className="muted address-inline">
                  Source <SecurityAddress address={utxo.address} unavailableText="unknown source address" />
                </span>
                <span className={`status-badge ${utxo.status === "confirmed" ? "status-online" : "status-degraded"}`}>{utxo.status}</span>
                <span className="muted">{utxo.chain} #{utxo.index}</span>
                {addressLabel ? <span className="label-pill">{addressLabel.label}</span> : null}
                {utxoNote ? <span className="muted">{utxoNote.note}</span> : null}
                {txLabel?.notes ? <span className="muted">{txLabel.notes}</span> : null}
              </label>
            );
          })}
          {utxoLoadStatus === "loaded" && builderUtxos.length === 0 ? (
            <p className="muted">No tracked UTXOs found in the selected scan depth.</p>
          ) : null}
        </div>
      ) : null}

      <div className="psbt-form">
        <div className="wallet-card-header">
          <p className="terminal-heading">Recipient outputs</p>
          <button className="secondary-button compact-button" type="button" onClick={addRecipient}>
            Add recipient
          </button>
        </div>
        {recipients.map((recipient, index) => {
          const recipientLabel = getAddressLabelByAddress(wallet, recipient.address.trim());
          return (
            <div className="recipient-row" key={recipient.id}>
              <label className="psbt-field">
                <span>Recipient {index + 1} address</span>
                <input
                  className="psbt-input"
                  type="text"
                  value={recipient.address}
                  placeholder={wallet.network === "mainnet" ? "bc1q..." : "tb1q..."}
                  onChange={(event) => updateRecipient(recipient.id, { address: event.target.value })}
                  autoComplete="off"
                  spellCheck={false}
                />
                {recipientLabel ? <span className="label-pill">{recipientLabel.label}</span> : null}
              </label>
              <label className="psbt-field">
                <span>Amount</span>
                <input
                  className="psbt-input"
                  inputMode="decimal"
                  value={recipient.amount}
                  placeholder={recipient.unit === "sats" ? "70000000" : "0.70000000"}
                  onChange={(event) => updateRecipient(recipient.id, { amount: event.target.value })}
                />
              </label>
              <label className="psbt-field">
                <span>Unit</span>
                <select
                  value={recipient.unit}
                  onChange={(event) => updateRecipient(recipient.id, { unit: event.target.value as "sats" | "btc" })}
                >
                  <option value="sats">sats</option>
                  <option value="btc">BTC</option>
                </select>
              </label>
              <button
                className="secondary-button compact-button"
                disabled={recipients.length === 1}
                type="button"
                onClick={() => removeRecipient(recipient.id)}
              >
                Remove
              </button>
            </div>
          );
        })}

        <label className="psbt-field">
          <span>Fee rate (sat/vB)</span>
          <input
            className="psbt-input"
            inputMode="decimal"
            value={feeRateInput}
            onChange={(event) => {
              setFeeRateInput(event.target.value);
              setFeePresetSource("Custom");
              setPsbtResult(null);
            }}
          />
          {parseFeeRate(feeRateInput) !== null && parseFeeRate(feeRateInput)! < 5 ? (
            <span className="muted psbt-field-hint">Low fee rate may not confirm quickly.</span>
          ) : null}
          <span className="muted psbt-field-hint">
            Source: {feePresetSource === "Custom" ? "manual entry" : `${feeEstimateSourceLabel(feeEstimateSourceKind)} (${feePresetSource})`}
          </span>
        </label>

        <div className="button-row">
          <button className="secondary-button compact-button" disabled={selectFeePresetRate(feeEstimates, "fastest") === null} type="button" onClick={() => applyFeePreset("fastest")}>
            Fastest
          </button>
          <button className="secondary-button compact-button" disabled={selectFeePresetRate(feeEstimates, "medium") === null} type="button" onClick={() => applyFeePreset("medium")}>
            Medium
          </button>
          <button className="secondary-button compact-button" disabled={selectFeePresetRate(feeEstimates, "slow") === null} type="button" onClick={() => applyFeePreset("slow")}>
            Slow
          </button>
          <button className="secondary-button compact-button" type="button" onClick={() => void refreshFeeEstimates()}>
            Refresh fees
          </button>
        </div>
        {feeEstimateMessage ? <p className="status-message">{feeEstimateMessage}</p> : null}
        {draftPlan.estimatedFeeSats !== null ? (
          <p className="muted technical-line">
            Estimated fee: {formatBalance(draftPlan.estimatedFeeSats, "sats")} ({formatBalance(draftPlan.estimatedFeeSats, "btc")}) at {formatFeeRate(draftPlan.feeRate)} sat/vB.
          </p>
        ) : null}
      </div>

      <div className="spending-plan terminal-panel">
        <p className="terminal-heading">Review unsigned PSBT</p>
        <div className="spending-plan-flow">
          <div>
            <p className="terminal-meta">Input UTXOs</p>
            {selectedUtxos.length ? selectedUtxos.map((utxo) => {
              const addressLabel = getAddressLabel(wallet, utxo.chain, utxo.index);
              const utxoNote = getUtxoNote(wallet, utxo.txid, utxo.vout);
              return (
                <div className="spending-plan-line" key={utxo.outpoint}>
                  <strong>{formatBalance(utxo.valueSats, "btc")}</strong>
                  <span className="muted">{formatBalance(utxo.valueSats, "sats")}</span>
                  <span className="muted address-inline">
                    Source <SecurityAddress address={utxo.address} unavailableText="source address unavailable" />
                  </span>
                  <details className="metadata-details psbt-advanced-input-details">
                    <summary>Show outpoint</summary>
                    <p className="muted technical-line">Outpoint (txid:vout): {utxo.outpoint}</p>
                  </details>
                  {addressLabel ? <span className="label-pill">{addressLabel.label}</span> : null}
                  {utxoNote ? <span className="muted">{utxoNote.note}</span> : null}
                </div>
              );
            }) : <p className="muted">Automatic coin selection will choose confirmed UTXOs when the unsigned PSBT is created.</p>}
          </div>
          <div className="spending-plan-arrow" aria-hidden="true">-&gt;</div>
          <div>
            <p className="terminal-meta">Outputs</p>
            {draftPlan.recipients.map((recipient, index) => (
              <div className="spending-plan-line" key={`${recipient.address}-${index}`}>
                <strong>Recipient {index + 1}: {formatBalance(recipient.amountSats, "btc")}</strong>
                <span className="muted address-inline">
                  {formatBalance(recipient.amountSats, "sats")} / <SecurityAddress address={recipient.address} />
                </span>
              </div>
            ))}
            {draftPlan.changeSats !== null && draftPlan.changeSats >= 546 ? (
              <div className="spending-plan-line">
                <strong>Change: {formatBalance(draftPlan.changeSats, "btc")}</strong>
                <span className="muted">{formatBalance(draftPlan.changeSats, "sats")} / selected when created</span>
              </div>
            ) : draftPlan.changeSats !== null && selectedUtxos.length > 0 ? (
              <div className="spending-plan-line">
                <strong>No change output</strong>
                <span className="muted">Change is zero or below dust and may be absorbed into the fee.</span>
              </div>
            ) : null}
            {draftPlan.estimatedFeeSats !== null ? (
              <div className="spending-plan-line fee-line">
                <strong>Fee: {formatBalance(draftPlan.estimatedFeeSats, "btc")}</strong>
                <span className="muted">{formatBalance(draftPlan.estimatedFeeSats, "sats")} / {formatFeeRate(draftPlan.feeRate)} sat/vB</span>
              </div>
            ) : null}
          </div>
        </div>
        <p className="muted">Estimated fee may change after final signing.</p>
        <p className="muted psbt-review-guidance">
          Before signing, compare recipient address, amount, fee, and change output on your signing device.
          If Atlas and the signer disagree, stop.
        </p>
        {draftPlan.errors.map((error) => <p className="status-message" key={error}>{error}</p>)}
        {draftPlan.warnings.map((warning) => <p className="psbt-status-warning muted" key={warning}>{warning}</p>)}
      </div>

      <button
        className="compact-button"
        type="button"
        disabled={psbtStatus === "loading" || draftPlan.errors.length > 0}
        onClick={() => void handleCreate()}
      >
        {psbtStatus === "loading" ? "Creating..." : "Create unsigned PSBT"}
      </button>

      {psbtMessage ? <p className="status-message">{psbtMessage}</p> : null}

      {psbtResult && psbtStatus === "done" ? (
        <div className="psbt-result terminal-panel">
          <p className="terminal-heading">Unsigned PSBT ready</p>

          <dl className="utxo-summary-grid">
            <div>
              <dt>inputs</dt>
              <dd>{psbtResult.inputs.length} UTXOs / {formatBalance(psbtResult.totalInputSats, balanceUnit)}</dd>
            </div>
            <div>
              <dt>recipient total</dt>
              <dd>{formatBalance(psbtResult.outputs.filter((o) => o.type === "recipient").reduce((sum, output) => sum + output.valueSats, 0), balanceUnit)}</dd>
            </div>
            <div>
              <dt>fee</dt>
              <dd>{formatBalance(psbtResult.feeSats, balanceUnit)} ({formatFeeRate(psbtResult.feeRateSatsPerVbyte)} sat/vB, ~{psbtResult.estimatedVbytes} vB)</dd>
            </div>
            <div>
              <dt>change</dt>
              <dd>{formatBalance(psbtResult.changeSats, balanceUnit)}</dd>
            </div>
          </dl>

          {psbtResult.changeAddress ? (
            <p className="muted psbt-change-addr address-inline">
              Wallet change: <SecurityAddress address={psbtResult.changeAddress} />
            </p>
          ) : psbtResult.changeSats > 0 ? (
            <p className="psbt-status-warning muted psbt-change-addr">
              Change amount is present, but the change address is unavailable. Do not sign until this is resolved.
            </p>
          ) : (
            <p className="muted psbt-change-addr">No change output. Change is zero or below dust and may be absorbed into the fee.</p>
          )}
          {psbtResult.changeAddressWarning ? (
            <p className="psbt-status-warning muted psbt-change-addr">{psbtResult.changeAddressWarning}</p>
          ) : null}

          <div className="psbt-review-grid">
            <div className="psbt-review-column">
              <p className="terminal-meta">Input source addresses</p>
              {psbtResult.inputs.map((input, index) => (
                <div className="spending-plan-line" key={`${input.txid}:${input.vout}`}>
                  <strong>Input {index + 1}: {formatBalance(input.valueSats, balanceUnit)}</strong>
                  <span className="muted address-inline">
                    Source <SecurityAddress address={input.address} unavailableText="source address unavailable" />
                  </span>
                  <span className="muted">{input.chain} #{input.index}{input.path ? ` / ${input.path}` : ""}</span>
                  <details className="metadata-details psbt-advanced-input-details">
                    <summary>Show outpoint</summary>
                    <p className="muted technical-line">Outpoint (txid:vout): {input.txid}:{input.vout}</p>
                  </details>
                </div>
              ))}
            </div>
            <div className="psbt-review-column">
              <p className="terminal-meta">Output classification</p>
              {psbtResult.outputs.map((output, index) => {
                const recipientNumber = psbtResult.outputs
                  .slice(0, index + 1)
                  .filter((candidate) => candidate.type === "recipient").length;
                return (
                  <div className="spending-plan-line" key={`${output.type}-${output.address}-${index}`}>
                    <strong>{output.type === "change" ? "Change address" : `Recipient ${recipientNumber}`}</strong>
                    <span className="terminal-meta">{formatBalance(output.valueSats, balanceUnit)}</span>
                    <SecurityAddress address={output.address} />
                    {output.type === "change" ? (
                      <span className="muted">
                        {output.chain ?? "change"} {typeof output.index === "number" ? `#${output.index}` : ""}
                        {output.path ? ` / ${output.path}` : ""}
                        {output.usage ? ` / usage ${output.usage}` : ""}
                      </span>
                    ) : null}
                  </div>
                );
              })}
              {!psbtResult.outputs.some((output) => output.type === "change") ? (
                <div className="spending-plan-line">
                  <strong>No change output</strong>
                  <span className="muted">No wallet change output exists in this unsigned PSBT.</span>
                </div>
              ) : null}
            </div>
          </div>

          <p className="muted psbt-review-guidance">
            Before signing, compare recipient address, amount, fee, and change output on your signing device.
            If Atlas and the signer disagree, stop.
          </p>

          <div className="psbt-base64-block">
            <p className="terminal-heading">Export unsigned PSBT</p>
            <label className="psbt-field">
              <span>Export format</span>
              <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as "text" | "qr" | "animated" | "bbqr")}>
                <option value="text">Text</option>
                <option value="qr">QR</option>
                <option value="animated">Animated UR QR</option>
                <option value="bbqr">BBQr animated QR</option>
              </select>
              <span className="muted psbt-field-hint">
                Animated UR QR targets BC-UR signing wallets. BBQr targets compatible Coldcard flows.
              </span>
            </label>
            {exportFormat === "text" ? (
              <>
                <p className="muted">This is an unsigned PSBT. Copy it into an external wallet that holds the private keys.</p>
                <textarea className="psbt-textarea" readOnly value={psbtResult.psbtBase64} rows={4} />
              </>
            ) : null}
            {exportFormat === "qr" ? (
              <>
                <p className="muted">This QR contains an unsigned PSBT. Scan it with a compatible signing wallet.</p>
                {qrDataUrl ? (
                  <img alt="Unsigned PSBT QR" className="qr-preview" src={qrDataUrl} />
                ) : (
                  <p className="status-message">
                    {qrExportMessage || "This PSBT is too large for a single QR. Use text export or wait for animated QR / BBQr support."}
                  </p>
                )}
              </>
            ) : null}
            {exportFormat === "animated" ? (
              <>
                <p className="muted">Scan this animated UR crypto-psbt with a compatible signing wallet.</p>
                {urExportMessage ? (
                  <p className="status-message">{urExportMessage}</p>
                ) : urDataUrl ? (
                  <>
                    <img alt="Animated UR PSBT frame" className="qr-preview" src={urDataUrl} />
                    <p className="muted">Frame {urFrameIndex + 1} / {urFrames.length}</p>
                  </>
                ) : (
                  <p className="status-message">Preparing animated UR frames...</p>
                )}
              </>
            ) : null}
            {exportFormat === "bbqr" ? (
              <>
                <p className="muted">Scan this animated BBQr with a compatible signing wallet (e.g. Coldcard Q).</p>
                {bbqrExportMessage ? (
                  <p className="status-message">{bbqrExportMessage}</p>
                ) : bbqrDataUrl ? (
                  <>
                    <img alt="BBQr PSBT frame" className="qr-preview" src={bbqrDataUrl} />
                    <p className="muted">Frame {bbqrFrameIndex + 1} / {bbqrFrames.length}</p>
                  </>
                ) : (
                  <p className="status-message">Preparing BBQr frames...</p>
                )}
              </>
            ) : null}
            <div className="psbt-actions">
              <button className="compact-button" type="button" onClick={() => void copyPsbt()}>
                {copied ? "Copied" : "Copy PSBT"}
              </button>
              <button className="secondary-button compact-button" type="button" onClick={downloadPsbt}>
                Download .psbt
              </button>
              <button className="secondary-button compact-button" type="button" onClick={goToVerification}>
                Import signed PSBT below
              </button>
            </div>
          </div>

          <div className="muted psbt-safety-footer">
            <p>This app does not sign transactions. Optional broadcast requires signed PSBT verification and Bitcoin Core RPC.</p>
            <ol>
              <li>Export the unsigned PSBT.</li>
              <li>Sign it with an external cold wallet.</li>
              <li>Bring the signed PSBT back to this app.</li>
              <li>Paste it into Signed PSBT Verification.</li>
              <li>Verify every output before broadcasting elsewhere.</li>
            </ol>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function VerifyPsbtPanel({
  apiUrl,
  balanceUnit,
  wallet
}: {
  apiUrl: string;
  balanceUnit: "sats" | "btc";
  wallet: WalletRecord;
}) {
  const [psbtInput, setPsbtInput] = useState("");
  const [expectedRecipient, setExpectedRecipient] = useState("");
  const [expectedAmount, setExpectedAmount] = useState("");
  const [expectedChange, setExpectedChange] = useState("");
  const [expectedFee, setExpectedFee] = useState("");
  const [addressLimit, setAddressLimit] = useState(100);
  const [verifyResult, setVerifyResult] = useState<VerifyPsbtResponse | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [verifyMessage, setVerifyMessage] = useState("");
  const [copiedTxHex, setCopiedTxHex] = useState(false);
  const [broadcastStatus, setBroadcastStatus] = useState<BroadcastStatusResponse | null>(null);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastConfirmed, setBroadcastConfirmed] = useState(false);
  const [broadcastConfirmText, setBroadcastConfirmText] = useState("");
  const [broadcastResult, setBroadcastResult] = useState<BroadcastResponse | null>(null);
  const [copiedTxid, setCopiedTxid] = useState(false);
  const [signedImportMethod, setSignedImportMethod] = useState<"paste" | "file" | "qr">("paste");
  const [signedScannerOpen, setSignedScannerOpen] = useState(false);
  const [signedScannerMessage, setSignedScannerMessage] = useState("");
  const [multipartState, setMultipartState] = useState<MultipartPsbtState>(() => createMultipartPsbtState());
  const [multipartMessage, setMultipartMessage] = useState("");
  const [urPsbtMessage, setUrPsbtMessage] = useState("");
  const multipartStateRef = useRef<MultipartPsbtState>(createMultipartPsbtState());
  const urPsbtDecoderRef = useRef(createUrPsbtDecoder());
  const signedScannerControls = useRef<IScannerControls | null>(null);
  const signedScannerVideo = useRef<HTMLVideoElement | null>(null);
  const signedFileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiRequest<BroadcastStatusResponse>(apiUrl, "/api/broadcast/core/status")
      .then((status) => {
        if (!cancelled) {
          setBroadcastStatus(status);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setBroadcastStatus({
            enabled: false,
            backend: "disabled",
            configured: false,
            message: "Broadcast status unavailable."
          });
          setBroadcastMessage(error instanceof Error ? error.message : "Broadcast status unavailable.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  useEffect(() => {
    multipartStateRef.current = multipartState;
  }, [multipartState]);

  useEffect(() => {
    if (!signedScannerOpen) {
      stopSignedScanner();
      return;
    }

    if (typeof window !== "undefined" && !window.isSecureContext) {
      setSignedScannerMessage(SIGNED_PSBT_CAMERA_FALLBACK_MESSAGE);
      return;
    }

    let cancelled = false;
    async function startScanner() {
      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        if (cancelled) return;
        const reader = new BrowserQRCodeReader();
        signedScannerControls.current = await reader.decodeFromVideoDevice(
          undefined,
          signedScannerVideo.current ?? undefined,
          (result) => {
            if (!result) return;
            const scannedValue = result.getText().trim();
            setSignedScannerMessage(`QR detected. Payload length ${scannedValue.length}. Classifying signed PSBT payload...`);
            const multipartFrame = parseMultipartPsbtFrame(scannedValue);
            if (multipartFrame) {
              const scannerResult = captureMultipartFrame(multipartFrame);
              setSignedScannerMessage(scannerResult.message);
              if (scannerResult.completePsbt) {
                closeSignedScanner();
                void verifySignedPsbt(scannerResult.completePsbt);
              }
              return;
            }
            if (scannedValue.toLowerCase().startsWith("ur:crypto-psbt")) {
              const scannerResult = captureUrPsbtPart(scannedValue);
              setSignedScannerMessage(scannerResult.message);
              if (scannerResult.completePsbt) {
                closeSignedScanner();
                void verifySignedPsbt(scannerResult.completePsbt);
              }
              return;
            }
            if (scannedValue.toLowerCase().startsWith("ur:")) {
              resetUrPsbtFrames();
              clearMultipartFrames();
              setSignedScannerMessage(SIGNED_PSBT_UNSUPPORTED_UR_MESSAGE);
              return;
            }
            if (!isSignedPsbtSingleQrCandidate(scannedValue)) {
              setSignedScannerMessage(SIGNED_PSBT_QR_TOO_LARGE_MESSAGE);
              return;
            }
            const classification = extractSignedPsbtBase64Payload(scannedValue);
            if (!classification.psbtBase64) {
              setSignedScannerMessage(classification.message);
              return;
            }
            setSignedPsbtInput(classification.psbtBase64, classification.message);
            closeSignedScanner();
            void verifySignedPsbt(classification.psbtBase64);
          }
        );
        setSignedScannerMessage("Point the camera at a single-frame signed PSBT QR.");
      } catch (error) {
        setSignedScannerMessage(error instanceof Error ? error.message : "Unable to start signed PSBT QR scanner. Use paste or file upload.");
      }
    }

    void startScanner();
    return () => {
      cancelled = true;
      stopSignedScanner();
    };
  }, [signedScannerOpen]);

  async function handleVerify() {
    const trimmed = psbtInput.trim();
    if (!trimmed) {
      setVerifyMessage("Paste a signed PSBT (base64) to verify.");
      setVerifyStatus("error");
      return;
    }

    const multipartFrame = parseMultipartPsbtFrame(trimmed);
    if (multipartFrame) {
      const result = captureMultipartFrame(multipartFrame);
      if (!result.completePsbt) {
        setVerifyMessage(result.message);
        setVerifyStatus(result.status === "error" ? "error" : "idle");
        setVerifyResult(null);
        resetBroadcastConfirmation();
        return;
      }
      await verifySignedPsbt(result.completePsbt);
      return;
    }

    if (trimmed.toLowerCase().startsWith("ur:crypto-psbt")) {
      const result = captureUrPsbtPart(trimmed);
      if (!result.completePsbt) {
        setVerifyMessage(result.message);
        setVerifyStatus(result.status === "error" ? "error" : "idle");
        setVerifyResult(null);
        resetBroadcastConfirmation();
        return;
      }
      await verifySignedPsbt(result.completePsbt);
      return;
    }

    if (trimmed.toLowerCase().startsWith("ur:")) {
      clearMultipartFrames();
      resetUrPsbtFrames();
      setVerifyResult(null);
      setVerifyStatus("error");
      setVerifyMessage(SIGNED_PSBT_UNSUPPORTED_UR_MESSAGE);
      resetBroadcastConfirmation();
      return;
    }

    clearMultipartFrames();
    resetUrPsbtFrames();
    await verifySignedPsbt(trimmed);
  }

  async function verifySignedPsbt(psbtBase64: string) {
    setVerifyStatus("loading");
    setVerifyMessage("");
    setVerifyResult(null);
    resetBroadcastConfirmation();

    const expected = buildExpectedPsbtChecks();

    try {
      const result = await apiRequest<VerifyPsbtResponse>(
        apiUrl,
        `/api/wallets/${wallet.id}/psbt/verify`,
        {
          method: "POST",
          body: JSON.stringify({
            psbtBase64,
            expected: Object.keys(expected).length > 0 ? expected : undefined,
            addressLimit
          }),
          headers: { "Content-Type": "application/json" }
        }
      );
      setVerifyResult(result);
      setVerifyStatus("done");
    } catch (error) {
      setVerifyMessage(error instanceof Error ? error.message : "Failed to verify PSBT");
      setVerifyStatus("error");
    }
  }

  function captureMultipartFrame(frame: MultipartPsbtFrame): {
    completePsbt: string | null;
    message: string;
    status: "idle" | "error";
  } {
    const result = addMultipartPsbtFrame(multipartStateRef.current, frame);
    multipartStateRef.current = result.state;
    setMultipartState(result.state);
    setMultipartMessage(result.message);
    resetUrPsbtFrames();
    setVerifyMessage(result.message);
    setVerifyResult(null);
    resetBroadcastConfirmation();

    if (result.status === "error") {
      setVerifyStatus("error");
      return { completePsbt: null, message: result.message, status: "error" };
    }

    const completePsbt = assembleMultipartPsbt(result.state);
    if (completePsbt) {
      setPsbtInput(completePsbt);
      setVerifyStatus("idle");
      return { completePsbt, message: result.message, status: "idle" };
    }

    setPsbtInput("");
    setVerifyStatus("idle");
    return { completePsbt: null, message: result.message, status: "idle" };
  }

  function captureUrPsbtPart(part: string): {
    completePsbt: string | null;
    message: string;
    status: "idle" | "error";
  } {
    const result = decodeUrPsbtPart(urPsbtDecoderRef.current, part);
    setVerifyResult(null);
    resetBroadcastConfirmation();

    if (result.status === "error") {
      setUrPsbtMessage("");
      setVerifyMessage(result.message);
      setVerifyStatus("error");
      return { completePsbt: null, message: result.message, status: "error" };
    }

    if (result.status === "complete") {
      setPsbtInput(result.psbtBase64);
      clearMultipartFrames();
      resetUrPsbtFrames();
      setVerifyStatus("idle");
      setVerifyMessage(result.message);
      return { completePsbt: result.psbtBase64, message: result.message, status: "idle" };
    }

    setPsbtInput("");
    clearMultipartFrames();
    setUrPsbtMessage(result.message);
    setVerifyMessage(result.message);
    setVerifyStatus("idle");
    return { completePsbt: null, message: result.message, status: "idle" };
  }

  function resetUrPsbtFrames(message = "") {
    urPsbtDecoderRef.current = createUrPsbtDecoder();
    setUrPsbtMessage(message);
  }

  function clearUrPsbtFrames(message = "") {
    resetUrPsbtFrames();
    if (message) {
      setVerifyMessage(message);
    }
  }

  function clearMultipartFrames(message = "") {
    const emptyState = createMultipartPsbtState();
    multipartStateRef.current = emptyState;
    setMultipartState(emptyState);
    setMultipartMessage("");
    if (message) {
      setVerifyMessage(message);
    }
  }

  function setSignedPsbtInput(value: string, message = "") {
    setPsbtInput(value);
    clearMultipartFrames();
    resetUrPsbtFrames();
    setVerifyResult(null);
    setVerifyStatus("idle");
    setVerifyMessage(message);
    resetBroadcastConfirmation();
  }

  function setSignedPsbtDraft(value: string) {
    setPsbtInput(value);
    setVerifyResult(null);
    setVerifyStatus("idle");
    setVerifyMessage("");
    resetBroadcastConfirmation();
  }

  function openSignedScanner() {
    setSignedImportMethod("qr");
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setSignedScannerOpen(false);
      setSignedScannerMessage(SIGNED_PSBT_CAMERA_FALLBACK_MESSAGE);
      return;
    }
    setSignedScannerMessage("");
    setSignedScannerOpen(true);
  }

  function closeSignedScanner() {
    setSignedScannerOpen(false);
    stopSignedScanner();
  }

  function stopSignedScanner() {
    signedScannerControls.current?.stop();
    signedScannerControls.current = null;
    const stream = signedScannerVideo.current?.srcObject;
    if (typeof MediaStream !== "undefined" && stream instanceof MediaStream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (signedScannerVideo.current) {
      signedScannerVideo.current.srcObject = null;
    }
  }

  async function importSignedPsbtFile(file: File | null) {
    if (!file) return;
    if (file.size > 1_000_000) {
      setVerifyMessage("Signed PSBT file is too large. Export a smaller PSBT text file.");
      setVerifyStatus("error");
      return;
    }
    try {
      const text = await file.text();
      setSignedPsbtInput(text.trim(), "Signed PSBT file loaded. Review and verify before broadcast.");
      setSignedImportMethod("file");
    } catch {
      setVerifyMessage("Unable to read signed PSBT file. Use paste instead.");
      setVerifyStatus("error");
    } finally {
      if (signedFileInput.current) {
        signedFileInput.current.value = "";
      }
    }
  }

  async function copyTxHex() {
    if (!verifyResult?.txHex) return;
    try {
      await copyTextToClipboard(verifyResult.txHex);
      setCopiedTxHex(true);
      setTimeout(() => setCopiedTxHex(false), 2000);
    } catch {
      setVerifyMessage("Clipboard copy failed. Select and copy manually.");
    }
  }

  async function handleBroadcast() {
    const trimmed = psbtInput.trim();
    if (!verifyResult || verifyResult.status !== "valid" || !verifyResult.extractable || !verifyResult.txHex) {
      setBroadcastMessage("Broadcast requires a valid, extractable signed PSBT.");
      return;
    }
    if (
      !broadcastStatus?.enabled ||
      broadcastStatus.backend !== "core" ||
      !broadcastStatus.configured ||
      broadcastStatus.reachable !== true
    ) {
      setBroadcastMessage("Bitcoin Core RPC is not configured or not reachable.");
      return;
    }
    if (!broadcastConfirmed || broadcastConfirmText !== "BROADCAST") {
      setBroadcastMessage("Confirm the checklist and type BROADCAST before broadcasting.");
      return;
    }

    setBroadcastLoading(true);
    setBroadcastMessage("");
    setBroadcastResult(null);
    const expected = buildExpectedPsbtChecks();

    try {
      const result = await apiRequest<BroadcastResponse>(
        apiUrl,
        `/api/wallets/${wallet.id}/psbt/broadcast`,
        {
          method: "POST",
          body: JSON.stringify({
            psbtBase64: trimmed,
            confirmationText: broadcastConfirmText,
            expected: Object.keys(expected).length > 0 ? expected : undefined,
            addressLimit
          }),
          headers: { "Content-Type": "application/json" }
        }
      );
      setBroadcastResult(result);
      setBroadcastMessage(result.message ?? "Broadcast accepted by Bitcoin Core.");
    } catch (error) {
      setBroadcastMessage(error instanceof Error ? error.message : "Broadcast failed.");
    } finally {
      setBroadcastLoading(false);
    }
  }

  async function copyTxid() {
    if (!broadcastResult?.txid) return;
    try {
      await copyTextToClipboard(broadcastResult.txid);
      setCopiedTxid(true);
      setTimeout(() => setCopiedTxid(false), 2000);
    } catch {
      setBroadcastMessage("Clipboard copy failed. Select and copy manually.");
    }
  }

  function buildExpectedPsbtChecks(): {
    recipientAddress?: string;
    amountSats?: number;
    changeAddress?: string | null;
    feeSats?: number;
  } {
    const expected: {
      recipientAddress?: string;
      amountSats?: number;
      changeAddress?: string | null;
      feeSats?: number;
    } = {};

    if (expectedRecipient.trim()) expected.recipientAddress = expectedRecipient.trim();
    if (expectedAmount.trim()) {
      const n = parseInt(expectedAmount, 10);
      if (Number.isInteger(n) && n > 0) expected.amountSats = n;
    }
    if (expectedChange.trim()) {
      expected.changeAddress = expectedChange.trim() === "none" ? null : expectedChange.trim();
    }
    if (expectedFee.trim()) {
      const n = parseInt(expectedFee, 10);
      if (Number.isInteger(n) && n >= 0) expected.feeSats = n;
    }

    return expected;
  }

  function resetBroadcastConfirmation() {
    setBroadcastMessage("");
    setBroadcastLoading(false);
    setBroadcastConfirmed(false);
    setBroadcastConfirmText("");
    setBroadcastResult(null);
  }

  // ---- derived summary values ----
  const statusLabel =
    verifyResult?.status === "valid" ? "VALID"
    : verifyResult?.status === "warning" ? "WARNING"
    : "INVALID";
  const statusClass =
    verifyResult?.status === "valid" ? "psbt-status-valid"
    : verifyResult?.status === "warning" ? "psbt-status-warning"
    : "psbt-status-invalid";

  const totalInputSats =
    verifyResult?.inputs.reduce((s, i) => s + (i.valueSats ?? 0), 0) ?? 0;
  const totalOutputSats =
    verifyResult?.outputs.reduce((s, o) => s + o.valueSats, 0) ?? 0;
  const walletInputCount =
    verifyResult?.inputs.filter((i) => i.belongsToWallet).length ?? 0;
  const recipientCount =
    verifyResult?.outputs.filter((o) => o.type === "recipient").length ?? 0;
  const changeCount =
    verifyResult?.outputs.filter((o) => o.type === "change").length ?? 0;
  const externalCount =
    verifyResult?.outputs.filter((o) => o.type === "external").length ?? 0;
  const unknownCount =
    verifyResult?.outputs.filter((o) => o.type === "unknown").length ?? 0;

  const signingState = verifyResult?.extractable
    ? "Finalized / extractable"
    : verifyResult?.finalizable
      ? "Signed, ready to finalize"
      : verifyResult?.signed
        ? "Signed (not finalizable)"
        : "Unsigned";

  const hasUnknownOutputs = unknownCount > 0;
  const hasExternalWithoutCheck =
    externalCount > 0 && (verifyResult?.checks.recipientMatches ?? null) === null;
  const hasFailedChecks =
    verifyResult?.checks.recipientMatches === false ||
    verifyResult?.checks.amountMatches === false ||
    verifyResult?.checks.changeAddressMatches === false;
  const hasOwnershipWarning =
    verifyResult?.warnings.some((w) => w.toLowerCase().includes("ownership")) ?? false;

  const riskLevel: "LOW" | "MEDIUM" | "HIGH" = !verifyResult
    ? "LOW"
    : verifyResult.errors.length > 0 ||
        hasUnknownOutputs ||
        hasExternalWithoutCheck ||
        hasFailedChecks ||
        hasOwnershipWarning
      ? "HIGH"
      : verifyResult.warnings.length > 0 || !verifyResult.extractable
        ? "MEDIUM"
        : "LOW";

  const riskClass =
    riskLevel === "LOW" ? "psbt-status-valid"
    : riskLevel === "MEDIUM" ? "psbt-status-warning"
    : "psbt-status-invalid";

  const expectedCheckRows = verifyResult ? [
    {
      label: "Expected recipient",
      status: expectedRecipient.trim()
        ? verifyResult.checks.recipientMatches === true
          ? "PASS"
          : verifyResult.checks.recipientMatches === false
            ? "FAIL"
            : "PENDING"
        : "SKIPPED",
      detail: expectedRecipient.trim() || "No expected recipient provided"
    },
    {
      label: "Expected amount",
      status: expectedAmount.trim()
        ? verifyResult.checks.amountMatches === true
          ? "PASS"
          : verifyResult.checks.amountMatches === false
            ? "FAIL"
            : "PENDING"
        : "SKIPPED",
      detail: expectedAmount.trim() ? `${expectedAmount.trim()} sats` : "No expected amount provided"
    },
    {
      label: "Expected change",
      status: expectedChange.trim()
        ? verifyResult.checks.changeAddressMatches === true
          ? "PASS"
          : verifyResult.checks.changeAddressMatches === false
            ? "FAIL"
            : "PENDING"
        : "SKIPPED",
      detail: expectedChange.trim() || "No expected change address provided"
    },
    {
      label: "Expected fee",
      status: expectedFee.trim()
        ? verifyResult.checks.feeMatches === true
          ? "PASS"
          : verifyResult.checks.feeMatches === false
            ? "FAIL"
            : "PENDING"
        : "SKIPPED",
      detail: expectedFee.trim() ? `${expectedFee.trim()} sats` : "No expected fee provided"
    }
  ] : [];

  const verificationChecklistRows = verifyResult ? [
    {
      label: "Signed by external wallet",
      status: verifyResult.signed ? "PASS" : "FAIL",
      detail: verifyResult.signed ? "Signatures detected" : "No signatures detected"
    },
    {
      label: "Final transaction extractable",
      status: verifyResult.extractable ? "PASS" : "FAIL",
      detail: verifyResult.extractable ? "txHex available" : "No extractable txHex"
    },
    {
      label: "Wallet input ownership",
      status: walletInputCount === verifyResult.inputs.length ? "PASS" : "WARN",
      detail: `${walletInputCount} of ${verifyResult.inputs.length} inputs recognized as wallet-owned`
    },
    {
      label: "Unknown outputs",
      status: unknownCount === 0 ? "PASS" : "FAIL",
      detail: unknownCount === 0 ? "No unknown outputs" : `${unknownCount} unknown output(s)`
    },
    {
      label: "External outputs",
      status: externalCount === 0 || verifyResult.checks.recipientMatches === true ? "PASS" : "WARN",
      detail: externalCount === 0
        ? "No unverified external outputs"
        : `${externalCount} external output(s); expected recipient check ${verifyResult.checks.recipientMatches === true ? "passed" : "not confirmed"}`
    },
    ...expectedCheckRows
  ] : [];

  const checklistStatusClass = (status: string) =>
    status === "PASS" ? "psbt-status-valid"
    : status === "FAIL" ? "psbt-status-invalid"
    : status === "WARN" ? "psbt-status-warning"
    : "muted";

  const broadcastReady =
    verifyResult?.status === "valid" && verifyResult.extractable && Boolean(verifyResult.txHex);
  const broadcastBackendReady =
    broadcastStatus?.enabled === true &&
    broadcastStatus.backend === "core" &&
    broadcastStatus.configured === true &&
    broadcastStatus.reachable === true;
  const broadcastButtonDisabled =
    broadcastLoading ||
    !broadcastReady ||
    !broadcastBackendReady ||
    !broadcastConfirmed ||
    broadcastConfirmText !== "BROADCAST";
  const broadcastReadinessRows = verifyResult ? [
    {
      label: "Verification status",
      status: verifyResult.status === "valid" ? "PASS" : "FAIL",
      detail: verifyResult.status
    },
    {
      label: "Extractable transaction",
      status: verifyResult.extractable && Boolean(verifyResult.txHex) ? "PASS" : "FAIL",
      detail: verifyResult.txHex ? "txHex ready" : "txHex unavailable"
    },
    {
      label: "Bitcoin Core backend",
      status: broadcastBackendReady ? "PASS" : "WARN",
      detail: broadcastBackendReady ? "Configured and reachable" : "Disabled, unconfigured, or unreachable"
    },
    {
      label: "Manual confirmation",
      status: broadcastConfirmed && broadcastConfirmText === "BROADCAST" ? "PASS" : "PENDING",
      detail: broadcastConfirmed && broadcastConfirmText === "BROADCAST"
        ? "Broadcast confirmation entered"
        : "Checkbox and BROADCAST text required"
    }
  ] : [];

  const safetyMessages: string[] = [];
  if (verifyResult) {
    if (hasUnknownOutputs)
      safetyMessages.push(
        "This PSBT contains unknown outputs. Do not broadcast unless you understand them."
      );
    if (hasExternalWithoutCheck)
      safetyMessages.push(
        "This PSBT sends funds to an external address not recognized as wallet change. Provide the expected recipient address to verify."
      );
    if (verifyResult.checks.recipientMatches === false)
      safetyMessages.push(
        "The expected recipient address was not found in this PSBT's outputs."
      );
    if (verifyResult.checks.amountMatches === false)
      safetyMessages.push("The output amount does not match the expected amount.");
    if (verifyResult.checks.changeAddressMatches === false)
      safetyMessages.push(
        "The expected change address was not found in this PSBT's outputs."
      );
    if (verifyResult.checks.feeMatches === false)
      safetyMessages.push("The fee does not match the expected fee.");
    if (!verifyResult.signed) {
      safetyMessages.push(
        "This PSBT is not signed. Return it to your cold wallet for signing."
      );
    } else if (!verifyResult.extractable) {
      safetyMessages.push(
        "This PSBT is signed but not yet finalized or extractable. Return it to your cold wallet."
      );
    }
    if (
      verifyResult.extractable &&
      !hasUnknownOutputs &&
      externalCount === 0 &&
      verifyResult.errors.length === 0
    ) {
      safetyMessages.push(
        "This transaction appears ready. Verify all outputs carefully before broadcasting with another tool."
      );
    }
  }

  return (
    <section id="signed-psbt-verification" className="psbt-workflow-panel signed-psbt-workflow-panel">
      <div className="wallet-card-header">
        <p className="terminal-heading">Import signed PSBT</p>
      </div>

      <div className="psbt-safety-notice muted">
        Import the signed PSBT returned by your cold wallet. This verifies the transaction details
        without broadcasting. Never enter seed phrases or private keys here.
        Atlas cannot protect you from a compromised browser display, clipboard, or QR code.
        Compare outputs against your signer before any broadcast.
      </div>

      <div className="psbt-form">
        <div className="button-row">
          <button
            className={signedImportMethod === "paste" ? "compact-button" : "secondary-button compact-button"}
            type="button"
            onClick={() => setSignedImportMethod("paste")}
          >
            Paste signed PSBT
          </button>
          <button
            className={signedImportMethod === "file" ? "compact-button" : "secondary-button compact-button"}
            type="button"
            onClick={() => {
              setSignedImportMethod("file");
              signedFileInput.current?.click();
            }}
          >
            Upload signed PSBT file
          </button>
          <button
            className={signedImportMethod === "qr" ? "compact-button" : "secondary-button compact-button"}
            type="button"
            onClick={openSignedScanner}
          >
            Scan signed PSBT QR
          </button>
        </div>
        <input
          ref={signedFileInput}
          type="file"
          accept=".psbt,.txt,text/plain,application/octet-stream"
          style={{ display: "none" }}
          onChange={(event) => void importSignedPsbtFile(event.target.files?.[0] ?? null)}
        />
        {signedScannerMessage && !signedScannerOpen ? (
          <div className="psbt-safety-notice muted">
            <p>{signedScannerMessage}</p>
            <div className="scanner-fallback-row">
              <button className="secondary-button compact-button" type="button" onClick={() => setSignedImportMethod("paste")}>
                Paste signed PSBT
              </button>
              <button className="secondary-button compact-button" type="button" onClick={() => signedFileInput.current?.click()}>
                Upload signed PSBT file
              </button>
            </div>
          </div>
        ) : null}
        <label className="psbt-field">
          <span>Signed PSBT (base64 / multipart / UR)</span>
          <textarea
            className="psbt-textarea"
            value={psbtInput}
            placeholder="cHNidP8B…"
            rows={4}
            onChange={(e) => setSignedPsbtDraft(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {multipartMessage ? (
          <div className="psbt-safety-notice muted">
            <p>{multipartMessage}</p>
            <button
              className="secondary-button compact-button"
              type="button"
              onClick={() => clearMultipartFrames("Multipart signed PSBT frames cleared.")}
            >
              Clear multipart frames
            </button>
          </div>
        ) : null}
        {urPsbtMessage ? (
          <div className="psbt-safety-notice muted">
            <p>{urPsbtMessage}</p>
            <button
              className="secondary-button compact-button"
              type="button"
              onClick={() => clearUrPsbtFrames("Signed PSBT UR frames cleared.")}
            >
              Clear UR frames
            </button>
          </div>
        ) : null}

        <details className="psbt-expected-section">
          <summary className="muted">Optional safety checks</summary>
          <p className="muted" style={{ margin: "0.4rem 0 0.6rem" }}>
            Provide the intended recipient, amount, change address, or fee to compare against the
            signed PSBT. Amounts are always in sats (satoshis). Leave blank to skip a check.
          </p>
          <div className="psbt-form">
            <label className="psbt-field">
              <span>Expected recipient address</span>
              <input
                className="psbt-input"
                type="text"
                value={expectedRecipient}
                placeholder="bc1q…"
                onChange={(e) => setExpectedRecipient(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label className="psbt-field">
              <span>Expected amount (sats — satoshis, not BTC)</span>
              <input
                className="psbt-input"
                type="number"
                value={expectedAmount}
                placeholder="90000"
                min={1}
                step={1}
                onChange={(e) => setExpectedAmount(e.target.value)}
              />
            </label>
            <label className="psbt-field">
              <span>Expected change address (enter "none" if no change expected)</span>
              <input
                className="psbt-input"
                type="text"
                value={expectedChange}
                placeholder="bc1q… or none"
                onChange={(e) => setExpectedChange(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label className="psbt-field">
              <span>Expected fee (sats — satoshis)</span>
              <input
                className="psbt-input"
                type="number"
                value={expectedFee}
                placeholder="1500"
                min={0}
                step={1}
                onChange={(e) => setExpectedFee(e.target.value)}
              />
            </label>
          </div>
        </details>

        <button
          className="compact-button"
          type="button"
          disabled={verifyStatus === "loading"}
          onClick={() => void handleVerify()}
        >
          {verifyStatus === "loading" ? "Verifying..." : "Verify signed PSBT"}
        </button>
      </div>

      {verifyMessage && verifyMessage !== multipartMessage && verifyMessage !== urPsbtMessage ? (
        <p className="status-message">{verifyMessage}</p>
      ) : null}

      {signedScannerOpen ? (
        <PortalModal ariaLabel="Scan signed PSBT QR" panelClassName="scanner-dialog" onClose={closeSignedScanner}>
          <div className="wallet-card-header">
            <h2>Scan signed PSBT QR</h2>
          </div>
          <p className="muted">
            Scan signed PSBT QR frames. Atlas can collect pNofM multipart frames, ur:crypto-psbt animated frames, or import a single-frame signed PSBT QR for verification only.
          </p>
          <video ref={signedScannerVideo} className="scanner-video" muted playsInline />
          <div className="scanner-fallback-row">
            <button className="secondary-button compact-button" type="button" onClick={closeSignedScanner}>
              Use Paste fallback
            </button>
            <button
              className="secondary-button compact-button"
              type="button"
              onClick={() => {
                closeSignedScanner();
                signedFileInput.current?.click();
              }}
            >
              Use File fallback
            </button>
          </div>
          {signedScannerMessage ? <p className="status-message">{signedScannerMessage}</p> : null}
        </PortalModal>
      ) : null}

      {verifyResult && verifyStatus === "done" ? (
        <div className="psbt-result terminal-panel">

          {/* Status + Risk level */}
          <p className="terminal-heading">
            Verification result:{" "}
            <span className={statusClass}>{statusLabel}</span>
            {"   "}
            <span className={riskClass}>[{riskLevel} RISK]</span>
          </p>

          {/* Summary card */}
          <dl className="utxo-summary-grid">
            <div>
              <dt>wallet</dt>
              <dd>{wallet.name}</dd>
            </div>
            <div>
              <dt>wallet id</dt>
              <dd>{wallet.id}</dd>
            </div>
            <div>
              <dt>network</dt>
              <dd>{wallet.network}</dd>
            </div>
            <div>
              <dt>signing state</dt>
              <dd>{signingState}</dd>
            </div>
            <div>
              <dt>total input</dt>
              <dd>{formatBalance(totalInputSats, balanceUnit)}</dd>
            </div>
            <div>
              <dt>total output</dt>
              <dd>{formatBalance(totalOutputSats, balanceUnit)}</dd>
            </div>
            {verifyResult.feeSats !== null ? (
              <div>
                <dt>fee</dt>
                <dd>{formatBalance(verifyResult.feeSats, balanceUnit)}</dd>
              </div>
            ) : null}
            <div>
              <dt>fee rate</dt>
              <dd>
                {verifyResult.feeRateSatsPerVbyte !== null
                  ? `${formatFeeRate(verifyResult.feeRateSatsPerVbyte)} sat/vB`
                  : "unavailable"}
              </dd>
            </div>
            <div>
              <dt>wallet inputs</dt>
              <dd>
                {walletInputCount} / {verifyResult.inputs.length}
              </dd>
            </div>
            <div>
              <dt>recipient outputs</dt>
              <dd>{recipientCount}</dd>
            </div>
            <div>
              <dt>change outputs</dt>
              <dd>{changeCount}</dd>
            </div>
            {externalCount > 0 ? (
              <div>
                <dt>external outputs</dt>
                <dd className="psbt-status-warning">{externalCount}</dd>
              </div>
            ) : null}
            {unknownCount > 0 ? (
              <div>
                <dt>unknown outputs</dt>
                <dd className="psbt-status-invalid">{unknownCount}</dd>
              </div>
            ) : null}
          </dl>

          <div className="psbt-verify-section" role="group" aria-label="Verification checklist">
            <p className="terminal-heading">Verification checklist</p>
            {verificationChecklistRows.map((row) => (
              <div className="muted psbt-input-row" key={row.label}>
                <strong>{row.label}</strong>
                <span className={checklistStatusClass(row.status)}>{row.status}</span>
                <span>{row.detail}</span>
              </div>
            ))}
          </div>

          {/* Human-readable safety messages */}
          {safetyMessages.length > 0 ? (
            <div className="psbt-verify-section">
              {safetyMessages.map((msg, i) => (
                <p key={i} className="muted">{msg}</p>
              ))}
            </div>
          ) : null}

          {/* Errors */}
          {verifyResult.errors.length > 0 ? (
            <div className="psbt-verify-section">
              <p className="terminal-heading psbt-status-invalid">Errors</p>
              {verifyResult.errors.map((e, i) => (
                <p key={i} className="psbt-status-invalid muted">{e}</p>
              ))}
            </div>
          ) : null}

          {/* Warnings */}
          {verifyResult.warnings.length > 0 ? (
            <div className="psbt-verify-section">
              <p className="terminal-heading psbt-status-warning">Warnings</p>
              {verifyResult.warnings.map((w, i) => (
                <p key={i} className="psbt-status-warning muted">{w}</p>
              ))}
            </div>
          ) : null}

          {/* Outputs table */}
          <div className="psbt-verify-section">
            <p className="terminal-heading">Outputs</p>
            {verifyResult.outputs.map((out, i) => {
              const outputLabel = out.address ? getAddressLabelByAddress(wallet, out.address) : null;
              const typeLabel =
                out.type === "recipient"
                  ? "RECIPIENT OUTPUT — expected destination"
                  : out.type === "change"
                    ? "CHANGE OUTPUT — wallet-owned"
                    : out.type === "external"
                      ? "EXTERNAL OUTPUT — not recognized as wallet change"
                      : "UNKNOWN OUTPUT — review carefully";
              const typeLabelClass =
                out.type === "external"
                  ? "psbt-status-warning"
                  : out.type === "unknown"
                    ? "psbt-status-invalid"
                    : "";
              const matchNote =
                out.type === "recipient" && verifyResult.checks.recipientMatches === true
                  ? " [matched expected]"
                  : out.type === "change" && verifyResult.checks.changeAddressMatches === true
                    ? " [matched expected]"
                    : "";
              return (
                <div key={i} className="psbt-verify-output-row">
                  <div className={typeLabelClass} style={{ fontWeight: "bold", fontSize: "0.85em" }}>
                    #{i} {typeLabel}{matchNote}
                  </div>
                  <div className="muted psbt-input-row address-inline" style={{ marginLeft: "1rem" }}>
                    <SecurityAddress address={out.address} unavailableText="no address" />
                    {" · "}
                    {formatBalance(out.valueSats, "sats")} / {(out.valueSats / 1e8).toFixed(8)} BTC
                  </div>
                  {outputLabel ? (
                    <div className="muted psbt-input-row" style={{ marginLeft: "1rem" }}>
                      <span className="label-pill">{outputLabel.label}</span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Inputs table */}
          <div className="psbt-verify-section">
            <p className="terminal-heading">Inputs</p>
            {verifyResult.inputs.map((inp, i) => (
              <div key={i} className="muted psbt-input-row">
                #{i} outpoint {truncateMiddle(`${inp.txid}:${inp.vout}`, 24)}
                {" · "}
                <SecurityAddress address={inp.address} unavailableText="unknown source address" />
                {" · "}
                {inp.valueSats !== null ? formatBalance(inp.valueSats, balanceUnit) : "?"}
                {" · "}
                {inp.belongsToWallet ? "wallet-owned" : "external input"}
              </div>
            ))}
          </div>

          {/* Transaction hex and optional Bitcoin Core broadcast */}
          {verifyResult.extractable && verifyResult.txHex ? (
            <div className="psbt-base64-block">
              <p className="terminal-heading">Transaction hex</p>
              {verifyResult.status !== "valid" ? (
                <p className="psbt-status-warning muted">
                  Warning: this transaction has unresolved issues. Review carefully before
                  broadcasting with another tool.
                </p>
              ) : null}
              <p className="muted psbt-change-addr">
                Broadcast is optional and disabled unless Bitcoin Core RPC is configured.
                Copy this txHex only after verifying every output.
              </p>
              {verifyResult.txid ? (
                <p className="muted psbt-change-addr">txid: {verifyResult.txid}</p>
              ) : null}
              <textarea
                className="psbt-textarea"
                readOnly
                value={verifyResult.txHex}
                rows={4}
              />
              <div className="psbt-actions">
                <button
                  className="compact-button"
                  type="button"
                  onClick={() => void copyTxHex()}
                >
                  {copiedTxHex ? "Copied txHex" : "Copy txHex"}
                </button>
              </div>
            </div>
          ) : null}

          <div className="psbt-base64-block">
            <p className="terminal-heading">Broadcast signed transaction</p>
            <p className="muted psbt-change-addr">
              This app does not sign transactions. Broadcasting sends an already-signed
              transaction to Bitcoin Core and cannot be undone.
            </p>

            <div className="psbt-verify-section" role="group" aria-label="Broadcast readiness">
              <p className="terminal-heading">Broadcast readiness</p>
              {broadcastReadinessRows.map((row) => (
                <div className="muted psbt-input-row" key={row.label}>
                  <strong>{row.label}</strong>
                  <span className={checklistStatusClass(row.status)}>{row.status}</span>
                  <span>{row.detail}</span>
                </div>
              ))}
            </div>

            {!verifyResult.extractable || !verifyResult.txHex ? (
              <p className="psbt-status-warning muted">
                Broadcast unavailable because no extractable transaction hex was produced.
              </p>
            ) : verifyResult.status === "warning" ? (
              <p className="psbt-status-warning muted">
                Broadcast disabled because this signed PSBT has warnings. Review and fix
                before broadcasting.
              </p>
            ) : verifyResult.status === "invalid" ? (
              <p className="psbt-status-invalid muted">
                Broadcast disabled because this signed PSBT is invalid.
              </p>
            ) : !broadcastBackendReady ? (
              <p className="muted">
                {broadcastStatus?.enabled && broadcastStatus.backend === "core"
                  ? "Bitcoin Core RPC is not configured or not reachable. Check the Atlas server configuration and /api/broadcast/core/status."
                  : "Broadcast backend is disabled. Configure Bitcoin Core RPC to broadcast from Atlas, or copy txHex and use another trusted tool."}
              </p>
            ) : (
              <>
                <p className="psbt-status-warning muted">
                  Broadcasting sends this verified signed transaction to the Bitcoin network
                  through your Bitcoin Core node. This cannot be undone.
                  For first validation, use testnet/signet or a tiny amount, and check the
                  signed transaction on your external signer and again in Atlas.
                </p>
                <label className="psbt-checkbox-row">
                  <input
                    type="checkbox"
                    checked={broadcastConfirmed}
                    onChange={(e) => setBroadcastConfirmed(e.target.checked)}
                  />
                  <span>I verified the recipient, amount, change output, and fee.</span>
                </label>
                <label className="psbt-field">
                  <span>Type BROADCAST to confirm</span>
                  <input
                    className="psbt-input"
                    type="text"
                    value={broadcastConfirmText}
                    onChange={(e) => setBroadcastConfirmText(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <div className="psbt-actions">
                  <button
                    className="compact-button"
                    type="button"
                    disabled={broadcastButtonDisabled}
                    onClick={() => void handleBroadcast()}
                  >
                    {broadcastLoading ? "Broadcasting..." : "Broadcast signed transaction"}
                  </button>
                </div>
              </>
            )}

            {broadcastStatus?.message ? (
              <p className="muted psbt-change-addr">
                Backend: {broadcastStatus.backend === "core" ? "Bitcoin Core" : "disabled"} - {broadcastStatus.message}
                {broadcastStatus.backend === "core" && broadcastStatus.reachable
                  ? ` Core RPC: connected${broadcastStatus.chain ? ` (${broadcastStatus.chain})` : ""}.`
                  : broadcastStatus.backend === "core"
                    ? " Core RPC: unavailable."
                    : ""}
              </p>
            ) : null}

            {broadcastMessage ? <p className="status-message">{broadcastMessage}</p> : null}

            {broadcastResult ? (
              <div className="psbt-verify-section">
                <p className="terminal-heading psbt-status-valid">Broadcast accepted</p>
                <p className="muted">Broadcast accepted by Bitcoin Core.</p>
                <p className="muted psbt-change-addr">txid: {broadcastResult.txid}</p>
                <p className="muted psbt-change-addr">
                  {broadcastResult.mempool?.message ?? "Mempool lookup pending."}
                </p>
                <div className="psbt-actions">
                  <button className="compact-button" type="button" onClick={() => void copyTxid()}>
                    {copiedTxid ? "Copied txid" : "Copy txid"}
                  </button>
                  {broadcastResult.mempool?.txUrl ? (
                    <a
                      className="compact-button"
                      href={broadcastResult.mempool.txUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open in local mempool
                    </a>
                  ) : (
                    <button className="compact-button" disabled type="button">
                      Local mempool web URL not configured
                    </button>
                  )}
                  <button
                    className="secondary-button compact-button"
                    type="button"
                    onClick={() => {
                      setBroadcastResult(null);
                      setBroadcastMessage("");
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ConnectionPanel({
  error,
  fulcrumStatus: _fulcrumStatus,
  mempoolStatus,
  refreshing,
  runtimeSettings: _runtimeSettings,
  onRefreshAll
}: {
  error: string;
  fulcrumStatus: FulcrumStatusResponse | null;
  mempoolStatus: MempoolStatusResponse | null;
  refreshing: boolean;
  runtimeSettings: RuntimeSettingsResponse | null;
  onRefreshAll: () => void;
}) {
  const status = mempoolStatus?.status ?? (error ? "offline" : "degraded");
  const badgeStatus: StatusKind =
    status === "online" ? "online" : status === "offline" ? "offline" : "degraded";
  const errors = mempoolStatus?.errors ?? (error ? [error] : []);
  const helper = getMempoolHelperText(badgeStatus);

  return (
    <div className="connection-panel">
      <div className="connection-summary">
        <div>
          <p className="terminal-heading">Connection issue</p>
          <p className="muted">{helper}</p>
        </div>
        <button
          className="secondary-button compact-button"
          disabled={refreshing}
          type="button"
          onClick={onRefreshAll}
        >
                Cancel
              </button>
      </div>
      {errors.length ? (
        <div className="connection-errors">
          {errors.map((item, index) => (
            <p className="status-message" key={`${item}-${index}`}>{item}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
function WalletNotesEditor({
  apiUrl,
  wallet,
  onWalletChange
}: {
  apiUrl: string;
  wallet: WalletRecord;
  onWalletChange: (wallet: WalletRecord) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(wallet.walletNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editing) {
      setDraft(wallet.walletNotes ?? "");
    }
  }, [wallet.walletNotes, editing]);

  async function saveNotes() {
    setSaving(true);
    setError("");
    try {
      const response = await apiRequest<{ wallet: WalletRecord }>(apiUrl, `/api/wallets/${wallet.id}/notes`, {
        method: "PATCH",
        body: JSON.stringify({ notes: draft })
      });
      onWalletChange(response.wallet);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save wallet note");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="wallet-note-editor">
        <label>
          <span>note</span>
          <textarea
            maxLength={1000}
            rows={3}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <div className="button-row">
          <button className="compact-button" disabled={saving} type="button" onClick={() => void saveNotes()}>
            Save
          </button>
          <button
            className="secondary-button compact-button"
            disabled={saving}
            type="button"
            onClick={() => {
              setDraft(wallet.walletNotes ?? "");
              setError("");
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </div>
        {error ? <p className="status-message">{error}</p> : null}
      </div>
    );
  }

  return (
    <p className="wallet-note-line">
      <span className="terminal-meta">note:</span> {wallet.walletNotes ?? "none"}{" "}
      <button className="text-button" type="button" onClick={() => setEditing(true)}>
        {wallet.walletNotes ? "edit" : "add"}
      </button>
    </p>
  );
}

export function WalletAddressPanel({
  apiUrl,
  balanceUnit,
  mempoolBadgeStatus,
  onBalanceStatusChange,
  refreshToken,
  setBalanceUnit,
  wallet,
  onWalletChange
}: {
  apiUrl: string;
  balanceUnit: "sats" | "btc";
  mempoolBadgeStatus: StatusKind;
  onBalanceStatusChange: (status: StatusKind) => void;
  refreshToken: number;
  setBalanceUnit: (unit: "sats" | "btc") => void;
  wallet: WalletRecord;
  onWalletChange: (wallet: WalletRecord) => void;
}) {
  const [chain, setChain] = useState<"both" | "receive" | "change">("both");
  const [usageTab, setUsageTab] = useState<"all" | "used" | "unused" | "unknown">("all");
  const [addresses, setAddresses] = useState<DerivedAddress[]>([]);
  const [nextReceiveAddress, setNextReceiveAddress] = useState<DerivedAddress | null>(null);
  const [balance, setBalance] = useState<BalanceSummary | null>(null);
  const [receiveBalance, setReceiveBalance] = useState<BalanceSummary | null>(null);
  const [changeBalance, setChangeBalance] = useState<BalanceSummary | null>(null);
  const [usageLookupNote, setUsageLookupNote] = useState("");
  const [nextReceiveLookupNote, setNextReceiveLookupNote] = useState("");
  const [balanceFailedCount, setBalanceFailedCount] = useState(0);
  const [message, setMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [discovery, setDiscovery] = useState<WalletBalanceResponse["discovery"]>(null);
  const [loading, setLoading] = useState(false);
  const [qrAddress, setQrAddress] = useState<DerivedAddress | null>(null);
  const [qrPanelKey, setQrPanelKey] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrError, setQrError] = useState("");
  const [editingAddressLabelKey, setEditingAddressLabelKey] = useState("");
  const [addressLabelDraft, setAddressLabelDraft] = useState("");
  const [addressNotesDraft, setAddressNotesDraft] = useState("");
  const [labelSaving, setLabelSaving] = useState(false);
  const [labelError, setLabelError] = useState("");

  useEffect(() => {
    void refreshAddresses();
  }, [wallet.id, chain, refreshToken]);

  function openAddressQr(address: DerivedAddress, panelKey: string) {
    setQrDataUrl("");
    setQrError("");
    setQrPanelKey(panelKey);
    setQrAddress({ ...address });
  }

  function closeAddressQr() {
    setQrAddress(null);
    setQrPanelKey("");
    setQrDataUrl("");
    setQrError("");
  }

  useEffect(() => {
    if (!qrAddress) {
      setQrDataUrl("");
      setQrError("");
      return;
    }

    let cancelled = false;
    setQrDataUrl("");
    setQrError("");
    void QRCode.toString(qrAddress.address, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
      width: 240
    })
      .then((svg) => {
        if (!cancelled) {
          setQrDataUrl(svgToDataUrl(svg));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrError("Address QR could not be rendered. Copy the address text instead.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [qrAddress]);

  async function refreshAddresses() {
    setLoading(true);
    setMessage("");
    setCopyMessage("");

    try {
      const scanLimit = Math.min(200, Math.max(wallet.gapLimit, wallet.gapLimit + 20));
      const response = await apiRequest<WalletBalanceResponse>(
        apiUrl,
        `/api/wallets/${wallet.id}/balance?chain=${chain}&limit=${scanLimit}`
      );
      setAddresses(response.addresses ?? []);
      setNextReceiveAddress(response.nextUnusedReceiveAddress ?? null);
      setBalance({
        confirmedBalance: response.confirmedBalance,
        unconfirmedBalance: response.unconfirmedBalance,
        totalBalance: response.totalBalance
      });
      setReceiveBalance(response.receiveBalance ?? null);
      setChangeBalance(response.changeBalance ?? null);
      setUsageLookupNote(response.lookupError ?? "");
      setNextReceiveLookupNote(response.nextReceiveLookupError ?? "");
      setBalanceFailedCount(response.failedAddresses?.length ?? 0);
      setDiscovery(response.discovery ?? null);
      onBalanceStatusChange(
        response.status === "offline"
          ? "offline"
          : response.lookupError || response.status === "partial"
            ? "degraded"
            : "online"
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Balance lookup failed — API server may be unreachable");
      setAddresses([]);
      setNextReceiveAddress(null);
      setBalance(null);
      setReceiveBalance(null);
      setChangeBalance(null);
      setUsageLookupNote("");
      setNextReceiveLookupNote("");
      setBalanceFailedCount(0);
      setDiscovery(null);
      onBalanceStatusChange("offline");
    } finally {
      setLoading(false);
    }
  }

  async function copyAddress(address: DerivedAddress) {
    try {
      await copyTextToClipboard(address.address);
      setCopyMessage(`Copied ${address.chain} address from ${wallet.name}`);
    } catch {
      setCopyMessage(`Unable to copy ${address.chain} address from ${wallet.name}`);
    }
  }

  function beginEditAddressLabel(address: DerivedAddress) {
    const label = getAddressLabel(wallet, address.chain, address.index);
    setEditingAddressLabelKey(addressLabelKey(address));
    setAddressLabelDraft(label?.label ?? "");
    setAddressNotesDraft(label?.notes ?? "");
    setLabelError("");
  }

  function cancelEditAddressLabel() {
    setEditingAddressLabelKey("");
    setAddressLabelDraft("");
    setAddressNotesDraft("");
    setLabelError("");
  }

  async function saveAddressLabel(address: DerivedAddress) {
    setLabelSaving(true);
    setLabelError("");
    try {
      const response = await apiRequest<{ wallet: WalletRecord }>(apiUrl, `/api/wallets/${wallet.id}/address-labels`, {
        method: "PATCH",
        body: JSON.stringify({
          chain: address.chain,
          index: address.index,
          address: address.address,
          label: addressLabelDraft,
          notes: addressNotesDraft
        })
      });
      onWalletChange(response.wallet);
      cancelEditAddressLabel();
    } catch (error) {
      setLabelError(error instanceof Error ? error.message : "Unable to save address label");
    } finally {
      setLabelSaving(false);
    }
  }

  async function clearAddressLabel(address: DerivedAddress) {
    setLabelSaving(true);
    setLabelError("");
    try {
      const response = await apiRequest<{ wallet: WalletRecord }>(apiUrl, `/api/wallets/${wallet.id}/address-labels`, {
        method: "DELETE",
        body: JSON.stringify({
          chain: address.chain,
          index: address.index
        })
      });
      onWalletChange(response.wallet);
      cancelEditAddressLabel();
    } catch (error) {
      setLabelError(error instanceof Error ? error.message : "Unable to clear address label");
    } finally {
      setLabelSaving(false);
    }
  }

  const visibleAddresses =
    usageTab === "all"
      ? addresses
      : addresses.filter((address) => address.usage === usageTab);
  const receiveDisplayLimit = Math.max(1, wallet.gapLimit);
  const receiveAddresses =
    usageTab === "all"
      ? selectDefaultReceiveAddresses(visibleAddresses, receiveDisplayLimit)
      : visibleAddresses.filter((address) => address.chain === "receive");
  const changeAddresses = visibleAddresses.filter((address) => address.chain === "change");
  const hiddenUsedEmptyReceiveCount =
    usageTab === "all" ? addresses.filter(isUsedEmptyReceiveAddress).length : 0;
  const unknownAddressCount = addresses.filter((address) => address.usage === "unknown").length;
  const usageLookupFailed = Boolean(usageLookupNote) || (unknownAddressCount === addresses.length && addresses.length > 0);
  const emptyUsageMessage = getEmptyUsageMessage({
    usageTab,
    usageLookupFailed,
    unknownAddressCount
  });
  const nextReceiveMessage = getNextReceiveMessage({
    loading,
    mempoolBadgeStatus,
    usageLookupFailed: usageLookupFailed || Boolean(nextReceiveLookupNote)
  });
  const nextReceiveQrPanelKey = nextReceiveAddress ? addressQrPanelKey("next-receive", nextReceiveAddress) : "";

  return (
    <section id="receive" className="wallet-address-panel">
      {message ? <p className="status-message">{message}</p> : null}
      {copyMessage ? <p className="status-message">{copyMessage}</p> : null}
      {usageLookupNote && balanceFailedCount > 0 ? (
        <p className="status-message">
          {balanceFailedCount} address lookup(s) failed — balance total may be incomplete. API may be rate-limiting or unreachable.
        </p>
      ) : null}

      <div className="balance-summary">
        <div className="wallet-card-header">
          <div>
            <p className="terminal-heading">Balance</p>
            <h2 className="balance-total">
              {loading ? "syncing…" : balance != null ? formatBalance(balance.totalBalance, "sats") : "—"}
            </h2>
            {!loading && balance != null ? (
              <p className="muted">{formatBalance(balance.totalBalance, "btc")}</p>
            ) : null}
          </div>
          <div className="tab-row">
            <button
              className={balanceUnit === "sats" ? "compact-button" : "secondary-button compact-button"}
              type="button"
              onClick={() => setBalanceUnit("sats")}
            >
              sats
            </button>
            <button
              className={balanceUnit === "btc" ? "compact-button" : "secondary-button compact-button"}
              type="button"
              onClick={() => setBalanceUnit("btc")}
            >
              BTC
            </button>
          </div>
        </div>
        <dl className="balance-grid">
          <div>
            <dt>Confirmed</dt>
            <dd>{loadedBalance(balance?.confirmedBalance, loading, balanceUnit)}</dd>
          </div>
          <div>
            <dt>Unconfirmed</dt>
            <dd>{loadedBalance(balance?.unconfirmedBalance, loading, balanceUnit)}</dd>
          </div>
          <div>
            <dt>Receive</dt>
            <dd>{loadedBalance(receiveBalance?.totalBalance, loading, balanceUnit)}</dd>
          </div>
          <div>
            <dt>Change</dt>
            <dd>{loadedBalance(changeBalance?.totalBalance, loading, balanceUnit)}</dd>
          </div>
        </dl>
      </div>

      <div className="next-address-placeholder">
        <dt>Next receive</dt>
        {nextReceiveAddress ? (
          <dd>
            <span className="terminal-meta">receive #{nextReceiveAddress.index}</span>
            <span className={`usage-pill usage-${nextReceiveAddress.usage}`}>
              {nextReceiveAddress.usage}
            </span>
            <AddressLabelPill label={getAddressLabel(wallet, nextReceiveAddress.chain, nextReceiveAddress.index)} />
            <SecurityAddress address={nextReceiveAddress.address} />
            <span>{nextReceiveAddress.path}</span>
            <span className="muted">Verify this receive address on your signing device before sending large amounts.</span>
            <span className="muted">The browser display is not the final authority.</span>
            <div className="button-row">
              <button
                className="secondary-button compact-button"
                type="button"
                onClick={() => void copyAddress(nextReceiveAddress)}
              >
                Copy
              </button>
              <button
                className="secondary-button compact-button"
                type="button"
                onPointerDown={(event) => {
                  if (event.button === 0) {
                    openAddressQr(nextReceiveAddress, nextReceiveQrPanelKey);
                  }
                }}
                onClick={() => openAddressQr(nextReceiveAddress, nextReceiveQrPanelKey)}
              >
                QR
              </button>
              <button
                className="secondary-button compact-button"
                type="button"
                onClick={() => beginEditAddressLabel(nextReceiveAddress)}
              >
                Label
              </button>
            </div>
            {editingAddressLabelKey === addressLabelKey(nextReceiveAddress) ? (
              <InlineLabelEditor
                error={labelError}
                label={addressLabelDraft}
                notes={addressNotesDraft}
                saving={labelSaving}
                onCancel={cancelEditAddressLabel}
                onClear={() => void clearAddressLabel(nextReceiveAddress)}
                onLabelChange={setAddressLabelDraft}
                onNotesChange={setAddressNotesDraft}
                onSave={() => void saveAddressLabel(nextReceiveAddress)}
              />
            ) : null}
            {qrAddress && qrPanelKey === nextReceiveQrPanelKey ? (
              <AddressQrPanel
                address={qrAddress}
                dataUrl={qrDataUrl}
                error={qrError}
                onClose={closeAddressQr}
                onCopy={() => void copyAddress(qrAddress)}
              />
            ) : null}
          </dd>
        ) : (
          <dd>
            {nextReceiveMessage}
          </dd>
        )}
      </div>

      <p className="psbt-safety-notice muted">
        Verify this receive address on your signing device before sending large amounts.
        The browser display is not the final authority.
      </p>

      <div className="wallet-card-header compact-section-header">
        <div>
          <p className="terminal-heading">Addresses</p>
        </div>
        <button
          className="secondary-button compact-button"
          disabled={loading}
          type="button"
          onClick={() => void refreshAddresses()}
        >
          {loading ? "Refreshing balance" : "Refresh balance"}
        </button>
      </div>

      <div className="tab-row">
        <button
          className={usageTab === "all" ? "compact-button" : "secondary-button compact-button"}
          type="button"
          onClick={() => setUsageTab("all")}
        >
          All derived addresses
        </button>
        <button
          className={usageTab === "used" ? "compact-button" : "secondary-button compact-button"}
          type="button"
          onClick={() => setUsageTab("used")}
        >
          Used addresses
        </button>
        <button
          className={usageTab === "unused" ? "compact-button" : "secondary-button compact-button"}
          type="button"
          onClick={() => setUsageTab("unused")}
        >
          Unused addresses
        </button>
        <button
          className={usageTab === "unknown" ? "compact-button" : "secondary-button compact-button"}
          type="button"
          onClick={() => setUsageTab("unknown")}
        >
          Unknown addresses
        </button>
      </div>

      <div className="tab-row">
        <button
          className={chain === "both" ? "compact-button" : "secondary-button compact-button"}
          type="button"
          onClick={() => setChain("both")}
        >
          Receive + change
        </button>
        <button
          className={chain === "receive" ? "compact-button" : "secondary-button compact-button"}
          type="button"
          onClick={() => setChain("receive")}
        >
          Receive
        </button>
        <button
          className={chain === "change" ? "compact-button" : "secondary-button compact-button"}
          type="button"
          onClick={() => setChain("change")}
        >
          Change
        </button>
      </div>

      {loading ? <TerminalSkeleton label="SYNCING ADDRESS BALANCES" rows={4} /> : null}
      {!loading && visibleAddresses.length === 0 ? (
        <p className="muted">{emptyUsageMessage}</p>
      ) : null}
      {receiveAddresses.length ? (
        <>
        {hiddenUsedEmptyReceiveCount > 0 ? (
          <p className="muted technical-line">Used empty receive addresses are hidden from this list. Actual index and path values are preserved.</p>
        ) : null}
        <AddressTable
          addresses={receiveAddresses}
          balanceUnit={balanceUnit}
          editingKey={editingAddressLabelKey}
          getLabel={(address) => getAddressLabel(wallet, address.chain, address.index)}
          labelDraft={addressLabelDraft}
          labelError={labelError}
          labelSaving={labelSaving}
          notesDraft={addressNotesDraft}
          activeQrKey={qrPanelKey}
          qrAddress={qrAddress}
          qrDataUrl={qrDataUrl}
          qrError={qrError}
          title="Receive"
          onBeginEditLabel={beginEditAddressLabel}
          onCancelEditLabel={cancelEditAddressLabel}
          onClearLabel={clearAddressLabel}
          onCloseQr={closeAddressQr}
          onCopy={copyAddress}
          onLabelDraftChange={setAddressLabelDraft}
          onNotesDraftChange={setAddressNotesDraft}
          onSaveLabel={saveAddressLabel}
          onShowQr={(address) => openAddressQr(address, addressQrPanelKey("table", address))}
        />
        </>
      ) : null}
      {changeAddresses.length ? (
        <AddressTable
          addresses={changeAddresses}
          balanceUnit={balanceUnit}
          editingKey={editingAddressLabelKey}
          getLabel={(address) => getAddressLabel(wallet, address.chain, address.index)}
          labelDraft={addressLabelDraft}
          labelError={labelError}
          labelSaving={labelSaving}
          notesDraft={addressNotesDraft}
          activeQrKey={qrPanelKey}
          qrAddress={qrAddress}
          qrDataUrl={qrDataUrl}
          qrError={qrError}
          title="Change"
          onBeginEditLabel={beginEditAddressLabel}
          onCancelEditLabel={cancelEditAddressLabel}
          onClearLabel={clearAddressLabel}
          onCloseQr={closeAddressQr}
          onCopy={copyAddress}
          onLabelDraftChange={setAddressLabelDraft}
          onNotesDraftChange={setAddressNotesDraft}
          onSaveLabel={saveAddressLabel}
          onShowQr={(address) => openAddressQr(address, addressQrPanelKey("table", address))}
        />
      ) : null}

    </section>
  );
}

function TransactionHistoryPanel({
  apiUrl,
  backendKind,
  balanceUnit,
  onTxStatusChange,
  refreshToken,
  wallet,
  onWalletChange
}: {
  apiUrl: string;
  backendKind: string;
  balanceUnit: "sats" | "btc";
  onTxStatusChange: (status: StatusKind) => void;
  refreshToken: number;
  wallet: WalletRecord;
  onWalletChange: (wallet: WalletRecord) => void;
}) {
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [txStatus, setTxStatus] = useState<"online" | "partial" | "offline" | null>(null);
  const [scanSummary, setScanSummary] = useState<WalletScanSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [txLimit, setTxLimit] = useState(50);
  const [addressLimit, setAddressLimit] = useState(20);
  const [txPages, setTxPages] = useState(1);
  const [editingTxid, setEditingTxid] = useState("");
  const [txLabelDraft, setTxLabelDraft] = useState("");
  const [txNotesDraft, setTxNotesDraft] = useState("");
  const [labelSaving, setLabelSaving] = useState(false);
  const [labelError, setLabelError] = useState("");

  useEffect(() => {
    void refreshTransactions();
  }, [wallet.id, txLimit, addressLimit, txPages, refreshToken]);

  async function refreshTransactions() {
    setLoading(true);
    setMessage("");
    try {
      const response = await apiRequest<WalletTransactionsResponse>(
        apiUrl,
        `/api/wallets/${wallet.id}/transactions?chain=both&addressLimit=${addressLimit}&txLimit=${txLimit}&pages=${txPages}`
      );
      setTransactions(response.transactions ?? []);
      setTxStatus(response.status);
      setScanSummary(response.scanSummary ?? null);
      onTxStatusChange(response.status === "online" ? "online" : response.status === "offline" ? "offline" : "degraded");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load transaction history");
      setTransactions([]);
      setTxStatus(null);
      setScanSummary(null);
      onTxStatusChange("offline");
    } finally {
      setLoading(false);
    }
  }

  function beginEditTransactionLabel(tx: WalletTransaction) {
    const label = getTransactionLabel(wallet, tx.txid);
    setEditingTxid(tx.txid);
    setTxLabelDraft(label?.label ?? "");
    setTxNotesDraft(label?.notes ?? "");
    setLabelError("");
  }

  function cancelEditTransactionLabel() {
    setEditingTxid("");
    setTxLabelDraft("");
    setTxNotesDraft("");
    setLabelError("");
  }

  async function saveTransactionLabel(tx: WalletTransaction) {
    setLabelSaving(true);
    setLabelError("");
    try {
      const response = await apiRequest<{ wallet: WalletRecord }>(apiUrl, `/api/wallets/${wallet.id}/transaction-labels`, {
        method: "PATCH",
        body: JSON.stringify({
          txid: tx.txid,
          label: txLabelDraft,
          notes: txNotesDraft
        })
      });
      onWalletChange(response.wallet);
      cancelEditTransactionLabel();
    } catch (error) {
      setLabelError(error instanceof Error ? error.message : "Unable to save transaction label");
    } finally {
      setLabelSaving(false);
    }
  }

  async function clearTransactionLabel(tx: WalletTransaction) {
    setLabelSaving(true);
    setLabelError("");
    try {
      const response = await apiRequest<{ wallet: WalletRecord }>(apiUrl, `/api/wallets/${wallet.id}/transaction-labels`, {
        method: "DELETE",
        body: JSON.stringify({ txid: tx.txid })
      });
      onWalletChange(response.wallet);
      cancelEditTransactionLabel();
    } catch (error) {
      setLabelError(error instanceof Error ? error.message : "Unable to clear transaction label");
    } finally {
      setLabelSaving(false);
    }
  }

  const isDeepScan = addressLimit > 20 || txPages > 1;
  const isPublicBackend = backendKind === "mempool-public";
  const failedCount = scanSummary?.failedLookups ?? 0;

  return (
    <section id="activity" className="tx-history-panel wallet-address-panel">
      <div className="wallet-card-header">
        <div>
          <p className="terminal-heading">Transactions</p>
        </div>
        <button
          className="secondary-button compact-button"
          disabled={loading}
          type="button"
          onClick={() => void refreshTransactions()}
        >
          {loading ? "Refreshing…" : "Refresh txs"}
        </button>
      </div>

      <details className="metadata-details scan-controls-details">
        <summary className="muted">History filters</summary>
        <div className="scan-controls-grid">
          <label className="scan-control-label">
            <span>Addresses</span>
            <select
              value={addressLimit}
              disabled={loading}
              onChange={(e) => setAddressLimit(Number(e.target.value))}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
          <label className="scan-control-label">
            <span>Pages/addr</span>
            <select
              value={txPages}
              disabled={loading}
              onChange={(e) => setTxPages(Number(e.target.value))}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
          <label className="scan-control-label">
            <span>Show</span>
            <select
              value={txLimit}
              disabled={loading}
              onChange={(e) => setTxLimit(Number(e.target.value))}
            >
              <option value={25}>25 txs</option>
              <option value={50}>50 txs</option>
              <option value={100}>100 txs</option>
              <option value={200}>200 txs</option>
            </select>
          </label>
        </div>
        {isDeepScan && isPublicBackend ? (
          <p className="muted technical-line">Deep scans can be slow on public APIs.</p>
        ) : null}
      </details>

      {failedCount > 0 ? (
        <p className="status-message">
          {failedCount} address lookup(s) failed. History may be incomplete.
          {isPublicBackend ? " Public API may rate-limit deep scans. Try a local mempool backend." : " Increase timeout or lower scan depth."}
        </p>
      ) : null}

      {message ? <p className="status-message">{message}</p> : null}

      {loading ? (
        <TerminalSkeleton label="LOADING TRANSACTIONS" rows={4} />
      ) : transactions.length === 0 ? (
        <p className="muted">
          {txStatus === "offline"
            ? "Transaction lookup failed — Mempool/Fulcrum connection unavailable. Check API settings."
            : txStatus === "partial"
              ? "Some transactions may be missing — API returned partial results. Try a deeper scan or local backend."
              : "No transactions found in scanned address range."}
        </p>
      ) : (
        <div className="tx-list">
          {transactions.map((tx) => (
            <TransactionRow
              key={tx.txid}
              balanceUnit={balanceUnit}
              editing={editingTxid === tx.txid}
              label={getTransactionLabel(wallet, tx.txid)}
              labelDraft={txLabelDraft}
              labelError={labelError}
              labelSaving={labelSaving}
              notesDraft={txNotesDraft}
              tx={tx}
              onBeginEdit={() => beginEditTransactionLabel(tx)}
              onCancelEdit={cancelEditTransactionLabel}
              onClearLabel={() => void clearTransactionLabel(tx)}
              onLabelDraftChange={setTxLabelDraft}
              onNotesDraftChange={setTxNotesDraft}
              onSaveLabel={() => void saveTransactionLabel(tx)}
            />
          ))}
        </div>
      )}
      <p className="label-privacy-hint muted">
        xpub and labels together can reveal wallet history. Keep this device private.
      </p>
    </section>
  );
}

function TransactionRow({
  balanceUnit,
  editing,
  label,
  labelDraft,
  labelError,
  labelSaving,
  notesDraft,
  tx,
  onBeginEdit,
  onCancelEdit,
  onClearLabel,
  onLabelDraftChange,
  onNotesDraftChange,
  onSaveLabel
}: {
  balanceUnit: "sats" | "btc";
  editing: boolean;
  label: TransactionLabel | null;
  labelDraft: string;
  labelError: string;
  labelSaving: boolean;
  notesDraft: string;
  tx: WalletTransaction;
  onBeginEdit: () => void;
  onCancelEdit: () => void;
  onClearLabel: () => void;
  onLabelDraftChange: (value: string) => void;
  onNotesDraftChange: (value: string) => void;
  onSaveLabel: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const directionClass = `tx-direction-badge tx-${tx.direction}`;

  const formattedTime =
    tx.blockTime !== null
      ? new Date(tx.blockTime * 1000).toLocaleString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        })
      : null;

  return (
    <div className="tx-row">
      <div className="tx-meta-row">
        <span className={directionClass}>{formatDirection(tx.direction)}</span>
        <span className={`tx-amount tx-amount-${tx.direction}`}>
          {formatTransactionAmount(tx.netSats, balanceUnit)}
        </span>
        <span className={`usage-pill usage-${tx.status === "confirmed" ? "used" : tx.status === "unconfirmed" ? "unused" : "unknown"}`}>
          {formatTransactionStatus(tx)}
        </span>
        {tx.feeSats !== null ? (
          <span className="terminal-meta muted">fee: {formatBalance(tx.feeSats, balanceUnit)}</span>
        ) : null}
        {formattedTime ? (
          <span className="terminal-meta">{formattedTime}</span>
        ) : (
          <span className="terminal-meta muted">pending</span>
        )}
        {tx.blockHeight !== null ? (
          <span className="terminal-meta">block {new Intl.NumberFormat("en-US").format(tx.blockHeight)}</span>
        ) : null}
        <TransactionLabelPill label={label} />
        <button
          className="secondary-button compact-button"
          type="button"
          onClick={onBeginEdit}
        >
          Label
        </button>
        <button
          className="secondary-button compact-button"
          type="button"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Less" : "More"}
        </button>
      </div>
      <div className="tx-txid">
        <span className="terminal-meta">txid: </span>
        <code>{tx.txid.slice(0, 16)}...{tx.txid.slice(-8)}</code>
      </div>
      {label?.notes ? (
        <div className="utxo-note-line">
          <span className="terminal-meta">Transaction note:</span> {label.notes}
        </div>
      ) : null}
      {editing ? (
        <InlineLabelEditor
          error={labelError}
          label={labelDraft}
          notes={notesDraft}
          saving={labelSaving}
          onCancel={onCancelEdit}
          onClear={onClearLabel}
          onLabelChange={onLabelDraftChange}
          onNotesChange={onNotesDraftChange}
          onSave={onSaveLabel}
        />
      ) : null}
      {expanded ? (
        <div className="tx-related">
          {tx.feeSats !== null ? (
            <p className="terminal-meta">fee: {formatBalance(tx.feeSats, balanceUnit)}</p>
          ) : null}
          <p className="terminal-meta">Related addresses ({tx.relatedAddresses.length}):</p>
          {tx.relatedAddresses.map((rel, i) => (
            <div className="tx-related-tag" key={i}>
              <span className="terminal-meta">{rel.role} / {rel.chain}[{rel.index}]</span>
              <code>{rel.address}</code>
              <span className="terminal-meta">{formatBalance(rel.valueSats, balanceUnit)}</span>
            </div>
          ))}
          <p className="tx-privacy-hint muted">
            Extended public key reveals all wallet addresses. Treat this data as sensitive.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function formatTransactionAmount(netSats: number, unit: "sats" | "btc"): string {
  const abs = Math.abs(netSats);
  const formatted = formatBalance(abs, unit);
  return netSats >= 0 ? `+${formatted}` : `-${formatted}`;
}

function formatDirection(direction: WalletTransaction["direction"]): string {
  if (direction === "incoming") return "IN";
  if (direction === "outgoing") return "OUT";
  if (direction === "self") return "SELF";
  return "UNKNOWN";
}

function InlineLabelEditor({
  error,
  label,
  notes,
  saving,
  onCancel,
  onClear,
  onLabelChange,
  onNotesChange,
  onSave,
  showNotes = true
}: {
  error: string;
  label: string;
  notes: string;
  saving: boolean;
  onCancel: () => void;
  onClear: () => void;
  onLabelChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onSave: () => void;
  showNotes?: boolean;
}) {
  return (
    <div className="label-editor">
      <label>
        <span>Label</span>
        <input
          maxLength={80}
          placeholder="Wallet-local label"
          value={label}
          onChange={(event) => onLabelChange(event.target.value)}
        />
      </label>
      {showNotes ? (
        <label>
          <span>Note</span>
          <textarea
            maxLength={500}
            placeholder="Optional local note"
            rows={3}
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
          />
        </label>
      ) : null}
      <div className="button-row">
        <button className="compact-button" disabled={saving} type="button" onClick={onSave}>
          Save
        </button>
        <button className="secondary-button compact-button" disabled={saving} type="button" onClick={onClear}>
          Clear
        </button>
        <button className="secondary-button compact-button" disabled={saving} type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {error ? <p className="status-message">{error}</p> : null}
      <p className="label-privacy-hint muted">
        Labels are stored locally in the encrypted vault. They are not written to the Bitcoin network.
      </p>
    </div>
  );
}

function AddressLabelPill({ label }: { label: AddressLabel | null }) {
  if (!label) {
    return <span className="label-pill label-pill-empty">unlabeled</span>;
  }

  return <span className="label-pill">{label.label}</span>;
}

function TransactionLabelPill({ label }: { label: TransactionLabel | null }) {
  if (!label || !label.label) {
    return null;
  }

  return <span className="label-pill">{label.label}</span>;
}

function AddressTable({
  addresses,
  balanceUnit,
  editingKey,
  getLabel,
  labelDraft,
  labelError,
  labelSaving,
  notesDraft,
  activeQrKey,
  qrAddress,
  qrDataUrl,
  qrError,
  title,
  onBeginEditLabel,
  onCancelEditLabel,
  onClearLabel,
  onCloseQr,
  onCopy,
  onLabelDraftChange,
  onNotesDraftChange,
  onSaveLabel,
  onShowQr
}: {
  addresses: DerivedAddress[];
  balanceUnit: "sats" | "btc";
  editingKey: string;
  getLabel: (address: DerivedAddress) => AddressLabel | null;
  labelDraft: string;
  labelError: string;
  labelSaving: boolean;
  notesDraft: string;
  activeQrKey: string;
  qrAddress: DerivedAddress | null;
  qrDataUrl: string;
  qrError: string;
  title: string;
  onBeginEditLabel: (address: DerivedAddress) => void;
  onCancelEditLabel: () => void;
  onClearLabel: (address: DerivedAddress) => Promise<void>;
  onCloseQr: () => void;
  onCopy: (address: DerivedAddress) => void;
  onLabelDraftChange: (value: string) => void;
  onNotesDraftChange: (value: string) => void;
  onSaveLabel: (address: DerivedAddress) => Promise<void>;
  onShowQr: (address: DerivedAddress) => void;
}) {
  return (
    <div className="address-section">
      <h2>{title}</h2>
      <div className="address-table">
        <div className="address-row address-row-header" aria-hidden="true">
          <span>Chain</span>
          <span>Index</span>
          <span>Address</span>
          <span>Label</span>
          <span>Balance</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        {addresses.map((address) => {
          const label = getLabel(address);
          const isEditing = editingKey === addressLabelKey(address);
          const qrKey = addressQrPanelKey("table", address);
          const isQrOpen = activeQrKey === qrKey && qrAddress?.address === address.address;
          return (
            <Fragment key={`${address.chain}-${address.index}`}>
            <div className="address-row">
              <div className="address-cell">
                <dt>Chain</dt>
                <dd>{address.chain}</dd>
              </div>
              <div className="address-cell address-index">
                <dt>Index</dt>
                <dd>#{address.index}</dd>
              </div>
              <div className="address-cell address-value">
                <dt>Address</dt>
                <SecurityAddress address={address.address} />
                <span className="muted">{address.path}</span>
              </div>
              <div className="address-cell">
                <dt>Label</dt>
                <AddressLabelPill label={label} />
              </div>
              <div className="address-cell numeric-value">
                <dt>Balance</dt>
                <dd>{formatNullableBalance(address.totalBalance, balanceUnit)}</dd>
              </div>
              <div className="address-cell usage-stack">
                <dt>Status</dt>
                <span className={`usage-pill usage-${address.usage}`}>{address.usage}</span>
                <span className="muted">
                  txCount: {address.txCount ?? "—"}
                </span>
              </div>
              <div className="button-row address-actions">
                <button
                  className="secondary-button compact-button"
                  type="button"
                  onClick={() => void onCopy(address)}
                >
                  Copy
                </button>
                <button
                  className="secondary-button compact-button"
                  type="button"
                  onPointerDown={(event) => {
                    if (event.button === 0) {
                      onShowQr(address);
                    }
                  }}
                  onClick={() => onShowQr(address)}
                >
                  QR
                </button>
                <button
                  className="secondary-button compact-button"
                  type="button"
                  onClick={() => onBeginEditLabel(address)}
                >
                  Label
                </button>
              </div>
              {isEditing ? (
                <div className="address-label-editor">
                  <InlineLabelEditor
                    error={labelError}
                    label={labelDraft}
                    notes={notesDraft}
                    saving={labelSaving}
                    showNotes={false}
                    onCancel={onCancelEditLabel}
                    onClear={() => void onClearLabel(address)}
                    onLabelChange={onLabelDraftChange}
                    onNotesChange={onNotesDraftChange}
                    onSave={() => void onSaveLabel(address)}
                  />
                </div>
              ) : null}
            </div>
            {isQrOpen && qrAddress ? (
              <AddressQrPanel
                address={qrAddress}
                dataUrl={qrDataUrl}
                error={qrError}
                onClose={onCloseQr}
                onCopy={() => void onCopy(qrAddress)}
              />
            ) : null}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

export function AddressQrPanel({
  address,
  dataUrl,
  error,
  onClose,
  onCopy
}: {
  address: DerivedAddress;
  dataUrl: string;
  error: string;
  onClose: () => void;
  onCopy: () => void;
}) {
  return (
    <div className="address-qr-panel" role="region" aria-label={`${address.chain} address QR`}>
      <div className="wallet-card-header">
        <div>
          <p className="terminal-heading">Address QR</p>
          <p className="muted">
            {address.chain} #{address.index}
          </p>
        </div>
        <button className="secondary-button compact-button" type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="qr-box">
        {dataUrl ? <img alt="Address QR code" src={dataUrl} width={240} height={240} /> : null}
        {!dataUrl && !error ? <span className="muted">Rendering address QR...</span> : null}
        {error ? <span className="status-message">{error}</span> : null}
      </div>
      <div className="address-qr-text">
        <SecurityAddress address={address.address} />
      </div>
      <div className="button-row">
        <button className="secondary-button compact-button" type="button" onClick={onCopy}>
          Copy address
        </button>
      </div>
    </div>
  );
}

function getEmptyUsageMessage({
  usageTab,
  usageLookupFailed,
  unknownAddressCount
}: {
  usageTab: "all" | "used" | "unused" | "unknown";
  usageLookupFailed: boolean;
  unknownAddressCount: number;
}): string {
  if (usageTab === "unused" && usageLookupFailed) {
    return "Usage lookup failed; addresses are unknown and are not counted as unused.";
  }

  if (usageTab === "unused" && unknownAddressCount > 0) {
    return "No confirmed unused addresses to show. Unknown addresses are listed separately.";
  }

  if (usageTab === "unknown") {
    return "No unknown addresses to show.";
  }

  if (usageTab === "used") {
    return "No used addresses to show for this filter.";
  }

  return "No addresses to show for this filter.";
}

function getNextReceiveMessage({
  loading,
  mempoolBadgeStatus,
  usageLookupFailed
}: {
  loading: boolean;
  mempoolBadgeStatus: StatusKind;
  usageLookupFailed: boolean;
}): string {
  if (loading) {
    return "Calculating next receive address...";
  }

  if (mempoolBadgeStatus === "degraded" || mempoolBadgeStatus === "offline") {
    return "Mempool lookup is degraded. Next receive may be incomplete.";
  }

  if (usageLookupFailed) {
    return "Address usage lookup is incomplete. Refresh to calculate the next receive address.";
  }

  return "Address usage lookup is incomplete. Refresh to calculate the next receive address.";
}


function getMempoolHelperText(status: StatusKind): string {
  if (status === "online") {
    return "Mempool lookup is healthy.";
  }
  if (status === "offline") {
    return "Mempool lookup is unavailable.";
  }
  return "Mempool lookup partially failed.";
}

function getBackendGuidance(backendKind: string, fulcrumConfigured: boolean): string {
  if (fulcrumConfigured || backendKind === "fulcrum") {
    return "Fulcrum 설정은 감지됐지만, 현재 잔고/거래 조회는 mempool-compatible HTTP backend를 사용합니다.";
  }
  if (backendKind === "mempool-public") {
    return "공용 API 모드입니다. 테스트에는 편하지만, 프라이버시를 위해 로컬 백엔드를 권장합니다.";
  }
  if (backendKind === "mempool-local") {
    return "Local mempool backend detected.";
  }
  return "";
}

function truncateEndpoint(endpoint: string): string {
  if (endpoint.length <= 50) return endpoint;
  return `${endpoint.slice(0, 47)}...`;
}

function formatCheckedAt(value: string | undefined): string {
  if (!value) {
    return "never";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "never";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function getAddressLabel(
  wallet: WalletRecord,
  chain: "receive" | "change",
  index: number
): AddressLabel | null {
  return (wallet.addressLabels ?? []).find((label) => label.chain === chain && label.index === index) ?? null;
}

function getAddressLabelByAddress(wallet: WalletRecord, address: string): AddressLabel | null {
  return (wallet.addressLabels ?? []).find((label) => label.address === address) ?? null;
}

function getTransactionLabel(wallet: WalletRecord, txid: string): TransactionLabel | null {
  return (wallet.transactionLabels ?? []).find((label) => label.txid === txid) ?? null;
}

function getUtxoNote(wallet: WalletRecord, txid: string, vout: number): UtxoNote | null {
  return (wallet.utxoNotes ?? []).find((note) => note.txid === txid && note.vout === vout) ?? null;
}

function addressLabelKey(address: Pick<DerivedAddress, "chain" | "index">): string {
  return `${address.chain}-${address.index}`;
}

function addressQrPanelKey(scope: "next-receive" | "table", address: Pick<DerivedAddress, "chain" | "index">): string {
  return `${scope}-${addressLabelKey(address)}`;
}

function formatNullableBalance(value: number | null | undefined, unit: "sats" | "btc"): string {
  return value === null || value === undefined ? "—" : formatBalance(value, unit);
}

function parseAmountToSats(value: string, unit: "sats" | "btc"): { sats: number | null; error: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { sats: null, error: "Invalid amount." };
  }

  if (unit === "sats") {
    if (!/^\d+$/.test(trimmed)) {
      return { sats: null, error: "Sats amount must be an integer." };
    }
    const sats = Number(trimmed);
    if (!Number.isSafeInteger(sats) || sats <= 0) {
      return { sats: null, error: "Invalid amount." };
    }
    return { sats, error: "" };
  }

  if (!/^\d+(\.\d{1,8})?$/.test(trimmed)) {
    return { sats: null, error: "BTC amount must use up to 8 decimals." };
  }
  const [whole, fraction = ""] = trimmed.split(".");
  const sats = Number(BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, "0")));
  if (!Number.isSafeInteger(sats) || sats <= 0) {
    return { sats: null, error: "Invalid amount." };
  }
  return { sats, error: "" };
}

export function parseFeeRate(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return null;
  }

  const feeRate = Number(trimmed);
  return Number.isFinite(feeRate) && feeRate > 0 && feeRate <= 1000 ? feeRate : null;
}

function estimateBuilderVbytes(
  scriptType: WalletScriptType,
  inputCount: number,
  outputCount: number
): number | null {
  const inputVbytes =
    scriptType === "native-segwit" ? 68 :
    scriptType === "nested-segwit" ? 91 :
    scriptType === "taproot" ? 58 :
    null;
  if (inputVbytes === null) {
    return null;
  }
  return 12 + inputCount * inputVbytes + outputCount * 43;
}

function looksLikeAddressForWalletNetwork(address: string, network: WalletRecord["network"]): boolean {
  if (network === "mainnet") {
    return /^(bc1|[13])/.test(address);
  }
  return /^(tb1|[mn2])/.test(address);
}

function loadedBalance(value: number | undefined, loading: boolean, unit: "sats" | "btc"): string {
  if (loading) return "…";
  if (value == null) return "—";
  return formatBalance(value, unit);
}

function formatBalance(sats: number, unit: "sats" | "btc"): string {
  if (unit === "btc") {
    return `${(sats / 100_000_000).toFixed(8)} BTC`;
  }

  return `${new Intl.NumberFormat("en-US").format(sats)} sats`;
}

function formatKrwBalance(sats: number, marketPrice: MarketPriceResponse | null): string {
  if (!marketPrice || marketPrice.priceKrw === null) {
    return "KRW price unavailable";
  }
  const krwValue = Math.round((sats / 100_000_000) * marketPrice.priceKrw);
  const formatted = new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: 0
  }).format(krwValue);
  return marketPrice.status === "stale" ? `≈ ₩${formatted} · stale price` : `≈ ₩${formatted}`;
}

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function truncateMiddle(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  const tail = Math.floor((maxLen - 3) / 2);
  const head = maxLen - 3 - tail;
  return str.slice(0, head) + "..." + str.slice(str.length - tail);
}

function extractExtendedPublicKey(value: string): string | null {
  const embeddedMatch = value.match(/\b(xpub|ypub|zpub|tpub|upub|vpub)[1-9A-HJ-NP-Za-km-z]{40,}\b/);
  return embeddedMatch?.[0] ?? null;
}

function detectImportMetadata(
  importText: string,
  network: WalletRecord["network"],
  sourceDevice: SourceDevice
): {
  extendedPublicKey: string | null;
  type: ExtendedPublicKeyType | null;
  network: WalletRecord["network"] | null;
  scriptType: WalletScriptType;
  accountPath: string | null;
  masterFingerprint: string | null;
  importFormat: ImportFormat;
  privateInput: boolean;
  warnings: string[];
  unsupportedReason: string | null;
} {
  const trimmed = importText.trim();
  if (!trimmed) {
    return emptyImportDetection();
  }
  const privateWarning = looksPrivateImport(trimmed);
  if (privateWarning !== null) {
    return {
      ...emptyImportDetection(),
      privateInput: true,
      warnings: [],
      unsupportedReason: privateWarning
    };
  }

  const json = parseImportJson(trimmed);
  if (json) {
    const xfp =
      stringField(json, "xfp") ??
      stringField(json, "fingerprint") ??
      stringField(json, "master_fingerprint") ??
      stringField(json, "masterFingerprint");
    const candidate =
      jsonImportCandidate(json, "bip84", "native-segwit") ??
      jsonImportCandidate(json, "p2wpkh", "native-segwit") ??
      jsonImportCandidate(json, "zpub", "native-segwit") ??
      jsonImportCandidate(json, "bip49", "nested-segwit") ??
      jsonImportCandidate(json, "p2sh_p2wpkh", "nested-segwit") ??
      jsonImportCandidate(json, "ypub", "nested-segwit") ??
      jsonImportCandidate(json, "bip44", "legacy") ??
      jsonImportCandidate(json, "p2pkh", "legacy") ??
      jsonImportCandidate(json, "bip86", "taproot") ??
      jsonImportCandidate(json, "p2tr", "taproot") ??
      jsonImportCandidate(json, "taproot", "taproot") ??
      jsonImportCandidate(json, "xpub", "unknown");
    return {
      extendedPublicKey: candidate?.key ?? null,
      type: candidate?.key ? candidate.key.slice(0, 4) as ExtendedPublicKeyType : null,
      network: candidate?.key ? networkForKey(candidate.key) : null,
      scriptType: candidate?.scriptType ?? "unknown",
      accountPath: candidate?.accountPath ?? null,
      masterFingerprint: normalizeFingerprint(xfp),
      importFormat: "coldcard-json",
      privateInput: false,
      warnings: candidate ? [] : ["JSON detected, but no supported watch-only extended public key was found."],
      unsupportedReason: candidate ? null : "Unsupported JSON export"
    };
  }

  // BBQr multipart
  if (trimmed.startsWith("B$")) {
    const frame = parseBbqrFrame(trimmed);
    if (frame) {
      try {
        const state = addBbqrFrame(createBbqrCollectorState(), frame).state;
        const payload = assembleBbqrPayload(state);
        if (payload) {
          return detectImportMetadata(payload, network, "coldcard");
        }
      } catch {
        // Continue to the sanitized unsupported BBQr message below.
      }
    }
    return {
      ...emptyImportDetection(),
      importFormat: "bbqr",
      warnings: [],
      unsupportedReason: "Incomplete or unsupported BBQr format. Scan all Coldcard Generic JSON BBQr frames."
    };
  }

  // Raw PSBT
  if (trimmed.startsWith("cHNidP8B")) {
    return {
      ...emptyImportDetection(),
      importFormat: "psbt-ur",
      warnings: [],
      unsupportedReason: "PSBT signing request detected. This is not a watch-only wallet export. Use xpub or descriptor export instead."
    };
  }

  const lower = trimmed.toLowerCase();
  if (lower.startsWith("ur:")) {
    if (lower.startsWith("ur:crypto-psbt")) {
      return {
        ...emptyImportDetection(),
        importFormat: "psbt-ur",
        warnings: [],
        unsupportedReason: "PSBT signing request detected. This is not a watch-only wallet export. Use xpub or descriptor export instead."
      };
    }

    const key = extractExtendedPublicKey(trimmed);
    let importFormat: ImportFormat;
    if (lower.startsWith("ur:crypto-account")) {
      importFormat = sourceDevice === "passport-core" ? "passport-setup-qr" : "crypto-account-ur";
    } else if (lower.startsWith("ur:crypto-hdkey")) {
      importFormat = "crypto-hdkey-ur";
    } else {
      importFormat = "ur-xpub";
    }
    return {
      extendedPublicKey: key,
      type: key ? key.slice(0, 4) as ExtendedPublicKeyType : null,
      network: key ? networkForKey(key) : network,
      scriptType: key ? scriptTypeForKey(key) : "unknown",
      accountPath: null,
      masterFingerprint: null,
      importFormat,
      privateInput: false,
      warnings: ["UR payload detected. Animated UR/BCUR decoding is not fully supported yet."],
      unsupportedReason: key ? null : "UR decoding not available yet. Use descriptor/file/paste xpub import."
    };
  }

  const descriptorText = findDescriptorCandidate(trimmed);
  const descriptorScript = descriptorText ? descriptorScriptType(descriptorText) : null;
  if (descriptorScript) {
    if (/\[[^\]]+\]/.test(descriptorText ?? "") && !/\[[0-9a-fA-F]{8}(?:\/[^\]]+)?\]/.test(descriptorText ?? "")) {
      return {
        ...emptyImportDetection(),
        importFormat: "descriptor",
        warnings: ["Invalid BIP32 origin metadata: master fingerprint must be 8 hex characters."],
        unsupportedReason: "Invalid BIP32 origin metadata: master fingerprint must be 8 hex characters."
      };
    }

    const key = extractExtendedPublicKey(descriptorText ?? "");
    const origin = descriptorText?.match(/\[([0-9a-fA-F]{8})(?:\/([^\]]+))?\]/);
    return {
      extendedPublicKey: key,
      type: key ? key.slice(0, 4) as ExtendedPublicKeyType : null,
      network: key ? networkForKey(key) : network,
      scriptType: descriptorScript,
      accountPath: origin?.[2] ? normalizeAccountPath(origin[2]) : accountPathFor(descriptorScript, network),
      masterFingerprint: origin?.[1]?.toLowerCase() ?? null,
      importFormat: "descriptor",
      privateInput: false,
      warnings: [],
      unsupportedReason: key ? null : "Descriptor does not contain a supported extended public key."
    };
  }

  const originCandidate = findOriginKeyCandidate(trimmed);
  if (originCandidate) {
    const validOrigin = originCandidate.match(/^\[([0-9a-fA-F]{8})(?:\/([^\]]+))?\]/);
    if (!validOrigin) {
      return {
        ...emptyImportDetection(),
        importFormat: "origin-extended-public-key",
        warnings: ["Invalid BIP32 origin metadata: master fingerprint must be 8 hex characters."],
        unsupportedReason: "Invalid BIP32 origin metadata: master fingerprint must be 8 hex characters."
      };
    }
  }

  const keyExpression = originCandidate?.match(/^\[([0-9a-fA-F]{8})(?:\/([^\]]+))?\]((xpub|ypub|zpub|tpub|upub|vpub)[1-9A-HJ-NP-Za-km-z]{40,})/);
  if (keyExpression) {
    const key = keyExpression[3] ?? "";
    return {
      extendedPublicKey: key,
      type: key.slice(0, 4) as ExtendedPublicKeyType,
      network: networkForKey(key),
      scriptType: scriptTypeForKey(key),
      accountPath: keyExpression[2] ? normalizeAccountPath(keyExpression[2]) : accountPathFor(scriptTypeForKey(key), network),
      masterFingerprint: keyExpression[1]?.toLowerCase() ?? null,
      importFormat: "origin-extended-public-key",
      privateInput: false,
      warnings: scriptTypeForKey(key) === "unknown" ? ["xpub/tpub detected. Confirm script type before receiving funds."] : [],
      unsupportedReason: null
    };
  }

  const key = extractExtendedPublicKey(trimmed);
  if (key) {
    const scriptType = scriptTypeForKey(key);
    return {
      extendedPublicKey: key,
      type: key.slice(0, 4) as ExtendedPublicKeyType,
      network: networkForKey(key),
      scriptType,
      accountPath: accountPathFor(scriptType, networkForKey(key) ?? network),
      masterFingerprint: null,
      importFormat: "bare-extended-public-key",
      privateInput: false,
      warnings: scriptType === "unknown" ? ["xpub/tpub detected. Confirm script type before receiving funds."] : [],
      unsupportedReason: null
    };
  }

  return {
    ...emptyImportDetection(),
    importFormat: "unknown",
    warnings: ["This input does not look like an xpub/ypub/zpub, descriptor, key expression, or supported JSON format."],
    unsupportedReason: "Unsupported import format — expected xpub/ypub/zpub, descriptor, or compatible JSON export"
  };
}

function emptyImportDetection() {
  return {
    extendedPublicKey: null,
    type: null,
    network: null,
    scriptType: "unknown" as const,
    accountPath: null,
    masterFingerprint: null,
    importFormat: "unknown" as const,
    privateInput: false,
    warnings: [],
    unsupportedReason: null
  };
}

type QrFrameFormat =
  | "bare-extended-public-key"
  | "descriptor"
  | "origin-extended-public-key"
  | "coldcard-json"
  | "crypto-account-ur"
  | "crypto-hdkey-ur"
  | "ur-xpub"
  | "ur-animated"
  | "bbqr"
  | "psbt-ur"
  | "unknown";

type QrFrameClassification = {
  format: QrFrameFormat;
  animated: boolean;
  watchOnlyCandidate: boolean;
  frameIndex: number | null;
  totalFrames: number | null;
};

function classifyQrFrame(frame: string): QrFrameClassification {
  const trimmed = frame.trim();
  if (!trimmed) {
    return { format: "unknown", animated: false, watchOnlyCandidate: false, frameIndex: null, totalFrames: null };
  }

  const bbqr = parseBbqrFrame(trimmed);
  if (bbqr) {
    return {
      format: "bbqr",
      animated: true,
      watchOnlyCandidate: bbqr.fileType === "J" || bbqr.fileType === "U",
      frameIndex: bbqr.index + 1,
      totalFrames: bbqr.total
    };
  }
  if (trimmed.startsWith("B$")) {
    return { format: "bbqr", animated: true, watchOnlyCandidate: false, frameIndex: null, totalFrames: null };
  }

  if (trimmed.startsWith("cHNidP8B")) {
    return { format: "psbt-ur", animated: false, watchOnlyCandidate: false, frameIndex: null, totalFrames: null };
  }

  const lower = trimmed.toLowerCase();

  if (lower.startsWith("ur:")) {
    if (lower.startsWith("ur:crypto-psbt")) {
      return { format: "psbt-ur", animated: isUrAnimated(trimmed), watchOnlyCandidate: false, frameIndex: urFrameIdx(trimmed), totalFrames: urFrameTotal(trimmed) };
    }

    const animated = isUrAnimated(trimmed);
    const frameIndex = urFrameIdx(trimmed);
    const totalFrames = urFrameTotal(trimmed);

    if (animated) {
      return { format: "ur-animated", animated: true, watchOnlyCandidate: true, frameIndex, totalFrames };
    }
    if (lower.startsWith("ur:crypto-account")) {
      return { format: "crypto-account-ur", animated: false, watchOnlyCandidate: true, frameIndex: null, totalFrames: null };
    }
    if (lower.startsWith("ur:crypto-hdkey")) {
      return { format: "crypto-hdkey-ur", animated: false, watchOnlyCandidate: true, frameIndex: null, totalFrames: null };
    }
    return { format: "ur-xpub", animated: false, watchOnlyCandidate: true, frameIndex: null, totalFrames: null };
  }

  const stripped = trimmed.replace(/#[a-z0-9]+$/i, "");
  if (stripped.startsWith("sh(wpkh(") || stripped.startsWith("wpkh(") || stripped.startsWith("pkh(") || stripped.startsWith("tr(")) {
    return { format: "descriptor", animated: false, watchOnlyCandidate: true, frameIndex: null, totalFrames: null };
  }

  if (/^\[[0-9a-fA-F]{8}/.test(trimmed) && /\b(xpub|ypub|zpub|tpub|upub|vpub)[1-9A-HJ-NP-Za-km-z]{40,}/.test(trimmed)) {
    return { format: "origin-extended-public-key", animated: false, watchOnlyCandidate: true, frameIndex: null, totalFrames: null };
  }

  if (trimmed.startsWith("{")) {
    const hasXpub = /\b(xpub|ypub|zpub|tpub|upub|vpub)[1-9A-HJ-NP-Za-km-z]{40,}/.test(trimmed);
    return { format: "coldcard-json", animated: false, watchOnlyCandidate: hasXpub, frameIndex: null, totalFrames: null };
  }

  if (/\b(xpub|ypub|zpub|tpub|upub|vpub)[1-9A-HJ-NP-Za-km-z]{40,}/.test(trimmed)) {
    return { format: "bare-extended-public-key", animated: false, watchOnlyCandidate: true, frameIndex: null, totalFrames: null };
  }

  return { format: "unknown", animated: false, watchOnlyCandidate: false, frameIndex: null, totalFrames: null };
}

function isUrAnimated(value: string): boolean {
  return /^ur:[^/]+\/\d+of\d+\//i.test(value) || /^ur:[^/]+\/\d+-\d+\//i.test(value);
}

function urFrameIdx(value: string): number | null {
  const m = value.match(/^ur:[^/]+\/(\d+)of\d+\//i) ?? value.match(/^ur:[^/]+\/(\d+)-\d+\//i);
  return m?.[1] !== undefined ? parseInt(m[1], 10) : null;
}

function urFrameTotal(value: string): number | null {
  const m = value.match(/^ur:[^/]+\/\d+of(\d+)\//i) ?? value.match(/^ur:[^/]+\/\d+-(\d+)\//i);
  return m?.[1] !== undefined ? parseInt(m[1], 10) : null;
}

function looksPrivateImport(value: string): string | null {
  if (/\b(xprv|yprv|zprv|tprv|uprv|vprv)[1-9a-hj-np-z]+\b/i.test(value)) {
    return "This looks like an extended private key (xprv/yprv/zprv). Never enter private keys into this app.";
  }
  if (/\b[5KL][1-9A-HJ-NP-Za-km-z]{50,51}\b/.test(value)) {
    return "This looks like a WIF private key. Never enter private keys into this app.";
  }
  const lower = value.trim().toLowerCase();
  const words = lower.match(/\b[a-z]{3,10}\b/g) ?? [];
  if ((words.length === 12 || words.length === 18 || words.length === 24) && lower === words.join(" ")) {
    return "This looks like a seed phrase (mnemonic). Never enter seed phrases into this app.";
  }
  if (/(wif|privatekey|private_key|privkey|seed phrase|mnemonic)/i.test(value)) {
    return "This input contains keywords associated with private keys or seed phrases. Never enter either into this app.";
  }
  return null;
}

function descriptorScriptType(value: string): WalletScriptType | null {
  const descriptor = value.replace(/#[a-z0-9]+$/i, "");
  if (descriptor.startsWith("sh(wpkh(")) return "nested-segwit";
  if (descriptor.startsWith("wpkh(")) return "native-segwit";
  if (descriptor.startsWith("pkh(")) return "legacy";
  if (descriptor.startsWith("tr(")) return "taproot";
  return null;
}

function findDescriptorCandidate(value: string): string | null {
  const descriptorPrefixes = ["sh(wpkh(", "wpkh(", "pkh(", "tr("];
  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const start = descriptorPrefixes
      .map((prefix) => line.indexOf(prefix))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b)[0];
    if (start === undefined) continue;
    const candidate = line.slice(start).trim().split(/\s+/)[0] ?? "";
    if (descriptorPrefixes.some((prefix) => candidate.startsWith(prefix))) {
      return candidate;
    }
  }
  return null;
}

function findOriginKeyCandidate(value: string): string | null {
  const match = value.match(/\[[^\]]+\](xpub|ypub|zpub|tpub|upub|vpub)[1-9A-HJ-NP-Za-km-z]{40,}/);
  return match?.[0] ?? null;
}

function scriptTypeForKey(value: string): WalletScriptType {
  if (value.startsWith("ypub") || value.startsWith("upub")) return "nested-segwit";
  if (value.startsWith("zpub") || value.startsWith("vpub")) return "native-segwit";
  return "unknown";
}

function networkForKey(value: string): WalletRecord["network"] {
  return value.startsWith("tpub") || value.startsWith("upub") || value.startsWith("vpub")
    ? "testnet"
    : "mainnet";
}

function accountPathFor(scriptType: WalletScriptType, network: WalletRecord["network"]): string | null {
  const coinType = network === "mainnet" ? "0" : "1";
  if (scriptType === "legacy") return `m/44'/${coinType}'/0'`;
  if (scriptType === "nested-segwit") return `m/49'/${coinType}'/0'`;
  if (scriptType === "native-segwit") return `m/84'/${coinType}'/0'`;
  if (scriptType === "taproot") return `m/86'/${coinType}'/0'`;
  return null;
}

function normalizeAccountPath(value: string): string {
  return `m/${value.replace(/h/gi, "'").replace(/^m\//, "")}`;
}

function normalizeFingerprint(value: string | null): string | null {
  return value && /^[0-9a-fA-F]{8}$/.test(value) ? value.toLowerCase() : null;
}

function parseImportJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function jsonImportCandidate(
  value: Record<string, unknown>,
  field: string,
  scriptType: WalletScriptType
): { key: string; scriptType: WalletScriptType; accountPath: string | null } | null {
  const candidate = value[field];
  if (typeof candidate === "string") {
    const key = extractExtendedPublicKey(candidate);
    const path = stringField(value, `${field}_deriv`) ?? stringField(value, `${field}_path`);
    return key ? { key, scriptType, accountPath: path ? normalizeAccountPath(path) : accountPathFor(scriptType, networkForKey(key)) } : null;
  }
  if (typeof candidate === "object" && candidate !== null && !Array.isArray(candidate)) {
    const record = candidate as Record<string, unknown>;
    const key = extractExtendedPublicKey(String(record._pub ?? record.xpub ?? record.ypub ?? record.zpub ?? record.tpub ?? record.upub ?? record.vpub ?? record.value ?? ""));
    const path = typeof record.deriv === "string"
      ? record.deriv
      : typeof record.derivation === "string"
        ? record.derivation
        : typeof record.path === "string"
          ? record.path
          : null;
    return key ? { key, scriptType, accountPath: path ? normalizeAccountPath(path) : accountPathFor(scriptType, networkForKey(key)) } : null;
  }
  return null;
}

function stringField(value: Record<string, unknown>, field: string): string | null {
  return typeof value[field] === "string" ? value[field] as string : null;
}

function deviceLabel(sourceDevice: SourceDevice): string {
  return sourceDeviceOptions.find((option) => option.value === sourceDevice)?.label ?? "Other";
}

function deviceAlias(sourceDevice: SourceDevice): string {
  const aliases: Record<SourceDevice, string> = {
    coldcard: "COLD",
    keystone: "KEYSTONE",
    seedsigner: "SEEDSIGNER",
    krux: "KRUX",
    "passport-core": "PASSPORT",
    jade: "JADE",
    other: "OTHER"
  };
  return aliases[sourceDevice];
}

function formatScriptType(scriptType: WalletScriptType): string {
  return scriptType.replace("-", " ");
}

function describeKeyType(type: ExtendedPublicKeyType): string {
  switch (type) {
    case "xpub": return "mainnet legacy / P2PKH";
    case "ypub": return "mainnet nested segwit (P2SH-P2WPKH)";
    case "zpub": return "mainnet native segwit (P2WPKH)";
    case "tpub": return "testnet/signet legacy-like";
    case "upub": return "testnet/signet nested segwit";
    case "vpub": return "testnet/signet native segwit";
  }
}

function keyNetworkMismatchMessage(
  type: ExtendedPublicKeyType | null,
  selectedNetwork: WalletRecord["network"]
): string {
  if (type === "zpub" && selectedNetwork !== "mainnet") {
    return "zpub is a mainnet native-segwit key. For testnet/signet native segwit, use vpub or choose mainnet.";
  }
  if ((type === "xpub" || type === "ypub") && selectedNetwork !== "mainnet") {
    return `${type} is a mainnet key. Use ${
      type === "ypub" ? "upub" : "tpub"
    } for testnet/signet, or choose mainnet.`;
  }
  if ((type === "tpub" || type === "upub" || type === "vpub") && selectedNetwork === "mainnet") {
    return `${type} is a testnet/signet key. Use xpub/ypub/zpub for mainnet, or choose testnet/signet.`;
  }
  return "Network/script type does not match this key prefix.";
}

function maskRawImport(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= 96) {
    return compact;
  }
  return `${compact.slice(0, 64)}...${compact.slice(-24)}`;
}

function walletSafetyWarnings(wallet: WalletRecord): string[] {
  const warnings: string[] = [];
  if ((wallet.type === "zpub" || wallet.type === "vpub") && wallet.scriptType !== "native-segwit") {
    warnings.push("zpub/vpub usually maps to native SegWit. Verify script type before receiving funds.");
  }
  if ((wallet.type === "ypub" || wallet.type === "upub") && wallet.scriptType !== "nested-segwit") {
    warnings.push("ypub/upub usually maps to nested SegWit. Verify script type before receiving funds.");
  }
  if ((wallet.type === "xpub" || wallet.type === "tpub") && wallet.scriptType !== "legacy") {
    warnings.push("xpub/tpub can be used with multiple policies. Verify the receive address on your cold wallet.");
  }
  if (wallet.scriptType === "taproot" && wallet.importFormat !== "descriptor" && wallet.importFormat !== "origin-extended-public-key") {
    warnings.push("Taproot wallet via xpub/tpub: confirm BIP86 derivation path (m/86'/0'/0') before receiving funds.");
  }
  if (
    wallet.importFormat === "crypto-account-ur" ||
    wallet.importFormat === "crypto-hdkey-ur" ||
    wallet.importFormat === "passport-setup-qr" ||
    wallet.importFormat === "ur-xpub"
  ) {
    warnings.push("UR payload import: animated UR/BCUR decoding is not complete yet. Verify addresses match your device.");
  }
  return warnings;
}

async function apiRequest<T = unknown>(
  apiUrl: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const url = buildApiUrl(apiUrl, path);
  console.info("Atlas API request", { mode: describeApiConnectionMode(apiUrl), path });

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      credentials: "include",
      headers
    });
  } catch (error) {
    console.error("Atlas API fetch failed", {
      mode: describeApiConnectionMode(apiUrl),
      path,
      error: error instanceof Error ? error.message : "network error"
    });
    throw new Error("API unavailable. Check Atlas API service and same-origin /api configuration.");
  }

  const payload = (await response.json().catch(() => ({}))) as { error?: unknown; message?: unknown };

  if (!response.ok) {
    throw new Error(friendlyApiError(response.status, payload, path));
  }

  return payload as T;
}

function friendlyApiError(status: number, payload: { error?: unknown; message?: unknown }, path: string): string {
  const safeMessage = safeApiMessage(payload.error) ?? safeApiMessage(payload.message);

  if (status === 401) {
    if (path.startsWith("/api/auth/")) {
      return safeMessage ?? "Invalid credentials or code";
    }
    return "Session expired or not signed in. Sign in again.";
  }
  if (status === 403) {
    return safeMessage ?? "This action is not allowed.";
  }
  if (status === 423) {
    return "Vault is locked. Unlock the vault and try again.";
  }
  if (status === 429) {
    return "Too many attempts. Wait and try again.";
  }
  if (path.includes("/psbt/broadcast")) {
    return safeMessage ?? "Broadcast failed.";
  }
  if (status >= 500) {
    return "Server error. Check API logs.";
  }
  return safeMessage ?? `Request failed with ${status}`;
}

function safeApiMessage(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const message = value.trim();
  if (!message || message.length > 300) {
    return null;
  }
  if (/stack trace|at\s+\w+\s+\(|CORE_RPC_PASSWORD|SESSION_SECRET|watch_wallet_session|rpcpassword/i.test(message)) {
    return null;
  }
  if (message === watchOnlyImportError) {
    return message;
  }
  if (looksPrivateImport(message)) {
    return null;
  }
  if (extractExtendedPublicKey(message)) {
    return null;
  }
  return message;
}

function buildApiUrl(apiUrl: string, path: string): string {
  const normalizedBase = apiUrl.trim().replace(/\/+$/, "");
  if (!normalizedBase || normalizedBase === "/api") {
    return path;
  }
  return `${normalizedBase}${path}`;
}

function describeApiConnectionMode(apiUrl: string): string {
  const normalizedBase = apiUrl.trim().replace(/\/+$/, "");
  if (!normalizedBase || normalizedBase === "/api") {
    return "same-origin";
  }
  return "direct";
}
