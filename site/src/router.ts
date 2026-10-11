// Hash routes (#/club/Q123). GitHub Pages has no server-side fallback to index.html,
// so path routes like /my-scarves/club/Q123 would 404 on reload; hash routes never reach the server.
export type Route =
  | { view: 'home' }
  | { view: 'association'; code: string }
  | { view: 'league'; qid: string }
  | { view: 'club'; qid: string }
  | { view: 'edit'; qid: string }
  | { view: 'settings' }
  | { view: 'map' }
  | { view: 'stats' }
  | { view: 'search'; query: string }
  | { view: 'notFound' };

export function parseRoute(hash: string): Route {
  const [view = '', arg = ''] = hash.replace(/^#\/?/, '').split('/');
  const value = decodeURIComponent(arg);
  switch (view) {
    case '':
      return { view: 'home' };
    case 'country':
      return value ? { view: 'association', code: value.toUpperCase() } : { view: 'notFound' };
    case 'league':
      return value ? { view: 'league', qid: value } : { view: 'notFound' };
    case 'club':
      return value ? { view: 'club', qid: value } : { view: 'notFound' };
    case 'edit':
      return value ? { view: 'edit', qid: value } : { view: 'notFound' };
    case 'settings':
      return { view: 'settings' };
    case 'map':
      return { view: 'map' };
    case 'stats':
      return { view: 'stats' };
    case 'search':
      return { view: 'search', query: value };
    default:
      return { view: 'notFound' };
  }
}

export const href = {
  home: () => '#/',
  association: (code: string) => `#/country/${code}`,
  league: (qid: string) => `#/league/${qid}`,
  club: (qid: string) => `#/club/${qid}`,
  edit: (qid: string) => `#/edit/${qid}`,
  settings: () => '#/settings',
  map: () => '#/map',
  stats: () => '#/stats',
  search: (q: string) => `#/search/${encodeURIComponent(q)}`,
};
