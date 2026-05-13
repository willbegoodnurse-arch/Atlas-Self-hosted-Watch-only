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
import type { WalletRecord } from "../vault/types.js";

export const DUST_THRESHOLD_SATS = 546;

const MIN_FEE_RATE = 1;
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
  recipientAddress: string;
  amountSats: number;
  feeRateSatsPerVbyte: number;
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

type ChangeAddressResult = {
  address: string;
  path: string;
  index: number;
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

  const firstUnused = usageResult.addresses.find((a) => a.usage === "unused");
  if (firstUnused) {
    return { address: firstUnused.address, path: firstUnused.path, index: firstUnused.index };
  }

  // All unknown or all used — fall back to change #0
  const fallback = changeAddrs.addresses[0];
  if (!fallback) {
    throw new InvalidPsbtParamsError("Could not derive change address");
  }
  return { address: fallback.address, path: fallback.path, index: fallback.index };
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
    !Number.isInteger(input.feeRateSatsPerVbyte) ||
    input.feeRateSatsPerVbyte < MIN_FEE_RATE ||
    input.feeRateSatsPerVbyte > MAX_FEE_RATE
  ) {
    throw new InvalidPsbtParamsError(
      `Fee rate must be between ${MIN_FEE_RATE} and ${MAX_FEE_RATE} sats/vbyte`
    );
  }

  if (!Number.isInteger(input.amountSats) || input.amountSats < 1) {
    throw new InvalidPsbtParamsError("Amount must be a positive integer in sats");
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

  try {
    validateAddressForNetwork(input.recipientAddress, psbtNetwork);
  } catch (e) {
    throw new InvalidPsbtParamsError(e instanceof Error ? e.message : "Invalid recipient address");
  }

  const addressLimit = input.addressLimit ?? 20;
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
    includeUnconfirmed: false
  });

  const selection = selectConfirmedUtxos(
    utxosResult.utxos,
    input.amountSats,
    input.feeRateSatsPerVbyte,
    scriptType
  );

  let changeAddress: ChangeAddressResult | null = null;
  if (selection.changeSats > 0) {
    changeAddress = await findNextChangeAddress(wallet, scriptType, addressLimit, {
      fetchAddressStatsFn: options.fetchAddressStatsFn
    });
  }

  const psbtOutputs: PsbtOutputDescriptor[] = [
    { address: input.recipientAddress, valueSats: input.amountSats, type: "recipient" }
  ];
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
      type: o.type
    })),
    feeSats: selection.feeSats,
    feeRateSatsPerVbyte: input.feeRateSatsPerVbyte,
    estimatedVbytes: selection.estimatedVbytes,
    totalInputSats: selection.totalInputSats,
    changeAddress: changeAddress?.address ?? null,
    changeSats: selection.changeSats
  };
}
