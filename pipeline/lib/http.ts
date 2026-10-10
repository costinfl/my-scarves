import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { readJson, writeJson } from './json.ts';
import { paths } from './paths.ts';
import { USER_AGENT } from './wikidata.ts';

export interface HttpResult {
  status: number;
  url: string;
  contentType: string;
  body: string;
}

export interface GetOptions {
  /** Minimum gap between requests to the same host. */
  minIntervalMs?: number;
  /** Cache the response in data/cache/http (only for small JSON APIs, never for web pages). */
  cache?: boolean;
  maxAgeDays?: number;
  refresh?: boolean;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

const lastByHost = new Map<string, number>();

/** Waits so that requests to one host are at least minIntervalMs apart. */
export async function throttleHost(url: string, minIntervalMs: number): Promise<void> {
  const host = new URL(url).host;
  const wait = (lastByHost.get(host) ?? 0) + minIntervalMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastByHost.set(host, Date.now());
}

/** GET as text with a descriptive User-Agent, per-host throttling, a timeout, and an optional repo cache. */
export async function get(url: string, opts: GetOptions = {}): Promise<HttpResult> {
  const file = join(paths.httpCache, new URL(url).host, `${createHash('sha256').update(url).digest('hex').slice(0, 16)}.json`);
  if (opts.cache && !opts.refresh) {
    const cached = readJson<(HttpResult & { fetchedAt: string }) | null>(file, null);
    const maxAge = (opts.maxAgeDays ?? 30) * 86_400_000;
    if (cached && Date.now() - Date.parse(cached.fetchedAt) < maxAge) return cached;
  }

  let res: Response;
  for (let attempt = 1; ; attempt++) {
    await throttleHost(url, opts.minIntervalMs ?? 1000);
    res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, ...opts.headers },
      redirect: 'follow',
      signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
    });
    // Rate limited or briefly unavailable: honour Retry-After, else back off 5 s, 10 s, 20 s.
    if ((res.status !== 429 && res.status !== 503) || attempt >= 4) break;
    const retryAfter = Number(res.headers.get('retry-after'));
    await res.body?.cancel();
    await new Promise((r) => setTimeout(r, Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 120) * 1000 : 2500 * 2 ** attempt));
  }
  const result: HttpResult = {
    status: res.status,
    url: res.url,
    contentType: res.headers.get('content-type') ?? '',
    body: await res.text(),
  };
  // Only successful and definitive "not found" answers are worth remembering.
  if (opts.cache && (res.ok || res.status === 404)) writeJson(file, { ...result, fetchedAt: new Date().toISOString() });
  return result;
}

export async function getJson<T>(url: string, opts: GetOptions = {}): Promise<T | undefined> {
  const r = await get(url, { ...opts, headers: { Accept: 'application/json', ...opts.headers } });
  if (r.status !== 200) return undefined;
  return JSON.parse(r.body) as T;
}

/** Binary GET for files we store in the repo (logos). */
export async function getBytes(url: string, minIntervalMs = 1000): Promise<{ status: number; contentType: string; bytes: Buffer }> {
  await throttleHost(url, minIntervalMs);
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30_000) });
  return { status: res.status, contentType: res.headers.get('content-type') ?? '', bytes: Buffer.from(await res.arrayBuffer()) };
}
