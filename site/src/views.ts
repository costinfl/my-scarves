import type { Scarf } from '../../pipeline/lib/types.ts';
import type { CatalogClub, Filter, Store } from './data.ts';
import { applyFilter, currentClubs, FILTERS, owned, wished } from './data.ts';
import { html, type Html } from './html.ts';
import { href } from './router.ts';

const photoUrl = (path: string) => `${import.meta.env.BASE_URL}photos/${path}`;
const logoUrl = (file: string) => `${import.meta.env.BASE_URL}logos/${file}`;
const uefaBadge = (id: string) => `https://img.uefa.com/imgml/TP/teams/logos/240x240/${id}.png`;
const uefaTeam = (id: string) => `https://www.uefa.com/nationalassociations/teams/${id}/`;

/** Which logo a club page shows: my choice, else the UEFA badge, else the Commons file. */
export function logoChoice(c: CatalogClub): 'uefa' | 'commons' | 'none' {
  if (c.logoSource === 'none') return 'none';
  if (c.logoSource === 'commons' && c.logo) return 'commons';
  if (c.uefaId) return 'uefa';
  return c.logo ? 'commons' : 'none';
}

/** Shop links worth showing: found by the pipeline (unchecked by me) or confirmed/entered by me. */
const shownShop = (c: CatalogClub) =>
  c.fanshop?.url && (c.fanshop.status === 'candidate' || c.fanshop.status === 'confirmed' || c.fanshop.status === 'manual') ? c.fanshop : undefined;

function logoImg(c: CatalogClub): Html {
  const choice = logoChoice(c);
  if (choice === 'uefa') {
    // Embedded from UEFA, never copied into the repo. If UEFA moves it, fall back to the Commons file or hide.
    return html`<img class="logo" src="${uefaBadge(c.uefaId!)}" alt="${c.name} badge" referrerpolicy="no-referrer"
      ${c.logo ? html`data-fallback="${logoUrl(c.logo.file)}"` : ''}>`;
  }
  if (choice === 'commons') return html`<img class="logo" src="${logoUrl(c.logo!.file)}" alt="${c.name} logo">`;
  return html``;
}

function logoCredit(c: CatalogClub): Html {
  const choice = logoChoice(c);
  if (choice === 'uefa') {
    return html`<p class="muted credit">Badge: <a href="${uefaTeam(c.uefaId!)}" rel="noopener" target="_blank">UEFA</a>, shown from uefa.com; © the club.</p>`;
  }
  if (choice === 'commons' && c.logo) {
    return html`<p class="muted credit">Logo: <a href="${c.logo.sourceUrl}" rel="noopener" target="_blank">${c.logo.commonsFile}</a>
      ${c.logo.author && `by ${c.logo.author}, `}${c.logo.license}, via Wikimedia Commons</p>`;
  }
  return html``;
}

/** Two-colour swatch in the club colours; nothing when the colours are unknown. */
function swatch(c: CatalogClub): Html {
  if (!c.colors) return html``;
  const second = c.colors.secondary ?? c.colors.primary;
  return html`<span class="swatch" style="--c1:${c.colors.primary};--c2:${second}" title="${c.colors.names?.join(', ') ?? 'club colours'}"></span>`;
}
const thumbUrl = (path: string) => photoUrl(path.replace(/\.jpg$/, '.thumb.jpg'));

const progress = (clubs: CatalogClub[]) => html`<span class="progress">${clubs.filter(owned).length} of ${clubs.length}</span>`;

function badge(c: CatalogClub): Html {
  if (owned(c)) return html`<span class="badge owned">owned</span>`;
  if (wished(c)) return html`<span class="badge wish">wishlist</span>`;
  return html``;
}

function filterBar(filter: Filter): Html {
  return html`<div class="filters" role="group" aria-label="Filter clubs">
    ${FILTERS.map((f) => html`<button type="button" data-filter="${f}" aria-pressed="${f === filter ? 'true' : 'false'}">${f}</button>`)}
  </div>`;
}

