import { redactSensitive } from "../vault/redact.js";

export type CoreRpcConfig = {
  url: string;
  username: string;
  password: string;
  timeoutMs: number;
};

export type CoreRpcErrorKind =
  | "unavailable"
  | "unauthorized"
  | "rejected"
  | "already-known";

export type CoreRpcChainInfo = {
  chain?: string;
  blocks?: number;
  headers?: number;
  initialBlockDownload?: boolean;
};

export class BitcoinCoreRpcError extends Error {
  constructor(
    public readonly kind: CoreRpcErrorKind,
    message: string,
    public readonly rpcCode?: number,
    public readonly rpcMessage?: string
  ) {
    super(message);
  }
}

type FetchLike = typeof fetch;

type JsonRpcResponse = {
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
  } | null;
};

export async function sendRawTransactionViaCore(
  txHex: string,
  config: CoreRpcConfig,
  fetchImpl: FetchLike = fetch
): Promise<string> {
  const payload = await callCoreRpc(
    config,
    "sendrawtransaction",
    [txHex],
    "atlas-broadcast",
    fetchImpl,
    "Bitcoin Core rejected the transaction."
  );

  if (typeof payload.result !== "string" || !/^[0-9a-fA-F]{64}$/.test(payload.result)) {
    throw new BitcoinCoreRpcError(
      "rejected",
      "Bitcoin Core rejected the transaction."
    );
  }

  return payload.result;
}

export async function checkBitcoinCoreRpc(
  config: CoreRpcConfig,
  fetchImpl: FetchLike = fetch
): Promise<CoreRpcChainInfo> {
  const payload = await callCoreRpc(
    config,
    "getblockchaininfo",
    [],
    "atlas-core-status",
    fetchImpl,
    "Bitcoin Core RPC status check failed."
  );

  if (!isRecord(payload.result)) {
    throw new BitcoinCoreRpcError(
      "unavailable",
      "Bitcoin Core RPC is unavailable."
    );
  }

  return {
    chain: readString(payload.result.chain),
    blocks: readNumber(payload.result.blocks),
    headers: readNumber(payload.result.headers),
    initialBlockDownload: readBoolean(payload.result.initialblockdownload)
  };
}

async function callCoreRpc(
  config: CoreRpcConfig,
  method: string,
  params: unknown[],
  id: string,
  fetchImpl: FetchLike,
  rejectedMessage: string
): Promise<JsonRpcResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetchImpl(config.url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`
      },
      body: JSON.stringify({
        jsonrpc: "1.0",
        id,
        method,
        params
      })
    });

    const payload = (await response.json().catch(() => null)) as JsonRpcResponse | null;

    if (response.status === 401 || response.status === 403) {
      throw new BitcoinCoreRpcError(
        "unauthorized",
        "Bitcoin Core RPC credentials were rejected."
      );
    }

    if (!response.ok) {
      throw new BitcoinCoreRpcError(
        "unavailable",
        "Bitcoin Core RPC is unavailable."
      );
    }

    if (payload?.error) {
      throw rpcErrorFromPayload(payload.error, rejectedMessage);
    }

    return payload ?? {};
  } catch (error) {
    if (error instanceof BitcoinCoreRpcError) {
      throw error;
    }

    throw new BitcoinCoreRpcError(
      "unavailable",
      "Bitcoin Core RPC is unavailable."
    );
  } finally {
    clearTimeout(timeout);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function rpcErrorFromPayload(
  error: NonNullable<JsonRpcResponse["error"]>,
  rejectedMessage: string
): BitcoinCoreRpcError {
  const code = typeof error.code === "number" ? error.code : undefined;
  const message = sanitizeRpcMessage(error.message);

  if (code === -27 || /already|known/i.test(message ?? "")) {
    return new BitcoinCoreRpcError(
      "already-known",
      "Transaction may already be known by the node.",
      code,
      message
    );
  }

  return new BitcoinCoreRpcError(
    "rejected",
    rejectedMessage,
    code,
    message
  );
}

function sanitizeRpcMessage(message: string | undefined): string | undefined {
  if (!message) {
    return undefined;
  }
  let sanitized = redactSensitive(message);
  sanitized = sanitized.replace(/\b[0-9a-fA-F]{80,}\b/g, "[HEX-REDACTED]");
  for (const secret of [process.env.CORE_RPC_USERNAME, process.env.CORE_RPC_PASSWORD]) {
    if (secret && secret.length >= 3) {
      sanitized = sanitized.split(secret).join("[REDACTED]");
    }
  }
  return sanitized.slice(0, 240);
}
