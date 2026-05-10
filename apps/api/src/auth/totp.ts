import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";
import { authConfig } from "./config.js";

export function createTotpSecret(): string {
  return generateSecret();
}

export function verifyTotpCode(secret: string, code: string): boolean {
  return verifySync({
    secret,
    token: code,
    strategy: "totp"
  }).valid;
}

export async function createTotpQr(username: string, secret: string) {
  const otpauthUrl = generateURI({
    issuer: authConfig.appName,
    label: username,
    secret,
    strategy: "totp"
  });
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 240
  });

  return {
    otpauthUrl,
    qrCodeDataUrl
  };
}
