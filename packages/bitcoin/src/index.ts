export type BitcoinNetwork = "mainnet" | "testnet" | "signet";

export type ExtendedPublicKeyKind = "xpub" | "ypub" | "zpub";

export const watchOnlyStoragePolicy = {
  storesSeedPhrases: false,
  storesPrivateKeys: false,
  serverStoresExtendedPublicKeys: "encrypted",
  browserStoresExtendedPublicKeys: false
} as const;

