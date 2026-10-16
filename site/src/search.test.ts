import { describe, expect, it } from 'vitest';
import type { Catalog } from './data.ts';
import { indexCatalog } from './data.ts';
import { buildSearch, fold } from './search.ts';

const catalog: Catalog = {
  season: '2026-27',
  packs: [],
  associations: [
    { code: 'ROU', name: 'Romania', notes: null },
    { code: 'ESP', name: 'Spain', notes: null },
  ],
  leagues: [
    { qid: 'Q1', association: 'ROU', tier: 2, name: 'Liga II' },
    { qid: 'Q2', association: 'ESP', tier: 1, name: 'La Liga' },
  ],
  clubs: [
    { qid: 'Q10', name: 'FC Brașov', association: 'ROU', league: 'Q1', tier: 2, current: true, venues: [], scarves: [], stadium: { qid: 'Q90', name: 'Stadionul Tineretului' } },
    { qid: 'Q11', name: 'Cádiz CF', association: 'ESP', league: 'Q2', tier: 1, current: true, venues: [], scarves: [] },
    { qid: 'Q12', name: 'Real Betis', association: 'ESP', league: 'Q2', tier: 1, current: true, venues: [], scarves: [], stadium: { qid: 'Q91', name: 'Estadio Benito Villamarín' } },
  ],
};

describe('search', () => {
  const search = buildSearch(indexCatalog(catalog));
  const names = (q: string) => search(q).map((c) => c.name);

  it('folds diacritics', () => {
    expect(fold('Brașov Cádiz')).toBe('brasov cadiz');
    expect(names('brasov')).toEqual(['FC Brașov']);
    expect(names('cadiz')).toEqual(['Cádiz CF']);
  });

  it('matches prefixes and stadium names', () => {
    expect(names('villam')).toEqual(['Real Betis']);
  });

  it('combines terms with AND across fields', () => {
    expect(names('spain betis')).toEqual(['Real Betis']);
  });

  it('returns nothing for an empty query', () => {
    expect(search('  ')).toEqual([]);
  });
});
