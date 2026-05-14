# Atlas v0.1.0 Release Candidate Notes

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
