export type ExtendedPublicKeyType = "xpub" | "ypub" | "zpub" | "tpub" | "upub" | "vpub";
export type BitcoinNetwork = "mainnet" | "testnet" | "signet";
export type ScriptType = "legacy" | "nested-segwit" | "native-segwit" | "taproot" | "unknown";
export type SourceDevice =
  | "coldcard"
  | "keystone"
  | "seedsigner"
  | "krux"
  | "passport-core"
  | "jade"
  | "other";
export type ImportFormat =
  | "plain-xpub"
  | "slip132"
  | "descriptor"
  | "key-expression"
  | "coldcard-json"
  | "crypto-account-ur"
  | "crypto-hdkey-ur"
  | "ur-xpub"
  | "passport-setup-qr"
  | "bbqr"
  | "psbt-ur"
  | "unknown";

export type AddressLabel = {
  chain: "receive" | "change";
  index: number;
  address: string;
  label: string;
  notes: string | null;
  updatedAt: string;
};

export type TransactionLabel = {
  txid: string;
  label: string;
  notes: string | null;
  updatedAt: string;
};

export type UtxoNote = {
  txid: string;
  vout: number;
  note: string;
  updatedAt: string;
};

export type WalletRecord = {
  id: string;
  name: string;
  extendedPublicKey: string;
  type: ExtendedPublicKeyType;
  sourceDevice: SourceDevice;
  network: BitcoinNetwork;
  scriptType: ScriptType;
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

export type VaultPlaintext = {
  version: 1;
  wallets: WalletRecord[];
};

export type VaultEnvelope = {
  version: 1;
  kdf: {
    name: "scrypt";
    salt: string;
    params: {
      N: number;
      r: number;
      p: number;
      keyLength: number;
    };
  };
  cipher: {
    name: "aes-256-gcm";
    iv: string;
    authTag: string;
  };
  ciphertext: string;
};
