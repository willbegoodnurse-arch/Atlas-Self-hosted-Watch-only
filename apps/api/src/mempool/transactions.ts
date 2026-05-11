import { getMempoolApiConfig } from "./usage.js";

export type WalletAddress = {
  chain: "receive" | "change";
  index: number;
  address: string;
};

export type RelatedAddress = {
  address: string;
  chain: "receive" | "change";
  index: number;
  role: "input" | "output";
  valueSats: number;
};

export type WalletTransaction = {
  txid: string;
  status: "confirmed" | "unconfirmed" | "unknown";
  direction: "incoming" | "outgoing" | "self" | "unknown";
  netSats: number;
  feeSats: number | null;
  blockHeight: number | null;
  blockTime: number | null;
  relatedAddresses: RelatedAddress[];
};

export type WalletTransactionsResult = {
  status: "online" | "partial" | "offline";
  transactions: WalletTransaction[];
  failedAddresses: Array<{
    address: string;
    chain: "receive" | "change";
    index: number;
    error: string;
  }>;
};

type MempoolTx = {
  txid: string;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_time?: number;
  };
  fee?: number;
  vin: Array<{
    prevout?: {
      scriptpubkey_address?: string;
      value?: number;
    };
  }>;
  vout: Array<{
    scriptpubkey_address?: string;
    value?: number;
  }>;
};

type FetchAddressTxsFn = (address: string) => Promise<unknown>;

type TxCacheEntry = {
  expiresAt: number;
  value: MempoolTx[];
};

const txCache = new Map<string, TxCacheEntry>();
const txCacheTtlMs = 20_000;
const requestTimeoutMs = 4_000;

