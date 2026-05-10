# Security Policy

watch wallet is a watch-only Bitcoin wallet dashboard.
It never asks for, stores, or transmits private keys or seed phrases.
Do not enter your seed phrase or private key anywhere in this application.

Extended public keys such as xpub, ypub, and zpub can reveal your full wallet history.
By default, watch wallet stores them only in your browser localStorage.
Protect access to your browser profile and device.

watch wallet은 보기전용 비트코인 지갑 대시보드입니다.
이 앱은 시드 문구나 개인키를 절대 요구하지 않습니다.
절대 이 앱에 시드 문구나 개인키를 입력하지 마십시오.

xpub, ypub, zpub은 지갑 전체 거래내역을 노출할 수 있는 민감한 정보입니다.
watch wallet은 기본적으로 이를 브라우저 localStorage에만 저장합니다.
기기와 브라우저 프로필 접근 권한을 안전하게 보호하십시오.

## Watch-Only Rules

- Seed phrase input is prohibited.
- Private key input is prohibited.
- Server-side storage of xpub, ypub, or zpub values is prohibited.
- Server-side storage of full derived address lists is prohibited by default.
- Wallet labels, address labels, and transaction memos belong in browser-local storage by default.
- The recommended access model is local network, Tailscale, or Tor.
- Public internet port forwarding is discouraged.

## Sensitive Data

xpub, ypub, and zpub values are not signing keys, but they can reveal wallet history and future receive addresses. Treat them as sensitive metadata.

## Future PSBT Sending Model

watch wallet may later support PSBT-based sending and broadcasting, but it must remain a non-signing application.

The planned future flow is:

- Select UTXOs in watch wallet.
- Enter recipient address, amount, and fee settings.
- Choose a change address.
- Create an unsigned PSBT.
- Sign the PSBT in an external signer such as Nunchuk, Sparrow, or a hardware wallet.
- Import the signed PSBT back into watch wallet.
- Extract the raw transaction.
- Broadcast through the user's own node.

watch wallet must never ask for, store, or transmit seed phrases or private keys. The server must not store raw xpub, ypub, or zpub values.

## Reporting Vulnerabilities

If this project has a private security advisory channel available, please use it. Otherwise, contact the maintainers privately before opening a public issue with exploit details.

Please include:

- Affected version or commit
- Impact
- Reproduction steps
- Whether private key, seed phrase, xpub, ypub, zpub, address, or transaction data could be exposed

## Phase 1 Status

Phase 1 implements administrator authentication only. It does not implement wallet registration, address derivation, balance lookup, transaction lookup, PSBT generation, signing, or broadcast.
