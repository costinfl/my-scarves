import type {
  AddressInfo,
  Association,
  BlurbInfo,
  Club,
  ClubEnrichment,
  ColorInfo,
  FanshopInfo,
  KitInfo,
  LeagueInfo,
  LogoInfo,
  Overrides,
  Pack,
  Scarf,
  Stadium,
  UefaInfo,
} from './types.ts';
import { kitColors } from './enrich/kits.ts';

/** What the site loads: one JSON file, already merged (generated, then overrides, then collection). */
export interface Catalog {
  season: string;
  associations: Association[];
  leagues: CatalogLeague[];
  clubs: CatalogClub[];
  packs: Pack[];
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
  /** Every home venue Wikidata lists (primary first), so I can pick the right one in the editor. */
  venues: CatalogStadium[];
  scarves: Scarf[];
}

export interface Enrichment {
  logos: Record<string, LogoInfo>;
  uefa: Record<string, UefaInfo>;
  colors: Record<string, ColorInfo>;
  palettes: Record<string, string[]>;
  kits: Record<string, KitInfo>;
  /** Club QID -> home association code, or a list of candidates when ambiguous (ignored here). */
  homes: Record<string, string | string[]>;
  blurbs: Record<string, BlurbInfo>;
  addresses: Record<string, AddressInfo>;
  fanshops: Record<string, FanshopInfo>;
}

export const noEnrichment: Enrichment = { logos: {}, uefa: {}, colors: {}, palettes: {}, kits: {}, blurbs: {}, addresses: {}, fanshops: {}, homes: {} };

export interface CatalogInput {
  associations: Association[];
  leagues: LeagueInfo[];
  clubs: Club[];
  stadiums: Stadium[];
  enrichment?: Enrichment;
  overrides: Overrides;
  scarves: Scarf[];
  packs?: Pack[];
}

type EnrichedClub = Club & ClubEnrichment;

export function buildCatalog({ associations, leagues, clubs, stadiums, enrichment = noEnrichment, overrides, scarves, packs = [] }: CatalogInput): Catalog {
  const merged: EnrichedClub[] = clubs.map((c) =>
    applyOverride<EnrichedClub>(
      {
        ...c,
        ...(enrichment.logos[c.qid] ? { logo: enrichment.logos[c.qid] } : {}),
        ...(enrichment.uefa[c.qid] ? { uefaId: enrichment.uefa[c.qid]!.id } : {}),
        // Wikidata's official colours win; the Wikipedia home kit fills the gap.
        ...(enrichment.colors[c.qid] ? { colors: enrichment.colors[c.qid] } : enrichment.kits[c.qid] ? { colors: kitColors(enrichment.kits[c.qid]!) } : {}),
        ...(enrichment.palettes[c.qid]?.length ? { palette: enrichment.palettes[c.qid] } : {}),
        ...(typeof enrichment.homes[c.qid] === 'string' ? { home: enrichment.homes[c.qid] as string } : {}),
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

  const inPack = new Set(packs.flatMap((p) => p.clubs));
  const catalogClubs: CatalogClub[] = [];
  for (const c of merged) {
    const known = c.leagues.filter((m) => leagueByQid.has(m.league));
    const currentMembership = known.filter((m) => m.season === season).sort((a, b) => a.tier - b.tier)[0];
    const clubScarves = scarves.filter((s) => s.clubQid === c.qid);
    // A club stays in the catalogue after relegation if I own a scarf of it or put it in a pack.
    const kept = clubScarves.length > 0 || inPack.has(c.qid);
    const membership =
      currentMembership ?? (kept ? [...known].sort((a, b) => b.season.localeCompare(a.season))[0] : undefined);
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
      ...(c.uefaId ? { uefaId: c.uefaId } : {}),
      ...(c.logoSource ? { logoSource: c.logoSource } : {}),
      ...(c.colors ? { colors: c.colors } : {}),
      ...(c.palette ? { palette: c.palette } : {}),
      ...(c.home && c.home !== c.association ? { home: c.home } : {}),
      ...(c.blurb ? { blurb: c.blurb } : {}),
      // The page shows only candidate/confirmed/manual shops; the editor also needs to see the rest.
      ...(c.fanshop ? { fanshop: c.fanshop } : {}),
      ...(stadium ? { stadium } : {}),
      venues: c.stadiumIds.flatMap((id) => {
        const v = stadiumById.get(id);
        return v ? [v] : [];
      }),
      scarves: clubScarves,
    });
  }

  // An association appears if clubs play in its leagues or if it is home to clubs playing abroad (LIE).
  const shownQids = new Set(catalogClubs.map((c) => c.qid));
  const usedCodes = new Set(catalogClubs.flatMap((c) => [c.association, ...(c.home ? [c.home] : [])]));
  return {
    season,
    associations: associations.filter((a) => usedCodes.has(a.code)),
    leagues: leagues
      .filter((l) => usedCodes.has(l.association))
      .map(({ qid, association, tier, label }) => ({ qid, association, tier, name: label })),
    clubs: catalogClubs.sort((a, b) => a.name.localeCompare(b.name)),
    // Only clubs the site can show; build-catalog warns about the others.
    packs: packs.map((p) => ({ ...p, clubs: [...new Set(p.clubs)].filter((q) => shownQids.has(q)) })),
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
