// Hash routes (#/club/Q123). GitHub Pages has no server-side fallback to index.html,
// so path routes like /my-scarves/club/Q123 would 404 on reload; hash routes never reach the server.
export type Route =
  | { view: 'home' }
  | { view: 'association'; code: string }
  | { view: 'league'; qid: string }
  | { view: 'club'; qid: string }
  | { view: 'map' }
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
    case 'map':
      return { view: 'map' };
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
  map: () => '#/map',
  search: (q: string) => `#/search/${encodeURIComponent(q)}`,
};
