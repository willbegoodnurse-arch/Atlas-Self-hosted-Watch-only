import assert from "node:assert/strict";
import test from "node:test";
import {
  VaultUnlockLockedError,
  assertVaultUnlockAllowed,
  buildVaultUnlockAttemptKey,
  clearAllVaultUnlockFailures,
  clearVaultUnlockFailures,
  recordVaultUnlockFailure
} from "./unlock-attempts.js";

test("vault unlock attempts lock after repeated failures", () => {
  clearAllVaultUnlockFailures();
  const key = buildVaultUnlockAttemptKey({ ip: "127.0.0.1", username: "admin" });

  for (let index = 0; index < 4; index += 1) {
    recordVaultUnlockFailure(key);
    assert.doesNotThrow(() => assertVaultUnlockAllowed(key));
  }

  recordVaultUnlockFailure(key);
  assert.throws(() => assertVaultUnlockAllowed(key), VaultUnlockLockedError);
});

test("vault unlock attempt clear removes lock for that key only", () => {
  clearAllVaultUnlockFailures();
  const lockedKey = buildVaultUnlockAttemptKey({ ip: "127.0.0.1", username: "admin" });
  const otherKey = buildVaultUnlockAttemptKey({ ip: "127.0.0.2", username: "admin" });

  for (let index = 0; index < 5; index += 1) {
    recordVaultUnlockFailure(lockedKey);
  }

  assert.throws(() => assertVaultUnlockAllowed(lockedKey), VaultUnlockLockedError);
  assert.doesNotThrow(() => assertVaultUnlockAllowed(otherKey));

  clearVaultUnlockFailures(lockedKey);
  assert.doesNotThrow(() => assertVaultUnlockAllowed(lockedKey));
});
