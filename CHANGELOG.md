
# Changelog

## v0.1.0 - Release Candidate

## Phase 59 - Coldcard Generic JSON and BBQr watch-only import support

- Expanded Coldcard Generic JSON watch-only import parsing to preserve public extended key metadata, master fingerprint, account path, script type, network, and Coldcard source-device context.
- Added support for Coldcard Generic JSON/Text BBQr frame collection and reassembly for the watch-only wallet import flow.
- Added explicit incomplete, duplicate, conflict, total-mismatch, unsupported-format, invalid JSON, and private-material rejection paths without echoing wallet import payloads.
- Kept bare zpub/xpub import working with missing fingerprint/path guidance, while Generic JSON imports with XFP/path now show stronger signer verification metadata.
- Added API, QR classifier, BBQr helper, import preview, and web regression tests for Generic JSON metadata and BBQr frame handling.
- No PSBT builder, signed PSBT verification core, broadcast behavior, wallet derivation/address discovery, auth/session/cookie/vault/xpub reveal behavior, signing, private-key import, dependency updates, commits, pushes, tags, or deployments were changed.

## Phase 58 - Signed PSBT multipart QR reassembly

- Added signed PSBT multipart frame parsing for `pNofM <base64-fragment>` inputs with case and spacing tolerance.
- Added a multipart frame collector that tracks captured frames, missing frame numbers, duplicate identical frames, conflicting frame payloads, and mixed total counts.
- Reassembles complete multipart signed PSBT input in frame-index order and passes the completed base64 into the existing signed PSBT verification flow.
- Updated signed PSBT paste/scan UI to show captured/waiting/ready messages and a `Clear multipart frames` reset action.
- Kept single-frame signed PSBT paste/file/QR behavior working through the existing verification path.
- Added helper and component regression coverage for ordered frames, out-of-order frames, partial frames, duplicates, conflicts, total-count mismatches, and normal signed/unsigned verification behavior.
- No PSBT verification core logic, signed/unsigned classification, broadcast behavior, wallet derivation, auth/session/cookie/vault behavior, xpub reveal behavior, dependency updates, commits, pushes, tags, or deployments were changed.

## Phase 57 - UI/UX cleanup and modal safety fixes

- Renamed the dashboard top-level title to `ATLAS` and removed the duplicate dashboard import action from the total balance hero.
- Standardized visible wallet actions to `Receive` and `Send` while preserving unsigned PSBT safety language inside the send workflow.
- Made portal modals close only through explicit in-panel close/fallback controls, and hardened the modal backdrop hover style so it no longer turns white.
- Reworked wallet signer verification to emphasize signer cross-checks and show up to five receive address preview rows without a first-address copy shortcut.
- Simplified receive address label editing around `Label` while preserving existing address label note data internally.
- Removed internal receive/change index summaries from the default transaction history row while keeping detailed related address data behind `More`.
- Removed noisy send amount conversion helper text without changing sats/BTC parsing or PSBT payload mapping.
- Added signed PSBT multipart QR frame detection for `p1of3`, `p2of3`, and similar fragments with a clear unsupported-message path instead of generic PSBT parse errors.
- Added frontend regression coverage for modal close behavior, signer address preview, wallet action labels, and multipart signed PSBT QR frame guidance.
- No wallet derivation logic, receive/change discovery algorithm, PSBT build/verify core logic, broadcast behavior, auth/session/cookie/vault behavior, xpub reveal behavior, dependency updates, or deployment actions were changed.

## Phase 56 - Release Candidate hardening and deployment readiness

- Added a local release validation script for typecheck, tests, production build, whitespace diff checking, and production dependency audit review.
- Documented the current `npm audit --omit=dev` state for the known Next/PostCSS moderate finding.
- Clarified that `npm audit fix` and `npm audit fix --force` must not be used for the current Next/PostCSS finding because they can introduce unsafe or breaking dependency changes.
- Documented that `next@15.5.18` is currently up to date within the Next 15 line in this workspace, and the Next/PostCSS audit state should be rechecked when a newer Next 15 patch is available.
- Added workspace link recovery guidance for moved or copied project directories where `node_modules/@watch-wallet/*` can point at an old path and cause `Cannot find module '@watch-wallet/bitcoin'`.
- Reaffirmed local and Raspberry Pi/Docker release gates without changing wallet logic, PSBT logic, broadcast behavior, signing, authentication, vault behavior, xpub reveal behavior, or deployment state.
- No commit, push, PR, tag, deployment, dependency fix, Next major upgrade, wallet logic change, or secret exposure was performed.

