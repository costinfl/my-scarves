// Fallback for leagues whose season has no participant list on Wikidata: read the team table of the
// season's English Wikipedia article ("2026–27 Serie B") and resolve the linked clubs to QIDs.
// Like a JDBC fallback datasource: same output shape (a list of club QIDs) from a second source.
import { getJson } from './http.ts';
import { sparql, type Row } from './wikidata.ts';

const API = 'https://en.wikipedia.org/w/api.php';
const HTTP = { cache: true, maxAgeDays: 7, minIntervalMs: 200 } as const;

/** Enwiki articles of the league and of its seasons (P3450 "sports season of league"). */
export const SEASON_ARTICLES = (leagueQid: string) => `
SELECT ?article ?kind WHERE {
  { ?season wdt:P3450 wd:${leagueQid} . ?article schema:about ?season ; schema:isPartOf <https://en.wikipedia.org/> . BIND("season" AS ?kind) }
  UNION
  { ?article schema:about wd:${leagueQid} ; schema:isPartOf <https://en.wikipedia.org/> . BIND("league" AS ?kind) }
}`;

const titleOf = (url: string) => decodeURIComponent(url.replace(/^https:\/\/en\.wikipedia\.org\/wiki\//, '')).replace(/_/g, ' ');

/** Title prefixes of the season starting in startYear: "2026–27 …" (split season) or "2026 …" (calendar year). */
export function seasonPrefixes(startYear: number): string[] {
  const yy = String((startYear + 1) % 100).padStart(2, '0');
  return [`${startYear}–${yy} `, `${startYear}-${yy} `, `${startYear}–${startYear + 1} `, `${startYear} `];
}

/**
 * Candidate season article titles, best first: the ones Wikidata links to a season of this league,
 * then titles built from the league article ("2026–27" + "Liga Leumit"), which are checked by fetching.
 */
export function seasonTitles(rows: Row[], startYear: number): string[] {
  const prefixes = seasonPrefixes(startYear);
  const seasons = rows.filter((r) => r.kind === 'season').map((r) => titleOf(r.article!));
  const linked = prefixes.flatMap((p) => seasons.filter((t) => t.startsWith(p)));
  const league = rows.find((r) => r.kind === 'league')?.article;
  const built = league ? prefixes.map((p) => `${p}${titleOf(league).replace(/\s*\(.*\)$/, '')}`) : [];
  return [...new Set([...linked, ...built])];
}

/** Headings of sections whose tables link clubs without being the season's team list. */
const OTHER_SECTION = /personnel|kit|manag|coach|foreign|standing|table|result|statistic|scor|award|attendance|play-?off|cup/i;

/**
 * Club article titles from the season article: the first table (outside standings, results, personnel…) whose header
 * names both the team and a place (stadium, location, city…), taking the first link of every row.
 * A team-changes table (promoted/relegated) has no place column, so it is skipped by the header check; the
 * stadiums table may sit right under a "Changes" heading (2026 Erovnuli Liga), so that heading is not excluded.
 */
export function parseSeasonTeams(wikitext: string): string[] {
  const sections = wikitext.split(/^(?==+[^=\n]+=+\s*$)/m);
  for (const section of sections) {
    const heading = section.match(/^=+\s*([^=\n]+?)\s*=+/)?.[1] ?? '';
    if (OTHER_SECTION.test(heading)) continue;
    for (const table of section.match(/^\{\|[\s\S]*?^\|\}/gm) ?? []) {
      const header = table.split(/^\|-/m)[0]! + (table.match(/^!.*$/gm) ?? []).join(' ');
      // Whole words: "Capacity" must not count as "city".
      if (!/\b(teams?|clubs?)\b/i.test(header) || !/\b(stadiums?|venues?|locations?|city|cities|towns?|grounds?)\b/i.test(header)) continue;
      const titles: string[] = [];
      for (const row of table.split(/^\|-.*$/m).slice(1)) {
        const cells = row.replace(/^!.*$/gm, '');
        const link = [...cells.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)].map((m) => m[1]!.trim()).find((t) => !/^(file|image|category):/i.test(t));
        if (link && !titles.includes(link)) titles.push(link);
      }
      if (titles.length >= 6 && titles.length <= 30) return titles;
    }
  }
  return [];
}

interface ParseResponse {
  parse?: { title: string; wikitext: string };
}

interface QueryResponse {
  query?: {
    normalized?: { from: string; to: string }[];
    redirects?: { from: string; to: string }[];
    pages?: { title: string; missing?: boolean; pageprops?: { wikibase_item?: string } }[];
  };
}

/** Wikidata QIDs of Wikipedia titles, following normalisation and redirects; unknown titles are left out. */
export async function resolveTitles(titles: string[], opts: { refresh?: boolean } = {}): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const r = await getJson<QueryResponse>(
      `${API}?action=query&format=json&formatversion=2&redirects=1&prop=pageprops&ppprop=wikibase_item&titles=${encodeURIComponent(batch.join('|'))}`,
      { ...HTTP, refresh: opts.refresh },
    );
    const step = new Map([...(r?.query?.normalized ?? []), ...(r?.query?.redirects ?? [])].map((x) => [x.from, x.to]));
    const qidOf = new Map((r?.query?.pages ?? []).flatMap((p) => (p.pageprops?.wikibase_item ? [[p.title, p.pageprops.wikibase_item] as const] : [])));
    for (const t of batch) {
      let title = t;
      for (let hops = 0; step.has(title) && hops < 3; hops++) title = step.get(title)!;
      const q = qidOf.get(title);
      if (q) out.set(t, q);
    }
  }
  return out;
}

export interface SeasonPage {
  url: string;
  /** Club QIDs from the article's team table (not yet checked to be football clubs). */
  teams: string[];
}

/** The season's team list from English Wikipedia, or undefined when no article or no usable table is found. */
export async function seasonTeamsFromWikipedia(leagueQid: string, startYear: number, opts: { refresh?: boolean } = {}): Promise<SeasonPage | undefined> {
  const rows = await sparql(SEASON_ARTICLES(leagueQid), opts);
  for (const title of seasonTitles(rows, startYear)) {
    const page = await getJson<ParseResponse>(
      `${API}?action=parse&format=json&formatversion=2&prop=wikitext&redirects=1&page=${encodeURIComponent(title)}`,
      { ...HTTP, refresh: opts.refresh },
    );
    if (!page?.parse) continue;
    const titles = parseSeasonTeams(page.parse.wikitext);
    if (titles.length === 0) continue;
    const qids = await resolveTitles(titles, opts);
    const teams = [...new Set(titles.flatMap((t) => qids.get(t) ?? []))];
    if (teams.length >= 6) return { url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.parse.title.replace(/ /g, '_'))}`, teams };
  }
  return undefined;
}
