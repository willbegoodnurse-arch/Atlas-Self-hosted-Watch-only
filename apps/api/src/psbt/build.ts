import {
  deriveAddresses,
  validateAddressForNetwork,
  buildUnsignedPsbt
} from "@watch-wallet/bitcoin";
import type {
  ExtendedPublicKeyKind,
  PsbtInputDescriptor,
  PsbtOutputDescriptor
} from "@watch-wallet/bitcoin";
import { lookupWalletUtxos } from "../mempool/utxos.js";
import { lookupAddressUsageRecords } from "../mempool/usage.js";
import type { AddressUsage } from "../mempool/usage.js";
import type { WalletRecord } from "../vault/types.js";

export const DUST_THRESHOLD_SATS = 546;

const MIN_FEE_RATE = 0;
const MAX_FEE_RATE = 1000;

const SUPPORTED_SCRIPT_TYPES = ["native-segwit", "nested-segwit", "taproot"] as const;
type SupportedScriptType = (typeof SUPPORTED_SCRIPT_TYPES)[number];

const INPUT_VBYTES: Record<SupportedScriptType, number> = {
  "native-segwit": 68,
  "taproot": 58,
  "nested-segwit": 91
};

const OVERHEAD_VBYTES = 10;
const SEGWIT_MARKER_VBYTES = 2;
const OUTPUT_VBYTES = 43;

export type CreatePsbtInput = {
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
  addressLimit?: number;
};

export type CreatePsbtInputSummary = {
  txid: string;
  vout: number;
  outpoint: string;
  valueSats: number;
  address: string;
  chain: "receive" | "change";
  index: number;
  path: string | null;
};

export type CreatePsbtOutputSummary = {
  address: string;
  valueSats: number;
  type: "recipient" | "change";
  chain: "receive" | "change" | null;
  index: number | null;
  path: string | null;
  usage: AddressUsage | null;
};

export type CreatePsbtResult = {
  psbtBase64: string;
  inputs: CreatePsbtInputSummary[];
  outputs: CreatePsbtOutputSummary[];
  feeSats: number;
  feeRateSatsPerVbyte: number;
  estimatedVbytes: number;
  totalInputSats: number;
  changeAddress: string | null;
  changeSats: number;
  changeAddressUsage: AddressUsage | null;
  changeAddressWarning: string | null;
};

export class InvalidPsbtParamsError extends Error {}
export class InsufficientFundsError extends Error {}
export class UnsupportedScriptTypeError extends Error {}

export function estimatePsbtVbytes(
  scriptType: SupportedScriptType,
  inputCount: number,
  outputCount: number
): number {
  return (
    OVERHEAD_VBYTES +
    SEGWIT_MARKER_VBYTES +
    inputCount * INPUT_VBYTES[scriptType] +
    outputCount * OUTPUT_VBYTES
  );
}

type UtxoLike = {
  txid: string;
  vout: number;
  outpoint: string;
  valueSats: number;
  status: "confirmed" | "unconfirmed";
  address: string;
  chain: "receive" | "change";
  index: number;
  path: string | null;
};

type SelectionResult = {
  selected: UtxoLike[];
  totalInputSats: number;
  feeSats: number;
  estimatedVbytes: number;
  changeSats: number;
};

type RecipientOutput = {
  address: string;
  amountSats: number;
};

