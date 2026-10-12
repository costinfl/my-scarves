import { describe, expect, it } from 'vitest';
import { dedupeClubs, isReserveTeam, mergeClubs, mergeStadiums, parseLeagueRows, seasonFor } from './clubs.ts';
import type { Club, SeedLeague } from './types.ts';
import type { Row } from './wikidata.ts';

const E = 'http://www.wikidata.org/entity/';
const LIGA1: SeedLeague = { association: 'ROU', tier: 1, name: 'Liga I', qid: 'Q237753' };

describe('seasonFor', () => {
  it('switches season in July', () => {
    expect(seasonFor(new Date('2026-06-30T12:00:00Z'))).toBe('2025-26');
    expect(seasonFor(new Date('2026-07-01T12:00:00Z'))).toBe('2026-27');
    expect(seasonFor(new Date('2099-10-10T00:00:00Z'))).toBe('2099-00');
  });
});

describe('isReserveTeam', () => {
  it.each(['Real Sociedad B', 'FC Barcelona Atlètic', 'Real Madrid Castilla', 'Chelsea U21', 'Arsenal Women'])(
    'flags %s',
    (name) => expect(isReserveTeam(name)).toBe(true),
  );
  it.each(['FCSB', 'Real Betis', 'CFR Cluj', 'Brighton & Hove Albion', 'Burgos CF', 'Universitatea Craiova', 'Willem II'])(
    'keeps %s',
    (name) => expect(isReserveTeam(name)).toBe(false),
  );
  it('excludes any team with a parent club, whatever its name', () => {
    expect(isReserveTeam('Jong Ajax', true)).toBe(true);
    expect(isReserveTeam('Steaua II', true)).toBe(true);
  });
});

describe('parseLeagueRows', () => {
  it('groups rows per club, prefers the preferred-rank venue, and skips unlabeled clubs', () => {
    const rows: Row[] = [
      { club: `${E}Q1`, clubLabel: 'Rapid', stadium: `${E}Q20`, stadiumLabel: 'Old', rank: 'http://wikiba.se/ontology#NormalRank' },
      {
        club: `${E}Q1`,
        clubLabel: 'Rapid',
        website: 'https://rapid.ro',
        stadium: `${E}Q30`,
        stadiumLabel: 'Giulești',
        rank: 'http://wikiba.se/ontology#PreferredRank',
        coord: 'Point(26.07 44.45)',
        capacity: '14047',
      },
      { club: `${E}Q2`, clubLabel: 'Q2' },
      { club: `${E}Q3`, clubLabel: 'Rapid B' },
    ];
    const r = parseLeagueRows(rows, LIGA1, '2026-27');
    expect(r.clubs).toEqual([
      {
        qid: 'Q1',
        name: 'Rapid',
        association: 'ROU',
        leagues: [{ league: 'Q237753', tier: 1, season: '2026-27' }],
        officialWebsite: 'https://rapid.ro',
        stadiumIds: ['Q30', 'Q20'],
      },
    ]);
    expect(r.stadiums).toContainEqual({ qid: 'Q30', name: 'Giulești', lat: 44.45, lon: 26.07, capacity: 14047 });
    expect(r.excluded).toEqual(['Q2 (no label)', 'Rapid B (Q3)']);
  });

  it('excludes teams with a parent club and records which clubs have an English article', () => {
    const r = parseLeagueRows(
      [
        { club: `${E}Q1`, clubLabel: 'Willem II', enwiki: 'https://en.wikipedia.org/wiki/Willem_II_(football_club)' },
        { club: `${E}Q2`, clubLabel: 'Jong PSV', parent: `${E}Q3` },
      ],
      LIGA1,
      '2026-27',
    );
    expect(r.clubs.map((c) => c.name)).toEqual(['Willem II']);
    expect(r.excluded).toEqual(['Jong PSV (Q2), reserve team']);
    expect([...r.withEnwiki]).toEqual(['Q1']);
  });
});

