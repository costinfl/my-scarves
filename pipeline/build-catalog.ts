// Merges generated data, data/manual/overrides.json and data/collection/scarves.json into
// site/public/data/catalog.json, the single file the site loads. Runs before dev and build.
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
console.log(`catalog: season ${catalog.season}, ${catalog.clubs.length} clubs, ${catalog.associations.length} associations`);
