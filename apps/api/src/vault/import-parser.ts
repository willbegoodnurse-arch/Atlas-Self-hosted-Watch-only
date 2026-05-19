import type {
  BitcoinNetwork,
  ExtendedPublicKeyType,
  ImportFormat,
  ScriptType,
  SourceDevice
} from "./types.js";
import { addBbqrFrame, assembleBbqrPayload, createBbqrCollectorState, parseBbqrFrame } from "./bbqr.js";

export const watchOnlyImportError =
  "This is a watch-only wallet. Private keys or seed phrases must never be imported.";

export type ParsedWalletImport = {
  extendedPublicKey: string | null;
  type: ExtendedPublicKeyType | null;
  sourceDevice: SourceDevice;
  network: BitcoinNetwork;
  scriptType: ScriptType;
  accountPath: string | null;
  masterFingerprint: string | null;
  importFormat: ImportFormat;
  rawImport: string | null;
  notes: string | null;
  warnings: string[];
  unsupportedReason: string | null;
};

export function parseWalletImport(input: {
  importText: string;
  sourceDevice?: SourceDevice;
  network?: BitcoinNetwork;
  scriptType?: ScriptType;
  notes?: string | null;
}): ParsedWalletImport {
  const importText = input.importText.trim();
  assertWatchOnlyImport(importText);

  const sourceDevice = input.sourceDevice ?? "other";
  const fallbackNetwork = input.network ?? "mainnet";
  const notes = sanitizeOptionalText(input.notes, 500);
  const bbqrFrame = parseBbqrFrame(importText);
  if (bbqrFrame) {
    try {
      const state = addBbqrFrame(createBbqrCollectorState(), bbqrFrame).state;
      const payload = assembleBbqrPayload(state);
      if (payload) {
        const json = parseJson(payload);
        if (json) {
          return applyOverrides(parseColdcardLikeJson(json, payload, "coldcard", fallbackNetwork, notes), input);
        }
      }
    } catch {
      // Fall through to the sanitized unsupported BBQr response below.
    }
  }
  if (importText.startsWith("B$")) {
    return unsupportedImport("Incomplete or unsupported BBQr format. Atlas imports Coldcard Generic JSON/Text BBQr after all frames are collected.", {
      sourceDevice,
      network: fallbackNetwork,
      importFormat: "bbqr",
      notes
    });
  }

  // Raw PSBT base64 magic bytes
  if (importText.startsWith("cHNidP8B")) {
    return {
      extendedPublicKey: null,
      type: null,
      sourceDevice,
      network: fallbackNetwork,
      scriptType: "unknown",
      accountPath: null,
      masterFingerprint: null,
      importFormat: "psbt-ur",
      rawImport: null,
      notes,
      warnings: [],
      unsupportedReason:
        "PSBT signing requests cannot be saved as watch-only wallets. Export an xpub or descriptor from the device instead."
    };
  }

  const json = parseJson(importText);

  if (json) {
    return applyOverrides(parseColdcardLikeJson(json, importText, sourceDevice, fallbackNetwork, notes), input);
  }

  const ur = parseUr(importText, sourceDevice, fallbackNetwork, notes);
  if (ur) {
    return applyOverrides(ur, input);
  }

  const descriptor = parseDescriptor(importText, sourceDevice, fallbackNetwork, notes);
  if (descriptor) {
    return applyOverrides(descriptor, input);
  }

  const keyExpression = parseKeyExpression(importText, sourceDevice, fallbackNetwork, notes);
  if (keyExpression) {
    return applyOverrides(keyExpression, input);
  }

  const key = extractExtendedPublicKey(importText);
  if (key) {
    return applyOverrides(
      parsedFromKey(key, {
        sourceDevice,
        network: networkForKey(key) ?? fallbackNetwork,
        accountPath: null,
        masterFingerprint: null,
        importFormat: importFormatForKey(key),
        rawImport: importText === key ? null : importText,
        notes,
        warnings: scriptTypeForKey(key) === "unknown"
          ? ["Plain xpub/tpub imports need script type confirmation before address derivation."]
          : [],
        unsupportedReason: null
      }),
      input
    );
  }

  return {
    extendedPublicKey: null,
    type: null,
    sourceDevice,
    network: fallbackNetwork,
    scriptType: input.scriptType ?? "unknown",
    accountPath: null,
    masterFingerprint: null,
    importFormat: "unknown",
    rawImport: importText,
    notes,
    warnings: ["Import format was detected but no supported extended public key was extracted."],
    unsupportedReason: "Unsupported import format"
  };
}

