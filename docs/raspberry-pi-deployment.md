# Raspberry Pi Deployment Guide

This guide describes a practical MVP deployment for watch wallet on a Raspberry Pi or small Linux server.

watch wallet is a self-hosted watch-only wallet. It does not sign transactions, broadcast transactions, store seed phrases, or store private keys.

## Target Setup

- Raspberry Pi running Linux.
- Local network, Tailscale, or Tor access.
- Node.js 20+ for direct process deployment, or Docker and Docker Compose.
- A mempool-compatible HTTP backend, preferably local.
- No public internet exposure by default.

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
- Use a strong vault password.
- Restrict inbound ports with a firewall.
- Prefer local network or Tailscale access.

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
NEXT_PUBLIC_API_URL=http://<pi-lan-ip>:3011
COOKIE_SECURE=false
MEMPOOL_API_URL=http://127.0.0.1:8080/api
VAULT_AUTO_LOCK_MINUTES=30
```

Use `COOKIE_SECURE=false` for plain local HTTP. Use `COOKIE_SECURE=true` only when serving through HTTPS.

Do not put seed phrases, private keys, xprv values, WIF keys, real xpubs, or RPC passwords in `.env`.

## Option A: Docker Compose

Build and start:

```bash
docker compose up --build -d
```

Default ports:

- Web: `http://<pi-lan-ip>:3010`
- API: `http://<pi-lan-ip>:3011`

View logs:

```bash
docker compose logs -f
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

For development mode:

```bash
npm run dev --workspace=apps/api
npm run dev --workspace=apps/web
```

## Optional systemd Services

If you deploy without Docker, create systemd services only after confirming the commands work manually.

Example API service:

```ini
[Unit]
Description=watch wallet API
After=network-online.target

[Service]
WorkingDirectory=/home/pi/watch-wallet
EnvironmentFile=/home/pi/watch-wallet/.env
ExecStart=/usr/bin/npm run start --workspace=apps/api
Restart=on-failure
User=pi

[Install]
WantedBy=multi-user.target
```

Example web service:

```ini
[Unit]
Description=watch wallet web
After=network-online.target watch-wallet-api.service

[Service]
WorkingDirectory=/home/pi/watch-wallet
EnvironmentFile=/home/pi/watch-wallet/.env
ExecStart=/usr/bin/npm run start --workspace=apps/web
Restart=on-failure
User=pi

[Install]
WantedBy=multi-user.target
```

Adjust paths, user, and Node/npm locations for your system.

## Firewall Recommendations

Expose only what you need:

- Web port: usually `3010` for Docker or `3000` for development.
- API port: usually `3011`.
- SSH: usually `22`, preferably restricted to trusted devices.

Do not expose the API publicly to the internet. If you use a reverse proxy, add HTTPS and your own access controls.

## Tailscale Access

Tailscale is a good fit for a private Raspberry Pi deployment.

1. Install Tailscale on the Pi and client devices.
2. Use the Pi Tailscale IP or MagicDNS name in `WEB_ORIGIN` and `NEXT_PUBLIC_API_URL`.
3. Keep `COOKIE_SECURE=false` for plain HTTP over Tailscale, or use HTTPS if you configure it.

## Tor Hidden Service Note

Tor can be used for private remote access, but this project does not include a complete Tor deployment. If you configure Tor yourself, only expose the web entry point and make sure API access is still restricted to trusted origins.

## Back Up wallets.enc

The encrypted vault lives at:

```text
apps/api/data/wallets.enc
```

Back it up securely:

```bash
cp apps/api/data/wallets.enc /path/to/encrypted-backup/wallets.enc
```

Also consider backing up:

```text
apps/api/data/auth.json
```

The vault password is not recoverable from `wallets.enc`. If you forget the vault password, the encrypted vault data cannot be recovered by the app.

## Restore wallets.enc

Stop the app first:

```bash
docker compose down
```

Copy the backup into place:

```bash
cp /path/to/encrypted-backup/wallets.enc apps/api/data/wallets.enc
```

Restart:

```bash
docker compose up -d
```

Unlock the vault with the original vault password.

## Update Process

```bash
git pull
npm install
npm run typecheck --workspace=apps/web
npm run typecheck --workspace=apps/api
npm test --workspace=apps/api
docker compose up --build -d
```

On Windows PowerShell, use `npm.cmd` if `npm.ps1` is blocked by Execution Policy.

## Troubleshooting

- Web cannot reach API: check `NEXT_PUBLIC_API_URL` and `WEB_ORIGIN`.
- Login cookie does not stick: check `COOKIE_SECURE`; it should be `false` for plain HTTP.
- Balance/UTXO/transaction lookups fail: check `MEMPOOL_API_URL` and mempool backend health.
- Vault locked: unlock manually with the vault password.
- Vault auto-locks too quickly: adjust `VAULT_AUTO_LOCK_MINUTES`.
- Single QR export fails: use text export; animated QR and BBQr are intentionally deferred.

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
