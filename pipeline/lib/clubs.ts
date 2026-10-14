import type { Club, LeagueMembership, SeedLeague, Stadium } from './types.ts';
import { commonsFile, parsePoint, qid, type Row } from './wikidata.ts';

/** Football season label for a date: July onwards belongs to the season starting that year. */
export function seasonFor(date: Date): string {
  const y = date.getUTCFullYear();
  const start = date.getUTCMonth() >= 6 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

// Reserve, B and youth teams sometimes carry a league membership of the senior league.
// Anything matched is left out and listed in the coverage report for review.
// "Academy" and "Youth" are not patterns: Puskás Akadémia and Newington Youth F.C. are senior clubs.
// A trailing " II" alone is not enough either (Willem II is a club named after a king). Academy, youth
// and reserve teams whose parent club (P831) is one of the imported clubs are removed by dropChildTeams.
const RESERVE_PATTERNS = [
  /\sB$/,
  /\bU-?\d{2}\b/i,
  /\breserves?\b/i,
  /\bjuvenil\b/i,
  /\bCastilla\b/,
  /\bAtl[eè]tic$/,
  /\bwomen\b/i,
  /\bfemenino\b/i,
  /\bfeminin\b/i,
];

export function isReserveTeam(name: string): boolean {
  return RESERVE_PATTERNS.some((p) => p.test(name));
}

/**
 * A team whose parent club (P831) is one of this association's current clubs is not a separate
 * club: a reserve side (Jong PSV -> PSV) or the club's football-company item (FC Augsburg
 * Q97905916 -> Q15755). A parent that is not an imported football club, such as Antalyaspor's
 * multi-sport club, does not count: the team itself is the club we want.
 */
export function dropChildTeams(clubs: Club[], association: string, season: string, parents: Map<string, string>): { clubs: Club[]; dropped: string[] } {
  const current = new Set(clubs.filter((c) => c.association === association && c.leagues.some((m) => m.season === season)).map((c) => c.qid));
  const drop = new Map([...parents].filter(([child, parent]) => current.has(child) && current.has(parent)));
  if (drop.size === 0) return { clubs, dropped: [] };
  return {
    clubs: clubs.map((c) => (drop.has(c.qid) ? { ...c, leagues: c.leagues.filter((m) => m.season !== season) } : c)),
    dropped: [...drop].map(([q, parent]) => `${clubs.find((c) => c.qid === q)!.name} (${q}), part of club ${parent} (P831)`),
  };
}

/** Teams listed as participants (P1923) of the league's season starting in startYear, if Wikidata has them. */
export const SEASON_TEAMS = (leagueQid: string, startYear: number) => `
SELECT DISTINCT ?team WHERE {
  ?season wdt:P3450 wd:${leagueQid} ; wdt:P580 ?start ; wdt:P1923 ?team .
  FILTER(YEAR(?start) = ${startYear})
}`;

/**
 * Clubs of a league with their venues. Members are the season's participants when Wikidata lists
 * them (exact), otherwise clubs with a P118 membership without end date (can be stale).
 */
export const CLUBS_IN_LEAGUE = (leagueQid: string, seasonTeams: string[] = []) => `
SELECT ?club ?clubLabel ?website ?logo ?stadium ?stadiumLabel ?rank ?coord ?capacity ?parent ?enwiki WHERE {
  ${
    seasonTeams.length > 0
      ? `VALUES ?club { ${seasonTeams.map((q) => `wd:${q}`).join(' ')} }`
      : `?club p:P118 ?membership .
  ?membership ps:P118 wd:${leagueQid} .
  FILTER NOT EXISTS { ?membership pq:P582 ?end }`
  }
  ?club wdt:P31/wdt:P279* wd:Q476028 .
  OPTIONAL { ?club wdt:P831 ?parent }
  OPTIONAL { ?enwiki schema:about ?club ; schema:isPartOf <https://en.wikipedia.org/> }
  FILTER NOT EXISTS { ?club wdt:P576 ?dissolved }
  OPTIONAL { ?club wdt:P856 ?website }
  OPTIONAL { ?club wdt:P154 ?logo }
  OPTIONAL {
    ?club p:P115 ?venue .
    ?venue ps:P115 ?stadium ; wikibase:rank ?rank .
    FILTER(?rank != wikibase:DeprecatedRank)
    FILTER NOT EXISTS { ?venue pq:P582 ?venueEnd }
    OPTIONAL { ?stadium wdt:P625 ?coord }
    OPTIONAL { ?stadium wdt:P1083 ?capacity }
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul,ro,es,fr,de,it,pt". }
}`;

export interface LeagueRows {
  clubs: Club[];
  stadiums: Stadium[];
  excluded: string[];
  /** Clubs with an English Wikipedia article: the main item when Wikidata has duplicates. */
  withEnwiki: Set<string>;
  /** Club QID -> parent club QID (P831). */
  parents: Map<string, string>;
}

/** Groups the flat SPARQL rows (one per club x website x logo x venue x ... combination) into records. */
export function parseLeagueRows(rows: Row[], league: SeedLeague, season: string): LeagueRows {
  const clubs = new Map<string, Club>();
  const venues = new Map<string, { qid: string; preferred: boolean }[]>();
  const stadiums = new Map<string, Stadium>();
  const excluded = new Set<string>();
  const withEnwiki = new Set<string>();
  const parents = new Map<string, string>();

  for (const row of rows) {
    const clubQid = qid(row.club);
    if (!clubQid) continue;
    const name = row.clubLabel;
    // A label equal to the QID means Wikidata has no label in any requested language.
    if (!name || name === clubQid) {
      excluded.add(`${clubQid} (no label)`);
      continue;
    }
    if (isReserveTeam(name)) {
      excluded.add(`${name} (${clubQid})`);
      continue;
    }
    // Parent clubs are decided per association, once all its leagues are known (see dropChildTeams).
    const parent = qid(row.parent);
    if (parent) parents.set(clubQid, parent);
    if (row.enwiki) withEnwiki.add(clubQid);

    let club = clubs.get(clubQid);
    if (!club) {
      club = {
        qid: clubQid,
        name,
        association: league.association,
        leagues: [{ league: league.qid, tier: league.tier, season }],
        stadiumIds: [],
      };
      clubs.set(clubQid, club);
    }
    club.officialWebsite = pickFirst(club.officialWebsite, row.website);
    club.logoFile = pickFirst(club.logoFile, commonsFile(row.logo));

    const stadiumQid = qid(row.stadium);
    const stadiumName = row.stadiumLabel;
    if (!stadiumQid || !stadiumName || stadiumName === stadiumQid) continue;

    const list = venues.get(clubQid) ?? [];
    if (!list.some((v) => v.qid === stadiumQid)) {
      list.push({ qid: stadiumQid, preferred: row.rank?.endsWith('PreferredRank') ?? false });
      venues.set(clubQid, list);
    }

    const s = stadiums.get(stadiumQid) ?? { qid: stadiumQid, name: stadiumName };
    const point = parsePoint(row.coord);
    if (point && s.lat === undefined) {
      s.lat = point.lat;
      s.lon = point.lon;
    }
    const capacity = parseCapacity(row.capacity);
    // Several equally ranked capacity values (e.g. history without qualifiers): keep the largest.
    if (capacity !== undefined && (s.capacity === undefined || capacity > s.capacity)) s.capacity = capacity;
    stadiums.set(stadiumQid, s);
  }

  for (const [clubQid, list] of venues) {
    // Preferred-rank venue is primary; otherwise order by QID so re-runs are stable.
    list.sort((a, b) => Number(b.preferred) - Number(a.preferred) || compareQid(a.qid, b.qid));
    clubs.get(clubQid)!.stadiumIds = list.map((v) => v.qid);
  }

  return {
    clubs: [...clubs.values()],
    stadiums: [...stadiums.values()],
    excluded: [...excluded].sort(),
    withEnwiki,
    parents,
  };
}

/**
 * Wikidata sometimes has two items for one club (the club and its football company, e.g.
 * FC Augsburg Q15755 and Q97905916), both listed as league members. Clubs of one association with
 * the same name and the same home venue (or no venue on one side) are one club: the item with an
 * English Wikipedia article is kept, otherwise the oldest QID. The others lose their memberships
 * of this season, so they drop out of the site but stay in the data for reference.
 */
export function dedupeClubs(clubs: Club[], association: string, season: string, withEnwiki: Set<string>): { clubs: Club[]; dropped: string[] } {
  const current = clubs.filter((c) => c.association === association && c.leagues.some((m) => m.season === season));
  const byName = new Map<string, Club[]>();
  for (const c of current) {
    const key = c.name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), c]);
  }
  const drop = new Map<string, string>();
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    const ranked = [...group].sort((a, b) => Number(withEnwiki.has(b.qid)) - Number(withEnwiki.has(a.qid)) || compareQid(a.qid, b.qid));
    const keep = ranked[0]!;
    for (const other of ranked.slice(1)) {
      const sameVenue = !keep.stadiumIds[0] || !other.stadiumIds[0] || keep.stadiumIds[0] === other.stadiumIds[0];
      if (sameVenue) drop.set(other.qid, keep.qid);
    }
  }
  if (drop.size === 0) return { clubs, dropped: [] };
  return {
    clubs: clubs.map((c) => (drop.has(c.qid) ? { ...c, leagues: c.leagues.filter((m) => m.season !== season) } : c)),
    dropped: [...drop].map(([q, keep]) => `${clubs.find((c) => c.qid === q)!.name} (${q}), duplicate item of ${keep}`),
  };
}

