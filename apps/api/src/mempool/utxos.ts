import {
  MEMPOOL_LOOKUP_CONCURRENCY,
  errorMessage,
  fetchMempoolJson,
  mapWithConcurrency
} from "./request.js";
import { getMempoolRequestConfig } from "./usage.js";

export type AddressUtxo = {
  txid: string;
  vout: number;
  valueSats: number;
  status: {
    confirmed: boolean;
    blockHeight: number | null;
    blockTime: number | null;
  };
};

export type WalletUtxo = {
  txid: string;
  vout: number;
  outpoint: string;
  valueSats: number;
  status: "confirmed" | "unconfirmed";
  blockHeight: number | null;
  blockTime: number | null;
  address: string;
  chain: "receive" | "change";
  index: number;
  path: string | null;
};

export type UtxoSummary = {
  totalUtxos: number;
  confirmedUtxos: number;
  unconfirmedUtxos: number;
  totalSats: number;
  confirmedSats: number;
  unconfirmedSats: number;
  largestUtxoSats: number | null;
  smallestUtxoSats: number | null;
};

export type FailedUtxoLookup = {
  address: string;
  chain: "receive" | "change";
  index: number;
  error: string;
};

export type WalletUtxosResult = {
  status: "online" | "partial" | "offline";
  utxos: WalletUtxo[];
  summary: UtxoSummary;
  failedAddresses: FailedUtxoLookup[];
};

type WalletAddress = {
  chain: "receive" | "change";
  index: number;
  address: string;
  path: string | null;
};

type FetchUtxosFn = (address: string) => Promise<unknown>;

export function parseAddressUtxo(raw: unknown): AddressUtxo | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const txid = typeof r.txid === "string" ? r.txid : null;
  const vout = typeof r.vout === "number" ? r.vout : null;
  const value = typeof r.value === "number" ? r.value : null;
  if (!txid || vout === null || value === null) {
    return null;
  }

  const rawStatus =
    typeof r.status === "object" && r.status !== null
      ? (r.status as Record<string, unknown>)
      : {};
  const confirmed = rawStatus.confirmed === true;
  const blockHeight =
    typeof rawStatus.block_height === "number" ? rawStatus.block_height : null;
  const blockTime =
    typeof rawStatus.block_time === "number" ? rawStatus.block_time : null;

  return {
    txid,
    vout,
    valueSats: value,
    status: { confirmed, blockHeight, blockTime }
  };
}

export function parseAddressUtxoArray(raw: unknown): AddressUtxo[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const result: AddressUtxo[] = [];
  for (const item of raw) {
    const parsed = parseAddressUtxo(item);
    if (parsed) {
      result.push(parsed);
    }
  }
  return result;
}

export async function lookupAddressUtxos(
  address: string,
  options: { fetchUtxosFn?: FetchUtxosFn } = {}
): Promise<AddressUtxo[] | null> {
  const { url } = getMempoolRequestConfig();
  const fetchFn =
    options.fetchUtxosFn ??
    ((addr) => fetchMempoolJson(`${url}/address/${addr}/utxo`));
  try {
    const raw = await fetchFn(address);
    return parseAddressUtxoArray(raw);
  } catch {
    return null;
  }
}

export async function lookupWalletUtxos(
  walletAddresses: WalletAddress[],
  options: {
    fetchUtxosFn?: FetchUtxosFn;
    concurrency?: number;
    includeUnconfirmed?: boolean;
  } = {}
): Promise<WalletUtxosResult> {
  const includeUnconfirmed = options.includeUnconfirmed ?? true;
  const failedAddresses: FailedUtxoLookup[] = [];

  type LookupResult =
    | { ok: true; addr: WalletAddress; utxos: AddressUtxo[] }
    | { ok: false; addr: WalletAddress; error: string };

  const results = await mapWithConcurrency(
    walletAddresses,
    options.concurrency ?? MEMPOOL_LOOKUP_CONCURRENCY,
    async (addr): Promise<LookupResult> => {
      const utxos = await lookupAddressUtxos(addr.address, {
        fetchUtxosFn: options.fetchUtxosFn
      });
      if (utxos === null) {
        return { ok: false, addr, error: "address UTXO lookup failed" };
      }
      return { ok: true, addr, utxos };
    }
  );

  const outpointSeen = new Set<string>();
  const walletUtxos: WalletUtxo[] = [];

  for (const result of results) {
    if (!result.ok) {
      failedAddresses.push({
        address: result.addr.address,
        chain: result.addr.chain,
        index: result.addr.index,
        error: result.error
      });
      continue;
    }

    for (const utxo of result.utxos) {
      if (!includeUnconfirmed && !utxo.status.confirmed) {
        continue;
      }
      const outpoint = `${utxo.txid}:${utxo.vout}`;
      if (outpointSeen.has(outpoint)) {
        continue;
      }
      outpointSeen.add(outpoint);

      walletUtxos.push({
        txid: utxo.txid,
        vout: utxo.vout,
        outpoint,
        valueSats: utxo.valueSats,
        status: utxo.status.confirmed ? "confirmed" : "unconfirmed",
        blockHeight: utxo.status.blockHeight,
        blockTime: utxo.status.blockTime,
        address: result.addr.address,
        chain: result.addr.chain,
        index: result.addr.index,
        path: result.addr.path
      });
    }
  }

  walletUtxos.sort(compareUtxos);

  const successCount = results.length - failedAddresses.length;
  const status: WalletUtxosResult["status"] =
    failedAddresses.length === 0
      ? "online"
      : successCount === 0
        ? "offline"
        : "partial";

  return {
    status,
    utxos: walletUtxos,
    summary: buildSummary(walletUtxos),
    failedAddresses
  };
}

function compareUtxos(a: WalletUtxo, b: WalletUtxo): number {
  if (b.valueSats !== a.valueSats) {
    return b.valueSats - a.valueSats;
  }
  if (a.status === "confirmed" && b.status !== "confirmed") {
    return -1;
  }
  if (b.status === "confirmed" && a.status !== "confirmed") {
    return 1;
  }
  if (b.blockTime !== null && a.blockTime !== null) {
    return b.blockTime - a.blockTime;
  }
  return 0;
}

function buildSummary(utxos: WalletUtxo[]): UtxoSummary {
  const confirmed = utxos.filter((u) => u.status === "confirmed");
  const unconfirmed = utxos.filter((u) => u.status === "unconfirmed");
  const confirmedSats = confirmed.reduce((s, u) => s + u.valueSats, 0);
  const unconfirmedSats = unconfirmed.reduce((s, u) => s + u.valueSats, 0);
  const values = utxos.map((u) => u.valueSats);
  return {
    totalUtxos: utxos.length,
    confirmedUtxos: confirmed.length,
    unconfirmedUtxos: unconfirmed.length,
    totalSats: confirmedSats + unconfirmedSats,
    confirmedSats,
    unconfirmedSats,
    largestUtxoSats: values.length > 0 ? Math.max(...values) : null,
    smallestUtxoSats: values.length > 0 ? Math.min(...values) : null
  };
}
