import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserQRCodeReader } from "@zxing/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WalletCreateForm } from "../phase-one-auth";
import { jsonResponse, silenceApiLogs } from "./phase-one-auth.test-utils";

type QrCallback = (result: { getText: () => string } | null) => void;

let qrCallback: QrCallback | null = null;
let scannerVideoArg: unknown = null;
let scannerConstraintsArg: unknown = null;
let scannerStartError: Error | null = null;
const decodeFromConstraints = vi.fn(async (_constraints, _video, callback: QrCallback) => {
  if (scannerStartError) {
    throw scannerStartError;
  }
  scannerConstraintsArg = _constraints;
  scannerVideoArg = _video;
  qrCallback = callback;
  return { stop: stopScanner };
});
const decodeFromVideoDevice = vi.fn(async (_deviceId, _video, callback: QrCallback) => {
  if (scannerStartError) {
    throw scannerStartError;
  }
  scannerVideoArg = _video;
  qrCallback = callback;
  return { stop: stopScanner };
});
const stopScanner = vi.fn();

vi.mock("@zxing/browser", () => ({
  BrowserQRCodeReader: vi.fn(function BrowserQRCodeReader() {
    return {
      decodeFromConstraints,
      decodeFromVideoDevice
    };
  })
}));

vi.mock("../ur-encode", () => ({
  createUrPsbtDecoder: vi.fn(() => ({})),
  decodeUrPsbtPart: vi.fn(),
  encodeUrPsbt: vi.fn()
}));

const FULL_ZPUB =
  "zpub6rtpJPNNq6CeKuycgiXu7RBRDzQcPG9uJWbKQ4NCiuVzP3wW6WspGjCD3h1gUKKwZRgo8Mzm21GEkD2HpUUHkfPrwyfcRaaWA93NSnnKTaP";
const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32NoPadding(payload: string): string {
  const bytes = new TextEncoder().encode(payload);
  let bits = 0;
  let bitCount = 0;
  let output = "";
  for (const byte of bytes) {
    bits = (bits << 8) | byte;
    bitCount += 8;
    while (bitCount >= 5) {
      output += base32Alphabet[(bits >> (bitCount - 5)) & 31];
      bitCount -= 5;
    }
  }
  if (bitCount > 0) {
    output += base32Alphabet[(bits << (5 - bitCount)) & 31];
  }
  return output;
}

function makeBbqrFrames(payload: string, total = 7): string[] {
  const encoded = base32NoPadding(payload);
  const chunkSize = Math.ceil(encoded.length / total / 8) * 8;
  return Array.from({ length: total }, (_, index) => {
    const indexText = index.toString(36).padStart(2, "0").toUpperCase();
    return `B$2J${total.toString(36).padStart(2, "0").toUpperCase()}${indexText}${encoded.slice(index * chunkSize, (index + 1) * chunkSize)}`;
  });
}

async function openScanner() {
  render(<WalletCreateForm apiUrl="" busy={false} vaultUnlocked={true} onSubmit={async () => undefined} />);
  await userEvent.click(screen.getByRole("button", { name: /^QR Scan$/i }));
  expect(await screen.findByRole("dialog", { name: /Scan watch-only import QR/i })).toBeInTheDocument();
  await waitFor(() => expect(qrCallback).not.toBeNull());
  expect(scannerVideoArg).toBeInstanceOf(HTMLVideoElement);
}

async function scanFrame(frame: string) {
  await act(async () => {
    qrCallback?.({ getText: () => frame });
  });
}

