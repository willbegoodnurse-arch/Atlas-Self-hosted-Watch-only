import assert from "node:assert/strict";
import test from "node:test";
import { classifyBackendKind, isLocalMempoolUrl } from "./backend.js";

test("isLocalMempoolUrl detects localhost", () => {
  assert.equal(isLocalMempoolUrl("http://localhost:8080/api"), true);
  assert.equal(isLocalMempoolUrl("http://localhost/api"), true);
});

test("isLocalMempoolUrl detects 127.0.0.1", () => {
  assert.equal(isLocalMempoolUrl("http://127.0.0.1:8080/api"), true);
});

test("isLocalMempoolUrl detects 192.168.x.x", () => {
  assert.equal(isLocalMempoolUrl("http://192.168.0.23:8080/api"), true);
  assert.equal(isLocalMempoolUrl("http://192.168.1.100:8080/api"), true);
});

test("isLocalMempoolUrl detects 10.x.x.x", () => {
  assert.equal(isLocalMempoolUrl("http://10.0.0.1:8080/api"), true);
  assert.equal(isLocalMempoolUrl("http://10.255.255.255:8080/api"), true);
});

test("isLocalMempoolUrl detects 172.16-31.x.x", () => {
  assert.equal(isLocalMempoolUrl("http://172.16.0.1:8080/api"), true);
  assert.equal(isLocalMempoolUrl("http://172.31.255.255:8080/api"), true);
  assert.equal(isLocalMempoolUrl("http://172.15.0.1:8080/api"), false);
  assert.equal(isLocalMempoolUrl("http://172.32.0.1:8080/api"), false);
});

test("isLocalMempoolUrl detects 100.64.x.x (Tailscale/CGNAT)", () => {
  assert.equal(isLocalMempoolUrl("http://100.64.0.1:8080/api"), true);
  assert.equal(isLocalMempoolUrl("http://100.100.1.1:8080/api"), true);
  assert.equal(isLocalMempoolUrl("http://100.127.255.255:8080/api"), true);
  assert.equal(isLocalMempoolUrl("http://100.63.255.255:8080/api"), false);
  assert.equal(isLocalMempoolUrl("http://100.128.0.0:8080/api"), false);
});

test("isLocalMempoolUrl returns false for mempool.space", () => {
  assert.equal(isLocalMempoolUrl("https://mempool.space/api"), false);
  assert.equal(isLocalMempoolUrl("https://blockstream.info/api"), false);
});

test("classifyBackendKind returns mempool-public for public HTTPS mempool URL", () => {
  assert.equal(
    classifyBackendKind({ apiMode: "mempool", mempoolApiUrl: "https://mempool.space/api" }),
    "mempool-public"
  );
  assert.equal(
    classifyBackendKind({ apiMode: "mempool", mempoolApiUrl: "https://blockstream.info/api" }),
    "mempool-public"
  );
});

test("classifyBackendKind returns mempool-local for private/local URL", () => {
  assert.equal(
    classifyBackendKind({ apiMode: "mempool", mempoolApiUrl: "http://localhost:8080/api" }),
    "mempool-local"
  );
  assert.equal(
    classifyBackendKind({ apiMode: "mempool", mempoolApiUrl: "http://192.168.1.1:8080/api" }),
    "mempool-local"
  );
});

test("classifyBackendKind returns fulcrum for API_MODE=fulcrum", () => {
  assert.equal(
    classifyBackendKind({ apiMode: "fulcrum", mempoolApiUrl: "http://localhost:8080/api" }),
    "fulcrum"
  );
});

test("classifyBackendKind returns unknown for unrecognized mode", () => {
  assert.equal(
    classifyBackendKind({ apiMode: "rpc", mempoolApiUrl: "https://mempool.space/api" }),
    "unknown"
  );
  assert.equal(
    classifyBackendKind({ apiMode: "", mempoolApiUrl: "https://mempool.space/api" }),
    "unknown"
  );
});
