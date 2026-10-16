import './style.css';
import type { Scarf } from '../../pipeline/lib/types.ts';
import { FILTERS, loadStore, type Filter, type Store, type WallFilter } from './data.ts';
import { html } from './html.ts';
import { href, parseRoute, type Route } from './router.ts';
import { buildSearch } from './search.ts';
import { collectEdit, editorView, mountEditor } from './editor.ts';
import { checkAccess, commitFiles, createBlob, DEFAULT_REPO, GitHubError, loadConfig, saveConfig, updateFile } from './github.ts';
import { checkScarfInput, makeScarf, PHOTO_SIZE, THUMB_SIZE, thumbOf } from '../../pipeline/lib/scarves.ts';
import { appendScarf, photoPaths, PHOTOS_DIR, previewPhotos, readScarfForm, resizeToJpeg, scarfFormView, scarfIdFor, SCARVES_PATH } from './scarf-form.ts';
import { applyEdit, OVERRIDES_PATH, type Edit } from './overrides.ts';
import {
  associationView,
  clubView,
  editView,
  homeView,
  leagueView,
  mapView,
  notFoundView,
  searchView,
  settingsView,
  packsView,
  packView,
  statsView,
  wallView,
} from './views.ts';

const app = document.querySelector<HTMLElement>('#app')!;
const searchInput = document.querySelector<HTMLInputElement>('#search')!;

let disposeMap: (() => void) | undefined;
let onlyOwned = false;
const wall: WallFilter = { country: '', colour: '', pack: '' };
let filter: Filter = readFilter();
let notice = '';

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
    app.innerHTML = (notice ? html`<p class="notice" role="status">${notice}</p>` : html``).value + view(store, route, search).value;
    const editor = app.querySelector<HTMLFormElement>('#editor');
    if (editor) mountEditor(editor);
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
  app.addEventListener('submit', (e) => {
    const form = e.target as HTMLFormElement;
    if (form.id === 'editor') {
      e.preventDefault();
      void saveEdit(store, form);
    } else if (form.id === 'scarf-form') {
      e.preventDefault();
      void saveScarf(store, form);
    } else if (form.id === 'token-form') {
      e.preventDefault();
      void saveToken(form).then((ok) => ok && render());
    }
  });
  app.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id !== 'forget-token') return;
    saveConfig(undefined);
    render();
    status('Token removed from this browser.');
  });
  app.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.name === 'photos' && target.form?.id === 'scarf-form') previewPhotos(target, app.querySelector('#photo-preview')!);
    if (target.id === 'wall-country' || target.id === 'wall-colour' || target.id === 'wall-pack') {
      if (target.id === 'wall-country') wall.country = target.value;
      else if (target.id === 'wall-pack') wall.pack = target.value;
      else wall.colour = target.value as WallFilter['colour'];
      render();
    }
    if (target.id === 'only-owned') {
      onlyOwned = (e.target as HTMLInputElement).checked;
      render();
    }
  });

  // A logo that fails to load (e.g. UEFA moved it) falls back to data-fallback, or disappears.
  app.addEventListener(
    'error',
    (e) => {
      const img = e.target as HTMLImageElement;
      if (!(img instanceof HTMLImageElement) || !img.classList.contains('logo')) return;
      const fallback = img.dataset.fallback;
      if (fallback && img.src !== new URL(fallback, location.href).href) img.src = fallback;
      else img.remove();
    },
    true,
  );

  // A notice (e.g. "Saved") is shown on the next page, then cleared.
  window.addEventListener('hashchange', () => {
    render();
    notice = '';
  });
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
      return clubView(store, route.qid, !!loadConfig());
    case 'edit':
      return editView(store, route.qid, (c) => editorView(c), !!loadConfig());
    case 'addScarf':
      return editView(store, route.qid, scarfFormView, !!loadConfig(), 'Add a scarf');
    case 'settings':
      return settingsView(loadConfig(), { repo: DEFAULT_REPO });
    case 'map':
      return mapView(store, onlyOwned);
    case 'stats':
      return statsView(store);
    case 'wall':
      return wallView(store, wall);
    case 'packs':
      return packsView(store);
    case 'pack':
      return packView(store, route.id);
    case 'search':
      return searchView(store, route.query, search(route.query));
    case 'notFound':
      return notFoundView();
  }
}

const status = (text: string) => {
  const el = app.querySelector('#editor-status, #settings-status');
  if (el) el.textContent = text;
};

