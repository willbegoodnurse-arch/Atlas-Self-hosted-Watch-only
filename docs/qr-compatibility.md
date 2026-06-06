# Animated QR compatibility

Atlas can export unsigned PSBTs as animated QR payloads without sending signing
data to the API. The current implementation has automated compatibility checks,
but it has not yet been validated against physical hardware wallets.

## Export formats

| Format | Payload | Target wallets | Hardware status |
| --- | --- | --- | --- |
| BBQr | `B$2P` frames, encoding `2`/base32, file type `P` | COLDCARD Q oriented flows | Not yet device-tested |
| Animated UR | `ur:crypto-psbt/...` fountain frames from `@ngraveio/bc-ur` | Keystone, Passport, Jade, SeedSigner, and other BC-UR signing flows | Not yet device-tested |

## Automated checks

The web test suite generates PSBT data at test time instead of storing fixture
exports. This keeps the checks focused on encoder behavior rather than on stale
captured strings.

BBQr tests cover:

- `B$2P` header generation.
- Two-character base36 `total` and zero-based `index` fields.
- Multi-frame index continuity.
- Round-trip recovery through the existing `decodeBase32` decoder.
- Preservation of the PSBT magic bytes `70736274ff`.
- Maximum frame count rejection above the BBQr two-character base36 limit.

Animated UR tests cover:

- `ur:crypto-psbt/...` output.
- Single-frame and multi-frame round-trip recovery through `@ngraveio/bc-ur`.
- Fragmented frame recovery when frames are received out of order.
- Preservation of the PSBT magic bytes `70736274ff`.
- A default frame-length guard for QR payload size regressions.

## Device validation checklist

Run this checklist when the relevant signing devices are available.

| Wallet | Format | Expected result | Notes |
| --- | --- | --- | --- |
| COLDCARD Q | BBQr | Recognizes the unsigned PSBT and opens the signing review flow | Confirm `B$2P` PSBT mode, not generic JSON import |
| Keystone | Animated UR | Recognizes `crypto-psbt` and opens the signing review flow | Check whether 500 ms frame cadence is comfortable |
| Passport | Animated UR | Recognizes `crypto-psbt` and opens the signing review flow | Check QR size and scan reliability |
| Jade | Animated UR | Recognizes `crypto-psbt` and opens the signing review flow | Confirm firmware support for PSBT UR |
| SeedSigner | Animated UR | Recognizes `crypto-psbt` and opens the signing review flow | Check multi-frame progress behavior |

For each device, verify:

- The unsigned PSBT is accepted without paste/file fallback.
- Recipient address, amount, fee, and change details are shown on-device.
- The device can produce a signed PSBT response.
- The signed PSBT can be imported into Atlas and passes verification before broadcast.
- Scan reliability is acceptable at the current QR size and 500 ms frame cadence.

Until this checklist is completed, Atlas should describe these exports as
standards-based and library-verified, not as hardware-certified.
