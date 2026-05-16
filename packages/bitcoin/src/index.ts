import { BIP32Factory } from "bip32";
import * as bitcoin from "bitcoinjs-lib";
import bs58check from "bs58check";
import * as ecc from "tiny-secp256k1";

bitcoin.initEccLib(ecc);

export type BitcoinNetwork = "mainnet" | "testnet" | "signet";

export type ExtendedPublicKeyKind = "xpub" | "ypub" | "zpub" | "tpub" | "upub" | "vpub";

export type ScriptType = "legacy" | "nested-segwit" | "native-segwit" | "taproot";

export type AddressChain = "receive" | "change";

export type DerivedAddress = {
  chain: AddressChain;
  index: number;
  path: string;
  address: string;
  usage: "unknown";
};

export type DeriveAddressesInput = {
  extendedPublicKey: string;
  type?: ExtendedPublicKeyKind;
  scriptType?: ScriptType;
  accountPath?: string | null;
  network: BitcoinNetwork;
  chain: AddressChain | "both";
  limit: number;
  startIndex?: number;
};

export type DeriveAddressesResult = {
  network: BitcoinNetwork;
  scriptType: ScriptType;
  usageStatus: "unknown";
  addresses: DerivedAddress[];
};

const bip32 = BIP32Factory(ecc);

const extendedPublicKeyVersions: Record<ExtendedPublicKeyKind, Buffer> = {
  xpub: Buffer.from("0488b21e", "hex"),
  ypub: Buffer.from("049d7cb2", "hex"),
  zpub: Buffer.from("04b24746", "hex"),
  tpub: Buffer.from("043587cf", "hex"),
  upub: Buffer.from("044a5262", "hex"),
  vpub: Buffer.from("045f1cf6", "hex")
};

const canonicalPublicKeyVersions: Record<"mainnet" | "testnet", Buffer> = {
  mainnet: extendedPublicKeyVersions.xpub,
  testnet: extendedPublicKeyVersions.tpub
};

export const watchOnlyStoragePolicy = {
  storesSeedPhrases: false,
  storesPrivateKeys: false,
  serverStoresExtendedPublicKeys: "encrypted",
  browserStoresExtendedPublicKeys: false
} as const;

export function deriveAddresses(input: DeriveAddressesInput): DeriveAddressesResult {
  const type = input.type ?? detectExtendedPublicKeyKind(input.extendedPublicKey);
  const scriptType = input.scriptType ?? scriptTypeForExtendedPublicKey(type);
  const limit = sanitizeLimit(input.limit);
  const startIndex = sanitizeStartIndex(input.startIndex ?? 0);
  const accountPath = input.accountPath ?? accountDerivationPath(scriptType, input.network);
  const accountNode = parseAccountExtendedPublicKey(input.extendedPublicKey, type, input.network);
  const network = bitcoinNetwork(input.network);
  const chains = input.chain === "both" ? (["receive", "change"] as const) : [input.chain];

  const addresses = chains.flatMap((chain) => {
    const chainIndex = chain === "receive" ? 0 : 1;
    const chainNode = accountNode.derive(chainIndex);

    return Array.from({ length: limit }, (_, offset) => {
      const index = startIndex + offset;
      const child = chainNode.derive(index);
      const pubkey = Buffer.from(child.publicKey);

      return {
        chain,
        index,
        path: `${accountPath}/${chainIndex}/${index}`,
        address: paymentAddress(pubkey, scriptType, network),
        usage: "unknown" as const
      };
    });
  });

  return {
    network: input.network,
    scriptType,
    usageStatus: "unknown",
    addresses
  };
}

export function detectExtendedPublicKeyKind(value: string): ExtendedPublicKeyKind {
  if (value.startsWith("xpub")) {
    return "xpub";
  }
  if (value.startsWith("ypub")) {
    return "ypub";
  }
  if (value.startsWith("zpub")) {
    return "zpub";
  }
  if (value.startsWith("tpub")) {
    return "tpub";
  }
  if (value.startsWith("upub")) {
    return "upub";
  }
  if (value.startsWith("vpub")) {
    return "vpub";
  }

  throw new Error("Extended public key must start with xpub, ypub, zpub, tpub, upub, or vpub");
}

export function accountDerivationPath(
  scriptType: ScriptType,
  network: BitcoinNetwork
): string {
  const coinType = network === "mainnet" ? "0" : "1";
  const purpose =
    scriptType === "legacy" ? "44" :
    scriptType === "nested-segwit" ? "49" :
    scriptType === "taproot" ? "86" :
    "84";
  return `m/${purpose}'/${coinType}'/0'`;
}

