import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  mapSelectedUtxosForPsbt,
  resolveFeeEstimateUiState,
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
