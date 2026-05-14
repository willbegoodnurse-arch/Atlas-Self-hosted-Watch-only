# Hardened Runtime Smoke Test

## Purpose

This smoke test confirms Atlas is running in hardened Raspberry Pi mode:

- The web UI is reachable from the trusted LAN or tailnet.
- The Atlas API is bound to localhost.
- The browser uses same-origin `/api/*` through the web server.
- Bitcoin Core RPC is local or private only.
- Fulcrum is reachable for diagnostics.
- A self-hosted mempool instance is used for wallet activity and fee data.
- Camera QR scanning works through localhost forwarding when needed.
- No transaction broadcast is performed.

This test verifies runtime wiring. It does not prove wallet funds are safe, replace manual PSBT review, or audit the software.

## Safety Rules

- Do not run `sendrawtransaction`.
- Do not broadcast a transaction during this smoke test.
- Do not paste or share RPC passwords.
- Do not expose Bitcoin Core RPC port `8332` publicly.
- Do not expose Atlas API port `3011` publicly.
- Do not paste seed phrases, private keys, xprv values, or WIF keys into Atlas.
- Use text PSBT import/export if camera scanning is not needed.
- Do not print `SESSION_SECRET`, vault passwords, RPC passwords, cookies, or full xpub values in screenshots, chat, tickets, or logs.

## A. Atlas Service Status

Run on the Raspberry Pi:

```bash
sudo systemctl status atlas-api --no-pager
sudo systemctl status atlas-web --no-pager
```

Expected:

- `atlas-api` is active.
- `atlas-web` is active.
- No restart loop is visible.

## B. Port Binding Check

Run on the Raspberry Pi:

```bash
ss -ltnp | grep -E "3000|3011|8332|50001|8080"
```

Expected hardened state:

- Atlas web: `0.0.0.0:3000` or a trusted interface.
- Atlas API: `127.0.0.1:3011`.
- Bitcoin Core RPC: `127.0.0.1:8332` and optionally a private Docker gateway only.
- Fulcrum: `0.0.0.0:50001` or the intended private binding.
- Self-hosted mempool web/API: `0.0.0.0:8080` or local/private as configured.

Red flags:

- `0.0.0.0:8332` is unsafe for Bitcoin Core RPC.
- `0.0.0.0:3011` is not the hardened Atlas API mode.

## C. PC Direct API Should Fail

Run from the PC PowerShell:

```powershell
curl.exe http://172.30.1.50:3011/api/auth/session
```

Expected:

- Connection failure, timeout, or unreachable host.
- This is good in hardened mode because the API is localhost-only.

## D. Web Should Work

Open from the trusted PC browser:

```text
http://172.30.1.50:3000
```

Expected:

- Atlas login screen or dashboard loads.
- The app does not require direct browser access to port `3011`.

## E. Same-Origin Network Tab Check

In the browser:

1. Open DevTools.
2. Open the Network tab.
3. Filter for `session`.
4. Reload Atlas.

Expected request URL:

```text
http://172.30.1.50:3000/api/auth/session
```

Not expected:

```text
http://172.30.1.50:3011/api/auth/session
```

If the browser calls port `3011`, the web build or environment is still in legacy direct mode. Recheck `NEXT_PUBLIC_API_URL=/api`, `INTERNAL_API_URL`, and the web service rebuild/restart.

## F. API Local Check From Raspberry Pi

Run on the Raspberry Pi:

```bash
curl http://127.0.0.1:3011/api/auth/session
```

Expected:

- JSON response.
- An unauthenticated response is okay if no browser session cookie is provided.
- `setupComplete: true` is expected after setup has been completed.

## G. Bitcoin Core Health

Run on the Raspberry Pi:

```bash
bitcoin-cli getblockchaininfo
ss -ltnp | grep 8332
```

Expected:

- `chain` is the intended network, such as `main`, `test`, `signet`, or `regtest`.
- `initialblockdownload` is `false` for normal mainnet operation.
- `blocks` and `headers` are close or equal.
- RPC is not public.

Do not run `sendrawtransaction` during this smoke test.

## H. Fulcrum Health

Run on the Raspberry Pi:

