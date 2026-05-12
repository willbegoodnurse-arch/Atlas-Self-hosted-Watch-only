export const MEMPOOL_LOOKUP_TIMEOUT_MS = 4_000;
export const MEMPOOL_REQUEST_TIMEOUT_MS = MEMPOOL_LOOKUP_TIMEOUT_MS;
export const MEMPOOL_HEALTH_TIMEOUT_MS = 15_000;
export const MEMPOOL_HEALTH_RETRY_DELAY_MS = 400;
export const MEMPOOL_LOOKUP_CONCURRENCY = 4;
export const MEMPOOL_RETRY_COUNT = 1;

export class MempoolHttpError extends Error {
  constructor(public readonly status: number) {
    super(`HTTP ${status}`);
    this.name = "MempoolHttpError";
  }
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.min(Math.max(concurrency, 1), items.length || 1);

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export async function fetchMempoolJson(url: string): Promise<unknown> {
  return withMempoolRetry(async () => {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(MEMPOOL_REQUEST_TIMEOUT_MS)
    });
    if (!response.ok) {
      throw new MempoolHttpError(response.status);
    }
    return response.json();
  });
}

export async function fetchMempoolText(url: string): Promise<string> {
  return withMempoolRetry(async () => {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(MEMPOOL_REQUEST_TIMEOUT_MS)
    });
    if (!response.ok) {
      throw new MempoolHttpError(response.status);
    }
    return response.text();
  });
}

export async function fetchMempoolHealthText(url: string): Promise<string> {
  return withMempoolRetry(
    async () => {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(MEMPOOL_HEALTH_TIMEOUT_MS),
        headers: {
          accept: "text/plain",
          "cache-control": "no-cache"
        }
      });
      if (!response.ok) {
        throw new MempoolHttpError(response.status);
      }
      return response.text();
    },
    MEMPOOL_RETRY_COUNT,
    MEMPOOL_HEALTH_RETRY_DELAY_MS
  );
}

export async function withMempoolRetry<T>(
  operation: () => Promise<T>,
  retryCount = MEMPOOL_RETRY_COUNT,
  retryDelayMs = 0
): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= retryCount || !isRetryableMempoolError(error)) {
        throw error;
      }
      if (retryDelayMs > 0) {
        await new Promise<void>(resolve => { setTimeout(resolve, retryDelayMs); });
      }
    }
  }

  throw lastError;
}

export function isRetryableMempoolError(error: unknown): boolean {
  if (error instanceof MempoolHttpError) {
    return false;
  }
  if (!(error instanceof Error)) {
    return false;
  }

  if (error.name === "AbortError" || error.name === "TimeoutError" || error.name === "TypeError") {
    return true;
  }

  return /timeout|network|fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT/i.test(error.message);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
