// Enrichment stages: logos, uefa, colors, palettes, kits, blurbs, addresses, fanshops, homes. Each writes its own file in
// data/generated/ keyed by QID, skips what it already has (use --refresh to redo), and never
// replaces a value with nothing.
// Usage: npm run enrich [-- ROU ENG] [--stage logos,colors] [--refresh]
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { fetchAddress } from './lib/enrich/addresses.ts';
import { fetchBlurb } from './lib/enrich/blurbs.ts';
import { palette, wikidataColors } from './lib/enrich/colors.ts';
import { discoverFanshop, shouldRecheck } from './lib/enrich/fanshops.ts';
import { fetchKit } from './lib/enrich/kits.ts';
import { findHomes } from './lib/enrich/homes.ts';
import { fetchLogo } from './lib/enrich/logos.ts';
import { uefaBadgeUrl, uefaFromEntity } from './lib/enrich/uefa.ts';
import { getBytes } from './lib/http.ts';
import { claims, getEntities, itemValue } from './lib/entities.ts';
import { readJson, writeJson } from './lib/json.ts';
import { paths } from './lib/paths.ts';
import type { AddressInfo, Association, BlurbInfo, Club, ColorInfo, FanshopInfo, KitInfo, LogoInfo, Stadium, UefaInfo } from './lib/types.ts';

const STAGES = ['logos', 'uefa', 'colors', 'palettes', 'kits', 'blurbs', 'addresses', 'fanshops', 'homes'] as const;
type Stage = (typeof STAGES)[number];

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: { stage: { type: 'string' }, refresh: { type: 'boolean', default: false } },
});
const stages = (opts.stage?.split(',') ?? [...STAGES]) as Stage[];
const unknownStage = stages.find((s) => !STAGES.includes(s));
if (unknownStage) {
  console.error(`Unknown stage "${unknownStage}". Stages: ${STAGES.join(', ')}`);
  process.exit(2);
}
const refresh = opts.refresh;
const codes = positionals.map((c) => c.toUpperCase());

const allClubs = readJson<Club[]>(paths.clubs, []);
const clubs = allClubs.filter((c) => codes.length === 0 || codes.includes(c.association));
if (clubs.length === 0) {
  console.error('No clubs to enrich. Run an import first, or check the association codes.');
  process.exit(2);
}
console.log(`Enriching ${clubs.length} clubs: ${stages.join(', ')}${refresh ? ' (refresh)' : ''}`);

const sortKeys = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => Number(a.slice(1)) - Number(b.slice(1))));

/** Runs one stage over items, keeping existing values unless refreshing, and saving as it goes. */
async function stage<T>(
  name: Stage,
  file: string,
  ids: string[],
  compute: (id: string) => Promise<T | undefined>,
  redo: (existing: T) => boolean = () => false,
) {
  if (!stages.includes(name)) return;
  const data = readJson<Record<string, T>>(file, {});
  let added = 0;
  let kept = 0;
  let missing = 0;
  for (const [i, id] of ids.entries()) {
    const existing = data[id];
    if (existing && !refresh && !redo(existing)) {
      kept++;
      continue;
    }
    let value: T | undefined;
    try {
      value = await compute(id);
    } catch (e) {
      console.warn(`  ${name} ${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (value !== undefined) {
      data[id] = value;
      added++;
    } else if (!existing) missing++;
    if ((i + 1) % 20 === 0) {
      writeJson(file, sortKeys(data));
      console.log(`  ${name}: ${i + 1}/${ids.length}`);
    }
  }
  writeJson(file, sortKeys(data));
  console.log(`${name}: ${added} new or updated, ${kept} kept, ${missing} without data`);
}

const needsEntities = stages.some((s) => s === 'logos' || s === 'uefa' || s === 'colors' || s === 'kits' || s === 'blurbs');
const entities = needsEntities ? await getEntities(clubs.map((c) => c.qid), { refresh }) : new Map();
const clubIds = clubs.map((c) => c.qid);

await stage<LogoInfo>('logos', paths.enriched.logos, clubIds, (qid) => fetchLogo(qid, entities.get(qid), { refresh }));

await stage<UefaInfo>('uefa', paths.enriched.uefa, clubIds, async (qid) => uefaFromEntity(entities.get(qid)));

if (stages.includes('colors')) {
  const colorIds = [...entities.values()].flatMap((e) => claims(e, 'P6364').map(itemValue));
  const colorItems = await getEntities(colorIds, { refresh });
  await stage<ColorInfo>('colors', paths.enriched.colors, clubIds, async (qid) => wikidataColors(entities.get(qid), colorItems));
}

// Badge colours as suggestions for the editor: from the UEFA badge (read, not stored), else the Commons logo.
if (stages.includes('palettes')) {
  const uefa = readJson<Record<string, UefaInfo>>(paths.enriched.uefa, {});
  const logos = readJson<Record<string, LogoInfo>>(paths.enriched.logos, {});
  await stage<string[]>('palettes', paths.enriched.palettes, clubIds, async (qid) => {
    if (uefa[qid]) {
      const badge = await getBytes(uefaBadgeUrl(uefa[qid].id, 100));
      if (badge.status === 200) return palette(badge.bytes);
    }
    const logo = logos[qid] && join(paths.logos, logos[qid].file);
    return logo && existsSync(logo) ? palette(logo) : undefined;
  });
}

await stage<KitInfo>('kits', paths.enriched.kits, clubIds, (qid) => fetchKit(entities.get(qid), { refresh }));

await stage<BlurbInfo>('blurbs', paths.enriched.blurbs, clubIds, (qid) => fetchBlurb(entities.get(qid), { refresh }));

const stadiumById = new Map(readJson<Stadium[]>(paths.stadiums, []).map((s) => [s.qid, s]));
const stadiumIds = [...new Set(clubs.flatMap((c) => c.stadiumIds))];
await stage<AddressInfo>('addresses', paths.enriched.addresses, stadiumIds, async (qid) => {
  const s = stadiumById.get(qid);
  return s ? fetchAddress(s, { refresh }) : undefined;
});

const robotsCache = new Map<string, string>();
const websiteOf = new Map(clubs.map((c) => [c.qid, c.officialWebsite]));
await stage<FanshopInfo>(
  'fanshops',
  paths.enriched.fanshops,
  clubIds.filter((q) => websiteOf.get(q)),
  (qid) => discoverFanshop(websiteOf.get(qid)!, robotsCache),
  shouldRecheck,
);

// Cross-border clubs (Swansea in the English pyramid, Vaduz in the Swiss one). Recomputed for the
// clubs of this run on every run; the SPARQL cache makes repeats free.
if (stages.includes('homes')) {
  const associations = readJson<Association[]>(paths.associations, []);
  const { homes, ambiguous } = await findHomes(clubs, associations, { refresh });
  const data = readJson<Record<string, string | string[]>>(paths.enriched.homes, {});
  for (const c of clubs) delete data[c.qid];
  Object.assign(data, homes, ambiguous);
  writeJson(paths.enriched.homes, sortKeys(data));
  const name = (q: string) => clubs.find((c) => c.qid === q)?.name ?? q;
  console.log(`homes: ${Object.keys(homes).length} cross-border (${Object.entries(homes).map(([q, h]) => `${name(q)} -> ${h}`).join(', ') || 'none'}), ${Object.keys(ambiguous).length} ambiguous`);
}
