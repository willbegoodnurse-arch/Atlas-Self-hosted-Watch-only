import { BIP32Factory } from "bip32";
import * as bitcoin from "bitcoinjs-lib";
import bs58check from "bs58check";
import * as ecc from "tiny-secp256k1";

export type BitcoinNetwork = "mainnet" | "testnet" | "signet";

export type ExtendedPublicKeyKind = "xpub" | "ypub" | "zpub";

export type ScriptType = "p2pkh" | "p2sh-p2wpkh" | "p2wpkh";

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
  zpub: Buffer.from("04b24746", "hex")
};

export const watchOnlyStoragePolicy = {
  storesSeedPhrases: false,
  storesPrivateKeys: false,
  serverStoresExtendedPublicKeys: "encrypted",
  browserStoresExtendedPublicKeys: false
} as const;

export function deriveAddresses(input: DeriveAddressesInput): DeriveAddressesResult {
  const type = input.type ?? detectExtendedPublicKeyKind(input.extendedPublicKey);
  const scriptType = scriptTypeForExtendedPublicKey(type);
  const limit = sanitizeLimit(input.limit);
  const startIndex = sanitizeStartIndex(input.startIndex ?? 0);
  const accountPath = accountDerivationPath(type, input.network);
  const accountNode = parseAccountExtendedPublicKey(input.extendedPublicKey, type);
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

  throw new Error("Extended public key must start with xpub, ypub, or zpub");
}

export function accountDerivationPath(
  type: ExtendedPublicKeyKind,
  network: BitcoinNetwork
): string {
  const coinType = network === "mainnet" ? "0" : "1";
  const purpose = type === "xpub" ? "44" : type === "ypub" ? "49" : "84";
  return `m/${purpose}'/${coinType}'/0'`;
}

export function scriptTypeForExtendedPublicKey(type: ExtendedPublicKeyKind): ScriptType {
  if (type === "xpub") {
    return "p2pkh";
  }
  if (type === "ypub") {
    return "p2sh-p2wpkh";
  }
  return "p2wpkh";
}

function parseAccountExtendedPublicKey(value: string, type: ExtendedPublicKeyKind) {
  try {
    return bip32.fromBase58(convertToXpubVersion(value, type), bitcoin.networks.bitcoin);
  } catch {
    throw new Error("Invalid extended public key");
  }
}

function convertToXpubVersion(value: string, type: ExtendedPublicKeyKind): string {
  const decoded = Buffer.from(bs58check.decode(value));
  if (decoded.length !== 78) {
    throw new Error("Invalid extended public key length");
  }

  const expectedVersion = extendedPublicKeyVersions[type];
  if (!decoded.subarray(0, 4).equals(expectedVersion)) {
    throw new Error(`Extended public key version does not match ${type}`);
  }

  expectedVersion.copy(decoded, 0);
  extendedPublicKeyVersions.xpub.copy(decoded, 0);
  return bs58check.encode(decoded);
}

function paymentAddress(
  pubkey: Buffer,
  scriptType: ScriptType,
  network: bitcoin.Network
): string {
  if (scriptType === "p2pkh") {
    return requireAddress(bitcoin.payments.p2pkh({ pubkey, network }).address);
  }

  if (scriptType === "p2sh-p2wpkh") {
    return requireAddress(
      bitcoin.payments.p2sh({
        redeem: bitcoin.payments.p2wpkh({ pubkey, network }),
        network
      }).address
    );
  }

  return requireAddress(bitcoin.payments.p2wpkh({ pubkey, network }).address);
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
