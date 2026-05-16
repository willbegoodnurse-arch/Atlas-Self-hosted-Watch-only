# Hardware Signer Roundtrip Validation

Atlas is watch-only. It creates unsigned PSBTs, imports signed PSBTs for verification, and only broadcasts after explicit confirmation when broadcast is configured.

Do not enter seed phrases, private keys, WIF keys, or device PINs into Atlas. Stop before broadcast unless Phase 54 live broadcast validation is explicitly approved.

## Common Roundtrip

For each signer:

1. Import the xpub, zpub, or descriptor into Atlas.
2. Verify the first receive address in Atlas against the signer display.
3. Create a tiny unsigned PSBT in Atlas.
4. Export the unsigned PSBT from Atlas by text, file, or single QR when small enough.
5. Review recipient, amount, fee, and change on the signer.
6. Sign on the signer.
7. Import the signed PSBT into Atlas by paste, file upload, or single QR.
8. Verify Atlas shows the same recipient, amount, fee, change, wallet, and network as the signer.
9. Stop before broadcast unless Phase 54 live broadcast validation is explicitly approved.

## Signer Checklist

### Coldcard

- Import descriptor or Generic JSON into Atlas.
- Verify fingerprint, account path, script type, and first receive address.
- Use microSD or QR where supported for unsigned PSBT export and signed PSBT return.
- Prefer file upload if the signed PSBT is too large for single-frame QR.

### SeedSigner

- Import xpub, zpub, or descriptor export into Atlas.
- Verify account fingerprint, derivation path, script type, and first receive address.
- Use QR for small PSBTs, or file/paste where the payload is too large.

### Keystone

- Import watch-only account export or descriptor into Atlas.
- Verify the first receive address on Keystone.
- Use signed PSBT QR only for normal single-frame payloads; use file/paste otherwise.

### Passport

- Import descriptor or xpub export into Atlas.
- Verify fingerprint, account path, script type, and first receive address.
- Use microSD/file for larger PSBTs.

### Krux

- Import xpub, zpub, or descriptor into Atlas.
- Verify first receive address and derivation path.
- Use file or paste when QR payloads exceed single-frame capacity.

### Sparrow

- Import a descriptor or watch-only export from Sparrow into Atlas.
- Verify first receive address and script policy.
- Use file or paste for signed PSBT return.

### Ledger/Trezor

- Validate through a coordinator such as Sparrow when available.
- Import only watch-only exports into Atlas.
- Confirm recipient, amount, fee, and change on the hardware device before returning the signed PSBT.

## Atlas Expected Behavior

- LAN HTTP shows camera fallback: camera scanning requires HTTPS, localhost, or a trusted tunnel such as Tailscale Serve.
- Paste and file import remain available when camera access is unavailable.
- Single-frame signed PSBT QR import does not auto-broadcast.
- Oversized signed PSBT QR payloads show a file/paste fallback message.
- Broadcast requires successful verification, a checked confirmation box, and typed `BROADCAST`.
