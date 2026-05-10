import Fastify from "fastify";

const port = Number(process.env.API_PORT ?? 3011);
const host = process.env.API_HOST ?? "0.0.0.0";
const appName = process.env.APP_NAME ?? "watch wallet";

const server = Fastify({
  logger: true
});

server.get("/api/status", async () => ({
  app: appName,
  status: "ok",
  mode: "phase-0",
  watchOnly: true,
  walletFeaturesEnabled: false,
  storagePolicy: {
    serverStoresExtendedPublicKeys: false,
    serverStoresSeedPhrases: false,
    serverStoresPrivateKeys: false
  }
}));

server.get("/api/status/mempool", async () => ({
  status: "not_configured",
  url: process.env.MEMPOOL_API_URL ?? "http://localhost:8080/api"
}));

server.get("/api/status/fulcrum", async () => ({
  status: "not_configured",
  host: process.env.FULCRUM_HOST ?? "127.0.0.1",
  port: Number(process.env.FULCRUM_PORT ?? 50001),
  tlsPort: Number(process.env.FULCRUM_TLS_PORT ?? 50002),
  useTls: process.env.FULCRUM_USE_TLS === "true"
}));

try {
  await server.listen({ host, port });
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
