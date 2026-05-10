import { AuthShell } from "./phase-one-auth";

const apiUrl = normalizeApiUrl(process.env.NEXT_PUBLIC_API_URL);

export default function HomePage() {
  return <AuthShell apiUrl={apiUrl} />;
}

function normalizeApiUrl(value: string | undefined): string {
  const fallback = "http://localhost:3011";
  const trimmed = value?.trim() || fallback;
  return trimmed.replace(/\/+$/, "");
}
