import type { Association, Club, ClubOverrides, LeagueInfo, Scarf, Stadium } from './types.ts';

/** What the site loads: one JSON file, already merged (generated, then overrides, then collection). */
export interface Catalog {
  season: string;
  associations: Association[];
  leagues: CatalogLeague[];
  clubs: CatalogClub[];
}

export interface CatalogLeague {
  qid: string;
  association: string;
  tier: 1 | 2;
  name: string;
}

export interface CatalogClub {
  qid: string;
  name: string;
  association: string;
  /** League of the catalogue season, or the latest known one when `current` is false. */
  league: string;
  tier: 1 | 2;
  /** False for a club kept only because I have a scarf of it (relegated, or an older season). */
  current: boolean;
  officialWebsite?: string;
  logoFile?: string;
  stadium?: Stadium;
  scarves: Scarf[];
}

export interface CatalogInput {
  associations: Association[];
  leagues: LeagueInfo[];
  clubs: Club[];
  stadiums: Stadium[];
  overrides: ClubOverrides;
  scarves: Scarf[];
}

export function buildCatalog({ associations, leagues, clubs, stadiums, overrides, scarves }: CatalogInput): Catalog {
  const merged = clubs.map((c) => applyOverride(c, overrides[c.qid]));
  // Latest season present in the data, not today's date, so the build is reproducible.
  const season = merged.flatMap((c) => c.leagues.map((m) => m.season)).sort().at(-1) ?? '';
  const stadiumById = new Map(stadiums.map((s) => [s.qid, s]));
  const leagueByQid = new Map(leagues.map((l) => [l.qid, l]));

  const catalogClubs: CatalogClub[] = [];
  for (const c of merged) {
    const known = c.leagues.filter((m) => leagueByQid.has(m.league));
    const currentMembership = known.filter((m) => m.season === season).sort((a, b) => a.tier - b.tier)[0];
    const clubScarves = scarves.filter((s) => s.clubQid === c.qid);
    const membership =
      currentMembership ?? (clubScarves.length > 0 ? [...known].sort((a, b) => b.season.localeCompare(a.season))[0] : undefined);
    if (!membership) continue;
    const stadium = c.stadiumIds[0] ? stadiumById.get(c.stadiumIds[0]) : undefined;
    catalogClubs.push({
      qid: c.qid,
      name: c.name,
      association: c.association,
      league: membership.league,
      tier: membership.tier,
      current: membership === currentMembership,
      ...(c.officialWebsite ? { officialWebsite: c.officialWebsite } : {}),
      ...(c.logoFile ? { logoFile: c.logoFile } : {}),
      ...(stadium ? { stadium } : {}),
      scarves: clubScarves,
    });
  }

  const usedCodes = new Set(catalogClubs.map((c) => c.association));
  return {
    season,
    associations: associations.filter((a) => usedCodes.has(a.code)),
    leagues: leagues
      .filter((l) => usedCodes.has(l.association))
      .map(({ qid, association, tier, label }) => ({ qid, association, tier, name: label })),
    clubs: catalogClubs.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Overrides win, but an empty override value (null, "", []) is ignored rather than erasing. */
function applyOverride(club: Club, override: ClubOverrides[string] | undefined): Club {
  if (!override) return club;
  const result: Club = structuredClone(club);
  for (const [key, value] of Object.entries(override)) {
    if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) continue;
    (result as unknown as Record<string, unknown>)[key] = value;
  }
  return result;
}
