# Raspberry Pi Deployment Guide

This guide describes a practical MVP deployment for Atlas on a Raspberry Pi or small Linux server.

Atlas is a self-hosted watch-only wallet. It does not sign transactions, store seed phrases, or store private keys. Optional broadcast is disabled by default and limited to Bitcoin Core RPC after signed PSBT verification.

## Target Setup

- Raspberry Pi running Linux.
- Local network, Tailscale, or Tor access.
- Node.js 20+ for direct process deployment, or Docker and Docker Compose.
- A mempool-compatible HTTP backend, preferably local.
- No public internet exposure by default.

## Production Runtime Model

Atlas runs as two processes or containers:

- API server: authentication, encrypted vault, mempool lookups, labels/notes, PSBT creation, and PSBT verification.
- Web frontend: Next.js UI served to the browser.

Development commands such as `npm run dev --workspace=apps/api` and `npm run dev --workspace=apps/web` are for local development. For a Raspberry Pi that should stay running, prefer Docker Compose or built workspace `start` scripts managed by systemd.

Operational notes:

- `wallets.enc` must persist across restarts.
- Vault unlock is manual after API restart.
- The vault password must not be stored in `.env`.
- `.env` configures runtime settings, not wallet secrets.
- If production support does not fit your environment, treat this as an MVP deployment guide and keep access private.

## Prerequisites

Install system updates:

```bash
sudo apt update
sudo apt upgrade
```

Install Git and either Node.js 20+ or Docker:

```bash
sudo apt install git
```

For Node.js, use your preferred Node 20+ installation method. For Docker, install Docker Engine and the Compose plugin from the official Docker documentation for Debian/Raspberry Pi OS.

Recommended security basics:

- Use SSH key authentication.
- Disable SSH password login if you are comfortable doing so.
- Keep the Raspberry Pi updated.
- Prefer reliable SSD storage over SD card for long-running operation.
- Use a strong vault password.
- Use a strong Atlas admin password and TOTP.
- Restrict inbound ports with a firewall.
- Prefer local network or Tailscale access.
- Do not port-forward Atlas, the Atlas API, or Bitcoin Core RPC to the public internet.
- Treat `wallets.enc`, `.env`, logs, and backups as sensitive.

## Clone The Repo

```bash
git clone https://github.com/willbegoodnurse-arch/watch-wallet.git
cd watch-wallet
```

## Configure Environment

```bash
cp .env.example .env
nano .env
```

Set at least:

```env
SESSION_SECRET=replace_with_a_long_random_session_secret
WEB_ORIGIN=http://raspberrypi.local:3010,http://<pi-lan-ip>:3010
INTERNAL_API_URL=http://127.0.0.1:3011
NEXT_PUBLIC_API_URL=/api
COOKIE_SECURE=false
MEMPOOL_API_URL=http://127.0.0.1:8080/api
VAULT_AUTO_LOCK_MINUTES=30
```

Use `COOKIE_SECURE=false` for plain local HTTP. Use `COOKIE_SECURE=true` only when serving through HTTPS.

Do not put seed phrases, private keys, xprv values, WIF keys, real xpubs, or RPC passwords in `.env`.

Important environment notes:

- `SESSION_SECRET` must be strong and random for real deployments.
- `WEB_ORIGIN` must include every frontend origin the browser will use.
- `INTERNAL_API_URL` is used by the Next.js web server to proxy `/api/*` to Atlas API.
- `NEXT_PUBLIC_API_URL=/api` lets the browser use the web origin instead of reaching the API port directly.
- `VAULT_AUTO_LOCK_MINUTES` controls server-side vault inactivity locking.
- `MEMPOOL_API_URL` is used for mempool-compatible balance, UTXO, transaction, and fee lookup.
- `FULCRUM_*` settings are currently diagnostics-oriented unless the backend mode is expanded later.
- `ADMIN_USER` in `.env.example` is an operator note, not an automatic bootstrap account.

Optional Bitcoin Core RPC broadcast:

```env
BROADCAST_BACKEND=core
CORE_RPC_URL=http://127.0.0.1:8332
CORE_RPC_USERNAME=your_rpc_user
CORE_RPC_PASSWORD=your_rpc_password
CORE_RPC_TIMEOUT_MS=10000
```

Broadcast is disabled by default. Atlas never signs transactions; when configured, it can broadcast an already-signed transaction through Bitcoin Core RPC only after server-side signed PSBT verification returns `valid` and the user explicitly confirms.