describe('mergeClubs', () => {
  const base: Club = {
    qid: 'Q1',
    name: 'Rapid',
    association: 'ROU',
    leagues: [
      { league: 'Q237753', tier: 1, season: '2026-27' },
      { league: 'Q386384', tier: 2, season: '2025-26' },
    ],
    officialWebsite: 'https://rapid.ro',
    stadiumIds: ['Q30'],
  };

  it('never erases existing values with empty ones', () => {
    const incoming: Club = { qid: 'Q1', name: 'Rapid București', association: 'ROU', leagues: [], stadiumIds: [] };
    const [merged] = mergeClubs([base], [incoming], [], '2026-27');
    expect(merged).toMatchObject({ name: 'Rapid București', officialWebsite: 'https://rapid.ro', stadiumIds: ['Q30'] });
  });

  it('replaces only this season memberships of the imported leagues', () => {
    // Q1 dropped out of Liga I this season; its 2025-26 Liga II membership is history and stays.
    const [merged] = mergeClubs([base], [], ['Q237753'], '2026-27');
    expect(merged!.leagues).toEqual([{ league: 'Q386384', tier: 2, season: '2025-26' }]);
  });

  it('is idempotent', () => {
    const once = mergeClubs([], [base], ['Q237753'], '2026-27');
    expect(mergeClubs(once, [base], ['Q237753'], '2026-27')).toEqual(once);
  });

  it('does not mutate its input', () => {
    const existing = [structuredClone(base)];
    mergeClubs(existing, [], ['Q237753'], '2026-27');
    expect(existing).toEqual([base]);
  });
});

describe('dedupeClubs', () => {
  const m = (league: string) => [{ league, tier: 1 as const, season: '2026-27' }];
  const clubs: Club[] = [
    { qid: 'Q97905916', name: 'FC Augsburg', association: 'GER', leagues: m('Q82595'), stadiumIds: ['Q167418'] },
    { qid: 'Q15755', name: 'FC Augsburg', association: 'GER', leagues: m('Q82595'), stadiumIds: ['Q167418'] },
    { qid: 'Q97905930', name: 'Hamburger SV', association: 'GER', leagues: m('Q152665'), stadiumIds: ['Q150933'] },
    { qid: 'Q51974', name: 'Hamburger SV', association: 'GER', leagues: m('Q82595'), stadiumIds: ['Q150933'] },
    { qid: 'Q100', name: 'Racing', association: 'GER', leagues: m('Q82595'), stadiumIds: ['Q1'] },
    { qid: 'Q101', name: 'Racing', association: 'GER', leagues: m('Q152665'), stadiumIds: ['Q2'] },
  ];

  it('keeps the item with an English article (or the oldest) and drops the duplicate\'s memberships', () => {
    const { clubs: out, dropped } = dedupeClubs(clubs, 'GER', '2026-27', new Set(['Q15755', 'Q51974']));
    const current = out.filter((c) => c.leagues.length > 0).map((c) => c.qid);
    expect(current).toEqual(['Q15755', 'Q51974', 'Q100', 'Q101']);
    expect(dropped).toEqual(['FC Augsburg (Q97905916), duplicate item of Q15755', 'Hamburger SV (Q97905930), duplicate item of Q51974']);
  });

  it('does not merge same-named clubs with different home venues', () => {
    expect(dedupeClubs(clubs.slice(4), 'GER', '2026-27', new Set()).dropped).toEqual([]);
  });
});

describe('mergeStadiums', () => {
  it('keeps coordinates and capacity when the source has none', () => {
    const merged = mergeStadiums([{ qid: 'Q30', name: 'Giulești', lat: 44.45, lon: 26.07, capacity: 14047 }], [
      { qid: 'Q30', name: 'Stadionul Giulești' },
    ]);
    expect(merged).toEqual([{ qid: 'Q30', name: 'Stadionul Giulești', lat: 44.45, lon: 26.07, capacity: 14047 }]);
  });
});
