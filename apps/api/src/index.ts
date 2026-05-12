import "./env.js";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { registerAuthRoutes } from "./auth/routes.js";
import { authConfig } from "./auth/config.js";
import { requireAuthenticatedSession } from "./auth/guard.js";
import { checkMempoolHealth, getMempoolApiConfig } from "./mempool/usage.js";
import { registerRuntimeSettingsRoute } from "./settings/runtime.js";
import { registerVaultRoutes } from "./vault/routes.js";

const port = Number(process.env.API_PORT ?? 3011);
const host = process.env.API_HOST ?? "0.0.0.0";
const appName = process.env.APP_NAME ?? "watch wallet";

const server = Fastify({
  logger: true
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
  mode: "phase-5",
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

server.get("/api/status/fulcrum", async () => ({
  status: "not_configured",
  host: process.env.FULCRUM_HOST ?? "127.0.0.1",
  port: Number(process.env.FULCRUM_PORT ?? 50001),
  tlsPort: Number(process.env.FULCRUM_TLS_PORT ?? 50002),
  useTls: process.env.FULCRUM_USE_TLS === "true"
}));

await registerAuthRoutes(server);
await registerRuntimeSettingsRoute(server, requireAuthenticatedSession);
await registerVaultRoutes(server);

try {
  await server.listen({ host, port });
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
