# Changelog

## v0.1.0 - Release Candidate

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
- Raspberry Pi, Docker Compose, systemd example, backup/restore, and smoke test documentation.

### Security

- No seed phrase handling.
- No private key handling.
- No xprv, yprv, zprv, or WIF support except rejection.
- No transaction signing.
- Broadcast disabled by default.
- No unsigned, warning, invalid, automatic, public mempool, Fulcrum, or Electrum broadcast.
- Bitcoin Core RPC broadcast uses server-extracted txHex from verified signed PSBTs only.
- Normal API responses use xpub redaction and masking.
- Vault password is not stored in `.env`.
- Derived vault key is memory-only and cleared when the vault locks or the process restarts.
- Explicit xpub reveal endpoint is rate-limited.
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
