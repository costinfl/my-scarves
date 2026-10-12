import type { Association } from '../types.ts';
import { qid, sparql, type SparqlOptions } from '../wikidata.ts';

/**
 * Where each club is located, as countries from the associations' list. A club counts as located
 * in a country through P17 (country) or by walking P131 (located in) from the club or its
 * headquarters (P159). UK clubs have P17 = United Kingdom, so the P131 walk is what tells
 * Wales from England.
 */
const LOCATED_IN = (clubs: string[], countries: string[]) => `
SELECT DISTINCT ?club ?country WHERE {
  VALUES ?club { ${clubs.map((q) => `wd:${q}`).join(' ')} }
  VALUES ?country { ${countries.map((q) => `wd:${q}`).join(' ')} }
  { ?club wdt:P17 ?country } UNION { ?club (wdt:P131|wdt:P159)/wdt:P131* ?country }
}`;

export interface HomeResult {
  /** Clubs whose home association differs from the association of the league they play in. */
  homes: Record<string, string>;
  /** Clubs located in several associations' countries, none of them their league's: left for review. */
  ambiguous: Record<string, string[]>;
}

/** Pure decision, given where a club is located. */
export function decideHome(leagueAssociation: string, locatedIn: string[]): string | string[] | undefined {
  if (locatedIn.length === 0 || locatedIn.includes(leagueAssociation)) return undefined;
  return locatedIn.length === 1 ? locatedIn[0] : [...locatedIn].sort();
}

export async function findHomes(
  clubs: { qid: string; association: string }[],
  associations: Association[],
  opts: SparqlOptions = {},
): Promise<HomeResult> {
  const codeByCountry = new Map(associations.filter((a) => a.country).map((a) => [a.country!, a.code]));
  const located = new Map<string, Set<string>>();
  for (let i = 0; i < clubs.length; i += 80) {
    const batch = clubs.slice(i, i + 80).map((c) => c.qid);
    const rows = await sparql(LOCATED_IN(batch, [...codeByCountry.keys()]), opts);
    for (const r of rows) {
      const club = qid(r.club);
      const code = codeByCountry.get(qid(r.country) ?? '');
      if (!club || !code) continue;
      (located.get(club) ?? located.set(club, new Set()).get(club)!).add(code);
    }
  }
  const result: HomeResult = { homes: {}, ambiguous: {} };
  for (const c of clubs) {
    const decision = decideHome(c.association, [...(located.get(c.qid) ?? [])]);
    if (typeof decision === 'string') result.homes[c.qid] = decision;
    else if (Array.isArray(decision)) result.ambiguous[c.qid] = decision;
  }
  return result;
}