export function assertWatchOnlyImport(value: string): void {
  const normalized = value.trim();
  const lower = normalized.toLowerCase();

  if (/\b(xprv|yprv|zprv|tprv|uprv|vprv)[1-9a-hj-np-z]+\b/i.test(normalized)) {
    throw new Error(watchOnlyImportError);
  }

  if (/\b[5KL][1-9A-HJ-NP-Za-km-z]{50,51}\b/.test(normalized)) {
    throw new Error(watchOnlyImportError);
  }

  if (/(wif|privatekey|private_key|privkey|seed phrase|mnemonic)/i.test(normalized)) {
    throw new Error(watchOnlyImportError);
  }

  const words = lower.match(/\b[a-z]{3,10}\b/g) ?? [];
  if ((words.length === 12 || words.length === 18 || words.length === 24) && lower === words.join(" ")) {
    throw new Error(watchOnlyImportError);
  }
}

export function detectExtendedPublicKeyType(value: string): ExtendedPublicKeyType {
  const key = extractExtendedPublicKey(value);
  if (!key) {
    throw new Error("Extended public key must start with xpub, ypub, zpub, tpub, upub, or vpub");
  }
  return key.slice(0, 4) as ExtendedPublicKeyType;
}

export function extractExtendedPublicKey(value: string): string | null {
  const match = value.match(/\b(xpub|ypub|zpub|tpub|upub|vpub)[1-9A-HJ-NP-Za-km-z]{40,}\b/);
  return match?.[0] ?? null;
}

export function scriptTypeForKey(value: string): ScriptType {
  if (value.startsWith("ypub") || value.startsWith("upub")) {
    return "nested-segwit";
  }
  if (value.startsWith("zpub") || value.startsWith("vpub")) {
    return "native-segwit";
  }
  return "unknown";
}

export function defaultScriptTypeForExistingKey(value: string): ScriptType {
  if (value.startsWith("xpub") || value.startsWith("tpub")) {
    return "legacy";
  }
  return scriptTypeForKey(value);
}

export function networkForKey(value: string): BitcoinNetwork | null {
  if (value.startsWith("xpub") || value.startsWith("ypub") || value.startsWith("zpub")) {
    return "mainnet";
  }
  if (value.startsWith("tpub") || value.startsWith("upub") || value.startsWith("vpub")) {
    return "testnet";
  }
  return null;
}

export function accountPathFor(scriptType: ScriptType, network: BitcoinNetwork): string | null {
  const coinType = network === "mainnet" ? "0" : "1";
  if (scriptType === "legacy") {
    return `m/44'/${coinType}'/0'`;
  }
  if (scriptType === "nested-segwit") {
    return `m/49'/${coinType}'/0'`;
  }
  if (scriptType === "native-segwit") {
    return `m/84'/${coinType}'/0'`;
  }
  if (scriptType === "taproot") {
    return `m/86'/${coinType}'/0'`;
  }
  return null;
}

export function importFormatForKey(value: string): ImportFormat {
  return "bare-extended-public-key";
}

function findDescriptorCandidate(value: string): string | null {
  const descriptorPrefixes = ["sh(wpkh(", "wpkh(", "pkh(", "tr("];
  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const start = descriptorPrefixes
      .map((prefix) => line.indexOf(prefix))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b)[0];
    if (start === undefined) {
      continue;
    }
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

