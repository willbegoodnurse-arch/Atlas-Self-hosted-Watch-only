import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AddressQrPanel, PortalModal, XpubRevealModal } from "../phase-one-auth";
import { makeAddress } from "./phase-one-auth.test-utils";

describe("portal and QR modal regression", () => {
  it("renders blocking scanner-style modal content through document.body and closes cleanly", async () => {
    const onClose = vi.fn();
    const { container } = render(
      <PortalModal ariaLabel="Scan watch-only import QR" panelClassName="scanner-dialog" onClose={onClose}>
        <p>Camera unavailable. Paste or import a file instead.</p>
      </PortalModal>
    );

    expect(screen.getByRole("dialog", { name: "Scan watch-only import QR" })).toBeInTheDocument();
    expect(document.body.querySelector(".portal-modal-root")).toBeInTheDocument();
    expect(container.querySelector(".portal-modal-root")).not.toBeInTheDocument();
    expect(document.body.querySelector(".portal-modal-backdrop")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Close Scan watch-only import QR" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders xpub reveal as a portal modal with a visible close path", async () => {
    const onClose = vi.fn();

    render(<XpubRevealModal apiUrl="" walletId="wallet-1" walletName="Coldcard Vault" onClose={onClose} />);

    expect(screen.getByRole("dialog", { name: "Reveal extended public key" })).toBeInTheDocument();
    expect(document.body.querySelector(".portal-modal-root")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps receive address QR as an inline panel, not a portal modal", () => {
    render(
      <AddressQrPanel
        address={makeAddress()}
        dataUrl="data:image/png;base64,atlas"
        error=""
        onClose={vi.fn()}
        onCopy={vi.fn()}
      />
    );

    expect(screen.getByRole("region", { name: /receive address QR/i })).toBeInTheDocument();
    expect(screen.getByAltText("Address QR code")).toBeInTheDocument();
    expect(screen.getByText(makeAddress().address)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.querySelector(".portal-modal-root")).not.toBeInTheDocument();
  });
});
