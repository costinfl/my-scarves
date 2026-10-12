import type { LeagueInfo, SeedLeague } from './types.ts';
import { qid, sparql, type SparqlOptions } from './wikidata.ts';

const FOOTBALL_LEAGUE = 'Q15991303';

export interface LeagueCheck {
  seed: SeedLeague;
  ok: boolean;
  problem?: string;
  info?: LeagueInfo;
}

const LEAGUE_FACTS = (qids: string[]) => `
SELECT ?league ?label ?isFootballLeague ?participants WHERE {
  VALUES ?league { ${qids.map((q) => `wd:${q}`).join(' ')} }
  # Some big items (Bundesliga, Serie A) only carry a language-neutral "mul" label, no "en" one.
  OPTIONAL { ?league rdfs:label ?en . FILTER(LANG(?en) = "en") }
  OPTIONAL { ?league rdfs:label ?mul . FILTER(LANG(?mul) = "mul") }
  BIND(COALESCE(?en, ?mul) AS ?label)
  # Either typed as an association football league, or as a sports league whose sport (P641) is football.
  BIND(EXISTS { ?league wdt:P31/wdt:P279* wd:${FOOTBALL_LEAGUE} } || EXISTS { ?league wdt:P31/wdt:P279* wd:Q623109 ; wdt:P641 wd:Q2736 } AS ?isFootballLeague)
  OPTIONAL { ?league wdt:P1132 ?participants }
}`;

/**
 * Checks each seed league against Wikidata: the QID must exist, be an association football league,
 * and its English label (or, if it has none, its "mul" label) must equal the seed name. Never import a league that fails this.
 */
export async function checkLeagues(seeds: SeedLeague[], opts: SparqlOptions = {}): Promise<LeagueCheck[]> {
  if (seeds.length === 0) return [];
  // Labels are cheap to fetch and are the safety check, so never serve them from an old cache.
  const rows = await sparql(LEAGUE_FACTS(seeds.map((s) => s.qid)), { ...opts, maxAgeDays: opts.maxAgeDays ?? 1 });
  return seeds.map((seed) => {
    const mine = rows.filter((r) => qid(r.league) === seed.qid);
    const label = mine.find((r) => r.label)?.label;
    if (!label) return { seed, ok: false, problem: `${seed.qid} has no English or multilingual label (wrong or deleted QID?)` };
    if (!mine.some((r) => r.isFootballLeague === 'true')) {
      return { seed, ok: false, problem: `${seed.qid} "${label}" is not an association football league` };
    }
    if (label !== seed.name) {
      return { seed, ok: false, problem: `${seed.qid} label is "${label}", seed says "${seed.name}"` };
    }
    // P1132 may carry several values (one per season, unqualified); the largest is the safer expectation.
    const counts = mine.map((r) => Number(r.participants)).filter((n) => Number.isFinite(n) && n > 0);
    const info: LeagueInfo = {
      qid: seed.qid,
      association: seed.association,
      tier: seed.tier,
      label,
      ...(counts.length > 0 ? { participants: Math.max(...counts) } : {}),
    };
    return { seed, ok: true, info };
  });
}
