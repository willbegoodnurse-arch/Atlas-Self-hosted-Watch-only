# Atlas

Self-hosted Bitcoin watch-only wallet for your own node.

내 노드에서 실행하는 비트코인 보기전용 지갑 대시보드.

Atlas is a self-hosted Bitcoin watch-only web wallet. It is intended for a Raspberry Pi, Docker, or local server setup where the operator wants to view wallet activity, organize watch-only metadata, build unsigned PSBTs, and verify signed PSBTs without putting signing material on the server.

The project is an MVP. It is useful for watch-only coordination, but it is not audited and should not be treated as a production-hardened custody product.

## What It Is

- A self-hosted Bitcoin watch-only wallet dashboard.
- A local web app plus API server.
- A Raspberry Pi friendly project with Docker Compose support.
- A tool for balances, UTXOs, transactions, labels, notes, unsigned PSBT creation, and signed PSBT verification.

## What It Is Not

- Not a hot wallet.
- Not a signing wallet.
- Not a custody service.
- Not an automatic or public transaction broadcast service.
- Not a seed phrase or private key manager.
- Not a replacement for a mature signer such as Sparrow, Coldcard, Passport, Keystone, SeedSigner, Jade, Krux, or another dedicated wallet.

## Core Features

- Watch-only wallet registration using xpub, ypub, zpub, tpub, upub, vpub, descriptors, and supported cold-wallet export formats.
- Encrypted server-side vault stored at `apps/api/data/wallets.enc`.
- Manual vault unlock with a vault password.
- Vault auto-lock after inactivity.
- Logout locks the vault.
- Masked extended public key display by default.
- Explicit temporary xpub reveal with rate limiting.
- Wallet dashboard with runtime diagnostics.
- Balance, UTXO, and transaction views.
- Address labels.
- UTXO notes.
- Transaction notes.
- Unsigned PSBT builder.
- Multi-select tracked UTXOs.
- Multiple recipient outputs.
- sats or BTC amount entry.
- Decimal sat/vB fee rate input.
- Fastest, Medium, and Slow fee presets from a configured mempool backend.
- Input -> output spending plan visualization.
- Unsigned PSBT base64 text export.
- Single QR export when the PSBT is small enough.
- Signed PSBT verification.
- txHex extraction only after signed PSBT verification when the PSBT is extractable.
- Optional Bitcoin Core RPC broadcast for already-signed transactions after server-side signed PSBT verification.

## Security Model

Atlas is watch-only by design.

- The app never asks for seed phrases or private keys.
- The app rejects xprv, yprv, zprv, WIF private keys, and seed phrase-looking input.
- The app never signs transactions.
- Broadcast is disabled by default. When configured, Atlas can broadcast an already-signed transaction through Bitcoin Core RPC only after server-side signed PSBT verification returns `valid`.
- Atlas does not broadcast unsigned, invalid, or warning PSBTs.
- Broadcasting is irreversible after the transaction is accepted and propagated by your node.
- Extended public keys are privacy-sensitive. Anyone with a full xpub, ypub, or zpub can monitor wallet history and future addresses.
- `wallets.enc` stores watch-only wallet data and user metadata encrypted on the server.
- The vault password is required to unlock the vault.
- The vault password is not stored in `.env`.
- The derived vault key is memory-only and is discarded when the vault locks or the process restarts.
- Normal API responses return masked extended public keys, not full xpub, ypub, or zpub values.
- Full xpub reveal is explicit, temporary, and rate-limited.
- The vault auto-locks after inactivity.
- Logout locks the vault.
- Recommended access is local network, Tailscale, or Tor.
- Do not expose the app or API publicly to the internet unless you understand the risks and add your own hardened reverse proxy, HTTPS, firewall, and access controls.

Labels and notes are user metadata only. They do not affect ownership classification, change detection, recipient detection, PSBT verification, warnings, transaction direction, UTXO validity, or any wallet security decision.

## Repository Layout

```text
apps/api      Fastify API, auth, encrypted vault, mempool lookups, PSBT logic
apps/web      Next.js web frontend
packages      Shared workspace packages
docs          MVP operation and workflow docs
```

Local server data is stored under:

```text
apps/api/data/auth.json
apps/api/data/wallets.enc
```

These files are ignored by Git. Back up `wallets.enc` securely if you need to preserve watch-only wallet records, labels, and notes.

## Development On Windows

From PowerShell:

```powershell
cd C:\Users\USER\watch-wallet
npm install
```

Create a local environment file:

```powershell
Copy-Item .env.example .env
```

Start the API:

```powershell
npm.cmd run dev --workspace=apps/api
```

In a second terminal, start the web app:

```powershell
npm.cmd run dev --workspace=apps/web
```

Open the frontend in a browser:

```text
http://localhost:3000
```

Use `npm.cmd` in PowerShell if `npm.ps1` is blocked by Windows Execution Policy. In other shells, normal `npm` commands are fine.

