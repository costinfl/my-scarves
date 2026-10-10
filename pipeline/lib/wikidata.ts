import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { readJson, writeJson } from './json.ts';
import { paths } from './paths.ts';

export const USER_AGENT =
  'my-scarves/0.1 (https://github.com/costinfl/my-scarves; personal scarf catalogue) Node.js';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const MIN_INTERVAL_MS = 1500;
const DEFAULT_MAX_AGE_DAYS = 7;

export type Row = Record<string, string>;

interface CacheEntry {
  query: string;
  fetchedAt: string;
  rows: Row[];
}

export interface SparqlOptions {
  /** Ignore the cache and always hit the endpoint. */
  refresh?: boolean;
  maxAgeDays?: number;
  cacheDir?: string;
}

let lastRequestAt = 0;

/**
 * Runs a SPARQL SELECT and returns each binding as a flat {variable: value} map.
 * Responses are cached in the repo, keyed by a hash of the query text, and reused for
 * maxAgeDays so that re-runs are cheap and offline-friendly.
 */
export async function sparql(query: string, opts: SparqlOptions = {}): Promise<Row[]> {
  const cacheDir = opts.cacheDir ?? paths.wikidataCache;
  const key = createHash('sha256').update(query.trim()).digest('hex').slice(0, 16);
  const file = join(cacheDir, `${key}.json`);
  const cached = readJson<CacheEntry | null>(file, null);
  const maxAgeMs = (opts.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS) * 86_400_000;
  if (cached && !opts.refresh && Date.now() - Date.parse(cached.fetchedAt) < maxAgeMs) {
    return cached.rows;
  }

  const rows = await fetchRows(query);
  writeJson(file, { query: query.trim(), fetchedAt: new Date().toISOString(), rows });
  return rows;
}

async function fetchRows(query: string): Promise<Row[]> {
  for (let attempt = 1; ; attempt++) {
    await throttle();
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/sparql-results+json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ query }),
      // WDQS stops queries after 60 s; don't let a stalled connection hang a CI run.
      signal: AbortSignal.timeout(90_000),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        results: { bindings: Record<string, { value: string }>[] };
      };
      return json.results.bindings.map((b) =>
        Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])),
      );
    }
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= 4) {
      throw new Error(`SPARQL ${res.status} ${res.statusText}: ${(await res.text()).slice(0, 300)}`);
    }
    const retryAfter = Number(res.headers.get('retry-after'));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt);
  }
}

async function throttle(): Promise<void> {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const QID = /^Q[0-9]+$/;

/** "http://www.wikidata.org/entity/Q123" -> "Q123"; undefined for anything else. */
export function qid(uri: string | undefined): string | undefined {
  const id = uri?.slice(uri.lastIndexOf('/') + 1);
  return id && QID.test(id) ? id : undefined;
}

export const isQid = (s: string) => QID.test(s);

/** WKT "Point(lon lat)" -> {lat, lon}. */
export function parsePoint(wkt: string | undefined): { lat: number; lon: number } | undefined {
  const m = wkt?.match(/^Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)$/);
  if (!m) return undefined;
  return { lon: Number(m[1]), lat: Number(m[2]) };
}

/** Commons file URL from P154 -> plain file name. */
export function commonsFile(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const name = decodeURIComponent(url.slice(url.lastIndexOf('/') + 1));
  return name || undefined;
}