export function scriptTypeForExtendedPublicKey(type: ExtendedPublicKeyKind): ScriptType {
  if (type === "xpub" || type === "tpub") {
    return "legacy";
  }
  if (type === "ypub" || type === "upub") {
    return "nested-segwit";
  }
  return "native-segwit";
}

function parseAccountExtendedPublicKey(
  value: string,
  type: ExtendedPublicKeyKind,
  network: BitcoinNetwork
) {
  try {
    return bip32.fromBase58(convertToCanonicalVersion(value, type, network), bitcoinNetwork(network));
  } catch {
    throw new Error("Invalid extended public key");
  }
}

function convertToCanonicalVersion(
  value: string,
  type: ExtendedPublicKeyKind,
  network: BitcoinNetwork
): string {
  const decoded = Buffer.from(bs58check.decode(value));
  if (decoded.length !== 78) {
    throw new Error("Invalid extended public key length");
  }

  const expectedVersion = extendedPublicKeyVersions[type];
  if (!decoded.subarray(0, 4).equals(expectedVersion)) {
    throw new Error(`Extended public key version does not match ${type}`);
  }

  canonicalPublicKeyVersions[network === "mainnet" ? "mainnet" : "testnet"].copy(decoded, 0);
  return bs58check.encode(decoded);
}

function paymentAddress(
  pubkey: Buffer,
  scriptType: ScriptType,
  network: bitcoin.Network
): string {
  if (scriptType === "legacy") {
    return requireAddress(bitcoin.payments.p2pkh({ pubkey, network }).address);
  }

  if (scriptType === "nested-segwit") {
    return requireAddress(
      bitcoin.payments.p2sh({
        redeem: bitcoin.payments.p2wpkh({ pubkey, network }),
        network
      }).address
    );
  }

  if (scriptType === "taproot") {
    return requireAddress(
      bitcoin.payments.p2tr({ internalPubkey: toXOnly(pubkey), network }).address
    );
  }

  return requireAddress(bitcoin.payments.p2wpkh({ pubkey, network }).address);
}

function toXOnly(pubkey: Buffer): Buffer {
  if (pubkey.length !== 33) {
    throw new Error("Expected 33-byte compressed public key for taproot derivation");
  }
  return pubkey.slice(1, 33);
}

function bitcoinNetwork(network: BitcoinNetwork): bitcoin.Network {
  return network === "mainnet" ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
}

function sanitizeLimit(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 200) {
    throw new Error("Address limit must be an integer from 1 to 200");
  }

  return value;
}

function sanitizeStartIndex(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 1000000) {
    throw new Error("Address start index must be a non-negative integer");
  }

  return value;
}

function requireAddress(value: string | undefined): string {
  if (!value) {
    throw new Error("Unable to derive address");
  }

  return value;
}

// ---------------------------------------------------------------------------
// PSBT analysis
// ---------------------------------------------------------------------------

export class InvalidPsbtError extends Error {}

export type PsbtRawInput = {
  txid: string;
  vout: number;
  valueSats: number | null;
  address: string | null;
};

export type PsbtRawOutput = {
  address: string | null;
  valueSats: number;
};

export type PsbtAnalysisResult = {
  signed: boolean;
  finalizable: boolean;
  extractable: boolean;
  txHex: string | null;
  txid: string | null;
  vsize: number | null;
  inputs: PsbtRawInput[];
  outputs: PsbtRawOutput[];
};

export function analyzePsbt(psbtBase64: string, network: BitcoinNetwork): PsbtAnalysisResult {
  let psbt: bitcoin.Psbt;
  try {
    psbt = bitcoin.Psbt.fromBase64(psbtBase64);
  } catch {
    throw new InvalidPsbtError("Could not parse PSBT");
  }

  const net = bitcoinNetwork(network);
  const signed = isPsbtSigned(psbt);

  let txHex: string | null = null;
  let txid: string | null = null;
  let vsize: number | null = null;
  let finalizable = false;
  let extractable = false;

  try {
    const p1 = bitcoin.Psbt.fromBase64(psbtBase64);
    const tx = p1.extractTransaction();
    finalizable = true;
    extractable = true;
    txHex = tx.toHex();
    txid = tx.getId();
    vsize = tx.virtualSize();
  } catch {
    try {
      const p2 = bitcoin.Psbt.fromBase64(psbtBase64);
      p2.finalizeAllInputs();
      finalizable = true;
      try {
        const tx = p2.extractTransaction();
        extractable = true;
        txHex = tx.toHex();
        txid = tx.getId();
        vsize = tx.virtualSize();
      } catch {}
    } catch {}
  }

  const inputs: PsbtRawInput[] = psbt.data.inputs.map((inp, i) => {
    const txIn = psbt.txInputs[i];
    const inputTxid = txIn ? Buffer.from(txIn.hash).reverse().toString("hex") : "";
    const vout = txIn?.index ?? 0;
    let valueSats: number | null = null;
    let address: string | null = null;

    if (inp.witnessUtxo) {
      valueSats = Number(inp.witnessUtxo.value);
      try {
        address = bitcoin.address.fromOutputScript(inp.witnessUtxo.script, net);
      } catch {}
    }

    return { txid: inputTxid, vout, valueSats, address };
  });

  const outputs: PsbtRawOutput[] = psbt.txOutputs.map((out) => {
    let address: string | null = null;
    try {
      address = bitcoin.address.fromOutputScript(out.script, net);
    } catch {}
    return { address, valueSats: Number(out.value) };
  });

  return { signed, finalizable, extractable, txHex, txid, vsize, inputs, outputs };
}

