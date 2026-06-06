import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  copyTextToClipboard,
  CreatePsbtBuilderPanel,
  feeEstimateSourceLabel,
  formatFeeRate,
  isSignedPsbtSingleQrCandidate,
  mapSelectedUtxosForPsbt,
  parseFeeRate,
  resolveFeeEstimateUiState,
  SIGNED_PSBT_CAMERA_FALLBACK_MESSAGE,
  SIGNED_PSBT_QR_TOO_LARGE_MESSAGE,
  SIGNED_PSBT_UNSUPPORTED_UR_MESSAGE,
  selectFeePresetRate,
  signedPsbtMultipartFrameMessage,
  VerifyPsbtPanel
} from "../phase-one-auth";
import { encodeUrPsbt } from "../ur-encode";
import { jsonResponse, makePsbtResult, makeUtxo, makeWallet, silenceApiLogs } from "./phase-one-auth.test-utils";

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
      const expected = body.expected ?? {};
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
      return jsonResponse({
        ...signedVerifyResponse,
        checks: {
          ...signedVerifyResponse.checks,
          amountMatches: expected.amountSats !== undefined ? expected.amountSats === 90000 : null,
          changeAddressMatches: expected.changeAddress !== undefined
            ? expected.changeAddress === "bc1qatlaschange000000000000000000000000000"
            : null,
          feeMatches: expected.feeSats !== undefined ? expected.feeSats === 700 : null,
          recipientMatches: expected.recipientAddress !== undefined
            ? expected.recipientAddress === "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080"
            : null
        },
        errors: expected.recipientAddress === "missing-recipient"
          ? ["The expected recipient address was not found in this PSBT's outputs."]
          : signedVerifyResponse.errors,
        status: expected.recipientAddress === "missing-recipient" ? "invalid" : signedVerifyResponse.status
      });
    }
    if (url.includes("/api/wallets/wallet-1/psbt/broadcast")) {
      const txid = "3".repeat(64);
      return jsonResponse({
        backend: "core",
        status: "broadcasted",
        txid,
        message: "Broadcast accepted by Bitcoin Core.",
        mempool: {
          configured: true,
          lookupStatus: "pending",
          message: "Mempool lookup pending.",
          txUrl: `http://raspberrypi.local:8080/tx/${txid}`
        }
      });
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

  it("shows created PSBT change output as an unused change address with path metadata", async () => {
    const selected = makeUtxo({ outpoint: `${"1".repeat(64)}:0`, txid: "1".repeat(64), vout: 0, valueSats: 100000 });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/wallets/wallet-1/utxos")) {
        return jsonResponse({
          addressLimit: 20,
          chain: "both",
          failedAddresses: [],
          includeUnconfirmed: true,
          status: "online",
          summary: { confirmedBalance: 100000, totalBalance: 100000, unconfirmedBalance: 0 },
          unit: "sats",
          utxos: [selected],
          walletId: "wallet-1"
        });
      }
      if (url.includes("/api/fees/recommended")) {
        return jsonResponse({ estimates: feeEstimates, source: "recommended", status: "online" });
      }
      if (url.includes("/api/wallets/wallet-1/psbt")) {
        return jsonResponse(
          makePsbtResult({
            outputs: [
              {
                address: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080",
                chain: null,
                index: null,
                path: null,
                type: "recipient",
                valueSats: 10000
              },
              {
                address: "bc1qatlaschange000000000000000000000000000",
                chain: "change",
                index: 0,
                path: "m/84'/0'/0'/1/0",
                type: "change",
                valueSats: 88000
              }
            ]
          })
        );
      }
      return jsonResponse({ error: "unexpected request" }, 500);
    });
    globalThis.fetch = fetchMock;

    render(
      <CreatePsbtBuilderPanel
        apiUrl=""
        balanceUnit="sats"
        initialSelectedOutpoints={[selected.outpoint]}
        wallet={makeWallet()}
      />
    );

    await userEvent.type(screen.getByLabelText(/Recipient 1 address/i), "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080");
    await userEvent.type(screen.getByLabelText(/^Amount$/i), "10000");
    await userEvent.click(screen.getByRole("button", { name: /Create unsigned PSBT/i }));

    expect(await screen.findByText("Unsigned PSBT ready")).toBeInTheDocument();
    expect(screen.getAllByText(/Unused change address/i).length).toBeGreaterThan(0);
    expect(screen.getByText("change #0 / m/84'/0'/0'/1/0")).toBeInTheDocument();
    expect(screen.getAllByText(/Recipient 1/i).length).toBeGreaterThan(0);
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

  it("shows a signed PSBT verification checklist and broadcast readiness summary", async () => {
    installVerifyFetch();
    const user = userEvent.setup();

    render(<VerifyPsbtPanel apiUrl="" balanceUnit="sats" wallet={makeWallet()} />);

    await user.click(screen.getByText(/Optional safety checks/i));
    await user.type(screen.getByLabelText(/Expected recipient address/i), "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080");
    await user.type(screen.getByLabelText(/Expected amount/i), "90000");
    await user.type(screen.getByLabelText(/Expected change address/i), "bc1qatlaschange000000000000000000000000000");
    await user.type(screen.getByLabelText(/Expected fee/i), "700");
    await user.type(screen.getByLabelText(/Signed PSBT/i), "signed-psbt");
    await user.click(screen.getByRole("button", { name: /Verify signed PSBT/i }));

    const checklist = await screen.findByRole("group", { name: /Verification checklist/i });
    expect(checklist).toHaveTextContent(/Signed by external walletPASS/i);
    expect(checklist).toHaveTextContent(/Expected recipientPASS/i);
    expect(checklist).toHaveTextContent(/Expected amountPASS/i);
    expect(checklist).toHaveTextContent(/Expected changePASS/i);
    expect(checklist).toHaveTextContent(/Expected feePASS/i);

    const readiness = screen.getByRole("group", { name: /Broadcast readiness/i });
    expect(readiness).toHaveTextContent(/Verification statusPASS/i);
    expect(readiness).toHaveTextContent(/Extractable transactionPASS/i);
    expect(readiness).toHaveTextContent(/Bitcoin Core backendPASS/i);
    expect(readiness).toHaveTextContent(/Manual confirmationPENDING/i);
  });

  it("surfaces failed expected checks before broadcast controls", async () => {
    installVerifyFetch();
    const user = userEvent.setup();

    render(<VerifyPsbtPanel apiUrl="" balanceUnit="sats" wallet={makeWallet()} />);

    await user.click(screen.getByText(/Optional safety checks/i));
    await user.type(screen.getByLabelText(/Expected recipient address/i), "missing-recipient");
    await user.type(screen.getByLabelText(/Signed PSBT/i), "signed-psbt");
    await user.click(screen.getByRole("button", { name: /Verify signed PSBT/i }));

    const checklist = await screen.findByRole("group", { name: /Verification checklist/i });
    expect(checklist).toHaveTextContent(/Expected recipientFAIL/i);
    expect(screen.getAllByText(/The expected recipient address was not found/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("group", { name: /Broadcast readiness/i })).toHaveTextContent(/Verification statusFAIL/i);
    expect(screen.getByText(/Broadcast disabled because this signed PSBT is invalid/i)).toBeInTheDocument();
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

  it("captures a partial multipart signed PSBT frame without verifying yet", async () => {
    const fetchMock = installVerifyFetch();
    const user = userEvent.setup();
    render(<VerifyPsbtPanel apiUrl="" balanceUnit="sats" wallet={makeWallet()} />);

    await user.type(screen.getByLabelText(/Signed PSBT/i), "p1of3 signed-");
    await user.click(screen.getByRole("button", { name: /Verify signed PSBT/i }));

    expect(await screen.findByText(/Multipart signed PSBT frame 1 of 3 captured/i)).toBeInTheDocument();
    expect(screen.getByText(/Waiting for frame 2 and frame 3/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/psbt/verify"), expect.anything());
    expect(signedPsbtMultipartFrameMessage("p2of3 data")).toMatch(/frame 2 of 3/i);
    expect(signedPsbtMultipartFrameMessage("p3of3 data")).toMatch(/frame 3 of 3/i);
  });

  it("assembles multipart signed PSBT frames entered in order and verifies the result", async () => {
    const fetchMock = installVerifyFetch();
    const user = userEvent.setup();
    render(<VerifyPsbtPanel apiUrl="" balanceUnit="sats" wallet={makeWallet()} />);
    const signedPsbtInput = screen.getByLabelText(/Signed PSBT/i);

    await user.type(signedPsbtInput, "p1of3 signed-");
    await user.click(screen.getByRole("button", { name: /Verify signed PSBT/i }));
    await user.type(signedPsbtInput, "p2of3 ps");
    await user.click(screen.getByRole("button", { name: /Verify signed PSBT/i }));
    await user.type(signedPsbtInput, "p3of3 bt");
    await user.click(screen.getByRole("button", { name: /Verify signed PSBT/i }));

    expect(await screen.findByText(/Verification result/i)).toBeInTheDocument();
    expect(screen.getByText(/All 3 frames captured. Ready to verify signed PSBT/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/wallets/wallet-1/psbt/verify"),
      expect.objectContaining({
        body: expect.stringContaining('"psbtBase64":"signed-psbt"')
      })
    );
  });

  it("assembles multipart signed PSBT frames entered out of order", async () => {
    const fetchMock = installVerifyFetch();
    const user = userEvent.setup();
    render(<VerifyPsbtPanel apiUrl="" balanceUnit="sats" wallet={makeWallet()} />);
    const signedPsbtInput = screen.getByLabelText(/Signed PSBT/i);

    await user.type(signedPsbtInput, "p3of3 bt");
    await user.click(screen.getByRole("button", { name: /Verify signed PSBT/i }));
    expect(await screen.findByText(/Waiting for frame 1 and frame 2/i)).toBeInTheDocument();
    await user.type(signedPsbtInput, "p1of3 signed-");
    await user.click(screen.getByRole("button", { name: /Verify signed PSBT/i }));
    await user.type(signedPsbtInput, "p2of3 ps");
    await user.click(screen.getByRole("button", { name: /Verify signed PSBT/i }));

    expect(await screen.findByText(/Verification result/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/wallets/wallet-1/psbt/verify"),
      expect.objectContaining({
        body: expect.stringContaining('"psbtBase64":"signed-psbt"')
      })
    );
  });

  it("decodes single-frame signed PSBT UR before verification", async () => {
    const fetchMock = installVerifyFetch();
    const user = userEvent.setup();
    render(<VerifyPsbtPanel apiUrl="" balanceUnit="sats" wallet={makeWallet()} />);
    const signedPsbtBase64 = btoa("signed-psbt");
    const urFrame = encodeUrPsbt(signedPsbtBase64)[0];

    await user.type(screen.getByLabelText(/Signed PSBT/i), urFrame);
    await user.click(screen.getByRole("button", { name: /Verify signed PSBT/i }));

    expect(await screen.findByText(/Verification result/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/wallets/wallet-1/psbt/verify"),
      expect.objectContaining({
        body: expect.stringContaining(`"psbtBase64":"${signedPsbtBase64}"`)
      })
    );
  });

  it("collects fragmented signed PSBT UR frames out of order before verification", async () => {
    const fetchMock = installVerifyFetch();
    const user = userEvent.setup();
    render(<VerifyPsbtPanel apiUrl="" balanceUnit="sats" wallet={makeWallet()} />);
    const signedPsbtInput = screen.getByLabelText(/Signed PSBT/i);
    const signedPsbtBase64 = btoa("signed-psbt".repeat(80));
    const frames = encodeUrPsbt(signedPsbtBase64, { maxFragmentLength: 20 });
    const reorderedFrames = [frames[1], frames[0], ...frames.slice(2)];

    expect(frames.length).toBeGreaterThan(1);

    for (const frame of reorderedFrames) {
      fireEvent.change(signedPsbtInput, { target: { value: frame } });
      await user.click(screen.getByRole("button", { name: /Verify signed PSBT/i }));
    }

    expect(await screen.findByText(/Verification result/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/wallets/wallet-1/psbt/verify"),
      expect.objectContaining({
        body: expect.stringContaining(`"psbtBase64":"${signedPsbtBase64}"`)
      })
    );
  });

  it("shows partial signed PSBT UR progress and lets the user clear collected frames", async () => {
    const fetchMock = installVerifyFetch();
    const user = userEvent.setup();
    render(<VerifyPsbtPanel apiUrl="" balanceUnit="sats" wallet={makeWallet()} />);
    const signedPsbtBase64 = btoa("signed-psbt".repeat(80));
    const frames = encodeUrPsbt(signedPsbtBase64, { maxFragmentLength: 20 });

    fireEvent.change(screen.getByLabelText(/Signed PSBT/i), { target: { value: frames[0] } });
    await user.click(screen.getByRole("button", { name: /Verify signed PSBT/i }));

    expect(await screen.findByText(/UR crypto-psbt frame captured/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Clear UR frames/i })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/psbt/verify"), expect.anything());

    await user.click(screen.getByRole("button", { name: /Clear UR frames/i }));

    expect(screen.queryByRole("button", { name: /Clear UR frames/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Signed PSBT UR frames cleared/i)).toBeInTheDocument();
  });

  it("resets partial signed PSBT UR state when verifying pasted base64", async () => {
    const fetchMock = installVerifyFetch();
    const user = userEvent.setup();
    render(<VerifyPsbtPanel apiUrl="" balanceUnit="sats" wallet={makeWallet()} />);
    const signedPsbtInput = screen.getByLabelText(/Signed PSBT/i);
    const frames = encodeUrPsbt(btoa("signed-psbt".repeat(80)), { maxFragmentLength: 20 });

    fireEvent.change(signedPsbtInput, { target: { value: frames[0] } });
    await user.click(screen.getByRole("button", { name: /Verify signed PSBT/i }));
    expect(await screen.findByText(/UR crypto-psbt frame captured/i)).toBeInTheDocument();

    fireEvent.change(signedPsbtInput, { target: { value: "signed-psbt" } });
    await user.click(screen.getByRole("button", { name: /Verify signed PSBT/i }));

    expect(await screen.findByText(/Verification result/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Clear UR frames/i })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/wallets/wallet-1/psbt/verify"),
      expect.objectContaining({
        body: expect.stringContaining('"psbtBase64":"signed-psbt"')
      })
    );
  });

  it("rejects unsupported signed PSBT UR types before verification", async () => {
    const fetchMock = installVerifyFetch();
    const user = userEvent.setup();
    render(<VerifyPsbtPanel apiUrl="" balanceUnit="sats" wallet={makeWallet()} />);

    await user.type(screen.getByLabelText(/Signed PSBT/i), "ur:crypto-hdkey/abcd");
    await user.click(screen.getByRole("button", { name: /Verify signed PSBT/i }));

    expect(await screen.findByText(SIGNED_PSBT_UNSUPPORTED_UR_MESSAGE)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/psbt/verify"), expect.anything());
  });

  it("handles duplicate multipart frames and rejects conflicting multipart frames", async () => {
    const fetchMock = installVerifyFetch();
    const user = userEvent.setup();
    render(<VerifyPsbtPanel apiUrl="" balanceUnit="sats" wallet={makeWallet()} />);
    const signedPsbtInput = screen.getByLabelText(/Signed PSBT/i);

    await user.type(signedPsbtInput, "p1of2 same");
    await user.click(screen.getByRole("button", { name: /Verify signed PSBT/i }));
    await user.type(signedPsbtInput, "p1of2 same");
    await user.click(screen.getByRole("button", { name: /Verify signed PSBT/i }));
    expect(await screen.findByText(/already captured/i)).toBeInTheDocument();

    await user.type(signedPsbtInput, "p1of2 other");
    await user.click(screen.getByRole("button", { name: /Verify signed PSBT/i }));
    expect(await screen.findByText(/already has different data/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/psbt/verify"), expect.anything());
  });

  it("rejects mixed multipart total counts", async () => {
    const user = userEvent.setup();
    render(<VerifyPsbtPanel apiUrl="" balanceUnit="sats" wallet={makeWallet()} />);
    const signedPsbtInput = screen.getByLabelText(/Signed PSBT/i);

    await user.type(signedPsbtInput, "p1of2 same");
    await user.click(screen.getByRole("button", { name: /Verify signed PSBT/i }));
    await user.type(signedPsbtInput, "p2of3 other");
    await user.click(screen.getByRole("button", { name: /Verify signed PSBT/i }));

    expect(await screen.findByText(/total mismatch/i)).toBeInTheDocument();
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
    const broadcastButton = await screen.findByRole("button", { name: /Broadcast signed transaction/i });

    expect(broadcastButton).toBeDisabled();
    await user.click(screen.getByLabelText(/I verified the recipient/i));
    expect(broadcastButton).toBeDisabled();
    await user.type(screen.getByLabelText(/Type BROADCAST/i), "BROADCAST");
    expect(broadcastButton).toBeEnabled();
  });

  it("shows txid and local mempool handoff after broadcast success", async () => {
    installVerifyFetch();
    const user = userEvent.setup();
    render(<VerifyPsbtPanel apiUrl="" balanceUnit="sats" wallet={makeWallet()} />);

    await user.type(screen.getByLabelText(/Signed PSBT/i), "signed-psbt");
    await user.click(screen.getByRole("button", { name: /Verify signed PSBT/i }));
    await screen.findByText(/Verification result/i);
    await user.click(screen.getByLabelText(/I verified the recipient/i));
    await user.type(screen.getByLabelText(/Type BROADCAST/i), "BROADCAST");
    await user.click(screen.getByRole("button", { name: /Broadcast signed transaction/i }));

    const txid = "3".repeat(64);
    expect((await screen.findAllByText(/Broadcast accepted by Bitcoin Core/i)).length).toBeGreaterThan(0);
    expect(screen.getByText(new RegExp(txid))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Copy txid/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open in local mempool/i })).toHaveAttribute(
      "href",
      `http://raspberrypi.local:8080/tx/${txid}`
    );
    const broadcastCall = vi.mocked(globalThis.fetch).mock.calls.find(([input]) =>
      String(input).includes("/api/wallets/wallet-1/psbt/broadcast")
    );
    expect(JSON.parse(String(broadcastCall?.[1]?.body))).toMatchObject({
      confirmationText: "BROADCAST"
    });
    expect(screen.getByRole("button", { name: /Close/i })).toBeInTheDocument();
  });

  it("keeps local mempool handoff disabled when MEMPOOL_WEB_URL is not configured", async () => {
    installVerifyFetch();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
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
        return jsonResponse(signedVerifyResponse);
      }
      if (url.includes("/api/wallets/wallet-1/psbt/broadcast")) {
        return jsonResponse({
          backend: "core",
          status: "broadcasted",
          txid: "3".repeat(64),
          message: "Broadcast accepted by Bitcoin Core.",
          mempool: {
            configured: false,
            lookupStatus: "unavailable",
            message: "Local mempool web URL not configured.",
            txUrl: null
          }
        });
      }
      return jsonResponse({ error: "unexpected request" }, 500);
    });
    const user = userEvent.setup();
    render(<VerifyPsbtPanel apiUrl="" balanceUnit="sats" wallet={makeWallet()} />);

    await user.type(screen.getByLabelText(/Signed PSBT/i), "signed-psbt");
    await user.click(screen.getByRole("button", { name: /Verify signed PSBT/i }));
    await screen.findByText(/Verification result/i);
    await user.click(screen.getByLabelText(/I verified the recipient/i));
    await user.type(screen.getByLabelText(/Type BROADCAST/i), "BROADCAST");
    await user.click(screen.getByRole("button", { name: /Broadcast signed transaction/i }));

    expect((await screen.findAllByText(/Local mempool web URL not configured/i)).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /Open in local mempool/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Local mempool web URL not configured/i })).toBeDisabled();
  });

  it("detects oversized single-frame signed PSBT QR payloads", () => {
    expect(isSignedPsbtSingleQrCandidate("cHNidP8B")).toBe(true);
    expect(isSignedPsbtSingleQrCandidate("x".repeat(4000))).toBe(false);
    expect(SIGNED_PSBT_QR_TOO_LARGE_MESSAGE).toMatch(/too large/i);
  });
});
