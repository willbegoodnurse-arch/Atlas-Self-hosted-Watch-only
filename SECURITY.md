# Security Policy

Atlas is a self-hosted Bitcoin watch-only wallet. It is designed to help view wallet activity, create unsigned PSBTs, and verify signed PSBTs without putting signing material on the server.

This project is not audited.

## Hard Security Boundaries

- No seed phrase input.
- No private key input.
- No xprv, yprv, zprv, or WIF support except rejection.
- No signing.
- No transaction broadcast.
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
- Still does not broadcast.

Users must verify recipient, amount, change, and fee before broadcasting elsewhere.

## Threat Model

Protected against by design:

- Atlas cannot spend funds because it does not store seed phrases or private keys.
- Normal API responses do not expose full xpub, ypub, or zpub values.
- `wallets.enc` is encrypted server-side.
- The vault password is not stored in `.env`.
- The derived vault key is memory-only and is discarded when the vault locks or the process restarts.
- Labels and notes cannot mark an output safe or alter wallet classification.

Not fully protected against:

- A compromised browser session.
- A compromised Raspberry Pi or server while the vault is unlocked.
- Offline attacks against `wallets.enc` if the vault password is weak.
- Malware on the operator's computer or signing workflow.
- Public internet exposure or reverse proxy misconfiguration.
- A user signing or broadcasting a bad transaction elsewhere.
- Bugs in pre-release, unaudited software.

## Recommended Access Model

- Local network.
- Tailscale.
- Tor, if the operator configures it carefully.

Public internet exposure is discouraged. If the app is exposed beyond a trusted private network, use HTTPS, a hardened reverse proxy, firewall restrictions, and additional access controls.

## Reporting Vulnerabilities

If a private security advisory channel is available through the repository, use it. Otherwise, open a GitHub issue that describes the affected area without including secrets, private keys, seed phrases, full xpub/ypub/zpub values, cookies, or exploit details that would put users at immediate risk.

Please include:

- Affected commit or version.
- Impact.
- Reproduction steps.
- Whether seed phrases, private keys, xpub/ypub/zpub values, addresses, labels, notes, or transaction data could be exposed.
