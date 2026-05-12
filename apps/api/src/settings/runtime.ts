import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getMempoolApiConfig } from "../mempool/usage.js";

export type SafeRuntimeSettings = {
  apiMode: string;
  mempoolApiUrl: string;
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
  return {
    apiMode: safeEnvValue(process.env.API_MODE, "mempool"),
    mempoolApiUrl: getMempoolApiConfig().baseUrl,
    defaultNetwork: safeEnvValue(process.env.DEFAULT_NETWORK, "mainnet"),
    defaultCurrency: safeEnvValue(process.env.DEFAULT_CURRENCY, "KRW"),
    defaultUnit: safeEnvValue(process.env.DEFAULT_UNIT, "BTC")
  };
}

function safeEnvValue(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}
