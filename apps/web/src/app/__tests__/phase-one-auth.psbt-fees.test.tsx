import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  copyTextToClipboard,
  feeEstimateSourceLabel,
  formatFeeRate,
  mapSelectedUtxosForPsbt,
  parseFeeRate,
  resolveFeeEstimateUiState,
  selectFeePresetRate,
  VerifyPsbtPanel
} from "../phase-one-auth";
import { jsonResponse, makeUtxo, makeWallet, silenceApiLogs } from "./phase-one-auth.test-utils";

const feeEstimates = {
  economyFee: 4,
  fastestFee: 18,
  halfHourFee: 12,
  hourFee: 8,
  minimumFee: 2
};

describe("PSBT and fee UI regression", () => {
  beforeEach(() => {
    silenceApiLogs();
  });

  it("keeps recommended fee presets available when Atlas returns normal fee estimates", () => {
    const feeUi = resolveFeeEstimateUiState({
      estimates: feeEstimates,
      source: "recommended",
      status: "online"
    });

    expect(feeUi.estimates?.fastestFee).toBe(18);
    expect(feeUi.estimates?.halfHourFee).toBe(12);
    expect(feeUi.estimates?.economyFee).toBe(4);
    expect(feeUi.message).toBe("");
  });

  it("shows local mempool-block diagnostic copy without any public mempool.space fallback", () => {
    const feeUi = resolveFeeEstimateUiState({
      estimates: feeEstimates,
      source: "mempool-blocks",
      status: "online"
    });

    expect(feeUi.message).toMatch(/local mempool block medians/i);
    expect(feeUi.message).not.toMatch(/mempool\.space/i);
  });

  it("keeps manual fee entry path clear when fee estimates are unavailable", () => {
    const feeUi = resolveFeeEstimateUiState({
      diagnostic: "self-hosted mempool fee endpoint returned 503",
      estimates: null,
      status: "unavailable"
    });

    expect(feeUi.estimates).toBeNull();
    expect(feeUi.message).toBe("self-hosted mempool fee endpoint returned 503");
  });

  it("maps single and multiple manual UTXO selections to the existing PSBT builder payload", () => {
    const one = makeUtxo({ txid: "1".repeat(64), vout: 0 });
    const two = makeUtxo({ txid: "2".repeat(64), vout: 1 });

    expect(mapSelectedUtxosForPsbt([])).toBeUndefined();
    expect(mapSelectedUtxosForPsbt([one])).toEqual([{ txid: "1".repeat(64), vout: 0 }]);
    expect(mapSelectedUtxosForPsbt([one, two])).toEqual([
      { txid: "1".repeat(64), vout: 0 },
      { txid: "2".repeat(64), vout: 1 }
    ]);
  });

  it("maps fee presets to high medium and low priorities", () => {
    expect(selectFeePresetRate(feeEstimates, "fastest")).toBe(18);
    expect(selectFeePresetRate(feeEstimates, "medium")).toBe(12);
    expect(selectFeePresetRate(feeEstimates, "slow")).toBe(4);
    expect(selectFeePresetRate({ ...feeEstimates, economyFee: null }, "slow")).toBe(2);
  });

  it("labels fee estimate sources without implying public fallback", () => {
    expect(feeEstimateSourceLabel("recommended")).toBe("recommended mempool estimate");
    expect(feeEstimateSourceLabel("mempool-blocks")).toBe("local mempool block estimate");
  });

  it("formats fee rates without leaking raw float precision", () => {
    expect(formatFeeRate(0.3872355683040517)).toBe("0.39");
    expect(formatFeeRate(0.4)).toBe("0.4");
    expect(formatFeeRate(1)).toBe("1");
    expect(formatFeeRate(1.5)).toBe("1.5");
    expect(formatFeeRate(2.25)).toBe("2.25");
  });

  it("keeps sub-1 sat/vB fee input valid", () => {
    expect(parseFeeRate("0.39")).toBe(0.39);
    expect(parseFeeRate("0")).toBeNull();
    expect(parseFeeRate("1001")).toBeNull();
  });

  it("falls back to textarea copy when Clipboard API is unavailable on LAN HTTP", async () => {
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });

    await expect(copyTextToClipboard("bc1qatlasreceive000000000000000000000000000")).resolves.toBe("fallback");

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("keeps signed PSBT paste verification inline", () => {
    globalThis.fetch = vi.fn(async (input) => {
      expect(String(input)).not.toContain("sendrawtransaction");
      return jsonResponse({
        backend: "disabled",
        configured: false,
        enabled: false,
        message: "Broadcast disabled."
      });
    });

    render(<VerifyPsbtPanel apiUrl="" balanceUnit="sats" wallet={makeWallet()} />);

    expect(screen.getByText("Import signed PSBT")).toBeInTheDocument();
    expect(screen.getByLabelText(/Signed PSBT/i)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.querySelector(".portal-modal-root")).not.toBeInTheDocument();
  });
});
