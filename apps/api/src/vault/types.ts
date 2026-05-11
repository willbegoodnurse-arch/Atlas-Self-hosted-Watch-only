export type ExtendedPublicKeyType = "xpub" | "ypub" | "zpub";
export type BitcoinNetwork = "mainnet" | "testnet" | "signet";
export type ScriptType = "p2pkh" | "p2sh-p2wpkh" | "p2wpkh";

export type WalletRecord = {
  id: string;
  name: string;
  extendedPublicKey: string;
  type: ExtendedPublicKeyType;
  network: BitcoinNetwork;
  scriptType: ScriptType;
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