The API normally runs on `http://localhost:3011`. The web app normally runs on `http://localhost:3000` during development. `NEXT_PUBLIC_API_URL` must point the frontend at the API, for example:

```env
NEXT_PUBLIC_API_URL=http://localhost:3011
WEB_ORIGIN=http://localhost:3000,http://localhost:3010
COOKIE_SECURE=false
```

## Validation

Run these before releases or handoff:

```powershell
npm.cmd run typecheck --workspace=apps/web
npm.cmd run typecheck --workspace=apps/api
npm.cmd test --workspace=apps/api
npm.cmd run build --workspace=apps/web
```

`apps/web` currently has no frontend test script. Use the web typecheck plus the smoke checklist in [docs/release-checklist.md](docs/release-checklist.md).

## Docker Compose

Copy and edit the environment file:

```bash
cp .env.example .env
```

Build and start:

```bash
docker compose up --build
```

Default Docker ports:

- Web: `http://localhost:3010`
- API: `http://localhost:3011`

If you change `NEXT_PUBLIC_API_URL`, rebuild the web image because Next.js embeds public environment variables at build time.

The API container persists encrypted local data through:

```text
./apps/api/data:/app/apps/api/data
```

Docker Compose pins `DATA_DIR` to `/app/apps/api/data` inside the API container so `wallets.enc` survives restarts through that bind mount.

Basic reachability checks:

```bash
curl http://localhost:3011/health
curl http://localhost:3011/api/status
```

See [docs/raspberry-pi-deployment.md](docs/raspberry-pi-deployment.md) for Raspberry Pi deployment notes.

## Environment Variables

See [.env.example](.env.example) for the current template.

Important variables:

- `SESSION_SECRET`: required for real use. Use a long random value.
- `WEB_ORIGIN`: comma-separated frontend origins allowed by the API.
- `COOKIE_SECURE`: `false` for local HTTP development, `true` behind HTTPS in production.
- `NEXT_PUBLIC_API_URL`: API URL used by the web frontend.
- `MEMPOOL_API_URL`: mempool-compatible HTTP backend.
- `API_MODE`: currently `mempool` for normal operation. Fulcrum diagnostics exist, but balance and transaction lookups use a mempool-compatible HTTP API.
- `BROADCAST_BACKEND`: `disabled` by default. Set to `core` only when Bitcoin Core RPC broadcast is intended.
- `CORE_RPC_URL`, `CORE_RPC_USERNAME`, `CORE_RPC_PASSWORD`: Bitcoin Core RPC settings for optional broadcast. Keep credentials out of Git and never expose Core RPC publicly.
- `VAULT_AUTO_LOCK_MINUTES`: inactivity timeout for the unlocked vault.

Do not put seed phrases, private keys, xprv values, WIF keys, real wallet xpubs, or RPC passwords in `.env.example` or committed docs.

## PSBT Workflow

Unsigned PSBT creation:

1. Unlock the vault.
2. Select tracked UTXOs.
3. Add one or more recipients.
4. Choose sats or BTC for each amount.
5. Select a live fee preset or enter a manual sat/vB fee rate.
6. Review the input -> output spending plan.
7. Export the unsigned PSBT as text or a single QR if small enough.
8. Sign externally with a cold wallet that holds the private keys.

Signed PSBT verification:

1. Paste the signed PSBT into the Signed PSBT Verification panel.
2. Optionally provide expected recipient, amount, change, and fee values.
3. Review warnings and errors.
4. Verify every output.
5. Copy txHex only if the signed PSBT is extractable and you intentionally want to broadcast elsewhere.
6. If Bitcoin Core RPC broadcast is configured, explicitly confirm broadcast only after the signed PSBT is `valid`.

This app does not sign transactions. Optional broadcast is Bitcoin Core RPC only, disabled by default, irreversible after submission, and requires explicit confirmation. See [docs/psbt-workflow.md](docs/psbt-workflow.md).

## Known Limitations

- No signing.
- No public mempool broadcast.
- No Fulcrum/Electrum broadcast.
- No seed phrase support.
- No private key support.
- No xprv, yprv, zprv, or WIF support except rejection.
- Animated QR export is deferred.
- BBQr export is deferred.
- QR export works only for PSBTs small enough for a single QR.
- PSBT compatibility with every cold wallet is not guaranteed.
- Fee estimates depend on the configured mempool backend.
- Address discovery depends on scan depth and gap limit behavior.
- xpub, ypub, and zpub data has serious privacy implications.
- The vault password cannot be recovered if forgotten.
- Raspberry Pi and server security are the operator's responsibility.
- The project is not audited.

## More Docs

- [Release notes](RELEASE_NOTES.md)
- [Changelog](CHANGELOG.md)
- [Raspberry Pi deployment guide](docs/raspberry-pi-deployment.md)
- [PSBT workflow guide](docs/psbt-workflow.md)
- [Release and smoke test checklist](docs/release-checklist.md)
- [Security policy](SECURITY.md)
- [Development notes](DEVELOPMENT.md)

## License

MIT License. See [LICENSE](LICENSE).
