export type BitcoinNetwork = "mainnet" | "testnet" | "signet";

export type ExtendedPublicKeyKind = "xpub" | "ypub" | "zpub";

export const watchOnlyStoragePolicy = {
  storesSeedPhrases: false,
  storesPrivateKeys: false,
  serverStoresExtendedPublicKeys: false,
  browserStoresExtendedPublicKeys: true
} as const;

