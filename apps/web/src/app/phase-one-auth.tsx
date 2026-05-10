"use client";

import { FormEvent, useEffect, useState } from "react";

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

type ViewState = "loading" | "setup" | "verify-totp" | "login" | "dashboard";

type AuthShellProps = {
  apiUrl: string;
};

export function AuthShell({ apiUrl }: AuthShellProps) {
  const [view, setView] = useState<ViewState>("loading");
  const [session, setSession] = useState<SessionResponse | null>(null);
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
        setView("login");
      } else {
        setView("setup");
      }
    } catch (error) {
      console.error("watch wallet session request failed", {
        url: buildApiUrl(apiUrl, "/api/auth/session"),
        error
      });
      setMessage(error instanceof Error ? error.message : "Unable to reach the API");
      setView("setup");
    }
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
      <section className="auth-panel">
        <div className="brand-row">
          <div>
            <p className="eyebrow">watch wallet</p>
            <h1>{view === "dashboard" ? "Dashboard" : "Secure access"}</h1>
          </div>
          <span className="phase-pill">Phase 1</span>
        </div>

        {message ? <p className="status-message">{message}</p> : null}
        <p className="api-diagnostic">API: {apiUrl}</p>

        {view === "loading" ? <p className="muted">Checking session...</p> : null}
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
      <div>
        <p className="muted">Signed in as {session?.user?.username ?? "admin"}</p>
        <h2>Phase 1 auth complete</h2>
        <p>
          This protected shell is ready for later wallet registration work. No wallet,
          seed phrase, private key, xpub, ypub, or zpub fields exist in Phase 1.
        </p>
      </div>
      <dl>
        <div>
          <dt>API</dt>
          <dd>{apiUrl}</dd>
        </div>
        <div>
          <dt>Session</dt>
          <dd>httpOnly cookie</dd>
        </div>
      </dl>
      <button className="secondary-button" disabled={busy} type="button" onClick={onLogout}>
        Log out
      </button>
    </div>
  );
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
