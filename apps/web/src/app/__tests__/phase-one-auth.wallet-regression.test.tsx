import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthShell,
  DashboardBalanceHero,
  formatSecurityAddressDisplay,
  formatTransactionStatus,
  normalizeSettingsLanguage,
  selectDefaultBranchAddresses,
  selectDefaultReceiveAddresses,
  SettingsModal,
  WalletAddressPanel,
  WalletCard,
  WalletCreateForm,
  WalletIdentityPanel
} from "../phase-one-auth";
import { jsonResponse, makeAddress, makeWallet, silenceApiLogs } from "./phase-one-auth.test-utils";

vi.mock("../ur-encode", () => ({
  createUrPsbtDecoder: vi.fn(() => ({})),
  decodeUrPsbtPart: vi.fn(),
  encodeUrPsbt: vi.fn()
}));

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

  it("applies the settings default balance unit and hides the KRW estimate without browser storage", async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
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

    render(<DashboardBalanceHero apiUrl="" defaultBalanceUnit="sats" showKrwEstimate={false} wallets={[makeWallet()]} />);

    expect(await screen.findByText("1,234,567 sats")).toBeInTheDocument();
    expect(screen.queryByText(/KRW price unavailable/i)).not.toBeInTheDocument();
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it("renders the Settings modal with safe runtime sections and explicit close behavior", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/status")) {
        return jsonResponse({ status: "ok", watchOnly: true });
      }
      if (url.includes("/api/market/btc-krw")) {
        return jsonResponse({
          market: "KRW-BTC",
          priceKrw: 150_000_000,
          source: "upbit",
          checkedAt: "2026-05-19T00:00:00.000Z",
          status: "online"
        });
      }
      return jsonResponse({ error: "unexpected request" }, 500);
    });
    const closeSpy = vi.fn();

    render(
      <SettingsModal
        apiUrl="/api"
        balanceUnit="btc"
        busy={false}
        language="en"
        mempoolStatus={{
          cacheTtlSeconds: 30,
          mode: "local",
          status: "online",
          tipHeight: 900000,
          url: "sanitized"
        }}
        runtimeSettings={{
          apiMode: "same-origin",
          backendKind: "mempool-local",
          broadcastBackend: "core",
          broadcastCoreConfigured: true,
          defaultCurrency: "KRW",
          defaultNetwork: "mainnet",
          defaultUnit: "btc",
          fulcrum: { configured: false, host: null, port: 50001, tlsPort: 50002, useTls: false },
          isLocalMempool: true,
          mempoolApiHost: "localhost",
          mempoolApiUrl: "sanitized",
          mempoolWebUrl: null,
          mempoolWebUrlConfigured: true
        }}
        session={{ authenticated: true, setupComplete: true, user: { username: "admin" } }}
        showKrwEstimate={true}
        vaultStatus={{ autoLockMinutes: 30, initialized: true, unlocked: true, walletCount: 1 }}
        onBalanceUnitChange={() => undefined}
        onClose={closeSpy}
        onLanguageChange={() => undefined}
        onLockVault={async () => undefined}
        onShowKrwEstimateChange={() => undefined}
      />
    );

    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByText("Display")).toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("Network")).toBeInTheDocument();
    expect(screen.getByText("Broadcast")).toBeInTheDocument();
    expect(screen.getByText("Backup")).toBeInTheDocument();
    expect(screen.getByText("Diagnostics")).toBeInTheDocument();
    expect(screen.getByText("Language")).toBeInTheDocument();
    expect(screen.getByText("Bitcoin Core")).toBeInTheDocument();
    expect(screen.getByText("Public fallback")).toBeInTheDocument();
    expect(screen.getByText("disabled")).toBeInTheDocument();
    expect(screen.getByText("apps/api/data/wallets.enc")).toBeInTheDocument();
    expect(screen.getByText(/Runtime verification requires scripts\/check-raspi-runtime\.sh/i)).toBeInTheDocument();

    fireEvent.click(document.querySelector(".portal-modal-backdrop") as Element);
    expect(closeSpy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("opens Settings from the authenticated dashboard toolbar", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/auth/session")) {
        return jsonResponse({
          authenticated: true,
          setupComplete: true,
          user: { username: "admin" }
        });
      }
      if (url.endsWith("/api/vault/status")) {
        return jsonResponse({ autoLockMinutes: 30, initialized: true, unlocked: true, walletCount: 0 });
      }
      if (url.endsWith("/api/wallets")) {
        return jsonResponse({ wallets: [] });
      }
      if (url.endsWith("/api/status/mempool")) {
        return jsonResponse({
          cacheTtlSeconds: 30,
          mode: "local",
          status: "online",
          tipHeight: 900000,
          url: "sanitized"
        });
      }
      if (url.endsWith("/api/settings/runtime")) {
        return jsonResponse({
          apiMode: "same-origin",
          backendKind: "mempool-local",
          broadcastBackend: "disabled",
          broadcastCoreConfigured: false,
          defaultCurrency: "KRW",
          defaultNetwork: "mainnet",
          defaultUnit: "btc",
          fulcrum: { configured: false, host: null, port: 50001, tlsPort: 50002, useTls: false },
          isLocalMempool: true,
          mempoolApiHost: "localhost",
          mempoolApiUrl: "sanitized",
          mempoolWebUrl: null,
          mempoolWebUrlConfigured: false
        });
      }
      if (url.endsWith("/api/status/fulcrum")) {
        return jsonResponse({
          checkedAt: "2026-05-19T00:00:00.000Z",
          error: null,
          host: null,
          latencyMs: null,
          port: 50001,
          status: "not-configured",
          useTls: false
        });
      }
      if (url.endsWith("/api/status")) {
        return jsonResponse({ status: "ok", watchOnly: true });
      }
      if (url.endsWith("/api/market/btc-krw")) {
        return jsonResponse({
          market: "KRW-BTC",
          priceKrw: 150_000_000,
          source: "upbit",
          checkedAt: "2026-05-19T00:00:00.000Z",
          status: "online"
        });
      }
      return jsonResponse({ error: "unexpected request" }, 500);
    });

    render(<AuthShell apiUrl="" />);

    await waitFor(() => expect(document.querySelector(".dashboard-main .button-row")).not.toBeNull());
    const toolbar = document.querySelector(".dashboard-main .button-row") as HTMLElement;
    await userEvent.click(within(toolbar).getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByText("Watch-only mode enforced")).toBeInTheDocument();
  });

  it("opens Settings from the sidebar button without navigating away", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/auth/session")) {
        return jsonResponse({
          authenticated: true,
          setupComplete: true,
          user: { username: "admin" }
        });
      }
      if (url.endsWith("/api/vault/status")) {
        return jsonResponse({ autoLockMinutes: 30, initialized: true, unlocked: true, walletCount: 0 });
      }
      if (url.endsWith("/api/wallets")) {
        return jsonResponse({ wallets: [] });
      }
      if (url.endsWith("/api/status/mempool")) {
        return jsonResponse({
          cacheTtlSeconds: 30,
          mode: "local",
          status: "online",
          tipHeight: 900000,
          url: "sanitized"
        });
      }
      if (url.endsWith("/api/settings/runtime")) {
        return jsonResponse({
          apiMode: "same-origin",
          backendKind: "mempool-local",
          broadcastBackend: "disabled",
          broadcastCoreConfigured: false,
          defaultCurrency: "KRW",
          defaultNetwork: "mainnet",
          defaultUnit: "btc",
          fulcrum: { configured: false, host: null, port: 50001, tlsPort: 50002, useTls: false },
          isLocalMempool: true,
          mempoolApiHost: "localhost",
          mempoolApiUrl: "sanitized",
          mempoolWebUrl: null,
          mempoolWebUrlConfigured: false
        });
      }
      if (url.endsWith("/api/status/fulcrum")) {
        return jsonResponse({
          checkedAt: "2026-05-19T00:00:00.000Z",
          error: null,
          host: null,
          latencyMs: null,
          port: 50001,
          status: "not-configured",
          useTls: false
        });
      }
      if (url.endsWith("/api/status")) {
        return jsonResponse({ status: "ok", watchOnly: true });
      }
      if (url.endsWith("/api/market/btc-krw")) {
        return jsonResponse({
          market: "KRW-BTC",
          priceKrw: 150_000_000,
          source: "upbit",
          checkedAt: "2026-05-19T00:00:00.000Z",
          status: "online"
        });
      }
      return jsonResponse({ error: "unexpected request" }, 500);
    });

    render(<AuthShell apiUrl="" />);

    const navigation = await screen.findByLabelText("Navigation");
    await userEvent.click(within(navigation).getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    expect(window.location.hash).toBe("");
  });

  it("keeps Settings open and shows fallback status when runtime fetch fails", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/status") || url.endsWith("/api/market/btc-krw")) {
        throw new Error("network down");
      }
      return jsonResponse({ error: "unexpected request" }, 500);
    });

    render(
      <SettingsModal
        apiUrl=""
        balanceUnit="btc"
        busy={false}
        language="en"
        mempoolStatus={null}
        runtimeSettings={null}
        session={{ authenticated: true, setupComplete: true, user: { username: "admin" } }}
        showKrwEstimate={true}
        vaultStatus={{ autoLockMinutes: 30, initialized: true, unlocked: true, walletCount: 1 }}
        onBalanceUnitChange={() => undefined}
        onClose={() => undefined}
        onLanguageChange={() => undefined}
        onLockVault={async () => undefined}
        onShowKrwEstimateChange={() => undefined}
      />
    );

    expect(await screen.findByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByText("API health")).toBeInTheDocument();
    expect(screen.getAllByText("offline").length).toBeGreaterThan(0);
    expect(screen.getAllByText("unavailable").length).toBeGreaterThan(0);
  });

  it("switches Settings modal language between Korean and English with English fallback", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/status")) {
        return jsonResponse({ status: "ok" });
      }
      return jsonResponse({
        market: "KRW-BTC",
        priceKrw: null,
        source: "upbit",
        checkedAt: "2026-05-19T00:00:00.000Z",
        status: "offline"
      });
    });

    function SettingsHarness() {
      const [language, setLanguage] = useState<"en" | "ko">("en");
      return (
        <SettingsModal
          apiUrl=""
          balanceUnit="btc"
          busy={false}
          language={language}
          mempoolStatus={null}
          runtimeSettings={null}
          session={{ authenticated: true, setupComplete: true, user: { username: "admin" } }}
          showKrwEstimate={true}
          vaultStatus={{ autoLockMinutes: 30, initialized: true, unlocked: true, walletCount: 1 }}
          onBalanceUnitChange={() => undefined}
          onClose={() => undefined}
          onLanguageChange={(nextLanguage) => setLanguage(nextLanguage)}
          onLockVault={async () => undefined}
          onShowKrwEstimateChange={() => undefined}
        />
      );
    }

    render(<SettingsHarness />);

    await userEvent.click(screen.getByRole("button", { name: "한국어" }));
    expect(screen.getByRole("dialog", { name: "설정" })).toBeInTheDocument();
    expect(screen.getByText("표시")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    expect(normalizeSettingsLanguage("invalid")).toBe("en");
  });

  it("does not render sensitive runtime material in Settings", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/status")) {
        return jsonResponse({
          status: "ok",
          CORE_RPC_PASSWORD: "do-not-render",
          SESSION_SECRET: "do-not-render"
        });
      }
      return jsonResponse({
        market: "KRW-BTC",
        priceKrw: null,
        source: "upbit",
        checkedAt: "2026-05-19T00:00:00.000Z",
        status: "offline"
      });
    });

    const { container } = render(
      <SettingsModal
        apiUrl=""
        balanceUnit="btc"
        busy={false}
        language="en"
        mempoolStatus={null}
        runtimeSettings={null}
        session={{ authenticated: true, setupComplete: true, user: { username: "admin" } }}
        showKrwEstimate={true}
        vaultStatus={{ autoLockMinutes: 30, initialized: true, unlocked: true, walletCount: 1 }}
        onBalanceUnitChange={() => undefined}
        onClose={() => undefined}
        onLanguageChange={() => undefined}
        onLockVault={async () => undefined}
        onShowKrwEstimateChange={() => undefined}
      />
    );

    await screen.findByText("API health");
    expect(container.textContent).not.toContain("do-not-render");
    expect(container.textContent).not.toContain("xprv");
    expect(container.textContent).not.toContain("txHex");
    expect(container.textContent).not.toContain("SESSION_SECRET");
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

  it("selects receive index 37 after zero-balance used history through index 36 with gap limit 20", () => {
    const addresses = [
      ...Array.from({ length: 37 }, (_, index) =>
        makeAddress({
          index,
          path: `m/84'/0'/0'/0/${index}`,
          totalBalance: 0,
          usage: "used"
        })
      ),
      ...Array.from({ length: 20 }, (_, offset) => {
        const index = 37 + offset;
        return makeAddress({
          index,
          path: `m/84'/0'/0'/0/${index}`,
          usage: "unused"
        });
      })
    ];

    const selected = selectDefaultReceiveAddresses(addresses, 20);

    expect(selected.map((address) => address.index)).toEqual(Array.from({ length: 20 }, (_, offset) => 37 + offset));
    expect(selected[0]?.path).toBe("m/84'/0'/0'/0/37");
  });

  it("starts receive discovery at index 0 when no receive address has history", () => {
    const selected = selectDefaultReceiveAddresses(
      Array.from({ length: 20 }, (_, index) =>
        makeAddress({
          index,
          path: `m/84'/0'/0'/0/${index}`,
          usage: "unused"
        })
      ),
      20
    );

    expect(selected[0]?.index).toBe(0);
  });

  it("selects change display addresses without letting used empty rows consume the gap-limit slots", () => {
    const addresses = [
      ...Array.from({ length: 6 }, (_, index) =>
        makeAddress({
          chain: "change",
          index,
          path: `m/84'/0'/0'/1/${index}`,
          totalBalance: 0,
          usage: "used"
        })
      ),
      ...Array.from({ length: 20 }, (_, offset) => {
        const index = 6 + offset;
        return makeAddress({
          chain: "change",
          index,
          path: `m/84'/0'/0'/1/${index}`,
          usage: "unused"
        });
      })
    ];

    const selected = selectDefaultBranchAddresses(addresses, "change", 20, 6);

    expect(selected.map((address) => address.index)).toEqual(Array.from({ length: 20 }, (_, offset) => 6 + offset));
    expect(selected[0]?.path).toBe("m/84'/0'/0'/1/6");
    expect(selected.at(-1)?.path).toBe("m/84'/0'/0'/1/25");
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
      expect(String(input)).toContain("limit=5");
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

    expect((await screen.findAllByText(formatSecurityAddressDisplay("bc1qunused10000000000000000000000000000"))).length).toBeGreaterThan(0);
    expect(screen.getAllByText(formatSecurityAddressDisplay("bc1qunused50000000000000000000000000000")).length).toBeGreaterThan(0);
    expect(screen.queryByText("bc1qusedempty0000000000000000000000000000")).not.toBeInTheDocument();
    expect(screen.getByText(/Used empty receive addresses are hidden/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Verify this receive address on your signing device before sending large amounts/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/The browser display is not the final authority/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("#5").length).toBeGreaterThan(0);
    expect(screen.getByText("m/84'/0'/0'/0/5")).toBeInTheDocument();
  });

  it("refills visible receive rows from nextReceiveIndex before rendering change addresses", async () => {
    const wallet = makeWallet({ gapLimit: 20 });
    const fullReceiveAddresses = [
      ...Array.from({ length: 37 }, (_, index) =>
        makeAddress({
          address: `bc1qusedreceive${index.toString().padStart(2, "0")}0000000000000000000000`,
          index,
          path: `m/84'/0'/0'/0/${index}`,
          totalBalance: 0,
          usage: "used"
        })
      ),
      ...Array.from({ length: 20 }, (_, offset) => {
        const index = 37 + offset;
        return makeAddress({
          address: `bc1qunusedreceive${index.toString().padStart(2, "0")}00000000000000000000`,
          index,
          path: `m/84'/0'/0'/0/${index}`,
          usage: "unused"
        });
      })
    ];
    const partialReceiveAddresses = fullReceiveAddresses.slice(20, 40);
    const changeAddresses = Array.from({ length: 3 }, (_, index) =>
      makeAddress({
        address: `bc1qunusedchange${index.toString().padStart(2, "0")}000000000000000000000`,
        chain: "change",
        index,
        path: `m/84'/0'/0'/1/${index}`,
        usage: "unused"
      })
    );

    let requestCount = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      requestCount += 1;
      expect(String(input)).toContain(requestCount === 1 ? "limit=20" : "limit=57");
      return jsonResponse({
        addresses: [...(requestCount === 1 ? partialReceiveAddresses : fullReceiveAddresses), ...changeAddresses],
        changeBalance: { confirmedBalance: 0, totalBalance: 0, unconfirmedBalance: 0 },
        confirmedBalance: 0,
        discovery: { checkedCount: 57, complete: true, gapLimit: 20, maxDiscoveryLimit: 200 },
        failedAddresses: [],
        lookupError: null,
        nextReceiveLookupError: null,
        nextUnusedReceiveAddress: fullReceiveAddresses[37],
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

    expect((await screen.findAllByText("m/84'/0'/0'/0/37")).length).toBeGreaterThan(0);
    for (let index = 38; index <= 56; index += 1) {
      expect(screen.getByText(`m/84'/0'/0'/0/${index}`)).toBeInTheDocument();
    }
    expect(screen.queryByText("m/84'/0'/0'/0/36")).not.toBeInTheDocument();
    expect(screen.queryByText("m/84'/0'/0'/0/57")).not.toBeInTheDocument();
    expect(screen.getByText(/Used empty receive addresses are hidden/i)).toBeInTheDocument();

    const bodyText = document.body.textContent ?? "";
    expect(bodyText.indexOf("m/84'/0'/0'/0/37")).toBeLessThan(bodyText.indexOf("m/84'/0'/0'/1/0"));
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("hides used empty change rows and fills visible change rows from nextChangeIndex", async () => {
    const wallet = makeWallet({ gapLimit: 20 });
    const changeAddresses = [
      ...Array.from({ length: 6 }, (_, index) =>
        makeAddress({
          address: `bc1qusedchange${index.toString().padStart(2, "0")}00000000000000000000000`,
          chain: "change",
          index,
          path: `m/84'/0'/0'/1/${index}`,
          totalBalance: 0,
          usage: "used"
        })
      ),
      ...Array.from({ length: 20 }, (_, offset) => {
        const index = 6 + offset;
        return makeAddress({
          address: `bc1qunusedchange${index.toString().padStart(2, "0")}000000000000000000000`,
          chain: "change",
          index,
          path: `m/84'/0'/0'/1/${index}`,
          usage: "unused"
        });
      })
    ];

    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        addresses: changeAddresses,
        changeBalance: { confirmedBalance: 0, totalBalance: 0, unconfirmedBalance: 0 },
        changeDiscovery: { checkedCount: 26, complete: true, gapLimit: 20, maxDiscoveryLimit: 200 },
        confirmedBalance: 0,
        discovery: null,
        failedAddresses: [],
        lookupError: null,
        nextChangeLookupError: null,
        nextReceiveLookupError: null,
        nextUnusedChangeAddress: changeAddresses[6],
        nextUnusedReceiveAddress: null,
        receiveBalance: { confirmedBalance: 0, totalBalance: 0, unconfirmedBalance: 0 },
        status: "online",
        totalBalance: 0,
        unconfirmedBalance: 0,
        unit: "sats",
        usageStatus: "ready",
        walletId: wallet.id
      })
    );

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

    await userEvent.click(await screen.findByRole("button", { name: "Change" }));

    expect((await screen.findAllByText("m/84'/0'/0'/1/6")).length).toBeGreaterThan(0);
    for (let index = 7; index <= 25; index += 1) {
      expect(screen.getByText(`m/84'/0'/0'/1/${index}`)).toBeInTheDocument();
    }
    expect(screen.queryByText("m/84'/0'/0'/1/5")).not.toBeInTheDocument();
    expect(screen.queryByText("m/84'/0'/0'/1/26")).not.toBeInTheDocument();
    expect(screen.getByText(/Used empty change addresses are hidden/i)).toBeInTheDocument();
  });

  it("renders receive and change visible slots independently in all mode", async () => {
    const wallet = makeWallet({ gapLimit: 20 });
    const receiveAddresses = [
      ...Array.from({ length: 37 }, (_, index) =>
        makeAddress({
          address: `bc1qusedreceive${index.toString().padStart(2, "0")}0000000000000000000000`,
          index,
          path: `m/84'/0'/0'/0/${index}`,
          totalBalance: 0,
          usage: "used"
        })
      ),
      ...Array.from({ length: 20 }, (_, offset) => {
        const index = 37 + offset;
        return makeAddress({
          address: `bc1qunusedreceive${index.toString().padStart(2, "0")}00000000000000000000`,
          index,
          path: `m/84'/0'/0'/0/${index}`,
          usage: "unused"
        });
      })
    ];
    const changeAddresses = [
      ...Array.from({ length: 6 }, (_, index) =>
        makeAddress({
          address: `bc1qusedchange${index.toString().padStart(2, "0")}00000000000000000000000`,
          chain: "change",
          index,
          path: `m/84'/0'/0'/1/${index}`,
          totalBalance: 0,
          usage: "used"
        })
      ),
      ...Array.from({ length: 20 }, (_, offset) => {
        const index = 6 + offset;
        return makeAddress({
          address: `bc1qunusedchange${index.toString().padStart(2, "0")}000000000000000000000`,
          chain: "change",
          index,
          path: `m/84'/0'/0'/1/${index}`,
          usage: "unused"
        });
      })
    ];

    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        addresses: [...receiveAddresses, ...changeAddresses],
        changeBalance: { confirmedBalance: 0, totalBalance: 0, unconfirmedBalance: 0 },
        changeDiscovery: { checkedCount: 26, complete: true, gapLimit: 20, maxDiscoveryLimit: 200 },
        confirmedBalance: 0,
        discovery: { checkedCount: 57, complete: true, gapLimit: 20, maxDiscoveryLimit: 200 },
        failedAddresses: [],
        lookupError: null,
        nextChangeLookupError: null,
        nextReceiveLookupError: null,
        nextUnusedChangeAddress: changeAddresses[6],
        nextUnusedReceiveAddress: receiveAddresses[37],
        receiveBalance: { confirmedBalance: 0, totalBalance: 0, unconfirmedBalance: 0 },
        status: "online",
        totalBalance: 0,
        unconfirmedBalance: 0,
        unit: "sats",
        usageStatus: "ready",
        walletId: wallet.id
      })
    );

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

    expect((await screen.findAllByText("m/84'/0'/0'/0/37")).length).toBeGreaterThan(0);
    expect(screen.getByText("m/84'/0'/0'/0/56")).toBeInTheDocument();
    expect(screen.getByText("m/84'/0'/0'/1/6")).toBeInTheDocument();
    expect(screen.getByText("m/84'/0'/0'/1/25")).toBeInTheDocument();
    expect(screen.queryByText("m/84'/0'/0'/1/5")).not.toBeInTheDocument();

    const bodyText = document.body.textContent ?? "";
    expect(bodyText.indexOf("m/84'/0'/0'/0/37")).toBeLessThan(bodyText.indexOf("m/84'/0'/0'/1/6"));
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
