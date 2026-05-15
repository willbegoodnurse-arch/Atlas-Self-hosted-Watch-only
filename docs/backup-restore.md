# Backup / Restore / Disaster Recovery

## Purpose

Atlas is watch-only, but its wallet metadata is still sensitive.

Backups may contain extended public keys, labels, notes, addresses, transaction metadata, wallet settings, and wallet-history context. A leak can harm privacy even though the backup does not contain private keys and cannot spend funds by itself.

Protect Atlas backups as wallet-history metadata. Backup and restore procedures do not replace the seed phrase, private key, or hardware-wallet backup for the actual signing wallet. Atlas cannot recover signing secrets because it must never ingest or store them.

## What to back up

Back up these items when they exist in your deployment:

- `wallets.enc` or the configured encrypted vault data file/location.
- `.env` as a secret file.
- systemd service files for `atlas-api` and `atlas-web`.
- the repository commit hash used for the deployment.
- Bitcoin Core configuration if Atlas depends on local Core RPC.
- Fulcrum configuration if Fulcrum is part of the stack.
- mempool Docker Compose/config if a local mempool backend is used.
- local operator notes that are not public.

Important notes:

- `.env` contains secrets and must not be printed, pasted into chat, committed, or stored in a public backup.
- `wallets.enc` can reveal wallet metadata if decrypted.
- The vault password is not recoverable by Atlas.
- `wallets.enc` without the vault password may be unusable.
- The vault password should not be stored next to the backup unless it is protected separately with a strong password manager or offline procedure.

## What not to put in chat or screenshots

Never put these values in chat, screenshots, public docs, Git issues, logs, or pasted terminal output:

- seed phrase
- private keys
- WIF
- xprv/yprv/zprv
- `CORE_RPC_PASSWORD`
- `SESSION_SECRET`
- `watch_wallet_session` cookie
- TOTP secret
- vault password
- raw signed PSBT or raw txHex unless explicitly needed and sanitized
- full xpub/ypub/zpub unless intentionally shared

## Suggested backup layout

Example layout, without real secrets:

```text
atlas-backup-YYYY-MM-DD/
  repo-commit.txt
  wallets.enc
  env.redacted.example
  systemd/
    atlas-api.service
    atlas-web.service
  bitcoin-core/
    bitcoin.conf.redacted
  fulcrum/
    fulcrum.conf.redacted
  mempool/
    docker-compose.yml
  notes/
    restore-checklist.md
```

Use redacted examples for files that contain secrets. Keep the real `.env` in an encrypted backup store.

## Backup checklist

- [ ] Lock the vault or stop `atlas-api` before backup when practical.
- [ ] Confirm the vault data path, commonly `apps/api/data/wallets.enc`.
- [ ] Copy `wallets.enc` to a protected backup location.
- [ ] Back up `.env` separately as a secret file.
- [ ] Record the current Git commit hash with `git rev-parse HEAD`.
- [ ] Record whether deployment is Docker, systemd, or another process manager.
- [ ] Save systemd unit files or Docker Compose files if used.
- [ ] Save local mempool/Fulcrum/Bitcoin Core deployment notes if needed for restore.
- [ ] Do not print `.env`, RPC passwords, session secrets, TOTP secrets, vault passwords, full xpubs, raw PSBTs, or txHex.
- [ ] Verify that the backup file exists and has a plausible size.
- [ ] Store at least one backup offline or away from the Raspberry Pi.

## Example non-secret backup commands

Adjust paths for your deployment. These examples do not print `.env`.

```bash
cd ~/watch-wallet
mkdir -p ~/atlas-backups/atlas-backup-$(date +%Y-%m-%d)
git rev-parse HEAD > ~/atlas-backups/atlas-backup-$(date +%Y-%m-%d)/repo-commit.txt
cp apps/api/data/wallets.enc ~/atlas-backups/atlas-backup-$(date +%Y-%m-%d)/wallets.enc
```

If using systemd:

```bash
mkdir -p ~/atlas-backups/atlas-backup-$(date +%Y-%m-%d)/systemd
sudo cp /etc/systemd/system/atlas-api.service ~/atlas-backups/atlas-backup-$(date +%Y-%m-%d)/systemd/
sudo cp /etc/systemd/system/atlas-web.service ~/atlas-backups/atlas-backup-$(date +%Y-%m-%d)/systemd/
```

For `.env`, use an encrypted backup store or password manager export process. Do not use commands that display `.env` contents in terminal output.

## Restore checklist

- [ ] Restore only onto a trusted host.
- [ ] Install the same or a compatible Atlas commit.
- [ ] Restore `.env` from a protected secret backup without printing it.
- [ ] Restore `wallets.enc` to the configured data path.
- [ ] Restore systemd/Docker configuration if needed.
- [ ] Start `atlas-api` and `atlas-web`.
- [ ] Log in and manually unlock the vault with the original vault password.
- [ ] Confirm wallet list loads.
- [ ] Confirm xpubs remain masked by default.
- [ ] Confirm labels/notes appear as expected.
- [ ] Confirm receive addresses and PSBT creation still work.
- [ ] Confirm API `3011` and Bitcoin Core RPC `8332` remain private.

## Disaster recovery scenarios

### Lost Raspberry Pi, backup available

Set up a new Raspberry Pi or Linux host, restore `.env` securely, restore `wallets.enc`, deploy the recorded commit or a compatible newer commit, and unlock with the original vault password.

Funds are not on Atlas. Funds remain controlled by the external signing wallet. Atlas metadata is useful for wallet monitoring, labels, and PSBT workflows.

### Lost vault password

Atlas cannot recover the vault password. If the vault password is lost, the encrypted `wallets.enc` may be unusable. Rebuild the watch-only wallet metadata from the external signing wallet's xpub/descriptor export if available.

### Leaked backup

Assume wallet privacy may be affected. A leaked encrypted `wallets.enc` can be attacked offline if the vault password is weak. A leaked `.env` can expose session secrets and RPC credentials. Rotate affected server secrets and review wallet privacy impact.

### Corrupted `wallets.enc`

Stop Atlas, preserve the corrupted file for investigation, restore the latest known-good backup, and unlock with the vault password. Do not overwrite the only copy of a corrupted file until a backup is confirmed usable.

## Restore smoke test

After a restore:

- [ ] `GET /api/auth/session` through the web origin returns JSON.
- [ ] Login works.
- [ ] Vault unlock works.
- [ ] Wallets appear.
- [ ] Normal API responses do not expose full xpub/ypub/zpub.
- [ ] Receive address display works.
- [ ] Unsigned PSBT creation works with automatic or manual UTXO selection.
- [ ] Signed PSBT verification still blocks invalid/warning cases.
- [ ] Broadcast remains disabled unless intentionally configured.
- [ ] No `sendrawtransaction` command was run during restore testing.

## Future backup/export rule

Any future Atlas backup/export feature must either be encrypted or clearly marked sensitive. Plaintext metadata exports must never be presented as safe to share.