describe("watch-only BBQr scanner", () => {
  beforeEach(() => {
    silenceApiLogs();
    qrCallback = null;
    scannerVideoArg = null;
    scannerConstraintsArg = null;
    scannerStartError = null;
    vi.mocked(BrowserQRCodeReader).mockClear();
    decodeFromConstraints.mockClear();
    decodeFromVideoDevice.mockClear();
    stopScanner.mockClear();
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn() }
    });
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        accountPath: "m/84'/0'/0'",
        firstReceiveAddress: "bc1qatlasreceive000000000000000000000000000",
        firstReceivePath: "m/84'/0'/0'/0/0",
        importFormat: "coldcard-json",
        keyType: "zpub",
        masterFingerprint: "f23a9c1d",
        network: "mainnet",
        scriptType: "native-segwit",
        warnings: []
      })
    );
  });

  it("starts ZXing with low-latency defaults and centered camera constraints", async () => {
    await openScanner();

    expect(BrowserQRCodeReader).toHaveBeenCalledWith(undefined, {
      delayBetweenScanAttempts: 100,
      delayBetweenScanSuccess: 100
    });
    expect(decodeFromVideoDevice).not.toHaveBeenCalled();
    expect(scannerConstraintsArg).toEqual({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });
    expect(scannerConstraintsArg).not.toEqual(expect.objectContaining({
      video: expect.objectContaining({
        height: expect.objectContaining({ ideal: 1080 })
      })
    }));
    expect(scannerVideoArg).toBeInstanceOf(HTMLVideoElement);
  });

  it("renders the watch-only scanner with a centered non-cropping preview guide", async () => {
    await openScanner();

    const dialog = screen.getByRole("dialog", { name: /Scan watch-only import QR/i });
    const video = dialog.querySelector("video");
    expect(video).toHaveClass("scanner-video");
    expect(video).toHaveClass("scanner-video--watch-only");
    expect(dialog.querySelector(".scanner-preview--watch-only")).toBeInTheDocument();
    expect(dialog.querySelector(".scanner-guide")).toBeInTheDocument();
  });

  it("increments captured BBQr frames from the first zero-based frame", async () => {
    const frames = makeBbqrFrames(JSON.stringify({ xfp: "F23A9C1D", p2wpkh: FULL_ZPUB, p2wpkh_deriv: "m/84'/0'/0'" }));
    await openScanner();

    await scanFrame(frames[0]!);

    expect((await screen.findAllByText(/format: bbqr .* type: JSON .* frames: 1\/7/i)).length).toBeGreaterThan(0);
    expect(screen.getByText(/scan seen: 1 \(camera\)/i)).toBeInTheDocument();
    expect(screen.getByText(/raw length: \d+ .* last prefix: B\$/i)).toBeInTheDocument();
    expect(screen.getByText(/bbqr header: encoding=2, type=JSON, frame=1\/7, which=0/i)).toBeInTheDocument();
    expect(screen.getAllByText(/captured: 1\/7/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/missing: 2, 3, 4, 5, 6, 7/i)).toBeInTheDocument();
    expect(screen.queryByText(/frames: 0\/7/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Coldcard Generic JSON frame 1 captured/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Missing frames: 2, 3, 4, 5, 6, 7/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/collect missing frames across multiple loops/i).length).toBeGreaterThan(0);
  });

  it("shows two captured frames, keeps missing frame status, and ignores duplicates", async () => {
    const frames = makeBbqrFrames(JSON.stringify({ xfp: "F23A9C1D", p2wpkh: FULL_ZPUB, p2wpkh_deriv: "m/84'/0'/0'" }));
    await openScanner();

    await scanFrame(frames[1]!);
    await scanFrame(frames[4]!);
    expect((await screen.findAllByText(/format: bbqr .* frames: 2\/7/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Missing frames: 1, 3, 4, 6, 7/i).length).toBeGreaterThan(0);

    await scanFrame(frames[1]!);
    expect(screen.getAllByText(/format: bbqr .* frames: 2\/7/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Missing frames: 1, 3, 4, 6, 7/i).length).toBeGreaterThan(0);
  });

  it("keeps existing BBQr collection when unsupported QR data is scanned", async () => {
    const frames = makeBbqrFrames(JSON.stringify({ xfp: "F23A9C1D", p2wpkh: FULL_ZPUB, p2wpkh_deriv: "m/84'/0'/0'" }));
    await openScanner();

    await scanFrame(frames[1]!);
    await scanFrame(frames[4]!);
    await scanFrame("not a wallet import QR");

    expect(screen.getAllByText(/format: bbqr .* frames: 2\/7/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Missing frames: 1, 3, 4, 6, 7/i).length).toBeGreaterThan(0);
  });

  it("keeps collector state across scanner callbacks and previews the completed Generic JSON", async () => {
    const payload = JSON.stringify({ xfp: "F23A9C1D", p2wpkh: FULL_ZPUB, p2wpkh_deriv: "m/84'/0'/0'" });
    const frames = makeBbqrFrames(payload);
    await openScanner();

    for (const frame of [frames[3], frames[0], frames[6], frames[1], frames[5], frames[2], frames[4]]) {
      await scanFrame(frame!);
    }

    expect(await screen.findByDisplayValue("Coldcard Generic JSON BBQr captured. Full payload hidden.")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("f23a9c1d")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Scan watch-only import QR/i })).not.toBeInTheDocument());
    expect(screen.queryByText(payload)).not.toBeInTheDocument();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/wallets/import-preview"),
      expect.objectContaining({ body: expect.stringContaining('"sourceDevice":"coldcard"') })
    ));
  });

  it("resets only when the user clears collected BBQr frames", async () => {
    const frames = makeBbqrFrames(JSON.stringify({ xfp: "F23A9C1D", p2wpkh: FULL_ZPUB, p2wpkh_deriv: "m/84'/0'/0'" }));
    await openScanner();

    await scanFrame(frames[0]!);
    expect((await screen.findAllByText(/format: bbqr .* frames: 1\/7/i)).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: /Reset/i }));

    expect(screen.queryByText(/format: bbqr/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Frames cleared/i)).toBeInTheDocument();
  });

  it("adds BBQr frames through the manual fallback textarea", async () => {
    const frames = makeBbqrFrames(JSON.stringify({ xfp: "F23A9C1D", p2wpkh: FULL_ZPUB, p2wpkh_deriv: "m/84'/0'/0'" }));
    await openScanner();

    fireEvent.change(screen.getByLabelText(/Paste BBQr frame/i), { target: { value: frames[0]! } });
    await userEvent.click(screen.getByRole("button", { name: /Add BBQr frame/i }));

    expect((await screen.findAllByText(/format: bbqr .* frames: 1\/7/i)).length).toBeGreaterThan(0);
    expect(screen.getByText(/scan seen: 1 \(manual\)/i)).toBeInTheDocument();
    expect(screen.getByText(/bbqr header: encoding=2, type=JSON, frame=1\/7, which=0/i)).toBeInTheDocument();
    expect(screen.getAllByText(/captured: 1\/7/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/Paste BBQr frame/i)).toHaveValue("");
  });

  it("adds multiple pasted BBQr frame lines through the manual fallback", async () => {
    const frames = makeBbqrFrames(JSON.stringify({ xfp: "F23A9C1D", p2wpkh: FULL_ZPUB, p2wpkh_deriv: "m/84'/0'/0'" }));
    await openScanner();

    fireEvent.change(screen.getByLabelText(/Paste BBQr frame/i), { target: { value: `${frames[0]}\n${frames[3]}` } });
    await userEvent.click(screen.getByRole("button", { name: /Add BBQr frame/i }));

    expect((await screen.findAllByText(/format: bbqr .* frames: 2\/7/i)).length).toBeGreaterThan(0);
  });

  it("does not reset BBQr collection for unrelated scanner modal controls", async () => {
    const frames = makeBbqrFrames(JSON.stringify({ xfp: "F23A9C1D", p2wpkh: FULL_ZPUB, p2wpkh_deriv: "m/84'/0'/0'" }));
    await openScanner();

    await scanFrame(frames[0]!);
    await userEvent.click(screen.getByRole("dialog", { name: /Scan watch-only import QR/i }));

    expect(screen.getAllByText(/format: bbqr .* frames: 1\/7/i).length).toBeGreaterThan(0);
  });

  it("rejects private material from completed BBQr without echoing the payload", async () => {
    const wif = "5KYZdUEo39z3FPrtuX2QbbwGnNP5zTd7yyr2SC1j299sBCnWjss";
    const frames = makeBbqrFrames(JSON.stringify({ xfp: "F23A9C1D", p2wpkh: FULL_ZPUB, private_key: wif }), 1);
    await openScanner();

    await scanFrame(frames[0]!);

    const rejectionMessages = await screen.findAllByText(/This looks like a WIF private key\. Never enter private keys into this app\./i);
    expect(rejectionMessages.length).toBeGreaterThan(0);
    expect(document.body.textContent ?? "").not.toContain(wif);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("shows a fallback message when the scanner cannot start", async () => {
    scannerStartError = Object.assign(new Error("scanner module failed"), { name: "NotReadableError" });
    render(<WalletCreateForm apiUrl="" busy={false} vaultUnlocked={true} onSubmit={async () => undefined} />);

    await userEvent.click(screen.getByRole("button", { name: /^QR Scan$/i }));

    expect(await screen.findByText(/Camera is already in use/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Use Paste/i })).toBeInTheDocument();
  });
});
