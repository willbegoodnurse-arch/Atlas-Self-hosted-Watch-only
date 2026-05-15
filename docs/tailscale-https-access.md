# Tailscale Serve / HTTPS Access Planning

## Purpose

This document plans safer remote and HTTPS access for Atlas without changing the live host. Do not run these commands blindly. Review them against the actual Raspberry Pi, Tailscale account, DNS, and firewall policy first.

Atlas is watch-only, but the browser UI, xpub metadata, labels, notes, PSBTs, and session cookies are still sensitive. HTTPS access is mainly useful for:

- browser camera permission for QR import/scanning
- reducing LAN plaintext exposure
- easier access through a private tailnet name

HTTPS does not make a compromised browser or compromised Raspberry Pi trustworthy.

## Preferred access models

Use one of these, in order of preference:

1. Localhost on the Pi or SSH tunnel from a trusted desktop.
2. Tailscale private tailnet access.
3. Tailscale Serve HTTPS for the web entry point only.
4. Carefully configured Tor hidden service with Atlas authentication.

Avoid public internet port forwarding.

## Same-origin mode requirement

The preferred Atlas web mode is same-origin API access:

```env
NEXT_PUBLIC_API_URL=/api
INTERNAL_API_URL=http://127.0.0.1:3011
API_HOST=127.0.0.1
```

In this model:

- the browser calls `https://<atlas-host>/api/*`
- the Next.js web server proxies to `INTERNAL_API_URL`
- the Atlas API can stay private on localhost
- port `3011` should not be reachable from the desktop/LAN/public internet

Do not expose API `3011` just to make HTTPS or camera scanning work.

## Camera QR and secure context

Most modern browsers require HTTPS or localhost for camera APIs. Plain LAN HTTP such as `http://172.30.x.x:3000` may display the app but block camera scanning.

Safe options:

- Use text PSBT import/export instead of camera.
- Use SSH local forwarding and open `http://localhost:3000`.
- Use Tailscale Serve HTTPS for the web entry point.
- Use a private reverse proxy with HTTPS and strict network controls.

Do not disable browser security globally as a permanent workaround.

## SSH localhost forwarding

For a trusted desktop:

```bash
ssh -L 3000:127.0.0.1:3000 hodlcrabs@172.30.1.50
```

Then open:

```text
http://localhost:3000
```

This keeps browser access local to the desktop and avoids exposing API `3011`.

## Tailscale Serve planning checklist

Before using Tailscale Serve:

- [ ] Confirm Atlas web is reachable locally on the Pi.
- [ ] Confirm same-origin `/api/*` works.
- [ ] Confirm `API_HOST=127.0.0.1` or equivalent private API binding after same-origin verification.
- [ ] Confirm direct desktop access to `http://<pi-lan-ip>:3011/api/auth/session` fails in hardened mode.
- [ ] Confirm Bitcoin Core RPC `8332` is not reachable from the desktop or tailnet except where explicitly intended.
- [ ] Confirm Tailscale ACLs restrict access to trusted devices/users.
- [ ] Confirm Atlas admin password and TOTP are strong.
- [ ] Confirm `COOKIE_SECURE=true` will be used when served over HTTPS.
- [ ] Confirm `WEB_ORIGIN` includes the exact Tailscale HTTPS origin.
- [ ] Confirm no secrets will be printed while inspecting `.env`.

## Example Tailscale Serve shape

This is an example shape only. Do not run during documentation review.

```bash
tailscale serve --https=443 http://127.0.0.1:3000
```

The intended model is:

```text
Browser
  -> https://<pi-tailnet-name>/
  -> Tailscale Serve
  -> http://127.0.0.1:3000
  -> Next.js /api proxy
  -> http://127.0.0.1:3011
```

Only the web entry point should be served. Do not serve:

- Atlas API `3011`
- Bitcoin Core RPC `8332`
- Fulcrum unless intentionally planned
- local mempool admin or backend ports unless intentionally planned

## Environment planning

When HTTPS access is intentionally enabled, plan these values without printing secrets:

```env
NEXT_PUBLIC_API_URL=/api
INTERNAL_API_URL=http://127.0.0.1:3011
API_HOST=127.0.0.1
COOKIE_SECURE=true
WEB_ORIGIN=https://<pi-tailnet-name>
```

If local HTTP is also used, include the exact local web origin in `WEB_ORIGIN` as well.

Do not paste the full `.env` into chat. Inspect only non-secret keys or use redacted examples.

## Browser validation

After HTTPS access is configured by the operator:

- [ ] Open the HTTPS Tailscale URL.
- [ ] Confirm login works.
- [ ] Confirm vault unlock works.
- [ ] Confirm Network tab calls `/api/*` on the web origin.
- [ ] Confirm no browser calls go directly to `:3011`.
- [ ] Confirm camera QR scanner can request permission.
- [ ] Confirm denying camera permission leaves paste/file fallback visible.
- [ ] Confirm receive QR display does not require camera, HTTPS, or `getUserMedia`.
- [ ] Confirm signed PSBT paste flow works without camera.
- [ ] Confirm logout locks the vault.

## Security warnings

Tailscale and HTTPS reduce network exposure, but they do not remove these risks:

- A compromised browser can alter displayed addresses, QR codes, outputs, clipboard contents, and warnings.
- A compromised Raspberry Pi can expose unlocked watch-only metadata.
- A user can still sign a malicious PSBT if outputs are not checked on the signing device.
- A leaked `.env` can expose session or RPC credentials.
- A leaked backup can expose wallet-history metadata.

Always verify receive addresses and PSBT outputs on the external signing device whenever possible.

## Rollback plan

If HTTPS/Tailscale access behaves unexpectedly:

- [ ] Stop or disable the Tailscale Serve rule.
- [ ] Return to local LAN or SSH localhost forwarding.
- [ ] Keep API `3011` private.
- [ ] Keep Bitcoin Core RPC `8332` private.
- [ ] Confirm the app still works at the local web origin.
- [ ] Do not loosen CORS or expose API ports as a workaround.
