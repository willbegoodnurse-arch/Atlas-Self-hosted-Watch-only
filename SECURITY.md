# Security Policy

Atlas is a self-hosted Bitcoin watch-only wallet. It is designed to help view wallet activity, create unsigned PSBTs, and verify signed PSBTs without putting signing material on the server.

This project is not audited.

## Hard Security Boundaries

- No seed phrase input.
- No private key input.
- No xprv, yprv, zprv, or WIF support except rejection.
- No signing.
- No automatic, unsigned, warning, invalid, public mempool, Fulcrum, or Electrum transaction broadcast.
- Optional Bitcoin Core RPC broadcast only for server-verified signed PSBTs with status `valid`.
- No custody.
- No normal full xpub, ypub, or zpub exposure in API responses.
- No labels or notes used for security classification.

If a change weakens any of these boundaries, it should be treated as a security regression.

## Watch-Only Data

Extended public keys such as xpub, ypub, and zpub are not signing keys, but they are privacy-sensitive. Anyone with a full extended public key can monitor wallet history and future addresses.

Atlas stores watch-only wallet records in the encrypted vault:

```text
apps/api/data/wallets.enc
```

The vault password:

- Is required for manual unlock.
- Is not stored in `.env`.
- Is not recoverable by the app.
- Derives a memory-only vault key.

Normal wallet API responses must use safe serialization and masked extended public keys.

Explicit xpub reveal is a privacy-sensitive action. It should be used only when needed, and operators should treat a revealed xpub, ypub, or zpub as wallet-history metadata that must not be posted publicly.

## Vault Behavior

- Vault unlock is manual.
- The derived vault key is memory-only.
- The vault auto-locks after inactivity based on `VAULT_AUTO_LOCK_MINUTES`.
- Logout locks the vault.
- Process restart discards the in-memory vault key.

## Labels And Notes

Address labels, UTXO notes, and transaction notes are metadata only.

They must never affect:

- Ownership classification.
- Receive/change/unknown classification.
- Recipient detection.
- PSBT verification.
- External or unknown output warnings.
- Transaction direction.
- UTXO validity.
- Wallet security decisions.

Secret-looking metadata must be rejected or safely handled without echoing the sensitive value in errors.

## PSBT Model

Unsigned PSBT builder:

- Uses tracked UTXOs.
- Creates unsigned PSBT base64.
- Does not sign.
- Does not finalize.
- Does not extract txHex as broadcast-ready output.
- Does not broadcast.

Signed PSBT verification:

- Accepts a signed PSBT for analysis.
- Can report whether it is signed, finalizable, finalized, or extractable.
- Can expose txHex only after signed PSBT verification when extractable.
- Can optionally broadcast the already-signed transaction through Bitcoin Core RPC when broadcast is configured, the verification status is `valid`, txHex is extractable, and the user explicitly confirms.

Users must verify recipient, amount, change, and fee before broadcasting elsewhere.

## Broadcast Model

Broadcast is disabled by default with `BROADCAST_BACKEND=disabled`.

When `BROADCAST_BACKEND=core`, Atlas can submit an already-signed transaction to Bitcoin Core RPC with `sendrawtransaction`. The server re-runs signed PSBT verification and uses the server-extracted txHex. It does not trust frontend-provided txHex and does not offer raw txHex paste broadcast.

Broadcast is blocked for unsigned PSBTs, invalid PSBTs, warning PSBTs, missing txHex, disabled backend, missing Bitcoin Core RPC configuration, and Bitcoin Core RPC errors.

Broadcasting is irreversible after the transaction is accepted and propagated by your node.

Bitcoin Core RPC credentials must stay out of Git. Do not expose Bitcoin Core RPC to the public internet.

## Broadcast Threat Model

Broadcast does not give Atlas private keys and does not mean Atlas can create transactions by itself. Atlas can only submit an already-signed transaction after the server verifies the signed PSBT and extracts txHex.

Protected by design:

