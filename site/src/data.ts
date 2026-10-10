import type { Catalog, CatalogClub, CatalogLeague } from '../../pipeline/lib/catalog.ts';
import type { Association } from '../../pipeline/lib/types.ts';

export type { Catalog, CatalogClub, CatalogLeague, Association };

/** The catalog plus lookup maps the views need. */
export interface Store {
  catalog: Catalog;
  association: Map<string, Association>;
  league: Map<string, CatalogLeague>;
  club: Map<string, CatalogClub>;
  clubsByLeague: Map<string, CatalogClub[]>;
}

export async function loadStore(): Promise<Store> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/catalog.json`);
  if (!res.ok) throw new Error(`Could not load catalog (${res.status})`);
  return indexCatalog((await res.json()) as Catalog);
}

export function indexCatalog(catalog: Catalog): Store {
  const clubsByLeague = new Map<string, CatalogClub[]>();
  for (const c of catalog.clubs) {
    const list = clubsByLeague.get(c.league) ?? [];
    list.push(c);
    clubsByLeague.set(c.league, list);
  }
  return {
    catalog,
    association: new Map(catalog.associations.map((a) => [a.code, a])),
    league: new Map(catalog.leagues.map((l) => [l.qid, l])),
    club: new Map(catalog.clubs.map((c) => [c.qid, c])),
    clubsByLeague,
  };
}

export const owned = (c: CatalogClub) => c.scarves.some((s) => s.status === 'owned');
export const wished = (c: CatalogClub) => !owned(c) && c.scarves.some((s) => s.status === 'wishlist');
