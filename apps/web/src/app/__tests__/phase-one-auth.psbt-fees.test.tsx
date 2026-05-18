import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  copyTextToClipboard,
  feeEstimateSourceLabel,
  formatFeeRate,
  isSignedPsbtSingleQrCandidate,
  mapSelectedUtxosForPsbt,
  parseFeeRate,
  resolveFeeEstimateUiState,
  SIGNED_PSBT_CAMERA_FALLBACK_MESSAGE,
  SIGNED_PSBT_QR_TOO_LARGE_MESSAGE,
  selectFeePresetRate,
  signedPsbtMultipartFrameMessage,
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

const signedVerifyResponse = {
  checks: {
    amountMatches: null,
    changeAddressMatches: null,
    feeMatches: null,
    hasUnexpectedExternalOutputs: false,
    hasWalletChange: true,
    recipientMatches: null
  },
  errors: [],
  extractable: true,
  feeRateSatsPerVbyte: 5,
  feeSats: 700,
  finalizable: true,
  inputs: [
    {
      address: "bc1qatlasutxo00000000000000000000000000000",
      belongsToWallet: true,
      txid: "1".repeat(64),
      valueSats: 100000,
      vout: 0
    }
  ],
  outputs: [
    {
      address: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080",
      belongsToWallet: false,
      type: "recipient",
      valueSats: 90000
    },
    {
      address: "bc1qatlaschange000000000000000000000000000",
      belongsToWallet: true,
      type: "change",
      valueSats: 9300
    }
  ],
  signed: true,
  status: "valid",
  txHex: "02000000000100",
  txid: "2".repeat(64),
  vsize: 140,
  warnings: []
};

function installVerifyFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/broadcast/core/status")) {
      return jsonResponse({
        backend: "core",
        configured: true,
        enabled: true,
        message: "Bitcoin Core RPC broadcast is enabled.",
        reachable: true
      });
    }
    if (url.includes("/api/wallets/wallet-1/psbt/verify")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (body.psbtBase64 === "unsigned-psbt") {
        return jsonResponse({
          ...signedVerifyResponse,
          errors: ["Unsigned PSBT submitted to signed PSBT import flow"],
          extractable: false,
          signed: false,
          status: "invalid",
          txHex: null
        });
      }
      if (body.psbtBase64 === "invalid-psbt") {
        return jsonResponse({ error: "Could not parse PSBT" }, 400);
      }
      return jsonResponse(signedVerifyResponse);
    }
    if (url.includes("/api/wallets/wallet-1/psbt/broadcast")) {
      return jsonResponse({ backend: "core", status: "broadcasted", txid: "3".repeat(64) });
    }
    return jsonResponse({ error: "unexpected request" }, 500);
  });
  globalThis.fetch = fetchMock;
  return fetchMock;
}

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

  it("shows projected-block diagnostic copy without any public mempool.space fallback", () => {
    const feeUi = resolveFeeEstimateUiState({
      estimates: feeEstimates,
      source: "projected-blocks",
      status: "online"
    });

    expect(feeUi.message).toMatch(/current projected mempool blocks/i);
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
    expect(selectFeePresetRate(feeEstimates, "slow")).toBe(8);
    expect(selectFeePresetRate({ ...feeEstimates, hourFee: null }, "slow")).toBe(4);
    expect(selectFeePresetRate({ ...feeEstimates, hourFee: null, economyFee: null }, "slow")).toBe(2);
  });

  it("labels fee estimate sources without implying public fallback", () => {
    expect(feeEstimateSourceLabel("recommended")).toBe("Local mempool estimate");
    expect(feeEstimateSourceLabel("precise")).toBe("Local mempool estimate");
    expect(feeEstimateSourceLabel("init-data")).toBe("Local mempool estimate");
    expect(feeEstimateSourceLabel("projected-blocks")).toBe("Local mempool estimate");
    expect(feeEstimateSourceLabel(null)).toBe("Local mempool unavailable - manual entry required");
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

  it("verifies signed PSBT pasted text without broadcasting automatically", async () => {
    const fetchMock = installVerifyFetch();
    const user = userEvent.setup();

    render(<VerifyPsbtPanel apiUrl="" balanceUnit="sats" wallet={makeWallet()} />);

    await user.type(screen.getByLabelText(/Signed PSBT/i), "signed-psbt");
    await user.click(screen.getByRole("button", { name: /Verify signed PSBT/i }));

    expect(await screen.findByText(/Verification result/i)).toBeInTheDocument();
    expect(screen.getByText(/Coldcard Vault/)).toBeInTheDocument();
    expect(screen.getByText(/5 sat\/vB/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/psbt/broadcast"), expect.anything());
  });

  it("loads a signed PSBT file into the verification textarea", async () => {
    installVerifyFetch();
    render(<VerifyPsbtPanel apiUrl="" balanceUnit="sats" wallet={makeWallet()} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["signed-file-psbt"], "signed.psbt", { type: "text/plain" });
    await fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByLabelText(/Signed PSBT/i)).toHaveValue("signed-file-psbt"));
    expect(screen.getByText(/Signed PSBT file loaded/i)).toBeInTheDocument();
  });

  it("shows signed PSBT QR fallback on insecure LAN HTTP contexts", async () => {
    installVerifyFetch();
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });

    render(<VerifyPsbtPanel apiUrl="" balanceUnit="sats" wallet={makeWallet()} />);
    await userEvent.click(screen.getByRole("button", { name: /Scan signed PSBT QR/i }));

    expect(screen.getByText(SIGNED_PSBT_CAMERA_FALLBACK_MESSAGE)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Paste signed PSBT/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Upload signed PSBT file/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog", { name: /Scan signed PSBT QR/i })).not.toBeInTheDocument();
  });

  it("opens and closes signed PSBT scanner modal in secure contexts", async () => {
    installVerifyFetch();
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });

    render(<VerifyPsbtPanel apiUrl="" balanceUnit="sats" wallet={makeWallet()} />);
    await userEvent.click(screen.getByRole("button", { name: /Scan signed PSBT QR/i }));

    expect(await screen.findByRole("dialog", { name: /Scan signed PSBT QR/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Use Paste fallback/i }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Scan signed PSBT QR/i })).not.toBeInTheDocument());
  });

  it("shows a specific unsupported message for multipart signed PSBT QR frames", async () => {
    const fetchMock = installVerifyFetch();
    const user = userEvent.setup();
    render(<VerifyPsbtPanel apiUrl="" balanceUnit="sats" wallet={makeWallet()} />);

    await user.type(screen.getByLabelText(/Signed PSBT/i), "p1of3 abcdef");
    await user.click(screen.getByRole("button", { name: /Verify signed PSBT/i }));

    expect(await screen.findByText(/multipart signed PSBT QR frame 1 of 3/i)).toBeInTheDocument();
    expect(screen.getByText(/complete signed PSBT base64/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/psbt/verify"), expect.anything());
    expect(signedPsbtMultipartFrameMessage("p2of3 data")).toMatch(/frame 2 of 3/i);
    expect(signedPsbtMultipartFrameMessage("p3of3 data")).toMatch(/frame 3 of 3/i);
  });

  it("rejects invalid and unsigned PSBTs in signed import flow", async () => {
    installVerifyFetch();
    const user = userEvent.setup();
    render(<VerifyPsbtPanel apiUrl="" balanceUnit="sats" wallet={makeWallet()} />);

    await user.type(screen.getByLabelText(/Signed PSBT/i), "invalid-psbt");
    await user.click(screen.getByRole("button", { name: /Verify signed PSBT/i }));
    expect(await screen.findByText(/Could not parse PSBT/i)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/Signed PSBT/i));
    await user.type(screen.getByLabelText(/Signed PSBT/i), "unsigned-psbt");
    await user.click(screen.getByRole("button", { name: /Verify signed PSBT/i }));
    expect(await screen.findByText(/Unsigned PSBT submitted/i)).toBeInTheDocument();
  });

  it("broadcast gate requires checkbox and typed BROADCAST", async () => {
    installVerifyFetch();
    const user = userEvent.setup();
    render(<VerifyPsbtPanel apiUrl="" balanceUnit="sats" wallet={makeWallet()} />);

    await user.type(screen.getByLabelText(/Signed PSBT/i), "signed-psbt");
    await user.click(screen.getByRole("button", { name: /Verify signed PSBT/i }));
    const broadcastButton = await screen.findByRole("button", { name: /Broadcast transaction/i });

    expect(broadcastButton).toBeDisabled();
    await user.click(screen.getByLabelText(/I verified the recipient/i));
    expect(broadcastButton).toBeDisabled();
    await user.type(screen.getByLabelText(/Type BROADCAST/i), "BROADCAST");
    expect(broadcastButton).toBeEnabled();
  });

  it("detects oversized single-frame signed PSBT QR payloads", () => {
    expect(isSignedPsbtSingleQrCandidate("cHNidP8B")).toBe(true);
    expect(isSignedPsbtSingleQrCandidate("x".repeat(4000))).toBe(false);
    expect(SIGNED_PSBT_QR_TOO_LARGE_MESSAGE).toMatch(/too large/i);
  });
});
