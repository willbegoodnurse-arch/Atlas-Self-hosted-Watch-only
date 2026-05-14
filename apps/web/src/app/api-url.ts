export function normalizeApiUrl(value: string | undefined): string {
  const fallback = "/api";
  const trimmed = value?.trim() || fallback;
  return trimmed.replace(/\/+$/, "");
}
