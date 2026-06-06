import assert from "node:assert/strict";
import test from "node:test";
import {
  collectRuntimeSecurityErrors,
  collectRuntimeSecurityWarnings,
  parseTrustedWebOrigins
} from "./runtime-warnings.js";

test("collectRuntimeSecurityWarnings warns for weak production settings", () => {
  const warnings = collectRuntimeSecurityWarnings({
    NODE_ENV: "production",
    SESSION_SECRET: "change_this_secret",
    COOKIE_SECURE: "false",
    WEB_ORIGIN: "*",
    API_HOST: "0.0.0.0",
    MEMPOOL_API_URL: "https://mempool.space/api"
  });

  assert.ok(warnings.some((warning) => warning.includes("SESSION_SECRET")));
  assert.ok(warnings.some((warning) => warning.includes("COOKIE_SECURE")));
  assert.ok(warnings.some((warning) => warning.includes("wildcard")));
  assert.ok(warnings.some((warning) => warning.includes("API_HOST")));
  assert.ok(warnings.some((warning) => warning.includes("MEMPOOL_API_URL")));
});

test("collectRuntimeSecurityWarnings accepts explicit local hardened settings", () => {
  const warnings = collectRuntimeSecurityWarnings({
    NODE_ENV: "production",
    SESSION_SECRET: "a".repeat(48),
    COOKIE_SECURE: "true",
    WEB_ORIGIN: "https://atlas.local",
    API_HOST: "127.0.0.1",
    MEMPOOL_API_URL: "http://127.0.0.1:8080/api"
  });

  assert.deepEqual(warnings, []);
});

test("collectRuntimeSecurityErrors blocks fatal production auth and origin settings", () => {
  const errors = collectRuntimeSecurityErrors({
    NODE_ENV: "production",
    SESSION_SECRET: "change_this_secret",
    COOKIE_SECURE: "false",
    WEB_ORIGIN: "*, https://atlas.local"
  });

  assert.ok(errors.some((error) => error.includes("SESSION_SECRET")));
  assert.ok(errors.some((error) => error.includes("WEB_ORIGIN must not")));
  assert.ok(errors.some((error) => error.includes("COOKIE_SECURE")));
});

test("collectRuntimeSecurityErrors allows explicit local HTTP production origins", () => {
  assert.deepEqual(
    collectRuntimeSecurityErrors({
      NODE_ENV: "production",
      SESSION_SECRET: "a".repeat(48),
      COOKIE_SECURE: "false",
      WEB_ORIGIN: "http://raspberrypi.local:3010,http://192.168.1.10:3010"
    }),
    []
  );
});

test("collectRuntimeSecurityErrors accepts hardened HTTPS production settings", () => {
  assert.deepEqual(
    collectRuntimeSecurityErrors({
      NODE_ENV: "production",
      SESSION_SECRET: "a".repeat(48),
      COOKIE_SECURE: "true",
      WEB_ORIGIN: "https://atlas.local"
    }),
    []
  );
});

test("parseTrustedWebOrigins drops wildcard/null origins", () => {
  assert.deepEqual(parseTrustedWebOrigins("*, null, http://localhost:3000"), ["http://localhost:3000"]);
});
