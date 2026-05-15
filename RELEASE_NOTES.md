
# Atlas v0.1.0 Release Candidate Notes

## Phase 47 - Operator Safety Pack

Phase 47 adds operator-facing safety documentation for backup/restore/disaster recovery, Tailscale Serve HTTPS access planning, and final network exposure audits. The new docs emphasize that watch-only metadata is privacy-sensitive, `.env` is secret, `wallets.enc` needs the vault password, API `3011` should remain private in hardened mode, and Bitcoin Core RPC `8332` must not be public.

This phase is documentation-only. It does not change wallet logic, PSBT logic, broadcast behavior, `.env`, firewall rules, systemd units, Tailscale settings, or live network exposure.

## Dashboard/Login UI Cleanup

The login/dashboard flow now gates the main app behind vault unlock again: after sign-in, a locked vault shows only the vault password prompt before the dashboard is mounted. The dashboard also removes redundant ATLAS text branding, normal-state technical status clutter, backend subtitle copy, the watch-only import explanation block, and the extended public key prefix guide.

Wallets now live in the main dashboard as a horizontal selector with wallet-specific Receive and Send actions. Send remains the existing unsigned PSBT creation flow and does not add signing.

## Selected Wallet and Dashboard UX Cleanup

The selected wallet screen now keeps balance first, hides scan configuration text and default UTXO/status clutter, and exposes UTXO rows only when the operator enters UTXO selection mode. Dashboard wallet cards are wider horizontal selector cards, and unsigned PSBT creation plus signed PSBT import/verification now happen in a focused portal workflow instead of always-visible lower panels.

## Wallet Action and PSBT Workflow Cleanup

Wallet card Receive/받기 now opens the selected wallet's receive flow, while Send/보내기 opens the Create unsigned PSBT workflow directly. The selected-wallet detail page no longer shows a default Receive / Select UTXOs combined panel; manual single or multiple UTXO selection now lives inside the PSBT modal, with automatic coin selection preserved when no UTXO is selected.

Unsigned PSBT export and signed PSBT import/verification remain in the same focused workflow. Atlas remains watch-only and does not sign transactions.

## Phase 44

Phase 44 hardens the watch-only metadata threat model for Raspberry Pi deployments. It adds web/API security headers, runtime warnings for risky production configuration, broader sensitive log redaction, stricter trusted-origin parsing, and clearer UI/docs warnings about compromised browsers, PSBT verification, backups, and xpub/metadata privacy.

This phase does not add signing, private-key handling, public broadcast backends, telemetry, or hosted dependencies.

## Minimal Atlas UI Refresh

The web interface now uses a quieter black-and-white wallet dashboard direction: large balance-first dashboard presentation, calmer status pills, flatter near-black cards, and a subtle Atlas line-mark/wordmark in the app header. The previous terminal-heavy/cypherpunk visual treatment and large Atlas background artwork have been reduced.

This is a visual and copy refinement only. Atlas remains watch-only, does not sign transactions, keeps xpubs masked by default, preserves explicit xpub reveal, and keeps the external-signing PSBT workflow intact.

## Phase 43

Phase 43 adds a safe Raspberry Pi deployment script for direct Node.js/systemd installs. It is deployment safety only: no wallet logic, PSBT logic, broadcast logic, signing, or transaction broadcast changes.

## Phase 42

Phase 42 documents the safe signed PSBT broadcast validation flow. This is documentation-only: no code changes, no signing changes, and no transaction broadcast performed.

## What This Release Is

Atlas v0.1.0 is a release candidate for a self-hosted Bitcoin watch-only wallet dashboard for your own node. It is intended to help an operator view wallet activity, organize watch-only metadata, create unsigned PSBTs, and verify signed PSBTs without putting signing material on the server.

Atlas is watch-only for key custody. It does not hold seed phrases or private keys and does not sign transactions. Optional broadcast is disabled by default and uses Bitcoin Core RPC only after server-side signed PSBT verification succeeds.

## Who This Is For

This release is for operators who understand Bitcoin watch-only wallets and want a local Raspberry Pi, Docker, or small Linux server dashboard. It is best used on a trusted local network, Tailscale, or carefully configured Tor access.

