"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import type { IScannerControls } from "@zxing/browser";

type SessionResponse = {
  authenticated: boolean;
  setupComplete: boolean;
  user: {
    username: string;
  } | null;
};

type SetupResponse = {
  setupComplete: boolean;
  twoFactorEnabled: boolean;
  otpauthUrl: string;
  qrCodeDataUrl: string;
};

type VaultStatus = {
  initialized: boolean;
  unlocked: boolean;
  walletCount: number | null;
};

type WalletRecord = {
  id: string;
  name: string;
  extendedPublicKey: string;
  type: "xpub" | "ypub" | "zpub";
  network: "mainnet" | "testnet" | "signet";
  scriptType: "p2pkh" | "p2sh-p2wpkh" | "p2wpkh";
  derivationPath: string;
  gapLimit: number;
  createdAt: string;
  updatedAt: string;
};

type DerivedAddress = {
  chain: "receive" | "change";
  index: number;
  path: string;
  address: string;
  usage: "used" | "unused" | "unknown";
  txCount?: number | null;
  confirmedTxCount?: number | null;
  mempoolTxCount?: number | null;
  confirmedBalance?: number | null;
  unconfirmedBalance?: number | null;
  totalBalance?: number | null;
};

type BalanceSummary = {
  confirmedBalance: number;
  unconfirmedBalance: number;
  totalBalance: number;
};

type WalletBalanceResponse = {
  walletId: string;
  network: WalletRecord["network"];
  scriptType: WalletRecord["scriptType"];
  usageStatus: "unknown" | "partial" | "ready";
  unit: "sats";
  confirmedBalance: number;
  unconfirmedBalance: number;
  totalBalance: number;
  receiveBalance?: BalanceSummary;
  changeBalance?: BalanceSummary;
  addresses: DerivedAddress[];
  nextUnusedReceiveAddress?: DerivedAddress | null;
  lookupError?: string | null;
  discovery?: {
    checkedCount: number;
    gapLimit: number;
    maxDiscoveryLimit: number;
    complete: boolean;
  } | null;
  mempool?: {
    mode: string;
    url: string;
    lookupFailed?: boolean;
  };
};

type MempoolStatusResponse = {
  status: "online" | "offline";
  mode: string;
  url: string;
  tipHeight: number | null;
  cacheTtlSeconds: number;
};

type ViewState = "loading" | "setup" | "verify-totp" | "login" | "dashboard";
type AuthMode = "signup" | "signin";
type StatusKind = "online" | "locked" | "degraded" | "offline";

type AuthShellProps = {
  apiUrl: string;
  initialWalletId?: string | null;
};

export function AuthShell({ apiUrl, initialWalletId = null }: AuthShellProps) {
  const [view, setView] = useState<ViewState>("loading");
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("signup");
  const [message, setMessage] = useState("");
  const [setupUsername, setSetupUsername] = useState("admin");
  const [setupPassword, setSetupPassword] = useState("");
  const [setupPasswordConfirm, setSetupPasswordConfirm] = useState("");
  const [setupTotpCode, setSetupTotpCode] = useState("");
  const [setupQr, setSetupQr] = useState<SetupResponse | null>(null);
  const [loginUsername, setLoginUsername] = useState("admin");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginTotpCode, setLoginTotpCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refreshSession();
  }, []);

  async function refreshSession() {
    setView("loading");
    setMessage("");

    try {
      const nextSession = await apiRequest<SessionResponse>(apiUrl, "/api/auth/session");
      setSession(nextSession);

      if (nextSession.authenticated) {
        setView("dashboard");
      } else if (nextSession.setupComplete) {
        setAuthMode("signin");
        setView("login");
      } else {
        setAuthMode("signup");
        setView("setup");
      }
    } catch (error) {
      console.error("watch wallet session request failed", {
        url: buildApiUrl(apiUrl, "/api/auth/session"),
        error
      });
      setMessage(error instanceof Error ? error.message : "Unable to reach the API");
      setAuthMode("signup");
      setView("setup");
    }
  }

  function showSignup() {
    setMessage("");
    setAuthMode("signup");
    setView("setup");
  }

  function showSignin() {
    setMessage("");
    setAuthMode("signin");
    setView("login");
  }

  async function handleSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const response = await apiRequest<SetupResponse>(apiUrl, "/api/auth/setup", {
        method: "POST",
        body: JSON.stringify({
          username: setupUsername,
          password: setupPassword,
          passwordConfirm: setupPasswordConfirm
        })
      });
      setSetupQr(response);
      setView("verify-totp");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const nextSession = await apiRequest<SessionResponse>(apiUrl, "/api/auth/totp/verify", {
        method: "POST",
        body: JSON.stringify({
          username: setupUsername,
          password: setupPassword,
          totpCode: setupTotpCode
        })
      });
      setSession(nextSession);
      setSetupPassword("");
      setSetupPasswordConfirm("");
      setSetupTotpCode("");
      setView("dashboard");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "TOTP verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const nextSession = await apiRequest<SessionResponse>(apiUrl, "/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: loginUsername,
          password: loginPassword,
          totpCode: loginTotpCode
        })
      });
      setSession(nextSession);
      setLoginPassword("");
      setLoginTotpCode("");
      setView("dashboard");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    setMessage("");

    try {
      await apiRequest(apiUrl, "/api/vault/lock", {
        method: "POST"
      }).catch(() => undefined);
      await apiRequest(apiUrl, "/api/auth/logout", {
        method: "POST"
      });
      setSession(null);
      setView("login");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Logout failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <section className={view === "dashboard" ? "auth-panel app-panel" : "auth-panel"}>
        <div className="brand-row">
          <div>
            <p className="eyebrow">watch wallet</p>
            <h1>{view === "dashboard" ? (initialWalletId ? "Wallet detail" : "Wallets") : "Secure access"}</h1>
          </div>
          <span className="phase-pill">{view === "dashboard" ? "PHASE 6" : "AUTH NODE"}</span>
        </div>

        {message ? <p className="status-message">{message}</p> : null}
        <p className="api-diagnostic">API: {apiUrl}</p>
        {view !== "loading" ? (
          <p className="terminal-mantra">Self-hosted watch-only Bitcoin terminal. We are all Satoshi.</p>
        ) : null}

        {view === "loading" ? <p className="muted">Checking session...</p> : null}
        {view === "setup" || view === "login" ? (
          <AuthModeSwitch mode={authMode} onSignin={showSignin} onSignup={showSignup} />
        ) : null}
        {view === "setup" ? (
          <SetupForm
            busy={busy}
            username={setupUsername}
            password={setupPassword}
            passwordConfirm={setupPasswordConfirm}
            onSubmit={handleSetup}
            setUsername={setSetupUsername}
            setPassword={setSetupPassword}
            setPasswordConfirm={setSetupPasswordConfirm}
          />
        ) : null}
        {view === "verify-totp" ? (
          <TotpVerifyForm
            busy={busy}
            qr={setupQr}
            code={setupTotpCode}
            onSubmit={handleVerifyTotp}
            setCode={setSetupTotpCode}
          />
        ) : null}
        {view === "login" ? (
          <LoginForm
            busy={busy}
            username={loginUsername}
            password={loginPassword}
            totpCode={loginTotpCode}
            onSubmit={handleLogin}
            setUsername={setLoginUsername}
            setPassword={setLoginPassword}
            setTotpCode={setLoginTotpCode}
          />
        ) : null}
        {view === "dashboard" ? (
          <DashboardShell
            apiUrl={apiUrl}
            busy={busy}
            initialWalletId={initialWalletId}
            session={session}
            onLogout={handleLogout}
          />
        ) : null}
      </section>
    </main>
  );
}