```bash
sudo systemctl status fulcrum --no-pager
ss -ltnp | grep 50001
sudo journalctl -u fulcrum -n 80 --no-pager
```

Expected:

- Fulcrum is active.
- Port `50001` is listening on the intended interface.
- No repeating `401 Unauthorized`.
- No repeating `Lost connection to bitcoind`.

## I. Self-Hosted Mempool Health

Run on the Raspberry Pi:

```bash
cd ~/mempool/docker
docker compose ps
docker compose logs --since=2m api
curl --max-time 10 http://127.0.0.1:8080/api/blocks/tip/height
```

Expected:

- mempool `api`, `db`, and `web` services are up.
- Logs show the API connected to the Electrum server.
- Logs show the database connection is established.
- Logs show the mempool server is running.
- The `curl` command returns a block height number.

## J. Atlas .env Mempool Target

Run on the Raspberry Pi:

```bash
cd ~/watch-wallet
grep -E "API_MODE|MEMPOOL_API_URL|NEXT_PUBLIC_API_URL|INTERNAL_API_URL|API_HOST" .env
```

Expected:

```env
API_MODE=mempool
MEMPOOL_API_URL=http://127.0.0.1:8080/api
NEXT_PUBLIC_API_URL=/api
INTERNAL_API_URL=http://127.0.0.1:3011
API_HOST=127.0.0.1
```

Do not grep or print `SESSION_SECRET`, vault passwords, `CORE_RPC_PASSWORD`, or `rpcpassword`.

## K. Atlas UI Functional Checks

In the browser:

- Log in.
- Complete OTP if enabled.
- Unlock the vault.
- Confirm wallet list loads.
- Open a wallet detail view.
- Confirm mempool status is online or clearly degraded with a useful message.
- Confirm balance is not stuck offline when the local mempool backend has data.
- Confirm transactions and UTXOs do not return repeated `500` errors.
- Confirm signed PSBT verifier loads.
- Confirm broadcast status loads if broadcast is configured and the session is authenticated.
- Log out.
- Confirm logout locks the vault.

## L. Camera QR Check Through Localhost Forwarding

From PC PowerShell:

```powershell
ssh -L 3000:127.0.0.1:3000 hodlcrabs@172.30.1.50
```

Keep this SSH session open, then open:

```text
http://localhost:3000
```

Expected:

- Atlas loads.
- The backend mode shown in the UI is same-origin.
- The camera scanner can request browser permission.
- QR scan works if permission is granted and a camera is available.
- If permission is denied, text import/export remains available.

Note: `http://172.30.1.50:3000` may still block camera access because it is plain LAN HTTP. This is browser security behavior.

## M. Broadcast Safety Check

Expected during this smoke test:

- No transaction broadcast happens.
- No `sendrawtransaction` command is run.
- The unsigned PSBT builder only creates unsigned PSBTs.
- The signed PSBT verifier only verifies unless the operator explicitly confirms broadcast.
- Warning, invalid, unsigned, and non-extractable PSBTs cannot broadcast.
- The broadcast UI requires a confirmation checkbox plus typing `BROADCAST`.
- Broadcasting is treated as irreversible if used in a future live test.

## Pass Criteria

- Web is reachable on the trusted web port.
- Browser network requests use same-origin `/api/*`.
- Direct PC access to port `3011` fails.
- Local Raspberry Pi access to `127.0.0.1:3011` works.
- Bitcoin Core RPC is not public.
- Fulcrum is running without repeated auth or bitcoind connection failures.
- Self-hosted mempool returns a block height from `127.0.0.1:8080`.
- Atlas uses `MEMPOOL_API_URL=http://127.0.0.1:8080/api`.
- Camera QR works through localhost forwarding, or text fallback is confirmed.
- No transaction broadcast is performed.

## Known Limitations

- This smoke test is manual and operational; it is not a security audit.
- It does not prove PSBT contents are safe.
- It does not test a real transaction broadcast.
- It does not remove the need for cold-wallet verification of recipient, change, and fee.
- It assumes the Raspberry Pi host, SSH account, firewall, and Bitcoin Core node are operated securely.
