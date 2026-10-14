import { describe, expect, it } from 'vitest';
import { parseSeasonTeams, seasonTitles } from './season-page.ts';

const W = 'https://en.wikipedia.org/wiki/';

describe('seasonTitles', () => {
  it('prefers season articles Wikidata links to the league, then titles built from the league article', () => {
    const rows = [
      { article: `${W}2025%E2%80%9326_Serie_B`, kind: 'season' },
      { article: `${W}2026%E2%80%9327_Serie_B`, kind: 'season' },
      { article: `${W}Serie_B`, kind: 'league' },
    ];
    expect(seasonTitles(rows, 2026).slice(0, 2)).toEqual(['2026–27 Serie B', '2026-27 Serie B']);
  });
  it('builds split-season and calendar-year titles when no season article is linked, dropping a disambiguator', () => {
    const rows = [{ article: `${W}Kazakhstan_First_League_(football)`, kind: 'league' }];
    expect(seasonTitles(rows, 2026)).toEqual([
      '2026–27 Kazakhstan First League',
      '2026-27 Kazakhstan First League',
      '2026–2027 Kazakhstan First League',
      '2026 Kazakhstan First League',
    ]);
  });
});

describe('parseSeasonTeams', () => {
  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => `|-\n|{{flagicon|BUL}} [[PFC Club ${i + 1}|Club ${i + 1}]]\n|[[Town ${i + 1}]]\n|[[Stadium ${i + 1}]]\n|align=center|5,000`).join('\n');
  const article = `{{Infobox football league season}}
The '''2026–27 Second League''' is the season...
==Teams==
===Team changes===
{| class="wikitable"
! Promoted from Third League !! Relegated from First League
|-
| [[FC Promoted]] || [[FC Relegated]]
|}
===Stadiums and locations===
{| class="wikitable sortable"
!Team
!Location
!Stadium
!Capacity
${rows(8)}
|-
|[[PFC Club 1#History|Club 1 again]]
|[[Town 1]]
|[[Stadium 1]]
|5,000
|}
==League table==
{| class="wikitable"
! Pos !! Team !! Pld
|-
| 1 || [[PFC Club 1]] || 0
|}`;

  it('takes the first link of each row in the stadiums table, skipping team changes and duplicates', () => {
    expect(parseSeasonTeams(article)).toEqual(Array.from({ length: 8 }, (_, i) => `PFC Club ${i + 1}`));
  });
  it('ignores tables without a team and a place column, and too short lists', () => {
    expect(parseSeasonTeams(article.replace('!Location\n!Stadium\n', ''))).toEqual([]);
    expect(parseSeasonTeams(article.replace(rows(8), rows(3)))).toEqual([]);
  });
  it('reads single-line rows', () => {
    const oneLine = `==Clubs==\n{| class="wikitable"\n! Club !! City !! Stadium\n${Array.from({ length: 6 }, (_, i) => `|-\n| [[FK A${i}]] || [[City${i}]] || [[Arena${i}]]`).join('\n')}\n|}`;
    expect(parseSeasonTeams(oneLine)).toEqual(['FK A0', 'FK A1', 'FK A2', 'FK A3', 'FK A4', 'FK A5']);
  });
});