function AuthModeSwitch({
  mode,
  onSignin,
  onSignup
}: {
  mode: AuthMode;
  onSignin: () => void;
  onSignup: () => void;
}) {
  return (
    <div className="auth-mode-switch">
      <button
        className={mode === "signup" ? "compact-button" : "secondary-button compact-button"}
        type="button"
        onClick={onSignup}
      >
        Sign up
      </button>
      <button
        className={mode === "signin" ? "compact-button" : "secondary-button compact-button"}
        type="button"
        onClick={onSignin}
      >
        Sign in
      </button>
    </div>
  );
}

function StatusBadge({
  label,
  status
}: {
  label: string;
  status: StatusKind;
}) {
  return <span className={`status-badge status-${status}`}>[{label}: {status.toUpperCase()}]</span>;
}

function TerminalSkeleton({ label, rows }: { label: string; rows: number }) {
  return (
    <div className="terminal-panel skeleton-panel" aria-busy="true">
      <p className="terminal-heading">&gt; {label}</p>
      {Array.from({ length: rows }, (_, index) => (
        <span className="skeleton-line" key={index} />
      ))}
    </div>
  );
}

function SetupForm({
  busy,
  username,
  password,
  passwordConfirm,
  onSubmit,
  setUsername,
  setPassword,
  setPasswordConfirm
}: {
  busy: boolean;
  username: string;
  password: string;
  passwordConfirm: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  setUsername: (value: string) => void;
  setPassword: (value: string) => void;
  setPasswordConfirm: (value: string) => void;
}) {
  return (
    <form className="form-stack" onSubmit={onSubmit}>
      <label>
        <span>Username</span>
        <input
          autoComplete="username"
          minLength={3}
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </label>
      <label>
        <span>Password</span>
        <input
          autoComplete="new-password"
          minLength={12}
          required
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <label>
        <span>Confirm password</span>
        <input
          autoComplete="new-password"
          minLength={12}
          required
          type="password"
          value={passwordConfirm}
          onChange={(event) => setPasswordConfirm(event.target.value)}
        />
      </label>
      <button disabled={busy} type="submit">
        Create admin
      </button>
    </form>
  );
}

function TotpVerifyForm({
  busy,
  qr,
  code,
  onSubmit,
  setCode
}: {
  busy: boolean;
  qr: SetupResponse | null;
  code: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  setCode: (value: string) => void;
}) {
  return (
    <form className="form-stack" onSubmit={onSubmit}>
      {qr ? (
        <div className="qr-box">
          <img alt="TOTP setup QR code" height={240} src={qr.qrCodeDataUrl} width={240} />
        </div>
      ) : null}
      <label>
        <span>6-digit code</span>
        <input
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={6}
          minLength={6}
          pattern="[0-9]{6}"
          required
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
      </label>
      <button disabled={busy} type="submit">
        Verify TOTP
      </button>
    </form>
  );
}

function LoginForm({
  busy,
  username,
  password,
  totpCode,
  onSubmit,
  setUsername,
  setPassword,
  setTotpCode
}: {
  busy: boolean;
  username: string;
  password: string;
  totpCode: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  setUsername: (value: string) => void;
  setPassword: (value: string) => void;
  setTotpCode: (value: string) => void;
}) {
  return (
    <form className="form-stack" onSubmit={onSubmit}>
      <label>
        <span>Username</span>
        <input
          autoComplete="username"
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </label>
      <label>
        <span>Password</span>
        <input
          autoComplete="current-password"
          required
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <label>
        <span>TOTP code</span>
        <input
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={6}
          minLength={6}
          pattern="[0-9]{6}"
          required
          value={totpCode}
          onChange={(event) => setTotpCode(event.target.value)}
        />
      </label>
      <button disabled={busy} type="submit">
        Log in
      </button>
    </form>
  );
}

function DashboardShell({
  apiUrl,
  busy,
  initialWalletId,
  session,
  onLogout
}: {
  apiUrl: string;
  busy: boolean;
  initialWalletId?: string | null;
  session: SessionResponse | null;
  onLogout: () => void;
}) {
  return (
    <div className="dashboard-shell">
      <div className="toolbar-row">
        <p className="muted">Signed in as {session?.user?.username ?? "admin"}</p>
        <div className="button-row">
          {initialWalletId ? (
            <a className="secondary-button compact-button" href="/">
              Back to dashboard
            </a>
          ) : null}
          <button className="secondary-button compact-button" disabled={busy} type="button" onClick={onLogout}>
            Log out
          </button>
        </div>
      </div>
      <VaultWorkspace apiUrl={apiUrl} initialWalletId={initialWalletId} />
    </div>
  );
}

