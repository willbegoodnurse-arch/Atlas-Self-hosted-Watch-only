# Contributing

Thanks for helping build watch wallet.

This project is intentionally watch-only. Contributions must preserve these rules:

- Never add seed phrase input fields.
- Never add private key input fields.
- Never store xpub, ypub, or zpub values on the server.
- Keep wallet labels, memos, and extended public keys in browser-owned storage by default.
- Treat xpub, ypub, and zpub values as sensitive wallet-history metadata.

## Development

```bash
npm install
npm run dev:web
npm run dev:api
```

Phase 0 only contains the repository skeleton, Docker draft, and documentation.

