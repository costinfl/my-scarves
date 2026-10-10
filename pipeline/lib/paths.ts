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
  wikidataCache: data('cache', 'wikidata'),
};
