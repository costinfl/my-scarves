import './style.css';
import { FILTERS, loadStore, type Filter, type Store } from './data.ts';
import { html } from './html.ts';
import { href, parseRoute, type Route } from './router.ts';
import { buildSearch } from './search.ts';
import { associationView, clubView, homeView, leagueView, mapView, notFoundView, searchView, statsView } from './views.ts';

const app = document.querySelector<HTMLElement>('#app')!;
const searchInput = document.querySelector<HTMLInputElement>('#search')!;

let disposeMap: (() => void) | undefined;
let onlyOwned = false;
let filter: Filter = readFilter();

// The list filter is a per-browser convenience; storage can be unavailable (private mode), so never rely on it.
function readFilter(): Filter {
  try {
    const f = localStorage.getItem('filter') as Filter | null;
    return f && FILTERS.includes(f) ? f : 'all';
  } catch {
    return 'all';
  }
}

async function main() {
  let store: Store;
  try {
    store = await loadStore();
  } catch (e) {
    app.innerHTML = html`<p>Could not load the catalogue: ${e instanceof Error ? e.message : String(e)}</p>`.value;
    return;
  }
  const search = buildSearch(store);

  const render = () => {
    const route = parseRoute(location.hash);
    disposeMap?.();
    disposeMap = undefined;
    if (route.view !== 'search') searchInput.value = '';
    app.innerHTML = view(store, route, search).value;
    const heading = route.view === 'home' ? '' : app.querySelector('h1')?.textContent?.trim();
    document.title = heading ? `${heading} · My Scarves` : 'My Scarves';
    void mountMaps(store, route);
    if (route.view !== 'search') window.scrollTo(0, 0);
  };

  // Typing updates the results in place; replace() keeps one history entry per search.
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    location.replace(q ? href.search(q) : href.home());
  });
  document.querySelector('#search-form')!.addEventListener('submit', (e) => e.preventDefault());
  app.addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest<HTMLElement>('[data-filter]');
    if (!button) return;
    filter = button.dataset.filter as Filter;
    try {
      localStorage.setItem('filter', filter);
    } catch {
      // ignore
    }
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  });
  app.addEventListener('change', (e) => {
    if ((e.target as HTMLElement).id === 'only-owned') {
      onlyOwned = (e.target as HTMLInputElement).checked;
      render();
    }
  });

  window.addEventListener('hashchange', render);
  render();
}

function view(store: Store, route: Route, search: (q: string) => ReturnType<ReturnType<typeof buildSearch>>) {
  switch (route.view) {
    case 'home':
      return homeView(store);
    case 'association':
      return associationView(store, route.code, filter);
    case 'league':
      return leagueView(store, route.qid, filter);
    case 'club':
      return clubView(store, route.qid);
    case 'map':
      return mapView(store, onlyOwned);
    case 'stats':
      return statsView(store);
    case 'search':
      return searchView(store, route.query, search(route.query));
    case 'notFound':
      return notFoundView();
  }
}

/** Leaflet is loaded only when a page shows a map (a separate chunk, like lazy class loading). */
async function mountMaps(store: Store, route: Route) {
  const big = app.querySelector<HTMLElement>('#map');
  const small = app.querySelector<HTMLElement>('#club-map');
  if (!big && !small) return;
  const { drawMap } = await import('./map.ts');
  if (big) {
    const clubs = onlyOwned ? store.catalog.clubs.filter((c) => c.scarves.some((s) => s.status === 'owned')) : store.catalog.clubs;
    const map = drawMap(big, clubs);
    disposeMap = () => map.remove();
  } else if (small && route.view === 'club') {
    const club = store.club.get(route.qid);
    if (club) {
      const map = drawMap(small, [club], { zoom: 15 });
      disposeMap = () => map.remove();
    }
  }
}

void main();