function unsupportedImport(
  reason: string,
  options: {
    sourceDevice: SourceDevice;
    network: BitcoinNetwork;
    importFormat: ImportFormat;
    notes: string | null;
  }
): ParsedWalletImport {
  return {
    extendedPublicKey: null,
    type: null,
    sourceDevice: options.sourceDevice,
    network: options.network,
    scriptType: "unknown",
    accountPath: null,
    masterFingerprint: null,
    importFormat: options.importFormat,
    rawImport: null,
    notes: options.notes,
    warnings: [reason],
    unsupportedReason: reason
  };
}

function parseDescriptor(
  value: string,
  sourceDevice: SourceDevice,
  network: BitcoinNetwork,
  notes: string | null
): ParsedWalletImport | null {
  const trimmed = value.trim();
  const descriptorText = findDescriptorCandidate(trimmed);
  if (!descriptorText) {
    return null;
  }
  const descriptor = descriptorText.replace(/#[a-z0-9]+$/i, "");
  const scriptType = descriptor.startsWith("sh(wpkh(")
    ? "nested-segwit"
    : descriptor.startsWith("wpkh(")
      ? "native-segwit"
      : descriptor.startsWith("pkh(")
        ? "legacy"
        : descriptor.startsWith("tr(")
          ? "taproot"
          : null;

  if (!scriptType) {
    return null;
  }

  if (/\[[^\]]+\]/.test(descriptor) && !/\[[0-9a-fA-F]{8}(?:\/[^\]]+)?\]/.test(descriptor)) {
    return unsupportedImport("Invalid BIP32 origin metadata: master fingerprint must be 8 hex characters.", {
      sourceDevice,
      network,
      importFormat: "descriptor",
      notes
    });
  }

  const key = extractExtendedPublicKey(descriptor);
  const origin = descriptor.match(/\[([0-9a-fA-F]{8})(?:\/([^\]]+))?\]/);
  const accountPath = origin?.[2] ? normalizePath(origin[2]) : accountPathFor(scriptType, network);
  const detectedNetwork = key ? networkForKey(key) ?? network : network;
  const warnings = descriptor.includes("/0/*") || descriptor.includes("/1/*")
    ? []
    : ["Descriptor branch was not explicit; receive/change paths will be derived from account metadata."];

  return parsedFromKey(key, {
    sourceDevice,
    network: detectedNetwork,
    scriptType,
    accountPath,
    masterFingerprint: origin?.[1]?.toLowerCase() ?? null,
    importFormat: "descriptor",
    rawImport: descriptorText,
    notes,
    warnings,
    unsupportedReason: key ? unsupportedReasonForScript(scriptType) : "Descriptor did not contain a supported xpub"
  });
}

function parseKeyExpression(
  value: string,
  sourceDevice: SourceDevice,
  network: BitcoinNetwork,
  notes: string | null
): ParsedWalletImport | null {
  const trimmed = value.trim();
  const originCandidate = findOriginKeyCandidate(trimmed);

  if (originCandidate) {
    const validOrigin = originCandidate.match(/^\[([0-9a-fA-F]{8})(?:\/([^\]]+))?\]/);
    if (!validOrigin) {
      return unsupportedImport("Invalid BIP32 origin metadata: master fingerprint must be 8 hex characters.", {
        sourceDevice,
        network,
        importFormat: "origin-extended-public-key",
        notes
      });
    }
  }

  const match = originCandidate?.match(/^\[([0-9a-fA-F]{8})(?:\/([^\]]+))?\]((xpub|ypub|zpub|tpub|upub|vpub)[1-9A-HJ-NP-Za-km-z]{40,})/);
  if (!match) {
    return null;
  }

  const key = match[3] ?? "";
  return parsedFromKey(key, {
    sourceDevice,
    network: networkForKey(key) ?? network,
    accountPath: match[2] ? normalizePath(match[2]) : null,
    masterFingerprint: match[1]?.toLowerCase() ?? null,
    importFormat: "origin-extended-public-key",
    rawImport: originCandidate,
    notes,
    warnings: scriptTypeForKey(key) === "unknown"
      ? ["Key expression used xpub/tpub; confirm script type before receiving funds."]
      : [],
    unsupportedReason: null
  });
}

