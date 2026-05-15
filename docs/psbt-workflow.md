# PSBT Workflow Guide

Atlas creates unsigned PSBTs and verifies signed PSBTs. It does not sign or finalize unsigned PSBTs. Broadcast is optional, disabled by default, and limited to Bitcoin Core RPC after server-side signed PSBT verification succeeds.

Treat the unsigned PSBT builder as a spending plan for an external cold wallet.

Atlas is not the final authority for signing decisions. A compromised browser can visually alter recipients, amounts, QR codes, clipboard contents, and warnings. Always verify recipient, amount, change output, and fee on the external signing device before signing.

## Wallet Identity Check

Before receiving funds or building PSBTs, verify the watch-only wallet identity against the external signer:

- Confirm the master fingerprint if it was provided by the signer export.
- Confirm the account path, such as `m/84'/0'/0'`.
- Confirm the script type and network.
- Confirm the first receive address against the signing device or trusted signer software.

If the master fingerprint is missing, the wallet may still be a valid bare xpub/zpub import, but do not treat that as verified signer identity. Prefer descriptor/origin imports or signer export files that include fingerprint and path for real wallets.

The signing device remains the final authority for recipient, amount, change, and fee.

## Unsigned PSBT Creation

1. Log in.
2. Unlock the vault with the vault password.
3. Open the unsigned PSBT builder.
4. Select one or more tracked UTXOs.
5. Add one or more recipient outputs.
6. Enter each amount explicitly as sats or BTC.
7. Choose a fee preset from live mempool estimates or enter a manual decimal sat/vB fee rate.
8. Review the input -> output spending plan.
9. Review recipient outputs, change, fee, warnings, labels, and notes.
10. Create the unsigned PSBT.
11. Export the unsigned PSBT as base64 text or a single QR if it fits.
12. Sign the PSBT with an external cold wallet that holds the private keys.

The app does not know private keys and cannot sign the PSBT.

## Export Formats

Current export options:

- Text/base64 copy.
- Download text file.
- Single QR when the PSBT is small enough.

QR display/export can work over plain HTTP because it does not use the camera. Camera QR scanning is different: Brave/Chrome may require HTTPS or localhost and may block `http://172.30.x.x` LAN origins. If camera scanning is unavailable, use text PSBT import/export. See [camera-qr-secure-context.md](camera-qr-secure-context.md).

Deferred export options:

- Animated QR.
- BBQr.

Animated QR and BBQr require tested fragmentation and encoding support. They are intentionally deferred.

## Signed PSBT Verification

After external signing:

1. Bring the signed PSBT back to Atlas.
2. Paste it into Signed PSBT Verification.
3. Optionally enter expected recipient, expected amount, expected change address, and expected fee.
4. Review status, warnings, and errors.
5. Verify every output.
6. Review unknown or external outputs carefully.
7. Copy txHex only if the PSBT is signed, finalized/extractable, and the details are safe.
8. If broadcast is disabled, copy txHex only when you intentionally want to use another trusted tool.
9. If Bitcoin Core broadcast is enabled, confirm outputs and fee, read the irreversible warning, check the confirmation box, type `BROADCAST`, and click Broadcast transaction.
10. Record the returned txid.

Atlas does not sign. If `BROADCAST_BACKEND=core` is configured, Atlas can broadcast an already-signed transaction through Bitcoin Core RPC only after verification returns `valid` and the user explicitly confirms.

For a first live broadcast validation, use testnet/signet where possible. If mainnet is used, use a tiny amount only and follow [tiny-broadcast-validation.md](tiny-broadcast-validation.md).

## What To Verify Before Broadcasting Elsewhere

- Recipient address.
- Recipient amount.
- Change address.
- Change amount.
- Fee amount.
- Fee rate.
- Unknown outputs.
- External outputs.
- Whether the PSBT is signed and extractable.

Labels and notes are helpful context only. They do not make an output safe, wallet-owned, or expected.

If Atlas and the signing device disagree, stop. The signing device controls the keys and is the final authority.

## Common Warnings

- No UTXO selected.
- Invalid recipient address.
- Invalid amount.
- Amount exceeds selected input.
- Invalid fee rate.
- Fee estimate unavailable.
- Change address unavailable.
- Change below dust threshold.
- Recipient output below dust threshold.
- Unconfirmed selected UTXO.
- Unknown or external outputs during signed PSBT verification.
- PSBT too large for a single QR.

Do not ignore warnings just because labels or notes look familiar.

## Security Boundaries

- No signing.
- No public mempool broadcast.
- No Fulcrum/Electrum broadcast.
- No seed phrase input.
- No private key input.
- No xprv, yprv, zprv, or WIF input.
- No full xpub exposure in normal API responses.
- No labels or notes are used for ownership or safety classification.

If a cold wallet shows a different recipient, amount, change output, or fee than Atlas showed, stop and investigate before signing or broadcasting elsewhere.

## Optional Bitcoin Core Broadcast

Broadcast is disabled unless configured:

```env
BROADCAST_BACKEND=core
CORE_RPC_URL=http://127.0.0.1:8332
CORE_RPC_USERNAME=your_rpc_user
CORE_RPC_PASSWORD=your_rpc_password
```

Use [bitcoin-core-rpc-broadcast.md](bitcoin-core-rpc-broadcast.md) for Raspberry Pi and Bitcoin Core RPC configuration details.

Atlas sends only the server-extracted transaction hex from a verified signed PSBT. It does not accept raw txHex paste for broadcast and does not broadcast warning or invalid PSBTs.

Broadcasting is irreversible after the transaction is accepted and propagated by your node.

Before broadcasting:

1. Verify the signed PSBT status is `valid`.
2. Review recipient, amount, change, and fee.
3. Confirm Bitcoin Core RPC is your own trusted node.
4. Check the confirmation box.
5. Type `BROADCAST`.
6. Prefer testnet/signet first. If using mainnet, use a tiny amount first.

Public mempool broadcast, Fulcrum broadcast, Electrum broadcast, and self-hosted mempool broadcast are intentionally deferred.
