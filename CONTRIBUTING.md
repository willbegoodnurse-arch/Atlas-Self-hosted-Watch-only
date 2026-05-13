# Contributing

Thanks for helping build Atlas.

This project is intentionally watch-only. Contributions must preserve these rules:

- Never add seed phrase input fields.
- Never add private key input fields.
- Never store plaintext xpub, ypub, or zpub values outside the encrypted vault.
- Keep wallet labels, notes, and watch-only metadata inside the encrypted vault.
- Treat xpub, ypub, and zpub values as sensitive wallet-history metadata.

## Development

```bash
npm install
npm run dev:web
npm run dev:api
```

Atlas is an MVP. Keep changes small, auditable, and compatible with the watch-only security model.

