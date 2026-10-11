import { z } from 'zod';

export const BASE_URL = 'https://api.jolpi.ca/ergast/f1';
// Jolpica allows 4 req/s burst and 500/hour: serialise requests with a gap between them.
const MIN_GAP_MS = 300;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    url: string,
  ) {
    super(`Request failed (${status}) for ${url}`);
  }
}

let queue: Promise<unknown> = Promise.resolve();

function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  // Keep the chain alive whatever the outcome; the caller still sees the real result/error via `run`.
  queue = run.then(
    () => wait(MIN_GAP_MS),
    () => wait(MIN_GAP_MS),
  );
  return run;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchJson<T extends z.ZodType>(path: string, schema: T, signal?: AbortSignal): Promise<z.infer<T>> {
  const url = `${BASE_URL}${path}`;
  const res = await throttled(() => fetch(url, { signal }));
  if (!res.ok) throw new HttpError(res.status, url);
  // Throws ZodError on unexpected shape; we never hand unvalidated data to the app.
  return schema.parse(await res.json());
}

/** Fetches every page of a paginated results endpoint and merges races split across page boundaries. */
export async function fetchAllPages<T extends z.ZodType<{ MRData: { total: number } }>, I>(
  path: string,
  schema: T,
  races: (page: z.infer<T>) => { round: number; items: I[] }[],
  signal?: AbortSignal,
): Promise<{ round: number; items: I[] }[]> {
  const limit = 100;
  const byRound = new Map<number, I[]>();
  let offset = 0;
  let total = 0;
  do {
    const sep = path.includes('?') ? '&' : '?';
    const page = await fetchJson(`${path}${sep}limit=${limit}&offset=${offset}`, schema, signal);
    for (const r of races(page)) byRound.set(r.round, [...(byRound.get(r.round) ?? []), ...r.items]);
    total = page.MRData.total;
    offset += limit;
  } while (offset < total);
  return [...byRound.entries()].sort(([a], [b]) => a - b).map(([round, items]) => ({ round, items }));
}
