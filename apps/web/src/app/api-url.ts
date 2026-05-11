export function normalizeApiUrl(value: string | undefined): string {
  const fallback = "http://localhost:3011";
  const trimmed = value?.trim() || fallback;
  return trimmed.replace(/\/+$/, "");
}
