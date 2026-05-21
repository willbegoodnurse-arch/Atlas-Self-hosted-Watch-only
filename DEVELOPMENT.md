# Development Setup

Use this guide for local Atlas development.

## Requirements

- Node.js 20 or newer.
- npm.
- A mempool-compatible HTTP backend for balance, UTXO, fee, and transaction lookups.

## Clone And Install

```bash
git clone https://github.com/willbegoodnurse-arch/Atlas-Self-hosted-Watch-only.git
cd Atlas-Self-hosted-Watch-only
npm install
```

On the current Windows development machine:

```powershell
cd C:\Users\USER\Atlas-Self-hosted-Watch-only
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
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
git diff --check
```

On shells with Bash available, the local release gate can be run as:

```bash
./scripts/check-local-release.sh
```

The script runs typecheck, tests, build, `git diff --check`, and `npm audit --omit=dev`. It does not run `npm install`, `npm update`, `npm audit fix`, `npm audit fix --force`, commit, push, tag, deploy, or read `.env`.

## Workspace Link Recovery

npm workspaces create links under `node_modules/@watch-wallet/*`. If the project directory is moved or copied, those links can still point at the old path.

Common symptom:

```text
Cannot find module '@watch-wallet/bitcoin'
```

Recovery:

```bash
npm install
```

Then rerun:

```bash
npm run typecheck
```

Do not edit generated workspace links by hand. Reinstalling dependencies from the repository root is the expected repair.

## Dependency Audit Handling

As of Phase 56, `npm audit --omit=dev` reports a moderate Next/PostCSS finding because `next@15.5.18` depends internally on `postcss@8.4.31`.

Current policy:

- Do not run `npm audit fix`.
- Do not run `npm audit fix --force`.
- Do not downgrade or major-upgrade Next to satisfy audit output.
- Recheck when a newer Next 15 patch is available.
- Treat high or critical production dependency findings as release blockers until reviewed.

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