function isPsbtSigned(psbt: bitcoin.Psbt): boolean {
  if (psbt.data.inputs.length === 0) return false;
  return psbt.data.inputs.every((inp) => {
    if (inp.finalScriptSig || inp.finalScriptWitness) return true;
    if (inp.tapKeySig) return true;
    if (inp.partialSig && inp.partialSig.length > 0) return true;
    return false;
  });
}

// ---------------------------------------------------------------------------
// PSBT types and builder
// ---------------------------------------------------------------------------

export type PsbtInputDescriptor = {
  txid: string;
  vout: number;
  valueSats: number;
  address: string;
  chain: "receive" | "change";
  index: number;
  path: string | null;
};

export type PsbtOutputDescriptor = {
  address: string;
  valueSats: number;
  type: "recipient" | "change";
};

export type BuildUnsignedPsbtParams = {
  extendedPublicKey: string;
  xpubType: ExtendedPublicKeyKind;
  scriptType: "native-segwit" | "nested-segwit" | "taproot";
  accountPath: string | null;
  masterFingerprint: string | null;
  network: BitcoinNetwork;
  inputs: PsbtInputDescriptor[];
  outputs: PsbtOutputDescriptor[];
};

export function validateAddressForNetwork(
  address: string,
  walletNetwork: BitcoinNetwork
): void {
  const net = bitcoinNetwork(walletNetwork);
  const oppName = walletNetwork === "mainnet" ? "testnet" : "mainnet";
  const oppNet = bitcoinNetwork(oppName as BitcoinNetwork);

  let validForWallet = false;
  let validForOpposite = false;

  try {
    bitcoin.address.toOutputScript(address, net);
    validForWallet = true;
  } catch {}

  try {
    bitcoin.address.toOutputScript(address, oppNet);
    validForOpposite = true;
  } catch {}

  if (validForWallet) return;
  if (validForOpposite) {
    throw new Error(
      `Recipient address is a ${oppName} address, but wallet is ${walletNetwork}`
    );
  }
  throw new Error("Invalid Bitcoin address");
}

export function buildUnsignedPsbt(params: BuildUnsignedPsbtParams): string {
  const network = bitcoinNetwork(params.network);
  const accountNode = parseAccountExtendedPublicKey(
    params.extendedPublicKey,
    params.xpubType,
    params.network
  );
  const psbt = new bitcoin.Psbt({ network });

  for (const input of params.inputs) {
    const chainIndex = input.chain === "receive" ? 0 : 1;
    const child = accountNode.derive(chainIndex).derive(input.index);
    const pubkey = Buffer.from(child.publicKey);
    const outputScript = Buffer.from(
      bitcoin.address.toOutputScript(input.address, network)
    );

    const psbtInput: Parameters<typeof psbt.addInput>[0] = {
      hash: input.txid,
      index: input.vout,
      witnessUtxo: {
        script: outputScript,
        value: BigInt(input.valueSats)
      }
    };

    if (params.scriptType === "nested-segwit") {
      const inner = bitcoin.payments.p2wpkh({ pubkey, network });
      if (inner.output) {
        psbtInput.redeemScript = inner.output;
      }
    }

    if (params.scriptType === "taproot") {
      psbtInput.tapInternalKey = pubkey.slice(1, 33);
    }

    if (
      params.masterFingerprint &&
      input.path &&
      params.scriptType !== "taproot"
    ) {
      psbtInput.bip32Derivation = [
        {
          masterFingerprint: Buffer.from(params.masterFingerprint, "hex"),
          path: input.path,
          pubkey
        }
      ];
    }

    psbt.addInput(psbtInput);
  }

  for (const output of params.outputs) {
    psbt.addOutput({
      address: output.address,
      value: BigInt(output.valueSats)
    });
  }

  return psbt.toBase64();
}
