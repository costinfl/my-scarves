import { describe, expect, it } from 'vitest';
import type { CatalogClub } from './data.ts';
import { wallItems } from './data.ts';

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

const ids = (f: Parameters<typeof wallItems>[1]) => wallItems([rapid, arges, vaduz], f).map((i) => i.scarf.id);

describe('wallItems', () => {
  it('lists owned scarves, newest first and undated last', () => {
    expect(ids({ country: '', colour: '' })).toEqual(['v1', 'r1', 'a1']);
  });
  it('filters by home country', () => {
    expect(ids({ country: 'LIE', colour: '' })).toEqual(['v1']);
    expect(ids({ country: 'SUI', colour: '' })).toEqual([]);
  });
  it('filters by either club colour', () => {
    expect(ids({ country: '', colour: 'white' })).toEqual(['r1']);
    expect(ids({ country: '', colour: 'purple' })).toEqual(['a1']);
  });
});
