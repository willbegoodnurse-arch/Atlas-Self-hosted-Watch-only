import net from "node:net";
import tls from "node:tls";
import type { FastifyInstance } from "fastify";
import { errorMessage } from "../mempool/request.js";

const FULCRUM_CONNECT_TIMEOUT_MS = 4_000;

export type FulcrumRuntimeConfig = {
  host: string | null;
  port: number;
  tlsPort: number;
  useTls: boolean;
  configured: boolean;
};

export type FulcrumStatus = {
  status: "online" | "offline" | "not-configured";
  host: string | null;
  port: number;
  useTls: boolean;
  latencyMs: number | null;
  checkedAt: string;
  error: string | null;
};

type TcpConnector = (
  host: string,
  port: number,
  timeoutMs: number,
  useTls: boolean
) => Promise<void>;

export function getFulcrumConfig(): FulcrumRuntimeConfig {
  const host = process.env.FULCRUM_HOST?.trim() || null;
  const port = Number(process.env.FULCRUM_PORT ?? 50001);
  const tlsPort = Number(process.env.FULCRUM_TLS_PORT ?? 50002);
  const useTls = process.env.FULCRUM_USE_TLS === "true";
  return { host, port, tlsPort, useTls, configured: host !== null };
}

export async function checkFulcrumConnectivity(options?: {
  connector?: TcpConnector;
}): Promise<FulcrumStatus> {
  const config = getFulcrumConfig();
  const checkedAt = new Date().toISOString();
  const connect: TcpConnector = options?.connector ?? tcpConnect;

  if (!config.configured || !config.host) {
    return {
      status: "not-configured",
      host: null,
      port: config.port,
      useTls: config.useTls,
      latencyMs: null,
      checkedAt,
      error: null
    };
  }

  const connectPort = config.useTls ? config.tlsPort : config.port;
  const startedAt = Date.now();

  try {
    await connect(config.host, connectPort, FULCRUM_CONNECT_TIMEOUT_MS, config.useTls);
    return {
      status: "online",
      host: config.host,
      port: connectPort,
      useTls: config.useTls,
      latencyMs: Date.now() - startedAt,
      checkedAt,
      error: null
    };
  } catch (err) {
    return {
      status: "offline",
      host: config.host,
      port: connectPort,
      useTls: config.useTls,
      latencyMs: null,
      checkedAt,
      error: errorMessage(err)
    };
  }
}

function tcpConnect(
  host: string,
  port: number,
  timeoutMs: number,
  useTls: boolean
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    function settle(err?: Error): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve();
    }

    const timer = setTimeout(() => {
      socket.destroy();
      settle(new Error(`Connection timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    let socket: net.Socket;

    if (useTls) {
      const tlsSocket = tls.connect({ host, port, rejectUnauthorized: false }, () => {
        tlsSocket.destroy();
        settle();
      });
      socket = tlsSocket;
    } else {
      socket = net.createConnection({ host, port }, () => {
        socket.destroy();
        settle();
      });
    }

    socket.on("error", (err: Error) => settle(err));
  });
}

export async function registerFulcrumStatusRoute(
  server: FastifyInstance
): Promise<void> {
  server.get("/api/status/fulcrum", async () => {
    return checkFulcrumConnectivity();
  });
}
