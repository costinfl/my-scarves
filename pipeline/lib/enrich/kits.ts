import type { Entity } from '../entities.ts';
import { getJson } from '../http.ts';
import type { ColorInfo, KitInfo } from '../types.ts';

const hexParam = (wikitext: string, name: string): string | undefined => {
  const m = wikitext.match(new RegExp(`\\|\\s*${name}\\s*=\\s*#?([0-9a-f]{6}|[0-9a-f]{3})\\s*(?=\\||\\n|}})`, 'i'));
  if (!m) return undefined;
  const hex = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!;
  return `#${hex.toUpperCase()}`;
};

/**
 * Home kit colours from the club infobox (body1 = shirt, shorts1, socks1), when given as hex.
 * Only the first kit (home); named colours and empty fields count as missing.
 */
export function parseKit(wikitext: string): Omit<KitInfo, 'source'> | undefined {
  const body = hexParam(wikitext, 'body1');
  if (!body) return undefined;
  const shorts = hexParam(wikitext, 'shorts1');
  const socks = hexParam(wikitext, 'socks1');
  return { body, ...(shorts ? { shorts } : {}), ...(socks ? { socks } : {}) };
}

/** Shirt colour first, then the first of shorts and socks that differs from it. */
export function kitColors(kit: KitInfo): ColorInfo {
  const secondary = [kit.shorts, kit.socks].find((c) => c && c !== kit.body);
  return { primary: kit.body, ...(secondary ? { secondary } : {}), source: 'kit', sourceUrl: kit.source };
}

/** Infobox of the club's English Wikipedia article (section 0 wikitext), cached like the blurbs. */
export async function fetchKit(entity: Entity | undefined, opts: { refresh?: boolean } = {}): Promise<KitInfo | undefined> {
  const title = entity?.sitelinks.enwiki?.title;
  if (!title) return undefined;
  const page = await getJson<{ parse?: { title: string; wikitext: string } }>(
    `https://en.wikipedia.org/w/api.php?action=parse&format=json&formatversion=2&prop=wikitext&section=0&redirects=1&page=${encodeURIComponent(title)}`,
    { cache: true, maxAgeDays: 90, refresh: opts.refresh, minIntervalMs: 200 },
  );
  const kit = page?.parse && parseKit(page.parse.wikitext);
  if (!kit) return undefined;
  return { ...kit, source: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.parse!.title.replace(/ /g, '_'))}` };
}
