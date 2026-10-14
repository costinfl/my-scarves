import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const data = (...p: string[]) => join(ROOT, 'data', ...p);

export const paths = {
  associations: data('seed', 'associations.json'),
  seedLeagues: data('seed', 'leagues.json'),
  clubs: data('generated', 'clubs.json'),
  stadiums: data('generated', 'stadiums.json'),
  leagues: data('generated', 'leagues.json'),
  importReport: data('generated', 'import-report.json'),
  coverage: data('generated', 'coverage.md'),
  overrides: data('manual', 'overrides.json'),
  scarves: data('collection', 'scarves.json'),
  photos: join(ROOT, 'assets', 'photos'),
  logos: join(ROOT, 'assets', 'logos'),
  httpCache: data('cache', 'http'),
  entityCache: data('cache', 'entities'),
  enriched: {
    logos: data('generated', 'logos.json'),
    uefa: data('generated', 'uefa.json'),
    colors: data('generated', 'colors.json'),
    palettes: data('generated', 'palettes.json'),
    kits: data('generated', 'kits.json'),
    blurbs: data('generated', 'blurbs.json'),
    addresses: data('generated', 'addresses.json'),
    fanshops: data('generated', 'fanshops.json'),
    homes: data('generated', 'homes.json'),
  },
  wikidataCache: data('cache', 'wikidata'),
};
