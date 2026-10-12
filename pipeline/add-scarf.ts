// Adds a scarf to data/collection/scarves.json, with its photos resized into assets/photos/<id>/.
// Usage:
//   npm run add-scarf                                   (asks for club, status and photos)
//   npm run add-scarf -- --club "Rapid" --photo ~/Pictures/rapid.jpg [--photo back.jpg]
//        [--status owned|wishlist] [--type match|vintage|supporter|other]
//        [--date 2024-05-12] [--place "Giulești"] [--price "50 RON"] [--condition good] [--notes "..."]
// This is my own tool for my own collection; the import/enrichment pipeline never writes there.
import { existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { readJson, writeJson } from './lib/json.ts';
import { paths } from './lib/paths.ts';
import { dirSize, savePhoto } from './lib/photos.ts';
import { checkScarfInput, findClubs, makeScarf, nextScarfId, type ScarfInput } from './lib/scarves.ts';
import type { Club, Scarf } from './lib/types.ts';

const PHOTO_BUDGET_MB = 300;

const { values: opts } = parseArgs({
  options: {
    club: { type: 'string' },
    photo: { type: 'string', multiple: true, default: [] },
    status: { type: 'string' },
    type: { type: 'string' },
    date: { type: 'string' },
    place: { type: 'string' },
    price: { type: 'string' },
    condition: { type: 'string' },
    notes: { type: 'string' },
  },
});

const interactive = process.stdin.isTTY === true;
const rl = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : undefined;

function fail(msg: string): never {
  console.error(msg);
  rl?.close();
  process.exit(1);
}

async function ask(question: string): Promise<string> {
  if (!rl) fail(`Missing input: ${question.trim()} (pass it as a flag when not running in a terminal)`);
  return (await rl.question(question)).trim();
}

const expandHome = (p: string) => resolve(p.replace(/^~(?=$|[/\\])/, homedir()));

const clubs = readJson<Club[]>(paths.clubs, []);
if (clubs.length === 0) fail('No clubs in data/generated/clubs.json. Run an import first.');

// Club
let query = opts.club ?? (await ask('Club (name or QID): '));
let club: Club | undefined;
while (!club) {
  const matches = findClubs(clubs, query);
  if (matches.length === 1) club = matches[0];
  else if (matches.length === 0) query = await ask(`No club matches "${query}". Try again: `);
  else {
    const shown = matches.slice(0, 15);
    shown.forEach((c, i) => console.log(`  ${i + 1}. ${c.name} (${c.association}, ${c.qid})`));
    if (matches.length > shown.length) console.log(`  … and ${matches.length - shown.length} more; type a longer name`);
    const pick = await ask('Number, or a more specific name: ');
    const n = Number(pick);
    if (Number.isInteger(n) && n >= 1 && n <= shown.length) club = shown[n - 1];
    else query = pick;
  }
}

// Status and the other fields
const { type, date, place, price, condition, notes } = opts;
const input: ScarfInput = {
  type, date, place, price, condition, notes,
  status: opts.status ?? (interactive && !opts.club ? await ask('Status [owned]/wishlist: ') : undefined),
};
const invalid = checkScarfInput(input);
if (invalid) fail(invalid);

// Photos: check every file before writing anything.
const photoInputs = opts.photo.map(expandHome);
if (photoInputs.length === 0 && interactive && !opts.club) {
  for (;;) {
    const p = await ask(`Photo path ${photoInputs.length ? '(empty to finish)' : '(empty for none)'}: `);
    if (!p) break;
    photoInputs.push(expandHome(p.replace(/^['"]|['"]$/g, '')));
  }
}
for (const p of photoInputs) if (!existsSync(p)) fail(`Photo not found: ${p}`);
rl?.close();

const scarves = readJson<Scarf[]>(paths.scarves, []);
const id = nextScarfId(club, scarves);

const photos: string[] = [];
try {
  for (const [i, input] of photoInputs.entries()) photos.push(await savePhoto(input, paths.photos, id, i + 1));
} catch (e) {
  rmSync(resolve(paths.photos, id), { recursive: true, force: true });
  fail(`Could not process photo: ${e instanceof Error ? e.message : String(e)}`);
}

const scarf = makeScarf(id, club.qid, input, photos);
writeJson(paths.scarves, [...scarves, scarf]);

console.log(`Added ${scarf.id}: ${club.name}, ${scarf.status}, ${photos.length} photo(s).`);
const mb = dirSize(paths.photos) / 1_000_000;
console.log(`Photos total ${mb.toFixed(1)} MB of the ~${PHOTO_BUDGET_MB} MB budget.`);
if (mb > PHOTO_BUDGET_MB) console.warn('Over budget: GitHub Pages sites should stay well under 1 GB.');
console.log('Commit data/collection/scarves.json and assets/photos/ to publish it.');
