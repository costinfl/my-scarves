import type {
  AddressInfo,
  Association,
  BlurbInfo,
  Club,
  ClubEnrichment,
  ColorInfo,
  FanshopInfo,
  LeagueInfo,
  LogoInfo,
  Overrides,
  Scarf,
  Stadium,
} from './types.ts';

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

export type CatalogStadium = Stadium & { address?: AddressInfo };

export interface CatalogClub extends ClubEnrichment {
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
  stadium?: CatalogStadium;
  scarves: Scarf[];
}

export interface Enrichment {
  logos: Record<string, LogoInfo>;
  colors: Record<string, ColorInfo>;
  blurbs: Record<string, BlurbInfo>;
  addresses: Record<string, AddressInfo>;
  fanshops: Record<string, FanshopInfo>;
}

export const noEnrichment: Enrichment = { logos: {}, colors: {}, blurbs: {}, addresses: {}, fanshops: {} };

export interface CatalogInput {
  associations: Association[];
  leagues: LeagueInfo[];
  clubs: Club[];
  stadiums: Stadium[];
  enrichment?: Enrichment;
  overrides: Overrides;
  scarves: Scarf[];
}

type EnrichedClub = Club & ClubEnrichment;

export function buildCatalog({ associations, leagues, clubs, stadiums, enrichment = noEnrichment, overrides, scarves }: CatalogInput): Catalog {
  const merged: EnrichedClub[] = clubs.map((c) =>
    applyOverride<EnrichedClub>(
      {
        ...c,
        ...(enrichment.logos[c.qid] ? { logo: enrichment.logos[c.qid] } : {}),
        ...(enrichment.colors[c.qid] ? { colors: enrichment.colors[c.qid] } : {}),
        ...(enrichment.blurbs[c.qid] ? { blurb: enrichment.blurbs[c.qid] } : {}),
        ...(enrichment.fanshops[c.qid] ? { fanshop: enrichment.fanshops[c.qid] } : {}),
      },
      overrides[c.qid],
    ),
  );
  // Latest season present in the data, not today's date, so the build is reproducible.
  const season = merged.flatMap((c) => c.leagues.map((m) => m.season)).sort().at(-1) ?? '';
  const stadiumById = new Map(
    stadiums.map((s) => [
      s.qid,
      applyOverride<CatalogStadium>({ ...s, ...(enrichment.addresses[s.qid] ? { address: enrichment.addresses[s.qid] } : {}) }, overrides[s.qid]),
    ]),
  );
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
      ...(c.logo ? { logo: c.logo } : {}),
      ...(c.colors ? { colors: c.colors } : {}),
      ...(c.blurb ? { blurb: c.blurb } : {}),
      ...(c.fanshop?.url && c.fanshop.status !== 'none' && c.fanshop.status !== 'unchecked' ? { fanshop: c.fanshop } : {}),
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
function applyOverride<T extends object>(item: T, override: object | undefined): T {
  if (!override) return item;
  const result = structuredClone(item) as Record<string, unknown>;
  for (const [key, value] of Object.entries(override)) {
    if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) continue;
    result[key] = value;
  }
  return result as T;
}
