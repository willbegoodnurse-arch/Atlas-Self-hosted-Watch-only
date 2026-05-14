# Bitcoin Core RPC Broadcast Setup

Atlas can optionally broadcast an already-signed transaction through Bitcoin Core RPC after signed PSBT verification returns `valid`. Atlas still does not sign transactions, does not hold seed phrases, and does not hold private keys.

Broadcast is disabled by default. Do not enable it until Bitcoin Core RPC is reachable only from trusted local hosts.

For the Raspberry Pi wiring checklist with exact operator commands, see [bitcoin-core-rpc-live-wiring.md](bitcoin-core-rpc-live-wiring.md).

## Recommended Topology

Run Atlas API and Bitcoin Core on the same Raspberry Pi or Linux host when possible:

```text
Atlas API -> http://127.0.0.1:8332 -> Bitcoin Core -> Bitcoin network
```

Use localhost whenever Atlas and Bitcoin Core are on the same host. If Bitcoin Core runs on another private LAN host, restrict access with `rpcbind`, `rpcallowip`, and firewall rules.

Never expose Bitcoin Core RPC port `8332` to the public internet.

## bitcoin.conf Example

Use placeholders only. Do not commit real RPC credentials.

```conf
server=1
rpcbind=127.0.0.1
rpcallowip=127.0.0.1
rpcport=8332
rpcuser=your_rpc_user
rpcpassword=your_rpc_password
```

If Atlas runs inside Docker and Bitcoin Core runs on the host or another container, the Docker bridge address may require a narrower `rpcbind` / `rpcallowip` entry. Prefer the smallest network range that works. Do not use broad public bind rules.

## Atlas .env Example

```env
BROADCAST_BACKEND=core
CORE_RPC_URL=http://127.0.0.1:8332
CORE_RPC_USERNAME=your_rpc_user
CORE_RPC_PASSWORD=your_rpc_password
CORE_RPC_TIMEOUT_MS=10000
```

Rules:

- `BROADCAST_BACKEND=disabled` is the default.
- Only `BROADCAST_BACKEND=core` enables broadcast.
- `CORE_RPC_URL` must use `http://` or `https://`.
- Do not embed credentials in `CORE_RPC_URL`; use `CORE_RPC_USERNAME` and `CORE_RPC_PASSWORD`.
- Keep `.env` out of Git.

## Safe Connectivity Checks

From the Bitcoin Core host:

```bash
bitcoin-cli getblockchaininfo
```

From the Atlas host:

```bash
curl --user your_rpc_user:your_rpc_password \
  --data-binary '{"jsonrpc":"1.0","id":"atlas-test","method":"getblockchaininfo","params":[]}' \
  -H 'content-type: text/plain;' \
  http://127.0.0.1:8332/
```

Inside Atlas, an authenticated operator can check:

```text
GET /api/broadcast/status
GET /api/broadcast/core/status
```

These status endpoints do not call `sendrawtransaction` and must not return RPC credentials or the full RPC URL.

## Before Any Live Broadcast

1. Confirm Atlas shows the signed PSBT status as `valid`.
2. Verify recipient, amount, change output, and fee.
3. Confirm there are no warnings.
4. Confirm Bitcoin Core RPC is your own trusted node.
5. Prefer testnet/signet first. If using mainnet, use a tiny amount first.
6. Read the irreversible broadcast warning.
7. Check the confirmation box.
8. Type `BROADCAST`.
9. Broadcast only when you intentionally want to submit the transaction.
10. Record the returned txid.

Do not run `sendrawtransaction` manually with real transaction hex unless you intentionally want to broadcast.

## Security Warnings

- Bitcoin Core RPC is powerful.
- Do not expose port `8332` publicly.
- Do not screenshot or share `.env`.
- Keep RPC credentials out of Git, tickets, chat logs, and screenshots.
- A compromised Raspberry Pi with broadcast enabled could attempt to submit already-signed transactions.
- Broadcast is irreversible after the transaction is accepted and propagated by your node.
- Public mempool broadcast, Fulcrum broadcast, Electrum broadcast, and self-hosted mempool broadcast are not implemented.
