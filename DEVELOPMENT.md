# Development Setup

Use this guide for local watch wallet development.

## Requirements

- Node.js 20 or newer.
- npm.
- A mempool-compatible HTTP backend for balance, UTXO, fee, and transaction lookups.

## Clone And Install

```bash
git clone https://github.com/willbegoodnurse-arch/watch-wallet.git
cd watch-wallet
npm install
```

On the current Windows development machine:

```powershell
cd C:\Users\USER\watch-wallet
npm install
```

## Environment

Create a local environment file:

```powershell
Copy-Item .env.example .env
```

For local development, these values are usually enough:

```env
WEB_ORIGIN=http://localhost:3000,http://localhost:3010
NEXT_PUBLIC_API_URL=http://localhost:3011
COOKIE_SECURE=false
MEMPOOL_API_URL=http://localhost:8080/api
VAULT_AUTO_LOCK_MINUTES=30
```

Set a unique `SESSION_SECRET` on real devices. Do not commit `.env`.

## Run On Windows PowerShell

Use `npm.cmd` if `npm.ps1` is blocked by Execution Policy.

Start the API:

```powershell
npm.cmd run dev --workspace=apps/api
```

Start the web app in a second terminal:

```powershell
npm.cmd run dev --workspace=apps/web
```

Open:

```text
http://localhost:3000
```

The API normally listens on:

```text
http://localhost:3011
```

## Run On Other Shells

```bash
npm run dev --workspace=apps/api
npm run dev --workspace=apps/web
```

## Validation

```powershell
npm.cmd run typecheck --workspace=apps/web
npm.cmd run typecheck --workspace=apps/api
npm.cmd test --workspace=apps/api
```

`apps/web` currently has no frontend test script.

## Local Data

Authentication data:

```text
apps/api/data/auth.json
```

Encrypted watch-only wallet vault:

```text
apps/api/data/wallets.enc
```

These files are ignored by Git. `wallets.enc` contains encrypted watch-only wallet data, labels, and notes. The vault password is required to unlock it and is not recoverable by the app.

## Development Boundaries

- Do not add signing.
- Do not add broadcast.
- Do not add seed phrase handling.
- Do not add private key handling.
- Do not add xprv, yprv, zprv, or WIF handling except rejection.
- Do not expose full xpub, ypub, or zpub in normal API responses.
- Do not store labels or notes in localStorage/sessionStorage.
- Keep labels and notes as metadata only.
