import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getMempoolApiConfig } from "../mempool/usage.js";
import { classifyBackendKind, isLocalMempoolUrl, type BackendKind } from "../mempool/backend.js";
import { getFulcrumConfig, type FulcrumRuntimeConfig } from "../fulcrum/diagnostics.js";

export type SafeRuntimeSettings = {
  apiMode: string;
  backendKind: BackendKind;
  mempoolApiUrl: string;
  mempoolApiHost: string;
  isLocalMempool: boolean;
  fulcrum: FulcrumRuntimeConfig;
  defaultNetwork: string;
  defaultCurrency: string;
  defaultUnit: string;
};

type AuthGuard = (request: FastifyRequest, reply: FastifyReply) => unknown;

export async function registerRuntimeSettingsRoute(
  server: FastifyInstance,
  requireSession: AuthGuard
): Promise<void> {
  server.get("/api/settings/runtime", async (request, reply) => {
    if (!requireSession(request, reply)) {
      return;
    }
    return reply.send(getSafeRuntimeSettings());
  });
}

export function getSafeRuntimeSettings(): SafeRuntimeSettings {
  const apiMode = safeEnvValue(process.env.API_MODE, "mempool");
  const rawUrl = process.env.MEMPOOL_API_URL ?? "http://localhost:8080/api";
  const mempoolApiUrl = getMempoolApiConfig().baseUrl;
  const backendKind = classifyBackendKind({ apiMode, mempoolApiUrl: rawUrl });
  const isLocalMempool = isLocalMempoolUrl(rawUrl);
  const mempoolApiHost = extractHost(mempoolApiUrl);

  return {
    apiMode,
    backendKind,
    mempoolApiUrl,
    mempoolApiHost,
    isLocalMempool,
    fulcrum: getFulcrumConfig(),
    defaultNetwork: safeEnvValue(process.env.DEFAULT_NETWORK, "mainnet"),
    defaultCurrency: safeEnvValue(process.env.DEFAULT_CURRENCY, "KRW"),
    defaultUnit: safeEnvValue(process.env.DEFAULT_UNIT, "BTC")
  };
}

function extractHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function safeEnvValue(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}