Do not expose Bitcoin Core RPC port `8332` to the public internet. Prefer localhost when Atlas and Bitcoin Core run on the same Raspberry Pi. If Bitcoin Core is on another LAN host, use `CORE_RPC_URL=http://<bitcoin-core-lan-ip>:8332` and restrict access with `rpcbind`, `rpcallowip`, and firewall rules. Test broadcast on testnet/signet or with small transactions first.

For the full Bitcoin Core RPC setup, including `bitcoin.conf`, safe connectivity checks, and the Atlas diagnostic endpoints, see [bitcoin-core-rpc-broadcast.md](bitcoin-core-rpc-broadcast.md). For exact Raspberry Pi wiring commands, see [bitcoin-core-rpc-live-wiring.md](bitcoin-core-rpc-live-wiring.md).

After same-origin mode, localhost-only API binding, local mempool, Fulcrum, and camera localhost forwarding are configured, use [hardened-runtime-smoke-test.md](hardened-runtime-smoke-test.md) for the full operational checklist.

If the local mempool block tip works but fee presets are unavailable, use [mempool-fee-estimates.md](mempool-fee-estimates.md). Atlas does not silently fall back to public mempool.space; manual fee entry remains available.

For operator safety planning, review:

- [backup-restore.md](backup-restore.md) for backup, restore, and disaster recovery.
- [tailscale-https-access.md](tailscale-https-access.md) for private HTTPS and camera-access planning.
- [network-exposure-audit.md](network-exposure-audit.md) for final port and firewall review.

## Option A: Docker Compose

Build and start:

```bash
docker compose up --build -d
```

### Port Structure and Networking

**External access (via Caddy HTTPS):**
- Web UI: `https://raspberry-pi-fullcrum.tailcb1ed9.ts.net:8443`
- Vaultwarden: `https://raspberry-pi-fullcrum.tailcb1ed9.ts.net`

**Internal ports:**
- `3010`: Watch-wallet web frontend (published to host, accessed by Caddy)
- `3011`: Watch-wallet API (Docker-internal only, NOT published to host)
- `8080`: Mempool frontend
- `8081`: Vaultwarden HTTP backend
- `8332`: Bitcoin Core RPC (localhost only, never expose publicly)
- `8443`: Caddy HTTPS entrypoint for watch-wallet

**Critical networking rules:**

1. **Port 3011 must NOT be published to host**
   - `docker-compose.yml` uses `expose: ["3011"]` for watch-wallet-api, NOT `ports`
   - The web container accesses API via Docker internal network: `http://watch-wallet-api:3011`
   - Caddy and browsers must NOT access port 3011 directly

2. **API must bind to 0.0.0.0 inside Docker**
   - Set `API_HOST=0.0.0.0` or `HOST=0.0.0.0` in environment
   - If API binds to `127.0.0.1` only, Docker internal networking fails
   - Correct log: `Server listening at http://172.x.x.x:3011`
   - Incorrect log: `Server listening at http://127.0.0.1:3011`

3. **Same-origin API proxy mode (recommended)**
   - Browser calls: `https://raspberry-pi-fullcrum.tailcb1ed9.ts.net:8443/api/*`
   - Caddy proxies to: `127.0.0.1:3010`
   - Web container proxies `/api/*` to: `http://watch-wallet-api:3011`
   - Set `NEXT_PUBLIC_API_URL=/api` and `INTERNAL_API_URL=http://watch-wallet-api:3011`

4. **Request flow:**
   ```
   Browser
   → https://raspberry-pi-fullcrum.tailcb1ed9.ts.net:8443
   → Caddy (TLS termination)
   → 127.0.0.1:3010
   → watch-wallet-web container
   → http://watch-wallet-api:3011 (Docker internal)
   → watch-wallet-api container
   ```

5. **Do NOT expose these ports publicly:**
   - Port 3011 (API)
   - Port 8332 (Bitcoin Core RPC)
   - Use Tailscale or local network access only

**Docker details:**

- The API bind mount `./apps/api/data:/app/apps/api/data` persists `wallets.enc`.
- Docker Compose sets `DATA_DIR=/app/apps/api/data` inside the API container.
- `WEB_PORT` (default 3010) is the host port for the web container; the web container listens on port `3000` internally.
- `NEXT_PUBLIC_API_URL` and `INTERNAL_API_URL` affect the web build/proxy. If you change either, rebuild the web image with `docker compose up --build -d`.
- Do not put real secrets, real xpubs, seed phrases, private keys, or RPC passwords in the image or committed files.