export function selectConfirmedUtxos(
  utxos: UtxoLike[],
  amountSats: number,
  feeRateSatsPerVbyte: number,
  scriptType: SupportedScriptType
): SelectionResult {
  const confirmed = utxos
    .filter((u) => u.status === "confirmed")
    .sort((a, b) => b.valueSats - a.valueSats);

  const selected: UtxoLike[] = [];
  let totalInputSats = 0;

  for (const utxo of confirmed) {
    selected.push(utxo);
    totalInputSats += utxo.valueSats;

    const vbytes2 = estimatePsbtVbytes(scriptType, selected.length, 2);
    const fee2 = Math.ceil(vbytes2 * feeRateSatsPerVbyte);

    if (totalInputSats >= amountSats + fee2) {
      const rawChange = totalInputSats - amountSats - fee2;
      if (rawChange >= DUST_THRESHOLD_SATS) {
        return { selected, totalInputSats, feeSats: fee2, estimatedVbytes: vbytes2, changeSats: rawChange };
      }
      // Dust change: absorb into fee, use 1-output size estimate
      const vbytes1 = estimatePsbtVbytes(scriptType, selected.length, 1);
      return {
        selected,
        totalInputSats,
        feeSats: totalInputSats - amountSats,
        estimatedVbytes: vbytes1,
        changeSats: 0
      };
    }
  }

  const vbytes = estimatePsbtVbytes(scriptType, Math.max(confirmed.length, 1), 2);
  const minimumRequired = amountSats + Math.ceil(vbytes * feeRateSatsPerVbyte);
  throw new InsufficientFundsError(
    `Insufficient funds: ${totalInputSats} sats available, ${minimumRequired} sats required`
  );
}

export function buildSelectedUtxoPlan(
  selected: UtxoLike[],
  recipientTotalSats: number,
  feeRateSatsPerVbyte: number,
  scriptType: SupportedScriptType,
  recipientCount: number
): SelectionResult {
  if (selected.length === 0) {
    throw new InvalidPsbtParamsError("No UTXO selected");
  }

  const totalInputSats = selected.reduce((sum, utxo) => sum + utxo.valueSats, 0);
  const withChangeVbytes = estimatePsbtVbytes(scriptType, selected.length, recipientCount + 1);
  const withChangeFee = Math.ceil(withChangeVbytes * feeRateSatsPerVbyte);

  if (totalInputSats < recipientTotalSats + withChangeFee) {
    const noChangeVbytes = estimatePsbtVbytes(scriptType, selected.length, recipientCount);
    const noChangeFee = Math.ceil(noChangeVbytes * feeRateSatsPerVbyte);
    if (totalInputSats >= recipientTotalSats + noChangeFee) {
      return {
        selected,
        totalInputSats,
        feeSats: totalInputSats - recipientTotalSats,
        estimatedVbytes: noChangeVbytes,
        changeSats: 0
      };
    }

    throw new InsufficientFundsError(
      `Insufficient selected input: ${totalInputSats} sats selected, ${recipientTotalSats + withChangeFee} sats required`
    );
  }

  const rawChange = totalInputSats - recipientTotalSats - withChangeFee;
  if (rawChange >= DUST_THRESHOLD_SATS) {
    return {
      selected,
      totalInputSats,
      feeSats: withChangeFee,
      estimatedVbytes: withChangeVbytes,
      changeSats: rawChange
    };
  }

  const noChangeVbytes = estimatePsbtVbytes(scriptType, selected.length, recipientCount);
  return {
    selected,
    totalInputSats,
    feeSats: totalInputSats - recipientTotalSats,
    estimatedVbytes: noChangeVbytes,
    changeSats: 0
  };
}

type ChangeAddressResult = {
  address: string;
  path: string;
  index: number;
  usage: AddressUsage;
  warning: string | null;
};

async function findNextChangeAddress(
  wallet: WalletRecord,
  scriptType: SupportedScriptType,
  addressLimit: number,
  options: { fetchAddressStatsFn?: (addr: string) => Promise<unknown> } = {}
): Promise<ChangeAddressResult> {
  const xpubType = wallet.type as ExtendedPublicKeyKind;
  const psbtNetwork: "mainnet" | "testnet" =
    wallet.network === "mainnet" ? "mainnet" : "testnet";

  const changeAddrs = deriveAddresses({
    extendedPublicKey: wallet.extendedPublicKey,
    type: xpubType,
    scriptType,
    accountPath: wallet.accountPath ?? wallet.derivationPath,
    network: psbtNetwork,
    chain: "change",
    limit: addressLimit
  });

  const usageResult = await lookupAddressUsageRecords(changeAddrs.addresses, {
    fetchAddressStats: options.fetchAddressStatsFn
  });

  if (usageResult.lookupFailed) {
    throw new InvalidPsbtParamsError("Change address lookup failed. Try again before creating a PSBT with change.");
  }

  const firstUnused = usageResult.addresses.find((a) => a.usage === "unused");
  if (firstUnused) {
    return {
      address: firstUnused.address,
      path: firstUnused.path,
      index: firstUnused.index,
      usage: "unused",
      warning: null
    };
  }

  throw new InvalidPsbtParamsError("No unused change address found within the address scan limit.");
}

