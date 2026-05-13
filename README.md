# watch wallet

A calm, self-hosted, watch-only Bitcoin web wallet dashboard for your own node.

watch wallet is designed to run on a Raspberry Pi with Docker, alongside services such as Bitcoin Core, Fulcrum, or Mempool. Phase 5 implements administrator authentication, encrypted watch-only wallet registration, address derivation, QR display, Mempool-based address usage lookup, and wallet balance summaries. Transaction lookup, PSBT generation, and broadcast features are not implemented yet.

## Features

- TypeScript monorepo with npm workspaces
- `apps/web` Next.js web app shell
- `apps/api` Node/Fastify API shell
- `packages/bitcoin` placeholder package for future watch-only Bitcoin utilities
- `packages/ui` placeholder package for future shared UI primitives
- Docker Compose draft for Raspberry Pi friendly deployment
- Security-first documentation for watch-only operation
- Phase 1 administrator setup, TOTP 2FA, and session shell
- Phase 2 encrypted wallet vault with xpub, ypub, and zpub registration
- Phase 3 receive/change address derivation with address QR display
- Phase 4 Mempool API address usage lookup and next unused receive address discovery
- Phase 5 confirmed and unconfirmed balance summaries in sats or BTC

## Screenshots

Screenshots will be added after the UI phase. Phase 0 intentionally contains only a minimal shell.

## Security Model

watch wallet is a self-hosted, watch-only Bitcoin wallet dashboard.

**What it does and does not do:**
- Watch-only only. It monitors balances, addresses, UTXOs, and transactions.
- It never asks for, stores, or transmits seed phrases or private keys.
- It never signs transactions.
- It never broadcasts transactions (PSBT broadcast is not implemented).
- Do not enter a seed phrase or private key anywhere in this application. The import form rejects them.

**Extended public keys (xpub / ypub / zpub):**
- xpub, ypub, and zpub are privacy-sensitive. Anyone with them can derive your full wallet history and all future addresses.
- watch wallet stores them in an AES-256-GCM encrypted vault (`wallets.enc`) on the server, protected by a vault password.
- The vault password is not stored anywhere. The derived vault key is memory-only and discarded on restart or lock.
- Normal API responses return only a masked key (e.g. `zpub6rFR...8aM`). The full key is never returned by default.
- Revealing the full key requires explicit confirmation through a two-step UI flow.
- The vault auto-locks after 30 minutes of inactivity (configurable with `VAULT_AUTO_LOCK_MINUTES`).
- Logging out locks the vault immediately.

**Access model:**
- Recommended: local network, Tailscale, or Tor.
- Do not expose the API port to the public internet without a reverse proxy with HTTPS and additional access controls.
- Cookies are HttpOnly and signed. Set `COOKIE_SECURE=true` in production behind HTTPS.

**Address derivation:**
- Addresses are derived in memory on request. They are not written to disk.
- Balance, UTXO, and transaction data comes from the configured Mempool API and is not stored server-side.

watch wallet은 보기전용 비트코인 지갑 대시보드입니다.
이 앱은 시드 문구나 개인키를 절대 요구하지 않으며, 잔액과 주소를 보는 기능만 제공합니다.
절대 이 앱에 시드 문구나 개인키를 입력하지 마십시오.

xpub, ypub, zpub은 지갑 전체 거래내역을 노출할 수 있는 민감한 정보입니다.
watch wallet은 이를 AES-256-GCM으로 암호화된 서버 측 지갑 저장소에만 보관하며,
일반 API 응답에서는 마스킹된 키(예: `zpub6rFR...8aM`)만 반환합니다.
Raspberry Pi, 기기, 브라우저 프로필 접근 권한을 안전하게 보호하십시오.

Future sending features must use a PSBT-only workflow. watch wallet may later help select UTXOs, set recipients, choose fees, and create unsigned PSBTs. Signing must happen in an external signer such as Nunchuk, Sparrow, or a hardware wallet. watch wallet must not sign transactions itself.

## Installation

Requirements:

- Raspberry Pi or Linux server
- Docker
- Docker Compose

Create an environment file:

```bash
cp .env.example .env
```

Edit `.env` before production use, especially `SESSION_SECRET`.

For development on another computer, see [DEVELOPMENT.md](DEVELOPMENT.md).

## Docker Compose

```bash
docker compose up --build
```

Default ports:

- Web: `http://localhost:3010`
- API: `http://localhost:3011`

The Compose draft maps the web container's internal port `3000` to `WEB_PORT`, and the API container's internal port `3011` to `API_PORT`.

## First Setup

Phase 1 first setup creates one administrator account and enables TOTP 2FA. The API stores only authentication metadata in `apps/api/data/auth.json`: username, password hash, TOTP secret, 2FA status, and creation time.

## Adding a Wallet

Wallet registration stores watch-only xpub, ypub, and zpub values in encrypted server-side storage at `apps/api/data/wallets.enc`. The API must never persist seed phrases, private keys, or raw xpub, ypub, or zpub values.

Never enter a seed phrase or private key into watch wallet.

Wallet registration is part of Phase 2. Phase 3 derives receive/change addresses in memory on request. Phase 4 checks those watch-only public addresses against the configured Mempool API to classify usage and find the next unused receive address. Phase 5 calculates confirmed and unconfirmed balances from Mempool address stats. Derived address lists, usage results, and balance results are not written to disk.

## Future PSBT Flow

Future sending support is planned as a PSBT-based coordination flow:

1. Select UTXOs in watch wallet.
2. Enter recipient address, amount, and fee settings.
3. Choose a change address.
4. Create an unsigned PSBT.
5. Sign the PSBT in Nunchuk, Sparrow, or a hardware wallet.
6. Import the signed PSBT back into watch wallet.
7. Extract the raw transaction.
8. Broadcast through the user's own node.

This project must never request, store, or transmit seed phrases or private keys. The server must not store raw xpub, ypub, or zpub values.

## Supported Networks

Planned networks:

- mainnet
- testnet
- signet

## Supported Extended Public Keys

Planned watch-only inputs:

- xpub
- ypub
- zpub
- single address
- descriptor support in a later phase

## Configuration

Initial environment variables:

```env
WEB_PORT=3010
API_PORT=3011
NEXT_PUBLIC_API_URL=http://localhost:3011
MEMPOOL_API_URL=http://localhost:8080/api
API_MODE=mempool
FULCRUM_HOST=127.0.0.1
FULCRUM_PORT=50001
FULCRUM_TLS_PORT=50002
FULCRUM_USE_TLS=false
DEFAULT_NETWORK=mainnet
DEFAULT_CURRENCY=KRW
DEFAULT_UNIT=BTC
```

## Roadmap

- Phase 0: project skeleton, Docker Compose, README, MIT License, security docs
- Phase 1: administrator setup, password hashing, TOTP 2FA, session handling
- Phase 2: encrypted server-side xpub, ypub, zpub wallet registration
- Phase 3: watch-only address derivation
- Phase 4: Mempool API address usage lookup and next unused receive address
- Phase 5: Mempool API balance lookup with confirmed/unconfirmed wallet summary
- Phase 6: calm Sparrow-inspired dark dashboard UI
- Phase 7: settings and encrypted wallet backup/import
- Phase 8: PSBT-oriented sending and broadcast workflow without private key handling

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security-sensitive changes must preserve the watch-only model.

## License

MIT License. See [LICENSE](LICENSE).