**Validation:**

Run the runtime validation script to check Docker networking:

```bash
./scripts/check-raspi-runtime.sh
```

This script verifies:
- Containers are running
- API port 3011 is not published to host
- API is binding to Docker-accessible address (not 127.0.0.1 only)
- Web container can reach API via internal network
- No `ECONNREFUSED 127.0.0.1:3011` errors in web logs
- `INTERNAL_API_URL` is correctly set to `http://watch-wallet-api:3011`

Check reachability (from Raspberry Pi):

```bash
curl http://127.0.0.1:3010/api/status
```

**Do NOT** access port 3011 directly from outside Docker:

```bash
# This should NOT work from host or browser:
curl http://127.0.0.1:3011/health  # Only works inside API container
```

View logs:

```bash
docker compose logs -f
```

View one service:

```bash
docker compose logs -f watch-wallet-api
docker compose logs -f watch-wallet-web
```

Stop:

```bash
docker compose down
```

Encrypted API data is stored on the host at:

```text
apps/api/data
```

## Option B: Direct Node.js Processes

Install dependencies:

```bash
npm install
```

Build:

```bash
npm run build --workspace=apps/api
npm run build --workspace=apps/web
```

Start the API:

```bash
npm run start --workspace=apps/api
```

Start the web app in another terminal:

```bash
npm run start --workspace=apps/web
```

Reachability after startup:

```bash
curl http://127.0.0.1:3011/health
curl http://127.0.0.1:3011/api/status
```

For development mode:

```bash
npm run dev --workspace=apps/api
npm run dev --workspace=apps/web
```

## Optional systemd Services

If you deploy without Docker, create systemd services only after confirming the commands work manually.

The examples below are guidance only. Adjust paths, Linux user, Node/npm location, and ports for your Raspberry Pi.

Example API service:

```ini
[Unit]
Description=Atlas API
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=/home/pi/watch-wallet
EnvironmentFile=/home/pi/watch-wallet/.env
ExecStart=/usr/bin/npm run start --workspace=apps/api
Restart=on-failure
User=pi
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=/home/pi/watch-wallet/apps/api/data

[Install]
WantedBy=multi-user.target
```

Example web service:

```ini
[Unit]
Description=Atlas web
After=network-online.target watch-wallet-api.service
Wants=network-online.target

[Service]
WorkingDirectory=/home/pi/watch-wallet
EnvironmentFile=/home/pi/watch-wallet/.env
ExecStart=/usr/bin/npm run start --workspace=apps/web
Restart=on-failure
User=pi
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
```

Install and operate the services:

```bash
sudo systemctl daemon-reload
sudo systemctl enable atlas-api atlas-web
sudo systemctl start atlas-api atlas-web
sudo systemctl status atlas-api atlas-web
journalctl -u atlas-api -f
journalctl -u atlas-web -f
```

## Firewall Recommendations

Expose only what you need:

- Web port: usually `3010` for Docker or `3000` for development.
- API port: usually `3011`.
- SSH: usually `22`, preferably restricted to trusted devices.

Do not expose the API publicly to the internet. If you use a reverse proxy, add HTTPS and your own access controls.

Example UFW patterns, adjust IPs and ports before use:

```bash
sudo ufw allow from <trusted-lan-or-tailscale-ip> to any port 3010 proto tcp
sudo ufw allow from <trusted-lan-or-tailscale-ip> to any port 22 proto tcp
sudo ufw deny 3011/tcp
```

Preferred hardened mode uses `NEXT_PUBLIC_API_URL=/api`, so the browser reaches the web origin and the web server proxies to `INTERNAL_API_URL`. After verifying this mode, the API can be bound to `127.0.0.1` and port `3011` can be blocked from the LAN.

Legacy direct mode remains available by setting `NEXT_PUBLIC_API_URL=http://<pi-lan-ip>:3011`. In that mode, the API port must be reachable from the trusted browser network. Keep that exposure limited to LAN/Tailscale rather than the public internet.

## Tailscale Access

Tailscale is a good fit for a private Raspberry Pi deployment.

