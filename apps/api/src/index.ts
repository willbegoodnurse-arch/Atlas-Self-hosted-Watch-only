import "./env.js";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { registerAuthRoutes } from "./auth/routes.js";
import { authConfig } from "./auth/config.js";
import { requireAuthenticatedSession } from "./auth/guard.js";
import { lookupFeeEstimates } from "./mempool/fees.js";
import { checkMempoolHealth, getMempoolApiConfig } from "./mempool/usage.js";
import { registerRuntimeSettingsRoute } from "./settings/runtime.js";
import { registerVaultRoutes } from "./vault/routes.js";
import { registerFulcrumStatusRoute } from "./fulcrum/diagnostics.js";
import { redactSensitive } from "./vault/redact.js";

const port = Number(process.env.API_PORT ?? 3011);
const host = process.env.API_HOST ?? "0.0.0.0";
const appName = process.env.APP_NAME ?? "Atlas";

const server = Fastify({
  logger: {
    redact: {
      paths: ["req.headers.authorization", "req.headers.cookie", 'req.headers["x-api-key"]'],
      censor: "[REDACTED]"
    },
    serializers: {
      err(error: Error) {
        return {
          type: error?.constructor?.name ?? "Error",
          message: redactSensitive(error?.message ?? String(error)),
          stack: error?.stack ?? ""
        };
      }
    }
  }
});

await server.register(cors, {
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  origin: authConfig.webOrigins
});

await server.register(cookie, {
  secret: authConfig.sessionSecret
});

await server.register(rateLimit, {
  max: 120,
  timeWindow: "1 minute"
});

server.get("/api/status", async () => ({
  app: appName,
  status: "ok",
  mode: "phase-21",
  watchOnly: true,
  walletFeaturesEnabled: true,
  storagePolicy: {
    serverStoresExtendedPublicKeys: "encrypted",
    serverStoresSeedPhrases: false,
    serverStoresPrivateKeys: false
  }
}));

server.get("/health", async () => ({
  status: "ok"
}));

server.get("/api/status/mempool", async () => {
  const health = await checkMempoolHealth();
  return {
    ...health,
    ...getMempoolApiConfig()
  };
});

server.get("/api/fees/recommended", async (request, reply) => {
  if (!requireAuthenticatedSession(request, reply)) {
    return;
  }

  const estimates = await lookupFeeEstimates();
  if (!estimates) {
    return reply.code(503).send({
      status: "unavailable",
      error: "Fee estimates unavailable. Enter a custom fee rate.",
      mempool: getMempoolApiConfig()
    });
  }

  return {
    status: "online",
    estimates,
    mempool: getMempoolApiConfig()
  };
});

await registerAuthRoutes(server);
await registerRuntimeSettingsRoute(server, requireAuthenticatedSession);
await registerFulcrumStatusRoute(server);
await registerVaultRoutes(server);

try {
  await server.listen({ host, port });
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
