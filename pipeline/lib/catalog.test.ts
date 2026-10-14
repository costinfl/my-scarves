import { describe, expect, it } from 'vitest';
import { buildCatalog, type CatalogInput, noEnrichment } from './catalog.ts';

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

  it('keeps a non-current club when I have a scarf of it, flagged and with its latest league', () => {
    const withOld = buildCatalog({ ...input, scarves: [...input.scarves, { id: 's3', clubQid: 'Q11', status: 'owned' }] });
    expect(withOld.clubs.find((c) => c.qid === 'Q11')).toMatchObject({ current: false, league: 'Q2', tier: 2 });
    expect(withOld.clubs.find((c) => c.qid === 'Q10')).toMatchObject({ current: true, league: 'Q1' });
  });

  it('merges enrichment, then overrides by club or stadium QID', () => {
    const enriched = buildCatalog({
      ...input,
      enrichment: {
        logos: {},
        uefa: { Q10: { id: '59039' } },
        colors: { Q10: { primary: '#800032', source: 'wikidata' } },
        palettes: { Q10: ['#FDFDFD', '#A4333A'] },
        kits: { Q10: { body: '#FFFFFF', source: 'https://en.wikipedia.org/wiki/Rapid' } },
        blurbs: { Q10: { text: 'Draft.', source: 'https://en.wikipedia.org/wiki/Rapid', status: 'draft' } },
        addresses: { Q90: { text: 'Strada Giulești 18, București' } },
        fanshops: { Q10: { status: 'none', checkedAt: '2026-10-10' } },
        homes: {},
      },
      overrides: {
        Q10: { blurb: { text: 'Reviewed.', source: 'https://en.wikipedia.org/wiki/Rapid', status: 'reviewed' } },
        Q90: { address: { text: 'Calea Giulești 18' } },
      },
    });
    const rapid = enriched.clubs.find((c) => c.qid === 'Q10')!;
    expect(rapid.colors?.primary).toBe('#800032');
    expect(rapid.blurb).toMatchObject({ text: 'Reviewed.', status: 'reviewed' });
    expect(rapid.stadium?.address?.text).toBe('Calea Giulești 18');
    expect(rapid.fanshop?.status).toBe('none');
    expect(rapid.uefaId).toBe('59039');
    expect(rapid.palette).toEqual(['#FDFDFD', '#A4333A']);
    expect(rapid.venues).toEqual([rapid.stadium]);
  });

  it('uses the Wikipedia home kit only when Wikidata has no official colours', () => {
    const kit = { body: '#800032', shorts: '#800032', socks: '#FFFFFF', source: 'https://en.wikipedia.org/wiki/Rapid' };
    const withKit = buildCatalog({ ...input, enrichment: { ...noEnrichment, kits: { Q10: kit } } });
    expect(withKit.clubs.find((c) => c.qid === 'Q10')!.colors).toEqual({
      primary: '#800032',
      secondary: '#FFFFFF',
      source: 'kit',
      sourceUrl: 'https://en.wikipedia.org/wiki/Rapid',
    });
  });

  it('marks clubs playing abroad and lists their home association even without own leagues', () => {
    const withHome = buildCatalog({
      ...input,
      associations: [...input.associations, { code: 'LIE', name: 'Liechtenstein', notes: null }],
      enrichment: { ...noEnrichment, homes: { Q10: 'LIE', Q11: ['ALB', 'LIE'] } },
    });
    expect(withHome.clubs.find((c) => c.qid === 'Q10')!.home).toBe('LIE');
    expect(withHome.associations.map((a) => a.code)).toEqual(['ROU', 'LIE']);
  });

  it('keeps only associations that have clubs, and league labels as names', () => {
    expect(catalog.associations.map((a) => a.code)).toEqual(['ROU']);
    expect(catalog.leagues).toEqual([
      { qid: 'Q1', association: 'ROU', tier: 1, name: 'Liga I' },
      { qid: 'Q2', association: 'ROU', tier: 2, name: 'Liga II' },
    ]);
  });
});
