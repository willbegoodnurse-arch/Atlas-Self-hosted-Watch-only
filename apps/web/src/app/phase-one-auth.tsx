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
  autoLockMinutes: number | null;
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
  utxoNotes: UtxoNote[];
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

type UtxoNote = {
  txid: string;
  vout: number;
  note: string;
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
  | "crypto-hdkey-ur"
  | "ur-xpub"
  | "passport-setup-qr"
  | "bbqr"
  | "psbt-ur"
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

type FulcrumRuntimeConfig = {
  host: string | null;
  port: number;
  tlsPort: number;
  useTls: boolean;
  configured: boolean;
};

type FulcrumStatusResponse = {
  status: "online" | "offline" | "not-configured";
  host: string | null;
  port: number;
  useTls: boolean;
  latencyMs: number | null;
  checkedAt: string;
  error: string | null;
};

type RuntimeSettingsResponse = {
  apiMode: string;
  backendKind: "mempool-public" | "mempool-local" | "fulcrum" | "unknown";
  mempoolApiUrl: string;
  mempoolApiHost: string;
  isLocalMempool: boolean;
  fulcrum: FulcrumRuntimeConfig;
  defaultNetwork: string;
  defaultCurrency: string;
  defaultUnit: string;
};

type BroadcastStatusResponse = {
  enabled: boolean;
  backend: "disabled" | "core";
  configured: boolean;
  message?: string;
};

type BroadcastResponse = {
  status: "broadcasted";
  backend: "core";
  txid: string;
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

type WalletScanSummary = {
  receiveScanned: number;
  changeScanned: number;
  pagesPerAddress: number;
  uniqueTransactions: number;
  failedLookups: number;
  truncated: boolean;
};

type WalletUtxo = {
  txid: string;
  vout: number;
  outpoint: string;
  valueSats: number;
  status: "confirmed" | "unconfirmed";
  blockHeight: number | null;
  blockTime: number | null;
  address: string;
  chain: "receive" | "change";
  index: number;
  path: string | null;
};

type UtxoSummary = {
  totalUtxos: number;
  confirmedUtxos: number;
  unconfirmedUtxos: number;
  totalSats: number;
  confirmedSats: number;
  unconfirmedSats: number;
  largestUtxoSats: number | null;
  smallestUtxoSats: number | null;
};

type WalletUtxosResponse = {
  walletId: string;
  chain: string;
  addressLimit: number;
  includeUnconfirmed: boolean;
  unit: "sats";
  status: "online" | "partial" | "offline";
  utxos: WalletUtxo[];
  summary: UtxoSummary;
  failedAddresses: Array<{
    address: string;
    chain: "receive" | "change";
    index: number;
    error: string;
  }>;
};

type CreatePsbtResponse = {
  psbtBase64: string;
  inputs: Array<{
    txid: string;
    vout: number;
    outpoint: string;
    valueSats: number;
    address: string;
    chain: "receive" | "change";
    index: number;
    path: string | null;
  }>;
  outputs: Array<{
    address: string;
    valueSats: number;
    type: "recipient" | "change";
  }>;
  feeSats: number;
  feeRateSatsPerVbyte: number;
  estimatedVbytes: number;
  totalInputSats: number;
  changeAddress: string | null;
  changeSats: number;
};

type FeeEstimatesResponse = {
  status: "online";
  estimates: {
    fastestFee: number | null;
    halfHourFee: number | null;
    hourFee: number | null;
    economyFee: number | null;
    minimumFee: number | null;
  };
};

type VerifyPsbtResponse = {
  status: "valid" | "warning" | "invalid";
  signed: boolean;
  finalizable: boolean;
  extractable: boolean;
  txHex: string | null;
  txid: string | null;
  feeSats: number | null;
  inputs: Array<{
    txid: string;
    vout: number;
    valueSats: number | null;
    address: string | null;
    belongsToWallet: boolean;
  }>;
  outputs: Array<{
    address: string | null;
    valueSats: number;
    type: "recipient" | "change" | "external" | "unknown";
    belongsToWallet: boolean;
  }>;
  checks: {
    recipientMatches: boolean | null;
    amountMatches: boolean | null;
    changeAddressMatches: boolean | null;
    feeMatches: boolean | null;
    hasWalletChange: boolean;
    hasUnexpectedExternalOutputs: boolean;
  };
  warnings: string[];
  errors: string[];
};

type WalletTransactionsResponse = {
  walletId: string;
  chain: string;
  addressLimit: number;
  txLimit: number;
  pages: number;
  status: "online" | "partial" | "offline";
  transactions: WalletTransaction[];
  failedAddresses: Array<{
    address: string;
    chain: "receive" | "change";
    index: number;
    error: string;
  }>;
  scanSummary?: WalletScanSummary;
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
      console.error("Atlas session request failed", {
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
            <p className="eyebrow">Atlas</p>
            <h1>{view === "dashboard" ? (initialWalletId ? "Wallet detail" : "Wallets") : "Secure access"}</h1>
          </div>
          <span className="phase-pill">{view === "dashboard" ? "ATLAS NODE" : "AUTH NODE"}</span>
        </div>

        {message ? <p className="status-message">{message}</p> : null}
        <p className="api-diagnostic">API: {apiUrl}</p>
        {view !== "loading" ? (
          <p className="terminal-mantra">Self-hosted Bitcoin watch-only wallet for your own node.</p>
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
  const [fulcrumStatus, setFulcrumStatus] = useState<FulcrumStatusResponse | null>(null);
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
    const [statusResult, settingsResult, fulcrumResult] = await Promise.allSettled([
      apiRequest<MempoolStatusResponse>(apiUrl, "/api/status/mempool"),
      apiRequest<RuntimeSettingsResponse>(apiUrl, "/api/settings/runtime"),
      apiRequest<FulcrumStatusResponse>(apiUrl, "/api/status/fulcrum")
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

    if (fulcrumResult.status === "fulfilled") {
      setFulcrumStatus(fulcrumResult.value);
    } else {
      setFulcrumStatus(null);
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
          tip: {mempoolStatus?.tipHeight
            ? new Intl.NumberFormat("en-US").format(mempoolStatus.tipHeight)
            : mempoolStatus?.status === "offline"
              ? "offline"
              : mempoolStatus
                ? "syncing"
                : "not connected"}
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
        {status.autoLockMinutes != null ? (
          <div>
            <dt>Auto-lock</dt>
            <dd>After {status.autoLockMinutes} min inactivity</dd>
          </div>
        ) : null}
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
              fulcrumStatus={fulcrumStatus}
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
  const [qrFrames, setQrFrames] = useState<string[]>([]);
  const [qrFrameTotal, setQrFrameTotal] = useState<number | null>(null);
  const [qrFrameFormat, setQrFrameFormat] = useState<string>("");
  const scannerControls = useRef<IScannerControls | null>(null);
  const scannerVideo = useRef<HTMLVideoElement | null>(null);
  const detected = useMemo(() => detectImportMetadata(importText, network, sourceDevice), [
    importText,
    network,
    sourceDevice
  ]);
  const effectiveScriptType = scriptType !== "unknown" ? scriptType : detected.scriptType;
  const networkMismatch =
    detected.network !== null &&
    !(detected.network === "testnet" && (network === "testnet" || network === "signet")) &&
    detected.network !== network;
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
    if (detected.scriptType !== "unknown") {
      setScriptType(detected.scriptType);
    }
  }, [detected.scriptType]);

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
          const classification = classifyQrFrame(scannedValue);

          if (classification.format === "psbt-ur") {
            setScannerMessage("PSBT signing request detected. This wallet only accepts watch-only exports (xpub, descriptor, JSON).");
            stopScanner();
            setScannerOpen(false);
            return;
          }

          if (classification.format === "bbqr") {
            setScannerMessage("BBQr multipart QR detected. Export a descriptor or Generic JSON from Coldcard and import via Paste or File.");
            stopScanner();
            setScannerOpen(false);
            return;
          }

          if (classification.animated) {
            setQrFrames((prev) => prev.includes(scannedValue) ? prev : [...prev, scannedValue]);
            setQrFrameTotal(classification.totalFrames);
            setQrFrameFormat(classification.format);
            setScannerMessage("Animated QR detected. Keep scanning until all frames are collected, then use Try Import.");
            return;
          }

          if (!classification.watchOnlyCandidate) {
            setScannerMessage("QR did not contain a supported watch-only import payload.");
            return;
          }

          setImportText(scannedValue);
          setScannerMessage("Watch-only import QR scanned.");
          stopScanner();
          setScannerOpen(false);
        }
      );
      setScannerMessage("Point the camera at an xpub, descriptor, key expression, JSON, or UR QR.");
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

  function resetFrames() {
    setQrFrames([]);
    setQrFrameTotal(null);
    setQrFrameFormat("");
    setScannerMessage("Frames cleared. Point the camera at the animated QR again.");
  }

  function tryImportFromFrames() {
    for (const frame of qrFrames) {
      const embedded = extractExtendedPublicKey(frame);
      if (embedded) {
        setImportText(frame);
        setScannerMessage("Extracted watch-only data from animated QR frames.");
        stopScanner();
        setScannerOpen(false);
        return;
      }
    }
    if (qrFrames.length > 0) {
      setImportText(qrFrames[0]!);
      setScannerMessage("Using first QR frame — animated UR decoding is limited. Verify the import preview carefully.");
      stopScanner();
      setScannerOpen(false);
      return;
    }
    setScannerMessage("No frames collected yet. Point the camera at the animated QR.");
  }

  return (
    <form className="form-stack vault-section" onSubmit={handleSubmit}>
      <h2>Register watch-only wallet</h2>
      <div className="terminal-panel import-notice">
        <p className="terminal-heading">&gt; WATCH-ONLY IMPORT ONLY</p>
        <p className="muted">
          Enter only <strong>xpub, ypub, zpub, tpub, upub, or vpub</strong> extended public keys,
          output descriptors, or compatible JSON exports from your hardware wallet.
          Never enter seed phrases, private keys, or wallet passwords.
        </p>
        <p className="muted">
          Wallet data is stored in this server's encrypted vault. Extended public keys reveal your
          wallet's address history — treat them as sensitive, not as private keys.
        </p>
      </div>
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
      {networkMismatch ? (
        <p className="status-message">
          Network mismatch: this looks like a {detected.network} key ({detected.type ?? "unknown prefix"}),
          but the selected network is {network}.
          {detected.network === "mainnet"
            ? " xpub/ypub/zpub are mainnet keys."
            : " tpub/upub/vpub are testnet keys (also compatible with signet)."}
          {" "}Verify the network before saving.
        </p>
      ) : null}

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
          <input
            readOnly
            value={detected.type
              ? `${detected.type} — ${describeKeyType(detected.type)}`
              : "Waiting for watch-only import"}
          />
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
      {detected.privateInput ? (
        <p className="status-message">{detected.unsupportedReason ?? watchOnlyImportError}</p>
      ) : null}
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
            {qrFrameFormat ? (
              <p className="muted">
                format: {qrFrameFormat} &bull; frames: {qrFrames.length}{qrFrameTotal ? `/${qrFrameTotal}` : ""}
              </p>
            ) : null}
            {qrFrames.length > 0 ? (
              <div className="tab-row">
                <button className="secondary-button compact-button" type="button" onClick={resetFrames}>
                  Reset
                </button>
                <button className="compact-button" type="button" onClick={tryImportFromFrames}>
                  Try Import
                </button>
              </div>
            ) : null}
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
    coldcard: "Coldcard: use Export Wallet > Descriptor or Generic JSON — static QR or file. BBQr multipart QR is detected but not fully decoded; use file/paste instead. Confirm XFP, account path, and script type.",
    keystone: "Keystone: animated crypto-account UR QR is detected via frame collection — scan all frames then use Try Import. Descriptor file import is also available. Verify the first receive address on-device.",
    seedsigner: "SeedSigner: static xpub or UR xpub QR is supported. For animated UR, scan all frames then use Try Import. Verify fingerprint, derivation path, and script type.",
    krux: "Krux: xpub/ypub/zpub QR or SD card text export. Verify fingerprint, derivation path, and script type match the device display.",
    "passport-core": "Passport Core: animated setup QR is detected via frame collection — scan all frames then use Try Import. Descriptor or xpub export also supported. Verify the first receive address on Passport.",
    jade: "Jade: use Account Export > Xpub or descriptor export. Verify the first receive address on the device before receiving funds.",
    other: "Other device: prefer descriptor or [fingerprint/path]xpub import. Confirm script type, account path, and first receive address before receiving funds."
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
        <p className="terminal-mantra">Self-hosted Bitcoin watch-only wallet for your own node.</p>
      </div>
    );
  }

  return (
    <div className="wallet-list">
      <p className="muted storage-notice">
        {wallets.length} watch-only wallet{wallets.length !== 1 ? "s" : ""} stored in this server's encrypted vault.
        Extended public keys are privacy-sensitive — they are not private keys and cannot spend funds,
        but they reveal your wallet's address history.
      </p>
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
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [miniBalance, setMiniBalance] = useState<BalanceSummary | null>(null);
  const [miniBalanceStatus, setMiniBalanceStatus] = useState<"loading" | "ready" | "degraded" | "offline">("loading");
  const [name, setName] = useState(wallet.name);
  const [gapLimit, setGapLimit] = useState(wallet.gapLimit);
  const [revealXpubOpen, setRevealXpubOpen] = useState(false);

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
          {deleteConfirming ? (
            <>
              <button
                className="danger-button compact-button"
                disabled={busy}
                type="button"
                onClick={() => void onDelete(wallet.id)}
              >
                Confirm remove
              </button>
              <button
                className="secondary-button compact-button"
                type="button"
                onClick={() => setDeleteConfirming(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              className="secondary-button compact-button"
              type="button"
              onClick={() => setDeleteConfirming(true)}
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {deleteConfirming ? (
        <div className="terminal-panel remove-confirm-panel">
          <p className="muted">
            Remove <strong>{wallet.name}</strong> from the vault?
            This removes the watch-only wallet data only — it does not affect funds or the real wallet.
            You can re-add it later using the xpub/ypub/zpub.
          </p>
        </div>
      ) : null}

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
              ? "syncing…"
              : miniBalance != null
                ? formatBalance(miniBalance.totalBalance, "sats")
                : "—"}
          </dd>
        </div>
        <div>
          <dt>Confirmed</dt>
          <dd>
            {miniBalanceStatus === "loading"
              ? "…"
              : miniBalance != null
                ? formatBalance(miniBalance.confirmedBalance, "sats")
                : "—"}
          </dd>
        </div>
        <div>
          <dt>Unconfirmed</dt>
          <dd>
            {miniBalanceStatus === "loading"
              ? "…"
              : miniBalance != null
                ? formatBalance(miniBalance.unconfirmedBalance, "sats")
                : "—"}
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
            <code>{wallet.extendedPublicKey}</code>
            <button
              className="secondary-button compact-button"
              type="button"
              onClick={() => setRevealXpubOpen(true)}
            >
              Reveal
            </button>
          </dd>
        </div>
      </dl>
      {revealXpubOpen ? (
        <XpubRevealModal
          apiUrl={apiUrl}
          walletId={wallet.id}
          walletName={wallet.name}
          onClose={() => setRevealXpubOpen(false)}
        />
      ) : null}
    </article>
  );
}

const XPUB_REVEAL_AUTO_CLOSE_SECONDS = 60;

function XpubRevealModal({
  apiUrl,
  walletId,
  walletName,
  onClose
}: {
  apiUrl: string;
  walletId: string;
  walletName: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"warning" | "revealed">("warning");
  const [xpub, setXpub] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(XPUB_REVEAL_AUTO_CLOSE_SECONDS);

  useEffect(() => {
    if (step !== "revealed") return;
    setSecondsLeft(XPUB_REVEAL_AUTO_CLOSE_SECONDS);
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          onClose();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [step, onClose]);

  async function handleReveal() {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await apiRequest<{ walletId: string; extendedPublicKey: string }>(
        apiUrl,
        `/api/wallets/${walletId}/xpub`
      );
      setXpub(data.extendedPublicKey);
      setStep("revealed");
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Failed to load extended public key");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!xpub) return;
    void navigator.clipboard.writeText(xpub).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="qr-modal" role="dialog" aria-modal="true" aria-label="Reveal extended public key">
      <div className="qr-dialog">
        {step === "warning" ? (
          <>
            <div className="wallet-card-header">
              <h3>Reveal extended public key</h3>
            </div>
            <p className="muted">
              <strong>{walletName}</strong> — your extended public key reveals your complete wallet
              address history and all future addresses. Anyone who obtains it can monitor your
              entire Bitcoin activity.
            </p>
            <p className="muted">
              It is not a private key and cannot spend funds, but it is privacy-sensitive. Only
              reveal it if you need to copy it for a specific purpose.
            </p>
            {fetchError ? <p className="status-message error">{fetchError}</p> : null}
            <div className="tab-row">
              <button className="secondary-button" type="button" onClick={onClose} disabled={loading}>
                Cancel
              </button>
              <button
                className="compact-button"
                type="button"
                onClick={() => void handleReveal()}
                disabled={loading}
              >
                {loading ? "Loading…" : "I understand, show xpub"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="wallet-card-header">
              <h3>Extended public key</h3>
              <span className="muted">Auto-closing in {secondsLeft}s</span>
            </div>
            <p className="muted">Keep this private. Do not share it unless you trust the recipient.</p>
            <code className="xpub-reveal-code">{xpub}</code>
            <div className="tab-row">
              <button className="secondary-button compact-button" type="button" onClick={handleCopy}>
                {copied ? "Copied!" : "Copy"}
              </button>
              <button className="compact-button" type="button" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function WalletDetailView({
  apiUrl,
  fulcrumStatus,
  mempoolBadgeStatus,
  mempoolStatus,
  mempoolStatusError,
  runtimeSettings,
  wallet,
  onRefreshConnection,
  onWalletChange
}: {
  apiUrl: string;
  fulcrumStatus: FulcrumStatusResponse | null;
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
  const [utxoBadgeStatus, setUtxoBadgeStatus] = useState<StatusKind>("degraded");
  const [refreshToken, setRefreshToken] = useState(0);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const warnings = walletSafetyWarnings(wallet);
  const accountPath = wallet.accountPath ?? wallet.derivationPath ?? "not provided";

  async function refreshAll() {
    setRefreshingAll(true);
    try {
      await onRefreshConnection();
      setRefreshToken((current) => current + 1);
      setLastRefreshed(new Date());
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
            <StatusBadge label="UTXOS" status={utxoBadgeStatus} />
            {lastRefreshed ? (
              <span className="terminal-meta muted">refreshed {lastRefreshed.toLocaleTimeString()}</span>
            ) : null}
          </div>
          <ConnectionPanel
            error={mempoolStatusError}
            fulcrumStatus={fulcrumStatus}
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
        backendKind={runtimeSettings?.backendKind ?? "unknown"}
        balanceUnit={balanceUnit}
        onTxStatusChange={setTxBadgeStatus}
        refreshToken={refreshToken}
        wallet={wallet}
        onWalletChange={onWalletChange}
      />
      <UtxoPanel
        apiUrl={apiUrl}
        balanceUnit={balanceUnit}
        onUtxoStatusChange={setUtxoBadgeStatus}
        refreshToken={refreshToken}
        wallet={wallet}
        onWalletChange={onWalletChange}
      />
      <CreatePsbtBuilderPanel
        apiUrl={apiUrl}
        balanceUnit={balanceUnit}
        wallet={wallet}
      />
      <VerifyPsbtPanel
        apiUrl={apiUrl}
        balanceUnit={balanceUnit}
        wallet={wallet}
      />
    </div>
  );
}

function UtxoPanel({
  apiUrl,
  balanceUnit,
  onUtxoStatusChange,
  refreshToken,
  wallet,
  onWalletChange
}: {
  apiUrl: string;
  balanceUnit: "sats" | "btc";
  onUtxoStatusChange: (status: StatusKind) => void;
  refreshToken: number;
  wallet: WalletRecord;
  onWalletChange: (wallet: WalletRecord) => void;
}) {
  const [utxoResponse, setUtxoResponse] = useState<WalletUtxosResponse | null>(null);
  const [utxoStatus, setUtxoStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [message, setMessage] = useState("");
  const [chain, setChain] = useState<"both" | "receive" | "change">("both");
  const [addressLimit, setAddressLimit] = useState(20);
  const [includeUnconfirmed, setIncludeUnconfirmed] = useState(true);
  const [editingUtxoOutpoint, setEditingUtxoOutpoint] = useState("");
  const [utxoNoteDraft, setUtxoNoteDraft] = useState("");
  const [utxoNoteSaving, setUtxoNoteSaving] = useState(false);
  const [utxoNoteError, setUtxoNoteError] = useState("");

  useEffect(() => {
    void fetchUtxos();
  }, [wallet.id, refreshToken]);

  async function fetchUtxos() {
    setUtxoStatus("loading");
    setMessage("");
    try {
      const params = new URLSearchParams({
        chain,
        addressLimit: String(addressLimit),
        includeUnconfirmed: String(includeUnconfirmed)
      });
      const response = await apiRequest<WalletUtxosResponse>(
        apiUrl,
        `/api/wallets/${wallet.id}/utxos?${params}`
      );
      setUtxoResponse(response);
      setUtxoStatus("loaded");
      onUtxoStatusChange(
        response.status === "online" ? "online" :
        response.status === "offline" ? "offline" : "degraded"
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "UTXO lookup failed — API server may be unreachable");
      setUtxoResponse(null);
      setUtxoStatus("error");
      onUtxoStatusChange("offline");
    }
  }

  function beginEditUtxoNote(utxo: WalletUtxo) {
    const note = getUtxoNote(wallet, utxo.txid, utxo.vout);
    setEditingUtxoOutpoint(utxo.outpoint);
    setUtxoNoteDraft(note?.note ?? "");
    setUtxoNoteError("");
  }

  function cancelEditUtxoNote() {
    setEditingUtxoOutpoint("");
    setUtxoNoteDraft("");
    setUtxoNoteError("");
  }

  async function saveUtxoNote(utxo: WalletUtxo) {
    setUtxoNoteSaving(true);
    setUtxoNoteError("");
    try {
      const response = await apiRequest<{ wallet: WalletRecord }>(apiUrl, `/api/wallets/${wallet.id}/labels/utxo`, {
        method: "PATCH",
        body: JSON.stringify({
          txid: utxo.txid,
          vout: utxo.vout,
          note: utxoNoteDraft
        })
      });
      onWalletChange(response.wallet);
      cancelEditUtxoNote();
    } catch (error) {
      setUtxoNoteError(error instanceof Error ? error.message : "Unable to save UTXO note");
    } finally {
      setUtxoNoteSaving(false);
    }
  }

  async function clearUtxoNote(utxo: WalletUtxo) {
    setUtxoNoteSaving(true);
    setUtxoNoteError("");
    try {
      const response = await apiRequest<{ wallet: WalletRecord }>(apiUrl, `/api/wallets/${wallet.id}/labels/utxo`, {
        method: "PATCH",
        body: JSON.stringify({
          txid: utxo.txid,
          vout: utxo.vout,
          note: ""
        })
      });
      onWalletChange(response.wallet);
      cancelEditUtxoNote();
    } catch (error) {
      setUtxoNoteError(error instanceof Error ? error.message : "Unable to clear UTXO note");
    } finally {
      setUtxoNoteSaving(false);
    }
  }

  const summary = utxoResponse?.summary;
  const utxos = utxoResponse?.utxos ?? [];

  return (
    <section className="tx-history-panel wallet-address-panel">
      <div className="wallet-card-header">
        <p className="terminal-heading">&gt; TRACKED UTXOs</p>
        <button
          className="secondary-button compact-button"
          disabled={utxoStatus === "loading"}
          type="button"
          onClick={() => void fetchUtxos()}
        >
          {utxoStatus === "loading" ? "Loading..." : "Refresh"}
        </button>
      </div>

      <details className="scan-controls-details">
        <summary>Scan controls</summary>
        <div className="scan-controls-grid">
          <label>
            <span>Chain</span>
            <select
              value={chain}
              onChange={(e) => setChain(e.target.value as "both" | "receive" | "change")}
            >
              <option value="both">both</option>
              <option value="receive">receive</option>
              <option value="change">change</option>
            </select>
          </label>
          <label>
            <span>Address depth</span>
            <select
              value={addressLimit}
              onChange={(e) => setAddressLimit(Number(e.target.value))}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
          <label>
            <span>Unconfirmed</span>
            <select
              value={includeUnconfirmed ? "true" : "false"}
              onChange={(e) => setIncludeUnconfirmed(e.target.value === "true")}
            >
              <option value="true">include</option>
              <option value="false">exclude</option>
            </select>
          </label>
          <button
            className="compact-button"
            disabled={utxoStatus === "loading"}
            type="button"
            onClick={() => void fetchUtxos()}
          >
            Apply
          </button>
        </div>
        {addressLimit > 20 ? (
          <p className="muted scan-hint">Deep UTXO scans can be slow on public APIs.</p>
        ) : null}
      </details>

      {utxoResponse ? (
        <div className="terminal-statusline">
          <span
            className={
              utxoResponse.status === "online" ? "status-badge status-online" :
              utxoResponse.status === "offline" ? "status-badge status-offline" :
              "status-badge status-degraded"
            }
          >
            [UTXO: {utxoResponse.status.toUpperCase()}]
          </span>
          {utxoResponse.status !== "online" ? (
            <span className="muted">
              {utxoResponse.status === "offline"
                ? "UTXO lookup failed — Mempool/Fulcrum connection unavailable. Check API settings."
                : "Some address UTXOs could not be fetched — results may be incomplete."}
            </span>
          ) : null}
        </div>
      ) : null}

      {message ? <p className="status-message">{message}</p> : null}

      {summary && utxoStatus === "loaded" ? (
        <div className="terminal-panel utxo-summary">
          <p className="terminal-heading">&gt; SUMMARY</p>
          <dl className="utxo-summary-grid">
            <div>
              <dt>tracked UTXOs</dt>
              <dd>{summary.totalUtxos}</dd>
            </div>
            <div>
              <dt>confirmed</dt>
              <dd>{summary.confirmedUtxos}</dd>
            </div>
            <div>
              <dt>unconfirmed</dt>
              <dd>{summary.unconfirmedUtxos}</dd>
            </div>
            <div>
              <dt>total value</dt>
              <dd>
                {formatBalance(summary.totalSats, "sats")}
                {" "}
                <span className="muted">({formatBalance(summary.totalSats, "btc")})</span>
              </dd>
            </div>
            <div>
              <dt>confirmed</dt>
              <dd>{formatBalance(summary.confirmedSats, balanceUnit)}</dd>
            </div>
            <div>
              <dt>unconfirmed</dt>
              <dd>{formatBalance(summary.unconfirmedSats, balanceUnit)}</dd>
            </div>
            {summary.largestUtxoSats !== null ? (
              <div>
                <dt>largest</dt>
                <dd>{formatBalance(summary.largestUtxoSats, balanceUnit)}</dd>
              </div>
            ) : null}
            {summary.smallestUtxoSats !== null ? (
              <div>
                <dt>smallest</dt>
                <dd>{formatBalance(summary.smallestUtxoSats, balanceUnit)}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}

      {utxoStatus === "loaded" && utxos.length === 0 ? (
        <p className="muted">No UTXOs found in scanned address range.</p>
      ) : null}

      {utxos.length > 0 ? (
        <div className="utxo-list">
          {utxos.map((utxo) => {
            const addrLabel = getAddressLabel(wallet, utxo.chain, utxo.index);
            const txLabel = getTransactionLabel(wallet, utxo.txid);
            const utxoNote = getUtxoNote(wallet, utxo.txid, utxo.vout);
            const isEditingNote = editingUtxoOutpoint === utxo.outpoint;
            return (
              <div key={utxo.outpoint} className="utxo-row terminal-panel">
                <div className="utxo-amount-line">
                  <span className="utxo-value">{formatBalance(utxo.valueSats, "sats")}</span>
                  <span className="muted">({formatBalance(utxo.valueSats, "btc")})</span>
                  <span className={utxo.status === "confirmed" ? "status-badge status-online" : "status-badge status-degraded"}>
                    {utxo.status === "confirmed" ? "confirmed - available for PSBT" : "unconfirmed"}
                  </span>
                  <span className="muted utxo-chain-index">
                    {utxo.chain} #{utxo.index}
                  </span>
                </div>
                <div className="utxo-meta-line">
                  <span className="utxo-address muted">{truncateMiddle(utxo.address, 20)}</span>
                  {addrLabel ? (
                    <span className="label-pill">{addrLabel.label}</span>
                  ) : null}
                </div>
                <div className="utxo-meta-line">
                  <span className="muted utxo-outpoint">{truncateMiddle(utxo.outpoint, 24)}</span>
                  {utxo.blockHeight ? (
                    <span className="muted">block {utxo.blockHeight}</span>
                  ) : (
                    <span className="muted">mempool</span>
                  )}
                </div>
                {utxo.path ? (
                  <div className="utxo-path muted">{utxo.path}</div>
                ) : null}
                {utxoNote ? (
                  <div className="utxo-note-line">
                    <span className="terminal-meta">Tracked UTXO note:</span> {utxoNote.note}
                  </div>
                ) : null}
                {txLabel ? (
                  <div className="utxo-tx-label muted">
                    {txLabel.label ? txLabel.label : "transaction note"}
                    {txLabel.notes ? `: ${txLabel.notes}` : ""}
                  </div>
                ) : null}
                {isEditingNote ? (
                  <InlineNoteEditor
                    error={utxoNoteError}
                    note={utxoNoteDraft}
                    saving={utxoNoteSaving}
                    onCancel={cancelEditUtxoNote}
                    onClear={() => void clearUtxoNote(utxo)}
                    onNoteChange={setUtxoNoteDraft}
                    onSave={() => void saveUtxoNote(utxo)}
                  />
                ) : (
                  <div className="button-row">
                    <button
                      className="secondary-button compact-button"
                      type="button"
                      onClick={() => beginEditUtxoNote(utxo)}
                    >
                      Note
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function CreatePsbtBuilderPanel({
  apiUrl,
  balanceUnit,
  wallet
}: {
  apiUrl: string;
  balanceUnit: "sats" | "btc";
  wallet: WalletRecord;
}) {
  const [builderUtxos, setBuilderUtxos] = useState<WalletUtxo[]>([]);
  const [utxoLoadStatus, setUtxoLoadStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [utxoLoadMessage, setUtxoLoadMessage] = useState("");
  const [selectedOutpoints, setSelectedOutpoints] = useState<string[]>([]);
  const [recipients, setRecipients] = useState([
    { id: "recipient-1", address: "", amount: "", unit: "sats" as "sats" | "btc" }
  ]);
  const [feeRateInput, setFeeRateInput] = useState("5");
  const [feeEstimates, setFeeEstimates] = useState<FeeEstimatesResponse["estimates"] | null>(null);
  const [feeEstimateMessage, setFeeEstimateMessage] = useState("");
  const [feePresetSource, setFeePresetSource] = useState<"Custom" | "Fastest" | "Medium" | "Slow">("Custom");
  const [addressLimit, setAddressLimit] = useState(20);
  const [psbtResult, setPsbtResult] = useState<CreatePsbtResponse | null>(null);
  const [psbtStatus, setPsbtStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [psbtMessage, setPsbtMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [exportFormat, setExportFormat] = useState<"text" | "qr" | "animated" | "bbqr">("text");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrExportMessage, setQrExportMessage] = useState("");

  useEffect(() => {
    void refreshBuilderUtxos();
    void refreshFeeEstimates();
  }, [wallet.id, addressLimit]);

  const selectedUtxos = useMemo(
    () => builderUtxos.filter((utxo) => selectedOutpoints.includes(utxo.outpoint)),
    [builderUtxos, selectedOutpoints]
  );
  const selectedInputSats = selectedUtxos.reduce((sum, utxo) => sum + utxo.valueSats, 0);
  const selectedHasUnconfirmed = selectedUtxos.some((utxo) => utxo.status === "unconfirmed");
  const selectedHasUnknownClassification = false;
  const draftPlan = buildDraftSpendingPlan();

  useEffect(() => {
    if (!psbtResult || exportFormat !== "qr") {
      setQrDataUrl("");
      setQrExportMessage("");
      return;
    }

    setQrExportMessage("Preparing single QR...");
    void QRCode.toDataURL(psbtResult.psbtBase64, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 320
    })
      .then((dataUrl) => {
        setQrDataUrl(dataUrl);
        setQrExportMessage("");
      })
      .catch(() => {
        setQrDataUrl("");
        setQrExportMessage("This PSBT is too large for a single QR. Use text export or wait for animated QR / BBQr support.");
      });
  }, [psbtResult, exportFormat]);

  async function refreshBuilderUtxos() {
    setUtxoLoadStatus("loading");
    setUtxoLoadMessage("");
    try {
      const response = await apiRequest<WalletUtxosResponse>(
        apiUrl,
        `/api/wallets/${wallet.id}/utxos?chain=both&addressLimit=${addressLimit}&includeUnconfirmed=true`
      );
      setBuilderUtxos(response.utxos ?? []);
      setSelectedOutpoints((current) =>
        current.filter((outpoint) => response.utxos.some((utxo) => utxo.outpoint === outpoint))
      );
      setUtxoLoadStatus("loaded");
    } catch (error) {
      setUtxoLoadMessage(error instanceof Error ? error.message : "Backend unavailable while loading tracked UTXOs");
      setUtxoLoadStatus("error");
    }
  }

  async function refreshFeeEstimates() {
    setFeeEstimateMessage("");
    try {
      const response = await apiRequest<FeeEstimatesResponse>(apiUrl, "/api/fees/recommended");
      setFeeEstimates(response.estimates);
    } catch {
      setFeeEstimateMessage("Fee estimates unavailable. Enter a custom fee rate.");
    }
  }

  function toggleUtxo(utxo: WalletUtxo) {
    setSelectedOutpoints((current) =>
      current.includes(utxo.outpoint)
        ? current.filter((outpoint) => outpoint !== utxo.outpoint)
        : [...current, utxo.outpoint]
    );
    setPsbtResult(null);
  }

  function addRecipient() {
    setRecipients((current) => [
      ...current,
      { id: `recipient-${Date.now()}-${current.length}`, address: "", amount: "", unit: "sats" as const }
    ]);
    setPsbtResult(null);
  }

  function removeRecipient(id: string) {
    setRecipients((current) => current.length === 1 ? current : current.filter((recipient) => recipient.id !== id));
    setPsbtResult(null);
  }

  function updateRecipient(
    id: string,
    patch: Partial<{ address: string; amount: string; unit: "sats" | "btc" }>
  ) {
    setRecipients((current) =>
      current.map((recipient) => recipient.id === id ? { ...recipient, ...patch } : recipient)
    );
    setPsbtResult(null);
  }

  function applyFeePreset(kind: "fastest" | "medium" | "slow") {
    const value =
      kind === "fastest"
        ? feeEstimates?.fastestFee
        : kind === "medium"
          ? feeEstimates?.halfHourFee ?? feeEstimates?.hourFee
          : feeEstimates?.economyFee ?? feeEstimates?.minimumFee ?? feeEstimates?.hourFee;
    if (value) {
      setFeeRateInput(String(value));
      setFeePresetSource(kind === "fastest" ? "Fastest" : kind === "medium" ? "Medium" : "Slow");
      setPsbtResult(null);
    }
  }

  async function handleCreate() {
    if (draftPlan.errors.length > 0) {
      setPsbtMessage(draftPlan.errors[0] ?? "Spending plan is incomplete.");
      setPsbtStatus("error");
      return;
    }

    setPsbtStatus("loading");
    setPsbtMessage("");
    setPsbtResult(null);

    try {
      const result = await apiRequest<CreatePsbtResponse>(
        apiUrl,
        `/api/wallets/${wallet.id}/psbt`,
        {
          method: "POST",
          body: JSON.stringify({
            recipients: draftPlan.recipients,
            selectedUtxos: selectedUtxos.map((utxo) => ({ txid: utxo.txid, vout: utxo.vout })),
            feeRateSatsPerVbyte: draftPlan.feeRate,
            addressLimit
          }),
          headers: { "Content-Type": "application/json" }
        }
      );
      setPsbtResult(result);
      setPsbtStatus("done");
    } catch (error) {
      setPsbtMessage(error instanceof Error ? error.message : "Failed to create unsigned PSBT");
      setPsbtStatus("error");
    }
  }

  async function copyPsbt() {
    if (!psbtResult) return;
    try {
      await navigator.clipboard.writeText(psbtResult.psbtBase64);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setPsbtMessage("Clipboard copy failed. Select and copy manually.");
    }
  }

  function downloadPsbt() {
    if (!psbtResult) return;
    const blob = new Blob([psbtResult.psbtBase64], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${wallet.name.replace(/\s+/g, "-")}-unsigned.psbt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function goToVerification() {
    const verify = document.getElementById("signed-psbt-verification") as HTMLDetailsElement | null;
    if (verify) {
      verify.open = true;
      verify.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function buildDraftSpendingPlan() {
    const errors: string[] = [];
    const warnings: string[] = [];
    const parsedRecipients: Array<{ address: string; amountSats: number }> = [];

    if (selectedUtxos.length === 0) {
      errors.push("No UTXO selected.");
    }

    for (const recipient of recipients) {
      const address = recipient.address.trim();
      if (!address) {
        errors.push("Invalid recipient address: recipient address is required.");
      } else if (!looksLikeAddressForWalletNetwork(address, wallet.network)) {
        errors.push("Invalid recipient address for this wallet network.");
      }
      const parsed = parseAmountToSats(recipient.amount, recipient.unit);
      if (parsed.error) {
        errors.push(parsed.error);
      } else if (parsed.sats !== null) {
        if (parsed.sats < 546) {
          errors.push("Output below dust threshold.");
        }
        parsedRecipients.push({ address: recipient.address.trim(), amountSats: parsed.sats });
      }
    }

    const feeRate = parseFeeRate(feeRateInput);
    if (feeRate === null) {
      errors.push("Fee rate invalid.");
    }

    const recipientTotalSats = parsedRecipients.reduce((sum, recipient) => sum + recipient.amountSats, 0);
    const estimatedVbytes = estimateBuilderVbytes(wallet.scriptType, selectedUtxos.length, parsedRecipients.length + 1);
    const estimatedFeeSats = feeRate !== null && estimatedVbytes !== null ? Math.ceil(estimatedVbytes * feeRate) : null;
    const changeSats = estimatedFeeSats !== null ? selectedInputSats - recipientTotalSats - estimatedFeeSats : null;

    if (estimatedVbytes === null) {
      errors.push("This wallet script type is not supported for PSBT creation.");
    }
    if (estimatedFeeSats === null) {
      errors.push("Fee unavailable.");
    } else if (selectedInputSats > 0 && selectedInputSats < recipientTotalSats + estimatedFeeSats) {
      errors.push("Amount exceeds selected input.");
    }
    if (changeSats !== null && changeSats > 0 && changeSats < 546) {
      warnings.push("Dust warning: change is below dust threshold and may be absorbed into the fee.");
    }
    if (changeSats !== null && changeSats >= 546) {
      warnings.push("Change address will be selected from wallet change derivation when the unsigned PSBT is created.");
    }
    if (selectedHasUnconfirmed) {
      warnings.push("One or more selected tracked UTXOs is unconfirmed.");
    }
    if (feeRate !== null && feeRate >= 100) {
      warnings.push("Unusually high fee rate. Review the sat/vB value before creating the unsigned PSBT.");
    }
    if (estimatedFeeSats !== null && recipientTotalSats > 0 && estimatedFeeSats > recipientTotalSats * 0.1) {
      warnings.push("Unusually high fee compared with recipient outputs. Review the fee before signing externally.");
    }

    return {
      recipients: parsedRecipients,
      recipientTotalSats,
      feeRate,
      estimatedVbytes,
      estimatedFeeSats,
      changeSats,
      errors: [...new Set(errors)],
      warnings
    };
  }

  return (
    <details className="tx-history-panel wallet-address-panel create-psbt-details">
      <summary className="wallet-card-header">
        <p className="terminal-heading">&gt; UNSIGNED PSBT BUILDER</p>
      </summary>

      <div className="psbt-safety-notice muted">
        Creates an unsigned PSBT only. Sign it with an external wallet that holds the private keys.
        Nothing is broadcast from this step. Never enter seed phrases or private keys here.
      </div>

      <div className="wallet-card-header">
        <div>
          <p className="terminal-heading">&gt; SELECTED TRACKED UTXOs</p>
          <p className="muted technical-line">
            {selectedUtxos.length} selected / {formatBalance(selectedInputSats, "sats")} ({formatBalance(selectedInputSats, "btc")})
            {selectedHasUnconfirmed ? " / includes unconfirmed" : ""}
            {selectedHasUnknownClassification ? " / includes unknown classification" : ""}
          </p>
        </div>
        <button className="secondary-button compact-button" type="button" onClick={() => void refreshBuilderUtxos()}>
          {utxoLoadStatus === "loading" ? "Loading..." : "Refresh UTXOs"}
        </button>
      </div>

      <label className="psbt-field">
        <span>Address depth</span>
        <select value={addressLimit} onChange={(event) => setAddressLimit(Number(event.target.value))}>
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </label>

      {utxoLoadMessage ? <p className="status-message">{utxoLoadMessage}</p> : null}

      <div className="psbt-utxo-select-list">
        {builderUtxos.map((utxo) => {
          const addressLabel = getAddressLabel(wallet, utxo.chain, utxo.index);
          const txLabel = getTransactionLabel(wallet, utxo.txid);
          const utxoNote = getUtxoNote(wallet, utxo.txid, utxo.vout);
          return (
            <label className="psbt-utxo-select-row" key={utxo.outpoint}>
              <input
                checked={selectedOutpoints.includes(utxo.outpoint)}
                type="checkbox"
                onChange={() => toggleUtxo(utxo)}
              />
              <span>
                <strong>{formatBalance(utxo.valueSats, "sats")}</strong>
                <span className="muted"> ({formatBalance(utxo.valueSats, "btc")})</span>
              </span>
              <code>{truncateMiddle(utxo.txid, 18)}:{utxo.vout}</code>
              <span className="muted">{truncateMiddle(utxo.address, 18)}</span>
              <span className={`status-badge ${utxo.status === "confirmed" ? "status-online" : "status-degraded"}`}>{utxo.status}</span>
              <span className="muted">{utxo.chain} #{utxo.index}</span>
              {addressLabel ? <span className="label-pill">{addressLabel.label}</span> : null}
              {utxoNote ? <span className="muted">{utxoNote.note}</span> : null}
              {txLabel?.notes ? <span className="muted">{txLabel.notes}</span> : null}
            </label>
          );
        })}
        {utxoLoadStatus === "loaded" && builderUtxos.length === 0 ? (
          <p className="muted">No tracked UTXOs found in the selected scan depth.</p>
        ) : null}
      </div>

      <div className="psbt-form">
        <div className="wallet-card-header">
          <p className="terminal-heading">&gt; RECIPIENT OUTPUTS</p>
          <button className="secondary-button compact-button" type="button" onClick={addRecipient}>
            Add recipient
          </button>
        </div>
        {recipients.map((recipient, index) => {
          const parsed = parseAmountToSats(recipient.amount, recipient.unit);
          const recipientLabel = getAddressLabelByAddress(wallet, recipient.address.trim());
          return (
            <div className="recipient-row" key={recipient.id}>
              <label className="psbt-field">
                <span>Recipient {index + 1} address</span>
                <input
                  className="psbt-input"
                  type="text"
                  value={recipient.address}
                  placeholder={wallet.network === "mainnet" ? "bc1q..." : "tb1q..."}
                  onChange={(event) => updateRecipient(recipient.id, { address: event.target.value })}
                  autoComplete="off"
                  spellCheck={false}
                />
                {recipientLabel ? <span className="label-pill">{recipientLabel.label}</span> : null}
              </label>
              <label className="psbt-field">
                <span>Amount</span>
                <input
                  className="psbt-input"
                  inputMode="decimal"
                  value={recipient.amount}
                  placeholder={recipient.unit === "sats" ? "70000000" : "0.70000000"}
                  onChange={(event) => updateRecipient(recipient.id, { amount: event.target.value })}
                />
              </label>
              <label className="psbt-field">
                <span>Unit</span>
                <select
                  value={recipient.unit}
                  onChange={(event) => updateRecipient(recipient.id, { unit: event.target.value as "sats" | "btc" })}
                >
                  <option value="sats">sats</option>
                  <option value="btc">BTC</option>
                </select>
                <span className="muted psbt-field-hint">
                  {parsed.sats !== null ? `= ${formatBalance(parsed.sats, "sats")}` : parsed.error || "Enter an amount"}
                </span>
              </label>
              <button
                className="secondary-button compact-button"
                disabled={recipients.length === 1}
                type="button"
                onClick={() => removeRecipient(recipient.id)}
              >
                Remove
              </button>
            </div>
          );
        })}

        <label className="psbt-field">
          <span>Fee rate (sat/vB)</span>
          <input
            className="psbt-input"
            inputMode="decimal"
            value={feeRateInput}
            onChange={(event) => {
              setFeeRateInput(event.target.value);
              setFeePresetSource("Custom");
              setPsbtResult(null);
            }}
          />
          {parseFeeRate(feeRateInput) !== null && parseFeeRate(feeRateInput)! < 5 ? (
            <span className="muted psbt-field-hint">Low fee rate may not confirm quickly.</span>
          ) : null}
          <span className="muted psbt-field-hint">
            Source: {feePresetSource === "Custom" ? "manual entry" : `${feePresetSource} live mempool estimate`}
          </span>
        </label>

        <div className="button-row">
          <button className="secondary-button compact-button" disabled={!feeEstimates?.fastestFee} type="button" onClick={() => applyFeePreset("fastest")}>
            Fastest
          </button>
          <button className="secondary-button compact-button" disabled={!feeEstimates} type="button" onClick={() => applyFeePreset("medium")}>
            Medium
          </button>
          <button className="secondary-button compact-button" disabled={!feeEstimates} type="button" onClick={() => applyFeePreset("slow")}>
            Slow
          </button>
          <button className="secondary-button compact-button" type="button" onClick={() => void refreshFeeEstimates()}>
            Refresh fees
          </button>
        </div>
        {feeEstimateMessage ? <p className="status-message">{feeEstimateMessage}</p> : null}
        {draftPlan.estimatedFeeSats !== null ? (
          <p className="muted technical-line">
            Estimated fee: {formatBalance(draftPlan.estimatedFeeSats, "sats")} ({formatBalance(draftPlan.estimatedFeeSats, "btc")}) at {draftPlan.feeRate} sat/vB.
          </p>
        ) : null}
      </div>

      <div className="spending-plan terminal-panel">
        <p className="terminal-heading">&gt; SPENDING PLAN</p>
        <div className="spending-plan-flow">
          <div>
            <p className="terminal-meta">Input UTXOs</p>
            {selectedUtxos.length ? selectedUtxos.map((utxo) => {
              const addressLabel = getAddressLabel(wallet, utxo.chain, utxo.index);
              const utxoNote = getUtxoNote(wallet, utxo.txid, utxo.vout);
              return (
                <div className="spending-plan-line" key={utxo.outpoint}>
                  <strong>{formatBalance(utxo.valueSats, "btc")}</strong>
                  <span className="muted">{formatBalance(utxo.valueSats, "sats")} / {truncateMiddle(utxo.outpoint, 18)}</span>
                  {addressLabel ? <span className="label-pill">{addressLabel.label}</span> : null}
                  {utxoNote ? <span className="muted">{utxoNote.note}</span> : null}
                </div>
              );
            }) : <p className="muted">No UTXO selected.</p>}
          </div>
          <div className="spending-plan-arrow" aria-hidden="true">-&gt;</div>
          <div>
            <p className="terminal-meta">Outputs</p>
            {draftPlan.recipients.map((recipient, index) => (
              <div className="spending-plan-line" key={`${recipient.address}-${index}`}>
                <strong>Recipient {index + 1}: {formatBalance(recipient.amountSats, "btc")}</strong>
                <span className="muted">{formatBalance(recipient.amountSats, "sats")} / {truncateMiddle(recipient.address, 22)}</span>
              </div>
            ))}
            {draftPlan.changeSats !== null && draftPlan.changeSats >= 546 ? (
              <div className="spending-plan-line">
                <strong>Change: {formatBalance(draftPlan.changeSats, "btc")}</strong>
                <span className="muted">{formatBalance(draftPlan.changeSats, "sats")} / selected when created</span>
              </div>
            ) : null}
            {draftPlan.estimatedFeeSats !== null ? (
              <div className="spending-plan-line fee-line">
                <strong>Fee: {formatBalance(draftPlan.estimatedFeeSats, "btc")}</strong>
                <span className="muted">{formatBalance(draftPlan.estimatedFeeSats, "sats")} / {draftPlan.feeRate} sat/vB</span>
              </div>
            ) : null}
          </div>
        </div>
        <p className="muted">Estimated fee may change after final signing.</p>
        {draftPlan.errors.map((error) => <p className="status-message" key={error}>{error}</p>)}
        {draftPlan.warnings.map((warning) => <p className="psbt-status-warning muted" key={warning}>{warning}</p>)}
      </div>

      <button
        className="compact-button"
        type="button"
        disabled={psbtStatus === "loading" || draftPlan.errors.length > 0}
        onClick={() => void handleCreate()}
      >
        {psbtStatus === "loading" ? "Building PSBT..." : "Create Unsigned PSBT"}
      </button>

      {psbtMessage ? <p className="status-message">{psbtMessage}</p> : null}

      {psbtResult && psbtStatus === "done" ? (
        <div className="psbt-result terminal-panel">
          <p className="terminal-heading">&gt; UNSIGNED PSBT READY</p>

          <dl className="utxo-summary-grid">
            <div>
              <dt>inputs</dt>
              <dd>{psbtResult.inputs.length} UTXOs / {formatBalance(psbtResult.totalInputSats, balanceUnit)}</dd>
            </div>
            <div>
              <dt>recipient total</dt>
              <dd>{formatBalance(psbtResult.outputs.filter((o) => o.type === "recipient").reduce((sum, output) => sum + output.valueSats, 0), balanceUnit)}</dd>
            </div>
            <div>
              <dt>fee</dt>
              <dd>{formatBalance(psbtResult.feeSats, balanceUnit)} ({psbtResult.feeRateSatsPerVbyte} sat/vB, ~{psbtResult.estimatedVbytes} vB)</dd>
            </div>
            <div>
              <dt>change</dt>
              <dd>{formatBalance(psbtResult.changeSats, balanceUnit)}</dd>
            </div>
          </dl>

          {psbtResult.changeAddress ? (
            <p className="muted psbt-change-addr">Change address: {psbtResult.changeAddress}</p>
          ) : (
            <p className="muted psbt-change-addr">No change output (dust absorbed into fee)</p>
          )}

          <div className="psbt-base64-block">
            <p className="terminal-heading">&gt; EXPORT UNSIGNED PSBT</p>
            <label className="psbt-field">
              <span>Export format</span>
              <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as "text" | "qr" | "animated" | "bbqr")}>
                <option value="text">Text</option>
                <option value="qr">QR</option>
                <option value="animated" disabled>Animated QR - coming later</option>
                <option value="bbqr" disabled>BBQr - coming later</option>
              </select>
              <span className="muted psbt-field-hint">
                Animated QR and BBQr require tested fragmentation/encoding support and are intentionally deferred.
              </span>
            </label>
            {exportFormat === "text" ? (
              <>
                <p className="muted">This is an unsigned PSBT. Copy it into an external wallet that holds the private keys.</p>
                <textarea className="psbt-textarea" readOnly value={psbtResult.psbtBase64} rows={4} />
              </>
            ) : null}
            {exportFormat === "qr" ? (
              <>
                <p className="muted">This QR contains an unsigned PSBT. Scan it with a compatible signing wallet.</p>
                {qrDataUrl ? (
                  <img alt="Unsigned PSBT QR" className="qr-preview" src={qrDataUrl} />
                ) : (
                  <p className="status-message">
                    {qrExportMessage || "This PSBT is too large for a single QR. Use text export or wait for animated QR / BBQr support."}
                  </p>
                )}
              </>
            ) : null}
            {exportFormat === "animated" || exportFormat === "bbqr" ? (
              <p className="muted">Animated QR and BBQr require tested fragmentation/encoding support and are intentionally deferred.</p>
            ) : null}
            <div className="psbt-actions">
              <button className="compact-button" type="button" onClick={() => void copyPsbt()}>
                {copied ? "Copied!" : "Copy PSBT"}
              </button>
              <button className="secondary-button compact-button" type="button" onClick={downloadPsbt}>
                Download .psbt
              </button>
              <button className="secondary-button compact-button" type="button" onClick={goToVerification}>
                Go to signed PSBT verification
              </button>
            </div>
          </div>

          <div className="muted psbt-safety-footer">
            <p>This app does not sign transactions. Optional broadcast requires signed PSBT verification and Bitcoin Core RPC.</p>
            <ol>
              <li>Export the unsigned PSBT.</li>
              <li>Sign it with an external cold wallet.</li>
              <li>Bring the signed PSBT back to this app.</li>
              <li>Paste it into Signed PSBT Verification.</li>
              <li>Verify every output before broadcasting elsewhere.</li>
            </ol>
          </div>
        </div>
      ) : null}
    </details>
  );
}

function VerifyPsbtPanel({
  apiUrl,
  balanceUnit,
  wallet
}: {
  apiUrl: string;
  balanceUnit: "sats" | "btc";
  wallet: WalletRecord;
}) {
  const [psbtInput, setPsbtInput] = useState("");
  const [expectedRecipient, setExpectedRecipient] = useState("");
  const [expectedAmount, setExpectedAmount] = useState("");
  const [expectedChange, setExpectedChange] = useState("");
  const [expectedFee, setExpectedFee] = useState("");
  const [addressLimit, setAddressLimit] = useState(100);
  const [verifyResult, setVerifyResult] = useState<VerifyPsbtResponse | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [verifyMessage, setVerifyMessage] = useState("");
  const [copiedTxHex, setCopiedTxHex] = useState(false);
  const [broadcastStatus, setBroadcastStatus] = useState<BroadcastStatusResponse | null>(null);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastConfirmed, setBroadcastConfirmed] = useState(false);
  const [broadcastConfirmText, setBroadcastConfirmText] = useState("");
  const [broadcastResult, setBroadcastResult] = useState<BroadcastResponse | null>(null);
  const [copiedTxid, setCopiedTxid] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void apiRequest<BroadcastStatusResponse>(apiUrl, "/api/broadcast/status")
      .then((status) => {
        if (!cancelled) {
          setBroadcastStatus(status);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setBroadcastStatus({
            enabled: false,
            backend: "disabled",
            configured: false,
            message: "Broadcast status unavailable."
          });
          setBroadcastMessage(error instanceof Error ? error.message : "Broadcast status unavailable.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  async function handleVerify() {
    const trimmed = psbtInput.trim();
    if (!trimmed) {
      setVerifyMessage("Paste a signed PSBT (base64) to verify.");
      setVerifyStatus("error");
      return;
    }

    setVerifyStatus("loading");
    setVerifyMessage("");
    setVerifyResult(null);
    resetBroadcastConfirmation();

    const expected = buildExpectedPsbtChecks();

    try {
      const result = await apiRequest<VerifyPsbtResponse>(
        apiUrl,
        `/api/wallets/${wallet.id}/psbt/verify`,
        {
          method: "POST",
          body: JSON.stringify({
            psbtBase64: trimmed,
            expected: Object.keys(expected).length > 0 ? expected : undefined,
            addressLimit
          }),
          headers: { "Content-Type": "application/json" }
        }
      );
      setVerifyResult(result);
      setVerifyStatus("done");
    } catch (error) {
      setVerifyMessage(error instanceof Error ? error.message : "Failed to verify PSBT");
      setVerifyStatus("error");
    }
  }

  async function copyTxHex() {
    if (!verifyResult?.txHex) return;
    try {
      await navigator.clipboard.writeText(verifyResult.txHex);
      setCopiedTxHex(true);
      setTimeout(() => setCopiedTxHex(false), 2000);
    } catch {
      setVerifyMessage("Clipboard copy failed. Select and copy manually.");
    }
  }

  async function handleBroadcast() {
    const trimmed = psbtInput.trim();
    if (!verifyResult || verifyResult.status !== "valid" || !verifyResult.extractable || !verifyResult.txHex) {
      setBroadcastMessage("Broadcast requires a valid, extractable signed PSBT.");
      return;
    }
    if (!broadcastStatus?.enabled || broadcastStatus.backend !== "core" || !broadcastStatus.configured) {
      setBroadcastMessage("Broadcast backend is disabled. Configure Bitcoin Core RPC to broadcast.");
      return;
    }
    if (!broadcastConfirmed || broadcastConfirmText !== "BROADCAST") {
      setBroadcastMessage("Confirm the checklist and type BROADCAST before broadcasting.");
      return;
    }

    setBroadcastLoading(true);
    setBroadcastMessage("");
    setBroadcastResult(null);
    const expected = buildExpectedPsbtChecks();

    try {
      const result = await apiRequest<BroadcastResponse>(
        apiUrl,
        `/api/wallets/${wallet.id}/psbt/broadcast`,
        {
          method: "POST",
          body: JSON.stringify({
            psbtBase64: trimmed,
            expected: Object.keys(expected).length > 0 ? expected : undefined,
            addressLimit
          }),
          headers: { "Content-Type": "application/json" }
        }
      );
      setBroadcastResult(result);
      setBroadcastMessage("Broadcast submitted through Bitcoin Core.");
    } catch (error) {
      setBroadcastMessage(error instanceof Error ? error.message : "Broadcast failed.");
    } finally {
      setBroadcastLoading(false);
    }
  }

  async function copyTxid() {
    if (!broadcastResult?.txid) return;
    try {
      await navigator.clipboard.writeText(broadcastResult.txid);
      setCopiedTxid(true);
      setTimeout(() => setCopiedTxid(false), 2000);
    } catch {
      setBroadcastMessage("Clipboard copy failed. Select and copy manually.");
    }
  }

  function buildExpectedPsbtChecks(): {
    recipientAddress?: string;
    amountSats?: number;
    changeAddress?: string | null;
    feeSats?: number;
  } {
    const expected: {
      recipientAddress?: string;
      amountSats?: number;
      changeAddress?: string | null;
      feeSats?: number;
    } = {};

    if (expectedRecipient.trim()) expected.recipientAddress = expectedRecipient.trim();
    if (expectedAmount.trim()) {
      const n = parseInt(expectedAmount, 10);
      if (Number.isInteger(n) && n > 0) expected.amountSats = n;
    }
    if (expectedChange.trim()) {
      expected.changeAddress = expectedChange.trim() === "none" ? null : expectedChange.trim();
    }
    if (expectedFee.trim()) {
      const n = parseInt(expectedFee, 10);
      if (Number.isInteger(n) && n >= 0) expected.feeSats = n;
    }

    return expected;
  }

  function resetBroadcastConfirmation() {
    setBroadcastMessage("");
    setBroadcastLoading(false);
    setBroadcastConfirmed(false);
    setBroadcastConfirmText("");
    setBroadcastResult(null);
  }

  // ---- derived summary values ----
  const statusLabel =
    verifyResult?.status === "valid" ? "VALID"
    : verifyResult?.status === "warning" ? "WARNING"
    : "INVALID";
  const statusClass =
    verifyResult?.status === "valid" ? "psbt-status-valid"
    : verifyResult?.status === "warning" ? "psbt-status-warning"
    : "psbt-status-invalid";

  const totalInputSats =
    verifyResult?.inputs.reduce((s, i) => s + (i.valueSats ?? 0), 0) ?? 0;
  const totalOutputSats =
    verifyResult?.outputs.reduce((s, o) => s + o.valueSats, 0) ?? 0;
  const walletInputCount =
    verifyResult?.inputs.filter((i) => i.belongsToWallet).length ?? 0;
  const recipientCount =
    verifyResult?.outputs.filter((o) => o.type === "recipient").length ?? 0;
  const changeCount =
    verifyResult?.outputs.filter((o) => o.type === "change").length ?? 0;
  const externalCount =
    verifyResult?.outputs.filter((o) => o.type === "external").length ?? 0;
  const unknownCount =
    verifyResult?.outputs.filter((o) => o.type === "unknown").length ?? 0;

  const signingState = verifyResult?.extractable
    ? "Finalized / extractable"
    : verifyResult?.finalizable
      ? "Signed, ready to finalize"
      : verifyResult?.signed
        ? "Signed (not finalizable)"
        : "Unsigned";

  const hasUnknownOutputs = unknownCount > 0;
  const hasExternalWithoutCheck =
    externalCount > 0 && (verifyResult?.checks.recipientMatches ?? null) === null;
  const hasFailedChecks =
    verifyResult?.checks.recipientMatches === false ||
    verifyResult?.checks.amountMatches === false ||
    verifyResult?.checks.changeAddressMatches === false;
  const hasOwnershipWarning =
    verifyResult?.warnings.some((w) => w.toLowerCase().includes("ownership")) ?? false;

  const riskLevel: "LOW" | "MEDIUM" | "HIGH" = !verifyResult
    ? "LOW"
    : verifyResult.errors.length > 0 ||
        hasUnknownOutputs ||
        hasExternalWithoutCheck ||
        hasFailedChecks ||
        hasOwnershipWarning
      ? "HIGH"
      : verifyResult.warnings.length > 0 || !verifyResult.extractable
        ? "MEDIUM"
        : "LOW";

  const riskClass =
    riskLevel === "LOW" ? "psbt-status-valid"
    : riskLevel === "MEDIUM" ? "psbt-status-warning"
    : "psbt-status-invalid";
  const broadcastReady =
    verifyResult?.status === "valid" && verifyResult.extractable && Boolean(verifyResult.txHex);
  const broadcastBackendReady =
    broadcastStatus?.enabled === true &&
    broadcastStatus.backend === "core" &&
    broadcastStatus.configured === true;
  const broadcastButtonDisabled =
    broadcastLoading ||
    !broadcastReady ||
    !broadcastBackendReady ||
    !broadcastConfirmed ||
    broadcastConfirmText !== "BROADCAST";

  const safetyMessages: string[] = [];
  if (verifyResult) {
    if (hasUnknownOutputs)
      safetyMessages.push(
        "This PSBT contains unknown outputs. Do not broadcast unless you understand them."
      );
    if (hasExternalWithoutCheck)
      safetyMessages.push(
        "This PSBT sends funds to an external address not recognized as wallet change. Provide the expected recipient address to verify."
      );
    if (verifyResult.checks.recipientMatches === false)
      safetyMessages.push(
        "The expected recipient address was not found in this PSBT's outputs."
      );
    if (verifyResult.checks.amountMatches === false)
      safetyMessages.push("The output amount does not match the expected amount.");
    if (verifyResult.checks.changeAddressMatches === false)
      safetyMessages.push(
        "The expected change address was not found in this PSBT's outputs."
      );
    if (verifyResult.checks.feeMatches === false)
      safetyMessages.push("The fee does not match the expected fee.");
    if (!verifyResult.signed) {
      safetyMessages.push(
        "This PSBT is not signed. Return it to your cold wallet for signing."
      );
    } else if (!verifyResult.extractable) {
      safetyMessages.push(
        "This PSBT is signed but not yet finalized or extractable. Return it to your cold wallet."
      );
    }
    if (
      verifyResult.extractable &&
      !hasUnknownOutputs &&
      externalCount === 0 &&
      verifyResult.errors.length === 0
    ) {
      safetyMessages.push(
        "This transaction appears ready. Verify all outputs carefully before broadcasting with another tool."
      );
    }
  }

  return (
    <details id="signed-psbt-verification" className="tx-history-panel wallet-address-panel create-psbt-details">
      <summary className="wallet-card-header">
        <p className="terminal-heading">&gt; VERIFY SIGNED PSBT</p>
      </summary>

      <div className="psbt-safety-notice muted">
        Paste the signed PSBT returned by your cold wallet. This verifies the transaction details
        without broadcasting. Never enter seed phrases or private keys here.
      </div>

      <div className="psbt-form">
        <label className="psbt-field">
          <span>Signed PSBT (base64)</span>
          <textarea
            className="psbt-textarea"
            value={psbtInput}
            placeholder="cHNidP8B…"
            rows={4}
            onChange={(e) => setPsbtInput(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <details className="psbt-expected-section">
          <summary className="muted">Optional safety checks</summary>
          <p className="muted" style={{ margin: "0.4rem 0 0.6rem" }}>
            Provide the intended recipient, amount, change address, or fee to compare against the
            signed PSBT. Amounts are always in sats (satoshis). Leave blank to skip a check.
          </p>
          <div className="psbt-form">
            <label className="psbt-field">
              <span>Expected recipient address</span>
              <input
                className="psbt-input"
                type="text"
                value={expectedRecipient}
                placeholder="bc1q…"
                onChange={(e) => setExpectedRecipient(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label className="psbt-field">
              <span>Expected amount (sats — satoshis, not BTC)</span>
              <input
                className="psbt-input"
                type="number"
                value={expectedAmount}
                placeholder="90000"
                min={1}
                step={1}
                onChange={(e) => setExpectedAmount(e.target.value)}
              />
            </label>
            <label className="psbt-field">
              <span>Expected change address (enter "none" if no change expected)</span>
              <input
                className="psbt-input"
                type="text"
                value={expectedChange}
                placeholder="bc1q… or none"
                onChange={(e) => setExpectedChange(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label className="psbt-field">
              <span>Expected fee (sats — satoshis)</span>
              <input
                className="psbt-input"
                type="number"
                value={expectedFee}
                placeholder="1500"
                min={0}
                step={1}
                onChange={(e) => setExpectedFee(e.target.value)}
              />
            </label>
          </div>
        </details>

        <label className="psbt-field">
          <span>Address depth</span>
          <select value={addressLimit} onChange={(e) => setAddressLimit(Number(e.target.value))}>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </label>

        <button
          className="compact-button"
          type="button"
          disabled={verifyStatus === "loading"}
          onClick={() => void handleVerify()}
        >
          {verifyStatus === "loading" ? "Verifying…" : "Verify Signed PSBT"}
        </button>
      </div>

      {verifyMessage ? (
        <p className="status-message">{verifyMessage}</p>
      ) : null}

      {verifyResult && verifyStatus === "done" ? (
        <div className="psbt-result terminal-panel">

          {/* Status + Risk level */}
          <p className="terminal-heading">
            &gt; VERIFICATION RESULT:{" "}
            <span className={statusClass}>{statusLabel}</span>
            {"   "}
            <span className={riskClass}>[{riskLevel} RISK]</span>
          </p>

          {/* Summary card */}
          <dl className="utxo-summary-grid">
            <div>
              <dt>signing state</dt>
              <dd>{signingState}</dd>
            </div>
            <div>
              <dt>total input</dt>
              <dd>{formatBalance(totalInputSats, balanceUnit)}</dd>
            </div>
            <div>
              <dt>total output</dt>
              <dd>{formatBalance(totalOutputSats, balanceUnit)}</dd>
            </div>
            {verifyResult.feeSats !== null ? (
              <div>
                <dt>fee</dt>
                <dd>{formatBalance(verifyResult.feeSats, balanceUnit)}</dd>
              </div>
            ) : null}
            <div>
              <dt>fee rate</dt>
              <dd className="muted">unavailable (vsize not calculated)</dd>
            </div>
            <div>
              <dt>wallet inputs</dt>
              <dd>
                {walletInputCount} / {verifyResult.inputs.length}
              </dd>
            </div>
            <div>
              <dt>recipient outputs</dt>
              <dd>{recipientCount}</dd>
            </div>
            <div>
              <dt>change outputs</dt>
              <dd>{changeCount}</dd>
            </div>
            {externalCount > 0 ? (
              <div>
                <dt>external outputs</dt>
                <dd className="psbt-status-warning">{externalCount}</dd>
              </div>
            ) : null}
            {unknownCount > 0 ? (
              <div>
                <dt>unknown outputs</dt>
                <dd className="psbt-status-invalid">{unknownCount}</dd>
              </div>
            ) : null}
          </dl>

          {/* Human-readable safety messages */}
          {safetyMessages.length > 0 ? (
            <div className="psbt-verify-section">
              {safetyMessages.map((msg, i) => (
                <p key={i} className="muted">{msg}</p>
              ))}
            </div>
          ) : null}

          {/* Errors */}
          {verifyResult.errors.length > 0 ? (
            <div className="psbt-verify-section">
              <p className="terminal-heading psbt-status-invalid">&gt; ERRORS</p>
              {verifyResult.errors.map((e, i) => (
                <p key={i} className="psbt-status-invalid muted">{e}</p>
              ))}
            </div>
          ) : null}

          {/* Warnings */}
          {verifyResult.warnings.length > 0 ? (
            <div className="psbt-verify-section">
              <p className="terminal-heading psbt-status-warning">&gt; WARNINGS</p>
              {verifyResult.warnings.map((w, i) => (
                <p key={i} className="psbt-status-warning muted">{w}</p>
              ))}
            </div>
          ) : null}

          {/* Outputs table */}
          <div className="psbt-verify-section">
            <p className="terminal-heading">&gt; OUTPUTS</p>
            {verifyResult.outputs.map((out, i) => {
              const outputLabel = out.address ? getAddressLabelByAddress(wallet, out.address) : null;
              const typeLabel =
                out.type === "recipient"
                  ? "RECIPIENT OUTPUT — expected destination"
                  : out.type === "change"
                    ? "CHANGE OUTPUT — wallet-owned"
                    : out.type === "external"
                      ? "EXTERNAL OUTPUT — not recognized as wallet change"
                      : "UNKNOWN OUTPUT — review carefully";
              const typeLabelClass =
                out.type === "external"
                  ? "psbt-status-warning"
                  : out.type === "unknown"
                    ? "psbt-status-invalid"
                    : "";
              const matchNote =
                out.type === "recipient" && verifyResult.checks.recipientMatches === true
                  ? " [matched expected]"
                  : out.type === "change" && verifyResult.checks.changeAddressMatches === true
                    ? " [matched expected]"
                    : "";
              return (
                <div key={i} className="psbt-verify-output-row">
                  <div className={typeLabelClass} style={{ fontWeight: "bold", fontSize: "0.85em" }}>
                    #{i} {typeLabel}{matchNote}
                  </div>
                  <div className="muted psbt-input-row" style={{ marginLeft: "1rem" }}>
                    {out.address ?? "no address"}
                    {" · "}
                    {formatBalance(out.valueSats, "sats")} / {(out.valueSats / 1e8).toFixed(8)} BTC
                  </div>
                  {outputLabel ? (
                    <div className="muted psbt-input-row" style={{ marginLeft: "1rem" }}>
                      <span className="label-pill">{outputLabel.label}</span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Inputs table */}
          <div className="psbt-verify-section">
            <p className="terminal-heading">&gt; INPUTS</p>
            {verifyResult.inputs.map((inp, i) => (
              <div key={i} className="muted psbt-input-row">
                #{i} {truncateMiddle(`${inp.txid}:${inp.vout}`, 24)}
                {" · "}
                {inp.valueSats !== null ? formatBalance(inp.valueSats, balanceUnit) : "?"}
                {" · "}
                {inp.belongsToWallet ? "wallet-owned" : "external input"}
              </div>
            ))}
          </div>

          {/* Transaction hex and optional Bitcoin Core broadcast */}
          {verifyResult.extractable && verifyResult.txHex ? (
            <div className="psbt-base64-block">
              <p className="terminal-heading">&gt; TRANSACTION HEX</p>
              {verifyResult.status !== "valid" ? (
                <p className="psbt-status-warning muted">
                  Warning: this transaction has unresolved issues. Review carefully before
                  broadcasting with another tool.
                </p>
              ) : null}
              <p className="muted psbt-change-addr">
                Broadcast is optional and disabled unless Bitcoin Core RPC is configured.
                Copy this txHex only after verifying every output.
              </p>
              {verifyResult.txid ? (
                <p className="muted psbt-change-addr">txid: {verifyResult.txid}</p>
              ) : null}
              <textarea
                className="psbt-textarea"
                readOnly
                value={verifyResult.txHex}
                rows={4}
              />
              <div className="psbt-actions">
                <button
                  className="compact-button"
                  type="button"
                  onClick={() => void copyTxHex()}
                >
                  {copiedTxHex ? "Copied txHex!" : "Copy Tx Hex"}
                </button>
              </div>
            </div>
          ) : null}

          <div className="psbt-base64-block">
            <p className="terminal-heading">&gt; BROADCAST SIGNED TRANSACTION</p>
            <p className="muted psbt-change-addr">
              This app does not sign transactions. Broadcasting sends an already-signed
              transaction to Bitcoin Core and cannot be undone.
            </p>

            {!verifyResult.extractable || !verifyResult.txHex ? (
              <p className="psbt-status-warning muted">
                Broadcast unavailable because no extractable transaction hex was produced.
              </p>
            ) : verifyResult.status === "warning" ? (
              <p className="psbt-status-warning muted">
                Broadcast disabled because this signed PSBT has warnings. Review and fix
                before broadcasting.
              </p>
            ) : verifyResult.status === "invalid" ? (
              <p className="psbt-status-invalid muted">
                Broadcast disabled because this signed PSBT is invalid.
              </p>
            ) : !broadcastBackendReady ? (
              <p className="muted">
                Broadcast backend is disabled. You can copy txHex and broadcast with another
                trusted tool, or configure Bitcoin Core RPC.
              </p>
            ) : (
              <>
                <p className="psbt-status-warning muted">
                  Broadcasting sends this verified signed transaction to the Bitcoin network
                  through your Bitcoin Core node. This cannot be undone.
                </p>
                <label className="psbt-checkbox-row">
                  <input
                    type="checkbox"
                    checked={broadcastConfirmed}
                    onChange={(e) => setBroadcastConfirmed(e.target.checked)}
                  />
                  <span>I verified the recipient, amount, change output, and fee.</span>
                </label>
                <label className="psbt-field">
                  <span>Type BROADCAST to confirm</span>
                  <input
                    className="psbt-input"
                    type="text"
                    value={broadcastConfirmText}
                    onChange={(e) => setBroadcastConfirmText(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <div className="psbt-actions">
                  <button
                    className="compact-button"
                    type="button"
                    disabled={broadcastButtonDisabled}
                    onClick={() => void handleBroadcast()}
                  >
                    {broadcastLoading ? "Broadcasting..." : "Broadcast transaction"}
                  </button>
                </div>
              </>
            )}

            {broadcastStatus?.message ? (
              <p className="muted psbt-change-addr">
                Backend: {broadcastStatus.backend === "core" ? "Bitcoin Core" : "disabled"} - {broadcastStatus.message}
              </p>
            ) : null}

            {broadcastMessage ? <p className="status-message">{broadcastMessage}</p> : null}

            {broadcastResult ? (
              <div className="psbt-verify-section">
                <p className="terminal-heading psbt-status-valid">&gt; BROADCAST SUBMITTED</p>
                <p className="muted">Backend: Bitcoin Core</p>
                <p className="muted psbt-change-addr">txid: {broadcastResult.txid}</p>
                <button className="compact-button" type="button" onClick={() => void copyTxid()}>
                  {copiedTxid ? "Copied txid!" : "Copy txid"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </details>
  );
}

function ConnectionPanel({
  error,
  fulcrumStatus,
  mempoolStatus,
  refreshing,
  runtimeSettings,
  onRefreshAll
}: {
  error: string;
  fulcrumStatus: FulcrumStatusResponse | null;
  mempoolStatus: MempoolStatusResponse | null;
  refreshing: boolean;
  runtimeSettings: RuntimeSettingsResponse | null;
  onRefreshAll: () => void;
}) {
  const status = mempoolStatus?.status ?? (error ? "offline" : "degraded");
  const badgeStatus: StatusKind =
    status === "online" ? "online" : status === "offline" ? "offline" : "degraded";
  const backendKind = runtimeSettings?.backendKind ?? "not configured";
  const endpoint =
    mempoolStatus?.baseUrl ??
    mempoolStatus?.url ??
    runtimeSettings?.mempoolApiUrl ??
    "not available";
  const tip = mempoolStatus?.tipHeight
    ? new Intl.NumberFormat("en-US").format(mempoolStatus.tipHeight)
    : status === "offline"
      ? "offline"
      : mempoolStatus
        ? "syncing"
        : "not connected";
  const latency =
    typeof mempoolStatus?.latencyMs === "number"
      ? `${mempoolStatus.latencyMs}ms`
      : status === "offline"
        ? "timeout"
        : "—";
  const checkedAt = formatCheckedAt(mempoolStatus?.checkedAt);
  const errors = mempoolStatus?.errors ?? (error ? [error] : []);
  const helper = getMempoolHelperText(badgeStatus);
  const fulcrumConfigured =
    runtimeSettings?.fulcrum?.configured ??
    (fulcrumStatus !== null && fulcrumStatus.status !== "not-configured");
  const guidance = getBackendGuidance(backendKind, fulcrumConfigured);

  const fulcrumHost = fulcrumStatus?.host ?? runtimeSettings?.fulcrum?.host ?? null;
  const fulcrumPort = fulcrumStatus?.port ?? runtimeSettings?.fulcrum?.port ?? null;
  const fulcrumStatusLabel = fulcrumStatus?.status ?? (fulcrumConfigured ? "checking" : "not-configured");

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
        <span className="terminal-meta">backend {backendKind}</span>
        <span className="terminal-meta">tip {tip}</span>
        <span className="terminal-meta">latency {latency}</span>
      </div>
      <details className="metadata-details connection-details">
        <summary>Connection details</summary>
        <div className="metadata-grid">
          <div>
            <dt>Backend</dt>
            <dd>{backendKind}</dd>
          </div>
          <div>
            <dt>Endpoint</dt>
            <dd title={endpoint}>{truncateEndpoint(endpoint)}</dd>
          </div>
          <div>
            <dt>Last check</dt>
            <dd>{checkedAt}</dd>
          </div>
        </div>
        {fulcrumConfigured ? (
          <div className="metadata-grid">
            <div>
              <dt>Fulcrum</dt>
              <dd>
                {fulcrumHost ?? "configured"}
                {fulcrumPort ? `:${fulcrumPort}` : ""}
              </dd>
            </div>
            <div>
              <dt>Fulcrum status</dt>
              <dd>{fulcrumStatusLabel}</dd>
            </div>
          </div>
        ) : null}
        {guidance ? (
          <p className="muted technical-line">{guidance}</p>
        ) : null}
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
  const [discovery, setDiscovery] = useState<WalletBalanceResponse["discovery"]>(null);
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
      setDiscovery(response.discovery ?? null);
      onBalanceStatusChange(
        response.status === "offline"
          ? "offline"
          : response.lookupError || response.status === "partial"
            ? "degraded"
            : "online"
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Balance lookup failed — API server may be unreachable");
      setAddresses([]);
      setNextReceiveAddress(null);
      setBalance(null);
      setReceiveBalance(null);
      setChangeBalance(null);
      setUsageLookupNote("");
      setNextReceiveLookupNote("");
      setBalanceFailedCount(0);
      setDiscovery(null);
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
          {balanceFailedCount > 0
            ? `${balanceFailedCount} address lookup(s) failed — balance total may be incomplete. API may be rate-limiting or unreachable.`
            : "Some address balances could not be fetched — total may be incomplete."}
        </p>
      ) : null}

      <div className="balance-summary">
        <div className="wallet-card-header">
          <div>
            <p className="terminal-heading">&gt; BALANCE</p>
            <h2 className="balance-total">
              {loading ? "syncing…" : balance != null ? formatBalance(balance.totalBalance, "sats") : "—"}
            </h2>
            {!loading && balance != null ? (
              <p className="muted">{formatBalance(balance.totalBalance, "btc")}</p>
            ) : null}
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
            <dd>{loadedBalance(balance?.confirmedBalance, loading, balanceUnit)}</dd>
          </div>
          <div>
            <dt>Unconfirmed</dt>
            <dd>{loadedBalance(balance?.unconfirmedBalance, loading, balanceUnit)}</dd>
          </div>
          <div>
            <dt>Receive</dt>
            <dd>{loadedBalance(receiveBalance?.totalBalance, loading, balanceUnit)}</dd>
          </div>
          <div>
            <dt>Change</dt>
            <dd>{loadedBalance(changeBalance?.totalBalance, loading, balanceUnit)}</dd>
          </div>
        </dl>
      </div>

      {!loading && addresses.length > 0 ? (
        <p className="terminal-meta muted">
          recv {addresses.filter((a) => a.chain === "receive").length} addr
          {" · "}chg {addresses.filter((a) => a.chain === "change").length} addr
          {" · "}gap limit {discovery?.gapLimit ?? wallet.gapLimit}
          {discovery?.complete === true ? " · scan complete" : ""}
          {!discovery?.complete && discovery != null && discovery.checkedCount >= discovery.maxDiscoveryLimit
            ? " · max scan depth reached — increase gap limit for deeper discovery"
            : ""}
          {addresses.filter((a) => a.usage === "used").length === 0 && !loading ? " · no used addresses found" : ""}
        </p>
      ) : null}

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
  backendKind,
  balanceUnit,
  onTxStatusChange,
  refreshToken,
  wallet,
  onWalletChange
}: {
  apiUrl: string;
  backendKind: string;
  balanceUnit: "sats" | "btc";
  onTxStatusChange: (status: StatusKind) => void;
  refreshToken: number;
  wallet: WalletRecord;
  onWalletChange: (wallet: WalletRecord) => void;
}) {
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [txStatus, setTxStatus] = useState<"online" | "partial" | "offline" | null>(null);
  const [scanSummary, setScanSummary] = useState<WalletScanSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [txLimit, setTxLimit] = useState(50);
  const [addressLimit, setAddressLimit] = useState(20);
  const [txPages, setTxPages] = useState(1);
  const [editingTxid, setEditingTxid] = useState("");
  const [txLabelDraft, setTxLabelDraft] = useState("");
  const [txNotesDraft, setTxNotesDraft] = useState("");
  const [labelSaving, setLabelSaving] = useState(false);
  const [labelError, setLabelError] = useState("");

  useEffect(() => {
    void refreshTransactions();
  }, [wallet.id, txLimit, addressLimit, txPages, refreshToken]);

  async function refreshTransactions() {
    setLoading(true);
    setMessage("");
    try {
      const response = await apiRequest<WalletTransactionsResponse>(
        apiUrl,
        `/api/wallets/${wallet.id}/transactions?chain=both&addressLimit=${addressLimit}&txLimit=${txLimit}&pages=${txPages}`
      );
      setTransactions(response.transactions ?? []);
      setTxStatus(response.status);
      setScanSummary(response.scanSummary ?? null);
      onTxStatusChange(response.status === "online" ? "online" : response.status === "offline" ? "offline" : "degraded");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load transaction history");
      setTransactions([]);
      setTxStatus(null);
      setScanSummary(null);
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

  const isDeepScan = addressLimit > 20 || txPages > 1;
  const isPublicBackend = backendKind === "mempool-public";
  const failedCount = scanSummary?.failedLookups ?? 0;

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
          {loading ? "Refreshing…" : "Refresh txs"}
        </button>
      </div>

      <details className="metadata-details scan-controls-details">
        <summary className="muted">
          scan: both · {addressLimit} addr · {txPages} page/addr
        </summary>
        <div className="scan-controls-grid">
          <label className="scan-control-label">
            <span>Addresses</span>
            <select
              value={addressLimit}
              disabled={loading}
              onChange={(e) => setAddressLimit(Number(e.target.value))}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
          <label className="scan-control-label">
            <span>Pages/addr</span>
            <select
              value={txPages}
              disabled={loading}
              onChange={(e) => setTxPages(Number(e.target.value))}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
          <label className="scan-control-label">
            <span>Show</span>
            <select
              value={txLimit}
              disabled={loading}
              onChange={(e) => setTxLimit(Number(e.target.value))}
            >
              <option value={25}>25 txs</option>
              <option value={50}>50 txs</option>
              <option value={100}>100 txs</option>
              <option value={200}>200 txs</option>
            </select>
          </label>
        </div>
        {isDeepScan && isPublicBackend ? (
          <p className="muted technical-line">Deep scans can be slow on public APIs.</p>
        ) : null}
      </details>

      {scanSummary && !loading ? (
        <p className="muted technical-line scan-summary-line">
          Scanned recv {scanSummary.receiveScanned} · chg {scanSummary.changeScanned} · {scanSummary.pagesPerAddress} page/addr · {scanSummary.uniqueTransactions} txs
          {scanSummary.truncated ? " · results may be truncated" : ""}
        </p>
      ) : null}

      {failedCount > 0 ? (
        <p className="status-message">
          {failedCount} address lookup(s) failed. History may be incomplete.
          {isPublicBackend ? " Public API may rate-limit deep scans. Try a local mempool backend." : " Increase timeout or lower scan depth."}
        </p>
      ) : null}

      {message ? <p className="status-message">{message}</p> : null}

      {loading ? (
        <TerminalSkeleton label="LOADING TRANSACTIONS" rows={4} />
      ) : transactions.length === 0 ? (
        <p className="muted">
          {txStatus === "offline"
            ? "Transaction lookup failed — Mempool/Fulcrum connection unavailable. Check API settings."
            : txStatus === "partial"
              ? "Some transactions may be missing — API returned partial results. Try a deeper scan or local backend."
              : "No transactions found in scanned address range."}
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
        {tx.feeSats !== null ? (
          <span className="terminal-meta muted">fee: {formatBalance(tx.feeSats, balanceUnit)}</span>
        ) : null}
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
      {label?.notes ? (
        <div className="utxo-note-line">
          <span className="terminal-meta">Transaction note:</span> {label.notes}
        </div>
      ) : null}
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
          maxLength={500}
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

function InlineNoteEditor({
  error,
  note,
  saving,
  onCancel,
  onClear,
  onNoteChange,
  onSave
}: {
  error: string;
  note: string;
  saving: boolean;
  onCancel: () => void;
  onClear: () => void;
  onNoteChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="label-editor">
      <label>
        <span>note</span>
        <textarea
          maxLength={500}
          placeholder="Tracked UTXO note"
          rows={3}
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
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
        Stored locally in the encrypted vault. Available for PSBT planning only.
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
  if (!label || !label.label) {
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
                  txCount: {address.txCount ?? "—"}
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

function getBackendGuidance(backendKind: string, fulcrumConfigured: boolean): string {
  if (fulcrumConfigured || backendKind === "fulcrum") {
    return "Fulcrum 설정은 감지됐지만, 현재 잔고/거래 조회는 mempool-compatible HTTP backend를 사용합니다.";
  }
  if (backendKind === "mempool-public") {
    return "공용 API 모드입니다. 테스트에는 편하지만, 프라이버시를 위해 로컬 백엔드를 권장합니다.";
  }
  if (backendKind === "mempool-local") {
    return "Local mempool backend detected.";
  }
  return "";
}

function truncateEndpoint(endpoint: string): string {
  if (endpoint.length <= 50) return endpoint;
  return `${endpoint.slice(0, 47)}...`;
}

function formatCheckedAt(value: string | undefined): string {
  if (!value) {
    return "never";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "never";
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

function getAddressLabelByAddress(wallet: WalletRecord, address: string): AddressLabel | null {
  return (wallet.addressLabels ?? []).find((label) => label.address === address) ?? null;
}

function getTransactionLabel(wallet: WalletRecord, txid: string): TransactionLabel | null {
  return (wallet.transactionLabels ?? []).find((label) => label.txid === txid) ?? null;
}

function getUtxoNote(wallet: WalletRecord, txid: string, vout: number): UtxoNote | null {
  return (wallet.utxoNotes ?? []).find((note) => note.txid === txid && note.vout === vout) ?? null;
}

function addressLabelKey(address: Pick<DerivedAddress, "chain" | "index">): string {
  return `${address.chain}-${address.index}`;
}

function formatNullableBalance(value: number | null | undefined, unit: "sats" | "btc"): string {
  return value === null || value === undefined ? "—" : formatBalance(value, unit);
}

function parseAmountToSats(value: string, unit: "sats" | "btc"): { sats: number | null; error: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { sats: null, error: "Invalid amount." };
  }

  if (unit === "sats") {
    if (!/^\d+$/.test(trimmed)) {
      return { sats: null, error: "Sats amount must be an integer." };
    }
    const sats = Number(trimmed);
    if (!Number.isSafeInteger(sats) || sats <= 0) {
      return { sats: null, error: "Invalid amount." };
    }
    return { sats, error: "" };
  }

  if (!/^\d+(\.\d{1,8})?$/.test(trimmed)) {
    return { sats: null, error: "BTC amount must use up to 8 decimals." };
  }
  const [whole, fraction = ""] = trimmed.split(".");
  const sats = Number(BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, "0")));
  if (!Number.isSafeInteger(sats) || sats <= 0) {
    return { sats: null, error: "Invalid amount." };
  }
  return { sats, error: "" };
}

function parseFeeRate(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return null;
  }
  const feeRate = Number(trimmed);
  return Number.isFinite(feeRate) && feeRate >= 1 && feeRate <= 1000 ? feeRate : null;
}

function estimateBuilderVbytes(
  scriptType: WalletScriptType,
  inputCount: number,
  outputCount: number
): number | null {
  const inputVbytes =
    scriptType === "native-segwit" ? 68 :
    scriptType === "nested-segwit" ? 91 :
    scriptType === "taproot" ? 58 :
    null;
  if (inputVbytes === null) {
    return null;
  }
  return 12 + inputCount * inputVbytes + outputCount * 43;
}

function looksLikeAddressForWalletNetwork(address: string, network: WalletRecord["network"]): boolean {
  if (network === "mainnet") {
    return /^(bc1|[13])/.test(address);
  }
  return /^(tb1|[mn2])/.test(address);
}

function loadedBalance(value: number | undefined, loading: boolean, unit: "sats" | "btc"): string {
  if (loading) return "…";
  if (value == null) return "—";
  return formatBalance(value, unit);
}

function formatBalance(sats: number, unit: "sats" | "btc"): string {
  if (unit === "btc") {
    return `${(sats / 100_000_000).toFixed(8)} BTC`;
  }

  return `${new Intl.NumberFormat("en-US").format(sats)} sats`;
}

function truncateMiddle(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  const tail = Math.floor((maxLen - 3) / 2);
  const head = maxLen - 3 - tail;
  return str.slice(0, head) + "..." + str.slice(str.length - tail);
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
  const privateWarning = looksPrivateImport(trimmed);
  if (privateWarning !== null) {
    return {
      ...emptyImportDetection(),
      privateInput: true,
      warnings: [],
      unsupportedReason: privateWarning
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

  // BBQr multipart
  if (trimmed.startsWith("B$")) {
    return {
      ...emptyImportDetection(),
      importFormat: "bbqr",
      warnings: [],
      unsupportedReason: "BBQr multipart QR detected. Export a descriptor or Generic JSON from Coldcard and import via Paste or File."
    };
  }

  // Raw PSBT
  if (trimmed.startsWith("cHNidP8B")) {
    return {
      ...emptyImportDetection(),
      importFormat: "psbt-ur",
      warnings: [],
      unsupportedReason: "PSBT signing request detected. This is not a watch-only wallet export. Use xpub or descriptor export instead."
    };
  }

  const lower = trimmed.toLowerCase();
  if (lower.startsWith("ur:")) {
    if (lower.startsWith("ur:crypto-psbt")) {
      return {
        ...emptyImportDetection(),
        importFormat: "psbt-ur",
        warnings: [],
        unsupportedReason: "PSBT signing request detected. This is not a watch-only wallet export. Use xpub or descriptor export instead."
      };
    }

    const key = extractExtendedPublicKey(trimmed);
    let importFormat: ImportFormat;
    if (lower.startsWith("ur:crypto-account")) {
      importFormat = sourceDevice === "passport-core" ? "passport-setup-qr" : "crypto-account-ur";
    } else if (lower.startsWith("ur:crypto-hdkey")) {
      importFormat = "crypto-hdkey-ur";
    } else {
      importFormat = "ur-xpub";
    }
    return {
      extendedPublicKey: key,
      type: key ? key.slice(0, 4) as ExtendedPublicKeyType : null,
      network: key ? networkForKey(key) : network,
      scriptType: key ? scriptTypeForKey(key) : "unknown",
      accountPath: null,
      masterFingerprint: null,
      importFormat,
      privateInput: false,
      warnings: ["UR payload detected. Animated UR/BCUR decoding is not fully supported yet."],
      unsupportedReason: key ? null : "UR decoding not available yet. Use descriptor/file/paste xpub import."
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
      warnings: [],
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
    warnings: ["This input does not look like an xpub/ypub/zpub, descriptor, key expression, or supported JSON format."],
    unsupportedReason: "Unsupported import format — expected xpub/ypub/zpub, descriptor, or compatible JSON export"
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

type QrFrameFormat =
  | "plain-xpub"
  | "descriptor"
  | "key-expression"
  | "coldcard-json"
  | "crypto-account-ur"
  | "crypto-hdkey-ur"
  | "ur-xpub"
  | "ur-animated"
  | "bbqr"
  | "psbt-ur"
  | "unknown";

type QrFrameClassification = {
  format: QrFrameFormat;
  animated: boolean;
  watchOnlyCandidate: boolean;
  frameIndex: number | null;
  totalFrames: number | null;
};

function classifyQrFrame(frame: string): QrFrameClassification {
  const trimmed = frame.trim();
  if (!trimmed) {
    return { format: "unknown", animated: false, watchOnlyCandidate: false, frameIndex: null, totalFrames: null };
  }

  if (trimmed.startsWith("B$")) {
    return { format: "bbqr", animated: true, watchOnlyCandidate: false, frameIndex: null, totalFrames: null };
  }

  if (trimmed.startsWith("cHNidP8B")) {
    return { format: "psbt-ur", animated: false, watchOnlyCandidate: false, frameIndex: null, totalFrames: null };
  }

  const lower = trimmed.toLowerCase();

  if (lower.startsWith("ur:")) {
    if (lower.startsWith("ur:crypto-psbt")) {
      return { format: "psbt-ur", animated: isUrAnimated(trimmed), watchOnlyCandidate: false, frameIndex: urFrameIdx(trimmed), totalFrames: urFrameTotal(trimmed) };
    }

    const animated = isUrAnimated(trimmed);
    const frameIndex = urFrameIdx(trimmed);
    const totalFrames = urFrameTotal(trimmed);

    if (animated) {
      return { format: "ur-animated", animated: true, watchOnlyCandidate: true, frameIndex, totalFrames };
    }
    if (lower.startsWith("ur:crypto-account")) {
      return { format: "crypto-account-ur", animated: false, watchOnlyCandidate: true, frameIndex: null, totalFrames: null };
    }
    if (lower.startsWith("ur:crypto-hdkey")) {
      return { format: "crypto-hdkey-ur", animated: false, watchOnlyCandidate: true, frameIndex: null, totalFrames: null };
    }
    return { format: "ur-xpub", animated: false, watchOnlyCandidate: true, frameIndex: null, totalFrames: null };
  }

  const stripped = trimmed.replace(/#[a-z0-9]+$/i, "");
  if (stripped.startsWith("sh(wpkh(") || stripped.startsWith("wpkh(") || stripped.startsWith("pkh(") || stripped.startsWith("tr(")) {
    return { format: "descriptor", animated: false, watchOnlyCandidate: true, frameIndex: null, totalFrames: null };
  }

  if (/^\[[0-9a-fA-F]{8}/.test(trimmed) && /\b(xpub|ypub|zpub|tpub|upub|vpub)[1-9A-HJ-NP-Za-km-z]{40,}/.test(trimmed)) {
    return { format: "key-expression", animated: false, watchOnlyCandidate: true, frameIndex: null, totalFrames: null };
  }

  if (trimmed.startsWith("{")) {
    const hasXpub = /\b(xpub|ypub|zpub|tpub|upub|vpub)[1-9A-HJ-NP-Za-km-z]{40,}/.test(trimmed);
    return { format: "coldcard-json", animated: false, watchOnlyCandidate: hasXpub, frameIndex: null, totalFrames: null };
  }

  if (/\b(xpub|ypub|zpub|tpub|upub|vpub)[1-9A-HJ-NP-Za-km-z]{40,}/.test(trimmed)) {
    return { format: "plain-xpub", animated: false, watchOnlyCandidate: true, frameIndex: null, totalFrames: null };
  }

  return { format: "unknown", animated: false, watchOnlyCandidate: false, frameIndex: null, totalFrames: null };
}

function isUrAnimated(value: string): boolean {
  return /^ur:[^/]+\/\d+of\d+\//i.test(value) || /^ur:[^/]+\/\d+-\d+\//i.test(value);
}

function urFrameIdx(value: string): number | null {
  const m = value.match(/^ur:[^/]+\/(\d+)of\d+\//i) ?? value.match(/^ur:[^/]+\/(\d+)-\d+\//i);
  return m?.[1] !== undefined ? parseInt(m[1], 10) : null;
}

function urFrameTotal(value: string): number | null {
  const m = value.match(/^ur:[^/]+\/\d+of(\d+)\//i) ?? value.match(/^ur:[^/]+\/\d+-(\d+)\//i);
  return m?.[1] !== undefined ? parseInt(m[1], 10) : null;
}

function looksPrivateImport(value: string): string | null {
  if (/\b(xprv|yprv|zprv|tprv|uprv|vprv)[1-9a-hj-np-z]+\b/i.test(value)) {
    return "This looks like an extended private key (xprv/yprv/zprv). Never enter private keys into this app.";
  }
  if (/\b[5KL][1-9A-HJ-NP-Za-km-z]{50,51}\b/.test(value)) {
    return "This looks like a WIF private key. Never enter private keys into this app.";
  }
  const lower = value.trim().toLowerCase();
  const words = lower.match(/\b[a-z]{3,10}\b/g) ?? [];
  if ((words.length === 12 || words.length === 18 || words.length === 24) && lower === words.join(" ")) {
    return "This looks like a seed phrase (mnemonic). Never enter seed phrases into this app.";
  }
  if (/(wif|privatekey|private_key|privkey|seed phrase|mnemonic)/i.test(value)) {
    return "This input contains keywords associated with private keys or seed phrases. Never enter either into this app.";
  }
  return null;
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

function describeKeyType(type: ExtendedPublicKeyType): string {
  switch (type) {
    case "xpub": return "mainnet — legacy or native segwit";
    case "ypub": return "mainnet nested segwit (P2SH-P2WPKH)";
    case "zpub": return "mainnet native segwit (P2WPKH)";
    case "tpub": return "testnet/signet";
    case "upub": return "testnet/signet nested segwit";
    case "vpub": return "testnet/signet native segwit";
  }
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
  if (wallet.scriptType === "taproot" && wallet.importFormat !== "descriptor" && wallet.importFormat !== "key-expression") {
    warnings.push("Taproot wallet via xpub/tpub: confirm BIP86 derivation path (m/86'/0'/0') before receiving funds.");
  }
  if (
    wallet.importFormat === "crypto-account-ur" ||
    wallet.importFormat === "crypto-hdkey-ur" ||
    wallet.importFormat === "passport-setup-qr" ||
    wallet.importFormat === "ur-xpub"
  ) {
    warnings.push("UR payload import: animated UR/BCUR decoding is not complete yet. Verify addresses match your device.");
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
  console.info("Atlas API request", url);

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      credentials: "include",
      headers
    });
  } catch (error) {
    console.error("Atlas API fetch failed", { url, error });
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
