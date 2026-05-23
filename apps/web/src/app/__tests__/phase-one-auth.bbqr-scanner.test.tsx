import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WalletCreateForm } from "../phase-one-auth";
import { jsonResponse, silenceApiLogs } from "./phase-one-auth.test-utils";

const fullZpub =
  "zpub6rtpJPNNq6CeKuycgiXu7RBRDzQcPG9uJWbKQ4NCiuVzP3wW6WspGjCD3h1gUKKwZRgo8Mzm21GEkD2HpUUHkfPrwyfcRaaWA93NSnnKTaP";

let scannerCallback: ((result: { getText: () => string } | null) => void) | null = null;
const stopScanner = vi.fn();

vi.mock("@zxing/browser", () => ({
  BrowserQRCodeReader: vi.fn().mockImplementation(function BrowserQRCodeReaderMock() {
    return {
      decodeFromVideoDevice: vi.fn(async (_deviceId, _video, callback) => {
      scannerCallback = callback;
      return { stop: stopScanner };
      })
    };
  })
}));

function importTextarea(): HTMLTextAreaElement {
  const textarea = document.querySelector("textarea.import-textarea");
  if (!(textarea instanceof HTMLTextAreaElement)) {
    throw new Error("Import textarea not found");
  }
  return textarea;
}

function renderWalletCreateForm() {
  render(
    <WalletCreateForm
      apiUrl=""
      busy={false}
      vaultUnlocked={true}
      onSubmit={async () => undefined}
    />
  );
}

function makeColdcardJson(): string {
  return JSON.stringify({
    xfp: "F23A9C1D",
    bip84: {
      deriv: "m/84'/0'/0'",
      _pub: fullZpub
    }
  });
}

function makeBase32BbqrFrames(total = 7): string[] {
  const encoded = base32NoPadding(new TextEncoder().encode(makeColdcardJson()));
  const size = Math.ceil(encoded.length / total);
  return Array.from({ length: total }, (_, index) => {
    const body = encoded.slice(index * size, (index + 1) * size);
    return `B$2J${total.toString(36).padStart(2, "0").toUpperCase()}${index.toString(36).padStart(2, "0").toUpperCase()}${body}`;
  });
}

describe("Coldcard BBQr scanner and paste reliability", () => {
  beforeEach(() => {
    silenceApiLogs();
    scannerCallback = null;
    stopScanner.mockClear();
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn()
      }
    });
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        accountPath: "m/84'/0'/0'",
        firstReceiveAddress: "bc1qatlasreceive000000000000000000000000000",
        firstReceivePath: "m/84'/0'/0'/0/0",
        importFormat: "coldcard-generic-json-bbqr",
        keyType: "zpub",
        masterFingerprint: "f23a9c1d",
        network: "mainnet",
        scriptType: "native-segwit",
        warnings: []
      })
    );
  });

  it("manual paste captures one Coldcard BBQr frame without echoing the frame body", async () => {
    const [frame] = makeBase32BbqrFrames();
    renderWalletCreateForm();

    fireEvent.change(importTextarea(), { target: { value: frame } });

    expect(await screen.findByText("BBQr scanner status")).toBeInTheDocument();
    expect(screen.getByText("encoding=2, type=J, frame=1/7")).toBeInTheDocument();
    expect(screen.getByText("1/7")).toBeInTheDocument();
    expect(screen.queryByText(frame)).not.toBeInTheDocument();
  });

  it("manual paste accumulates multiple lines and ignores exact duplicates", async () => {
    const frames = makeBase32BbqrFrames();
    renderWalletCreateForm();

    fireEvent.change(importTextarea(), { target: { value: [frames[0], frames[1], frames[0]].join("\n") } });

    expect(await screen.findByText("2/7")).toBeInTheDocument();
    expect(screen.getByText("3,4,5,6,7")).toBeInTheDocument();
  });

  it("unsupported paste after progress keeps the existing BBQr collector state", async () => {
    const [frame] = makeBase32BbqrFrames();
    renderWalletCreateForm();

    fireEvent.change(importTextarea(), { target: { value: frame } });
    expect(await screen.findByText("1/7")).toBeInTheDocument();

    fireEvent.change(importTextarea(), { target: { value: "not a watch-only qr" } });

    expect(screen.getByText("1/7")).toBeInTheDocument();
  });

  it("camera callback captures BBQr frames and completes preview only after all frames arrive", async () => {
    const frames = makeBase32BbqrFrames();
    renderWalletCreateForm();

    fireEvent.click(screen.getByRole("button", { name: "QR Scan" }));
    await waitFor(() => expect(scannerCallback).not.toBeNull());

    act(() => {
      scannerCallback?.({ getText: () => frames[0] });
    });
    await waitFor(() => expect(screen.getAllByText("encoding=2, type=J, frame=1/7").length).toBeGreaterThan(0));
    expect(screen.getAllByText("1/7").length).toBeGreaterThan(0);

    act(() => {
      scannerCallback?.({ getText: () => "unsupported" });
    });
    expect(screen.getAllByText("1/7").length).toBeGreaterThan(0);

    act(() => {
      for (const frame of frames.slice(1)) {
        scannerCallback?.({ getText: () => frame });
      }
    });

    expect(await screen.findByDisplayValue("Coldcard Generic JSON BBQr captured. Full payload hidden.")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("f23a9c1d")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Scan watch-only import QR/i })).not.toBeInTheDocument());
    expect(screen.queryByText(makeColdcardJson())).not.toBeInTheDocument();
  });
});

function base32NoPadding(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let bitCount = 0;
  let output = "";
  for (const byte of bytes) {
    bits = (bits << 8) | byte;
    bitCount += 8;
    while (bitCount >= 5) {
      output += alphabet[(bits >> (bitCount - 5)) & 31];
      bitCount -= 5;
    }
  }
  if (bitCount > 0) {
    output += alphabet[(bits << (5 - bitCount)) & 31];
  }
  return output;
}