## Phase 55 - Raspberry Pi production runtime verification

- Enhanced `scripts/check-raspi-runtime.sh` to verify hardened Docker same-origin deployment structure.
- Added checks for host direct API access (should fail in hardened mode when web `/api/status` succeeds).
- Added web container to API connectivity verification using wget or curl inside the container.
- Improved error messages with "Problem / Cause / Fix" format for common Docker networking issues.
- Fixed `.env.example` to recommend `INTERNAL_API_URL=http://watch-wallet-api:3011` for Docker Compose (not `127.0.0.1`).
- Clarified that `127.0.0.1:3011` is only correct for direct Node.js/systemd deployment on the same host.
- Documented that in hardened Docker mode, direct host access to port 3011 should fail, and this is correct behavior.
- Confirmed the intended request flow: browser → Caddy/Tailscale HTTPS → web port 3010 → Docker-internal API port 3011.
- No wallet logic, PSBT logic, broadcast behavior, signing, private key handling, vault deletion, or secret exposure was added.

## Phase 54 - Docker internal API networking and Raspberry Pi deployment guardrails

- Fixed Docker Compose configuration so `watch-wallet-api` uses `expose` instead of `ports` to prevent publishing port 3011 to the host.
- Added `API_HOST=0.0.0.0` and `HOST=0.0.0.0` environment variables to ensure the API binds to Docker-accessible addresses instead of `127.0.0.1` only.
- Fixed `apps/api/Dockerfile` to copy `/app/packages` in the runner stage so the API container can resolve workspace packages like `@watch-wallet/bitcoin` at runtime.
- Added inline comments to `docker-compose.yml` and `apps/api/Dockerfile` explaining why port 3011 must remain Docker-internal and why workspace packages must be copied.
- Added `scripts/check-raspi-runtime.sh` validation script to verify Docker container status, networking configuration, and environment variables without exposing secrets.
- Documented Raspberry Pi HTTPS/Docker networking architecture in `docs/raspberry-pi-deployment.md`, including port structure, request flow, and critical networking rules.
- Added Docker networking troubleshooting section covering `ECONNREFUSED 127.0.0.1:3011`, port binding issues, and Permissions-Policy browser warnings.
- No wallet logic, PSBT logic, broadcast behavior, signing, private key handling, or secret exposure was added.

## Phase 51 - Frontend regression tests

- Added a lightweight Vitest, React Testing Library, and jsdom setup for the Next.js web workspace.
- Added frontend regression coverage for auth/session fallback rendering, browser storage safety, wallet card actions, masked xpub display, wallet identity/MFP fallbacks, portal modal behavior, inline receive QR rendering, signed PSBT inline verification, selected UTXO payload mapping, and Phase 50 fee estimate fallback copy.
- Exported narrow existing UI seams and pure fee/UTXO helpers for deterministic component/unit tests without changing wallet behavior.
- No signing, private-key handling, broadcast behavior, public mempool fallback, or browser wallet-metadata storage was added.

## Phase 50 - Self-hosted mempool fee estimate root cause

- Added sanitized fee estimate diagnostics for local mempool fee endpoint failures, including attempted endpoint paths and HTTP status codes.
- Added a local-only fallback that derives fee presets from `/api/v1/fees/mempool-blocks` medians when recommended fee endpoints are unavailable.
- Improved fee UI copy so manual fee entry remains clear when local fee presets are unavailable or derived from mempool block medians.
- Added self-hosted mempool fee estimate troubleshooting docs and release checklist links.
- No public mempool fallback, broadcast behavior, signing, private key handling, or secret exposure was added.

## Phase 49 - Origin metadata import parsing

- Added first-class import format handling for bare extended public keys, origin-wrapped extended public keys, and descriptors.
- Bare xpub/ypub/zpub imports still work and still show master fingerprint as not provided when no origin metadata exists.
- Parsed BIP32 origin metadata such as `[f23a9c1d/84'/0'/0']zpub...` and descriptor imports such as `wpkh([f23a9c1d/84'/0'/0']zpub.../0/*)` into master fingerprint and account path metadata.
- Added validation so malformed origin fingerprints do not silently fall back to bare extended public key imports.
- Clarified wallet identity copy: `not provided` means the import lacked MFP metadata, not that the import failed.

