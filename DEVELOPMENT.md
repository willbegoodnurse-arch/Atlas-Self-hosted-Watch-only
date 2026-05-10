# Development Setup

Use this guide to continue watch wallet development on another computer.

## Clone

```bash
git clone https://github.com/willbegoodnurse-arch/watch-wallet.git
cd watch-wallet
```

## Install

```bash
npm install
```

## Environment

Create a local environment file:

```bash
cp .env.example .env
```

For local development, keep these values unless your ports are different:

```env
WEB_ORIGIN=http://localhost:3000,http://localhost:3010
NEXT_PUBLIC_API_URL=http://localhost:3011
COOKIE_SECURE=false
```

Set a unique `SESSION_SECRET` on each real device. Do not commit `.env`.

## Run

Start the API:

```bash
npm run dev:api
```

Start the web app in another terminal:

```bash
npm run dev:web
```

Open:

```text
http://localhost:3000
```

The API should answer:

```text
http://localhost:3011/api/auth/session
```

## Build Check

On Windows PowerShell:

```powershell
npm.cmd run build
```

On other shells:

```bash
npm run build
```

## Local Data

Phase 1 stores local authentication data in:

```text
data/auth.json
```

This file is ignored by Git. It is device-local and should not be copied into the repository.

## Security Boundaries

- Do not add seed phrase input.
- Do not add private key input.
- Do not store raw xpub, ypub, or zpub values on the server.
- Phase 1 is authentication only.
- Future sending features must use unsigned PSBTs and external signers.

