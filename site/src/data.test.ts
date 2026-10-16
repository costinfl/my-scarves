import { describe, expect, it } from 'vitest';
import type { CatalogClub } from './data.ts';
import { indexCatalog, wallItems, type Catalog } from './data.ts';

const club = (qid: string, name: string, extra: Partial<CatalogClub>): CatalogClub =>
  ({ qid, name, association: 'ROU', league: 'Q1', tier: 1, current: true, venues: [], scarves: [], ...extra }) as CatalogClub;

const rapid = club('Q1', 'Rapid', {
  colors: { primary: '#7A263A', secondary: '#FFFFFF', source: 'wikidata' },
  scarves: [
    { id: 'r1', clubQid: 'Q1', status: 'owned', acquired: { date: '2024-05-01' } },
    { id: 'r2', clubQid: 'Q1', status: 'wishlist' },
  ],
});
const arges = club('Q2', 'Argeș', {
  colors: { primary: '#5B2C83', source: 'kit' },
  scarves: [{ id: 'a1', clubQid: 'Q2', status: 'owned' }],
});
const vaduz = club('Q3', 'Vaduz', {
  association: 'SUI',
  home: 'LIE',
  scarves: [{ id: 'v1', clubQid: 'Q3', status: 'owned', acquired: { date: '2025-01-10' } }],
});

const lions = { id: 'lions', name: 'Lion teams', clubs: ['Q3', 'Q1'] };
const packs = new Map([[lions.id, lions]]);
const ids = (f: Partial<Parameters<typeof wallItems>[1]>) =>
  wallItems([rapid, arges, vaduz], { country: '', colour: '', pack: '', ...f }, packs).map((i) => i.scarf.id);

describe('wallItems', () => {
  it('lists owned scarves, newest first and undated last', () => {
    expect(ids({ country: '', colour: '' })).toEqual(['v1', 'r1', 'a1']);
  });
  it('filters by home country', () => {
    expect(ids({ country: 'LIE', colour: '' })).toEqual(['v1']);
    expect(ids({ country: 'SUI', colour: '' })).toEqual([]);
  });
  it('filters by pack', () => {
    expect(ids({ pack: 'lions' })).toEqual(['v1', 'r1']);
    expect(ids({ pack: 'nope' })).toEqual([]);
  });
  it('filters by either club colour', () => {
    expect(ids({ country: '', colour: 'white' })).toEqual(['r1']);
    expect(ids({ country: '', colour: 'purple' })).toEqual(['a1']);
  });
});

describe('indexCatalog', () => {
  it('maps each club to the packs it is in, in file order', () => {
    const favourites = { id: 'favourites', name: 'Favourites', clubs: ['Q1'] };
    const catalog = { season: '2026-27', associations: [], leagues: [], clubs: [rapid, arges], packs: [lions, favourites] } as Catalog;
    const store = indexCatalog(catalog);
    expect(store.packsOf.get('Q1')?.map((p) => p.id)).toEqual(['lions', 'favourites']);
    expect(store.packsOf.get('Q2')).toBeUndefined();
    expect(store.pack.get('lions')).toBe(lions);
  });
});