- No signing keys, seed phrases, or private keys are stored.
- Broadcast is disabled unless `BROADCAST_BACKEND=core`.
- The server re-runs signed PSBT verification before broadcast.
- Invalid, warning, unsigned, and non-extractable PSBTs are blocked.
- The UI requires explicit confirmation plus typing `BROADCAST`.
- The Core RPC status endpoints do not return RPC credentials or the full RPC URL.

Remaining risks:

- A user can still approve a bad signed transaction after failing to review it carefully.
- A compromised browser session could attempt broadcast while the user session is active.
- A compromised Raspberry Pi with RPC credentials could abuse the configured Core RPC connection.
- Exposed Core RPC credentials or a public RPC port are critical risks.
- Broadcast is irreversible once accepted and propagated.

Mitigations:

- Keep broadcast disabled unless needed.
- Prefer `CORE_RPC_URL=http://127.0.0.1:8332`.
- Keep Atlas on local network, Tailscale, or carefully configured Tor access.
- Use strong Atlas account and vault passwords.
- Review recipient, amount, change output, and fee before broadcast.
- Test with testnet/signet or a tiny mainnet amount first.
- Keep the Raspberry Pi and Bitcoin Core updated.

## Live Broadcast Validation Safety

Atlas does not hold signing keys and does not sign transactions. Live broadcast validation should only prove that an already-signed, server-verified transaction can be submitted through the configured Bitcoin Core node.

Protected by design:

- Atlas does not hold seed phrases, private keys, xprv values, or WIF keys.
- Atlas does not sign.
- Broadcast requires server-side signed PSBT verification with status `valid`.
- Broadcast requires explicit user confirmation.
- Raw txHex paste broadcast is not exposed.
- Bitcoin Core RPC credentials are server-side only.

Remaining risks:

- A malicious or mistaken signed PSBT can still move funds.
- A user can approve a wrong recipient or fee.
- A compromised browser session with an active session may attempt actions.
- A compromised Raspberry Pi can abuse configured Bitcoin Core RPC.
- Broadcast is irreversible once accepted.

Mitigations:

- Use testnet or signet first.
- Use a tiny amount if testing on mainnet.
- Verify recipient, amount, fee, and change on the external signer.
- Verify the signed PSBT again in Atlas.
- Keep the Atlas API bound to localhost in hardened mode.
- Keep Bitcoin Core RPC private.
- Keep the self-hosted mempool backend local.
- Do not share txHex, secrets, session cookies, or full xpub values publicly.
- Follow [docs/tiny-broadcast-validation.md](docs/tiny-broadcast-validation.md) before first live validation.

## Threat Model

Protected against by design:

- Keeps wallet metadata primarily on the self-hosted node instead of browser local storage on a daily-use PC.
- Atlas cannot spend funds because it does not store seed phrases or private keys.
- Atlas cannot sign transactions because it has no signing material.
- Normal API responses do not expose full xpub, ypub, or zpub values.
- `wallets.enc` is encrypted server-side.
- The vault password is not stored in `.env`.
- The derived vault key is memory-only and is discarded when the vault locks or the process restarts.
- Labels and notes cannot mark an output safe or alter wallet classification.

Not fully protected against:

- A fully compromised Raspberry Pi or server. If the node is compromised while the vault is unlocked, wallet metadata, xpubs, labels, notes, addresses, and PSBT material may be exposed.
- A compromised browser session visually changing receive addresses, PSBT outputs, QR codes, clipboard contents, balances, or warnings.
- Offline attacks against `wallets.enc` if the vault password is weak.
- Malware on the operator's computer or signing workflow.
- Public internet exposure or reverse proxy misconfiguration.
- Leaked backups or copied `wallets.enc` files.
- Exposed Bitcoin Core RPC credentials or RPC port.
- A user signing or broadcasting a bad transaction elsewhere.
- Bugs in pre-release, unaudited software.

Operational requirements:

