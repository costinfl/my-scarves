// Checks every league in data/seed/leagues.json against its Wikidata label. Exit code 1 on any mismatch.
// Usage: npm run verify-leagues [-- ROU ENG]
import { checkLeagues } from './lib/leagues.ts';
import { readJson } from './lib/json.ts';
import { paths } from './lib/paths.ts';
import type { SeedLeague } from './lib/types.ts';

const codes = process.argv.slice(2).map((c) => c.toUpperCase());
const seeds = readJson<SeedLeague[]>(paths.seedLeagues, []).filter(
  (l) => codes.length === 0 || codes.includes(l.association),
);

const checks = await checkLeagues(seeds, { refresh: true });
for (const c of checks) {
  const where = `${c.seed.association} tier ${c.seed.tier}`;
  if (c.ok) {
    const size = c.info?.participants ? `, ${c.info.participants} participants` : '';
    console.log(`OK    ${where}: ${c.seed.qid} "${c.info?.label}"${size}`);
  } else {
    console.log(`FAIL  ${where}: ${c.problem}`);
  }
}
if (checks.some((c) => !c.ok)) process.exitCode = 1;
