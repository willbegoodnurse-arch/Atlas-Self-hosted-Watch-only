# Browser Display And Address Substitution Threat Model

## Summary

Atlas is a watch-only coordinator. It can display wallet history, create unsigned PSBTs, verify signed PSBTs, and optionally broadcast an already-signed transaction after server-side verification and explicit user confirmation.

Atlas does not store seed phrases. Atlas does not store private keys. Atlas does not store xprv, yprv, zprv, or WIF signing material. Atlas does not sign transactions.

Atlas cannot directly spend funds because it has no signing material. That does not make every workflow safe. A compromised browser, browser extension, host, server, or display path can still trick a user into approving a bad address or transaction on the external signer.

The signing device display is the final authority. The browser UI is not the final authority.

## Security Boundary

Atlas is a coordinator, not a signer.

The security boundary is:

- Atlas may propose receive addresses and unsigned PSBTs.
- Atlas may verify signed PSBTs against expected recipient, amount, change, and fee values.
- Atlas may warn about external outputs, unknown outputs, and high fees.
- The external signing device authorizes spending.
- The signing device screen is the trust anchor for final human approval.

Users must verify receive addresses on the signer before large deposits. Users must verify recipient address, amount, change output, and fee on the signer before signing. If Atlas and the signer disagree, stop.

## Threats

### Receive Address Substitution

An attacker who compromises the browser or display path may visually alter receive addresses shown by Atlas. The attacker may also alter address labels, QR codes, copied text, warnings, balances, or transaction history to make the substituted address look expected.

For large deposits, verify the receive address on the signing device or trusted signer software before sending funds.

### PSBT Output Substitution

An attacker who compromises the browser, JavaScript runtime, server-delivered frontend bundle, or host display path may visually alter PSBT details before the user signs. This can include:

- Recipient addresses.
- Recipient amounts.
- PSBT outputs.
- Change output display.
- Fee display.
- External output warnings.
- High fee warnings.
- Balance or transaction display.

Atlas can create unsigned PSBTs and verify signed PSBTs, but the signing device must remain the final authority before any signature is produced.

### QR And Clipboard Substitution

QR codes and clipboard contents are display and transport data. A compromised browser, malicious browser extension, clipboard malware, or OS-level malware may replace:

- Receive address QR codes.
- PSBT QR codes.
- Copied receive addresses.
- Copied PSBT text.
- Copied txHex.
- Warning text near the copy or QR action.

Do not trust copied addresses blindly. Treat QR codes as data that can be manipulated by a compromised browser.

### Browser Extension And XSS Risk

Web-specific risks include:

- XSS or DOM manipulation.
- Malicious browser extensions.
- A compromised browser profile.
- Clipboard malware.
- MITM if Atlas is accessed without a trusted private network or HTTPS.
- A compromised JavaScript bundle if the server is compromised.

A malicious browser extension can change rendered text, form values, QR codes, warnings, and clipboard contents. Atlas cannot make that browser safe.

### Compromised Server Or Raspberry Pi

If the Atlas server or Raspberry Pi is compromised, an attacker may be able to serve malicious frontend code, alter API responses, expose unlocked watch-only metadata, or abuse configured services while the vault is unlocked.

A compromised Raspberry Pi while the vault is unlocked may expose xpubs, zpubs, labels, notes, addresses, transaction history, PSBT material, and configured RPC access. These are privacy-sensitive even though they are not signing keys.

Atlas cannot protect against a compromised Raspberry Pi serving malicious frontend code while the user trusts the browser display.

## Trusted Display Rule

The signing device display is the final authority for signing decisions.

The browser UI is not the final authority. Atlas may help organize the workflow, but the external signer must be used to verify:

- Receive address before large deposits.
- Recipient address before signing.
- Amount before signing.
- Fee before signing.
- Change output before signing, if the signer shows it.

If Atlas and the signer disagree, stop. Do not sign. Do not broadcast elsewhere until the discrepancy is understood.

## What Atlas Mitigates

Atlas mitigates some risks by design:

- No signing material is stored.
- No seed phrases or private keys are accepted.
- xprv, yprv, zprv, and WIF input is rejected.
- Normal API responses mask xpub, ypub, and zpub values.
- The server-side vault is encrypted.
- Full xpub reveal requires an explicit reveal flow.
- Signed PSBT verification can compare expected recipient, amount, change address, and fee.
- Expected recipient checks can detect mismatched recipient outputs.
- Expected amount checks can detect mismatched payment amounts.
- Expected change address checks can detect unexpected change.
- Expected fee checks can detect unexpected fees.
- External output warnings can identify outputs that are not classified as wallet receive or change.
- High fee warnings can identify suspicious fee levels.
- Raw txHex paste broadcast is not exposed.
- Optional Bitcoin Core broadcast is available only after server-side signed PSBT verification and explicit user confirmation.

These mitigations reduce specific classes of mistakes and server-side exposure. They do not replace signer-screen verification.

## What Atlas Cannot Mitigate

Atlas cannot fully mitigate:

- A compromised browser.
- A malicious browser extension changing rendered text.
- XSS or DOM manipulation after the browser is compromised.
- Clipboard malware changing copied addresses or PSBT data.
- OS-level malware on the host machine.
- A compromised browser profile.
- MITM on an untrusted network when Atlas is not accessed through a trusted private network or HTTPS.
- A compromised server or Raspberry Pi serving malicious frontend code.
- Supply-chain compromise.
- A user signing without checking the signer screen.
- A fully compromised signing device.

Atlas cannot protect users who sign without comparing the signing-device display. Atlas also cannot protect against a fully compromised signing device.

## Operational Requirements

Use Atlas as a local or private-network coordinator:

- Use a dedicated browser profile for Atlas.
- Disable unnecessary browser extensions.
- Keep the host OS and browser updated.
- Access Atlas only through LAN, Tailscale, or carefully configured Tor.
- Avoid public internet exposure.
- Prefer same-origin `/api` deployment so the browser talks to the web origin and the web server proxies to the API.
- Use HTTPS when exposing Atlas beyond a trusted private network.
- Keep Bitcoin Core RPC private.
- Keep the Raspberry Pi, server packages, Docker runtime, Bitcoin Core, and mempool stack updated.
- Use strong Atlas account and vault passwords.
- Treat xpub, ypub, zpub, labels, notes, addresses, and transaction history as privacy-sensitive.

For large deposits, verify receive addresses on the signer. Before signing, compare recipient, amount, change output, and fee on the signer. Do not trust copied addresses blindly.

## Client-Side Derivation Note

Client-side address derivation can reduce risk from a compromised API response because the browser can derive and check addresses without trusting every returned address string from the API.

In a web app, this is not a complete defense. The browser bundle is also delivered by the server. If the server is compromised, it may serve malicious JavaScript. If the browser is compromised, client-side derivation code and its rendered output may be altered.

Atlas should still treat the signer display as the final authority.

## User Checklist

- Verify receive address on signer before large deposits.
- Verify recipient address on signer before signing.
- Verify amount on signer before signing.
- Verify fee on signer before signing.
- Verify change output on signer if the signer shows it.
- Stop if Atlas and signer disagree.
- Use a dedicated browser profile with minimal extensions.

## Related Documents

- [PSBT workflow guide](psbt-workflow.md)
- [Same-origin API proxy guide](same-origin-api-proxy.md)
- [Network exposure audit](network-exposure-audit.md)
- [Tailscale Serve / HTTPS access planning](tailscale-https-access.md)
- [Security policy](../SECURITY.md)

