import { normalizeApiUrl } from "./api-url";
import { AuthShell } from "./phase-one-auth";

const apiUrl = normalizeApiUrl(process.env.NEXT_PUBLIC_API_URL);

export default function HomePage() {
  return <AuthShell apiUrl={apiUrl} />;
}
