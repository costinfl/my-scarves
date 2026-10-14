// Imports clubs and home stadiums of the tier 1/2 leagues of the given associations from Wikidata.
// Usage: npm run import -- ROU ENG ESP [--refresh]
// Writes only to data/generated/ and data/cache/. Leagues that fail label verification are skipped.
import { CLUBS_IN_LEAGUE, dedupeClubs, dropChildTeams, mergeClubs, mergeStadiums, parseLeagueRows, SEASON_TEAMS, seasonFor } from './lib/clubs.ts';
import { qid } from './lib/wikidata.ts';
import { readJson, writeJson } from './lib/json.ts';
import { checkLeagues } from './lib/leagues.ts';
import { seasonTeamsFromWikipedia } from './lib/season-page.ts';
import { paths } from './lib/paths.ts';
import type { Association, Club, LeagueImportResult, LeagueInfo, SeedLeague, Stadium } from './lib/types.ts';
import { sparql } from './lib/wikidata.ts';

const args = process.argv.slice(2);
const refresh = args.includes('--refresh');
const codes = args.filter((a) => !a.startsWith('--')).map((c) => c.toUpperCase());

const associations = readJson<Association[]>(paths.associations, []);
const unknown = codes.filter((c) => !associations.some((a) => a.code === c));
if (codes.length === 0 || unknown.length > 0) {
  console.error(unknown.length ? `Unknown association code(s): ${unknown.join(', ')}` : 'Usage: npm run import -- ROU ENG ESP [--refresh]');
  process.exit(2);
}

const season = seasonFor(new Date());
const seeds = readJson<SeedLeague[]>(paths.seedLeagues, []).filter((l) => codes.includes(l.association));
const checks = await checkLeagues(seeds);

let clubs = readJson<Club[]>(paths.clubs, []);
let stadiums = readJson<Stadium[]>(paths.stadiums, []);
const leagueInfo = new Map(readJson<LeagueInfo[]>(paths.leagues, []).map((l) => [l.qid, l]));
const report = readJson<Record<string, LeagueImportResult[]>>(paths.importReport, {});

for (const code of codes) {
  const results: LeagueImportResult[] = [];
  const withEnwiki = new Set<string>();
  const parents = new Map<string, string>();
  const mine = checks.filter((c) => c.seed.association === code);
  if (mine.length === 0) console.warn(`${code}: no leagues in data/seed/leagues.json`);

  for (const check of mine) {
    const { seed } = check;
    if (!check.ok || !check.info) {
      console.warn(`${code} ${seed.name}: skipped, ${check.problem}`);
      results.push({ league: seed.qid, name: seed.name, status: `skipped: ${check.problem}`, clubs: 0, stadiums: 0, excluded: [] });
      continue;
    }
    leagueInfo.set(seed.qid, check.info);
    try {
      // Members, best source first: the season's participant list on Wikidata (exact), the team table of
      // the season's Wikipedia article, then open-ended P118 memberships (can be stale).
      const startYear = Number(season.slice(0, 4));
      let source: LeagueImportResult['source'] = 'season';
      let sourceUrl: string | undefined;
      const seasonTeams = (await sparql(SEASON_TEAMS(seed.qid, startYear), { refresh })).flatMap((r) => qid(r.team) ?? []);
      let parsed = seasonTeams.length ? parseLeagueRows(await sparql(CLUBS_IN_LEAGUE(seed.qid, seasonTeams), { refresh }), seed, season) : undefined;
      if (!parsed) {
        const page = await seasonTeamsFromWikipedia(seed.qid, startYear, { refresh }).catch((e: unknown) => {
          console.warn(`${code} ${seed.name}: Wikipedia season page not used, ${e instanceof Error ? e.message : String(e)}`);
          return undefined;
        });
        const fromPage = page && parseLeagueRows(await sparql(CLUBS_IN_LEAGUE(seed.qid, page.teams), { refresh }), seed, season);
        // Only trust the table when most of its links are football clubs (not a table of towns or stadiums).
        if (page && fromPage && fromPage.clubs.length + fromPage.excluded.length >= Math.max(6, page.teams.length * 0.6)) {
          [parsed, source, sourceUrl] = [fromPage, 'wikipedia', page.url];
        } else if (page) {
          console.warn(`${code} ${seed.name}: Wikipedia season table not used, only ${fromPage?.clubs.length ?? 0} of ${page.teams.length} links are clubs`);
        }
      }
      if (!parsed) {
        source = 'memberships';
        parsed = parseLeagueRows(await sparql(CLUBS_IN_LEAGUE(seed.qid), { refresh }), seed, season);
      }
      for (const q of parsed.withEnwiki) withEnwiki.add(q);
      for (const [child, parent] of parsed.parents) parents.set(child, parent);
      clubs = mergeClubs(clubs, parsed.clubs, [seed.qid], season);
      stadiums = mergeStadiums(stadiums, parsed.stadiums);
      console.log(
        `${code} ${seed.name}: ${parsed.clubs.length} clubs (${source === 'season' ? 'season participants' : source === 'wikipedia' ? `Wikipedia ${sourceUrl}` : 'open memberships'}), ` +
          `${parsed.stadiums.length} stadiums, ${parsed.excluded.length} excluded`,
      );
      results.push({
        league: seed.qid,
        name: seed.name,
        status: 'ok',
        clubs: parsed.clubs.length,
        stadiums: parsed.stadiums.length,
        excluded: parsed.excluded,
        source,
        ...(sourceUrl ? { sourceUrl } : {}),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`${code} ${seed.name}: failed, ${msg}`);
      results.push({ league: seed.qid, name: seed.name, status: `failed: ${msg}`, clubs: 0, stadiums: 0, excluded: [] });
    }
  }
  const children = dropChildTeams(clubs, code, season, parents);
  const deduped = dedupeClubs(children.clubs, code, season, withEnwiki);
  clubs = deduped.clubs;
  const dropped = [...children.dropped, ...deduped.dropped];
  if (dropped.length) {
    console.log(`${code}: left out ${dropped.join('; ')}`);
    const first = results.find((r) => r.status === 'ok');
    if (first) first.excluded = [...first.excluded, ...dropped].sort();
  }
  report[code] = results;
}

writeJson(paths.clubs, clubs);
writeJson(paths.stadiums, stadiums);
writeJson(paths.leagues, [...leagueInfo.values()].sort((a, b) => a.association.localeCompare(b.association) || a.tier - b.tier));
writeJson(paths.importReport, Object.fromEntries(Object.entries(report).sort(([a], [b]) => a.localeCompare(b))));
console.log(`Season ${season}. Wrote ${clubs.length} clubs and ${stadiums.length} stadiums. Run "npm run coverage" for the report.`);
