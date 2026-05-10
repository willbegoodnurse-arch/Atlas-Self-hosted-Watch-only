type AttemptRecord = {
  count: number;
  lockedUntil: number;
};

const attempts = new Map<string, AttemptRecord>();
const maxFailures = 5;
const lockMs = 10 * 60 * 1000;

export function assertLoginAllowed(key: string): void {
  const attempt = attempts.get(key);
  if (attempt && attempt.lockedUntil > Date.now()) {
    const retryAfterSeconds = Math.ceil((attempt.lockedUntil - Date.now()) / 1000);
    throw new LoginLockedError(retryAfterSeconds);
  }
}

export function recordLoginFailure(key: string): void {
  const current = attempts.get(key);
  const nextCount = (current?.count ?? 0) + 1;
  attempts.set(key, {
    count: nextCount,
    lockedUntil: nextCount >= maxFailures ? Date.now() + lockMs : 0
  });
}

export function clearLoginFailures(key: string): void {
  attempts.delete(key);
}

export class LoginLockedError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Too many login attempts");
  }
}

