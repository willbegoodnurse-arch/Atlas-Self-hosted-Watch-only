import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthShell,
  DashboardBalanceHero,
  formatTransactionStatus,
  selectDefaultReceiveAddresses,
  WalletAddressPanel,
  WalletCard,
  WalletCreateForm,
  WalletIdentityPanel
} from "../phase-one-auth";
import { jsonResponse, makeAddress, makeWallet, silenceApiLogs } from "./phase-one-auth.test-utils";

const FULL_ZPUB =
  "zpub6rtpJPNNq6CeKuycgiXu7RBRDzQcPG9uJWbKQ4NCiuVzP3wW6WspGjCD3h1gUKKwZRgo8Mzm21GEkD2HpUUHkfPrwyfcRaaWA93NSnnKTaP";

function importTextarea(): HTMLTextAreaElement {
  const textarea = document.querySelector("textarea.import-textarea");
  if (!(textarea instanceof HTMLTextAreaElement)) {
    throw new Error("Import textarea not found");
  }
  return textarea;
}

describe("wallet list and identity regression", () => {
  beforeEach(() => {
    silenceApiLogs();
  });

  it("renders long wallet names with wallet-specific receive and send actions without exposing a raw xpub", async () => {
    const rawXpub =
      "zpub6rFR7y4Q2A3RawPublicKeyThatShouldNeverRenderByDefault0123456789abcdefghijklmnopqrstuvwxyz";
    const wallet = makeWallet({
      extendedPublicKey: "zpub6r...wxyz",
      name: "Very long hardware wallet account name used to catch cramped dashboard card regressions"
    });
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        confirmedBalance: 120000,
        lookupError: null,
        totalBalance: 120000,
        unconfirmedBalance: 0
      })
    );

    const { container } = render(
      <WalletCard
        apiUrl=""
        busy={false}
        wallet={wallet}
        onDelete={async () => undefined}
        onUpdate={async () => undefined}
      />
    );

    expect(screen.getByRole("link", { name: wallet.name })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText(/120,000 sats|120000 sats/i).length).toBeGreaterThan(0));
    expect(screen.getByText("zpub6r...wxyz")).toBeInTheDocument();
    expect(screen.queryByText(rawXpub)).not.toBeInTheDocument();
    expect(container.querySelector('a[href="/wallets/wallet-1#receive"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/wallets/wallet-1#create-psbt"]')).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Receive" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Send" })).toBeInTheDocument();
  });

  it("shows dashboard total balance in BTC by default and toggles to sats and back", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/market/btc-krw")) {
        return jsonResponse({
          market: "KRW-BTC",
          priceKrw: 150_000_000,
          source: "upbit",
          checkedAt: "2026-05-19T00:00:00.000Z",
          status: "online"
        });
      }
      if (url.includes("/api/wallets/wallet-1/balance")) {
        return jsonResponse({
          confirmedBalance: 1_234_567,
          lookupError: null,
          totalBalance: 1_234_567,
          unconfirmedBalance: 0
        });
      }
      return jsonResponse({ error: "unexpected request" }, 500);
    });

    render(<DashboardBalanceHero apiUrl="" wallets={[makeWallet()]} />);

    expect(await screen.findByText("0.01234567 BTC")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "sats" }));
    expect(screen.getByText("1,234,567 sats")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "BTC" }));
    expect(screen.getByText("0.01234567 BTC")).toBeInTheDocument();
  });

  it("shows KRW conversion under the dashboard total balance", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/market/btc-krw")) {
        return jsonResponse({
          market: "KRW-BTC",
          priceKrw: 150_000_000,
          source: "upbit",
          checkedAt: "2026-05-19T00:00:00.000Z",
          status: "online"
        });
      }
      return jsonResponse({
        confirmedBalance: 1_234_567,
        lookupError: null,
        totalBalance: 1_234_567,
        unconfirmedBalance: 0
      });
    });

    render(<DashboardBalanceHero apiUrl="" wallets={[makeWallet()]} />);

    expect(await screen.findByText("≈ ₩1,851,851")).toBeInTheDocument();
  });

  it("keeps dashboard rendering when KRW price is unavailable", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/market/btc-krw")) {
        throw new Error("price fetch down");
      }
      return jsonResponse({
        confirmedBalance: 1_234_567,
        lookupError: null,
        totalBalance: 1_234_567,
        unconfirmedBalance: 0
      });
    });

    render(<DashboardBalanceHero apiUrl="" wallets={[makeWallet()]} />);

    expect(await screen.findByText("0.01234567 BTC")).toBeInTheDocument();
    expect(await screen.findByText("KRW price unavailable")).toBeInTheDocument();
  });

  it("reveals master fingerprint only after explicit click and renders signer address preview", async () => {
    const wallet = makeWallet();
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        addresses: Array.from({ length: 5 }, (_, index) =>
          makeAddress({
            address: `bc1qatlasreceive${index}00000000000000000000000000`,
            index,
            path: `m/84'/0'/0'/0/${index}`
          })
        )
      })
    );

    render(<WalletIdentityPanel apiUrl="" wallet={wallet} />);

    expect(await screen.findByText("********")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reveal" }));
    expect(screen.getByText("f23a9c1d")).toBeInTheDocument();
    expect(await screen.findByText("Signer address check")).toBeInTheDocument();
    expect(screen.getByText("bc1qatlasreceive000000000000000000000000000")).toBeInTheDocument();
    expect(screen.getByText("bc1qatlasreceive400000000000000000000000000")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Copy first receive address/i })).not.toBeInTheDocument();
  });

  it("shows not provided fallbacks without crashing when fingerprint or account path are missing", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        addresses: [makeAddress()]
      })
    );

    render(
      <WalletIdentityPanel
        apiUrl=""
        wallet={makeWallet({
          accountPath: null,
          derivationPath: null as never,
          masterFingerprint: null
        })}
      />
    );

    expect(await screen.findAllByText("not provided")).toHaveLength(2);
    expect(screen.getByText(/Master fingerprint was not provided/i)).toBeInTheDocument();
  });

  it("selects receive display addresses without letting used empty rows consume the gap-limit slots", () => {
    const addresses = [
      makeAddress({ index: 0, usage: "used", totalBalance: 0, path: "m/84'/0'/0'/0/0" }),
      makeAddress({ index: 1, usage: "used", totalBalance: 12_000, path: "m/84'/0'/0'/0/1" }),
      makeAddress({ index: 2, usage: "unused", path: "m/84'/0'/0'/0/2" }),
      makeAddress({ index: 3, usage: "unused", path: "m/84'/0'/0'/0/3" }),
      makeAddress({ index: 4, usage: "unused", path: "m/84'/0'/0'/0/4" }),
      makeAddress({ index: 5, usage: "unused", path: "m/84'/0'/0'/0/5" }),
      makeAddress({ index: 6, usage: "unused", path: "m/84'/0'/0'/0/6" })
    ];

    const selected = selectDefaultReceiveAddresses(addresses, 5);

    expect(selected.map((address) => address.index)).toEqual([2, 3, 4, 5, 6]);
    expect(selected.map((address) => address.path)).toEqual([
      "m/84'/0'/0'/0/2",
      "m/84'/0'/0'/0/3",
      "m/84'/0'/0'/0/4",
      "m/84'/0'/0'/0/5",
      "m/84'/0'/0'/0/6"
    ]);
  });

  it("keeps used receive addresses visible when they still hold balance", () => {
    const selected = selectDefaultReceiveAddresses(
      [
        makeAddress({ index: 0, usage: "used", totalBalance: 0 }),
        makeAddress({ index: 1, usage: "used", totalBalance: 12_000 }),
        makeAddress({ index: 2, usage: "unused" })
      ],
      5
    );

    expect(selected.map((address) => address.index)).toEqual([2, 1]);
  });

  it("formats confirmation counts only when count data is available", () => {
    expect(formatTransactionStatus({ status: "confirmed", confirmations: 1 })).toBe("confirmed · 1 confirmation");
    expect(formatTransactionStatus({ status: "confirmed", confirmations: 6 })).toBe("confirmed · 6 confirmations");
    expect(formatTransactionStatus({ status: "confirmed", confirmations: null })).toBe("confirmed");
    expect(formatTransactionStatus({ status: "unconfirmed", confirmations: null })).toBe("unconfirmed");
  });

  it("renders the receive list with unused addresses after hiding used empty rows", async () => {
    const wallet = makeWallet({ gapLimit: 5 });
    const addresses = [
      makeAddress({ address: "bc1qusedempty0000000000000000000000000000", index: 0, usage: "used", totalBalance: 0 }),
      ...Array.from({ length: 5 }, (_, offset) =>
        makeAddress({
          address: `bc1qunused${offset + 1}0000000000000000000000000000`,
          index: offset + 1,
          path: `m/84'/0'/0'/0/${offset + 1}`,
          usage: "unused"
        })
      )
    ];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("limit=25");
      return jsonResponse({
        addresses,
        changeBalance: { confirmedBalance: 0, totalBalance: 0, unconfirmedBalance: 0 },
        confirmedBalance: 0,
        discovery: { checkedCount: 6, complete: true, gapLimit: 5, maxDiscoveryLimit: 100 },
        failedAddresses: [],
        lookupError: null,
        nextReceiveLookupError: null,
        nextUnusedReceiveAddress: addresses[1],
        receiveBalance: { confirmedBalance: 0, totalBalance: 0, unconfirmedBalance: 0 },
        status: "online",
        totalBalance: 0,
        unconfirmedBalance: 0,
        unit: "sats",
        usageStatus: "ready",
        walletId: wallet.id
      });
    });

    render(
      <WalletAddressPanel
        apiUrl=""
        balanceUnit="sats"
        mempoolBadgeStatus="online"
        refreshToken={0}
        setBalanceUnit={() => undefined}
        wallet={wallet}
        onBalanceStatusChange={() => undefined}
        onWalletChange={() => undefined}
      />
    );

    expect((await screen.findAllByText("bc1qunused10000000000000000000000000000")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("bc1qunused50000000000000000000000000000").length).toBeGreaterThan(0);
    expect(screen.queryByText("bc1qusedempty0000000000000000000000000000")).not.toBeInTheDocument();
    expect(screen.getByText(/Used empty receive addresses are hidden/i)).toBeInTheDocument();
    expect(screen.getAllByText("#5").length).toBeGreaterThan(0);
    expect(screen.getByText("m/84'/0'/0'/0/5")).toBeInTheDocument();
  });

  it("shows a specific setup-state login error instead of a generic forbidden message", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/auth/session")) {
        return jsonResponse({
          authenticated: false,
          setupComplete: true,
          user: null
        });
      }
      if (url.endsWith("/api/auth/login")) {
        return jsonResponse({ error: "Initial setup is not complete" }, 403);
      }
      return jsonResponse({ error: "unexpected request" }, 500);
    });
    globalThis.fetch = fetchMock;

    render(<AuthShell apiUrl="" />);

    await userEvent.clear(await screen.findByLabelText("Username"));
    await userEvent.type(screen.getByLabelText("Username"), "admin");
    await userEvent.type(screen.getByLabelText("Password"), "correct horse battery staple");
    await userEvent.type(screen.getByLabelText("TOTP code"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByText("Initial setup is not complete")).toBeInTheDocument();
    expect(screen.queryByText("This action is not allowed.")).not.toBeInTheDocument();
  });

  it("shows invalid credentials for login 401 instead of an expired session message", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/auth/session")) {
        return jsonResponse({
          authenticated: false,
          setupComplete: true,
          user: null
        });
      }
      if (url.endsWith("/api/auth/login")) {
        return jsonResponse({ error: "Invalid credentials or code" }, 401);
      }
      return jsonResponse({ error: "unexpected request" }, 500);
    });
    globalThis.fetch = fetchMock;

    render(<AuthShell apiUrl="" />);

    await userEvent.clear(await screen.findByLabelText("Username"));
    await userEvent.type(screen.getByLabelText("Username"), "admin");
    await userEvent.type(screen.getByLabelText("Password"), "wrong password");
    await userEvent.type(screen.getByLabelText("TOTP code"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByText("Invalid credentials or code")).toBeInTheDocument();
    expect(screen.queryByText("Session expired or not signed in. Sign in again.")).not.toBeInTheDocument();
  });

  it("previews Coldcard Generic JSON metadata for wallet import", async () => {
    const genericJson = JSON.stringify({
      xfp: "F23A9C1D",
      p2wpkh: FULL_ZPUB,
      p2wpkh_deriv: "m/84'/0'/0'"
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

    render(
      <WalletCreateForm
        apiUrl=""
        busy={false}
        vaultUnlocked={true}
        onSubmit={async () => undefined}
      />
    );

    fireEvent.change(screen.getByLabelText("Source device"), { target: { value: "coldcard" } });
    fireEvent.change(importTextarea(), { target: { value: genericJson } });

    expect(await screen.findByDisplayValue("f23a9c1d")).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("m/84'/0'/0'").length).toBeGreaterThan(0);
    expect(await screen.findByText("zpub / coldcard-json")).toBeInTheDocument();
    expect(screen.queryByText(/Master fingerprint was not provided/i)).not.toBeInTheDocument();
  });

  it("keeps missing fingerprint guidance for zpub-only wallet import", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        accountPath: "m/84'/0'/0'",
        firstReceiveAddress: "bc1qatlasreceive000000000000000000000000000",
        firstReceivePath: "m/84'/0'/0'/0/0",
        importFormat: "bare-extended-public-key",
        keyType: "zpub",
        masterFingerprint: null,
        network: "mainnet",
        scriptType: "native-segwit",
        warnings: []
      })
    );

    render(
      <WalletCreateForm
        apiUrl=""
        busy={false}
        vaultUnlocked={true}
        onSubmit={async () => undefined}
      />
    );

    fireEvent.change(importTextarea(), { target: { value: FULL_ZPUB } });

    expect(await screen.findByText(/Bare extended public keys usually do not include master fingerprint metadata/i)).toBeInTheDocument();
  });

  it("rejects private material without echoing the payload", async () => {
    const wif = "5KYZdUEo39z3FPrtuX2QbbwGnNP5zTd7yyr2SC1j299sBCnWjss";
    globalThis.fetch = vi.fn();

    render(
      <WalletCreateForm
        apiUrl=""
        busy={false}
        vaultUnlocked={true}
        onSubmit={async () => undefined}
      />
    );

    fireEvent.change(importTextarea(), { target: { value: JSON.stringify({ private_key: wif }) } });

    const rejectionMessages = screen.getAllByText(/Never enter private keys/i);
    expect(rejectionMessages.length).toBeGreaterThan(0);
    expect(rejectionMessages.map((message) => message.textContent ?? "").join(" ")).not.toContain(wif);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