export async function createWalletPsbt(
  wallet: WalletRecord,
  input: CreatePsbtInput,
  options: {
    fetchUtxosFn?: (addr: string) => Promise<unknown>;
    fetchAddressStatsFn?: (addr: string) => Promise<unknown>;
  } = {}
): Promise<CreatePsbtResult> {
  if (
    typeof input.feeRateSatsPerVbyte !== "number" ||
    !Number.isFinite(input.feeRateSatsPerVbyte) ||
    input.feeRateSatsPerVbyte <= MIN_FEE_RATE ||
    input.feeRateSatsPerVbyte > MAX_FEE_RATE
  ) {
    throw new InvalidPsbtParamsError(
      `Fee rate must be between ${MIN_FEE_RATE} and ${MAX_FEE_RATE} sats/vbyte`
    );
  }

  if (!SUPPORTED_SCRIPT_TYPES.includes(wallet.scriptType as SupportedScriptType)) {
    throw new UnsupportedScriptTypeError(
      `PSBT creation for ${wallet.scriptType} wallets is not supported. ` +
        `Supported: native-segwit, nested-segwit, taproot.`
    );
  }
  const scriptType = wallet.scriptType as SupportedScriptType;

  const psbtNetwork: "mainnet" | "testnet" =
    wallet.network === "mainnet" ? "mainnet" : "testnet";

  const recipients = normalizeRecipients(input);
  for (const recipient of recipients) {
    try {
      validateAddressForNetwork(recipient.address, psbtNetwork);
    } catch (e) {
      throw new InvalidPsbtParamsError(e instanceof Error ? e.message : "Invalid recipient address");
    }
  }
  const recipientTotalSats = recipients.reduce((sum, recipient) => sum + recipient.amountSats, 0);

  const addressLimit = input.addressLimit ?? 20;
  if (!Number.isInteger(addressLimit) || addressLimit < 1 || addressLimit > 200) {
    throw new InvalidPsbtParamsError("Address limit must be an integer from 1 to 200");
  }
  const xpubType = wallet.type as ExtendedPublicKeyKind;

  const derivedAddresses = deriveAddresses({
    extendedPublicKey: wallet.extendedPublicKey,
    type: xpubType,
    scriptType,
    accountPath: wallet.accountPath ?? wallet.derivationPath,
    network: psbtNetwork,
    chain: "both",
    limit: addressLimit
  });

  const walletAddresses = derivedAddresses.addresses.map((a) => ({
    chain: a.chain,
    index: a.index,
    address: a.address,
    path: a.path
  }));

  const utxosResult = await lookupWalletUtxos(walletAddresses, {
    fetchUtxosFn: options.fetchUtxosFn,
    includeUnconfirmed: Boolean(input.selectedUtxos?.length)
  });

  const selection = input.selectedUtxos?.length
    ? buildSelectedUtxoPlan(
        resolveSelectedUtxos(utxosResult.utxos, input.selectedUtxos),
        recipientTotalSats,
        input.feeRateSatsPerVbyte,
        scriptType,
        recipients.length
      )
    : selectConfirmedUtxos(
        utxosResult.utxos,
        recipientTotalSats,
        input.feeRateSatsPerVbyte,
        scriptType
      );

  let changeAddress: ChangeAddressResult | null = null;
  if (selection.changeSats > 0) {
    changeAddress = await findNextChangeAddress(wallet, scriptType, addressLimit, {
      fetchAddressStatsFn: options.fetchAddressStatsFn
    });
  }

  const psbtOutputs: PsbtOutputDescriptor[] = recipients.map((recipient) => ({
    address: recipient.address,
    valueSats: recipient.amountSats,
    type: "recipient"
  }));
  if (changeAddress) {
    psbtOutputs.push({
      address: changeAddress.address,
      valueSats: selection.changeSats,
      type: "change"
    });
  }

  const psbtInputs: PsbtInputDescriptor[] = selection.selected.map((utxo) => ({
    txid: utxo.txid,
    vout: utxo.vout,
    valueSats: utxo.valueSats,
    address: utxo.address,
    chain: utxo.chain,
    index: utxo.index,
    path: utxo.path
  }));

  const psbtBase64 = buildUnsignedPsbt({
    extendedPublicKey: wallet.extendedPublicKey,
    xpubType,
    scriptType,
    accountPath: wallet.accountPath ?? wallet.derivationPath ?? null,
    masterFingerprint: wallet.masterFingerprint ?? null,
    network: psbtNetwork,
    inputs: psbtInputs,
    outputs: psbtOutputs
  });

  return {
    psbtBase64,
    inputs: selection.selected.map((utxo) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      outpoint: utxo.outpoint,
      valueSats: utxo.valueSats,
      address: utxo.address,
      chain: utxo.chain,
      index: utxo.index,
      path: utxo.path
    })),
    outputs: psbtOutputs.map((o) => ({
      address: o.address,
      valueSats: o.valueSats,
      type: o.type,
      chain: o.type === "change" ? "change" : null,
      index: o.type === "change" ? changeAddress?.index ?? null : null,
      path: o.type === "change" ? changeAddress?.path ?? null : null,
      usage: o.type === "change" ? changeAddress?.usage ?? null : null
    })),
    feeSats: selection.feeSats,
    feeRateSatsPerVbyte: input.feeRateSatsPerVbyte,
    estimatedVbytes: selection.estimatedVbytes,
    totalInputSats: selection.totalInputSats,
    changeAddress: changeAddress?.address ?? null,
    changeSats: selection.changeSats,
    changeAddressUsage: changeAddress?.usage ?? null,
    changeAddressWarning: changeAddress?.warning ?? null
  };
}

