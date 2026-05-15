import assert from "node:assert/strict";
import test from "node:test";
import { collectRuntimeSecurityWarnings, parseTrustedWebOrigins } from "./runtime-warnings.js";

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

test("parseTrustedWebOrigins drops wildcard/null origins", () => {
  assert.deepEqual(parseTrustedWebOrigins("*, null, http://localhost:3000"), ["http://localhost:3000"]);
});
