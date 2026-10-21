// Merges generated data, data/manual/overrides.json and data/collection (scarves, packs) into
// site/public/data/catalog.json, the single file the site loads. Runs before dev and build.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { buildCatalog } from './lib/catalog.ts';
import { readJson, writeJson } from './lib/json.ts';
import { paths, ROOT } from './lib/paths.ts';

const catalog = buildCatalog({
  associations: readJson(paths.associations, []),
  leagues: readJson(paths.leagues, []),
  clubs: readJson(paths.clubs, []),
  stadiums: readJson(paths.stadiums, []),
  enrichment: {
    logos: readJson(paths.enriched.logos, {}),
    uefa: readJson(paths.enriched.uefa, {}),
    colors: readJson(paths.enriched.colors, {}),
    palettes: readJson(paths.enriched.palettes, {}),
    kits: readJson(paths.enriched.kits, {}),
    blurbs: readJson(paths.enriched.blurbs, {}),
    addresses: readJson(paths.enriched.addresses, {}),
    fanshops: readJson(paths.enriched.fanshops, {}),
    homes: readJson(paths.enriched.homes, {}),
  },
  overrides: readJson(paths.overrides, {}),
  scarves: readJson(paths.scarves, []),
  packs: readJson(paths.packs, []),
});
writeJson(join(ROOT, 'site', 'public', 'data', 'catalog.json'), catalog);
// Country outlines for the progress map (built rarely by `npm run geo`).
if (existsSync(paths.countries)) cpSync(paths.countries, join(ROOT, 'site', 'public', 'data', 'countries.geo.json'));

const scarves = readJson<{ id: string; clubQid: string }[]>(paths.scarves, []);
const shown = new Set(catalog.clubs.map((c) => c.qid));
for (const s of scarves) {
  if (!shown.has(s.clubQid)) console.warn(`scarf ${s.id}: club ${s.clubQid} is not in the generated data, so it is not shown`);
}

const packs = readJson<{ id: string; clubs: string[] }[]>(paths.packs, []);
for (const p of packs) {
  if (!/^[a-z0-9-]+$/.test(p.id)) console.warn(`pack "${p.id}": use lowercase letters, digits and dashes in the id, it goes in the URL`);
  if (packs.filter((o) => o.id === p.id).length > 1) console.warn(`pack "${p.id}": the id is used more than once`);
  for (const q of p.clubs) if (!shown.has(q)) console.warn(`pack ${p.id}: club ${q} is not in the generated data, so it is not shown`);
}

// Photos live in assets/photos (committed); the site serves a copy from site/public/photos (ignored by git).
// Same for logos.
for (const [from, to] of [
  [paths.photos, join(ROOT, 'site', 'public', 'photos')],
  [paths.logos, join(ROOT, 'site', 'public', 'logos')],
] as const) {
  rmSync(to, { recursive: true, force: true });
  if (existsSync(from)) cpSync(from, to, { recursive: true });
}
console.log(`catalog: season ${catalog.season}, ${catalog.clubs.length} clubs, ${catalog.associations.length} associations`);
