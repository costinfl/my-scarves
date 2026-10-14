import { describe, expect, it } from 'vitest';
import { dedupeClubs, dropChildTeams, isReserveTeam, mergeClubs, mergeStadiums, parseLeagueRows, seasonFor } from './clubs.ts';
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
  it.each(['FCSB', 'Real Betis', 'CFR Cluj', 'Brighton & Hove Albion', 'Burgos CF', 'Universitatea Craiova', 'Willem II', 'Ferenc Puskás Football Academy', 'Newington Youth F.C.'])(
    'keeps %s',
    (name) => expect(isReserveTeam(name)).toBe(false),
  );
  it('does not exclude " II" names on their own', () => expect(isReserveTeam('Steaua II')).toBe(false));
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

  it('records parent clubs and which clubs have an English article, without excluding yet', () => {
    const r = parseLeagueRows(
      [
        { club: `${E}Q1`, clubLabel: 'Willem II', enwiki: 'https://en.wikipedia.org/wiki/Willem_II_(football_club)' },
        { club: `${E}Q2`, clubLabel: 'Jong PSV', parent: `${E}Q3` },
      ],
      LIGA1,
      '2026-27',
    );
    expect(r.clubs.map((c) => c.name)).toEqual(['Willem II', 'Jong PSV']);
    expect([...r.parents]).toEqual([['Q2', 'Q3']]);
    expect([...r.withEnwiki]).toEqual(['Q1']);
  });
});

describe('dropChildTeams', () => {
  const m = [{ league: 'L', tier: 1 as const, season: '2026-27' }];
  const club = (qid: string, name: string, association = 'GER'): Club => ({ qid, name, association, leagues: m, stadiumIds: [] });
  const clubs = [
    club('Q15755', 'FC Augsburg'),
    club('Q97905916', 'FC Augsburg'),
    club('Q43710', 'Antalyaspor', 'TUR'),
    club('Q200', 'PSV', 'NED'),
    club('Q201', 'Jong PSV', 'NED'),
  ];
  const parents = new Map([
    ['Q97905916', 'Q15755'], // football-company item of an imported club
    ['Q43710', 'Q12808521'], // multi-sport parent that is not an imported football club
    ['Q201', 'Q200'], // reserve team
  ]);

  it('drops teams whose parent is an imported club of the same association, keeps the rest', () => {
    const ger = dropChildTeams(clubs, 'GER', '2026-27', parents);
    expect(ger.dropped).toEqual(['FC Augsburg (Q97905916), part of club Q15755 (P831)']);
    expect(dropChildTeams(clubs, 'TUR', '2026-27', parents).dropped).toEqual([]);
    expect(dropChildTeams(clubs, 'NED', '2026-27', parents).dropped).toEqual(['Jong PSV (Q201), part of club Q200 (P831)']);
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
