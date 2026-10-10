import { get } from '../http.ts';
import { USER_AGENT } from '../wikidata.ts';
import type { FanshopInfo } from '../types.ts';

const KEYWORDS = /(^|[^a-z])(fan-?shop|shop|store|magazin(?!e)|boutique|tienda|negozio|loja|webshop|merch)/i;
const MARKETPLACES = /(^|\.)(amazon|ebay|emag|aliexpress|etsy|allegro|olx|wish|temu)\.[a-z.]+$/i;
const SHOP_PAGE =
  /(add to (cart|basket|bag)|checkout|shopping (cart|bag)|\bbasket\b|\bcart\b|co[sș] de cump|carrito|cesta|carrello|warenkorb|panier|£\s?\d|€\s?\d|\d\s?€|\d[.,]\d{2}\s?(lei|ron|eur)\b)/i;

/** Minimal robots.txt check: groups for our agent or "*", longest matching Allow/Disallow prefix wins. */
export function robotsAllows(robots: string, path: string, agent = 'my-scarves'): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let current: (typeof groups)[number] | undefined;
  let lastWasAgent = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === 'user-agent') {
      if (!lastWasAgent || !current) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'allow' || key === 'disallow') && current) {
      lastWasAgent = false;
      if (value) current.rules.push({ allow: key === 'allow', path: value });
    } else lastWasAgent = false;
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== '*' && agent.toLowerCase().includes(a)));
  const rules = (mine.length ? mine : groups.filter((g) => g.agents.includes('*'))).flatMap((g) => g.rules);
  let best: { allow: boolean; len: number } | undefined;
  for (const r of rules) {
    const pattern = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (pattern.test(path) && (!best || r.path.length > best.len)) best = { allow: r.allow, len: r.path.length };
  }
  return best?.allow ?? true;
}

const ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', '#39': "'", '#x2F': '/', '#47': '/' };
const decodeEntities = (s: string) => s.replace(/&(amp|quot|apos|lt|gt|#39|#x2F|#47);/gi, (_, e: string) => ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? _);

export interface ShopLink {
  url: string;
  score: number;
}

/** Links on a page that look like a shop, best first. Shop subdomains beat shop paths beat link text. */
export function findShopLinks(html: string, pageUrl: string): ShopLink[] {
  const found = new Map<string, number>();
  for (const m of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url: URL;
    try {
      url = new URL(decodeEntities(m[1]!.trim()), pageUrl);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(url.protocol)) continue;
    const text = m[2]!.replace(/<[^>]*>/g, ' ').trim();
    const score = KEYWORDS.test(url.hostname.split('.')[0]!) ? 3 : KEYWORDS.test(url.pathname) ? 2 : KEYWORDS.test(text) ? 1 : 0;
    if (score === 0) continue;
    // Query strings are campaign tracking; a shop subdomain is best linked at its homepage.
    const clean = score === 3 ? url.origin : `${url.origin}${url.pathname}`.replace(/\/$/, '');
    found.set(clean, Math.max(found.get(clean) ?? 0, score));
  }
  return [...found].map(([url, score]) => ({ url, score })).sort((a, b) => b.score - a.score);
}

export const isMarketplace = (url: string) => MARKETPLACES.test(new URL(url).hostname);
export const looksLikeShop = (html: string) => SHOP_PAGE.test(html);

async function allowed(url: string, robotsCache: Map<string, string>): Promise<boolean> {
  const { origin, pathname, search } = new URL(url);
  if (!robotsCache.has(origin)) {
    try {
      const r = await get(`${origin}/robots.txt`, { timeoutMs: 15_000 });
      robotsCache.set(origin, r.status === 200 ? r.body : '');
    } catch {
      robotsCache.set(origin, '');
    }
  }
  return robotsAllows(robotsCache.get(origin)!, pathname + search, USER_AGENT);
}

/**
 * Looks for the official fan shop from the club's own website: homepage -> shop-like links ->
 * the first one that answers 200 with a shop-like page becomes a `candidate` for me to confirm.
 */
export async function discoverFanshop(website: string, robotsCache: Map<string, string>): Promise<FanshopInfo> {
  const checkedAt = new Date().toISOString().slice(0, 10);
  try {
    if (!(await allowed(website, robotsCache))) return { status: 'none', checkedAt, note: 'robots.txt disallows the homepage' };
    const home = await get(website, { timeoutMs: 20_000 });
    if (home.status !== 200) return { status: 'unchecked', checkedAt, note: `homepage answered ${home.status}` };

    const links = findShopLinks(home.body, home.url);
    const marketplace = links.find((l) => isMarketplace(l.url));
    for (const link of links.filter((l) => !isMarketplace(l.url)).slice(0, 3)) {
      if (!(await allowed(link.url, robotsCache))) continue;
      const page = await get(link.url, { timeoutMs: 20_000 }).catch(() => undefined);
      // A store behind a password page (Shopify's "opening soon") is not open for business.
      const closed = page && /\/password\/?$/.test(new URL(page.url).pathname);
      if (page?.status === 200 && !closed && page.contentType.includes('html') && looksLikeShop(page.body)) {
        // Keep the link as the club publishes it: redirects often add locale or session parameters.
        return { url: link.url, status: 'candidate', checkedAt, ...(marketplace ? { note: `also links to ${marketplace.url}` } : {}) };
      }
    }
    const note = links.length === 0 ? 'no shop link on the homepage (or it is built by JavaScript)' : 'shop links found but none looked like a shop';
    return { status: 'none', checkedAt, note: marketplace ? `${note}; marketplace link not used: ${marketplace.url}` : note };
  } catch (e) {
    return { status: 'unchecked', checkedAt, note: e instanceof Error ? e.message : String(e) };
  }
}
