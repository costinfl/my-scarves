import { describe, expect, it } from 'vitest';
import { href, parseRoute } from './router.ts';

describe('parseRoute', () => {
  it.each([
    ['', { view: 'home' }],
    ['#/', { view: 'home' }],
    ['#/country/rou', { view: 'association', code: 'ROU' }],
    ['#/league/Q9448', { view: 'league', qid: 'Q9448' }],
    ['#/club/Q18656', { view: 'club', qid: 'Q18656' }],
    ['#/map', { view: 'map' }],
    ['#/stats', { view: 'stats' }],
    ['#/wall', { view: 'wall' }],
    ['#/edit/Q245162', { view: 'edit', qid: 'Q245162' }],
    ['#/add-scarf/Q245162', { view: 'addScarf', qid: 'Q245162' }],
    ['#/settings', { view: 'settings' }],
    ['#/search/Bra%C8%99ov', { view: 'search', query: 'Brașov' }],
    ['#/club', { view: 'notFound' }],
    ['#/nope', { view: 'notFound' }],
  ])('%s', (hash, route) => expect(parseRoute(hash)).toEqual(route));

  it('round-trips search queries with special characters', () => {
    expect(parseRoute(href.search('Real Madrid / Atlético'))).toEqual({ view: 'search', query: 'Real Madrid / Atlético' });
  });
});
