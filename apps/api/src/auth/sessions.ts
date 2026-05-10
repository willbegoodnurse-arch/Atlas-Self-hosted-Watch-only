import crypto from "node:crypto";

export type SessionRecord = {
  username: string;
  expiresAt: number;
};

const sessions = new Map<string, SessionRecord>();

export function createSession(username: string, ttlMs: number): string {
  pruneExpiredSessions();
  const token = crypto.randomBytes(32).toString("base64url");
  sessions.set(token, {
    username,
    expiresAt: Date.now() + ttlMs
  });
  return token;
}

export function getSession(token: string | undefined): SessionRecord | null {
  if (!token) {
    return null;
  }

  const session = sessions.get(token);
  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }

  return session;
}

export function deleteSession(token: string | undefined): void {
  if (token) {
    sessions.delete(token);
  }
}

function pruneExpiredSessions(): void {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) {
      sessions.delete(token);
    }
  }
}

