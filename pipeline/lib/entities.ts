import { getJson } from './http.ts';

/** The parts of a Wikidata entity the enrichment stages use. Claims keep Wikidata's statement order. */
export interface Entity {
  id: string;
  claims: Record<string, Claim[]>;
  sitelinks: Record<string, { title: string }>;
  labels: Record<string, { value: string }>;
}

export interface Claim {
  rank: 'preferred' | 'normal' | 'deprecated';
  mainsnak: { datavalue?: { value: unknown } };
  qualifiers?: Record<string, unknown[]>;
}

const API = 'https://www.wikidata.org/w/api.php';

/** Fetches entities 50 at a time via wbgetentities; responses are cached in the repo. */
export async function getEntities(qids: string[], opts: { refresh?: boolean } = {}): Promise<Map<string, Entity>> {
  const out = new Map<string, Entity>();
  const unique = [...new Set(qids)].sort();
  for (let i = 0; i < unique.length; i += 50) {
    const ids = unique.slice(i, i + 50);
    const url = `${API}?${new URLSearchParams({
      action: 'wbgetentities',
      ids: ids.join('|'),
      props: 'claims|sitelinks|labels',
      sitefilter: 'enwiki',
      languages: 'en',
      format: 'json',
      formatversion: '2',
    })}`;
    const json = await getJson<{ entities?: Record<string, Entity> }>(url, { cache: true, maxAgeDays: 7, refresh: opts.refresh });
    if (!json?.entities) throw new Error(`wbgetentities failed for ${ids[0]}… (rate limited or unavailable; try again later)`);
    for (const [id, e] of Object.entries(json.entities)) out.set(id, e);
  }
  return out;
}

/** Non-deprecated claims of a property; preferred-rank ones first, otherwise in Wikidata's order. */
export function claims(e: Entity | undefined, prop: string): Claim[] {
  const list = (e?.claims[prop] ?? []).filter((c) => c.rank !== 'deprecated' && c.mainsnak.datavalue);
  return [...list.filter((c) => c.rank === 'preferred'), ...list.filter((c) => c.rank !== 'preferred')];
}

export const itemValue = (c: Claim) => (c.mainsnak.datavalue?.value as { id: string }).id;
export const stringValue = (c: Claim) => c.mainsnak.datavalue?.value as string;

/** Claims without an end time (P582) — still valid today. */
export const current = (c: Claim) => !c.qualifiers?.P582;
