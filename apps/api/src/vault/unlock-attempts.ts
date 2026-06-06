type AttemptRecord = {
  count: number;
  lockedUntil: number;
};

const attempts = new Map<string, AttemptRecord>();
const maxFailures = 5;
const lockMs = 10 * 60 * 1000;

export function buildVaultUnlockAttemptKey(input: {
  ip: string;
  username: string;
}): string {
  return `${input.ip}:${input.username}`;
}

export function assertVaultUnlockAllowed(key: string): void {
  const attempt = attempts.get(key);
  if (attempt && attempt.lockedUntil > Date.now()) {
    const retryAfterSeconds = Math.ceil((attempt.lockedUntil - Date.now()) / 1000);
    throw new VaultUnlockLockedError(retryAfterSeconds);
  }
}

export function recordVaultUnlockFailure(key: string): void {
  const current = attempts.get(key);
  const nextCount = (current?.count ?? 0) + 1;
  attempts.set(key, {
    count: nextCount,
    lockedUntil: nextCount >= maxFailures ? Date.now() + lockMs : 0
  });
}

export function clearVaultUnlockFailures(key: string): void {
  attempts.delete(key);
}

export function clearAllVaultUnlockFailures(): void {
  attempts.clear();
}

export class VaultUnlockLockedError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Too many vault unlock attempts");
  }
}