/**
 * Merges freshly imported clubs into the existing generated list.
 * - Memberships of the imported leagues for `season` are replaced; other memberships are kept.
 * - An empty incoming value never erases an existing one.
 */
export function mergeClubs(
  existing: Club[],
  incoming: Club[],
  importedLeagues: string[],
  season: string,
): Club[] {
  const byQid = new Map(existing.map((c) => [c.qid, structuredClone(c)]));
  const replaced = (m: LeagueMembership) => m.season === season && importedLeagues.includes(m.league);

  for (const club of byQid.values()) club.leagues = club.leagues.filter((m) => !replaced(m));

  for (const club of incoming) {
    const old = byQid.get(club.qid);
    if (!old) {
      byQid.set(club.qid, structuredClone(club));
      continue;
    }
    old.name = club.name || old.name;
    old.association = club.association || old.association;
    old.officialWebsite = club.officialWebsite ?? old.officialWebsite;
    old.logoFile = club.logoFile ?? old.logoFile;
    if (club.stadiumIds.length > 0) old.stadiumIds = club.stadiumIds;
    for (const m of club.leagues) {
      if (!old.leagues.some((o) => o.league === m.league && o.season === m.season)) old.leagues.push(m);
    }
  }

  return [...byQid.values()]
    .map((c) => ({ ...c, leagues: c.leagues.sort(compareMembership) }))
    .sort((a, b) => a.association.localeCompare(b.association) || a.name.localeCompare(b.name) || compareQid(a.qid, b.qid));
}

/** Same empty-never-erases rule for stadiums. */
export function mergeStadiums(existing: Stadium[], incoming: Stadium[]): Stadium[] {
  const byQid = new Map(existing.map((s) => [s.qid, { ...s }]));
  for (const s of incoming) {
    const old = byQid.get(s.qid);
    if (!old) {
      byQid.set(s.qid, { ...s });
      continue;
    }
    old.name = s.name || old.name;
    if (s.lat !== undefined && s.lon !== undefined) {
      old.lat = s.lat;
      old.lon = s.lon;
    }
    old.capacity = s.capacity ?? old.capacity;
  }
  return [...byQid.values()].sort((a, b) => compareQid(a.qid, b.qid));
}

function pickFirst<T>(current: T | undefined, next: T | undefined): T | undefined {
  return current ?? (next || undefined);
}

function parseCapacity(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = Math.round(Number(s));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function compareQid(a: string, b: string): number {
  return Number(a.slice(1)) - Number(b.slice(1));
}

function compareMembership(a: LeagueMembership, b: LeagueMembership): number {
  return b.season.localeCompare(a.season) || a.tier - b.tier;
}
