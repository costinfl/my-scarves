// Writes data/generated/coverage.md from the generated data and prints it.
// Usage: npm run coverage
import { writeFileSync } from 'node:fs';
import { seasonFor } from './lib/clubs.ts';
import { coverageMarkdown } from './lib/coverage.ts';
import { readJson } from './lib/json.ts';
import { paths } from './lib/paths.ts';

const md = coverageMarkdown({
  season: seasonFor(new Date()),
  associations: readJson(paths.associations, []),
  leagues: readJson(paths.leagues, []),
  clubs: readJson(paths.clubs, []),
  stadiums: readJson(paths.stadiums, []),
  report: readJson(paths.importReport, {}),
});
writeFileSync(paths.coverage, md, 'utf8');
console.log(md);
