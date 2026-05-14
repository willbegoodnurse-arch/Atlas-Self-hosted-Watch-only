# Camera QR Scanning and Secure Contexts

Atlas can import watch-only wallet exports by paste, file, or QR scan. Camera QR scanning depends on browser camera APIs, and modern browsers restrict those APIs to secure contexts.

If Atlas is opened at a plain LAN HTTP origin such as:

```text
http://172.30.1.50:3000
```

Brave, Chrome, and similar browsers may disable camera access completely. The browser camera permission toggle can appear unavailable. This is browser security behavior, not necessarily an Atlas bug.

Text PSBT import/export and watch-only text/file import remain available without camera access.

## Why This Happens

Browsers generally allow camera access on:

- `https://` origins.
- `http://localhost` and `http://127.0.0.1`.

Browsers often block camera access on:

- plain `http://` LAN IP addresses.
- plain `http://` hostnames that are not treated as trustworthy.

Do not disable browser security globally to work around this.

## Option A: Use Text Fallback

This is the simplest and safest path.

- Paste watch-only wallet exports into Atlas.
- Paste signed PSBT text into the verifier.
- Copy unsigned PSBT text from the builder.
- Use file import/export when available.

No HTTPS setup is required for the text flow.

## Option B: Tailscale Serve

If you already use Tailscale, Tailscale Serve can provide an HTTPS tailnet URL while keeping access private to your tailnet.

Example:

```bash
tailscale serve --https=443 http://127.0.0.1:3000
```

Before enabling it:

- Run `tailscale serve --help` on the Raspberry Pi and verify the current command syntax.
- Confirm who can access the tailnet URL.
- Do not expose the Atlas API or Bitcoin Core RPC publicly.
- Keep Bitcoin Core RPC on localhost or a tightly restricted private interface.

Tailscale command syntax changes over time, so treat the command above as an example, not a universal install script.

## Option C: SSH Localhost Forwarding

For local testing from your PC, forward the Raspberry Pi web and API ports:

```bash
ssh -L 3000:localhost:3000 -L 3011:localhost:3011 hodlcrabs@172.30.1.50
```

Then open:

```text
http://localhost:3000
```

Browsers usually treat `localhost` as a secure context for camera access. Keep the SSH session open while testing.

Important: Atlas now supports same-origin API mode. Prefer `NEXT_PUBLIC_API_URL=/api` with `INTERNAL_API_URL` pointing from the web server to the API. If the web app was built in legacy direct mode with `NEXT_PUBLIC_API_URL=http://172.30.1.50:3011`, the browser may still call the LAN API directly. For clean localhost testing, rebuild/configure Atlas for same-origin mode or use the forwarded localhost API URL.

## Option D: HTTPS Reverse Proxy

Advanced operators can place Caddy, nginx, or another reverse proxy in front of Atlas.

Guidelines:

- Use HTTPS with a local domain, Tailscale DNS name, or other private name.
- Keep Atlas access private unless you intentionally harden the deployment.
- Keep the API protected by the same access model.
- Never expose Bitcoin Core RPC port `8332` publicly.
- Keep `WEB_ORIGIN`, `NEXT_PUBLIC_API_URL=/api`, `INTERNAL_API_URL`, and cookie settings aligned with the HTTPS origin.

Do not expose Atlas publicly just to make camera access work.

## What Not To Do

- Do not disable browser security globally.
- Do not use insecure-origin browser flags as normal operation.
- Do not expose ports `3000`, `3011`, or `8332` to the public internet just for QR scanning.
- Do not share `.env`, RPC credentials, seed phrases, private keys, or full xpub values.

## API Origin

For camera-friendly HTTPS deployments, prefer the same-origin API proxy documented in [same-origin-api-proxy.md](same-origin-api-proxy.md). This keeps the browser on one web origin and prepares the API port to be bound to localhost or blocked from the LAN.