## Phase 48 - Wallet identity verification display

- Added a wallet detail identity panel for master fingerprint, account path, script type, network, source device, key/import type, and first receive address.
- Added a registered-wallet MFP reveal control beside the extended public key area so fingerprint metadata is not shown by default.
- Added missing-fingerprint guidance for bare xpub/zpub imports and signer verification copy before receiving funds.
- Improved import preview to show fingerprint/path/script/key metadata alongside the first receive address.
- Added import preview tests for bare zpub and descriptor/origin metadata without echoing the full xpub.
- No signing, private-key handling, derivation logic, broadcast behavior, or xpub reveal behavior changed.

## Phase 47 - Operator safety pack

- Added backup, restore, and disaster recovery guidance for `wallets.enc`, `.env`, service files, deployment commit tracking, and sensitive screenshot/chat hygiene.
- Added Tailscale Serve / HTTPS access planning for private camera-capable access while keeping the Atlas API and Bitcoin Core RPC private.
- Added a network exposure audit checklist covering web, API, Bitcoin Core RPC, Fulcrum, mempool, same-origin mode, and public exposure risks.
- Linked the new safety docs from the Raspberry Pi guide, release checklist, README, and security policy.
- No wallet, PSBT, broadcast, firewall, `.env`, or live system behavior was changed.

## Dashboard/login UI cleanup

- Restored the vault-password gate so the main dashboard renders only after the vault is unlocked.
- Removed visible ATLAS text branding, dashboard backend/subtitle copy, redundant sidebar status clutter, wallet detail status strips, watch-only import explanation copy, and the extended public key prefix guide from the active UI.
- Moved wallets into the main dashboard as a horizontal selector with wallet-specific Receive and Send actions; Send continues to open the unsigned PSBT flow only.
- Kept xpub masking, vault security, secret input rejection, receive QR, signed PSBT verification, and broadcast confirmation behavior unchanged.

## Selected wallet and dashboard UX cleanup

- Hid scan configuration text, default UTXO tables, and normal-state wallet-detail mempool/backend/tip/latency clutter from the visible interface.
- Kept selected wallet balance as the first major wallet content block, with receive still visible and UTXO selection available only after clicking the selector action.
- Changed dashboard wallet cards to wide horizontal selector cards and kept wallet-specific Receive/Send actions.
- Moved unsigned PSBT creation and signed PSBT import/verification into a focused portal workflow instead of always-visible bottom panels.
- Updated typography toward a cleaner sans-serif dashboard while keeping monospace for addresses, txids, xpub snippets, and PSBT text.

## Wallet action and PSBT workflow cleanup

- Wired wallet card Receive/받기 actions to the dedicated wallet receive flow.
- Wired wallet card Send/보내기 actions directly to the Create unsigned PSBT workflow.
- Removed the default selected-wallet Receive / Select UTXOs combined panel from the wallet detail page.
- Moved single and multiple UTXO selection into the Create PSBT modal while preserving automatic coin selection when no UTXOs are manually selected.
- Kept unsigned PSBT export and signed PSBT import/verification in the same focused workflow.
- Preserved the watch-only, unsigned-PSBT-only security model.

## Phase 44 - Security threat model hardening

- Added API and web security headers for content sniffing, referrer policy, frame denial, limited CSP frame ancestry, and scoped camera/clipboard permissions.
- Added runtime warnings for risky Raspberry Pi production configuration such as weak session secrets, insecure cookies, wildcard web origins, all-interface API binding, and public mempool backends.
- Expanded sensitive log/error redaction for PSBT-like payloads, named secrets, session cookies, vault passwords, TOTP values, WIFs, and extended keys.
- Tightened CORS origin parsing to ignore wildcard/null origins and keep credentials limited to explicit trusted web origins.
- Added UI and docs copy explaining compromised-browser limits, receive address verification, PSBT output verification, backup sensitivity, and realistic Raspberry Pi threat boundaries.

## UI refresh - Minimal Atlas wallet interface

