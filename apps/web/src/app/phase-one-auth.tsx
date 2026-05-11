"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

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

type ViewState = "loading" | "setup" | "verify-totp" | "login" | "dashboard";
type AuthMode = "signup" | "signin";

type AuthShellProps = {
  apiUrl: string;
};

export function AuthShell({ apiUrl }: AuthShellProps) {
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
            <h1>{view === "dashboard" ? "Wallets" : "Secure access"}</h1>
          </div>
          <span className="phase-pill">{view === "dashboard" ? "Phase 2" : "Phase 1"}</span>
        </div>

        {message ? <p className="status-message">{message}</p> : null}
        <p className="api-diagnostic">API: {apiUrl}</p>

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
  session,
  onLogout
}: {
  apiUrl: string;
  busy: boolean;
  session: SessionResponse | null;
  onLogout: () => void;
}) {
  return (
    <div className="dashboard-shell">
      <div className="toolbar-row">
        <p className="muted">Signed in as {session?.user?.username ?? "admin"}</p>
        <button className="secondary-button compact-button" disabled={busy} type="button" onClick={onLogout}>
          Log out
        </button>
      </div>
      <VaultWorkspace apiUrl={apiUrl} />
    </div>
  );
}

function VaultWorkspace({ apiUrl }: { apiUrl: string }) {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [wallets, setWallets] = useState<WalletRecord[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refreshVault();
  }, []);

  async function refreshVault() {
    setMessage("");

    try {
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet delete failed");
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return <p className="muted">Loading vault...</p>;
  }

  return (
    <div className="vault-workspace">
      {message ? <p className="status-message">{message}</p> : null}
      <div className="vault-status">
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
        <>
          <WalletCreateForm busy={busy} onSubmit={handleCreateWallet} />
          <WalletList
            busy={busy}
            wallets={wallets}
            onDelete={handleDeleteWallet}
            onUpdate={handleUpdateWallet}
          />
        </>
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
  const detected = useMemo(() => detectWalletMetadata(extendedPublicKey, network), [
    extendedPublicKey,
    network
  ]);

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
        <span>Extended public key</span>
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
    </form>
  );
}

function WalletList({
  busy,
  wallets,
  onDelete,
  onUpdate
}: {
  busy: boolean;
  wallets: WalletRecord[];
  onDelete: (id: string) => Promise<void>;
  onUpdate: (id: string, input: { name: string; gapLimit: number }) => Promise<void>;
}) {
  if (wallets.length === 0) {
    return <p className="muted">No wallets registered.</p>;
  }

  return (
    <div className="wallet-list">
      {wallets.map((wallet) => (
        <WalletCard
          busy={busy}
          key={wallet.id}
          wallet={wallet}
          onDelete={onDelete}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  );
}

function WalletCard({
  busy,
  wallet,
  onDelete,
  onUpdate
}: {
  busy: boolean;
  wallet: WalletRecord;
  onDelete: (id: string) => Promise<void>;
  onUpdate: (id: string, input: { name: string; gapLimit: number }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(wallet.name);
  const [gapLimit, setGapLimit] = useState(wallet.gapLimit);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setName(wallet.name);
    setGapLimit(wallet.gapLimit);
  }, [wallet.name, wallet.gapLimit]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await onUpdate(wallet.id, { name, gapLimit });
      setEditing(false);
    } catch {
      // The parent component displays the API error.
    }
  }

  return (
    <article className="wallet-card">
      <div className="wallet-card-header">
        <div>
          <h2>{wallet.name}</h2>
          <p className="muted">
            {wallet.network} / {wallet.type} / {wallet.scriptType}
          </p>
        </div>
        <div className="button-row">
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
    return "••••";
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
