# PSBT Workflow Guide

Atlas creates unsigned PSBTs and verifies signed PSBTs. It does not sign, finalize unsigned PSBTs, or broadcast transactions.

Treat the unsigned PSBT builder as a spending plan for an external cold wallet.

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
8. Broadcast elsewhere only if you intentionally choose to do so.

Atlas does not broadcast.

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
- No broadcast.
- No seed phrase input.
- No private key input.
- No xprv, yprv, zprv, or WIF input.
- No full xpub exposure in normal API responses.
- No labels or notes are used for ownership or safety classification.

If a cold wallet shows a different recipient, amount, change output, or fee than Atlas showed, stop and investigate before signing or broadcasting elsewhere.
