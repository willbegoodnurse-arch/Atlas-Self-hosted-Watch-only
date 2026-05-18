# Release And Smoke Test Checklist

Use this checklist before tagging, deploying, or handing off a build.

## Automated Checks

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
git diff --check
npm.cmd audit --omit=dev
```

On non-Windows shells, `npm` is usually fine instead of `npm.cmd`.

On shells with Bash available, run the local release helper:

```bash
./scripts/check-local-release.sh
```

The helper runs typecheck, tests, build, `git diff --check`, and `npm audit --omit=dev`. It does not run `npm install`, `npm update`, `npm audit fix`, `npm audit fix --force`, commit, push, tag, deploy, or read `.env`.

The web regression test suite covers auth/session fallback rendering, wallet cards, wallet identity/MFP display, portal modals, inline receive QR behavior, signed PSBT verification UI, selected UTXO payload mapping, and local fee-estimate fallback copy.

## Phase 56 Local Release Gate

- Run `npm install` from the repository root before release validation, especially after moving or copying the project directory.
- Run `npm run typecheck`.
- Run `npm run test`.
- Run `npm run build`.
- Run `git diff --check`.
- Run `npm audit --omit=dev`.
- Confirm `git status --short` contains only intentional documentation or script changes before committing.
- Do not commit generated build output.
- Do not read, print, or modify `.env`, `wallets.enc`, `auth.json`, cookies, sessions, xpubs, PSBTs, txHex, or RPC credentials during local release validation.

### npm Audit Handling

As of Phase 56, `npm audit --omit=dev` reports a moderate finding through Next's internal PostCSS dependency:

- Installed Next version: `next@15.5.18`.
- Reported vulnerable dependency path: Next internal `postcss@8.4.31`.
- Current status: `npm update next` is already up to date within the Next 15 line in this workspace.
- Current policy: do not run `npm audit fix` or `npm audit fix --force`.
- Reason: npm's force fix can select unsafe or breaking dependency changes.
- Follow-up: re-run `npm update next` and `npm audit --omit=dev` when a newer Next 15 patch is available.
- Release rule: high or critical production dependency findings require review before release.

### Workspace Link Recovery

npm workspaces create local links under `node_modules/@watch-wallet/*`. If this repository is moved or copied, those links can point at an old path.

Symptom example:

```text
Cannot find module '@watch-wallet/bitcoin'
```

Recovery:

```bash
npm install
npm run typecheck
```

Do not manually patch workspace junctions or symlinks.

## Raspberry Pi / Docker Release Gate

- Run `docker compose build`.
- Run `docker compose up -d`.
- Run `./scripts/check-raspi-runtime.sh`.
- Confirm web `/api/status` succeeds through the web origin.
- Confirm host direct API access to `http://127.0.0.1:3011` fails in hardened Docker mode.
- Confirm the web container can reach `http://watch-wallet-api:3011` through Docker internal networking.
- Confirm `watch-wallet-api` uses `expose: ["3011"]`, not a host-published `ports` entry.
- Confirm Bitcoin Core RPC port `8332` is not public.

## Phase 57 UI/UX Cleanup Gate

- Confirm the dashboard top title reads `ATLAS`.
- Confirm the total balance hero does not show a duplicate `Import wallet` action.
- Confirm wallet cards show `Receive` and `Send`.
- Confirm wallet detail primary actions show `Receive` and `Send`.
- Confirm the send workflow still clearly says it creates an unsigned PSBT only and does not sign or broadcast.
- Confirm receive address label editing presents `Label` as the primary visible field and does not require a separate notes field for normal use.
- Confirm portal modals do not close when clicking the backdrop.
- Confirm portal modals do not close on `Escape` unless that behavior is deliberately reintroduced and tested.
- Confirm Receive, xpub reveal, and Send/unsigned PSBT modals have explicit in-panel close or fallback controls.
- Confirm modal backdrop hover/focus does not flash to a white button background.
- Confirm signer verification shows fingerprint/path metadata plus a receive address preview suitable for external signer comparison.
- Confirm signer address preview shows up to five receive addresses without renumbering indexes or changing derivation logic.
- Confirm transaction history default rows do not show internal `receive #0` / `change #1` summaries.
- Confirm transaction `More` still exposes related address details for deeper inspection.
- Confirm Send amount input no longer shows noisy inline `= ... sats` conversion text while sats/BTC parsing still works.
- Confirm signed PSBT inputs like `p1of3 ...`, `p2of3 ...`, and `p3of3 ...` show a specific unsupported multipart QR frame message.
- Confirm Coldcard BBQr import, animated QR full reassembly, KRW price API, receive address discovery changes, and broadcast handoff remain deferred.

## Startup

- Start the API.
- Start the web app.
- Open the frontend.
- Confirm frontend can fetch `/api/auth/session`.
- Confirm runtime status loads.
- Confirm mempool status is clear.
- Confirm `/health` responds from the API host.
- Confirm `/api/status` responds without leaking wallet secrets.

## Raspberry Pi Pre-Flight

- Confirm Node.js 20+ or Docker Compose is installed.
- Confirm `npm install` has completed for direct Node.js deployments.
- Confirm `.env` is configured and is not committed.
- Confirm `WEB_ORIGIN` matches the frontend origin.
- Confirm `WEB_ORIGIN` is not `*` or `null`.
- Confirm production `SESSION_SECRET` is long, random, and not the default.
- Confirm `COOKIE_SECURE=true` when Atlas is served over HTTPS.
- Confirm `NEXT_PUBLIC_API_URL=/api` for hardened same-origin mode, or a direct API URL only for legacy testing.
- Confirm `INTERNAL_API_URL` points from the web server to Atlas API.
- Confirm `COOKIE_SECURE=false` for local HTTP or `COOKIE_SECURE=true` behind HTTPS.
- Confirm API and web ports are selected and firewall rules match them.
- Confirm the `wallets.enc` backup location is known.
- Review `docs/backup-restore.md` and confirm backup/restore ownership is assigned.
- Review `docs/network-exposure-audit.md` and confirm intended port exposure.
- Review `docs/tailscale-https-access.md` before enabling HTTPS camera access through Tailscale Serve or another proxy.
- Confirm Docker users rebuild after changing `NEXT_PUBLIC_API_URL`.
- Confirm Docker/systemd users rebuild or restart web after changing `INTERNAL_API_URL`.
- Confirm `BROADCAST_BACKEND=disabled` unless Bitcoin Core RPC broadcast is intentionally configured.
- If broadcast is configured, confirm Bitcoin Core RPC is private and reachable only from trusted hosts.
- If broadcast is configured, confirm `CORE_RPC_URL` uses `http://` or `https://` and does not embed credentials.
- If broadcast is configured, confirm `.env` is ignored by Git and RPC credentials are not visible in docs, UI, or logs.

## Raspberry Pi Safe Deploy

- Prefer `./scripts/deploy-raspberry-pi.sh` for direct Node.js/systemd Raspberry Pi updates.
- Confirm the script stops when `git status --short` is dirty.
- Confirm the script uses `git pull --ff-only` and prints previous/new commit hashes.
- Confirm dependency install and all builds pass before `atlas-api` or `atlas-web` restart.
- Confirm `packages/bitcoin`, `apps/api`, and `apps/web` are built in that order.
- Confirm stale `apps/web/.next` is removed only after API/package builds pass.
- Confirm `atlas-api` and `atlas-web` are restarted together after successful builds.
- Confirm local non-secret checks pass for `127.0.0.1:3011/api/auth/session` and `127.0.0.1:3000/`.
- Confirm local mempool tip check is warning-only.
- Confirm the deploy output does not print `.env`, `SESSION_SECRET`, `CORE_RPC_PASSWORD`, vault passwords, cookies, full xpubs, or transaction hex.
- Confirm the script does not delete `.env`, delete `wallets.enc`, change firewall rules, open ports, touch Bitcoin Core config, or broadcast transactions.
- Confirm rollback guidance prints the previous commit and remains manual.

## Bitcoin Core Broadcast Readiness

- Confirm `bitcoin-cli getblockchaininfo` works on the Bitcoin Core host.
- Confirm `GET /api/broadcast/status` shows disabled by default or core enabled only when intended.
- Confirm `GET /api/broadcast/core/status` does not return RPC username, password, or full RPC URL.
- Confirm Bitcoin Core RPC port `8332` is not exposed publicly.
- Confirm firewall, `rpcbind`, and `rpcallowip` restrict RPC to localhost or trusted private hosts.
- Follow `docs/bitcoin-core-rpc-live-wiring.md` before any real broadcast attempt.
- Confirm invalid PSBT broadcast is blocked.
- Confirm warning PSBT broadcast is blocked.
- Confirm valid signed PSBT broadcast requires checkbox plus typing `BROADCAST`.
- Confirm a successful broadcast displays txid.
- Confirm there is no raw txHex paste broadcast path.
- Use testnet/signet first where possible; otherwise use a tiny mainnet transaction first.
- Follow `docs/tiny-broadcast-validation.md` before the first live broadcast validation.

## Tiny/Testnet Broadcast Validation

- Confirm `BROADCAST_BACKEND=core` is intentionally set.
- Confirm `CORE_RPC_URL=http://127.0.0.1:8332` or another private Bitcoin Core RPC URL.
- Confirm Core RPC status is connected from Atlas.
- Confirm self-hosted mempool is online.
- Confirm same-origin mode is still active.
- Confirm API port `3011` is still blocked from the PC/LAN.
- Confirm the signed PSBT verification status is `valid`.
- Confirm warning and invalid PSBT broadcast is blocked.
- Confirm the confirmation checkbox is required.
- Confirm typing `BROADCAST` is required.
- Confirm there is no raw txHex broadcast path.
- Confirm txid is displayed on success.
- Confirm the txid is checked after broadcast with Bitcoin Core or self-hosted mempool.
- Use testnet/signet or a tiny amount only.
- Do not run `sendrawtransaction` manually during validation.

## Deployment Smoke Test

- Start Atlas on the Raspberry Pi or Linux host.
- Confirm the API is reachable from the trusted network.
- Confirm the web frontend is reachable from the trusted network.
- Confirm the frontend can reach the configured API URL.
- Confirm local network, Tailscale, or intended private access works.
- Confirm public internet exposure is not enabled by default.
- Restart the API and confirm `wallets.enc` persists.
- Confirm the vault requires manual unlock after restart.
- Confirm backup and restore steps are documented for the deployment.
- Confirm the operator has a current backup of `wallets.enc` and a protected copy of `.env`.
- Confirm the restore checklist has been tested or scheduled before live use.

## Same-Origin API Proxy

- Confirm direct legacy mode still works before switching.
- Set `NEXT_PUBLIC_API_URL=/api`.
- Set `INTERNAL_API_URL=http://127.0.0.1:3011` for same-host systemd/direct Node deployments.
- Use `INTERNAL_API_URL=http://watch-wallet-api:3011` for Docker Compose.
- Restart/rebuild web and restart API.
- Open the web origin and confirm login works.
- Unlock the vault and confirm wallet list, balance, UTXOs, and transactions load.
- Confirm signed PSBT verifier and authenticated broadcast status load.
- After verification, optionally set `API_HOST=127.0.0.1`.
- Confirm direct LAN access to port `3011` fails while web `/api/*` continues to work.
- Keep Bitcoin Core RPC port `8332` private.

## Hardened Runtime Smoke Test

- Follow `docs/hardened-runtime-smoke-test.md` after same-origin mode is deployed.
- Confirm browser requests use `http://<pi-lan-ip>:3000/api/*`, not `http://<pi-lan-ip>:3011/api/*`.
- Confirm PC direct access to `http://<pi-lan-ip>:3011/api/auth/session` fails.
- Confirm Raspberry Pi local access to `http://127.0.0.1:3011/api/auth/session` works.
- Confirm Bitcoin Core RPC port `8332` is not public.
- Confirm self-hosted mempool returns a block height from `http://127.0.0.1:8080/api/blocks/tip/height`.
- Confirm Fulcrum is running and logs do not repeat `401 Unauthorized` or `Lost connection to bitcoind`.
- Confirm Atlas `.env` uses `API_MODE=mempool`, `MEMPOOL_API_URL=http://127.0.0.1:8080/api`, `NEXT_PUBLIC_API_URL=/api`, `INTERNAL_API_URL=http://127.0.0.1:3011`, and `API_HOST=127.0.0.1`.
- Confirm camera QR scanning works through SSH localhost forwarding, or confirm text PSBT import/export fallback.
- Confirm no `sendrawtransaction` command is run during the smoke test.
- Confirm no secrets are printed in logs, screenshots, docs, terminal output, or chat.

## Auth And Vault

- Log in.
- Complete setup if this is a fresh data directory.
- Unlock the vault.
- Confirm locked state is clear when the vault is locked.
- Confirm logout locks the vault.
- Confirm vault auto-lock still works after inactivity.

## Watch-Only Wallet

- Register a watch-only wallet.
- Confirm seed phrase input is rejected.
- Confirm private key or xprv/WIF-looking input is rejected.
- Confirm the xpub/ypub/zpub is masked in normal UI.
- Confirm full xpub reveal requires explicit action.
- Confirm normal API responses do not expose full xpub/ypub/zpub.
- Confirm the browser does not persist xpubs, raw imports, PSBTs, labels, notes, or reveal state in localStorage/sessionStorage/IndexedDB.
- Confirm security headers are present on web and API responses.

## Dashboard And Activity

- View wallet dashboard.
- View balance.
- View receive/change addresses.
- View UTXOs.
- View transactions.
- Confirm backend failures show specific messages and preserve existing data where expected.

## Labels And Notes

- Add, edit, and remove an address label.
- Add, edit, and remove a UTXO note.
- Add, edit, and remove a transaction note.
- Confirm HTML/script-like text is treated as plain metadata or rejected safely.
- Confirm secret-looking label/note input is rejected without echoing the secret.
- Confirm labels and notes do not alter ownership, change, recipient, or security classification.

## Unsigned PSBT Builder

- Select one tracked UTXO.
- Select multiple tracked UTXOs.
- Add one recipient.
- Add multiple recipients.
- Enter sats amount.
- Enter BTC amount.
- Enter decimal sat/vB fee rate.
- Select Fastest, Medium, and Slow fee presets when fee estimates are available.
- Confirm manual fee still works when fee estimates are unavailable.
- If local fee estimates are unavailable while block tip works, follow `docs/mempool-fee-estimates.md` and check precise/recommended fee endpoints, `init-data`, projected mempool blocks, and `/api/mempool`.
- Review selected input total.
- Review recipient outputs, change output, and fee.
- Review the input -> output spending plan.
- Create an unsigned PSBT.
- Export text/base64 PSBT.
- Export single QR if the PSBT is small enough.
- Confirm too-large QR shows a clear message.
- Confirm Animated QR and BBQr are disabled/deferred.

## Signed PSBT Verification

- Paste a signed PSBT.
- Upload a signed PSBT file.
- Scan a signed PSBT QR on HTTPS, localhost, or trusted tunnel access.
- Confirm LAN HTTP shows camera fallback with Paste and File alternatives.
- Provide optional expected recipient, amount, change, and fee checks.
- Review output classifications.
- Confirm unsigned PSBTs are rejected in the signed import flow.
- Confirm broadcast requires verification, checkbox confirmation, and typed `BROADCAST`.
- Review `docs/hardware-signer-roundtrip-validation.md` before hardware signer validation.
- Review warnings and errors.
- Copy txHex only when signed/finalized/extractable.
- If broadcast is disabled, confirm the UI says broadcast backend is disabled.
- If broadcast is enabled, confirm a valid signed PSBT requires checkbox plus typing `BROADCAST`.
- Confirm the broadcast panel warns that broadcasting cannot be undone.
- Confirm warning and invalid PSBTs cannot broadcast.
- Confirm there is no raw txHex paste broadcast path.

## Camera QR

- Open Atlas over HTTPS or localhost if camera scanning is required.
- Confirm plain LAN HTTP camera blocking shows a clear secure-context fallback message.
- Confirm permission denied shows a clear fallback message.
- Confirm text PSBT import/export works without camera access.
- Confirm no public internet exposure is introduced to make camera scanning work.
- Confirm Bitcoin Core RPC remains private.

## Security Regression Check

- No signing feature exists.
- No automatic broadcast feature exists.
- No public mempool/Fulcrum/Electrum broadcast feature exists.
- No seed phrase handling exists.
- No private key handling exists.
- No xprv/yprv/zprv/WIF handling exists except rejection.
- No full xpub leaks in normal API responses.
- No labels or notes in localStorage/sessionStorage.
- No wallet metadata stored outside encrypted vault except expected auth/session files.
- Existing xpub reveal rate limiting remains.
- Full xpub reveal remains explicit and temporary.
- Existing vault auto-lock remains.
- Logout vault lock remains.
- `.env` contains no vault password.
- Bitcoin Core RPC credentials are not committed.

## Backup Check

- Follow `docs/backup-restore.md`.
- Confirm `apps/api/data/wallets.enc` exists after wallet registration.
- Lock the vault or stop the API before backup when practical.
- Back up `wallets.enc` securely.
- Verify the backup file exists.
- Record that the vault password is required and cannot be recovered by the app.
- Record that backups may contain xpubs, labels, notes, addresses, and wallet-history metadata, and must not be shared publicly.

## Phase 47 - Operator Safety Pack

- [ ] Review `docs/backup-restore.md`.
- [ ] Confirm `wallets.enc` and `.env` backup plan exists.
- [ ] Confirm vault password recovery responsibility is documented outside Atlas.
- [ ] Review `docs/tailscale-https-access.md`.
- [ ] Confirm HTTPS/camera access does not expose API `3011`.
- [ ] Confirm Tailscale Serve or reverse proxy serves only the web entry point when used.
- [ ] Review `docs/network-exposure-audit.md`.
- [ ] Confirm API `3011` is private in hardened same-origin mode.
- [ ] Confirm Bitcoin Core RPC `8332` is not public.
- [ ] Confirm no firewall, `.env`, systemd, or Tailscale changes are made without operator review.
- [ ] Confirm no `sendrawtransaction` command is run during safety-pack review.

## Phase 42 — Broadcast validation

- [ ] Review `docs/tiny-broadcast-validation.md`.
- [ ] Use testnet/signet first, or tiny mainnet amount only.
- [ ] Confirm `BROADCAST_BACKEND=core` is intentional.
- [ ] Confirm API `:3011` is not reachable from PC/LAN.
- [ ] Confirm signed PSBT verification is `valid`.
- [ ] Confirm checkbox and typed `BROADCAST` are required.
- [ ] Do not run manual `bitcoin-cli sendrawtransaction`.
- [ ] Record and verify txid after broadcast.
