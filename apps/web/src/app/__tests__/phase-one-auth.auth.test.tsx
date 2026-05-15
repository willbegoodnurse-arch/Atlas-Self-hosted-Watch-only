import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthShell } from "../phase-one-auth";
import { jsonResponse, silenceApiLogs } from "./phase-one-auth.test-utils";

describe("AuthShell regression", () => {
  beforeEach(() => {
    silenceApiLogs();
  });

  it("renders setup/login UI without persisting wallet metadata in browser storage", async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        authenticated: false,
        setupComplete: false,
        user: null
      })
    );

    render(<AuthShell apiUrl="" />);

    expect(await screen.findByRole("heading", { name: "Secure access" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign up/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("shows a useful API fallback instead of a blank screen when session fetch fails", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    });

    render(<AuthShell apiUrl="" />);

    expect(await screen.findByRole("heading", { name: "Secure access" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/API unavailable/i)).toBeInTheDocument();
    });
  });
});