function clubList(clubs: CatalogClub[], store: Store, filter: Filter = 'all', showLeague = false): Html {
  const shown = applyFilter(clubs, filter);
  if (shown.length === 0) return html`<p class="muted">${clubs.length === 0 ? 'No clubs.' : `No ${filter} clubs here.`}</p>`;
  return html`<ul class="clubs">
    ${shown.map((c) => {
      const thumb = c.scarves.find((s) => s.status === 'owned' && s.photos?.length)?.photos?.[0];
      return html`<li>
        ${thumb && html`<img class="mini" src="${thumbUrl(thumb)}" alt="" loading="lazy">`}
        ${swatch(c)}<a href="${href.club(c.qid)}">${c.name}</a> ${badge(c)}
        <span class="muted">${showLeague ? `${store.league.get(c.league)?.name ?? ''} · ` : ''}${c.stadium?.name ?? 'stadium unknown'}</span>
      </li>`;
    })}
  </ul>`;
}

function crumbs(...items: [string, string?][]): Html {
  return html`<nav class="crumbs">
    <a href="${href.home()}">All countries</a>
    ${items.map(([label, link]) => (link ? html` › <a href="${link}">${label}</a>` : html` › <span>${label}</span>`))}
  </nav>`;
}

export function homeView(store: Store): Html {
  const { catalog } = store;
  const clubs = currentClubs(store);
  const pending = 55 - catalog.associations.length;
  return html`
    <h1>My scarves <small class="muted">${progress(clubs)} clubs</small></h1>
    <p class="muted">Tier 1 and 2 clubs, season ${catalog.season}. <a href="${href.stats()}">Stats</a></p>
    <ul class="cards">
      ${catalog.associations.map((a) => {
        const mine = clubs.filter((c) => c.association === a.code);
        return html`<li><a class="card" href="${href.association(a.code)}">
          <strong>${a.name}</strong><span class="muted">${a.code}</span>${progress(mine)}
        </a></li>`;
      })}
    </ul>
    ${pending > 0 && html`<p class="muted">${pending} more associations to import.</p>`}
  `;
}

export function associationView(store: Store, code: string, filter: Filter): Html {
  const a = store.association.get(code);
  if (!a) return notFoundView();
  const leagues = store.catalog.leagues.filter((l) => l.association === code).sort((x, y) => x.tier - y.tier);
  const former = store.catalog.clubs.filter((c) => c.association === code && !c.current);
  return html`
    ${crumbs([a.name])}
    <h1>${a.name}</h1>
    ${a.notes && html`<p class="muted">${a.notes}</p>`}
    ${filterBar(filter)}
    ${leagues.map((l) => {
      const clubs = store.clubsByLeague.get(l.qid) ?? [];
      return html`<section>
        <h2><a href="${href.league(l.qid)}">${l.name}</a> <small class="muted">tier ${l.tier} · ${progress(clubs)}</small></h2>
        ${clubList(clubs, store, filter)}
      </section>`;
    })}
    ${former.length > 0 &&
    html`<section>
      <h2>Other clubs <small class="muted">not in tier 1 or 2 this season</small></h2>
      ${clubList(former, store, filter)}
    </section>`}
  `;
}

export function leagueView(store: Store, qid: string, filter: Filter): Html {
  const l = store.league.get(qid);
  const a = l && store.association.get(l.association);
  if (!l || !a) return notFoundView();
  const clubs = store.clubsByLeague.get(qid) ?? [];
  return html`
    ${crumbs([a.name, href.association(a.code)], [l.name])}
    <h1>${l.name} <small class="muted">${progress(clubs)}</small></h1>
    ${filterBar(filter)}
    ${clubList(clubs, store, filter)}
  `;
}

