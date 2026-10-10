import { describe, expect, it } from 'vitest';
import { buildCatalog, type CatalogInput } from './catalog.ts';

const input: CatalogInput = {
  associations: [
    { code: 'ROU', name: 'Romania', notes: null },
    { code: 'ALB', name: 'Albania', notes: null },
  ],
  leagues: [
    { qid: 'Q1', association: 'ROU', tier: 1, label: 'Liga I', participants: 16 },
    { qid: 'Q2', association: 'ROU', tier: 2, label: 'Liga II' },
  ],
  clubs: [
    {
      qid: 'Q10',
      name: 'Rapid',
      association: 'ROU',
      leagues: [
        { league: 'Q1', tier: 1, season: '2026-27' },
        { league: 'Q2', tier: 2, season: '2025-26' },
      ],
      officialWebsite: 'https://rapid.ro',
      stadiumIds: ['Q90'],
    },
    { qid: 'Q11', name: 'Old Club', association: 'ROU', leagues: [{ league: 'Q2', tier: 2, season: '2025-26' }], stadiumIds: [] },
  ],
  stadiums: [{ qid: 'Q90', name: 'Giulești', lat: 44.45, lon: 26.07 }],
  overrides: { Q10: { name: 'FC Rapid 1923', officialWebsite: '' } },
  scarves: [
    { id: 's1', clubQid: 'Q10', status: 'owned' },
    { id: 's2', clubQid: 'Q99', status: 'wishlist' },
  ],
};

describe('buildCatalog', () => {
  const catalog = buildCatalog(input);

  it('uses the latest season and drops clubs without a membership in it', () => {
    expect(catalog.season).toBe('2026-27');
    expect(catalog.clubs.map((c) => c.qid)).toEqual(['Q10']);
  });

  it('applies overrides after generated data, ignoring empty override values', () => {
    expect(catalog.clubs[0]).toMatchObject({ name: 'FC Rapid 1923', officialWebsite: 'https://rapid.ro' });
  });

  it('attaches the primary stadium and the collection last', () => {
    expect(catalog.clubs[0]!.stadium).toEqual({ qid: 'Q90', name: 'Giulești', lat: 44.45, lon: 26.07 });
    expect(catalog.clubs[0]!.scarves).toEqual([{ id: 's1', clubQid: 'Q10', status: 'owned' }]);
  });

  it('keeps only associations that have clubs, and league labels as names', () => {
    expect(catalog.associations.map((a) => a.code)).toEqual(['ROU']);
    expect(catalog.leagues).toEqual([
      { qid: 'Q1', association: 'ROU', tier: 1, name: 'Liga I' },
      { qid: 'Q2', association: 'ROU', tier: 2, name: 'Liga II' },
    ]);
  });
});
