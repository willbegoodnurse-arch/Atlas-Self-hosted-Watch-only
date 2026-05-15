type EnvLike = Record<string, string | undefined>;

const defaultSessionSecrets = new Set(["", "change_this_secret", "changeme", "change_me"]);

export function collectRuntimeSecurityWarnings(env: EnvLike = process.env): string[] {
  const warnings: string[] = [];
  const nodeEnv = env.NODE_ENV ?? "development";
  const production = nodeEnv === "production";
  const sessionSecret = env.SESSION_SECRET ?? "";
  const webOrigin = env.WEB_ORIGIN ?? "";
  const apiHost = env.API_HOST ?? "0.0.0.0";
  const cookieSecure = env.COOKIE_SECURE === "true";
  const mempoolUrl = env.MEMPOOL_API_URL ?? "";

  if (production && isWeakSessionSecret(sessionSecret)) {
    warnings.push("Production SESSION_SECRET is missing, default, or too short. Use a long random value.");
  }

  if (production && !cookieSecure) {
    warnings.push("COOKIE_SECURE is not true in production. Use HTTPS or a trusted private tunnel before enabling secure cookies.");
  }

  if (production && !webOrigin.trim()) {
    warnings.push("WEB_ORIGIN is not set in production. Set the exact web origin to restrict browser credentials.");
  }

  if (hasWildcardOrigin(webOrigin)) {
    warnings.push("WEB_ORIGIN contains a wildcard/null origin. Atlas ignores wildcard CORS origins; configure explicit trusted origins.");
  }

  if (apiHost === "0.0.0.0" || apiHost === "::") {
    warnings.push("API_HOST binds on all interfaces. This can be valid in Docker, but Raspberry Pi hardened mode should prefer 127.0.0.1 behind same-origin /api.");
  }

  if (mempoolUrl && isPublicHttpUrl(mempoolUrl)) {
    warnings.push("MEMPOOL_API_URL appears public. Atlas can run this way, but Raspberry Pi hardened deployments should prefer a local self-hosted mempool backend.");
  }

  return warnings;
}

export function parseTrustedWebOrigins(value: string | undefined): string[] {
  const configured = value
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .filter((origin) => origin !== "*" && origin !== "null");

  return configured?.length ? configured : ["http://localhost:3000", "http://localhost:3010"];
}

function isWeakSessionSecret(value: string): boolean {
  return defaultSessionSecrets.has(value.trim()) || value.trim().length < 32;
}

function hasWildcardOrigin(value: string): boolean {
  return value
    .split(",")
    .map((origin) => origin.trim())
    .some((origin) => origin === "*" || origin === "null");
}

function isPublicHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    const host = url.hostname.toLowerCase();
    return !(
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./.test(host)
    );
  } catch {
    return false;
  }
}
