import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WalletCard, WalletIdentityPanel } from "../phase-one-auth";
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
  });

  it("reveals master fingerprint only after explicit click and handles missing metadata", async () => {
    const wallet = makeWallet();
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        addresses: [makeAddress()]
      })
    );

    render(<WalletIdentityPanel apiUrl="" wallet={wallet} />);

    expect(await screen.findByText("********")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reveal" }));
    expect(screen.getByText("f23a9c1d")).toBeInTheDocument();
    expect(await screen.findByText(makeAddress().address)).toBeInTheDocument();
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
    expect(screen.getByText(/Bare extended public keys usually do not include master fingerprint/i)).toBeInTheDocument();
  });
});
