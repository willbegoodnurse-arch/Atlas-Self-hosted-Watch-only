import { vi } from "vitest";
import type { CreatePsbtResponse, DerivedAddress, WalletRecord, WalletUtxo } from "../phase-one-auth";

export function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status
  });
}

export function silenceApiLogs() {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
}

export function makeWallet(patch: Partial<WalletRecord> = {}): WalletRecord {
  return {
    accountPath: "m/84'/0'/0'",
    addressLabels: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    derivationPath: "m/84'/0'/0'",
    extendedPublicKey: "zpub6r...9xA2",
    gapLimit: 20,
    id: "wallet-1",
    importFormat: "origin-extended-public-key",
    masterFingerprint: "f23a9c1d",
    name: "Coldcard Vault",
    network: "mainnet",
    notes: null,
    rawImport: null,
    scriptType: "native-segwit",
    sourceDevice: "coldcard",
    transactionLabels: [],
    type: "zpub",
    updatedAt: "2026-01-01T00:00:00.000Z",
    utxoNotes: [],
    walletNotes: null,
    ...patch
  };
}

export function makeAddress(patch: Partial<DerivedAddress> = {}): DerivedAddress {
  return {
    address: "bc1qatlasreceive000000000000000000000000000",
    chain: "receive",
    index: 0,
    path: "m/84'/0'/0'/0/0",
    usage: "unused",
    ...patch
  };
}

export function makeUtxo(patch: Partial<WalletUtxo> = {}): WalletUtxo {
  const txid = patch.txid ?? "1".repeat(64);
  const vout = patch.vout ?? 0;
  return {
    address: "bc1qatlasutxo00000000000000000000000000000",
    blockHeight: 840000,
    blockTime: 1710000000,
    chain: "receive",
    index: 0,
    outpoint: `${txid}:${vout}`,
    path: "m/84'/0'/0'/0/0",
    status: "confirmed",
    txid,
    valueSats: 100000,
    vout,
    ...patch
  };
}

export function makePsbtResult(patch: Partial<CreatePsbtResponse> = {}): CreatePsbtResponse {
  return {
    changeAddress: "bc1qatlaschange000000000000000000000000000",
    changeAddressUsage: "unused",
    changeAddressWarning: null,
    changeSats: 88000,
    estimatedVbytes: 140,
    feeRateSatsPerVbyte: 5,
    feeSats: 700,
    inputs: [
      {
        address: "bc1qatlasutxo00000000000000000000000000000",
        chain: "receive",
        index: 0,
        outpoint: `${"1".repeat(64)}:0`,
        path: "m/84'/0'/0'/0/0",
        txid: "1".repeat(64),
        valueSats: 100000,
        vout: 0
      }
    ],
    outputs: [
      {
        address: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080",
        chain: null,
        index: null,
        path: null,
        type: "recipient",
        usage: null,
        valueSats: 10000
      }
    ],
    psbtBase64: "cHNidP8BAHECAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/////AQAAAAAAAAAA",
    totalInputSats: 100000,
    ...patch
  };
}
