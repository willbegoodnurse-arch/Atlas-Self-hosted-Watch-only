export function getMempoolWebUrl(value = process.env.MEMPOOL_WEB_URL): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    if (url.username || url.password) {
      return null;
    }
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function buildMempoolTransactionUrl(txid: string, baseUrl = getMempoolWebUrl()): string | null {
  if (!baseUrl || !/^[0-9a-fA-F]{64}$/.test(txid)) {
    return null;
  }
  return `${baseUrl}/tx/${txid}`;
}