async function saveToken(form: HTMLFormElement): Promise<boolean> {
  const data = new FormData(form);
  const config = { token: String(data.get('token')).trim(), repo: String(data.get('repo')).trim(), branch: 'main' };
  status('Checking…');
  try {
    const repo = await checkAccess(config);
    saveConfig(config);
    notice = `Saved. Club pages now have Edit and Add a scarf links; changes are committed to ${repo}.`;
    return true;
  } catch (e) {
    // Keep the form as typed; only report.
    status(`Not saved: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

/** Commits the edit, then shows the club page updated right away (the deployed data follows about a minute later). */
async function saveEdit(store: Store, form: HTMLFormElement): Promise<void> {
  const config = loadConfig();
  const club = store.club.get(form.dataset.qid!);
  if (!config || !club) return;
  const { edit, summary } = collectEdit(form, club);
  if (summary.length === 0) {
    status('Nothing changed.');
    return;
  }
  const button = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
  button.disabled = true;
  status('Saving…');
  try {
    const saved = await updateFile(config, OVERRIDES_PATH, (text) => applyEdit(text, edit), `Edit ${club.name} (${club.qid}): ${summary.join(', ')}`);
    applyLocally(store, club.qid, edit);
    notice = saved ? 'Saved. The site rebuilds in about a minute; reload then to see everything.' : 'Already saved, nothing to commit.';
    location.hash = href.club(club.qid);
  } catch (e) {
    // Keep the form as edited so nothing is lost; only report.
    button.disabled = false;
    status(
      e instanceof GitHubError && e.status === 401
        ? 'GitHub rejected the token (expired or revoked). Set a new one in Settings.'
        : `Not saved: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/** Resizes the photos, then commits them with the new scarves.json entry in one commit. */
async function saveScarf(store: Store, form: HTMLFormElement): Promise<void> {
  const config = loadConfig();
  const club = store.club.get(form.dataset.qid!);
  if (!config || !club) return;
  const { input, files } = readScarfForm(form);
  const invalid = checkScarfInput(input);
  if (invalid) {
    status(invalid);
    return;
  }
  const button = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
  button.disabled = true;
  try {
    // Blobs don't depend on the scarf id, so they are uploaded once even if the commit is retried.
    const blobs: { full: string; thumb: string }[] = [];
    for (const [i, file] of files.entries()) {
      status(`Resizing and uploading photo ${i + 1} of ${files.length}…`);
      let full: Uint8Array, thumb: Uint8Array;
      try {
        [full, thumb] = [await resizeToJpeg(file, PHOTO_SIZE, 0.82), await resizeToJpeg(file, THUMB_SIZE, 0.75)];
      } catch {
        throw new Error(`this browser cannot read ${file.name}; save it as JPEG or PNG and try again`);
      }
      blobs.push({ full: await createBlob(config, full), thumb: await createBlob(config, thumb) });
    }
    status('Saving…');
    let scarf: Scarf | undefined;
    await commitFiles(config, `Add scarf: ${club.name} (${club.qid}), ${input.status || 'owned'}`, async (read) => {
      const text = await read(SCARVES_PATH);
      const id = scarfIdFor(club, text);
      const paths = photoPaths(id, blobs.length);
      scarf = makeScarf(id, club.qid, input, paths);
      return [
        ...paths.flatMap((p, i) => [
          { path: `${PHOTOS_DIR}/${p}`, blobSha: blobs[i]!.full },
          { path: `${PHOTOS_DIR}/${thumbOf(p)}`, blobSha: blobs[i]!.thumb },
        ]),
        { path: SCARVES_PATH, text: appendScarf(text, scarf) },
      ];
    });
    // Shown right away without photos: those are served only after the redeploy.
    if (scarf) club.scarves.push({ ...scarf, photos: undefined });
    notice = `Added. The site rebuilds in a couple of minutes; reload then to see ${files.length ? 'the photos' : 'it everywhere'}.`;
    location.hash = href.club(club.qid);
  } catch (e) {
    button.disabled = false;
    status(
      e instanceof GitHubError && e.status === 401
        ? 'GitHub rejected the token (expired or revoked). Set a new one in Settings.'
        : `Not saved: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/** Mirrors a saved edit in the loaded catalogue, so the page reflects it before the redeploy. */
function applyLocally(store: Store, qid: string, edit: Edit): void {
  const club = store.club.get(qid);
  if (!club) return;
  const set = edit[qid]?.set ?? {};
  if (Array.isArray(set.stadiumIds)) {
    const ids = set.stadiumIds as string[];
    club.venues = ids.flatMap((id) => club.venues.filter((v) => v.qid === id));
    if (club.venues[0]) club.stadium = club.venues[0];
  }
  for (const key of ['colors', 'logoSource', 'uefaId', 'fanshop', 'blurb'] as const) {
    if (key in set) (club as unknown as Record<string, unknown>)[key] = set[key];
  }
  const stadium = club.stadium;
  const address = stadium ? edit[stadium.qid]?.set?.address : undefined;
  if (stadium && address) stadium.address = address as { text: string };
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
