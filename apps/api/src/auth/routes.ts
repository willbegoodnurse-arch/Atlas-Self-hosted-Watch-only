import argon2 from "argon2";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { LoginLockedError, assertLoginAllowed, clearLoginFailures, recordLoginFailure } from "./attempts.js";
import { authConfig } from "./config.js";
import { createSession, deleteSession, getSession } from "./sessions.js";
import { readAuthRecord, writeAuthRecord } from "./store.js";
import { createTotpQr, createTotpSecret, verifyTotpCode } from "./totp.js";
import { lockVault } from "../vault/store.js";

type SetupBody = {
  username?: string;
  password?: string;
  passwordConfirm?: string;
};

type LoginBody = {
  username?: string;
  password?: string;
  totpCode?: string;
};

type TotpVerifyBody = {
  username?: string;
  password?: string;
  totpCode?: string;
};

export async function registerAuthRoutes(server: FastifyInstance): Promise<void> {
  server.post<{ Body: SetupBody }>("/api/auth/setup", async (request, reply) => {
    const existing = await readAuthRecord();
    if (existing) {
      if (existing.twoFactorEnabled) {
        return reply.code(409).send({ error: "Initial setup is already complete" });
      }

      const username = sanitizeUsername(request.body?.username);
      const password = request.body?.password;
      if (
        !username ||
        typeof password !== "string" ||
        username !== existing.username ||
        !(await argon2.verify(existing.passwordHash, password))
      ) {
        return reply.code(401).send({ error: "Invalid credentials" });
      }

      const qr = await createTotpQr(existing.username, existing.totpSecret);
      return reply.send({
        setupComplete: false,
        twoFactorEnabled: false,
        ...qr
      });
    }

    const validation = validateSetupBody(request.body);
    if (!validation.ok) {
      return reply.code(400).send({ error: validation.error });
    }

    const totpSecret = createTotpSecret();
    const passwordHash = await argon2.hash(validation.password, {
      type: argon2.argon2id
    });

    await writeAuthRecord({
      username: validation.username,
      passwordHash,
      totpSecret,
      twoFactorEnabled: false,
      createdAt: new Date().toISOString()
    });

    const qr = await createTotpQr(validation.username, totpSecret);
    return reply.code(201).send({
      setupComplete: false,
      twoFactorEnabled: false,
      ...qr
    });
  });

  server.post<{ Body: LoginBody }>(
    "/api/auth/login",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const auth = await readAuthRecord();
      if (!auth || !auth.twoFactorEnabled) {
        return reply.code(403).send({ error: "Initial setup is not complete" });
      }

      const username = sanitizeUsername(request.body?.username);
      const password = request.body?.password;
      const totpCode = sanitizeTotpCode(request.body?.totpCode);
      const attemptKey = `${request.ip}:${username ?? "unknown"}`;

      try {
        assertLoginAllowed(attemptKey);
      } catch (error) {
        if (error instanceof LoginLockedError) {
          reply.header("Retry-After", String(error.retryAfterSeconds));
          return reply.code(429).send({ error: "Too many login attempts" });
        }
        throw error;
      }

      if (
        !username ||
        typeof password !== "string" ||
        !totpCode ||
        username !== auth.username ||
        !(await argon2.verify(auth.passwordHash, password)) ||
        !verifyTotpCode(auth.totpSecret, totpCode)
      ) {
        recordLoginFailure(attemptKey);
        return reply.code(401).send({ error: "Invalid credentials or code" });
      }

      clearLoginFailures(attemptKey);
      setSessionCookie(reply, createSession(auth.username, authConfig.sessionTtlMs));
      return reply.send({
        authenticated: true,
        setupComplete: true,
        user: {
          username: auth.username
        }
      });
    }
  );

  server.post("/api/auth/logout", async (request, reply) => {
    const token = getSessionToken(request);
    deleteSession(token);
    clearSessionCookie(reply);
    lockVault();
    return reply.send({ authenticated: false });
  });

  server.get("/api/auth/session", async (request) => {
    const auth = await readAuthRecord();
    const session = getSession(getSessionToken(request));
    return {
      authenticated: Boolean(session),
      setupComplete: Boolean(auth?.twoFactorEnabled),
      user: session
        ? {
            username: session.username
          }
        : null
    };
  });

  server.post<{ Body: TotpVerifyBody }>("/api/auth/totp/verify", async (request, reply) => {
    const auth = await readAuthRecord();
    if (!auth) {
      return reply.code(404).send({ error: "Initial setup has not been started" });
    }

    if (auth.twoFactorEnabled) {
      return reply.code(409).send({ error: "TOTP is already enabled" });
    }

    const username = sanitizeUsername(request.body?.username);
    const password = request.body?.password;
    const totpCode = sanitizeTotpCode(request.body?.totpCode);

    if (
      !username ||
      typeof password !== "string" ||
      !totpCode ||
      username !== auth.username ||
      !(await argon2.verify(auth.passwordHash, password)) ||
      !verifyTotpCode(auth.totpSecret, totpCode)
    ) {
      return reply.code(401).send({ error: "Invalid credentials or code" });
    }

    await writeAuthRecord({
      ...auth,
      twoFactorEnabled: true
    });

    setSessionCookie(reply, createSession(auth.username, authConfig.sessionTtlMs));
    return reply.send({
      authenticated: true,
      setupComplete: true,
      twoFactorEnabled: true,
      user: {
        username: auth.username
      }
    });
  });
}

function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(authConfig.sessionCookieName, token, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: authConfig.cookieSecure,
    signed: true,
    maxAge: Math.floor(authConfig.sessionTtlMs / 1000)
  });
}

function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(authConfig.sessionCookieName, {
    path: "/",
    sameSite: "lax",
    secure: authConfig.cookieSecure
  });
}

function getSessionToken(request: FastifyRequest): string | undefined {
  const rawCookie = request.cookies[authConfig.sessionCookieName];
  if (!rawCookie) {
    return undefined;
  }

  const unsigned = request.unsignCookie(rawCookie);
  return unsigned.valid ? unsigned.value : undefined;
}

function validateSetupBody(body: SetupBody | undefined):
  | { ok: true; username: string; password: string }
  | { ok: false; error: string } {
  const username = sanitizeUsername(body?.username);
  const password = body?.password;
  const passwordConfirm = body?.passwordConfirm;

  if (!username) {
    return { ok: false, error: "Username must be 3-64 characters using letters, numbers, dot, dash, or underscore" };
  }

  if (typeof password !== "string" || password.length < 12) {
    return { ok: false, error: "Password must be at least 12 characters" };
  }

  if (password !== passwordConfirm) {
    return { ok: false, error: "Passwords do not match" };
  }

  return {
    ok: true,
    username,
    password
  };
}

function sanitizeUsername(username: unknown): string | null {
  if (typeof username !== "string") {
    return null;
  }

  const trimmed = username.trim();
  return /^[a-zA-Z0-9._-]{3,64}$/.test(trimmed) ? trimmed : null;
}

function sanitizeTotpCode(code: unknown): string | null {
  if (typeof code !== "string") {
    return null;
  }

  const trimmed = code.trim().replace(/\s/g, "");
  return /^\d{6}$/.test(trimmed) ? trimmed : null;
}
