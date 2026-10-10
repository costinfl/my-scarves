import MiniSearch from 'minisearch';
import type { Store } from './data.ts';

interface Doc {
  id: string;
  name: string;
  stadium: string;
  league: string;
  country: string;
}

/** Lower-case and strip diacritics, so "brasov" finds "Brașov" and "cadiz" finds "Cádiz". */
export const fold = (term: string) => term.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function buildSearch(store: Store) {
  const index = new MiniSearch<Doc>({
    fields: ['name', 'stadium', 'league', 'country'],
    storeFields: [],
    processTerm: fold,
    searchOptions: { boost: { name: 3, stadium: 1.5 }, prefix: true, fuzzy: 0.2, combineWith: 'AND' },
  });
  index.addAll(
    store.catalog.clubs.map((c) => ({
      id: c.qid,
      name: c.name,
      stadium: c.stadium?.name ?? '',
      league: store.league.get(c.league)?.name ?? '',
      country: store.association.get(c.association)?.name ?? '',
    })),
  );
  return (query: string) =>
    query.trim() === '' ? [] : index.search(query).flatMap((r) => store.club.get(r.id as string) ?? []);
}