- Verify receive addresses and PSBT outputs on a trusted signing device whenever possible.
- Treat the cold signing device as the final authority for recipient, amount, change, and fee.
- Use strong Atlas account and vault passwords plus TOTP.
- Keep the Raspberry Pi operating system, Node.js, Docker, Bitcoin Core, and mempool stack updated.
- Prefer SSD storage over SD card for long-running Raspberry Pi deployments.
- Disable SSH password login where practical and keep SSH access private.
- Restrict access to LAN, Tailscale, or carefully configured Tor. Do not port-forward Atlas or Bitcoin Core RPC to the public internet.
- Protect `.env`, `wallets.enc`, service logs, exported PSBTs, txHex, and backups.
- Treat xpub, ypub, zpub, labels, notes, transaction history, and addresses as privacy-sensitive metadata.

## Browser Storage And Client Trust

Atlas should not persist wallet metadata, xpubs, raw imports, labels, notes, PSBTs, or reveal state in `localStorage`, `sessionStorage`, IndexedDB, `window.name`, or other browser storage. UI state should remain in memory unless a future harmless preference is documented explicitly.

The browser is a convenience display, not the trusted wallet database. A compromised browser can change text, QR codes, clipboard contents, and form values before the user sees them. Atlas reduces server-side exposure, but it cannot make an untrusted browser safe.

## Backups And Exports

`wallets.enc` is encrypted, but it is still sensitive. It may contain xpub, ypub, zpub, addresses, labels, UTXO notes, transaction notes, and other privacy-sensitive wallet metadata. Backups must be protected like wallet-history metadata.

Future metadata export features must be encrypted or clearly marked sensitive. Plaintext exports must not be presented as safe to share.

For operational backup and restore planning, follow [docs/backup-restore.md](docs/backup-restore.md).

## Recommended Access Model

- Local network.
- Tailscale.
- Tor, if the operator configures it carefully.

Public internet exposure is discouraged. If the app is exposed beyond a trusted private network, use HTTPS, a hardened reverse proxy, firewall restrictions, and additional access controls.

For private HTTPS planning, review [docs/tailscale-https-access.md](docs/tailscale-https-access.md). For final port exposure review, use [docs/network-exposure-audit.md](docs/network-exposure-audit.md).

## API Exposure Model

Preferred hardened deployments should use the same-origin API proxy:

- Browser calls the web origin at `/api/*`.
- The Next.js web server proxies to `INTERNAL_API_URL`.
- The Atlas API can later bind to `127.0.0.1` or a private interface after verification.
- Port `3011` can then be blocked from the LAN or tailnet.

Legacy direct mode remains available for transition, but it exposes the API port to the trusted browser network. Do not expose the API to the public internet.

For a practical hardened Raspberry Pi verification flow, use [docs/hardened-runtime-smoke-test.md](docs/hardened-runtime-smoke-test.md). It checks same-origin API access, localhost-only API binding, local Bitcoin Core RPC, Fulcrum, self-hosted mempool, camera localhost forwarding, and broadcast safety without running `sendrawtransaction`.

## Camera Access And Secure Contexts

Browser camera APIs usually require HTTPS or localhost. Brave, Chrome, and similar browsers may block camera QR scanning on plain LAN HTTP origins such as `http://172.30.x.x:3000`.

Do not disable browser security globally as a permanent workaround. Prefer text PSBT import/export, SSH localhost forwarding, Tailscale Serve, or a carefully configured HTTPS reverse proxy.

Never expose Atlas API or Bitcoin Core RPC publicly just to make camera scanning work. Bitcoin Core RPC must remain private.

## Reporting Vulnerabilities

If a private security advisory channel is available through the repository, use it. Otherwise, open a GitHub issue that describes the affected area without including secrets, private keys, seed phrases, full xpub/ypub/zpub values, cookies, or exploit details that would put users at immediate risk.

Please include:

- Affected commit or version.
- Impact.
- Reproduction steps.
- Whether seed phrases, private keys, xpub/ypub/zpub values, addresses, labels, notes, or transaction data could be exposed.

## Live broadcast validation

For the first signed PSBT broadcast validation, follow `docs/tiny-broadcast-validation.md`.

Atlas remains watch-only. Atlas does not sign transactions and must never receive seed phrases or private keys. Broadcast is irreversible once accepted by Bitcoin Core or the network. Use testnet/signet first, or a tiny mainnet amount only.
