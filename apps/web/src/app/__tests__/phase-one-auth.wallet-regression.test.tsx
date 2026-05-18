import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthShell, WalletCard, WalletIdentityPanel } from "../phase-one-auth";
import { jsonResponse, makeAddress, makeWallet, silenceApiLogs } from "./phase-one-auth.test-utils";

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
});
