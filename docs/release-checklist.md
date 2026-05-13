# Release And Smoke Test Checklist

Use this checklist before tagging, deploying, or handing off a build.

## Automated Checks

```powershell
npm.cmd run typecheck --workspace=apps/web
npm.cmd run typecheck --workspace=apps/api
npm.cmd test --workspace=apps/api
```

On non-Windows shells, `npm` is usually fine instead of `npm.cmd`.

`apps/web` currently has no frontend test script.

## Startup

- Start the API.
- Start the web app.
- Open the frontend.
- Confirm runtime status loads.
- Confirm mempool status is clear.

## Auth And Vault

- Log in.
- Complete setup if this is a fresh data directory.
- Unlock the vault.
- Confirm locked state is clear when the vault is locked.
- Confirm logout locks the vault.
- Confirm vault auto-lock still works after inactivity.

## Watch-Only Wallet

- Register a watch-only wallet.
- Confirm seed phrase input is rejected.
- Confirm private key or xprv/WIF-looking input is rejected.
- Confirm the xpub/ypub/zpub is masked in normal UI.
- Confirm full xpub reveal requires explicit action.
- Confirm normal API responses do not expose full xpub/ypub/zpub.

## Dashboard And Activity

- View wallet dashboard.
- View balance.
- View receive/change addresses.
- View UTXOs.
- View transactions.
- Confirm backend failures show specific messages and preserve existing data where expected.

## Labels And Notes

- Add, edit, and remove an address label.
- Add, edit, and remove a UTXO note.
- Add, edit, and remove a transaction note.
- Confirm HTML/script-like text is treated as plain metadata or rejected safely.
- Confirm secret-looking label/note input is rejected without echoing the secret.
- Confirm labels and notes do not alter ownership, change, recipient, or security classification.

## Unsigned PSBT Builder

- Select one tracked UTXO.
- Select multiple tracked UTXOs.
- Add one recipient.
- Add multiple recipients.
- Enter sats amount.
- Enter BTC amount.
- Enter decimal sat/vB fee rate.
- Select Fastest, Medium, and Slow fee presets when fee estimates are available.
- Confirm manual fee still works when fee estimates are unavailable.
- Review selected input total.
- Review recipient outputs, change output, and fee.
- Review the input -> output spending plan.
- Create an unsigned PSBT.
- Export text/base64 PSBT.
- Export single QR if the PSBT is small enough.
- Confirm too-large QR shows a clear message.
- Confirm Animated QR and BBQr are disabled/deferred.

## Signed PSBT Verification

- Paste a signed PSBT.
- Provide optional expected recipient, amount, change, and fee checks.
- Review output classifications.
- Review warnings and errors.
- Copy txHex only when signed/finalized/extractable.
- Confirm no broadcast button exists.

## Security Regression Check

- No signing feature exists.
- No broadcast feature exists.
- No seed phrase handling exists.
- No private key handling exists.
- No xprv/yprv/zprv/WIF handling exists except rejection.
- No full xpub leaks in normal API responses.
- No labels or notes in localStorage/sessionStorage.
- No wallet metadata stored outside encrypted vault except expected auth/session files.
- Existing xpub reveal rate limiting remains.
- Existing vault auto-lock remains.
- Logout vault lock remains.

## Backup Check

- Confirm `apps/api/data/wallets.enc` exists after wallet registration.
- Back up `wallets.enc` securely.
- Record that the vault password is required and cannot be recovered by the app.
