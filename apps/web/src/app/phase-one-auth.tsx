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
  type: ExtendedPublicKeyType;
  sourceDevice: SourceDevice;
  network: "mainnet" | "testnet" | "signet";
  scriptType: WalletScriptType;
  accountPath: string | null;
  masterFingerprint: string | null;
  importFormat: ImportFormat;
  rawImport: string | null;
  notes: string | null;
  walletNotes: string | null;
  addressLabels: AddressLabel[];
  transactionLabels: TransactionLabel[];
  derivationPath: string;
  gapLimit: number;
  createdAt: string;
  updatedAt: string;
};

type AddressLabel = {
  chain: "receive" | "change";
  index: number;
  address: string;
  label: string;
  notes: string | null;
  updatedAt: string;
};

type TransactionLabel = {
  txid: string;
  label: string;
  notes: string | null;
  updatedAt: string;
};

type ExtendedPublicKeyType = "xpub" | "ypub" | "zpub" | "tpub" | "upub" | "vpub";
type SourceDevice =
  | "coldcard"
  | "keystone"
  | "seedsigner"
  | "krux"
  | "passport-core"
  | "jade"
  | "other";
type WalletScriptType = "legacy" | "nested-segwit" | "native-segwit" | "taproot" | "unknown";
type ImportFormat =
  | "plain-xpub"
  | "slip132"
  | "descriptor"
  | "key-expression"
  | "coldcard-json"
  | "crypto-account-ur"
  | "ur-xpub"
  | "passport-setup-qr"
  | "unknown";

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
  lookupError?: string | null;
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
  status?: "online" | "partial" | "offline";
  usageStatus: "unknown" | "partial" | "ready";
  unit: "sats";
  confirmedBalance: number;
  unconfirmedBalance: number;
  totalBalance: number;
  receiveBalance?: BalanceSummary;
  changeBalance?: BalanceSummary;
  addresses: DerivedAddress[];
  failedAddresses?: Array<{
    address: string;
    chain: "receive" | "change";
    index: number;
    error: string;
  }>;
  nextUnusedReceiveAddress?: DerivedAddress | null;
  lookupError?: string | null;
  nextReceiveLookupError?: string | null;
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
  status: "online" | "degraded" | "offline";
  mode: string;
  url: string;
  baseUrl?: string;
  tipHeight: number | null;
  latencyMs?: number;
  checkedAt?: string;
  errors?: string[];
  checks?: {
    tipHeight?: {
      status: "ok" | "failed";
      error: string | null;
    };
  };
  cacheTtlSeconds: number;
};

type RuntimeSettingsResponse = {
  apiMode: string;
  mempoolApiUrl: string;
  defaultNetwork: string;
  defaultCurrency: string;
  defaultUnit: string;
};

type WalletTransactionRelatedAddress = {
  address: string;
  chain: "receive" | "change";
  index: number;
  role: "input" | "output";
  valueSats: number;
};

type WalletTransaction = {
  txid: string;
  status: "confirmed" | "unconfirmed" | "unknown";
  direction: "incoming" | "outgoing" | "self" | "unknown";
  netSats: number;
  feeSats: number | null;
  blockHeight: number | null;
  blockTime: number | null;
  relatedAddresses: WalletTransactionRelatedAddress[];
};

type WalletTransactionsResponse = {
  walletId: string;
  status: "online" | "partial" | "offline";
  transactions: WalletTransaction[];
  failedAddresses: Array<{
    address: string;
    chain: "receive" | "change";
    index: number;
    error: string;
  }>;
  mempool: {
    mode: string;
    url: string;
    cacheTtlSeconds: number;
  };
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
      if (window.location.pathname !== "/") {
        window.location.assign("/");
        return;
      }
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

    const form = event.currentTarget;
    const submittedUsername = readFormInput(form, "username") ?? loginUsername;
    const submittedPassword = readFormInput(form, "password") ?? loginPassword;
    const submittedTotpCode = readFormInput(form, "totpCode") ?? loginTotpCode;

    try {
      const nextSession = await apiRequest<SessionResponse>(apiUrl, "/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: submittedUsername,
          password: submittedPassword,
          totpCode: submittedTotpCode
        })
      });
      setSession(nextSession);
      setLoginUsername(submittedUsername);
      setLoginPassword("");
      setLoginTotpCode("");
      if (window.location.pathname !== "/") {
        window.location.assign("/");
        return;
      }
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
      if (window.location.pathname !== "/") {
        window.location.assign("/");
        return;
      }
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
          <span className="phase-pill">{view === "dashboard" ? "PHASE 8" : "AUTH NODE"}</span>
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