function parseUr(
  value: string,
  sourceDevice: SourceDevice,
  network: BitcoinNetwork,
  notes: string | null
): ParsedWalletImport | null {
  const lower = value.trim().toLowerCase();
  if (!lower.startsWith("ur:")) {
    return null;
  }

  if (lower.startsWith("ur:crypto-psbt")) {
    return {
      extendedPublicKey: null,
      type: null,
      sourceDevice,
      network,
      scriptType: "unknown",
      accountPath: null,
      masterFingerprint: null,
      importFormat: "psbt-ur",
      rawImport: null,
      notes,
      warnings: [],
      unsupportedReason:
        "PSBT signing requests cannot be saved as watch-only wallets. Export an xpub or descriptor from the device instead."
    };
  }

  let importFormat: ImportFormat;
  if (lower.startsWith("ur:crypto-account")) {
    importFormat = sourceDevice === "passport-core" ? "passport-setup-qr" : "crypto-account-ur";
  } else if (lower.startsWith("ur:crypto-hdkey")) {
    importFormat = "crypto-hdkey-ur";
  } else {
    importFormat = "ur-xpub";
  }

  return {
    extendedPublicKey: extractExtendedPublicKey(value),
    type: extractExtendedPublicKey(value)?.slice(0, 4) as ExtendedPublicKeyType | undefined ?? null,
    sourceDevice,
    network,
    scriptType: "unknown",
    accountPath: null,
    masterFingerprint: null,
    importFormat,
    rawImport: value.trim(),
    notes,
    warnings: ["UR payload detected. Animated UR/BCUR decoding is not fully supported yet."],
    unsupportedReason: "UR decoding is not supported yet; use descriptor, file, or pasted xpub export."
  };
}

function parseColdcardLikeJson(
  value: Record<string, unknown>,
  rawImport: string,
  sourceDevice: SourceDevice,
  network: BitcoinNetwork,
  notes: string | null
): ParsedWalletImport {
  const xfp =
    stringField(value, "xfp") ??
    stringField(value, "fingerprint") ??
    stringField(value, "master_fingerprint") ??
    stringField(value, "masterFingerprint");
  const candidates = [
    jsonKeyCandidate(value, "bip84", "native-segwit"),
    jsonKeyCandidate(value, "p2wpkh", "native-segwit"),
    jsonKeyCandidate(value, "zpub", "native-segwit"),
    jsonKeyCandidate(value, "bip49", "nested-segwit"),
    jsonKeyCandidate(value, "p2sh_p2wpkh", "nested-segwit"),
    jsonKeyCandidate(value, "ypub", "nested-segwit"),
    jsonKeyCandidate(value, "bip44", "legacy"),
    jsonKeyCandidate(value, "p2pkh", "legacy"),
    jsonKeyCandidate(value, "bip86", "taproot"),
    jsonKeyCandidate(value, "p2tr", "taproot"),
    jsonKeyCandidate(value, "taproot", "taproot"),
    jsonKeyCandidate(value, "xpub", "unknown"),
    jsonKeyCandidate(value, "tpub", "unknown"),
    jsonKeyCandidate(value, "upub", "nested-segwit"),
    jsonKeyCandidate(value, "vpub", "native-segwit")
  ].filter((candidate): candidate is JsonKeyCandidate => Boolean(candidate));
  const selected = candidates[0] ?? null;
  const key = selected?.key ?? null;

  return parsedFromKey(key, {
    sourceDevice: sourceDevice === "other" ? "coldcard" : sourceDevice,
    network: key ? networkForKey(key) ?? network : network,
    scriptType: selected?.scriptType ?? "unknown",
    accountPath: selected?.accountPath ?? null,
    masterFingerprint: normalizeFingerprint(xfp),
    importFormat: "coldcard-json",
    rawImport,
    notes,
    warnings: selected ? [] : ["JSON import did not contain a supported extended public key."],
    unsupportedReason: selected ? unsupportedReasonForScript(selected.scriptType) : "Unsupported JSON export"
  });
}

