export type BackendKind = "mempool-public" | "mempool-local" | "fulcrum" | "unknown";

/**
 * Returns true for localhost, loopback, RFC-1918, Tailscale/CGNAT (100.64/10),
 * and .local mDNS hostnames — all considered "local" for backend classification.
 */
export function isLocalMempoolUrl(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1"
  ) {
    return true;
  }

  if (hostname.endsWith(".local")) {
    return true;
  }

  const parts = hostname.split(".");
  if (parts.length === 4) {
    const nums = parts.map(Number);
    if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return false;
    }
    const [a, b] = nums;
    if (a === 10) return true;                         // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12
    if (a === 192 && b === 168) return true;            // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true;  // 100.64.0.0/10 Tailscale/CGNAT
  }

  return false;
}

export function classifyBackendKind(params: {
  apiMode: string;
  mempoolApiUrl: string;
}): BackendKind {
  const mode = params.apiMode.trim().toLowerCase();

  if (mode === "fulcrum") return "fulcrum";

  if (mode === "mempool" || mode === "mempool-public" || mode === "mempool-local") {
    return isLocalMempoolUrl(params.mempoolApiUrl) ? "mempool-local" : "mempool-public";
  }

  return "unknown";
}
