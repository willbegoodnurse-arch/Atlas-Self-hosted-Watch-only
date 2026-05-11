# watch wallet

A calm, self-hosted, watch-only Bitcoin web wallet dashboard for your own node.

watch wallet is designed to run on a Raspberry Pi with Docker, alongside services such as Bitcoin Core, Fulcrum, or Mempool. Phase 2 implements administrator authentication and encrypted watch-only wallet registration. Address derivation, balance lookup, transaction lookup, PSBT generation, and broadcast features are not implemented yet.

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

## Screenshots

Screenshots will be added after the UI phase. Phase 0 intentionally contains only a minimal shell.

## Security Model

watch wallet is a watch-only Bitcoin wallet dashboard.
It never asks for, stores, or transmits private keys or seed phrases.
Do not enter your seed phrase or private key anywhere in this application.

Extended public keys such as xpub, ypub, and zpub can reveal your full wallet history.
watch wallet stores them only in an encrypted server-side wallet store.
Protect access to the Raspberry Pi, browser profile, and device.

watch wallet은 보기전용 비트코인 지갑 대시보드입니다.
이 앱은 시드 문구나 개인키를 절대 요구하지 않습니다.
절대 이 앱에 시드 문구나 개인키를 입력하지 마십시오.

xpub, ypub, zpub은 지갑 전체 거래내역을 노출할 수 있는 민감한 정보입니다.
watch wallet은 이를 Raspberry Pi 서버의 암호화된 지갑 저장소에만 저장합니다.
Raspberry Pi, 기기, 브라우저 프로필 접근 권한을 안전하게 보호하십시오.

The server must not persist seed phrases, private keys, raw xpubs, raw ypubs, raw zpubs, full address lists, transaction memos, or wallet labels. The default operating model is local network, Tailscale, or Tor access. General internet port forwarding is not recommended.

Future sending features must use a PSBT-only workflow. watch wallet may later help select UTXOs, set recipients, choose fees, choose change addresses, create PSBTs, import signed PSBTs, extract raw transactions, and broadcast through the user's node. It must not sign transactions itself. Signing must happen in an external signer such as Nunchuk, Sparrow, or a hardware wallet.

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

Wallet registration is part of Phase 2. Address derivation and balance lookup are planned for later phases.

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
- Phase 4: balance lookup through Mempool API first
- Phase 5: transaction history
- Phase 6: calm Sparrow-inspired dark dashboard UI
- Phase 7: settings and encrypted wallet backup/import
- Phase 8: PSBT-oriented sending and broadcast workflow without private key handling

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security-sensitive changes must preserve the watch-only model.

## License

MIT License. See [LICENSE](LICENSE).