export async function lookupWalletTransactions(
  walletAddresses: WalletAddress[],
  txLimit: number,
  options: { fetchAddressTxsFn?: FetchAddressTxsFn } = {}
): Promise<WalletTransactionsResult> {
  type LookupResult =
    | { ok: true; address: WalletAddress; txs: MempoolTx[] }
    | { ok: false; address: WalletAddress; error: string };

  const results: LookupResult[] = new Array(walletAddresses.length);
  let cursor = 0;
  const concurrency = Math.min(4, walletAddresses.length || 1);

  async function worker() {
    while (cursor < walletAddresses.length) {
      const i = cursor++;
      const addr = walletAddresses[i];
      try {
        const txs = await fetchAddressTxsResult(addr.address, options.fetchAddressTxsFn);
        results[i] = { ok: true, address: addr, txs };
      } catch (error) {
        results[i] = {
          ok: false,
          address: addr,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const failedAddresses: WalletTransactionsResult["failedAddresses"] = [];
  const txMap = new Map<string, MempoolTx>();

  for (const result of results) {
    if (!result.ok) {
      failedAddresses.push({
        address: result.address.address,
        chain: result.address.chain,
        index: result.address.index,
        error: result.error
      });
    } else {
      for (const tx of result.txs) {
        if (!txMap.has(tx.txid)) {
          txMap.set(tx.txid, tx);
        }
      }
    }
  }

  const addressSet = new Map(walletAddresses.map((a) => [a.address, a]));

  const transactions: WalletTransaction[] = [];
  for (const tx of txMap.values()) {
    transactions.push(buildWalletTransaction(tx, addressSet));
  }

  transactions.sort(compareTransactions);
  const limited = transactions.slice(0, txLimit);

  const successCount = results.length - failedAddresses.length;
  const status: WalletTransactionsResult["status"] =
    failedAddresses.length === 0
      ? "online"
      : successCount === 0
        ? "offline"
        : "partial";

  return {
    status,
    transactions: limited,
    failedAddresses
  };
}

function buildWalletTransaction(
  tx: MempoolTx,
  addressSet: Map<string, WalletAddress>
): WalletTransaction {
  const relatedAddresses: RelatedAddress[] = [];
  let ourInputSats = 0;
  let ourOutputSats = 0;
  let hasOurInput = false;
  let hasOurOutput = false;

  for (const vin of tx.vin) {
    const addr = vin.prevout?.scriptpubkey_address;
    const value = vin.prevout?.value;
    if (addr && addressSet.has(addr)) {
      const walletAddr = addressSet.get(addr)!;
      const sats = typeof value === "number" ? value : 0;
      ourInputSats += sats;
      hasOurInput = true;
      relatedAddresses.push({
        address: addr,
        chain: walletAddr.chain,
        index: walletAddr.index,
        role: "input",
        valueSats: sats
      });
    }
  }

  for (const vout of tx.vout) {
    const addr = vout.scriptpubkey_address;
    const value = vout.value;
    if (addr && addressSet.has(addr)) {
      const walletAddr = addressSet.get(addr)!;
      const sats = typeof value === "number" ? value : 0;
      ourOutputSats += sats;
      hasOurOutput = true;
      relatedAddresses.push({
        address: addr,
        chain: walletAddr.chain,
        index: walletAddr.index,
        role: "output",
        valueSats: sats
      });
    }
  }

  const netSats = ourOutputSats - ourInputSats;
  const direction: WalletTransaction["direction"] =
    netSats > 0
      ? "incoming"
      : netSats < 0
        ? "outgoing"
        : hasOurInput && hasOurOutput
          ? "self"
          : "unknown";

  const status = parseTxStatus(tx.status);

  return {
    txid: tx.txid,
    status,
    direction,
    netSats,
    feeSats: typeof tx.fee === "number" ? tx.fee : null,
    blockHeight:
      typeof tx.status?.block_height === "number" ? tx.status.block_height : null,
    blockTime:
      typeof tx.status?.block_time === "number" ? tx.status.block_time : null,
    relatedAddresses
  };
}

function parseTxStatus(
  status: MempoolTx["status"]
): WalletTransaction["status"] {
  if (!status || typeof status !== "object") {
    return "unknown";
  }
  if (status.confirmed === true) return "confirmed";
  if (status.confirmed === false) return "unconfirmed";
  return "unknown";
}

export function compareTransactions(
  a: WalletTransaction,
  b: WalletTransaction
): number {
  // Unconfirmed first
  if (a.status === "unconfirmed" && b.status !== "unconfirmed") return -1;
  if (a.status !== "unconfirmed" && b.status === "unconfirmed") return 1;
  // Then by blockTime descending
  if (a.blockTime !== null && b.blockTime !== null) {
    if (b.blockTime !== a.blockTime) return b.blockTime - a.blockTime;
  } else if (a.blockTime === null && b.blockTime !== null) {
    return -1;
  } else if (a.blockTime !== null && b.blockTime === null) {
    return 1;
  }
  // Stable tie-break: txid ascending
  return a.txid < b.txid ? -1 : a.txid > b.txid ? 1 : 0;
}

async function fetchAddressTxsResult(
  address: string,
  fetchFn?: FetchAddressTxsFn
): Promise<MempoolTx[]> {
  if (fetchFn) {
    const data = await fetchFn(address);
    return parseMempoolTxArray(data);
  }

  const config = getMempoolApiConfig();
  const cacheKey = `${config.url}|${address}`;
  const cached = txCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const url = `${config.url}/address/${encodeURIComponent(address)}/txs`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(requestTimeoutMs)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const txs = parseMempoolTxArray(await response.json());
  txCache.set(cacheKey, { expiresAt: Date.now() + txCacheTtlMs, value: txs });
  pruneExpiredTxCache();
  return txs;
}

export function parseMempoolTxArray(value: unknown): MempoolTx[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map(parseMempoolTx)
    .filter((tx): tx is MempoolTx => tx !== null);
}

export function parseMempoolTx(value: unknown): MempoolTx | null {
  if (!isRecord(value) || typeof value.txid !== "string") {
    return null;
  }

  const rawStatus = isRecord(value.status) ? value.status : {};
  const vin = Array.isArray(value.vin) ? value.vin : [];
  const vout = Array.isArray(value.vout) ? value.vout : [];

  return {
    txid: value.txid,
    status: {
      confirmed: Boolean(rawStatus.confirmed),
      block_height:
        typeof rawStatus.block_height === "number"
          ? rawStatus.block_height
          : undefined,
      block_time:
        typeof rawStatus.block_time === "number"
          ? rawStatus.block_time
          : undefined
    },
    fee: typeof value.fee === "number" ? value.fee : undefined,
    vin: vin.map((input: unknown) => {
      if (!isRecord(input)) return {};
      const prevout = isRecord(input.prevout) ? input.prevout : null;
      return {
        prevout: prevout
          ? {
              scriptpubkey_address:
                typeof prevout.scriptpubkey_address === "string"
                  ? prevout.scriptpubkey_address
                  : undefined,
              value:
                typeof prevout.value === "number" ? prevout.value : undefined
            }
          : undefined
      };
    }),
    vout: vout.map((output: unknown) => {
      if (!isRecord(output)) return {};
      return {
        scriptpubkey_address:
          typeof output.scriptpubkey_address === "string"
            ? output.scriptpubkey_address
            : undefined,
        value: typeof output.value === "number" ? output.value : undefined
      };
    })
  };
}

function pruneExpiredTxCache(): void {
  const now = Date.now();
  for (const [key, entry] of txCache.entries()) {
    if (entry.expiresAt <= now) {
      txCache.delete(key);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