It is not a custody service, hot wallet, public internet wallet, or replacement for a mature signing wallet.

## Core Workflow

1. Install Atlas on a local machine or Raspberry Pi.
2. Configure `.env` without wallet secrets.
3. Start the API and web app.
4. Create an admin account and unlock the encrypted vault manually.
5. Register a watch-only wallet using an extended public key, descriptor, or supported export format.
6. Review balances, UTXOs, transactions, labels, and notes.
7. Build an unsigned PSBT from tracked UTXOs.
8. Export the unsigned PSBT as text or a single QR when it fits.
9. Sign externally with a cold wallet that holds the private keys.
10. Paste the signed PSBT into Atlas for verification.
11. Verify every output before broadcasting elsewhere with another tool or, if configured, through your Bitcoin Core node.

## Security Model

- The server stores watch-only wallet data in encrypted `wallets.enc`.
- The vault password is required to unlock the vault.
- The vault password is not stored in `.env`.
- The derived vault key is memory-only.
- Normal API responses return masked extended public keys.
- Full xpub reveal is explicit, temporary, and rate-limited.
- Receive address QR display is inline; remaining blocking overlays use body-portal modal panels.
- Wallet import shows locked-vault warnings, Save Wallet disabled reasons, and a first receive address preview without returning the submitted xpub from the preview API.
- Vault auto-locks after inactivity.
- Logout locks the vault.
- Labels and notes are metadata only and do not change security decisions.
- Broadcast is disabled by default and blocked for unsigned, warning, or invalid PSBTs.
- Atlas does not trust frontend-provided txHex for broadcast.
- Bitcoin Core RPC diagnostics use non-broadcasting status checks and do not return credentials.
- Same-origin API mode lets the browser use `/api/*` through the web server instead of directly reaching the API port.

## What This Release Does Not Do

- Does not ask for seed phrases.
- Does not ask for private keys.
- Does not support xprv, yprv, zprv, or WIF private keys except rejection.
- Does not sign transactions.
- Does not broadcast automatically.
- Does not provide public mempool, Fulcrum, Electrum, or raw txHex paste broadcast.
- Does not claim to be audited.
- Does not claim to be production-hardened for public internet exposure.

## Known Limitations

- Animated QR export is deferred.
- BBQr export is deferred.
- Public mempool broadcast is deferred.
- Fulcrum/Electrum broadcast is deferred.
- Single QR export works only for smaller PSBTs.
- PSBT compatibility with every cold wallet is not guaranteed.
- Fee estimates depend on the configured mempool backend.
- Address discovery depends on scan depth and gap limit behavior.
- The vault password cannot be recovered if forgotten.
- Raspberry Pi and server security are the operator's responsibility.

## Before Using With Real Funds

- Use a dedicated watch-only wallet export from your signer.
- Verify the first receive address against the signing device.
- Use a strong vault password.
- Keep the app on a trusted local network, Tailscale, or carefully configured Tor access.
- Back up `wallets.enc` securely.
- Do not store the vault password next to backups.
- Review every unsigned PSBT and signed PSBT output on both Atlas and the external signer.
- If enabling broadcast, use your own Bitcoin Core node and do not expose RPC publicly.
- Check Bitcoin Core RPC connectivity before any live broadcast and test with testnet/signet or a tiny mainnet amount first.
- Use the Bitcoin Core RPC live wiring checklist before enabling broadcast on a Raspberry Pi.
- If camera QR scanning is blocked on LAN HTTP, use text PSBT import/export or open Atlas over HTTPS/localhost/Tailscale Serve.
- Prefer same-origin API mode before reducing API port exposure on a Raspberry Pi.

## Validation Checklist

- Run web and API typechecks.
- Run API tests.
- Run web and API production builds.
- Run `git diff --check`.
- Start API and web.
- Log in and unlock the vault.
- Register a watch-only wallet.
- Confirm xpub masking.
- View balance, UTXOs, and transactions.
- Add address label, UTXO note, and transaction note.
- Create and export an unsigned PSBT.
- Verify a signed PSBT.
- Confirm there is no signing path, no automatic broadcast, and no raw txHex paste broadcast path.