1. Install Tailscale on the Pi and client devices.
2. Use the Pi Tailscale IP or MagicDNS name in `WEB_ORIGIN`; keep `NEXT_PUBLIC_API_URL=/api` for same-origin mode.
3. Keep `COOKIE_SECURE=false` for plain HTTP over Tailscale, or use HTTPS if you configure it.

For HTTPS camera access planning with Tailscale Serve, review [tailscale-https-access.md](tailscale-https-access.md) before changing `.env`, Tailscale settings, or firewall rules.

## Tor Hidden Service Note

Tor can be used for private remote access, but this project does not include a complete Tor deployment. If you configure Tor yourself, only expose the web entry point and make sure API access is still restricted to trusted origins.

## Runtime Health And Diagnostics

Safe reachability endpoints:

- `GET /health`: returns a minimal process health response.
- `GET /api/status`: returns watch-only storage policy and app status without wallet secrets.
- `GET /api/status/mempool`: returns mempool backend health and sanitized backend metadata.
- `GET /api/status/fulcrum`: returns Fulcrum diagnostics when configured.

Authenticated runtime settings are available in the app through `GET /api/settings/runtime`; that response is designed to avoid secrets.

These endpoints must not be treated as a substitute for wallet verification. They only tell you whether the service and configured backends are reachable.

## Back Up wallets.enc

For the complete backup, restore, and disaster recovery checklist, see [backup-restore.md](backup-restore.md).

The encrypted vault lives at:

```text
apps/api/data/wallets.enc
```

`wallets.enc` contains encrypted watch-only metadata. It may include xpub, ypub, zpub, address labels, UTXO notes, transaction notes, and wallet settings. It does not contain seed phrases, private keys, xprv values, WIF keys, or signed transaction authority.

Deleting `wallets.enc` removes local watch-only metadata from Atlas. It does not move or delete Bitcoin funds.

Lock the vault or stop the API before backup when practical, then copy it securely:

```bash
cp apps/api/data/wallets.enc ~/atlas-wallets-$(date +%Y%m%d).enc
```

Also consider backing up:

```text
apps/api/data/auth.json
```

Back up `.env` separately if you need to preserve server configuration, but remember `.env` does not unlock the vault. Do not store the vault password in plaintext next to backups.

Verify the backup exists:

```bash
ls -lh ~/atlas-wallets-*.enc
```

The vault password is required to decrypt restored `wallets.enc`. If you forget the vault password, the encrypted vault data cannot be recovered by the app.

## Restore wallets.enc

Stop the app first:

```bash
docker compose down
```

Copy the backup into place:

```bash
cp ~/atlas-wallets-YYYYMMDD.enc apps/api/data/wallets.enc
```

Restart:

```bash
docker compose up -d
```

Unlock the vault with the original vault password.

For a direct Node.js/systemd deployment, stop the services before restore and start them again after the file is in place:

```bash
sudo systemctl stop atlas-api atlas-web
cp ~/atlas-wallets-YYYYMMDD.enc apps/api/data/wallets.enc
sudo systemctl start atlas-api atlas-web
```

## Safe deployment script

For direct Raspberry Pi/systemd deployments, prefer the fail-closed deploy script instead of running each deploy command by hand:

```bash
cd ~/watch-wallet
chmod +x scripts/deploy-raspberry-pi.sh
./scripts/deploy-raspberry-pi.sh
```

The script refuses to continue if the Git worktree is dirty, pulls only with `git pull --ff-only`, installs dependencies with `npm install`, builds `packages/bitcoin`, `apps/api`, clears the stale `apps/web/.next` cache, then builds `apps/web`. It restarts `atlas-api` and `atlas-web` only after all builds pass.

After restart it checks local service status and non-secret health endpoints:

```bash
sudo systemctl status atlas-api --no-pager
sudo systemctl status atlas-web --no-pager
curl --fail --max-time 10 http://127.0.0.1:3011/api/auth/session
curl --fail --max-time 10 http://127.0.0.1:3000/
```

The local mempool tip check at `http://127.0.0.1:8080/api/blocks/tip/height` is warning-only so a mempool outage does not hide whether the Atlas deploy itself succeeded.

The script does not print `.env`, modify `.env`, delete `wallets.enc`, touch Bitcoin Core config, change firewall rules, open ports, or broadcast transactions. If rollback is needed, review the failure and use the previous commit printed by the script.

## Update Process

```bash
git pull
npm install
npm run typecheck --workspace=apps/web
npm run typecheck --workspace=apps/api
npm test --workspace=apps/api
npm run build --workspace=apps/web
docker compose up --build -d
```

