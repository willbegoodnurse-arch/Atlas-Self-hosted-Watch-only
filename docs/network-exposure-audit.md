# Network Exposure Audit

## Purpose

This checklist helps an operator confirm Atlas network exposure before deployment, HTTPS access, or live broadcast validation.

This document is audit guidance only. It does not change firewall rules, systemd units, `.env`, Tailscale settings, or Bitcoin Core configuration.

## Target exposure model

Preferred Raspberry Pi model:

```text
Trusted browser
  -> Atlas web port 3000 or 3010
  -> same-origin /api proxy
  -> Atlas API on 127.0.0.1:3011
  -> local mempool/Fulcrum/Bitcoin Core as configured
```

Expected boundaries:

- Web is reachable only from trusted LAN, localhost tunnel, Tailscale, or carefully configured Tor.
- API `3011` is not directly reachable from untrusted hosts.
- Bitcoin Core RPC `8332` is not public.
- Fulcrum and mempool ports are exposed only as intentionally planned.
- No public mempool fallback is silently added.

## Ports to review

Common ports:

| Port | Service | Desired exposure |
| --- | --- | --- |
| `22` | SSH | trusted admin devices only |
| `3000` | direct Node web | trusted LAN/tailnet/localhost only |
| `3010` | Docker web | trusted LAN/tailnet/localhost only |
| `3011` | Atlas API | localhost/private only in hardened mode |
| `8332` | Bitcoin Core RPC | localhost/private Docker network only |
| `50001` | Fulcrum TCP | only if intentionally used |
| `8080` | local mempool API/web | local/private only as intended |

## Raspberry Pi local audit commands

Run on the Raspberry Pi when available:

```bash
ss -ltnp | grep -E "3000|3010|3011|8332|50001|8080"
```

Review, do not blindly change:

- Which address each service binds to.
- Whether API `3011` is `127.0.0.1` or all interfaces.
- Whether Core RPC `8332` is private.
- Whether mempool/Fulcrum ports match the intended architecture.

Optional non-secret local health checks:

```bash
curl --fail --max-time 10 http://127.0.0.1:3000/
curl --fail --max-time 10 http://127.0.0.1:3011/api/auth/session
curl --max-time 10 http://127.0.0.1:8080/api/blocks/tip/height
```

The mempool tip check may fail if mempool is offline; that should not be confused with Atlas web/API exposure.

## Desktop or LAN audit checks

From a trusted desktop, after same-origin mode is expected:

```bash
curl --max-time 5 http://<pi-lan-ip>:3011/api/auth/session
```

Expected hardened result:

```text
connection refused, timeout, or blocked
```

Then confirm the web origin still works:

```bash
curl --fail --max-time 10 http://<pi-lan-ip>:3000/
```

or for Docker:

```bash
curl --fail --max-time 10 http://<pi-lan-ip>:3010/
```

Browser Network tab should show API calls to:

```text
http://<pi-lan-ip>:3000/api/*
```

or:

```text
https://<tailnet-host>/api/*
```

It should not show direct browser calls to:

```text
http://<pi-lan-ip>:3011/api/*
```

## Bitcoin Core RPC audit

Bitcoin Core RPC must not be public.

Review:

- `CORE_RPC_URL` should not embed credentials.
- Prefer `CORE_RPC_URL=http://127.0.0.1:8332` when Atlas and Core run on the same host.
- If Core is on another host, restrict with `rpcbind`, `rpcallowip`, firewall rules, and private networking.
- Do not expose `8332` through router port forwarding.
- Do not paste `CORE_RPC_PASSWORD` in chat, screenshots, Git issues, logs, or docs.

Do not run `bitcoin-cli sendrawtransaction` during exposure checks.

## Firewall review checklist

- [ ] SSH is limited to trusted admin devices where practical.
- [ ] Web port is limited to trusted LAN/tailnet/private access.
- [ ] API `3011` is blocked from desktop/LAN in hardened same-origin mode.
- [ ] Bitcoin Core RPC `8332` is not reachable from untrusted hosts.
- [ ] Docker does not publish extra ports unintentionally.
- [ ] Reverse proxy rules expose only the web entry point.
- [ ] Tailscale ACLs allow only trusted users/devices.
- [ ] No public internet port forward exists for Atlas API or Core RPC.
- [ ] Public DNS does not point at Atlas unless a deliberate hardened access plan exists.

## Application configuration review

Inspect only non-secret values or redacted examples:

- `NEXT_PUBLIC_API_URL=/api`
- `INTERNAL_API_URL=http://127.0.0.1:3011`
- `API_HOST=127.0.0.1` after hardened mode is verified
- `WEB_ORIGIN` lists exact origins, not `*` or `null`
- `COOKIE_SECURE=true` when served over HTTPS
- `COOKIE_SECURE=false` only for local HTTP
- `BROADCAST_BACKEND=disabled` unless Core broadcast is intentionally configured
- `MEMPOOL_API_URL` points to the local/self-hosted backend when expected

Never print `.env` during review.

## Browser and UI exposure checks

- [ ] Login requires authentication.
- [ ] Vault unlock is required before dashboard access.
- [ ] Logout locks the vault.
- [ ] Xpub is masked by default.
- [ ] Xpub reveal is explicit and temporary.
- [ ] Receive QR display does not require camera permission.
- [ ] Camera scanner failure leaves paste/file fallback visible.
- [ ] Create PSBT creates unsigned PSBT only.
- [ ] Signed PSBT verification blocks invalid/warning PSBTs from broadcast.
- [ ] Broadcast requires checkbox and typed `BROADCAST`.

## Documentation and screenshot hygiene

Do not include these in public screenshots or pasted output:

- full `.env`
- `CORE_RPC_PASSWORD`
- `SESSION_SECRET`
- auth/session cookies
- TOTP secret
- vault password
- seed phrase
- private keys
- WIF
- xprv/yprv/zprv
- full xpub/ypub/zpub
- raw txHex
- raw signed PSBT unless intentionally sanitized

## Final audit result template

Use this format for operator notes:

```text
Date:
Atlas commit:
Host:
Access path:
Web origin:
API direct LAN access:
Core RPC direct LAN access:
Mempool backend:
Fulcrum exposure:
Broadcast backend:
Tailscale/Tor/Reverse proxy:
Findings:
Actions needed:
```

Do not include secrets in the audit result.
