import path from "node:path";

export const authConfig = {
  appName: process.env.APP_NAME ?? "watch wallet",
  dataDir: process.env.DATA_DIR ?? path.resolve(process.cwd(), "data"),
  sessionCookieName: "watch_wallet_session",
  sessionSecret: process.env.SESSION_SECRET ?? "change_this_secret",
  sessionTtlMs: Number(process.env.SESSION_TTL_HOURS ?? 12) * 60 * 60 * 1000,
  cookieSecure: process.env.COOKIE_SECURE === "true",
  webOrigins: parseWebOrigins(process.env.WEB_ORIGIN)
} as const;

function parseWebOrigins(value: string | undefined): string[] {
  const configured = value
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configured?.length ? configured : ["http://localhost:3000", "http://localhost:3010"];
}