type JsonKeyCandidate = {
  key: string;
  scriptType: ScriptType;
  accountPath: string | null;
};

function jsonKeyCandidate(
  value: Record<string, unknown>,
  field: string,
  scriptType: ScriptType
): JsonKeyCandidate | null {
  const candidate = value[field];
  if (typeof candidate === "string") {
    const key = extractExtendedPublicKey(candidate);
    const path = stringField(value, `${field}_deriv`) ?? stringField(value, `${field}_path`);
    return key ? { key, scriptType, accountPath: path ? normalizePath(path) : accountPathFor(scriptType, networkForKey(key) ?? "mainnet") } : null;
  }
  if (isRecord(candidate)) {
    const key = extractExtendedPublicKey(String(candidate.xpub ?? candidate.zpub ?? candidate.ypub ?? candidate.tpub ?? candidate.upub ?? candidate.vpub ?? candidate.value ?? ""));
    const path = typeof candidate.deriv === "string"
      ? candidate.deriv
      : typeof candidate.derivation === "string"
        ? candidate.derivation
        : typeof candidate.path === "string"
          ? candidate.path
          : null;
    return key ? { key, scriptType, accountPath: path ? normalizePath(path) : accountPathFor(scriptType, networkForKey(key) ?? "mainnet") } : null;
  }
  return null;
}

function parsedFromKey(
  key: string | null,
  options: {
    sourceDevice: SourceDevice;
    network: BitcoinNetwork;
    scriptType?: ScriptType;
    accountPath: string | null;
    masterFingerprint: string | null;
    importFormat: ImportFormat;
    rawImport: string | null;
    notes: string | null;
    warnings: string[];
    unsupportedReason: string | null;
  }
): ParsedWalletImport {
  const scriptType = options.scriptType ?? (key ? scriptTypeForKey(key) : "unknown");
  const network = key ? networkForKey(key) ?? options.network : options.network;
  return {
    extendedPublicKey: key,
    type: key ? key.slice(0, 4) as ExtendedPublicKeyType : null,
    sourceDevice: options.sourceDevice,
    network,
    scriptType,
    accountPath: options.accountPath ?? accountPathFor(scriptType, network),
    masterFingerprint: options.masterFingerprint,
    importFormat: options.importFormat,
    rawImport: options.rawImport,
    notes: options.notes,
    warnings: options.warnings,
    unsupportedReason: options.unsupportedReason ?? unsupportedReasonForScript(scriptType)
  };
}

function applyOverrides(parsed: ParsedWalletImport, input: {
  sourceDevice?: SourceDevice;
  network?: BitcoinNetwork;
  scriptType?: ScriptType;
  notes?: string | null;
}): ParsedWalletImport {
  const network =
    parsed.type && ["tpub", "upub", "vpub"].includes(parsed.type) ? parsed.network : input.network ?? parsed.network;
  const scriptType = input.scriptType && input.scriptType !== "unknown" ? input.scriptType : parsed.scriptType;
  return {
    ...parsed,
    sourceDevice: input.sourceDevice ?? parsed.sourceDevice,
    network,
    scriptType,
    accountPath: parsed.accountPath ?? accountPathFor(scriptType, network),
    notes: sanitizeOptionalText(input.notes, 500) ?? parsed.notes,
    unsupportedReason: parsed.unsupportedReason ?? unsupportedReasonForScript(scriptType)
  };
}

function unsupportedReasonForScript(scriptType: ScriptType): string | null {
  if (scriptType === "unknown") {
    return "Script type is unknown; choose legacy, nested SegWit, native SegWit, or taproot before deriving addresses.";
  }
  return null;
}

function parseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function stringField(value: Record<string, unknown>, field: string): string | null {
  const candidate = value[field];
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

function normalizePath(value: string): string {
  const normalized = value.replace(/h/gi, "'").replace(/^m\//, "");
  return `m/${normalized}`;
}

function normalizeFingerprint(value: string | null): string | null {
  return value && /^[0-9a-fA-F]{8}$/.test(value) ? value.toLowerCase() : null;
}

function sanitizeOptionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