function scarfDetails(s: Scarf): Html {
  const facts = [
    s.type,
    s.acquired?.date && `acquired ${s.acquired.date}`,
    s.acquired?.place && `at ${s.acquired.place}`,
    s.price && `${s.price.amount} ${s.price.currency}`,
    s.condition && `condition: ${s.condition}`,
  ].filter(Boolean);
  return html`<li class="scarf">
    <p><span class="badge ${s.status === 'owned' ? 'owned' : 'wish'}">${s.status}</span> ${facts.join(' · ')}</p>
    ${s.notes && html`<p>${s.notes}</p>`}
    ${s.photos?.length &&
    html`<div class="photos">
      ${s.photos.map((p) => html`<a href="${photoUrl(p)}" target="_blank"><img src="${thumbUrl(p)}" alt="Scarf photo" loading="lazy"></a>`)}
    </div>`}
  </li>`;
}

export function clubView(store: Store, qid: string): Html {
  const c = store.club.get(qid);
  const l = c && store.league.get(c.league);
  const a = c && store.association.get(c.association);
  if (!c || !l || !a) return notFoundView();
  const s = c.stadium;
  const hasCoords = s?.lat !== undefined && s.lon !== undefined;
  return html`
    ${crumbs([a.name, href.association(a.code)], [l.name, href.league(l.qid)], [c.name])}
    <header class="club-head">
      ${logoImg(c)}
      <div>
        <h1>${c.name} ${badge(c)}</h1>
        <p class="muted">${l.name} · ${a.name}${!c.current && ' · not in tier 1 or 2 this season'}</p>
      </div>
    </header>
    ${c.colors &&
    html`<div class="stripe" style="--c1:${c.colors.primary};--c2:${c.colors.secondary ?? c.colors.primary}"
      title="${c.colors.names?.length ? `Colours: ${c.colors.names.join(', ')}` : 'Club colours'}"></div>`}
    ${c.blurb &&
    html`<p class="blurb">${c.blurb.text}
      <small class="muted">From <a href="${c.blurb.source}" rel="noopener" target="_blank">Wikipedia</a>, CC BY-SA 4.0${c.blurb.status === 'draft' && ' · draft'}</small></p>`}

    <section>
      <h2>My scarves</h2>
      ${c.scarves.length === 0
        ? html`<p class="muted">No scarf yet.</p>`
        : html`<ul class="scarves">${c.scarves.map(scarfDetails)}</ul>`}
    </section>

    <section>
      <h2>Stadium</h2>
      ${s
        ? html`<p><strong>${s.name}</strong>${s.capacity !== undefined && html` · ${s.capacity.toLocaleString('en')} seats`}</p>
            ${s.address && html`<p>${s.address.text}${s.address.osmUrl && html` · <a href="${s.address.osmUrl}" rel="noopener" target="_blank">OpenStreetMap</a>`}</p>`}
            ${hasCoords
              ? html`<div id="club-map" class="map small"></div>
                  <p class="muted">${s.lat!.toFixed(4)}, ${s.lon!.toFixed(4)}</p>`
              : html`<p class="muted">No coordinates on Wikidata yet.</p>`}`
        : html`<p class="muted">No home stadium on Wikidata yet.</p>`}
    </section>

    <section>
      <h2>Links</h2>
      <ul>
        ${shownShop(c) &&
        html`<li><a href="${shownShop(c)!.url}" rel="noopener" target="_blank">${shownShop(c)!.status === 'candidate' ? 'Fan shop' : 'Official fan shop'}</a>
          ${shownShop(c)!.status === 'candidate' && html`<small class="muted">found automatically, not yet checked</small>`}</li>`}
        ${c.officialWebsite && html`<li><a href="${c.officialWebsite}" rel="noopener" target="_blank">Official website</a></li>`}
        <li><a href="https://www.wikidata.org/wiki/${c.qid}" rel="noopener" target="_blank">Wikidata ${c.qid}</a></li>
      </ul>
      ${logoCredit(c)}
    </section>
  `;
}

