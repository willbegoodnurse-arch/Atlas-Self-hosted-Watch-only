
# Changelog

## v0.1.0 - Release Candidate

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
