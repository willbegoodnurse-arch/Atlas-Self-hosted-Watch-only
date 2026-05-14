import { BitcoinCoreRpcError, sendRawTransactionViaCore } from "./core-rpc.js";

export type BroadcastBackend = "disabled" | "core";

export type BroadcastStatus = {
  enabled: boolean;
  backend: BroadcastBackend;
  configured: boolean;
  message?: string;
};

export class BroadcastError extends Error {
  constructor(
    public readonly kind:
      | "disabled"
      | "missing-config"
      | "unavailable"
      | "unauthorized"
      | "rejected"
      | "already-known",
    message: string,
    public readonly rpcCode?: number,
    public readonly rpcMessage?: string
  ) {
    super(message);
  }
}

export function getBroadcastStatus(): BroadcastStatus {
  const config = getBroadcastConfig();

  if (config.backend === "disabled") {
    return {
      enabled: false,
      backend: "disabled",
      configured: false,
      message: "Broadcast backend is disabled."
    };
  }

  return {
    enabled: true,
    backend: "core",
    configured: Boolean(config.core),
    message: config.core
      ? "Bitcoin Core RPC broadcast is enabled."
      : "Bitcoin Core RPC broadcast is enabled but not fully configured."
  };
}

export async function broadcastTransaction(txHex: string): Promise<{
  backend: "core";
  txid: string;
}> {
  const config = getBroadcastConfig();

  if (config.backend === "disabled") {
    throw new BroadcastError(
      "disabled",
      "Broadcast backend is disabled. Configure Bitcoin Core RPC to broadcast."
    );
  }

  if (!config.core) {
    throw new BroadcastError(
      "missing-config",
      "Broadcast backend is not configured."
    );
  }

  try {
    const txid = await sendRawTransactionViaCore(txHex, config.core);
    return {
      backend: "core",
      txid
    };
  } catch (error) {
    if (error instanceof BitcoinCoreRpcError) {
      throw new BroadcastError(
        error.kind,
        error.message,
        error.rpcCode,
        error.rpcMessage
      );
    }
    throw new BroadcastError("unavailable", "Bitcoin Core RPC is unavailable.");
  }
}

function getBroadcastConfig():
  | { backend: "disabled"; core: null }
  | {
      backend: "core";
      core: {
        url: string;
        username: string;
        password: string;
        timeoutMs: number;
      } | null;
    } {
  const backend = parseBackend(process.env.BROADCAST_BACKEND);
  if (backend === "disabled") {
    return { backend, core: null };
  }

  const url = process.env.CORE_RPC_URL?.trim() ?? "";
  const username = process.env.CORE_RPC_USERNAME?.trim() ?? "";
  const password = process.env.CORE_RPC_PASSWORD ?? "";
  const timeoutMs = parseTimeout(process.env.CORE_RPC_TIMEOUT_MS);

  if (!url || !username || !password) {
    return { backend, core: null };
  }

  return {
    backend,
    core: {
      url,
      username,
      password,
      timeoutMs
    }
  };
}

function parseBackend(value: string | undefined): BroadcastBackend {
  return value?.trim() === "core" ? "core" : "disabled";
}

function parseTimeout(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1_000 && parsed <= 60_000 ? parsed : 10_000;
}
