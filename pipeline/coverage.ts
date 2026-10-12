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
  enrichment: {
    logos: readJson(paths.enriched.logos, {}),
    uefa: readJson(paths.enriched.uefa, {}),
    colors: readJson(paths.enriched.colors, {}),
    palettes: readJson(paths.enriched.palettes, {}),
    blurbs: readJson(paths.enriched.blurbs, {}),
    addresses: readJson(paths.enriched.addresses, {}),
    fanshops: readJson(paths.enriched.fanshops, {}),
    homes: readJson(paths.enriched.homes, {}),
  },
});
writeFileSync(paths.coverage, md, 'utf8');
console.log(md);
