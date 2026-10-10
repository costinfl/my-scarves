import { join } from 'node:path';
import { get } from './http.ts';
import { readJson, writeJson } from './json.ts';
import { paths } from './paths.ts';

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
/** P154 logo, P6364 official colour, P465 sRGB hex. Everything else is dropped before caching. */
const KEEP = ['P154', 'P6364', 'P465'];
const MAX_AGE_MS = 7 * 86_400_000;

/**
 * Fetches entities 50 at a time via wbgetentities. A full entity is ~60 KB, so only the claims
 * we use are cached in the repo (data/cache/entities/<QID>.json, ~1 KB each).
 */
export async function getEntities(qids: string[], opts: { refresh?: boolean } = {}): Promise<Map<string, Entity>> {
  const out = new Map<string, Entity>();
  const todo: string[] = [];
  for (const qid of [...new Set(qids)].sort()) {
    const cached = readJson<{ fetchedAt: string; entity: Entity } | null>(join(paths.entityCache, `${qid}.json`), null);
    if (cached && !opts.refresh && Date.now() - Date.parse(cached.fetchedAt) < MAX_AGE_MS) out.set(qid, cached.entity);
    else todo.push(qid);
  }

  for (let i = 0; i < todo.length; i += 50) {
    const ids = todo.slice(i, i + 50);
    const url = `${API}?${new URLSearchParams({
      action: 'wbgetentities',
      ids: ids.join('|'),
      props: 'claims|sitelinks|labels',
      sitefilter: 'enwiki',
      languages: 'en',
      format: 'json',
      formatversion: '2',
    })}`;
    const res = await get(url, { headers: { Accept: 'application/json' } });
    const json = res.status === 200 ? (JSON.parse(res.body) as { entities?: Record<string, Entity> }) : undefined;
    if (!json?.entities) throw new Error(`wbgetentities answered ${res.status} for ${ids[0]}… (rate limited? try again later)`);
    const fetchedAt = new Date().toISOString();
    for (const [id, e] of Object.entries(json.entities)) {
      const entity = trim(e);
      writeJson(join(paths.entityCache, `${id}.json`), { fetchedAt, entity });
      out.set(id, entity);
    }
  }
  return out;
}

function trim(e: Entity): Entity {
  return {
    id: e.id,
    claims: Object.fromEntries(
      KEEP.filter((p) => e.claims?.[p]).map((p) => [
        p,
        e.claims[p]!.map((c) => ({
          rank: c.rank,
          mainsnak: c.mainsnak.datavalue ? { datavalue: { value: c.mainsnak.datavalue.value } } : {},
          ...(c.qualifiers?.P582 ? { qualifiers: { P582: c.qualifiers.P582 } } : {}),
        })),
      ]),
    ),
    sitelinks: e.sitelinks?.enwiki ? { enwiki: { title: e.sitelinks.enwiki.title } } : {},
    labels: e.labels?.en ? { en: { value: e.labels.en.value } } : {},
  };
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
