import type { Catalog, CatalogClub, CatalogLeague } from '../../pipeline/lib/catalog.ts';
import type { Association, Pack, Scarf } from '../../pipeline/lib/types.ts';
import { familiesOf, type Family } from './colours.ts';

export type { Catalog, CatalogClub, CatalogLeague, Association, Pack };

/** The catalog plus lookup maps the views need. */
export interface Store {
  catalog: Catalog;
  association: Map<string, Association>;
  league: Map<string, CatalogLeague>;
  club: Map<string, CatalogClub>;
  clubsByLeague: Map<string, CatalogClub[]>;
  pack: Map<string, Pack>;
  /** Packs each club is in, in file order. */
  packsOf: Map<string, Pack[]>;
}

export async function loadStore(): Promise<Store> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/catalog.json`);
  if (!res.ok) throw new Error(`Could not load catalog (${res.status})`);
  return indexCatalog((await res.json()) as Catalog);
}

export function indexCatalog(catalog: Catalog): Store {
  const clubsByLeague = new Map<string, CatalogClub[]>();
  for (const c of catalog.clubs) {
    if (!c.current) continue;
    const list = clubsByLeague.get(c.league) ?? [];
    list.push(c);
    clubsByLeague.set(c.league, list);
  }
  const packsOf = new Map<string, Pack[]>();
  for (const p of catalog.packs) for (const q of p.clubs) packsOf.set(q, [...(packsOf.get(q) ?? []), p]);
  return {
    catalog,
    association: new Map(catalog.associations.map((a) => [a.code, a])),
    league: new Map(catalog.leagues.map((l) => [l.qid, l])),
    club: new Map(catalog.clubs.map((c) => [c.qid, c])),
    clubsByLeague,
    pack: new Map(catalog.packs.map((p) => [p.id, p])),
    packsOf,
  };
}

export type Filter = 'all' | 'owned' | 'wishlist' | 'missing';

export const FILTERS: Filter[] = ['all', 'owned', 'wishlist', 'missing'];

export function applyFilter(clubs: CatalogClub[], filter: Filter): CatalogClub[] {
  switch (filter) {
    case 'all':
      return clubs;
    case 'owned':
      return clubs.filter(owned);
    case 'wishlist':
      return clubs.filter(wished);
    case 'missing':
      return clubs.filter((c) => !owned(c));
  }
}

/** Clubs that count towards "N of M": tier 1/2 this season. */
export const currentClubs = (store: Store) => store.catalog.clubs.filter((c) => c.current);

export const owned = (c: CatalogClub) => c.scarves.some((s) => s.status === 'owned');
export const wished = (c: CatalogClub) => !owned(c) && c.scarves.some((s) => s.status === 'wishlist');

export interface WallFilter {
  /** Association code, or '' for all. A club playing abroad (Vaduz) counts for its home country. */
  country: string;
  colour: Family | '';
  /** Pack id, or '' for all. */
  pack: string;
}

export interface WallItem {
  scarf: Scarf;
  club: CatalogClub;
}

/** Owned scarves for the wall, newest first (undated last), then by club name. */
export function wallItems(clubs: CatalogClub[], f: WallFilter, packs: Map<string, Pack> = new Map()): WallItem[] {
  return clubs
    .flatMap((club) => club.scarves.filter((s) => s.status === 'owned').map((scarf) => ({ scarf, club })))
    .filter(({ club }) => !f.country || (club.home ?? club.association) === f.country)
    .filter(({ club }) => !f.colour || familiesOf(club.colors).includes(f.colour))
    .filter(({ club }) => !f.pack || (packs.get(f.pack)?.clubs.includes(club.qid) ?? false))
    .sort(
      (x, y) =>
        (y.scarf.acquired?.date ?? '').localeCompare(x.scarf.acquired?.date ?? '') || x.club.name.localeCompare(y.club.name),
    );
}

/** The clubs of a pack, in the pack's order; QIDs the catalogue does not know are already left out. */
export const packClubs = (store: Store, p: Pack): CatalogClub[] => p.clubs.flatMap((q) => store.club.get(q) ?? []);
