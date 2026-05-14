# Same-Origin API Proxy

Atlas supports a same-origin API access model to reduce the browser-visible network surface.

In hardened mode, the browser calls:

```text
http://<pi-lan-ip>:3000/api/*
```

The Next.js web server proxies those requests internally to the Atlas API:

```text
INTERNAL_API_URL=http://127.0.0.1:3011
```

`INTERNAL_API_URL` must use `http://` or `https://` and must not embed credentials.

This prepares deployments where only the web port is reachable from the LAN or tailnet, while the API port is bound to localhost or blocked by firewall.

## Mode A: Legacy Direct LAN Mode

This is useful for transition and troubleshooting.

```env
API_HOST=0.0.0.0
API_PORT=3011
WEB_ORIGIN=http://<pi-lan-ip>:3000
NEXT_PUBLIC_API_URL=http://<pi-lan-ip>:3011
```

Browser flow:

```text
Browser -> http://<pi-lan-ip>:3011/api/*
```

Tradeoff:

- Easier to test.
- API port is reachable from the LAN or tailnet.
- CORS and browser credentials must be configured correctly.

## Mode B: Hardened Same-Origin Mode

This is the preferred operating model once verified.

```env
API_HOST=0.0.0.0
API_PORT=3011
WEB_ORIGIN=http://<pi-lan-ip>:3000
INTERNAL_API_URL=http://127.0.0.1:3011
NEXT_PUBLIC_API_URL=/api
```

Browser flow:

```text
Browser -> http://<pi-lan-ip>:3000/api/* -> Next.js proxy -> http://127.0.0.1:3011/api/*
```

After same-origin mode is verified, the operator can harden further:

```env
API_HOST=127.0.0.1
```

Then restart API and web. From another machine, direct API access should fail:

```bash
curl http://<pi-lan-ip>:3011/api/auth/session
```

The web origin should still work:

```bash
curl http://<pi-lan-ip>:3000/api/status
```

## Docker Compose

When web and API run as separate containers, `INTERNAL_API_URL` should use the Compose service name, not `127.0.0.1`:

```env
NEXT_PUBLIC_API_URL=/api
INTERNAL_API_URL=http://watch-wallet-api:3011
```

If either value changes, rebuild the web image because Next.js rewrites are generated for the web build:

```bash
docker compose up --build -d
```

## systemd / Direct Node

When API and web run on the same Raspberry Pi host:

```env
NEXT_PUBLIC_API_URL=/api
INTERNAL_API_URL=http://127.0.0.1:3011
```

Build or restart the web service with `INTERNAL_API_URL` available to the web process. If `INTERNAL_API_URL` is missing, the web server defaults to `http://127.0.0.1:3011`.

## Cookies And CORS

Legacy direct mode is cross-origin when web and API use different ports. It needs:

- API CORS `WEB_ORIGIN` to include the frontend origin.
- `credentials: include` in browser requests.
- `COOKIE_SECURE=false` for local HTTP, or `COOKIE_SECURE=true` behind HTTPS.

Same-origin mode sends browser requests to the web origin first, so browser CORS is avoided for `/api/*`. The API still keeps CORS support for legacy direct mode.

## Firewall Guidance

Legacy test mode:

```bash
sudo ufw allow 3000/tcp
sudo ufw allow 3011/tcp
```

Hardened mode:

```bash
sudo ufw allow 3000/tcp
sudo ufw deny 3011/tcp
```

Tailscale-only hardened mode:

```bash
sudo ufw allow in on tailscale0 to any port 3000 proto tcp
sudo ufw deny 3011/tcp
```

Never expose:

- Bitcoin Core RPC port `8332`.
- `.env`.
- `wallets.enc`.
- Atlas API to the public internet.

## Manual Smoke Test

1. Start API and web.
2. Open `http://<pi-lan-ip>:3000`.
3. Log in.
4. Unlock the vault.
5. Confirm wallet list loads.
6. Confirm balance, UTXOs, and transactions load.
7. Confirm signed PSBT verification loads.
8. Confirm authenticated broadcast status loads if configured.
9. Confirm text PSBT import/export still works.
10. After switching `API_HOST=127.0.0.1`, confirm direct LAN access to port `3011` fails while web `/api/*` continues to work.

## Deferred

This phase does not remove legacy direct mode. Keep it available until same-origin mode is verified on the Raspberry Pi.
