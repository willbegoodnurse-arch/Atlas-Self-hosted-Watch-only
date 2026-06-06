import "./env.js";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { registerAuthRoutes } from "./auth/routes.js";
import { authConfig } from "./auth/config.js";
import { requireAuthenticatedSession } from "./auth/guard.js";
import { lookupFeeEstimateResult } from "./mempool/fees.js";
import { registerMarketRoutes } from "./market/btc-krw.js";
import { checkMempoolHealth, getMempoolApiConfig } from "./mempool/usage.js";
import { registerRuntimeSettingsRoute } from "./settings/runtime.js";
import { registerVaultRoutes } from "./vault/routes.js";
import { registerFulcrumStatusRoute } from "./fulcrum/diagnostics.js";
import { registerBroadcastRoutes } from "./broadcast/routes.js";
import { redactSensitive } from "./vault/redact.js";
import { collectRuntimeSecurityErrors, collectRuntimeSecurityWarnings } from "./security/runtime-warnings.js";
import { registerTrustedOriginGuard } from "./security/trusted-origin.js";

const port = Number(process.env.API_PORT ?? 3011);
const host = process.env.API_HOST ?? "0.0.0.0";
const appName = process.env.APP_NAME ?? "Atlas";

const server = Fastify({
  logger: {
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        'req.headers["x-api-key"]',
        "req.body.password",
        "req.body.passwordConfirm",
        "req.body.vaultPassword",
        "req.body.totpCode",
        "req.body.importText",
        "req.body.extendedPublicKey",
        "req.body.psbtBase64"
      ],
      censor: "[REDACTED]"
    },
    serializers: {
      err(error: Error) {
        return {
          type: error?.constructor?.name ?? "Error",
          message: redactSensitive(error?.message ?? String(error)),
          stack: redactSensitive(error?.stack ?? "")
        };
      }
    }
  }
});

server.addHook("onRequest", async (_request, reply) => {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("Referrer-Policy", "no-referrer");
  reply.header("X-Frame-Options", "DENY");
  reply.header("Content-Security-Policy", "frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  reply.header("Permissions-Policy", "camera=(self), clipboard-read=(self), clipboard-write=(self)");
});

const runtimeSecurityErrors = collectRuntimeSecurityErrors();
for (const error of runtimeSecurityErrors) {
  server.log.error({ event: "runtime_security_error" }, error);
}
if (runtimeSecurityErrors.length > 0) {
  process.exit(1);
}

for (const warning of collectRuntimeSecurityWarnings()) {
  server.log.warn({ event: "runtime_security_warning" }, warning);
}

await server.register(cors, {
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  origin: authConfig.webOrigins
});

await server.register(cookie, {
  secret: authConfig.sessionSecret
});

await registerTrustedOriginGuard(server, authConfig.webOrigins);

await server.register(rateLimit, {
  max: 120,
  timeWindow: "1 minute"
});

server.get("/api/status", async () => ({
  app: appName,
  status: "ok",
  mode: "atlas-mvp",
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

  const feeLookup = await lookupFeeEstimateResult();
  if (!feeLookup.estimates) {
    return reply.send({
      status: "unavailable",
      estimates: null,
      source: feeLookup.source,
      checkedAt: feeLookup.checkedAt,
      attempts: feeLookup.attempts,
      error: "Local mempool fee estimates unavailable. Enter a custom fee rate.",
      diagnostic: feeLookup.message,
      mempool: getMempoolApiConfig()
    });
  }

  return {
    status: "online",
    estimates: feeLookup.estimates,
    source: feeLookup.source,
    checkedAt: feeLookup.checkedAt,
    attempts: feeLookup.attempts,
    diagnostic: feeLookup.message,
    mempool: getMempoolApiConfig()
  };
});

await registerAuthRoutes(server);
await registerRuntimeSettingsRoute(server, requireAuthenticatedSession);
await registerFulcrumStatusRoute(server);
await registerBroadcastRoutes(server, requireAuthenticatedSession);
await registerMarketRoutes(server);
await registerVaultRoutes(server);

try {
  await server.listen({ host, port });
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
