import { analyzePsbt, deriveAddresses } from "@watch-wallet/bitcoin";
import type { ExtendedPublicKeyKind, PsbtAnalysisResult } from "@watch-wallet/bitcoin";
import type { WalletRecord } from "../vault/types.js";

export { InvalidPsbtError } from "@watch-wallet/bitcoin";

export type VerifyPsbtInput = {
  psbtBase64: string;
  expected?: {
    recipientAddress?: string;
    amountSats?: number;
    changeAddress?: string | null;
    feeSats?: number;
  };
  addressLimit?: number;
};

export type VerifyPsbtInputSummary = {
  txid: string;
  vout: number;
  valueSats: number | null;
  address: string | null;
  belongsToWallet: boolean;
};

export type VerifyPsbtOutputSummary = {
  address: string | null;
  valueSats: number;
  type: "recipient" | "change" | "external" | "unknown";
  belongsToWallet: boolean;
};

export type VerifyPsbtChecks = {
  recipientMatches: boolean | null;
  amountMatches: boolean | null;
  changeAddressMatches: boolean | null;
  feeMatches: boolean | null;
  hasWalletChange: boolean;
  hasUnexpectedExternalOutputs: boolean;
};

export type VerifyPsbtResult = {
  status: "valid" | "warning" | "invalid";
  signed: boolean;
  finalizable: boolean;
  extractable: boolean;
  txHex: string | null;
  txid: string | null;
  feeSats: number | null;
  inputs: VerifyPsbtInputSummary[];
  outputs: VerifyPsbtOutputSummary[];
  checks: VerifyPsbtChecks;
  warnings: string[];
  errors: string[];
};

export async function verifySignedPsbt(
  wallet: WalletRecord,
  input: VerifyPsbtInput
): Promise<VerifyPsbtResult> {
  const psbtNetwork: "mainnet" | "testnet" =
    wallet.network === "mainnet" ? "mainnet" : "testnet";

  const analysis: PsbtAnalysisResult = analyzePsbt(input.psbtBase64, psbtNetwork);

  const addressLimit = input.addressLimit ?? 100;
  const warnings: string[] = [];
  const errors: string[] = [];

  let walletAddressSet = new Set<string>();
  try {
    const xpubType = wallet.type as ExtendedPublicKeyKind;
    const scriptType = wallet.scriptType;
    const derivableScriptType =
      scriptType === "native-segwit" ||
      scriptType === "nested-segwit" ||
      scriptType === "taproot" ||
      scriptType === "legacy"
        ? scriptType
        : undefined;

    const derived = deriveAddresses({
      extendedPublicKey: wallet.extendedPublicKey,
      type: xpubType,
      scriptType: derivableScriptType,
      accountPath: wallet.accountPath ?? wallet.derivationPath,
      network: psbtNetwork,
      chain: "both",
      limit: addressLimit
    });
    walletAddressSet = new Set(derived.addresses.map((a) => a.address));
  } catch {
    warnings.push("Could not derive wallet addresses for ownership check");
  }

  const inputs: VerifyPsbtInputSummary[] = analysis.inputs.map((inp) => ({
    txid: inp.txid,
    vout: inp.vout,
    valueSats: inp.valueSats,
    address: inp.address,
    belongsToWallet: inp.address !== null && walletAddressSet.has(inp.address)
  }));

  const rawOutputs: VerifyPsbtOutputSummary[] = analysis.outputs.map((out) => {
    const belongsToWallet = out.address !== null && walletAddressSet.has(out.address);
    let type: VerifyPsbtOutputSummary["type"];
    if (out.address === null) {
      type = "unknown";
    } else if (belongsToWallet) {
      type = "change";
    } else {
      type = "external";
    }
    return { address: out.address, valueSats: out.valueSats, type, belongsToWallet };
  });

  const walletOutputs = rawOutputs.filter((o) => o.belongsToWallet);
  const externalOutputs = rawOutputs.filter((o) => !o.belongsToWallet && o.address !== null);

  const expected = input.expected;

  if (expected?.recipientAddress !== undefined) {
    const recipOut = rawOutputs.find((o) => o.address === expected.recipientAddress);
    if (recipOut) {
      recipOut.type = "recipient";
    }
  } else if (externalOutputs.length === 1) {
    externalOutputs[0].type = "recipient";
  }

  const outputs = rawOutputs;

  const totalIn = inputs.reduce((sum, i) => sum + (i.valueSats ?? 0), 0);
  const totalOut = outputs.reduce((sum, o) => sum + o.valueSats, 0);
  const allInputsHaveValues = inputs.every((i) => i.valueSats !== null);
  const feeSats = allInputsHaveValues && inputs.length > 0 ? totalIn - totalOut : null;

  const checks: VerifyPsbtChecks = {
    recipientMatches: null,
    amountMatches: null,
    changeAddressMatches: null,
    feeMatches: null,
    hasWalletChange: walletOutputs.length > 0,
    hasUnexpectedExternalOutputs: externalOutputs.length > 1
  };

  if (expected?.recipientAddress !== undefined) {
    const recipOut = outputs.find((o) => o.address === expected.recipientAddress);
    checks.recipientMatches = recipOut !== undefined;
    if (!checks.recipientMatches) {
      errors.push(
        `Expected recipient ${expected.recipientAddress} not found in outputs`
      );
    }

    if (expected.amountSats !== undefined) {
      if (recipOut) {
        checks.amountMatches = recipOut.valueSats === expected.amountSats;
        if (!checks.amountMatches) {
          errors.push(
            `Amount mismatch: expected ${expected.amountSats} sats, found ${recipOut.valueSats} sats`
          );
        }
      } else {
        checks.amountMatches = false;
      }
    }
  }

  if (expected?.changeAddress !== undefined) {
    if (expected.changeAddress === null) {
      checks.changeAddressMatches = walletOutputs.length === 0;
      if (!checks.changeAddressMatches) {
        warnings.push("Expected no change output but wallet-owned outputs found");
      }
    } else {
      const changeOut = outputs.find((o) => o.address === expected.changeAddress);
      checks.changeAddressMatches = changeOut !== undefined && changeOut.belongsToWallet;
      if (!checks.changeAddressMatches) {
        errors.push(`Change address ${expected.changeAddress} not found in wallet outputs`);
      }
    }
  }

  if (expected?.feeSats !== undefined && feeSats !== null) {
    checks.feeMatches = feeSats === expected.feeSats;
    if (!checks.feeMatches) {
      warnings.push(
        `Fee mismatch: expected ${expected.feeSats} sats, calculated ${feeSats} sats`
      );
    }
  }

  if (!analysis.signed) {
    warnings.push("PSBT inputs are not fully signed");
  }

  if (inputs.length > 0 && inputs.some((i) => !i.belongsToWallet)) {
    warnings.push("One or more inputs do not belong to this wallet");
  }

  if (feeSats !== null && feeSats < 0) {
    errors.push("Invalid PSBT: outputs exceed inputs (negative fee)");
  }

  if (checks.hasUnexpectedExternalOutputs) {
    warnings.push("Multiple external outputs found — verify all recipients");
  }

  const status: VerifyPsbtResult["status"] =
    errors.length > 0 ? "invalid" : warnings.length > 0 ? "warning" : "valid";

  return {
    status,
    signed: analysis.signed,
    finalizable: analysis.finalizable,
    extractable: analysis.extractable,
    txHex: analysis.txHex,
    txid: analysis.txid,
    feeSats,
    inputs,
    outputs,
    checks,
    warnings,
    errors
  };
}