function VaultWorkspace({ apiUrl, initialWalletId = null }: { apiUrl: string; initialWalletId?: string | null }) {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [mempoolStatus, setMempoolStatus] = useState<MempoolStatusResponse | null>(null);
  const [mempoolStatusError, setMempoolStatusError] = useState("");
  const [wallets, setWallets] = useState<WalletRecord[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const detailWalletId = initialWalletId ? decodeURIComponent(initialWalletId) : null;

  useEffect(() => {
    void refreshVault();
  }, []);

  async function refreshVault() {
    setMessage("");

    try {
      void refreshMempoolStatus();
      const nextStatus = await apiRequest<VaultStatus>(apiUrl, "/api/vault/status");
      setStatus(nextStatus);
      if (nextStatus.unlocked) {
        const response = await apiRequest<{ wallets: WalletRecord[] }>(apiUrl, "/api/wallets");
        setWallets(response.wallets);
      } else {
        setWallets([]);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load vault");
    }
  }

  async function refreshMempoolStatus() {
    try {
      const response = await apiRequest<MempoolStatusResponse>(apiUrl, "/api/status/mempool");
      setMempoolStatus(response);
      setMempoolStatusError("");
    } catch (error) {
      setMempoolStatus(null);
      setMempoolStatusError(error instanceof Error ? error.message : "Mempool status unavailable");
    }
  }

  async function handleInit(vaultPassword: string) {
    setBusy(true);
    setMessage("");

    try {
      const nextStatus = await apiRequest<VaultStatus>(apiUrl, "/api/vault/init", {
        method: "POST",
        body: JSON.stringify({ vaultPassword })
      });
      setStatus(nextStatus);
      setWallets([]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Vault initialization failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlock(vaultPassword: string) {
    setBusy(true);
    setMessage("");

    try {
      await apiRequest<VaultStatus>(apiUrl, "/api/vault/unlock", {
        method: "POST",
        body: JSON.stringify({ vaultPassword })
      });
      await refreshVault();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Vault unlock failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleLock() {
    setBusy(true);
    setMessage("");

    try {
      const nextStatus = await apiRequest<VaultStatus>(apiUrl, "/api/vault/lock", {
        method: "POST"
      });
      setStatus(nextStatus);
      setWallets([]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Vault lock failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateWallet(input: {
    name: string;
    extendedPublicKey: string;
    network: WalletRecord["network"];
    gapLimit: number;
  }) {
    setBusy(true);
    setMessage("");

    try {
      const response = await apiRequest<{ wallet: WalletRecord }>(apiUrl, "/api/wallets", {
        method: "POST",
        body: JSON.stringify(input)
      });
      setWallets((current) => [...current, response.wallet]);
      setStatus((current) =>
        current ? { ...current, walletCount: (current.walletCount ?? 0) + 1 } : current
      );
      await refreshVault();
      setMessage("Wallet saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet registration failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateWallet(id: string, input: { name: string; gapLimit: number }) {
    setBusy(true);
    setMessage("");

    try {
      const response = await apiRequest<{ wallet: WalletRecord }>(apiUrl, `/api/wallets/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input)
      });
      setWallets((current) =>
        current.map((wallet) => (wallet.id === response.wallet.id ? response.wallet : wallet))
      );
      await refreshVault();
      setMessage("Wallet updated");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet update failed");
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteWallet(id: string) {
    setBusy(true);
    setMessage("");

    try {
      await apiRequest(apiUrl, `/api/wallets/${id}`, {
        method: "DELETE"
      });
      setWallets((current) => current.filter((wallet) => wallet.id !== id));
      setStatus((current) =>
        current ? { ...current, walletCount: Math.max((current.walletCount ?? 1) - 1, 0) } : current
      );
      await refreshVault();
      setMessage("Wallet deleted");
      if (detailWalletId === id) {
        window.location.assign("/");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet delete failed");
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return <TerminalSkeleton label="LOADING VAULT" rows={3} />;
  }

  const detailWallet =
    detailWalletId ? wallets.find((wallet) => wallet.id === detailWalletId) ?? null : null;
  const vaultBadgeStatus: StatusKind = status.unlocked ? "online" : status.initialized ? "locked" : "offline";
  const mempoolBadgeStatus: StatusKind =
    mempoolStatus?.status === "online" ? "online" : mempoolStatusError ? "offline" : "degraded";

  return (
    <div className="vault-workspace">
      {message ? <p className="status-message">{message}</p> : null}
      <div className="terminal-statusline">
        <StatusBadge label="VAULT" status={vaultBadgeStatus} />
        <StatusBadge label="MEMPOOL" status={mempoolBadgeStatus} />
        <span className="terminal-meta">mode: {mempoolStatus?.mode ?? "mempool"}</span>
        <span className="terminal-meta">
          tip: {mempoolStatus?.tipHeight ? new Intl.NumberFormat("en-US").format(mempoolStatus.tipHeight) : "unknown"}
        </span>
      </div>
      <div className="vault-status terminal-panel">
        <div>
          <dt>Vault</dt>
          <dd>{status.initialized ? (status.unlocked ? "Unlocked" : "Locked") : "Not initialized"}</dd>
        </div>
        <div>
          <dt>Stored wallets</dt>
          <dd>{status.walletCount ?? "Hidden"}</dd>
        </div>
        {status.unlocked ? (
          <button className="secondary-button compact-button" disabled={busy} type="button" onClick={handleLock}>
            Lock vault
          </button>
        ) : null}
      </div>

      {!status.initialized ? <VaultInitForm busy={busy} onSubmit={handleInit} /> : null}
      {status.initialized && !status.unlocked ? (
        <VaultUnlockForm busy={busy} onSubmit={handleUnlock} />
      ) : null}
      {status.initialized && status.unlocked ? (
        detailWalletId ? (
          detailWallet ? (
            <WalletDetailView apiUrl={apiUrl} wallet={detailWallet} />
          ) : (
            <div className="terminal-panel empty-state">
              <p className="terminal-heading">&gt; WALLET NOT FOUND</p>
              <p className="muted">This vault does not contain the requested wallet.</p>
              <a className="secondary-button compact-button" href="/">
                Back to dashboard
              </a>
            </div>
          )
        ) : (
        <>
          <WalletCreateForm busy={busy} onSubmit={handleCreateWallet} />
          <WalletList
            apiUrl={apiUrl}
            busy={busy}
            mempoolBadgeStatus={mempoolBadgeStatus}
            vaultBadgeStatus={vaultBadgeStatus}
            wallets={wallets}
            onDelete={handleDeleteWallet}
            onUpdate={handleUpdateWallet}
          />
        </>
        )
      ) : null}
    </div>
  );
}

function VaultInitForm({
  busy,
  onSubmit
}: {
  busy: boolean;
  onSubmit: (vaultPassword: string) => void;
}) {
  const [vaultPassword, setVaultPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localMessage, setLocalMessage] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (vaultPassword !== confirmPassword) {
      setLocalMessage("Vault passwords do not match");
      return;
    }

    setLocalMessage("");
    onSubmit(vaultPassword);
    setVaultPassword("");
    setConfirmPassword("");
  }

  return (
    <form className="form-stack vault-section" onSubmit={handleSubmit}>
      <h2>Initialize vault</h2>
      {localMessage ? <p className="status-message">{localMessage}</p> : null}
      <label>
        <span>Vault password</span>
        <input
          autoComplete="new-password"
          minLength={12}
          required
          type="password"
          value={vaultPassword}
          onChange={(event) => setVaultPassword(event.target.value)}
        />
      </label>
      <label>
        <span>Confirm vault password</span>
        <input
          autoComplete="new-password"
          minLength={12}
          required
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
      </label>
      <button disabled={busy} type="submit">
        Create encrypted vault
      </button>
    </form>
  );
}

function VaultUnlockForm({
  busy,
  onSubmit
}: {
  busy: boolean;
  onSubmit: (vaultPassword: string) => void;
}) {
  const [vaultPassword, setVaultPassword] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(vaultPassword);
    setVaultPassword("");
  }

  return (
    <form className="form-stack vault-section" onSubmit={handleSubmit}>
      <h2>Unlock vault</h2>
      <label>
        <span>Vault password</span>
        <input
          autoComplete="current-password"
          minLength={12}
          required
          type="password"
          value={vaultPassword}
          onChange={(event) => setVaultPassword(event.target.value)}
        />
      </label>
      <button disabled={busy} type="submit">
        Unlock
      </button>
    </form>
  );
}

function WalletCreateForm({
  busy,
  onSubmit
}: {
  busy: boolean;
  onSubmit: (input: {
    name: string;
    extendedPublicKey: string;
    network: WalletRecord["network"];
    gapLimit: number;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [extendedPublicKey, setExtendedPublicKey] = useState("");
  const [network, setNetwork] = useState<WalletRecord["network"]>("mainnet");
  const [gapLimit, setGapLimit] = useState(20);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerMessage, setScannerMessage] = useState("");
  const scannerControls = useRef<IScannerControls | null>(null);
  const scannerVideo = useRef<HTMLVideoElement | null>(null);
  const detected = useMemo(() => detectWalletMetadata(extendedPublicKey, network), [
    extendedPublicKey,
    network
  ]);

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({
      name,
      extendedPublicKey,
      network,
      gapLimit
    });
    setName("");
    setExtendedPublicKey("");
    setGapLimit(20);
  }

  async function startScanner() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerMessage("Camera access is not available in this browser.");
      setScannerOpen(true);
      return;
    }

    stopScanner();
    setScannerOpen(true);
    setScannerMessage("Starting camera...");

    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader();
      scannerControls.current = await reader.decodeFromVideoDevice(
        undefined,
        scannerVideo.current ?? undefined,
        (result) => {
          if (!result) {
            return;
          }

          const scannedKey = extractExtendedPublicKey(result.getText());
          if (!scannedKey) {
            setScannerMessage("QR did not contain a valid xpub, ypub, or zpub.");
            return;
          }

          setExtendedPublicKey(scannedKey);
          setScannerMessage("Extended public key scanned.");
          stopScanner();
          setScannerOpen(false);
        }
      );
      setScannerMessage("Point the camera at an xpub, ypub, or zpub QR.");
    } catch (error) {
      stopScanner();
      setScannerMessage(error instanceof Error ? error.message : "Unable to start QR scanner.");
    }
  }

  function stopScanner() {
    scannerControls.current?.stop();
    scannerControls.current = null;
    const stream = scannerVideo.current?.srcObject;
    if (stream instanceof MediaStream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (scannerVideo.current) {
      scannerVideo.current.srcObject = null;
    }
  }

  function closeScanner() {
    stopScanner();
    setScannerOpen(false);
  }

  return (
    <form className="form-stack vault-section" onSubmit={handleSubmit}>
      <h2>Register wallet</h2>
      <div className="form-grid">
        <label>
          <span>Wallet name</span>
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          <span>Network</span>
          <select
            value={network}
            onChange={(event) => setNetwork(event.target.value as WalletRecord["network"])}
          >
            <option value="mainnet">mainnet</option>
            <option value="testnet">testnet</option>
            <option value="signet">signet</option>
          </select>
        </label>
      </div>
      <label>
        <span className="field-header">
          <span>Extended public key</span>
          <button
            className="secondary-button compact-button"
            type="button"
            onClick={() => void startScanner()}
          >
            Scan QR
          </button>
        </span>
        <input
          autoComplete="off"
          required
          spellCheck={false}
          value={extendedPublicKey}
          onChange={(event) => setExtendedPublicKey(event.target.value)}
        />
      </label>
      <div className="form-grid">
        <label>
          <span>Detected type</span>
          <input readOnly value={detected?.type ?? "Waiting for xpub, ypub, or zpub"} />
        </label>
        <label>
          <span>Derivation path</span>
          <input readOnly value={detected?.derivationPath ?? ""} />
        </label>
        <label>
          <span>Script type</span>
          <input readOnly value={detected?.scriptType ?? ""} />
        </label>
        <label>
          <span>Gap limit</span>
          <input
            max={200}
            min={1}
            required
            type="number"
            value={gapLimit}
            onChange={(event) => setGapLimit(Number(event.target.value))}
          />
        </label>
      </div>
      <button disabled={busy || !detected} type="submit">
        Save wallet
      </button>
      {scannerOpen ? (
        <div className="qr-modal" role="dialog" aria-modal="true">
          <div className="qr-dialog scanner-dialog">
            <div className="wallet-card-header">
              <h2>Scan QR</h2>
              <button className="secondary-button compact-button" type="button" onClick={closeScanner}>
                Close
              </button>
            </div>
            <video ref={scannerVideo} className="scanner-video" muted playsInline />
            {scannerMessage ? <p className="muted">{scannerMessage}</p> : null}
          </div>
        </div>
      ) : null}
    </form>
  );
}

function WalletList({
  apiUrl,
  busy,
  mempoolBadgeStatus,
  vaultBadgeStatus,
  wallets,
  onDelete,
  onUpdate
}: {
  apiUrl: string;
  busy: boolean;
  mempoolBadgeStatus: StatusKind;
  vaultBadgeStatus: StatusKind;
  wallets: WalletRecord[];
  onDelete: (id: string) => Promise<void>;
  onUpdate: (id: string, input: { name: string; gapLimit: number }) => Promise<void>;
}) {
  if (wallets.length === 0) {
    return (
      <div className="terminal-panel empty-state">
        <p className="terminal-heading">&gt; WALLET SET EMPTY</p>
        <p className="muted">Register an xpub, ypub, or zpub to begin watch-only monitoring.</p>
        <p className="terminal-mantra">Self-hosted watch-only Bitcoin terminal. We are all Satoshi.</p>
      </div>
    );
  }

  return (
    <div className="wallet-list">
      {wallets.map((wallet) => (
        <WalletCard
          apiUrl={apiUrl}
          busy={busy}
          key={wallet.id}
          mempoolBadgeStatus={mempoolBadgeStatus}
          vaultBadgeStatus={vaultBadgeStatus}
          wallet={wallet}
          onDelete={onDelete}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  );
}

function WalletCard({
  apiUrl,
  busy,
  mempoolBadgeStatus,
  vaultBadgeStatus,
  wallet,
  onDelete,
  onUpdate
}: {
  apiUrl: string;
  busy: boolean;
  mempoolBadgeStatus: StatusKind;
  vaultBadgeStatus: StatusKind;
  wallet: WalletRecord;
  onDelete: (id: string) => Promise<void>;
  onUpdate: (id: string, input: { name: string; gapLimit: number }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [miniBalance, setMiniBalance] = useState<BalanceSummary | null>(null);
  const [miniBalanceStatus, setMiniBalanceStatus] = useState<"loading" | "ready" | "degraded" | "offline">("loading");
  const [name, setName] = useState(wallet.name);
  const [gapLimit, setGapLimit] = useState(wallet.gapLimit);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setName(wallet.name);
    setGapLimit(wallet.gapLimit);
  }, [wallet.name, wallet.gapLimit]);

  useEffect(() => {
    let cancelled = false;
    setMiniBalanceStatus("loading");
    void apiRequest<WalletBalanceResponse>(
      apiUrl,
      `/api/wallets/${wallet.id}/balance?chain=both&limit=${wallet.gapLimit}`
    )
      .then((response) => {
        if (cancelled) {
          return;
        }
        setMiniBalance({
          confirmedBalance: response.confirmedBalance,
          unconfirmedBalance: response.unconfirmedBalance,
          totalBalance: response.totalBalance
        });
        setMiniBalanceStatus(response.lookupError ? "degraded" : "ready");
      })
      .catch(() => {
        if (!cancelled) {
          setMiniBalance(null);
          setMiniBalanceStatus("offline");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiUrl, wallet.id, wallet.gapLimit]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await onUpdate(wallet.id, { name, gapLimit });
      setEditing(false);
    } catch {
      // The parent component displays the API error.
    }
  }

  const walletHref = `/wallets/${encodeURIComponent(wallet.id)}`;
  const balanceBadgeStatus: StatusKind =
    miniBalanceStatus === "ready" ? "online" : miniBalanceStatus === "offline" ? "offline" : "degraded";

  return (
    <article className="wallet-card">
      <div className="wallet-card-header">
        <div>
          <div className="terminal-statusline card-statusline">
            <StatusBadge label="VAULT" status={vaultBadgeStatus} />
            <StatusBadge label="MEMPOOL" status={mempoolBadgeStatus} />
            <StatusBadge label="BALANCE" status={balanceBadgeStatus} />
          </div>
          <h2>
            <a className="wallet-title-link" href={walletHref}>
              {wallet.name}
            </a>
          </h2>
          <p className="muted">
            {wallet.network} / {wallet.type} / {wallet.scriptType}
          </p>
        </div>
        <div className="button-row">
          <button
            className="secondary-button compact-button"
            type="button"
            onClick={() => {
              window.location.assign(walletHref);
            }}
          >
            View detail
          </button>
          <button
            className="secondary-button compact-button"
            type="button"
            onClick={() => setEditing((current) => !current)}
          >
            {editing ? "Cancel" : "Edit"}
          </button>
          <button
            className="danger-button compact-button"
            disabled={busy}
            type="button"
            onClick={() => void onDelete(wallet.id)}
          >
            Delete
          </button>
        </div>
      </div>

      {editing ? (
        <form className="form-grid edit-grid" onSubmit={handleSubmit}>
          <label>
            <span>Wallet name</span>
            <input required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            <span>Gap limit</span>
            <input
              max={200}
              min={1}
              required
              type="number"
              value={gapLimit}
              onChange={(event) => setGapLimit(Number(event.target.value))}
            />
          </label>
          <button disabled={busy} type="submit">
            Save changes
          </button>
        </form>
      ) : null}

      <dl className="wallet-mini-balance">
        <div>
          <dt>Total</dt>
          <dd>
            {miniBalanceStatus === "loading"
              ? "syncing..."
              : formatBalance(miniBalance?.totalBalance ?? 0, "sats")}
          </dd>
        </div>
        <div>
          <dt>Confirmed</dt>
          <dd>
            {miniBalanceStatus === "loading"
              ? "..."
              : formatBalance(miniBalance?.confirmedBalance ?? 0, "sats")}
          </dd>
        </div>
        <div>
          <dt>Unconfirmed</dt>
          <dd>
            {miniBalanceStatus === "loading"
              ? "..."
              : formatBalance(miniBalance?.unconfirmedBalance ?? 0, "sats")}
          </dd>
        </div>
      </dl>

      <dl className="wallet-details">
        <div>
          <dt>Derivation path</dt>
          <dd>{wallet.derivationPath}</dd>
        </div>
        <div>
          <dt>Gap limit</dt>
          <dd>{wallet.gapLimit}</dd>
        </div>
        <div>
          <dt>Extended public key</dt>
          <dd className="key-row">
            <code>{revealed ? wallet.extendedPublicKey : maskExtendedPublicKey(wallet.extendedPublicKey)}</code>
            <button className="secondary-button compact-button" type="button" onClick={() => setRevealed(!revealed)}>
              {revealed ? "Hide" : "Show"}
            </button>
            <button
              className="secondary-button compact-button"
              type="button"
              onClick={() => void navigator.clipboard.writeText(wallet.extendedPublicKey)}
            >
              Copy
            </button>
          </dd>
        </div>
      </dl>
    </article>
  );
}

function WalletDetailView({ apiUrl, wallet }: { apiUrl: string; wallet: WalletRecord }) {
  return (
    <div className="wallet-detail-page">
      <div className="wallet-detail-header terminal-panel">
        <div>
          <p className="terminal-heading">&gt; WALLET CONTEXT</p>
          <h2>{wallet.name}</h2>
          <div className="terminal-statusline">
            <span className="phase-pill">{wallet.type.toUpperCase()}</span>
            <span className="terminal-meta">network: {wallet.network}</span>
            <span className="terminal-meta">script: {wallet.scriptType}</span>
            <span className="terminal-meta">path: {wallet.derivationPath}</span>
          </div>
        </div>
      </div>
      <WalletAddressPanel apiUrl={apiUrl} wallet={wallet} />
    </div>
  );
}

function WalletAddressPanel({
  apiUrl,
  wallet
}: {
  apiUrl: string;
  wallet: WalletRecord;
}) {
  const [chain, setChain] = useState<"both" | "receive" | "change">("both");
  const [usageTab, setUsageTab] = useState<"all" | "used" | "unused" | "unknown">("all");
  const [addresses, setAddresses] = useState<DerivedAddress[]>([]);
  const [nextReceiveAddress, setNextReceiveAddress] = useState<DerivedAddress | null>(null);
  const [balance, setBalance] = useState<BalanceSummary | null>(null);
  const [receiveBalance, setReceiveBalance] = useState<BalanceSummary | null>(null);
  const [changeBalance, setChangeBalance] = useState<BalanceSummary | null>(null);
  const [balanceUnit, setBalanceUnit] = useState<"sats" | "btc">("sats");
  const [usageLookupNote, setUsageLookupNote] = useState("");
  const [message, setMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [qrAddress, setQrAddress] = useState<DerivedAddress | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    void refreshAddresses();
  }, [wallet.id, chain]);

  useEffect(() => {
    if (!qrAddress) {
      setQrDataUrl("");
      return;
    }

    let cancelled = false;
    void QRCode.toDataURL(qrAddress.address, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 240
    }).then((dataUrl) => {
      if (!cancelled) {
        setQrDataUrl(dataUrl);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [qrAddress]);

  async function refreshAddresses() {
    setLoading(true);
    setMessage("");
    setCopyMessage("");

    try {
      const response = await apiRequest<WalletBalanceResponse>(
        apiUrl,
        `/api/wallets/${wallet.id}/balance?chain=${chain}&limit=${wallet.gapLimit}`
      );
      setAddresses(response.addresses);
      setNextReceiveAddress(response.nextUnusedReceiveAddress ?? null);
      setBalance({
        confirmedBalance: response.confirmedBalance,
        unconfirmedBalance: response.unconfirmedBalance,
        totalBalance: response.totalBalance
      });
      setReceiveBalance(response.receiveBalance ?? null);
      setChangeBalance(response.changeBalance ?? null);
      setUsageLookupNote(response.lookupError ?? "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to look up wallet balance");
      setAddresses([]);
      setNextReceiveAddress(null);
      setBalance(null);
      setReceiveBalance(null);
      setChangeBalance(null);
      setUsageLookupNote("");
    } finally {
      setLoading(false);
    }
  }

  async function copyAddress(address: DerivedAddress) {
    try {
      await navigator.clipboard.writeText(address.address);
      setCopyMessage(`Copied ${address.chain} address from ${wallet.name}`);
    } catch {
      setCopyMessage(`Unable to copy ${address.chain} address from ${wallet.name}`);
    }
  }

  const visibleAddresses =
    usageTab === "all"
      ? addresses
      : addresses.filter((address) => address.usage === usageTab);
  const receiveAddresses = visibleAddresses.filter((address) => address.chain === "receive");
  const changeAddresses = visibleAddresses.filter((address) => address.chain === "change");
  const unknownAddressCount = addresses.filter((address) => address.usage === "unknown").length;
  const usageLookupFailed = Boolean(usageLookupNote) || unknownAddressCount === addresses.length && addresses.length > 0;
  const mempoolBadgeStatus = usageLookupFailed ? "degraded" : loading ? "degraded" : "online";
  const emptyUsageMessage = getEmptyUsageMessage({
    usageTab,
    usageLookupFailed,
    unknownAddressCount
  });

  return (
    <section className="wallet-address-panel">
      <div className="wallet-card-header">
        <div>
          <p className="terminal-heading">&gt; ADDRESS SET</p>
          <h2>{wallet.name}</h2>
          <p className="muted technical-line">
            path: {wallet.derivationPath}/* / network: {wallet.network} / unit: {balanceUnit}
          </p>
        </div>
        <button className="secondary-button compact-button" type="button" onClick={() => void refreshAddresses()}>
          Refresh
        </button>
      </div>
      <div className="terminal-statusline">
        <StatusBadge label="MEMPOOL" status={mempoolBadgeStatus} />
        <StatusBadge label="BALANCE" status={message ? "offline" : usageLookupFailed ? "degraded" : "online"} />
        <span className="terminal-meta">unknown excluded from totals</span>
      </div>

      {message ? <p className="status-message">{message}</p> : null}
      {copyMessage ? <p className="status-message">{copyMessage}</p> : null}
      {usageLookupNote ? <p className="status-message">{usageLookupNote}; unknown addresses are still shown.</p> : null}

      <div className="balance-summary">
        <div className="wallet-card-header">
          <div>
            <p className="terminal-heading">&gt; WALLET BALANCE</p>
            <h2 className="balance-total">{formatBalance(balance?.totalBalance ?? 0, balanceUnit)}</h2>
          </div>
          <div className="tab-row">
            <button
              className={balanceUnit === "sats" ? "compact-button" : "secondary-button compact-button"}
              type="button"
              onClick={() => setBalanceUnit("sats")}
            >
              sats
            </button>
            <button
              className={balanceUnit === "btc" ? "compact-button" : "secondary-button compact-button"}
              type="button"
              onClick={() => setBalanceUnit("btc")}
            >
              BTC
            </button>
          </div>
        </div>
        <dl className="balance-grid">
          <div>
            <dt>Confirmed</dt>
            <dd>{formatBalance(balance?.confirmedBalance ?? 0, balanceUnit)}</dd>
          </div>
          <div>
            <dt>Unconfirmed</dt>
            <dd>{formatBalance(balance?.unconfirmedBalance ?? 0, balanceUnit)}</dd>
          </div>
          <div>
            <dt>Receive</dt>
            <dd>{formatBalance(receiveBalance?.totalBalance ?? 0, balanceUnit)}</dd>
          </div>
          <div>
            <dt>Change</dt>
            <dd>{formatBalance(changeBalance?.totalBalance ?? 0, balanceUnit)}</dd>
          </div>
        </dl>
      </div>

      <div className="next-address-placeholder">
        <dt>&gt; NEXT RECEIVE</dt>
        {nextReceiveAddress ? (
          <dd>
            <span className="terminal-meta">wallet: {wallet.name}</span>
            <span className={`usage-pill usage-${nextReceiveAddress.usage}`}>
              {nextReceiveAddress.usage}
            </span>
            <code>{nextReceiveAddress.address}</code>
            <span>{nextReceiveAddress.path}</span>
            <span className="muted">Verify wallet name before sharing this receive address.</span>
            <div className="button-row">
              <button
                className="secondary-button compact-button"
                type="button"
                onClick={() => void copyAddress(nextReceiveAddress)}
              >
                Copy
              </button>
              <button
                className="secondary-button compact-button"
                type="button"
                onClick={() => setQrAddress(nextReceiveAddress)}
              >
                QR
              </button>
            </div>
          </dd>
        ) : (
          <dd>
            {usageLookupFailed
              ? "Usage lookup failed; no confirmed unused receive address is available yet."
              : "Run usage lookup after unlocking the vault to calculate this address."}
          </dd>
        )}
      </div>

      <div className="tab-row">
        <button
          className={usageTab === "all" ? "compact-button" : "secondary-button compact-button"}
          type="button"
          onClick={() => setUsageTab("all")}
        >
          All derived addresses
        </button>
        <button
          className={usageTab === "used" ? "compact-button" : "secondary-button compact-button"}
          type="button"
          onClick={() => setUsageTab("used")}
        >
          Used addresses
        </button>
        <button
          className={usageTab === "unused" ? "compact-button" : "secondary-button compact-button"}
          type="button"
          onClick={() => setUsageTab("unused")}
        >
          Unused addresses
        </button>
        <button
          className={usageTab === "unknown" ? "compact-button" : "secondary-button compact-button"}
          type="button"
          onClick={() => setUsageTab("unknown")}
        >
          Unknown addresses
        </button>
      </div>

      <div className="tab-row">
        <button
          className={chain === "both" ? "compact-button" : "secondary-button compact-button"}
          type="button"
          onClick={() => setChain("both")}
        >
          Receive + change
        </button>
        <button
          className={chain === "receive" ? "compact-button" : "secondary-button compact-button"}
          type="button"
          onClick={() => setChain("receive")}
        >
          Receive
        </button>
        <button
          className={chain === "change" ? "compact-button" : "secondary-button compact-button"}
          type="button"
          onClick={() => setChain("change")}
        >
          Change
        </button>
      </div>

      {loading ? <TerminalSkeleton label="SYNCING ADDRESS BALANCES" rows={4} /> : null}
      {!loading && visibleAddresses.length === 0 ? (
        <p className="muted">{emptyUsageMessage}</p>
      ) : null}
      {receiveAddresses.length ? (
        <AddressTable
          addresses={receiveAddresses}
          balanceUnit={balanceUnit}
          title="Receive addresses"
          walletName={wallet.name}
          onCopy={copyAddress}
          onShowQr={setQrAddress}
        />
      ) : null}
      {changeAddresses.length ? (
        <AddressTable
          addresses={changeAddresses}
          balanceUnit={balanceUnit}
          title="Change addresses"
          walletName={wallet.name}
          onCopy={copyAddress}
          onShowQr={setQrAddress}
        />
      ) : null}

      {qrAddress ? (
        <div className="qr-modal" role="dialog" aria-modal="true">
          <div className="qr-dialog">
            <div className="wallet-card-header">
              <h2>Address QR</h2>
              <button className="secondary-button compact-button" type="button" onClick={() => setQrAddress(null)}>
                Close
              </button>
            </div>
            <div className="qr-box">{qrDataUrl ? <img alt="Address QR code" src={qrDataUrl} /> : null}</div>
            <dl className="qr-context">
              <div>
                <dt>Wallet</dt>
                <dd>{wallet.name}</dd>
              </div>
              <div>
                <dt>Chain / index</dt>
                <dd>
                  {qrAddress.chain} / {qrAddress.index}
                </dd>
              </div>
              <div>
                <dt>Path</dt>
                <dd>{qrAddress.path}</dd>
              </div>
            </dl>
            <code>{qrAddress.address}</code>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AddressTable({
  addresses,
  balanceUnit,
  walletName,
  title,
  onCopy,
  onShowQr
}: {
  addresses: DerivedAddress[];
  balanceUnit: "sats" | "btc";
  walletName: string;
  title: string;
  onCopy: (address: DerivedAddress) => void;
  onShowQr: (address: DerivedAddress) => void;
}) {
  return (
    <div className="address-section">
      <h2>&gt; {title}</h2>
      <p className="muted technical-line">wallet: {walletName}</p>
      <div className="address-table">
        <div className="address-row address-row-header" aria-hidden="true">
          <span>Index</span>
          <span>Chain</span>
          <span>Address</span>
          <span>Balance</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        {addresses.map((address) => (
          <div className="address-row" key={`${address.chain}-${address.index}`}>
            <div className="address-cell address-index">
              <dt>Index</dt>
              <dd>{address.index}</dd>
            </div>
            <div className="address-cell">
              <dt>Chain</dt>
              <dd>{address.chain}</dd>
            </div>
            <div className="address-cell address-value">
              <dt>Address</dt>
              <code>{address.address}</code>
              <span className="muted">{address.path}</span>
            </div>
            <div className="address-cell numeric-value">
              <dt>Balance</dt>
              <dd>{formatNullableBalance(address.totalBalance, balanceUnit)}</dd>
            </div>
            <div className="address-cell usage-stack">
              <dt>Status</dt>
              <span className={`usage-pill usage-${address.usage}`}>{address.usage}</span>
              <span className="muted">
                txCount: {address.txCount === null || address.txCount === undefined ? "unknown" : address.txCount}
              </span>
            </div>
            <div className="button-row address-actions">
              <button
                className="secondary-button compact-button"
                type="button"
                onClick={() => void onCopy(address)}
              >
                Copy address
              </button>
              <button className="secondary-button compact-button" type="button" onClick={() => onShowQr(address)}>
                QR
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getEmptyUsageMessage({
  usageTab,
  usageLookupFailed,
  unknownAddressCount
}: {
  usageTab: "all" | "used" | "unused" | "unknown";
  usageLookupFailed: boolean;
  unknownAddressCount: number;
}): string {
  if (usageTab === "unused" && usageLookupFailed) {
    return "Usage lookup failed; addresses are unknown and are not counted as unused.";
  }

  if (usageTab === "unused" && unknownAddressCount > 0) {
    return "No confirmed unused addresses to show. Unknown addresses are listed separately.";
  }

  if (usageTab === "unknown") {
    return "No unknown addresses to show.";
  }

  if (usageTab === "used") {
    return "No used addresses to show for this filter.";
  }

  return "No addresses to show for this filter.";
}

function formatNullableBalance(value: number | null | undefined, unit: "sats" | "btc"): string {
  return value === null || value === undefined ? "unknown" : formatBalance(value, unit);
}

function formatBalance(sats: number, unit: "sats" | "btc"): string {
  if (unit === "btc") {
    return `${(sats / 100_000_000).toFixed(8)} BTC`;
  }

  return `${new Intl.NumberFormat("en-US").format(sats)} sats`;
}

function extractExtendedPublicKey(value: string): string | null {
  const normalized = value.trim();
  const exactMatch = normalized.match(/^(xpub|ypub|zpub)[1-9A-HJ-NP-Za-km-z]{40,}$/);
  if (exactMatch) {
    return normalized;
  }

  const embeddedMatch = normalized.match(/\b(xpub|ypub|zpub)[1-9A-HJ-NP-Za-km-z]{40,}\b/);
  return embeddedMatch?.[0] ?? null;
}

function detectWalletMetadata(
  extendedPublicKey: string,
  network: WalletRecord["network"]
): Pick<WalletRecord, "type" | "scriptType" | "derivationPath"> | null {
  const trimmed = extendedPublicKey.trim();
  const type = trimmed.startsWith("xpub")
    ? "xpub"
    : trimmed.startsWith("ypub")
      ? "ypub"
      : trimmed.startsWith("zpub")
        ? "zpub"
        : null;

  if (!type) {
    return null;
  }

  const coinType = network === "mainnet" ? "0" : "1";
  const purpose = type === "xpub" ? "44" : type === "ypub" ? "49" : "84";
  return {
    type,
    scriptType: type === "xpub" ? "p2pkh" : type === "ypub" ? "p2sh-p2wpkh" : "p2wpkh",
    derivationPath: `m/${purpose}'/${coinType}'/0'`
  };
}

function maskExtendedPublicKey(value: string): string {
  if (value.length <= 16) {
    return "********";
  }

  return `${value.slice(0, 8)}...${value.slice(-8)}`;
}

async function apiRequest<T = unknown>(
  apiUrl: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const url = buildApiUrl(apiUrl, path);
  console.info("watch wallet API request", url);

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      credentials: "include",
      headers
    });
  } catch (error) {
    console.error("watch wallet API fetch failed", { url, error });
    throw new Error(
      `Failed to fetch ${url}. Check NEXT_PUBLIC_API_URL and API CORS settings.`
    );
  }

  const payload = (await response.json().catch(() => ({}))) as { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed with ${response.status}`);
  }

  return payload as T;
}

function buildApiUrl(apiUrl: string, path: string): string {
  return `${apiUrl.replace(/\/+$/, "")}${path}`;
}
