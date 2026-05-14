# Bitcoin Core RPC Live Wiring

This guide wires Atlas to a real Raspberry Pi Bitcoin Core RPC setup for safe diagnostics only. Do not broadcast in this phase. Do not run `sendrawtransaction`.

Target Raspberry Pi:

```text
hodlcrabs@172.30.1.50
```

## 1. SSH To The Raspberry Pi

```bash
ssh hodlcrabs@172.30.1.50
```

## 2. Update Atlas

```bash
cd ~/watch-wallet
git pull
npm install
npm run build --workspace=packages/bitcoin
npm run build --workspace=apps/api
npm run build --workspace=apps/web
```

## 3. Restart Existing systemd Services

```bash
sudo systemctl restart atlas-api
sudo systemctl restart atlas-web
sudo systemctl status atlas-api --no-pager
sudo systemctl status atlas-web --no-pager
```

## 4. Confirm Atlas Works With Broadcast Disabled

These unauthenticated curl commands may return `401` if the endpoint requires an authenticated Atlas session. That is expected. The important check is that broadcast remains disabled until the operator intentionally enables it in `.env`.

```bash
curl http://localhost:3011/api/broadcast/status
curl http://localhost:3011/api/broadcast/core/status
```

Expected safe state before enabling:

```json
{
  "enabled": false,
  "backend": "disabled",
  "configured": false
}
```

No response should include RPC username, RPC password, full RPC URL, wallet data, xpubs, or txHex.

## 5. Inspect Bitcoin Core RPC Settings

Check the actual Bitcoin Core config path. Common locations:

```text
~/.bitcoin/bitcoin.conf
/home/hodlcrabs/.bitcoin/bitcoin.conf
```

Inspect only the relevant keys:

```bash
grep -E "^(server|rpcbind|rpcallowip|rpcport|rpcuser|rpcpassword)=" ~/.bitcoin/bitcoin.conf
```

Security rules:

- Do not paste `rpcpassword` into chat.
- Do not screenshot `rpcpassword`.
- Do not commit `bitcoin.conf`.
- Do not expose Bitcoin Core RPC port `8332` publicly.

## 6. Test Bitcoin Core RPC Locally Without Broadcasting

Safe local check:

```bash
bitcoin-cli getblockchaininfo
```

If `bitcoin-cli` needs an explicit config:

```bash
bitcoin-cli -conf=/home/hodlcrabs/.bitcoin/bitcoin.conf getblockchaininfo
```

Safe curl check from the Atlas host:

```bash
curl --user RPCUSER:RPCPASSWORD \
  --data-binary '{"jsonrpc":"1.0","id":"atlas-test","method":"getblockchaininfo","params":[]}' \
  -H 'content-type: text/plain;' \
  http://127.0.0.1:8332/
```

This is safe because it calls `getblockchaininfo`. Do not run `sendrawtransaction` in this phase.

## 7. Update Atlas .env Only After Core RPC Works

Edit the Atlas API environment file used by the running service. Use real values only on the Raspberry Pi, never in docs or Git:

```env
BROADCAST_BACKEND=core
CORE_RPC_URL=http://127.0.0.1:8332
CORE_RPC_USERNAME=<your_rpc_user>
CORE_RPC_PASSWORD=<your_rpc_password>
CORE_RPC_TIMEOUT_MS=10000
```

Rules:

- `.env` must remain ignored by Git.
- Use localhost if Atlas and Bitcoin Core run on the same Raspberry Pi.
- Do not put credentials in `CORE_RPC_URL`.
- Do not expose port `8332` publicly.
- If Bitcoin Core is on another LAN host, use `CORE_RPC_URL=http://<bitcoin-core-lan-ip>:8332` and restrict access with `rpcbind`, `rpcallowip`, and firewall rules.

## 8. Restart Atlas

```bash
sudo systemctl restart atlas-api
sudo systemctl restart atlas-web
```

## 9. Check Atlas Broadcast Diagnostics

From the Raspberry Pi, this may require an authenticated Atlas session:

```bash
curl http://localhost:3011/api/broadcast/status
curl http://localhost:3011/api/broadcast/core/status
```

If the endpoints return `401`, check them from a logged-in browser session or with a valid session cookie.

Expected authenticated diagnostic state after enabling:

```json
{
  "enabled": true,
  "backend": "core",
  "configured": true,
  "reachable": true,
  "chain": "main"
}
```

`chain` may be `main`, `test`, `signet`, or `regtest`. No response should display RPC credentials or the full RPC URL.

## 10. Stop Before Real Broadcast

Do not broadcast yet.

The next safe validation step should be a signet/testnet broadcast or a tiny mainnet transaction after the operator verifies:

- signed PSBT status is `valid`
- recipient is correct
- amount is correct
- change output is correct
- fee is acceptable
- there are no warnings
- the UI requires checkbox plus typing `BROADCAST`

Broadcasting is irreversible once the transaction is accepted and propagated by your node.