export function statsView(store: Store): Html {
  const clubs = currentClubs(store);
  const all = store.catalog.clubs;
  const scarves = all.flatMap((c) => c.scarves.map((s) => ({ ...s, club: c })));
  const ownedScarves = scarves.filter((s) => s.status === 'owned');
  const pct = (n: number, d: number) => (d === 0 ? '0%' : `${Math.round((100 * n) / d)}%`);

  const spent = new Map<string, number>();
  for (const s of ownedScarves) if (s.price) spent.set(s.price.currency, (spent.get(s.price.currency) ?? 0) + s.price.amount);

  const recent = ownedScarves
    .filter((s) => s.acquired?.date)
    .sort((x, y) => y.acquired!.date!.localeCompare(x.acquired!.date!))
    .slice(0, 10);

  return html`
    ${crumbs(['Stats'])}
    <h1>Stats</h1>
    <ul class="tiles">
      <li><strong>${clubs.filter(owned).length}</strong> of ${clubs.length} tier 1/2 clubs (${pct(clubs.filter(owned).length, clubs.length)})</li>
      <li><strong>${ownedScarves.length}</strong> scarves owned</li>
      <li><strong>${scarves.length - ownedScarves.length}</strong> on the wishlist</li>
      <li><strong>${store.catalog.associations.filter((a) => clubs.some((c) => c.association === a.code && owned(c))).length}</strong> of ${store.catalog.associations.length} countries started</li>
    </ul>

    <h2>By league</h2>
    <div class="table-wrap"><table class="stats">
      <thead><tr><th>League</th><th>Owned</th><th>Wishlist</th><th>Clubs</th><th>Done</th></tr></thead>
      <tbody>
        ${store.catalog.associations.map((a) =>
          store.catalog.leagues
            .filter((l) => l.association === a.code)
            .sort((x, y) => x.tier - y.tier)
            .map((l) => {
              const lc = store.clubsByLeague.get(l.qid) ?? [];
              const o = lc.filter(owned).length;
              return html`<tr>
                <td><a href="${href.league(l.qid)}">${l.name}</a> <span class="muted">${a.code}</span></td>
                <td>${o}</td><td>${lc.filter(wished).length}</td><td>${lc.length}</td><td>${pct(o, lc.length)}</td>
              </tr>`;
            }),
        )}
      </tbody>
    </table></div>

    ${spent.size > 0 && html`<p>Spent: ${[...spent].map(([cur, n]) => `${n.toFixed(2).replace(/\.00$/, '')} ${cur}`).join(', ')}</p>`}

    ${recent.length > 0 &&
    html`<h2>Latest</h2>
      <ul>${recent.map((s) => html`<li>${s.acquired!.date} · <a href="${href.club(s.club.qid)}">${s.club.name}</a>${s.type && ` · ${s.type}`}</li>`)}</ul>`}
  `;
}

export function searchView(store: Store, query: string, results: CatalogClub[]): Html {
  return html`
    ${crumbs([`Search: ${query}`])}
    <h1>${results.length} result${results.length === 1 ? '' : 's'} for “${query}”</h1>
    ${clubList(results, store, 'all', true)}
  `;
}

export function mapView(store: Store, onlyOwned: boolean): Html {
  const clubs = onlyOwned ? store.catalog.clubs.filter(owned) : store.catalog.clubs;
  const placed = clubs.filter((c) => c.stadium?.lat !== undefined).length;
  return html`
    ${crumbs(['Map'])}
    <h1>Stadium map</h1>
    <p>
      <label><input type="checkbox" id="only-owned" ${onlyOwned ? 'checked' : ''}> Only clubs whose scarf I own</label>
      <span class="muted"> · ${placed} of ${clubs.length} clubs placed</span>
    </p>
    <div id="map" class="map"></div>
  `;
}

export function notFoundView(): Html {
  return html`${crumbs(['Not found'])}<h1>Not found</h1><p><a href="${href.home()}">Back to all countries</a></p>`;
}
