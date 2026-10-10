# Scarf collection: implementation plan (static site on GitHub Pages)

Repo: https://github.com/costinfl/my-scarves
Goal: personal catalogue of fan scarves for the 1st and 2nd division clubs of all 55 UEFA associations.
Each club page has a few presentation phrases, the stadium (name, address, coordinates), logo, colors,
a best-effort official fan shop link, and the photo(s) of my scarf.

## 1. Stack
- Node 22, TypeScript everywhere (site and pipeline).
- Site: Vite + vanilla TS (or Preact), Leaflet + OpenStreetMap tiles, MiniSearch, installable PWA.
  Vite `base` must be `/my-scarves/`.
- Pipeline: Node scripts in `pipeline/`, `sharp` for images, `vitest` for tests.
- Hosting: GitHub Pages deployed by GitHub Actions. No backend and no database.

## 2. Repo layout
```
CLAUDE.md                  conventions for Claude Code
PLAN.md
site/                      Vite app; builds from data/ into site/public/data/
pipeline/                  import, enrich, merge, add-scarf scripts + tests
data/
  seed/associations.json   55 UEFA associations (from the old V2 SQL)
  seed/leagues.json        tier 1/2 league per association with verified Wikidata QID
  generated/               pipeline-owned, never hand-edited
  manual/overrides.json    my edits keyed by club QID (wins over generated)
  collection/scarves.json  my scarves
assets/logos/<qid>.(svg|png)
assets/photos/<scarfId>/<n>.jpg + thumbs
.github/workflows/import.yml, deploy.yml
```

## 3. Data model (JSON, Wikidata QID is the key)
- association: code, name, notes (WAL, LIE, MON edge cases)
- league: association, tier (1|2), name, qid
- club: qid, name, shortName, association, leagues + season, logo, colors{primary,secondary,source:auto|manual},
  blurb{text,source URL,status:draft|reviewed}, officialWebsite,
  fanshop{url,status:unchecked|candidate|confirmed|none|manual,checkedAt}, stadiumIds
- stadium: qid, name, address, lat, lon, capacity
- scarf: id, clubQid, status owned|wishlist, type match|vintage|supporter|other, acquired date/place,
  price+currency, condition, notes, photos[]

Merge rule at build time: generated, then overrides, then collection.
The importer never writes to `manual/` or `collection/`. Empty values never erase existing ones.

## 4. Pipeline stages (all idempotent, cached in repo)
1. import: SPARQL per league QID (P118 membership without an end date, P115 home venue, P625, P1083, P856).
   Descriptive User-Agent. Throttle. Exclude reserve/B teams (name patterns + review list).
2. logos: Wikidata P154 -> Commons file. Store the file and its license/attribution.
3. colors: palette extracted from the logo (sharp), flagged `auto`.
4. addresses: Nominatim reverse geocoding, 1 request/s, cached (about 25 min for everything).
5. blurbs: Wikipedia REST summary via the club sitelink, trimmed to 2-3 sentences, status `draft`,
   source link kept (CC BY-SA, so attribute).
6. fanshop: official site -> homepage links matching shop keywords (shop, store, fanshop, magazin,
   boutique, tienda, negozio, loja, webshop, merch) -> HTTP 200 + shop-like page -> `candidate`.
   Respect robots.txt, rate-limit, run once per club. Third-party marketplaces are flagged, not used.
7. coverage report: per association, counts of clubs / missing stadium / coordinates / logo / website.

## 5. GitHub Actions
- `import.yml`: workflow_dispatch with input "association codes"; runs the stages, opens a PR with the data diff
  so I can review before merging.
- `deploy.yml`: on push to main, build and deploy with the official Pages actions.
  Manual step: Settings > Pages > Source = GitHub Actions.

## 6. Site features
Country > league > club browse, global search, club page (logo, colors, phrases, stadium + map, fan shop link,
scarf photos), stadium map of the scarves I own, filters (country, league, owned / wishlist / missing),
progress stats ("37 of N"), responsive, offline-capable.

## 7. Phases (each ends with something deployed)
- P0 Bootstrap: tooling, CI, hello-world site live at https://costinfl.github.io/my-scarves/.
- P1 Seed + pilot import (ROU, ENG, ESP): verify league QIDs against Wikidata labels, coverage report.
  Done when the three countries produce clubs with stadiums and the report is readable.
- P2 Browse UI on pilot data: navigation, search, club page, map.
- P3 Collection: `npm run add-scarf` (club, photo, status; resizes to ~1600px + thumb), owned/wishlist, stats.
- P4 Enrichment: logos, colors, blurbs, addresses, fan shop discovery, review via overrides.json.
- P5 Scale to all 55 associations in batches (about 5 per run), fix edge cases:
  Welsh clubs in England, Liechtenstein in Switzerland, Monaco in France, Russia, associations with no real tier 2.
- P6 Phone admin page: add or edit scarves via a fine-grained GitHub token (this repo only, kept in the browser),
  committing through the GitHub API; backup/export; yearly season-refresh job.

## 8. Risks and open items
- Wikidata coverage is uneven for tier-2 clubs. If P118 is sparse, fall back to Wikipedia season pages.
  Judge it from the P1 coverage report, not before.
- League QIDs for Premier League (Q9448) and La Liga (Q324867) came from memory. Verify, don't trust.
- Repo visibility: free Pages needs a public repo, so photos and trademarked logos are public. Decision needed.
- Repo size: resize every photo, keep photos under about 300 MB in total.
- Edits go live about a minute after a push.