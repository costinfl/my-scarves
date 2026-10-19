// Builds data/generated/countries.geo.json, the outlines for the progress map, from Natural Earth's public-domain
// 1:10m "admin 0 map units" (the UK split into England, Scotland, Wales and Northern Ireland; Gibraltar included).
// Run rarely (`npm run geo`): borders don't move. The 13 MB download is kept in .cache/ (ignored by git).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { countryFeature, type SourceFeature } from './lib/geo.ts';
import { readJson } from './lib/json.ts';
import { paths, ROOT } from './lib/paths.ts';
import { USER_AGENT } from './lib/wikidata.ts';
import type { Association } from './lib/types.ts';

const SOURCE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_map_units.geojson';
const CACHE = join(ROOT, '.cache', 'ne_10m_admin_0_map_units.geojson');
/** Degrees, about 5 km: invisible at country scale, and keeps the file near 200 KB (about 70 KB gzipped). */
const TOLERANCE = 0.05;

if (!existsSync(CACHE)) {
  console.log(`Downloading ${SOURCE}`);
  const res = await fetch(SOURCE, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Natural Earth download failed: ${res.status}`);
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  writeFileSync(CACHE, Buffer.from(await res.arrayBuffer()));
}
const source = JSON.parse(readFileSync(CACHE, 'utf8')) as { features: SourceFeature[] };

const associations = readJson<Association[]>(paths.associations, []);
const features = [];
for (const a of associations) {
  // Match on the Wikidata QID; Belgium and Bosnia only exist as several map units, so fall back to their ADM0 code.
  let matches = source.features.filter((f) => a.country && f.properties.WIKIDATAID === a.country);
  if (matches.length === 0) matches = source.features.filter((f) => f.properties.ADM0_A3 === a.code);
  const feature = countryFeature(a.code, matches, TOLERANCE);
  if (feature) features.push(feature);
  else console.warn(`${a.code}: no outline found in Natural Earth`);
}

const out = paths.countries;
// Compact on purpose: pretty-printed coordinates would be 1.6 MB. Generated, never edited by hand.
writeFileSync(out, JSON.stringify({ type: 'FeatureCollection', attribution: 'Natural Earth (public domain)', features }) + '\n');
console.log(`geo: ${features.length} of ${associations.length} associations, ${(readFileSync(out).length / 1024).toFixed(0)} KB`);
