# Tiny Amount / Testnet Signed PSBT Broadcast Validation

## Purpose

This checklist validates the existing Atlas Bitcoin Core RPC broadcast path using a signed PSBT.

Atlas does not sign transactions. Atlas only broadcasts after server-side signed PSBT verification returns `valid`, txHex is extractable, and the operator explicitly confirms the broadcast.

Prefer testnet or signet. If mainnet is used, use a tiny amount only and accept that broadcast is irreversible once accepted by your node and propagated to the network.

## Absolute Safety Rules

- Do not use a savings wallet.
- Do not use a large amount.
- Do not paste seed phrases, private keys, xprv values, or WIF keys into Atlas.
- Do not broadcast if any warning appears.
- Do not broadcast if the change address is unknown.
- Do not broadcast if the fee is unexpectedly high.
- Do not broadcast if the recipient address is uncertain.
- Do not run `bitcoin-cli sendrawtransaction` manually for this validation.
- Use Atlas UI broadcast only after verification and confirmation.
- Broadcasting is irreversible once accepted by the node or network.

## Recommended Validation Order

1. Test on testnet or signet first if available.
2. Use a fresh test wallet where possible.
3. If mainnet is used, use an amount small enough that losing it would not matter.
4. Send to your own wallet address when practical.
5. Treat the external signer as the final authority before signing.

## Pre-Flight System Checks

Run on the Raspberry Pi:

```bash
cd ~/watch-wallet
grep -E "BROADCAST_BACKEND|CORE_RPC_URL|CORE_RPC_USERNAME|CORE_RPC_TIMEOUT_MS|API_MODE|MEMPOOL_API_URL|NEXT_PUBLIC_API_URL|INTERNAL_API_URL|API_HOST" .env
```

Expected:

```env
BROADCAST_BACKEND=core
CORE_RPC_URL=http://127.0.0.1:8332
CORE_RPC_USERNAME=<set>
CORE_RPC_TIMEOUT_MS=10000
API_MODE=mempool
MEMPOOL_API_URL=http://127.0.0.1:8080/api
MEMPOOL_WEB_URL=http://raspberrypi.local:8080
NEXT_PUBLIC_API_URL=/api
INTERNAL_API_URL=http://127.0.0.1:3011
API_HOST=127.0.0.1
```

`CORE_RPC_PASSWORD` must also be set in `.env`, but do not print it, paste it into chat, or include it in screenshots.

Check Bitcoin Core:

```bash
bitcoin-cli getblockchaininfo
```

Expected:

- `chain` is the intended network.
- `initialblockdownload` is `false`.
- `blocks` and `headers` are close or equal.
- RPC is not public.

Check Atlas services:

```bash
sudo systemctl status atlas-api --no-pager
sudo systemctl status atlas-web --no-pager
```

Expected:

- Both services are active.

Check local mempool:

```bash
curl --max-time 10 http://127.0.0.1:8080/api/blocks/tip/height
```

Expected:

- A block height number.

## Broadcast Status Check

Use the logged-in Atlas UI.

Expected:

- Broadcast backend shows Bitcoin Core or core.
- Core RPC status is connected or reachable.
- Runtime settings show whether the local mempool web URL is configured, without exposing secrets.
- No RPC username, RPC password, full RPC URL, txHex, session cookie, or xpub is shown.

Authenticated status endpoints can also be checked from a session-aware browser request:

```text
GET /api/broadcast/status
GET /api/broadcast/core/status
```

Plain `curl` without a session cookie may return `401`, which is expected.

## Create Unsigned PSBT

1. Open Atlas.
2. Unlock the vault.
3. Open the target wallet.
4. Refresh UTXOs.
5. Select one small tracked UTXO.
6. Enter the recipient address.
7. Use a tiny amount.
8. Use a conservative fee rate.
9. Confirm recipient output and change output.
10. Confirm the fee is expected.
11. Create the unsigned PSBT.
12. Export the unsigned PSBT as text or QR.

For mainnet, consider sending to your own wallet address first. For testnet or signet, use faucet coins.

## Sign Externally

1. Open the external signing wallet.
2. Import the unsigned PSBT.
3. Review recipient address.
4. Review amount.
5. Review fee.
6. Review change address.
7. Sign only if every value matches your intent.
8. Export the signed PSBT.

The external signer must be the authority for final review. Atlas does not hold signing keys and cannot fix a bad signed transaction after you sign it.

## Verify Signed PSBT In Atlas

1. Paste the signed PSBT into Atlas signed PSBT verification.
2. Run verification.
3. Confirm status is `valid`.
4. Confirm expected recipient.
5. Confirm expected amount.
6. Confirm expected fee.
7. Confirm expected change output.
8. Confirm txHex is extractable.
9. Stop if any warning appears.

Do not proceed if Atlas reports `warning`, `invalid`, missing txHex, unknown change, recipient mismatch, amount mismatch, fee mismatch, or any output you do not understand.

## Broadcast From Atlas

Only proceed if all checks pass:

1. Read the irreversible broadcast warning.
2. Tick the confirmation checkbox.
3. Type `BROADCAST` exactly.
4. Click `Broadcast signed transaction`.
5. Confirm the result remains visible.
6. Record the returned txid.
7. Use `Copy txid` if needed.
8. Use `Open in local mempool` only if it points to your self-hosted mempool web URL.

Do not retry blindly if there is an error.

## Post-Broadcast Verification

Check with Bitcoin Core:

```bash
bitcoin-cli getrawtransaction <txid> true
```

Or check the self-hosted mempool web UI:

```text
http://raspberrypi.local:8080/tx/<txid>
```

Or refresh Atlas if the relevant wallet view indexes the transaction.

Expected:

- The txid is visible.
- The transaction appears in the mempool or confirms later.
- Atlas never opens a public mempool fallback automatically.
- No duplicate broadcast retry is needed unless you have confirmed it is safe.

## Abort Conditions

Abort if:

- Verification status is `warning` or `invalid`.
- Signed PSBT cannot extract txHex.
- Recipient does not match.
- Fee is too high.
- Change is unknown.
- Backend is not connected.
- Bitcoin Core RPC is unavailable.
- Local mempool is offline.
- You are unsure.

## Recovery Notes

If broadcast fails:

- Do not repeatedly click broadcast blindly.
- Copy only the sanitized error.
- Check Bitcoin Core logs.
- Check whether the tx is already known.
- Check mempool using txid if Atlas returned one.
- Do not expose raw txHex publicly.
- Do not share RPC credentials, session cookies, full xpub values, seed phrases, or private keys.
