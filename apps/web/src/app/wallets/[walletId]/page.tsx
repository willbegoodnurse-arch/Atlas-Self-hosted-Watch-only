import { normalizeApiUrl } from "../../api-url";
import { AuthShell } from "../../phase-one-auth";

const apiUrl = normalizeApiUrl(process.env.NEXT_PUBLIC_API_URL);

export default async function WalletDetailPage({
  params
}: {
  params: Promise<{ walletId: string }>;
}) {
  const { walletId } = await params;
  return <AuthShell apiUrl={apiUrl} initialWalletId={walletId} />;
}
