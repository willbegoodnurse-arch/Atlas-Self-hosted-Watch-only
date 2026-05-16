# Self-Hosted Mempool Fee Estimates

Atlas uses the configured local mempool API for fee presets. A working block tip does not always mean fee estimates are available.

Expected local configuration:

```text
MEMPOOL_API_URL=http://127.0.0.1:8080/api
```

Atlas never falls back silently to public `mempool.space`. If local fee estimates are unavailable, manual fee entry remains usable.

## Runtime Checks

Run these on the Raspberry Pi:

```bash
cd ~/watch-wallet

curl --max-time 10 http://127.0.0.1:8080/api/blocks/tip/height
curl --max-time 10 http://127.0.0.1:8080/api/fees/precise
curl --max-time 10 http://127.0.0.1:8080/api/v1/fees/precise
curl --max-time 10 http://127.0.0.1:8080/api/fees/recommended
curl --max-time 10 http://127.0.0.1:8080/api/v1/fees/recommended
curl --max-time 10 http://127.0.0.1:8080/api/v1/fees/mempool-blocks
curl --max-time 10 http://127.0.0.1:8080/api/mempool
curl --max-time 10 http://127.0.0.1:3011/api/status/mempool
```

Expected:

- `/api/blocks/tip/height` returns a block height.
- At least one mempool-based fee source returns JSON with fee data.
- If precise/recommended endpoints return `Service Unavailable`, Atlas can derive presets from current projected mempool blocks plus current mempool minimum fee.
- `/api/v1/fees/mempool-blocks` is current projected mempool data. Atlas must not treat its medians as direct presets; sparse blocks are adjusted down.

## Atlas Behavior

Atlas tries these local paths in order:

1. `/api/v1/fees/precise`
2. `/api/fees/precise`
3. `/api/v1/fees/recommended`
4. `/api/fees/recommended`
5. `/api/v1/fees/mempool-blocks` plus `/api/mempool`
6. `/api/fees/mempool-blocks` plus `/api/v1/mempool`

If precise/recommended endpoints fail but projected mempool blocks work, Atlas marks the source as `projected-blocks` and labels it as a local mempool estimate. The calculation adjusts down when projected blocks are not full so old high medians do not become misleading Fastest presets.

If all local fee sources fail, Atlas returns:

```json
{
  "status": "unavailable",
  "estimates": null
}
```

The response includes sanitized diagnostic attempts with only endpoint paths and HTTP status codes. It does not include RPC credentials, secrets, stack traces, xpubs, transaction hex, or a public fallback URL.

## Likely Root Causes

If block tip works but fee endpoints return `Service Unavailable`, the issue is usually outside Atlas:

- mempool backend fee estimator service is still warming up
- mempool backend cannot read enough mempool data to build estimates
- mempool backend, electrs/Fulcrum, or Bitcoin Core is not fully synced
- mempool Docker services need restart or log inspection
- local mempool backend version/configuration does not expose the expected fee endpoints

Check local mempool service logs before changing Atlas:

```bash
docker ps
docker logs --tail=200 <mempool-backend-container>
docker logs --tail=200 <electrs-or-fulcrum-container>
bitcoin-cli getblockchaininfo
bitcoin-cli getmempoolinfo
```

Do not paste `.env`, RPC credentials, session cookies, full xpubs, raw PSBTs, or txHex into issue reports or chat.

## Operator Guidance

- Manual fee entry remains the safe fallback.
- Verify fee rate on the external signing device before signing.
- Do not use a public mempool fallback unless deliberately configured and documented.
- Do not expose Atlas API `3011` or Bitcoin Core RPC `8332` publicly while investigating fee estimates.