- Redesigned the web app toward a restrained black-and-white Bitcoin wallet dashboard with quieter surfaces, calmer status pills, and a large real-data total balance presentation.
- Reduced the previous cypherpunk/terminal-heavy styling, removed the dominant Atlas background artwork from the app surface, and added a subtle top-right Atlas line-mark/wordmark.
- Cleaned up dashboard, wallet detail, receive, UTXO, activity, and PSBT visual hierarchy while preserving watch-only and unsigned PSBT safety messaging.
- Kept xpub masking, explicit xpub reveal, vault lock/unlock behavior, PortalModal behavior, and private-key/seed rejection intact.
- Improved mobile layout behavior with stacked cards, compact navigation, and safer truncation-friendly surfaces.

## Phase 43 - Safe Raspberry Pi deploy script

- Added `scripts/deploy-raspberry-pi.sh` for fail-closed direct Node.js/systemd Raspberry Pi updates.
- Script refuses dirty worktrees, pulls with `--ff-only`, builds packages/API/web in safe order, clears stale `.next`, restarts `atlas-api` and `atlas-web` only after successful builds, and runs local non-secret health checks.
- Documented safe deploy usage, rollback guidance, and security boundaries.

## Phase 42 — Tiny/Testnet signed PSBT broadcast validation docs

- Added/confirmed signed PSBT broadcast validation checklist.
- Clarified testnet/signet or tiny mainnet validation flow.
- No code changes, no signing changes, and no transaction broadcast performed.

### Added

- Atlas self-hosted Bitcoin watch-only dashboard.
- Watch-only wallet registration using extended public keys, descriptors, and supported wallet export formats.
- Encrypted server-side vault storage for watch-only wallet metadata.
- Manual vault unlock with a vault password.
- Vault auto-lock after inactivity and vault lock on logout.
- Masked xpub, ypub, and zpub display with explicit temporary reveal.
- Wallet dashboard with balance, UTXO, transaction, and backend status views.
- Address labels, UTXO notes, and transaction notes as user metadata.
- Unsigned PSBT builder with tracked UTXO selection, multiple recipients, sats/BTC amount entry, fee controls, and change display.
- Input to output spending plan visualization.
- Unsigned PSBT base64 text export and single QR export when small enough.
- Signed PSBT verification with optional expected recipient, amount, change, and fee checks.
- txHex display only when a signed PSBT is extractable.
- Optional Bitcoin Core RPC broadcast for already-signed transactions after server-side signed PSBT verification returns `valid`.
- Non-broadcasting Bitcoin Core RPC status diagnostics for live configuration checks.
- Raspberry Pi Bitcoin Core RPC live wiring checklist.
- Camera QR secure-context guidance and clearer camera fallback messaging.
- Same-origin `/api/*` proxy support for reducing browser-visible API port exposure.
- Portal-safe scanner and xpub reveal modals with explicit visible panels above backdrops.
- Locked-vault wallet import warnings, visible Save Wallet disabled reasons, sanitized API error mapping, and first receive address preview before save.
- Raspberry Pi, Docker Compose, systemd example, backup/restore, and smoke test documentation.

### Security

- No seed phrase handling.
- No private key handling.
- No xprv, yprv, zprv, or WIF support except rejection.
- No transaction signing.
- Broadcast disabled by default.
- No unsigned, warning, invalid, automatic, public mempool, Fulcrum, or Electrum broadcast.
- Bitcoin Core RPC broadcast uses server-extracted txHex from verified signed PSBTs only.
- Bitcoin Core RPC URL validation rejects unsupported protocols and embedded credentials.
- Browser can use same-origin `/api` instead of direct LAN API port access.
- Normal API responses use xpub redaction and masking.
- Vault password is not stored in `.env`.
- Derived vault key is memory-only and cleared when the vault locks or the process restarts.
- Explicit xpub reveal endpoint is rate-limited.
- Receive address QR display is inline, and remaining true modals render through a body portal.
- Wallet import preview derives only the first receive address and never returns the submitted xpub in its response.
- Logs redact sensitive material such as wallet keys, private-key-looking values, cookies, and auth headers.
- Labels and notes do not affect wallet ownership, change, recipient, warning, or PSBT verification decisions.

### Limitations

- No signing.
- No public mempool, Fulcrum, or Electrum broadcast.
- No seed phrase or private key support.
- Animated QR export is deferred.
- BBQr export is deferred.
- Single QR export works only for PSBTs small enough for one QR.
- PSBT compatibility with every external signer is not guaranteed.
- Fee estimates depend on the configured mempool backend.
- Address discovery depends on current scan depth and gap limit behavior.
- Atlas is not audited.
- The operator is responsible for Raspberry Pi, server, network, backup, and access security.