On Windows PowerShell, use `npm.cmd` if `npm.ps1` is blocked by Execution Policy.

If you run direct Node.js/systemd instead of Docker, rebuild both workspaces and restart the services:

```bash
npm run build --workspace=packages/bitcoin
npm run build --workspace=apps/api
rm -rf apps/web/.next
npm run build --workspace=apps/web
sudo systemctl restart atlas-api atlas-web
```

The safe deployment script above is preferred because it stops before service restart if any install or build step fails.

## Logging

Development logs:

```bash
npm run dev --workspace=apps/api
npm run dev --workspace=apps/web
```

Docker logs:

```bash
docker compose logs -f watch-wallet-api
docker compose logs -f watch-wallet-web
```

systemd logs:

```bash
journalctl -u atlas-api -f
journalctl -u atlas-web -f
```

Logs should not contain vault passwords, seed phrases, private keys, xprv/WIF values, cookies, auth headers, or full xpub values. The xpub reveal audit event should record that a reveal happened without logging the revealed value.

## Troubleshooting

### Docker Networking Issues

**Problem: `ECONNREFUSED 127.0.0.1:3011` in web container logs**

Cause: `INTERNAL_API_URL` is set to `http://127.0.0.1:3011` instead of the Docker service name.

Solution:
```bash
# In .env, set:
INTERNAL_API_URL=http://watch-wallet-api:3011
# Then rebuild:
docker compose up --build -d
```

**Problem: `Error starting userland proxy: listen tcp4 0.0.0.0:3011: bind: address already in use`**

Cause: `docker-compose.yml` is trying to publish port 3011 to host, but it's already in use or should not be published.

Solution:
```bash
# In docker-compose.yml, watch-wallet-api should use:
expose:
  - "3011"
# NOT:
ports:
  - "3011:3011"
```

**Problem: API logs show `Server listening at http://127.0.0.1:3011`**

Cause: API is binding to localhost only, which prevents Docker internal networking.

Solution:
```bash
# In .env or docker-compose.yml environment, add:
API_HOST=0.0.0.0
HOST=0.0.0.0
# Then restart:
docker compose restart watch-wallet-api
```

**Problem: Browser shows "Server API Error" or cannot reach API**

Check the request flow:
1. Verify Caddy is running: `sudo systemctl status caddy`
2. Verify Caddy is proxying to 127.0.0.1:3010
3. Verify web container is running: `docker compose ps`
4. Check web logs: `docker compose logs watch-wallet-web --tail=50`
5. Check API logs: `docker compose logs watch-wallet-api --tail=30`
6. Run validation script: `./scripts/check-raspi-runtime.sh`

**Problem: Permissions-Policy warnings in browser console**

These warnings are non-fatal:
```
Unrecognized feature: 'browsing-topics'
Unrecognized feature: 'run-ad-auction'
```

These are browser warnings about ad-related features and do not affect wallet functionality. If API requests are working (no 500 errors, session loads correctly), the app is functioning normally.

### General Troubleshooting

- Web cannot reach API: check `NEXT_PUBLIC_API_URL` and `WEB_ORIGIN`.
- Login cookie does not stick: check `COOKIE_SECURE`; it should be `false` for plain HTTP.
- Balance/UTXO/transaction lookups fail: check `MEMPOOL_API_URL` and mempool backend health.
- Vault locked: unlock manually with the vault password.
- Vault auto-locks too quickly: adjust `VAULT_AUTO_LOCK_MINUTES`.
- Single QR export fails: use text export; animated QR and BBQr are intentionally deferred.
- Camera QR scanning fails on LAN HTTP: browsers may block camera access on origins such as `http://172.30.x.x:3000`. Use text import/export, HTTPS, localhost forwarding, or Tailscale Serve. Do not expose Atlas or Bitcoin Core RPC publicly just to enable camera access. See [camera-qr-secure-context.md](camera-qr-secure-context.md).

## Security Checklist

- Strong admin password.
- TOTP enabled during initial setup.
- Strong vault password.
- SSH keys preferred over SSH passwords.
- Firewall restricts ports.
- No public API exposure.
- Local mempool backend preferred for privacy.
- `wallets.enc` backed up securely.
- Raspberry Pi kept updated.

This project is not audited. Operating the Raspberry Pi and network securely is the operator's responsibility.
