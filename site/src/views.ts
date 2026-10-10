import type { CatalogClub, Store } from './data.ts';
import { owned, wished } from './data.ts';
import { html, type Html } from './html.ts';
import { href } from './router.ts';

const progress = (clubs: CatalogClub[]) => html`<span class="progress">${clubs.filter(owned).length} of ${clubs.length}</span>`;

function badge(c: CatalogClub): Html {
  if (owned(c)) return html`<span class="badge owned">owned</span>`;
  if (wished(c)) return html`<span class="badge wish">wishlist</span>`;
  return html``;
}

function clubList(clubs: CatalogClub[], store: Store, showLeague = false): Html {
  if (clubs.length === 0) return html`<p class="muted">No clubs.</p>`;
  return html`<ul class="clubs">
    ${clubs.map(
      (c) => html`<li>
        <a href="${href.club(c.qid)}">${c.name}</a> ${badge(c)}
        <span class="muted">${showLeague ? `${store.league.get(c.league)?.name ?? ''} · ` : ''}${c.stadium?.name ?? 'stadium unknown'}</span>
      </li>`,
    )}
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
  const pending = 55 - catalog.associations.length;
  return html`
    <h1>My scarves <small class="muted">${progress(catalog.clubs)} clubs</small></h1>
    <p class="muted">Tier 1 and 2 clubs, season ${catalog.season}.</p>
    <ul class="cards">
      ${catalog.associations.map((a) => {
        const clubs = catalog.clubs.filter((c) => c.association === a.code);
        return html`<li><a class="card" href="${href.association(a.code)}">
          <strong>${a.name}</strong><span class="muted">${a.code}</span>${progress(clubs)}
        </a></li>`;
      })}
    </ul>
    ${pending > 0 && html`<p class="muted">${pending} more associations to import.</p>`}
  `;
}

export function associationView(store: Store, code: string): Html {
  const a = store.association.get(code);
  if (!a) return notFoundView();
  const leagues = store.catalog.leagues.filter((l) => l.association === code).sort((x, y) => x.tier - y.tier);
  return html`
    ${crumbs([a.name])}
    <h1>${a.name}</h1>
    ${a.notes && html`<p class="muted">${a.notes}</p>`}
    ${leagues.map((l) => {
      const clubs = store.clubsByLeague.get(l.qid) ?? [];
      return html`<section>
        <h2><a href="${href.league(l.qid)}">${l.name}</a> <small class="muted">tier ${l.tier} · ${progress(clubs)}</small></h2>
        ${clubList(clubs, store)}
      </section>`;
    })}
  `;
}

export function leagueView(store: Store, qid: string): Html {
  const l = store.league.get(qid);
  const a = l && store.association.get(l.association);
  if (!l || !a) return notFoundView();
  const clubs = store.clubsByLeague.get(qid) ?? [];
  return html`
    ${crumbs([a.name, href.association(a.code)], [l.name])}
    <h1>${l.name} <small class="muted">${progress(clubs)}</small></h1>
    ${clubList(clubs, store)}
  `;
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
    <h1>${c.name} ${badge(c)}</h1>
    <p class="muted">${l.name} · ${a.name}</p>

    <section>
      <h2>Stadium</h2>
      ${s
        ? html`<p><strong>${s.name}</strong>${s.capacity !== undefined && html` · ${s.capacity.toLocaleString('en')} seats`}</p>
            ${hasCoords
              ? html`<div id="club-map" class="map small"></div>
                  <p class="muted">${s.lat!.toFixed(4)}, ${s.lon!.toFixed(4)}</p>`
              : html`<p class="muted">No coordinates on Wikidata yet.</p>`}`
        : html`<p class="muted">No home stadium on Wikidata yet.</p>`}
    </section>

    <section>
      <h2>My scarves</h2>
      ${c.scarves.length === 0
        ? html`<p class="muted">No scarf yet.</p>`
        : html`<ul>${c.scarves.map((sc) => html`<li>${sc.status}${sc.type && html` · ${sc.type}`}${sc.notes && html` · ${sc.notes}`}</li>`)}</ul>`}
    </section>

    <section>
      <h2>Links</h2>
      <ul>
        ${c.officialWebsite && html`<li><a href="${c.officialWebsite}" rel="noopener" target="_blank">Official website</a></li>`}
        <li><a href="https://www.wikidata.org/wiki/${c.qid}" rel="noopener" target="_blank">Wikidata ${c.qid}</a></li>
      </ul>
    </section>
  `;
}

export function searchView(store: Store, query: string, results: CatalogClub[]): Html {
  return html`
    ${crumbs([`Search: ${query}`])}
    <h1>${results.length} result${results.length === 1 ? '' : 's'} for “${query}”</h1>
    ${clubList(results, store, true)}
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