function normalizeRecipients(input: CreatePsbtInput): RecipientOutput[] {
  const recipients = input.recipients ?? (
    input.recipientAddress !== undefined && input.amountSats !== undefined
      ? [{ address: input.recipientAddress, amountSats: input.amountSats }]
      : []
  );

  if (recipients.length === 0) {
    throw new InvalidPsbtParamsError("At least one recipient output is required");
  }

  if (recipients.length > 10) {
    throw new InvalidPsbtParamsError("At most 10 recipient outputs are supported");
  }

  return recipients.map((recipient) => {
    const address = recipient.address.trim();
    if (!address) {
      throw new InvalidPsbtParamsError("Recipient address is required");
    }
    if (!Number.isInteger(recipient.amountSats) || recipient.amountSats < 1) {
      throw new InvalidPsbtParamsError("Recipient amount must be a positive integer in sats");
    }
    if (recipient.amountSats < DUST_THRESHOLD_SATS) {
      throw new InvalidPsbtParamsError(`Recipient output is below dust threshold (${DUST_THRESHOLD_SATS} sats)`);
    }
    return {
      address,
      amountSats: recipient.amountSats
    };
  });
}

function resolveSelectedUtxos(
  trackedUtxos: UtxoLike[],
  selected: Array<{ txid: string; vout: number }>
): UtxoLike[] {
  if (selected.length === 0) {
    throw new InvalidPsbtParamsError("No UTXO selected");
  }
  if (selected.length > 100) {
    throw new InvalidPsbtParamsError("At most 100 selected UTXOs are supported");
  }

  const byOutpoint = new Map(trackedUtxos.map((utxo) => [`${utxo.txid.toLowerCase()}:${utxo.vout}`, utxo]));
  const resolved: UtxoLike[] = [];
  const seen = new Set<string>();

  for (const item of selected) {
    const key = `${item.txid.toLowerCase()}:${item.vout}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const utxo = byOutpoint.get(key);
    if (!utxo) {
      throw new InvalidPsbtParamsError("Selected UTXO is not tracked or no longer available");
    }
    if (!utxo.address || !Number.isInteger(utxo.valueSats) || utxo.path === null) {
      throw new InvalidPsbtParamsError("This UTXO does not have enough data to build a PSBT");
    }
    resolved.push(utxo);
  }

  return resolved;
}
