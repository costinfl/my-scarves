// Merges generated data, data/manual/overrides.json and data/collection/scarves.json into
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
  overrides: readJson(paths.overrides, {}),
  scarves: readJson(paths.scarves, []),
});
writeJson(join(ROOT, 'site', 'public', 'data', 'catalog.json'), catalog);

const scarves = readJson<{ id: string; clubQid: string }[]>(paths.scarves, []);
const shown = new Set(catalog.clubs.map((c) => c.qid));
for (const s of scarves) {
  if (!shown.has(s.clubQid)) console.warn(`scarf ${s.id}: club ${s.clubQid} is not in the generated data, so it is not shown`);
}

// Photos live in assets/photos (committed); the site serves a copy from site/public/photos (ignored by git).
const photosOut = join(ROOT, 'site', 'public', 'photos');
rmSync(photosOut, { recursive: true, force: true });
if (existsSync(paths.photos)) cpSync(paths.photos, photosOut, { recursive: true });
console.log(`catalog: season ${catalog.season}, ${catalog.clubs.length} clubs, ${catalog.associations.length} associations`);
