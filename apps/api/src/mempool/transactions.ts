import {
  MEMPOOL_LOOKUP_CONCURRENCY,
  errorMessage,
  fetchMempoolJson,
  mapWithConcurrency,
  withMempoolRetry
} from "./request.js";
import { getMempoolRequestConfig } from "./usage.js";

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
  confirmations: number | null;
  relatedAddresses: RelatedAddress[];
};

export type ScanSummary = {
  receiveScanned: number;
  changeScanned: number;
  pagesPerAddress: number;
  uniqueTransactions: number;
  failedLookups: number;
  truncated: boolean;
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
  scanSummary: ScanSummary;
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
type FetchAddressTxsPageFn = (address: string, lastSeenTxid: string | null) => Promise<unknown>;

type TxCacheEntry = {
  expiresAt: number;
  value: MempoolTx[];
};

const txCache = new Map<string, TxCacheEntry>();
const txCacheTtlMs = 20_000;

export async function lookupWalletTransactions(
  walletAddresses: WalletAddress[],
  txLimit: number,
  options: {
    fetchAddressTxsFn?: FetchAddressTxsFn;
    fetchAddressTxsPageFn?: FetchAddressTxsPageFn;
    concurrency?: number;
    pages?: number;
    tipHeight?: number | null;
  } = {}
): Promise<WalletTransactionsResult> {
  const pagesPerAddress = Math.max(1, Math.min(3, options.pages ?? 1));

  type LookupResult =
    | { ok: true; address: WalletAddress; txs: MempoolTx[]; paginationFailed: boolean }
    | { ok: false; address: WalletAddress; error: string };

  const results = await mapWithConcurrency(
    walletAddresses,
    options.concurrency ?? MEMPOOL_LOOKUP_CONCURRENCY,
    async (addr): Promise<LookupResult> => {
      try {
        const { txs, paginationFailed } = await fetchAddressTxsAllPages(
          addr.address,
          pagesPerAddress,
          options
        );
        return { ok: true, address: addr, txs, paginationFailed };
      } catch (error) {
        return {
          ok: false,
          address: addr,
          error: errorMessage(error)
        };
      }
    }
  );

  const failedAddresses: WalletTransactionsResult["failedAddresses"] = [];
  const txMap = new Map<string, MempoolTx>();
  let hasPaginationFailure = false;

  for (const result of results) {
    if (!result.ok) {
      failedAddresses.push({
        address: result.address.address,
        chain: result.address.chain,
        index: result.address.index,
        error: result.error
      });
    } else {
      if (result.paginationFailed) hasPaginationFailure = true;
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
    transactions.push(buildWalletTransaction(tx, addressSet, options.tipHeight ?? null));
  }

  transactions.sort(compareTransactions);
  const truncated = transactions.length > txLimit;
  const uniqueTransactions = transactions.length;
  const limited = transactions.slice(0, txLimit);

  const successCount = results.length - failedAddresses.length;
  const status: WalletTransactionsResult["status"] =
    failedAddresses.length === 0 && !hasPaginationFailure
      ? "online"
      : successCount === 0
        ? "offline"
        : "partial";

  const scanSummary: ScanSummary = {
    receiveScanned: walletAddresses.filter((a) => a.chain === "receive").length,
    changeScanned: walletAddresses.filter((a) => a.chain === "change").length,
    pagesPerAddress,
    uniqueTransactions,
    failedLookups: failedAddresses.length,
    truncated
  };

  return {
    status,
    transactions: limited,
    failedAddresses,
    scanSummary
  };
}

function buildWalletTransaction(
  tx: MempoolTx,
  addressSet: Map<string, WalletAddress>,
  tipHeight: number | null
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
  const blockHeight =
    typeof tx.status?.block_height === "number" ? tx.status.block_height : null;

  return {
    txid: tx.txid,
    status,
    direction,
    netSats,
    feeSats: typeof tx.fee === "number" ? tx.fee : null,
    blockHeight,
    blockTime:
      typeof tx.status?.block_time === "number" ? tx.status.block_time : null,
    confirmations:
      status === "confirmed" ? calculateConfirmations(tipHeight, blockHeight) : null,
    relatedAddresses
  };
}

export function calculateConfirmations(
  tipHeight: number | null | undefined,
  blockHeight: number | null | undefined
): number | null {
  if (
    !Number.isInteger(tipHeight) ||
    !Number.isInteger(blockHeight) ||
    tipHeight === null ||
    tipHeight === undefined ||
    blockHeight === null ||
    blockHeight === undefined ||
    tipHeight < blockHeight ||
    blockHeight < 1
  ) {
    return null;
  }
  return tipHeight - blockHeight + 1;
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

async function fetchAddressTxsAllPages(
  address: string,
  pages: number,
  options: {
    fetchAddressTxsFn?: FetchAddressTxsFn;
    fetchAddressTxsPageFn?: FetchAddressTxsPageFn;
  }
): Promise<{ txs: MempoolTx[]; paginationFailed: boolean }> {
  const allTxs: MempoolTx[] = [];
  const seenTxids = new Set<string>();
  let paginationFailed = false;

  for (let pageIndex = 0; pageIndex < pages; pageIndex++) {
    const lastSeenTxid = pageIndex === 0 ? null : findLastConfirmedTxid(allTxs);

    if (pageIndex > 0 && lastSeenTxid === null) {
      break;
    }

    let pageTxs: MempoolTx[];

    try {
      if (options.fetchAddressTxsPageFn) {
        const raw = await withMempoolRetry(() =>
          options.fetchAddressTxsPageFn!(address, lastSeenTxid)
        );
        pageTxs = parseMempoolTxArray(raw);
      } else if (options.fetchAddressTxsFn) {
        if (pageIndex > 0) break;
        const raw = await withMempoolRetry(() => options.fetchAddressTxsFn!(address));
        pageTxs = parseMempoolTxArray(raw);
      } else {
        pageTxs = await fetchAddressTxsFromRealMempool(address, lastSeenTxid);
      }
    } catch (error) {
      if (pageIndex === 0) throw error;
      paginationFailed = true;
      break;
    }

    let newCount = 0;
    for (const tx of pageTxs) {
      if (!seenTxids.has(tx.txid)) {
        seenTxids.add(tx.txid);
        allTxs.push(tx);
        newCount++;
      }
    }

    if (newCount === 0) break;
  }

  return { txs: allTxs, paginationFailed };
}

function findLastConfirmedTxid(txs: MempoolTx[]): string | null {
  for (let i = txs.length - 1; i >= 0; i--) {
    if (txs[i].status.confirmed) {
      return txs[i].txid;
    }
  }
  return null;
}

async function fetchAddressTxsFromRealMempool(
  address: string,
  lastSeenTxid: string | null
): Promise<MempoolTx[]> {
  if (lastSeenTxid === null) {
    return fetchAddressTxsFirstPage(address);
  }
  const config = getMempoolRequestConfig();
  const url = `${config.url}/address/${encodeURIComponent(address)}/txs/chain/${encodeURIComponent(lastSeenTxid)}`;
  return parseMempoolTxArray(await fetchMempoolJson(url));
}

async function fetchAddressTxsFirstPage(address: string): Promise<MempoolTx[]> {
  const config = getMempoolRequestConfig();
  const cacheKey = `${config.url}|${address}`;
  const cached = txCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const url = `${config.url}/address/${encodeURIComponent(address)}/txs`;
  const txs = parseMempoolTxArray(await fetchMempoolJson(url));
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