function readFormInput(form: HTMLFormElement, name: string): string | null {
  const field = form.elements.namedItem(name);
  if (field instanceof HTMLInputElement) {
    return field.value;
  }
  return null;
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
          name="username"
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </label>
      <label>
        <span>Password</span>
        <input
          autoComplete="current-password"
          name="password"
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
          name="totpCode"
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
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettingsResponse | null>(null);
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
    const [statusResult, settingsResult] = await Promise.allSettled([
      apiRequest<MempoolStatusResponse>(apiUrl, "/api/status/mempool"),
      apiRequest<RuntimeSettingsResponse>(apiUrl, "/api/settings/runtime")
    ]);

    if (statusResult.status === "fulfilled") {
      setMempoolStatus(statusResult.value);
      setMempoolStatusError("");
    } else {
      setMempoolStatus(null);
      setMempoolStatusError(
        statusResult.reason instanceof Error ? statusResult.reason.message : "Mempool status unavailable"
      );
    }

    if (settingsResult.status === "fulfilled") {
      setRuntimeSettings(settingsResult.value);
    } else {
      setRuntimeSettings(null);
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
    importText: string;
    network: WalletRecord["network"];
    sourceDevice: SourceDevice;
    scriptType: WalletScriptType;
    notes: string | null;
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

  function handleReplaceWallet(updatedWallet: WalletRecord) {
    setWallets((current) =>
      current.map((wallet) => (wallet.id === updatedWallet.id ? updatedWallet : wallet))
    );
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
    mempoolStatus?.status === "online"
      ? "online"
      : mempoolStatus?.status === "offline" || mempoolStatusError
        ? "offline"
        : "degraded";

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
            <WalletDetailView
              apiUrl={apiUrl}
              mempoolBadgeStatus={mempoolBadgeStatus}
              mempoolStatus={mempoolStatus}
              mempoolStatusError={mempoolStatusError}
              runtimeSettings={runtimeSettings}
              wallet={detailWallet}
              onRefreshConnection={refreshMempoolStatus}
              onWalletChange={handleReplaceWallet}
            />
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
    importText: string;
    network: WalletRecord["network"];
    sourceDevice: SourceDevice;
    scriptType: WalletScriptType;
    notes: string | null;
    gapLimit: number;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [importText, setImportText] = useState("");
  const [sourceDevice, setSourceDevice] = useState<SourceDevice>("other");
  const [network, setNetwork] = useState<WalletRecord["network"]>("mainnet");
  const [scriptType, setScriptType] = useState<WalletScriptType>("unknown");
  const [notes, setNotes] = useState("");
  const [importMethod, setImportMethod] = useState<"paste" | "file" | "qr">("paste");
  const [gapLimit, setGapLimit] = useState(20);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerMessage, setScannerMessage] = useState("");
  const scannerControls = useRef<IScannerControls | null>(null);
  const scannerVideo = useRef<HTMLVideoElement | null>(null);
  const detected = useMemo(() => detectImportMetadata(importText, network, sourceDevice), [
    importText,
    network,
    sourceDevice
  ]);
  const effectiveScriptType = scriptType !== "unknown" ? scriptType : detected.scriptType;
  const canSave =
    Boolean(detected.extendedPublicKey) &&
    !detected.privateInput &&
    effectiveScriptType !== "unknown";

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  useEffect(() => {
    if (detected.network && detected.network !== network) {
      setNetwork(detected.network);
    }
    if (detected.scriptType !== "unknown") {
      setScriptType(detected.scriptType);
    }
  }, [detected.network, detected.scriptType]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({
      name,
      importText,
      network,
      sourceDevice,
      scriptType: effectiveScriptType,
      notes: notes.trim() || null,
      gapLimit
    });
    setName("");
    setImportText("");
    setSourceDevice("other");
    setScriptType("unknown");
    setNotes("");
    setGapLimit(20);
  }

  async function handleFileImport(file: File | undefined) {
    if (!file) {
      return;
    }
    setImportText(await file.text());
    setImportMethod("file");
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

          const scannedValue = result.getText();
          const scanPreview = detectImportMetadata(scannedValue, network, sourceDevice);
          if (!scanPreview.extendedPublicKey && !scanPreview.importFormat.startsWith("ur")) {
            setScannerMessage("QR did not contain a supported xpub, descriptor, key expression, JSON, or UR payload.");
            return;
          }

          setImportText(scannedValue);
          setScannerMessage(scanPreview.unsupportedReason ?? "Watch-only import QR scanned.");
          stopScanner();
          setScannerOpen(false);
        }
      );
      setScannerMessage("Point the camera at a static xpub, descriptor, key expression, JSON, or UR QR.");
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
      <p className="muted">
        Extended public keys and descriptors reveal wallet history. Store locally and do not share.
      </p>
      <div className="form-grid">
        <label>
          <span>Wallet name</span>
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          <span>Source device</span>
          <select
            value={sourceDevice}
            onChange={(event) => setSourceDevice(event.target.value as SourceDevice)}
          >
            {sourceDeviceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
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
        <label>
          <span>Script type</span>
          <select
            value={scriptType}
            onChange={(event) => setScriptType(event.target.value as WalletScriptType)}
          >
            <option value="unknown">unknown / confirm manually</option>
            <option value="legacy">legacy</option>
            <option value="nested-segwit">nested segwit</option>
            <option value="native-segwit">native segwit</option>
            <option value="taproot">taproot</option>
          </select>
        </label>
      </div>
      <div className="tab-row">
        <button
          className={importMethod === "paste" ? "compact-button" : "secondary-button compact-button"}
          type="button"
          onClick={() => setImportMethod("paste")}
        >
          Paste
        </button>
        <button
          className={importMethod === "file" ? "compact-button" : "secondary-button compact-button"}
          type="button"
          onClick={() => setImportMethod("file")}
        >
          File
        </button>
        <button
          className={importMethod === "qr" ? "compact-button" : "secondary-button compact-button"}
          type="button"
          onClick={() => {
            setImportMethod("qr");
            void startScanner();
          }}
        >
          QR Scan
        </button>
      </div>
      <label>
        <span className="field-header">
          <span>Import payload</span>
          <button
            className="secondary-button compact-button"
            type="button"
            onClick={() => void startScanner()}
          >
            Scan QR
          </button>
        </span>
        <textarea
          autoComplete="off"
          className="import-textarea"
          required
          spellCheck={false}
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
          placeholder="Paste xpub/ypub/zpub/tpub/upub/vpub, [fingerprint/path]xpub, descriptor, JSON, or UR text"
        />
      </label>
      {importMethod === "file" ? (
        <label>
          <span>Import file</span>
          <input
            accept=".json,.txt,.descriptor,text/plain,application/json"
            type="file"
            onChange={(event) => void handleFileImport(event.target.files?.[0])}
          />
        </label>
      ) : null}
      <div className="form-grid">
        <label>
          <span>Detected key</span>
          <input readOnly value={detected.type ?? "Waiting for watch-only import"} />
        </label>
        <label>
          <span>Account path</span>
          <input readOnly value={detected.accountPath ?? ""} />
        </label>
        <label>
          <span>Fingerprint</span>
          <input readOnly value={detected.masterFingerprint ?? "not provided"} />
        </label>
        <label>
          <span>Import format</span>
          <input readOnly value={detected.importFormat} />
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
        <label>
          <span>Notes</span>
          <input value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
      </div>
      <DeviceGuidance sourceDevice={sourceDevice} />
      {detected.privateInput ? <p className="status-message">{watchOnlyImportError}</p> : null}
      {detected.warnings.length ? (
        <div className="terminal-panel import-preview">
          {detected.warnings.map((warning) => (
            <p className="muted" key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}
      {detected.unsupportedReason ? <p className="status-message">{detected.unsupportedReason}</p> : null}
      <button disabled={busy || !canSave} type="submit">
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

const watchOnlyImportError =
  "This is a watch-only wallet. Private keys or seed phrases must never be imported.";

const sourceDeviceOptions: Array<{ value: SourceDevice; label: string }> = [
  { value: "coldcard", label: "Coldcard" },
  { value: "keystone", label: "Keystone" },
  { value: "seedsigner", label: "SeedSigner" },
  { value: "krux", label: "Krux" },
  { value: "passport-core", label: "Passport Core" },
  { value: "jade", label: "Jade" },
  { value: "other", label: "Other" }
];

function DeviceGuidance({ sourceDevice }: { sourceDevice: SourceDevice }) {
  const guidance: Record<SourceDevice, string> = {
    coldcard: "Coldcard: use Export Wallet > Descriptor or Generic JSON. Confirm XFP, account path, xpub/zpub, and script type.",
    keystone: "Keystone: descriptor file import is preferred. crypto-account QR is detected, but full UR decoding is not complete yet.",
    seedsigner: "SeedSigner: use Export Xpub > Sparrow or a plain xpub/UR xpub QR. Animated UR frames are detected but not fully decoded yet.",
    krux: "Krux: import extended public key QR or SD text, then verify fingerprint, derivation, and script type match the device.",
    "passport-core": "Passport Core: use Pair Wallet > Sparrow > Single Sig, descriptor, or xpub export. Verify the first receive address on Passport.",
    jade: "Jade: import the account xpub or descriptor, then verify the first receive address on-device.",
    other: "Other device: prefer descriptor or [fingerprint/path]xpub import when available. Confirm source device, script type, account path, and first receive address before receiving funds."
  };

  return (
    <div className="terminal-panel import-preview">
      <p className="terminal-heading">&gt; IMPORT GUIDANCE</p>
      <p className="muted">{guidance[sourceDevice]}</p>
    </div>
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
            {deviceLabel(wallet.sourceDevice)} / {wallet.network} / {wallet.type} / {wallet.scriptType}
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

function WalletDetailView({
  apiUrl,
  mempoolBadgeStatus,
  mempoolStatus,
  mempoolStatusError,
  runtimeSettings,
  wallet,
  onRefreshConnection,
  onWalletChange
}: {
  apiUrl: string;
  mempoolBadgeStatus: StatusKind;
  mempoolStatus: MempoolStatusResponse | null;
  mempoolStatusError: string;
  runtimeSettings: RuntimeSettingsResponse | null;
  wallet: WalletRecord;
  onRefreshConnection: () => Promise<void>;
  onWalletChange: (wallet: WalletRecord) => void;
}) {
  const [balanceUnit, setBalanceUnit] = useState<"sats" | "btc">("sats");
  const [balanceBadgeStatus, setBalanceBadgeStatus] = useState<StatusKind>("degraded");
  const [txBadgeStatus, setTxBadgeStatus] = useState<StatusKind>("degraded");
  const [refreshToken, setRefreshToken] = useState(0);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const warnings = walletSafetyWarnings(wallet);
  const accountPath = wallet.accountPath ?? wallet.derivationPath ?? "not provided";

  async function refreshAll() {
    setRefreshingAll(true);
    try {
      await onRefreshConnection();
      setRefreshToken((current) => current + 1);
    } finally {
      setRefreshingAll(false);
    }
  }

  return (
    <div className="wallet-detail-page">
      <div className="wallet-detail-header terminal-panel">
        <div>
          <div className="wallet-identity-line">
            <span className="phase-pill">{deviceAlias(wallet.sourceDevice)}</span>
            <h2>{wallet.name}</h2>
          </div>
          <p className="wallet-identity-meta">
            {deviceLabel(wallet.sourceDevice)} / {wallet.network} / {formatScriptType(wallet.scriptType)} / {accountPath} / fpr {wallet.masterFingerprint ?? "not provided"}
          </p>
          <div className="terminal-statusline detail-status-rail">
            <span className="status-badge status-online">[VAULT: UNLOCKED]</span>
            <StatusBadge label="MEMPOOL" status={mempoolBadgeStatus} />
            <StatusBadge label="BALANCE" status={balanceBadgeStatus} />
            <StatusBadge label="TXS" status={txBadgeStatus} />
          </div>
          <ConnectionPanel
            error={mempoolStatusError}
            mempoolStatus={mempoolStatus}
            refreshing={refreshingAll}
            runtimeSettings={runtimeSettings}
            onRefreshAll={() => void refreshAll()}
          />
          <WalletNotesEditor apiUrl={apiUrl} wallet={wallet} onWalletChange={onWalletChange} />
          <details className="metadata-details">
            <summary>Import details</summary>
            <div className="metadata-grid">
              <div>
                <dt>Import format</dt>
                <dd>{wallet.importFormat ?? "unknown"}</dd>
              </div>
              <div>
                <dt>Key type</dt>
                <dd>{wallet.type}</dd>
              </div>
              <div>
                <dt>Notes</dt>
                <dd>{wallet.notes ?? "not provided"}</dd>
              </div>
              <div>
                <dt>Raw import</dt>
                <dd>{wallet.rawImport ? maskRawImport(wallet.rawImport) : "not stored"}</dd>
              </div>
            </div>
            {warnings.length ? (
              <div className="metadata-warnings">
                {warnings.map((warning) => (
                  <p className="muted" key={warning}>{warning}</p>
                ))}
              </div>
            ) : null}
          </details>
        </div>
      </div>
      <WalletAddressPanel
        apiUrl={apiUrl}
        balanceUnit={balanceUnit}
        mempoolBadgeStatus={mempoolBadgeStatus}
        onBalanceStatusChange={setBalanceBadgeStatus}
        refreshToken={refreshToken}
        setBalanceUnit={setBalanceUnit}
        wallet={wallet}
        onWalletChange={onWalletChange}
      />
      <TransactionHistoryPanel
        apiUrl={apiUrl}
        balanceUnit={balanceUnit}
        onTxStatusChange={setTxBadgeStatus}
        refreshToken={refreshToken}
        wallet={wallet}
        onWalletChange={onWalletChange}
      />
    </div>
  );
}

function ConnectionPanel({
  error,
  mempoolStatus,
  refreshing,
  runtimeSettings,
  onRefreshAll
}: {
  error: string;
  mempoolStatus: MempoolStatusResponse | null;
  refreshing: boolean;
  runtimeSettings: RuntimeSettingsResponse | null;
  onRefreshAll: () => void;
}) {
  const status = mempoolStatus?.status ?? (error ? "offline" : "degraded");
  const badgeStatus: StatusKind =
    status === "online" ? "online" : status === "offline" ? "offline" : "degraded";
  const endpoint = mempoolStatus?.baseUrl ?? mempoolStatus?.url ?? runtimeSettings?.mempoolApiUrl ?? "unknown";
  const tip = mempoolStatus?.tipHeight
    ? new Intl.NumberFormat("en-US").format(mempoolStatus.tipHeight)
    : "unknown";
  const latency =
    typeof mempoolStatus?.latencyMs === "number" ? `${mempoolStatus.latencyMs}ms` : status === "offline" ? "timeout" : "unknown";
  const checkedAt = formatCheckedAt(mempoolStatus?.checkedAt);
  const errors = mempoolStatus?.errors ?? (error ? [error] : []);
  const helper = getMempoolHelperText(badgeStatus);

  return (
    <div className="connection-panel">
      <div className="connection-summary">
        <div>
          <p className="terminal-heading">&gt; CONNECTION</p>
          <p className="muted technical-line">{helper}</p>
        </div>
        <button
          className="secondary-button compact-button"
          disabled={refreshing}
          type="button"
          onClick={onRefreshAll}
        >
          {refreshing ? "Refreshing all" : "Refresh all"}
        </button>
      </div>
      <div className="terminal-statusline connection-statusline">
        <StatusBadge label="MEMPOOL" status={badgeStatus} />
        <span className="terminal-meta">mode {mempoolStatus?.mode ?? runtimeSettings?.apiMode ?? "mempool"}</span>
        <span className="terminal-meta">tip {tip}</span>
        <span className="terminal-meta">latency {latency}</span>
      </div>
      <details className="metadata-details connection-details">
        <summary>Connection details</summary>
        <div className="metadata-grid">
          <div>
            <dt>Endpoint</dt>
            <dd>{endpoint}</dd>
          </div>
          <div>
            <dt>Last check</dt>
            <dd>{checkedAt}</dd>
          </div>
          <div>
            <dt>Mode</dt>
            <dd>{runtimeSettings?.apiMode ?? mempoolStatus?.mode ?? "mempool"}</dd>
          </div>
        </div>
        <p className="muted technical-line">
          To use your own node, set MEMPOOL_API_URL in .env and restart the API server.
        </p>
        {errors.length ? <p className="status-message">{errors[0]}</p> : null}
      </details>
    </div>
  );
}

function WalletNotesEditor({
  apiUrl,
  wallet,
  onWalletChange
}: {
  apiUrl: string;
  wallet: WalletRecord;
  onWalletChange: (wallet: WalletRecord) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(wallet.walletNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editing) {
      setDraft(wallet.walletNotes ?? "");
    }
  }, [wallet.walletNotes, editing]);

  async function saveNotes() {
    setSaving(true);
    setError("");
    try {
      const response = await apiRequest<{ wallet: WalletRecord }>(apiUrl, `/api/wallets/${wallet.id}/notes`, {
        method: "PATCH",
        body: JSON.stringify({ notes: draft })
      });
      onWalletChange(response.wallet);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save wallet note");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="wallet-note-editor">
        <label>
          <span>note</span>
          <textarea
            maxLength={1000}
            rows={3}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <div className="button-row">
          <button className="compact-button" disabled={saving} type="button" onClick={() => void saveNotes()}>
            Save
          </button>
          <button
            className="secondary-button compact-button"
            disabled={saving}
            type="button"
            onClick={() => {
              setDraft(wallet.walletNotes ?? "");
              setError("");
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </div>
        {error ? <p className="status-message">{error}</p> : null}
      </div>
    );
  }

  return (
    <p className="wallet-note-line">
      <span className="terminal-meta">note:</span> {wallet.walletNotes ?? "none"}{" "}
      <button className="text-button" type="button" onClick={() => setEditing(true)}>
        {wallet.walletNotes ? "edit" : "add"}
      </button>
    </p>
  );
}

function WalletAddressPanel({
  apiUrl,
  balanceUnit,
  mempoolBadgeStatus,
  onBalanceStatusChange,
  refreshToken,
  setBalanceUnit,
  wallet,
  onWalletChange
}: {
  apiUrl: string;
  balanceUnit: "sats" | "btc";
  mempoolBadgeStatus: StatusKind;
  onBalanceStatusChange: (status: StatusKind) => void;
  refreshToken: number;
  setBalanceUnit: (unit: "sats" | "btc") => void;
  wallet: WalletRecord;
  onWalletChange: (wallet: WalletRecord) => void;
}) {
  const [chain, setChain] = useState<"both" | "receive" | "change">("both");
  const [usageTab, setUsageTab] = useState<"all" | "used" | "unused" | "unknown">("all");
  const [addresses, setAddresses] = useState<DerivedAddress[]>([]);
  const [nextReceiveAddress, setNextReceiveAddress] = useState<DerivedAddress | null>(null);
  const [balance, setBalance] = useState<BalanceSummary | null>(null);
  const [receiveBalance, setReceiveBalance] = useState<BalanceSummary | null>(null);
  const [changeBalance, setChangeBalance] = useState<BalanceSummary | null>(null);
  const [usageLookupNote, setUsageLookupNote] = useState("");
  const [nextReceiveLookupNote, setNextReceiveLookupNote] = useState("");
  const [balanceFailedCount, setBalanceFailedCount] = useState(0);
  const [message, setMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [qrAddress, setQrAddress] = useState<DerivedAddress | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [editingAddressLabelKey, setEditingAddressLabelKey] = useState("");
  const [addressLabelDraft, setAddressLabelDraft] = useState("");
  const [addressNotesDraft, setAddressNotesDraft] = useState("");
  const [labelSaving, setLabelSaving] = useState(false);
  const [labelError, setLabelError] = useState("");

  useEffect(() => {
    void refreshAddresses();
  }, [wallet.id, chain, refreshToken]);

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
      setAddresses(response.addresses ?? []);
      setNextReceiveAddress(response.nextUnusedReceiveAddress ?? null);
      setBalance({
        confirmedBalance: response.confirmedBalance,
        unconfirmedBalance: response.unconfirmedBalance,
        totalBalance: response.totalBalance
      });
      setReceiveBalance(response.receiveBalance ?? null);
      setChangeBalance(response.changeBalance ?? null);
      setUsageLookupNote(response.lookupError ?? "");
      setNextReceiveLookupNote(response.nextReceiveLookupError ?? "");
      setBalanceFailedCount(response.failedAddresses?.length ?? 0);
      onBalanceStatusChange(
        response.status === "offline"
          ? "offline"
          : response.lookupError || response.status === "partial"
            ? "degraded"
            : "online"
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to look up wallet balance");
      setAddresses([]);
      setNextReceiveAddress(null);
      setBalance(null);
      setReceiveBalance(null);
      setChangeBalance(null);
      setUsageLookupNote("");
      setNextReceiveLookupNote("");
      setBalanceFailedCount(0);
      onBalanceStatusChange("offline");
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

  function beginEditAddressLabel(address: DerivedAddress) {
    const label = getAddressLabel(wallet, address.chain, address.index);
    setEditingAddressLabelKey(addressLabelKey(address));
    setAddressLabelDraft(label?.label ?? "");
    setAddressNotesDraft(label?.notes ?? "");
    setLabelError("");
  }

  function cancelEditAddressLabel() {
    setEditingAddressLabelKey("");
    setAddressLabelDraft("");
    setAddressNotesDraft("");
    setLabelError("");
  }

  async function saveAddressLabel(address: DerivedAddress) {
    setLabelSaving(true);
    setLabelError("");
    try {
      const response = await apiRequest<{ wallet: WalletRecord }>(apiUrl, `/api/wallets/${wallet.id}/address-labels`, {
        method: "PATCH",
        body: JSON.stringify({
          chain: address.chain,
          index: address.index,
          address: address.address,
          label: addressLabelDraft,
          notes: addressNotesDraft
        })
      });
      onWalletChange(response.wallet);
      cancelEditAddressLabel();
    } catch (error) {
      setLabelError(error instanceof Error ? error.message : "Unable to save address label");
    } finally {
      setLabelSaving(false);
    }
  }

  async function clearAddressLabel(address: DerivedAddress) {
    setLabelSaving(true);
    setLabelError("");
    try {
      const response = await apiRequest<{ wallet: WalletRecord }>(apiUrl, `/api/wallets/${wallet.id}/address-labels`, {
        method: "DELETE",
        body: JSON.stringify({
          chain: address.chain,
          index: address.index
        })
      });
      onWalletChange(response.wallet);
      cancelEditAddressLabel();
    } catch (error) {
      setLabelError(error instanceof Error ? error.message : "Unable to clear address label");
    } finally {
      setLabelSaving(false);
    }
  }

  const visibleAddresses =
    usageTab === "all"
      ? addresses
      : addresses.filter((address) => address.usage === usageTab);
  const receiveAddresses = visibleAddresses.filter((address) => address.chain === "receive");
  const changeAddresses = visibleAddresses.filter((address) => address.chain === "change");
  const unknownAddressCount = addresses.filter((address) => address.usage === "unknown").length;
  const usageLookupFailed = Boolean(usageLookupNote) || (unknownAddressCount === addresses.length && addresses.length > 0);
  const emptyUsageMessage = getEmptyUsageMessage({
    usageTab,
    usageLookupFailed,
    unknownAddressCount
  });
  const qrLabel = qrAddress ? getAddressLabel(wallet, qrAddress.chain, qrAddress.index) : null;
  const nextReceiveMessage = getNextReceiveMessage({
    loading,
    mempoolBadgeStatus,
    usageLookupFailed: usageLookupFailed || Boolean(nextReceiveLookupNote)
  });

  return (
    <section className="wallet-address-panel">
      {message ? <p className="status-message">{message}</p> : null}
      {copyMessage ? <p className="status-message">{copyMessage}</p> : null}
      {usageLookupNote ? (
        <p className="status-message">
          Some address balances could not be fetched. Total may be incomplete.
          {balanceFailedCount > 0 ? ` Failed lookups: ${balanceFailedCount}.` : ""}
        </p>
      ) : null}

      <div className="balance-summary">
        <div className="wallet-card-header">
          <div>
            <p className="terminal-heading">&gt; BALANCE</p>
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
            <span className="terminal-meta">receive #{nextReceiveAddress.index}</span>
            <span className={`usage-pill usage-${nextReceiveAddress.usage}`}>
              {nextReceiveAddress.usage}
            </span>
            <AddressLabelPill label={getAddressLabel(wallet, nextReceiveAddress.chain, nextReceiveAddress.index)} />
            <code>{nextReceiveAddress.address}</code>
            <span>{nextReceiveAddress.path}</span>
            <span className="muted">Verify wallet name, source device, and path on your cold wallet before receiving funds.</span>
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
              <button
                className="secondary-button compact-button"
                type="button"
                onClick={() => beginEditAddressLabel(nextReceiveAddress)}
              >
                Label
              </button>
            </div>
            {editingAddressLabelKey === addressLabelKey(nextReceiveAddress) ? (
              <InlineLabelEditor
                error={labelError}
                label={addressLabelDraft}
                notes={addressNotesDraft}
                saving={labelSaving}
                onCancel={cancelEditAddressLabel}
                onClear={() => void clearAddressLabel(nextReceiveAddress)}
                onLabelChange={setAddressLabelDraft}
                onNotesChange={setAddressNotesDraft}
                onSave={() => void saveAddressLabel(nextReceiveAddress)}
              />
            ) : null}
          </dd>
        ) : (
          <dd>
            {nextReceiveMessage}
          </dd>
        )}
      </div>

      <div className="wallet-card-header compact-section-header">
        <div>
          <p className="terminal-heading">&gt; ADDRESSES</p>
          <p className="muted technical-line">unknown balances are excluded from totals</p>
        </div>
        <button
          className="secondary-button compact-button"
          disabled={loading}
          type="button"
          onClick={() => void refreshAddresses()}
        >
          {loading ? "Refreshing balance" : "Refresh balance"}
        </button>
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
          editingKey={editingAddressLabelKey}
          getLabel={(address) => getAddressLabel(wallet, address.chain, address.index)}
          labelDraft={addressLabelDraft}
          labelError={labelError}
          labelSaving={labelSaving}
          notesDraft={addressNotesDraft}
          title="Receive"
          onBeginEditLabel={beginEditAddressLabel}
          onCancelEditLabel={cancelEditAddressLabel}
          onClearLabel={clearAddressLabel}
          onCopy={copyAddress}
          onLabelDraftChange={setAddressLabelDraft}
          onNotesDraftChange={setAddressNotesDraft}
          onSaveLabel={saveAddressLabel}
          onShowQr={setQrAddress}
        />
      ) : null}
      {changeAddresses.length ? (
        <AddressTable
          addresses={changeAddresses}
          balanceUnit={balanceUnit}
          editingKey={editingAddressLabelKey}
          getLabel={(address) => getAddressLabel(wallet, address.chain, address.index)}
          labelDraft={addressLabelDraft}
          labelError={labelError}
          labelSaving={labelSaving}
          notesDraft={addressNotesDraft}
          title="Change"
          onBeginEditLabel={beginEditAddressLabel}
          onCancelEditLabel={cancelEditAddressLabel}
          onClearLabel={clearAddressLabel}
          onCopy={copyAddress}
          onLabelDraftChange={setAddressLabelDraft}
          onNotesDraftChange={setAddressNotesDraft}
          onSaveLabel={saveAddressLabel}
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
                <dt>Source</dt>
                <dd>{deviceLabel(wallet.sourceDevice)}</dd>
              </div>
              <div>
                <dt>Network</dt>
                <dd>{wallet.network}</dd>
              </div>
              <div>
                <dt>Chain / index</dt>
                <dd>
                  {qrAddress.chain} / {qrAddress.index}
                </dd>
              </div>
              {qrLabel ? (
                <div>
                  <dt>Label</dt>
                  <dd>{qrLabel.label}</dd>
                </div>
              ) : null}
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

function TransactionHistoryPanel({
  apiUrl,
  balanceUnit,
  onTxStatusChange,
  refreshToken,
  wallet,
  onWalletChange
}: {
  apiUrl: string;
  balanceUnit: "sats" | "btc";
  onTxStatusChange: (status: StatusKind) => void;
  refreshToken: number;
  wallet: WalletRecord;
  onWalletChange: (wallet: WalletRecord) => void;
}) {
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [txStatus, setTxStatus] = useState<"online" | "partial" | "offline" | null>(null);
  const [failedCount, setFailedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [txLimit, setTxLimit] = useState(25);
  const [editingTxid, setEditingTxid] = useState("");
  const [txLabelDraft, setTxLabelDraft] = useState("");
  const [txNotesDraft, setTxNotesDraft] = useState("");
  const [labelSaving, setLabelSaving] = useState(false);
  const [labelError, setLabelError] = useState("");

  useEffect(() => {
    void refreshTransactions();
  }, [wallet.id, txLimit, refreshToken]);

  async function refreshTransactions() {
    setLoading(true);
    setMessage("");
    try {
      const response = await apiRequest<WalletTransactionsResponse>(
        apiUrl,
        `/api/wallets/${wallet.id}/transactions?chain=both&addressLimit=${wallet.gapLimit}&txLimit=${txLimit}`
      );
      setTransactions(response.transactions ?? []);
      setTxStatus(response.status);
      setFailedCount(response.failedAddresses?.length ?? 0);
      onTxStatusChange(response.status === "online" ? "online" : response.status === "offline" ? "offline" : "degraded");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load transaction history");
      setTransactions([]);
      setTxStatus(null);
      setFailedCount(0);
      onTxStatusChange("offline");
    } finally {
      setLoading(false);
    }
  }

  function beginEditTransactionLabel(tx: WalletTransaction) {
    const label = getTransactionLabel(wallet, tx.txid);
    setEditingTxid(tx.txid);
    setTxLabelDraft(label?.label ?? "");
    setTxNotesDraft(label?.notes ?? "");
    setLabelError("");
  }

  function cancelEditTransactionLabel() {
    setEditingTxid("");
    setTxLabelDraft("");
    setTxNotesDraft("");
    setLabelError("");
  }

  async function saveTransactionLabel(tx: WalletTransaction) {
    setLabelSaving(true);
    setLabelError("");
    try {
      const response = await apiRequest<{ wallet: WalletRecord }>(apiUrl, `/api/wallets/${wallet.id}/transaction-labels`, {
        method: "PATCH",
        body: JSON.stringify({
          txid: tx.txid,
          label: txLabelDraft,
          notes: txNotesDraft
        })
      });
      onWalletChange(response.wallet);
      cancelEditTransactionLabel();
    } catch (error) {
      setLabelError(error instanceof Error ? error.message : "Unable to save transaction label");
    } finally {
      setLabelSaving(false);
    }
  }

  async function clearTransactionLabel(tx: WalletTransaction) {
    setLabelSaving(true);
    setLabelError("");
    try {
      const response = await apiRequest<{ wallet: WalletRecord }>(apiUrl, `/api/wallets/${wallet.id}/transaction-labels`, {
        method: "DELETE",
        body: JSON.stringify({ txid: tx.txid })
      });
      onWalletChange(response.wallet);
      cancelEditTransactionLabel();
    } catch (error) {
      setLabelError(error instanceof Error ? error.message : "Unable to clear transaction label");
    } finally {
      setLabelSaving(false);
    }
  }

  return (
    <section className="tx-history-panel wallet-address-panel">
      <div className="wallet-card-header">
        <div>
          <p className="terminal-heading">&gt; TRANSACTIONS</p>
          <p className="muted technical-line">unit: {balanceUnit}</p>
        </div>
        <button
          className="secondary-button compact-button"
          disabled={loading}
          type="button"
          onClick={() => void refreshTransactions()}
        >
          {loading ? "Refreshing transactions" : "Refresh transactions"}
        </button>
      </div>
      {failedCount > 0 ? (
        <p className="status-message">{failedCount} address lookup(s) failed. Transaction history may be incomplete.</p>
      ) : null}

      {message ? <p className="status-message">{message}</p> : null}

      <label className="tx-limit-select">
        <span>Show</span>
        <select
          value={txLimit}
          onChange={(event) => setTxLimit(Number(event.target.value))}
        >
          <option value={10}>10 transactions</option>
          <option value={25}>25 transactions</option>
          <option value={50}>50 transactions</option>
          <option value={100}>100 transactions</option>
        </select>
      </label>

      {loading ? (
        <TerminalSkeleton label="LOADING TRANSACTIONS" rows={4} />
      ) : transactions.length === 0 ? (
        <p className="muted">
          {txStatus === "offline"
            ? "Transaction lookup failed. Check mempool connection."
            : "No transactions found for this wallet."}
        </p>
      ) : (
        <div className="tx-list">
          {transactions.map((tx) => (
            <TransactionRow
              key={tx.txid}
              balanceUnit={balanceUnit}
              editing={editingTxid === tx.txid}
              label={getTransactionLabel(wallet, tx.txid)}
              labelDraft={txLabelDraft}
              labelError={labelError}
              labelSaving={labelSaving}
              notesDraft={txNotesDraft}
              tx={tx}
              onBeginEdit={() => beginEditTransactionLabel(tx)}
              onCancelEdit={cancelEditTransactionLabel}
              onClearLabel={() => void clearTransactionLabel(tx)}
              onLabelDraftChange={setTxLabelDraft}
              onNotesDraftChange={setTxNotesDraft}
              onSaveLabel={() => void saveTransactionLabel(tx)}
            />
          ))}
        </div>
      )}
      <p className="label-privacy-hint muted">
        xpub and labels together can reveal wallet history. Keep this device private.
      </p>
    </section>
  );
}

function TransactionRow({
  balanceUnit,
  editing,
  label,
  labelDraft,
  labelError,
  labelSaving,
  notesDraft,
  tx,
  onBeginEdit,
  onCancelEdit,
  onClearLabel,
  onLabelDraftChange,
  onNotesDraftChange,
  onSaveLabel
}: {
  balanceUnit: "sats" | "btc";
  editing: boolean;
  label: TransactionLabel | null;
  labelDraft: string;
  labelError: string;
  labelSaving: boolean;
  notesDraft: string;
  tx: WalletTransaction;
  onBeginEdit: () => void;
  onCancelEdit: () => void;
  onClearLabel: () => void;
  onLabelDraftChange: (value: string) => void;
  onNotesDraftChange: (value: string) => void;
  onSaveLabel: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const directionClass = `tx-direction-badge tx-${tx.direction}`;
  const relatedSummary = summarizeRelatedAddresses(tx.relatedAddresses);

  const formattedTime =
    tx.blockTime !== null
      ? new Date(tx.blockTime * 1000).toLocaleString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        })
      : null;

  return (
    <div className="tx-row">
      <div className="tx-meta-row">
        <span className={directionClass}>{formatDirection(tx.direction)}</span>
        <span className={`tx-amount tx-amount-${tx.direction}`}>
          {formatTransactionAmount(tx.netSats, balanceUnit)}
        </span>
        <span className={`usage-pill usage-${tx.status === "confirmed" ? "used" : tx.status === "unconfirmed" ? "unused" : "unknown"}`}>
          {tx.status}
        </span>
        {formattedTime ? (
          <span className="terminal-meta">{formattedTime}</span>
        ) : (
          <span className="terminal-meta muted">pending</span>
        )}
        {tx.blockHeight !== null ? (
          <span className="terminal-meta">block {new Intl.NumberFormat("en-US").format(tx.blockHeight)}</span>
        ) : null}
        <span className="terminal-meta">{relatedSummary}</span>
        <TransactionLabelPill label={label} />
        <button
          className="secondary-button compact-button"
          type="button"
          onClick={onBeginEdit}
        >
          Label
        </button>
        <button
          className="secondary-button compact-button"
          type="button"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Less" : "More"}
        </button>
      </div>
      <div className="tx-txid">
        <span className="terminal-meta">txid: </span>
        <code>{tx.txid.slice(0, 16)}...{tx.txid.slice(-8)}</code>
      </div>
      {editing ? (
        <InlineLabelEditor
          error={labelError}
          label={labelDraft}
          notes={notesDraft}
          saving={labelSaving}
          onCancel={onCancelEdit}
          onClear={onClearLabel}
          onLabelChange={onLabelDraftChange}
          onNotesChange={onNotesDraftChange}
          onSave={onSaveLabel}
        />
      ) : null}
      {expanded ? (
        <div className="tx-related">
          {tx.feeSats !== null ? (
            <p className="terminal-meta">fee: {formatBalance(tx.feeSats, balanceUnit)}</p>
          ) : null}
          <p className="terminal-meta">Related addresses ({tx.relatedAddresses.length}):</p>
          {tx.relatedAddresses.map((rel, i) => (
            <div className="tx-related-tag" key={i}>
              <span className="terminal-meta">{rel.role} / {rel.chain}[{rel.index}]</span>
              <code>{rel.address}</code>
              <span className="terminal-meta">{formatBalance(rel.valueSats, balanceUnit)}</span>
            </div>
          ))}
          <p className="tx-privacy-hint muted">
            Extended public key reveals all wallet addresses. Treat this data as sensitive.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function formatTransactionAmount(netSats: number, unit: "sats" | "btc"): string {
  const abs = Math.abs(netSats);
  const formatted = formatBalance(abs, unit);
  return netSats >= 0 ? `+${formatted}` : `-${formatted}`;
}

function formatDirection(direction: WalletTransaction["direction"]): string {
  if (direction === "incoming") return "IN";
  if (direction === "outgoing") return "OUT";
  if (direction === "self") return "SELF";
  return "UNKNOWN";
}

function summarizeRelatedAddresses(addresses: WalletTransactionRelatedAddress[]): string {
  const unique = new Map<string, WalletTransactionRelatedAddress>();
  for (const address of addresses) {
    unique.set(`${address.chain}-${address.index}`, address);
  }
  const values = [...unique.values()];
  if (values.length === 0) {
    return "no wallet address match";
  }
  if (values.length > 2) {
    return `${values.length} wallet addresses`;
  }
  return values.map((address) => `${address.chain} #${address.index}`).join(", ");
}

function InlineLabelEditor({
  error,
  label,
  notes,
  saving,
  onCancel,
  onClear,
  onLabelChange,
  onNotesChange,
  onSave
}: {
  error: string;
  label: string;
  notes: string;
  saving: boolean;
  onCancel: () => void;
  onClear: () => void;
  onLabelChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="label-editor">
      <label>
        <span>label</span>
        <input
          maxLength={80}
          placeholder="local label"
          value={label}
          onChange={(event) => onLabelChange(event.target.value)}
        />
      </label>
      <label>
        <span>notes</span>
        <textarea
          maxLength={1000}
          placeholder="optional local note"
          rows={3}
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
        />
      </label>
      <div className="button-row">
        <button className="compact-button" disabled={saving} type="button" onClick={onSave}>
          Save
        </button>
        <button className="secondary-button compact-button" disabled={saving} type="button" onClick={onClear}>
          Clear
        </button>
        <button className="secondary-button compact-button" disabled={saving} type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {error ? <p className="status-message">{error}</p> : null}
      <p className="label-privacy-hint muted">
        Labels are stored locally in the encrypted vault. They are not written to the Bitcoin network.
      </p>
    </div>
  );
}

function AddressLabelPill({ label }: { label: AddressLabel | null }) {
  if (!label) {
    return <span className="label-pill label-pill-empty">unlabeled</span>;
  }

  return <span className="label-pill">{label.label}</span>;
}

function TransactionLabelPill({ label }: { label: TransactionLabel | null }) {
  if (!label) {
    return null;
  }

  return <span className="label-pill">{label.label}</span>;
}

function AddressTable({
  addresses,
  balanceUnit,
  editingKey,
  getLabel,
  labelDraft,
  labelError,
  labelSaving,
  notesDraft,
  title,
  onBeginEditLabel,
  onCancelEditLabel,
  onClearLabel,
  onCopy,
  onLabelDraftChange,
  onNotesDraftChange,
  onSaveLabel,
  onShowQr
}: {
  addresses: DerivedAddress[];
  balanceUnit: "sats" | "btc";
  editingKey: string;
  getLabel: (address: DerivedAddress) => AddressLabel | null;
  labelDraft: string;
  labelError: string;
  labelSaving: boolean;
  notesDraft: string;
  title: string;
  onBeginEditLabel: (address: DerivedAddress) => void;
  onCancelEditLabel: () => void;
  onClearLabel: (address: DerivedAddress) => Promise<void>;
  onCopy: (address: DerivedAddress) => void;
  onLabelDraftChange: (value: string) => void;
  onNotesDraftChange: (value: string) => void;
  onSaveLabel: (address: DerivedAddress) => Promise<void>;
  onShowQr: (address: DerivedAddress) => void;
}) {
  return (
    <div className="address-section">
      <h2>&gt; {title}</h2>
      <div className="address-table">
        <div className="address-row address-row-header" aria-hidden="true">
          <span>Chain</span>
          <span>Index</span>
          <span>Address</span>
          <span>Label</span>
          <span>Balance</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        {addresses.map((address) => {
          const label = getLabel(address);
          const isEditing = editingKey === addressLabelKey(address);
          return (
            <div className="address-row" key={`${address.chain}-${address.index}`}>
              <div className="address-cell">
                <dt>Chain</dt>
                <dd>{address.chain}</dd>
              </div>
              <div className="address-cell address-index">
                <dt>Index</dt>
                <dd>#{address.index}</dd>
              </div>
              <div className="address-cell address-value">
                <dt>Address</dt>
                <code>{address.address}</code>
                <span className="muted">{address.path}</span>
              </div>
              <div className="address-cell">
                <dt>Label</dt>
                <AddressLabelPill label={label} />
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
                  Copy
                </button>
                <button className="secondary-button compact-button" type="button" onClick={() => onShowQr(address)}>
                  QR
                </button>
                <button
                  className="secondary-button compact-button"
                  type="button"
                  onClick={() => onBeginEditLabel(address)}
                >
                  Label
                </button>
              </div>
              {isEditing ? (
                <div className="address-label-editor">
                  <InlineLabelEditor
                    error={labelError}
                    label={labelDraft}
                    notes={notesDraft}
                    saving={labelSaving}
                    onCancel={onCancelEditLabel}
                    onClear={() => void onClearLabel(address)}
                    onLabelChange={onLabelDraftChange}
                    onNotesChange={onNotesDraftChange}
                    onSave={() => void onSaveLabel(address)}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
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

function getNextReceiveMessage({
  loading,
  mempoolBadgeStatus,
  usageLookupFailed
}: {
  loading: boolean;
  mempoolBadgeStatus: StatusKind;
  usageLookupFailed: boolean;
}): string {
  if (loading) {
    return "Calculating next receive address...";
  }

  if (mempoolBadgeStatus === "degraded" || mempoolBadgeStatus === "offline") {
    return "Mempool lookup is degraded. Next receive may be incomplete.";
  }

  if (usageLookupFailed) {
    return "Address usage lookup is incomplete. Refresh to calculate the next receive address.";
  }

  return "Address usage lookup is incomplete. Refresh to calculate the next receive address.";
}

function getMempoolHelperText(status: StatusKind): string {
  if (status === "online") {
    return "Mempool lookup is healthy.";
  }
  if (status === "offline") {
    return "Mempool lookup is unavailable.";
  }
  return "Mempool lookup partially failed.";
}

function formatCheckedAt(value: string | undefined): string {
  if (!value) {
    return "unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function getAddressLabel(
  wallet: WalletRecord,
  chain: "receive" | "change",
  index: number
): AddressLabel | null {
  return (wallet.addressLabels ?? []).find((label) => label.chain === chain && label.index === index) ?? null;
}

function getTransactionLabel(wallet: WalletRecord, txid: string): TransactionLabel | null {
  return (wallet.transactionLabels ?? []).find((label) => label.txid === txid) ?? null;
}

function addressLabelKey(address: Pick<DerivedAddress, "chain" | "index">): string {
  return `${address.chain}-${address.index}`;
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
  const embeddedMatch = value.match(/\b(xpub|ypub|zpub|tpub|upub|vpub)[1-9A-HJ-NP-Za-km-z]{40,}\b/);
  return embeddedMatch?.[0] ?? null;
}

function detectImportMetadata(
  importText: string,
  network: WalletRecord["network"],
  sourceDevice: SourceDevice
): {
  extendedPublicKey: string | null;
  type: ExtendedPublicKeyType | null;
  network: WalletRecord["network"] | null;
  scriptType: WalletScriptType;
  accountPath: string | null;
  masterFingerprint: string | null;
  importFormat: ImportFormat;
  privateInput: boolean;
  warnings: string[];
  unsupportedReason: string | null;
} {
  const trimmed = importText.trim();
  if (!trimmed) {
    return emptyImportDetection();
  }
  if (looksPrivateImport(trimmed)) {
    return {
      ...emptyImportDetection(),
      privateInput: true,
      warnings: [],
      unsupportedReason: watchOnlyImportError
    };
  }

  const json = parseImportJson(trimmed);
  if (json) {
    const xfp = stringField(json, "xfp") ?? stringField(json, "fingerprint");
    const candidate =
      jsonImportCandidate(json, "bip84", "native-segwit") ??
      jsonImportCandidate(json, "bip49", "nested-segwit") ??
      jsonImportCandidate(json, "bip44", "legacy") ??
      jsonImportCandidate(json, "xpub", "unknown");
    return {
      extendedPublicKey: candidate?.key ?? null,
      type: candidate?.key ? candidate.key.slice(0, 4) as ExtendedPublicKeyType : null,
      network: candidate?.key ? networkForKey(candidate.key) : null,
      scriptType: candidate?.scriptType ?? "unknown",
      accountPath: candidate?.accountPath ?? null,
      masterFingerprint: xfp?.toLowerCase() ?? null,
      importFormat: "coldcard-json",
      privateInput: false,
      warnings: candidate ? [] : ["JSON detected, but no supported watch-only extended public key was found."],
      unsupportedReason: candidate ? null : "Unsupported JSON export"
    };
  }

  const ur = trimmed.toLowerCase();
  if (ur.startsWith("ur:")) {
    const key = extractExtendedPublicKey(trimmed);
    return {
      extendedPublicKey: key,
      type: key ? key.slice(0, 4) as ExtendedPublicKeyType : null,
      network: key ? networkForKey(key) : network,
      scriptType: key ? scriptTypeForKey(key) : "unknown",
      accountPath: null,
      masterFingerprint: null,
      importFormat: ur.startsWith("ur:crypto-account")
        ? sourceDevice === "passport-core"
          ? "passport-setup-qr"
          : "crypto-account-ur"
        : "ur-xpub",
      privateInput: false,
      warnings: ["UR payload detected. Animated UR/BCUR decoding is not fully supported yet."],
      unsupportedReason: key ? null : "UR decoding unsupported yet. Use descriptor/file/paste xpub import."
    };
  }

  const descriptorScript = descriptorScriptType(trimmed);
  if (descriptorScript) {
    const key = extractExtendedPublicKey(trimmed);
    const origin = trimmed.match(/\[([0-9a-fA-F]{8})(?:\/([^\]]+))?\]/);
    return {
      extendedPublicKey: key,
      type: key ? key.slice(0, 4) as ExtendedPublicKeyType : null,
      network: key ? networkForKey(key) : network,
      scriptType: descriptorScript,
      accountPath: origin?.[2] ? normalizeAccountPath(origin[2]) : accountPathFor(descriptorScript, network),
      masterFingerprint: origin?.[1]?.toLowerCase() ?? null,
      importFormat: "descriptor",
      privateInput: false,
      warnings: descriptorScript === "taproot" ? ["Taproot metadata can be stored, but taproot address derivation is not supported yet."] : [],
      unsupportedReason: key ? null : "Descriptor does not contain a supported extended public key."
    };
  }

  const keyExpression = trimmed.match(/^\[([0-9a-fA-F]{8})(?:\/([^\]]+))?\]((xpub|ypub|zpub|tpub|upub|vpub)[1-9A-HJ-NP-Za-km-z]{40,})/);
  if (keyExpression) {
    const key = keyExpression[3] ?? "";
    return {
      extendedPublicKey: key,
      type: key.slice(0, 4) as ExtendedPublicKeyType,
      network: networkForKey(key),
      scriptType: scriptTypeForKey(key),
      accountPath: keyExpression[2] ? normalizeAccountPath(keyExpression[2]) : accountPathFor(scriptTypeForKey(key), network),
      masterFingerprint: keyExpression[1]?.toLowerCase() ?? null,
      importFormat: "key-expression",
      privateInput: false,
      warnings: scriptTypeForKey(key) === "unknown" ? ["xpub/tpub detected. Confirm script type before receiving funds."] : [],
      unsupportedReason: null
    };
  }

  const key = extractExtendedPublicKey(trimmed);
  if (key) {
    const scriptType = scriptTypeForKey(key);
    return {
      extendedPublicKey: key,
      type: key.slice(0, 4) as ExtendedPublicKeyType,
      network: networkForKey(key),
      scriptType,
      accountPath: accountPathFor(scriptType, networkForKey(key) ?? network),
      masterFingerprint: null,
      importFormat: key.startsWith("xpub") || key.startsWith("tpub") ? "plain-xpub" : "slip132",
      privateInput: false,
      warnings: scriptType === "unknown" ? ["xpub/tpub detected. Confirm script type before receiving funds."] : [],
      unsupportedReason: null
    };
  }

  return {
    ...emptyImportDetection(),
    importFormat: "unknown",
    warnings: ["No supported watch-only import payload detected."],
    unsupportedReason: "Unsupported import format"
  };
}

function emptyImportDetection() {
  return {
    extendedPublicKey: null,
    type: null,
    network: null,
    scriptType: "unknown" as const,
    accountPath: null,
    masterFingerprint: null,
    importFormat: "unknown" as const,
    privateInput: false,
    warnings: [],
    unsupportedReason: null
  };
}

function looksPrivateImport(value: string): boolean {
  const lower = value.trim().toLowerCase();
  const words = lower.match(/\b[a-z]{3,10}\b/g) ?? [];
  return /\b(xprv|yprv|zprv|tprv|uprv|vprv)[1-9a-hj-np-z]+\b/i.test(value) ||
    /\b[5KL][1-9A-HJ-NP-Za-km-z]{50,51}\b/.test(value) ||
    /(wif|privatekey|private_key|privkey|seed phrase|mnemonic)/i.test(value) ||
    ((words.length === 12 || words.length === 18 || words.length === 24) && lower === words.join(" "));
}

function descriptorScriptType(value: string): WalletScriptType | null {
  const descriptor = value.replace(/#[a-z0-9]+$/i, "");
  if (descriptor.startsWith("sh(wpkh(")) return "nested-segwit";
  if (descriptor.startsWith("wpkh(")) return "native-segwit";
  if (descriptor.startsWith("pkh(")) return "legacy";
  if (descriptor.startsWith("tr(")) return "taproot";
  return null;
}

function scriptTypeForKey(value: string): WalletScriptType {
  if (value.startsWith("ypub") || value.startsWith("upub")) return "nested-segwit";
  if (value.startsWith("zpub") || value.startsWith("vpub")) return "native-segwit";
  return "unknown";
}

function networkForKey(value: string): WalletRecord["network"] {
  return value.startsWith("tpub") || value.startsWith("upub") || value.startsWith("vpub")
    ? "testnet"
    : "mainnet";
}

function accountPathFor(scriptType: WalletScriptType, network: WalletRecord["network"]): string | null {
  const coinType = network === "mainnet" ? "0" : "1";
  if (scriptType === "legacy") return `m/44'/${coinType}'/0'`;
  if (scriptType === "nested-segwit") return `m/49'/${coinType}'/0'`;
  if (scriptType === "native-segwit") return `m/84'/${coinType}'/0'`;
  if (scriptType === "taproot") return `m/86'/${coinType}'/0'`;
  return null;
}

function normalizeAccountPath(value: string): string {
  return `m/${value.replace(/h/gi, "'").replace(/^m\//, "")}`;
}

function parseImportJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function jsonImportCandidate(
  value: Record<string, unknown>,
  field: string,
  scriptType: WalletScriptType
): { key: string; scriptType: WalletScriptType; accountPath: string | null } | null {
  const candidate = value[field];
  if (typeof candidate === "string") {
    const key = extractExtendedPublicKey(candidate);
    return key ? { key, scriptType, accountPath: accountPathFor(scriptType, networkForKey(key)) } : null;
  }
  if (typeof candidate === "object" && candidate !== null && !Array.isArray(candidate)) {
    const record = candidate as Record<string, unknown>;
    const key = extractExtendedPublicKey(String(record.xpub ?? record.ypub ?? record.zpub ?? ""));
    const path = typeof record.deriv === "string"
      ? record.deriv
      : typeof record.derivation === "string"
        ? record.derivation
        : typeof record.path === "string"
          ? record.path
          : null;
    return key ? { key, scriptType, accountPath: path ? normalizeAccountPath(path) : accountPathFor(scriptType, networkForKey(key)) } : null;
  }
  return null;
}

function stringField(value: Record<string, unknown>, field: string): string | null {
  return typeof value[field] === "string" ? value[field] as string : null;
}

function maskExtendedPublicKey(value: string): string {
  if (value.length <= 16) {
    return "********";
  }

  return `${value.slice(0, 8)}...${value.slice(-8)}`;
}

function deviceLabel(sourceDevice: SourceDevice): string {
  return sourceDeviceOptions.find((option) => option.value === sourceDevice)?.label ?? "Other";
}

function deviceAlias(sourceDevice: SourceDevice): string {
  const aliases: Record<SourceDevice, string> = {
    coldcard: "COLD",
    keystone: "KEYSTONE",
    seedsigner: "SEEDSIGNER",
    krux: "KRUX",
    "passport-core": "PASSPORT",
    jade: "JADE",
    other: "OTHER"
  };
  return aliases[sourceDevice];
}

function formatScriptType(scriptType: WalletScriptType): string {
  return scriptType.replace("-", " ");
}

function maskRawImport(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= 96) {
    return compact;
  }
  return `${compact.slice(0, 64)}...${compact.slice(-24)}`;
}

function walletSafetyWarnings(wallet: WalletRecord): string[] {
  const warnings: string[] = [];
  if ((wallet.type === "zpub" || wallet.type === "vpub") && wallet.scriptType !== "native-segwit") {
    warnings.push("zpub/vpub usually maps to native SegWit. Verify script type before receiving funds.");
  }
  if ((wallet.type === "ypub" || wallet.type === "upub") && wallet.scriptType !== "nested-segwit") {
    warnings.push("ypub/upub usually maps to nested SegWit. Verify script type before receiving funds.");
  }
  if ((wallet.type === "xpub" || wallet.type === "tpub") && wallet.scriptType !== "legacy") {
    warnings.push("xpub/tpub can be used with multiple policies. Verify the receive address on your cold wallet.");
  }
  if (wallet.scriptType === "taproot") {
    warnings.push("Taproot metadata is stored, but taproot address derivation is not supported in this phase.");
  }
  if (wallet.importFormat === "crypto-account-ur" || wallet.importFormat === "passport-setup-qr" || wallet.importFormat === "ur-xpub") {
    warnings.push("UR payloads are detected, but animated UR/BCUR decoding is not complete yet. Prefer descriptor/file import.");
  }
  return warnings;
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
