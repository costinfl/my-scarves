import { noEnrichment, type Enrichment } from './catalog.ts';
import type { Association, Club, LeagueImportResult, LeagueInfo, Stadium } from './types.ts';

export interface CoverageInput {
  season: string;
  associations: Association[];
  leagues: LeagueInfo[];
  clubs: Club[];
  stadiums: Stadium[];
  report: Record<string, LeagueImportResult[]>;
  enrichment?: Enrichment;
}

/** Markdown coverage report: one row per association, then per-league detail for review. */
export function coverageMarkdown({ season, associations, leagues, clubs, stadiums, report, enrichment = noEnrichment }: CoverageInput): string {
  const stadiumById = new Map(stadiums.map((s) => [s.qid, s]));
  const current = clubs.filter((c) => c.leagues.some((m) => m.season === season));
  const primary = (c: Club) => (c.stadiumIds[0] ? stadiumById.get(c.stadiumIds[0]) : undefined);
  const hasCoords = (c: Club) => primary(c)?.lat !== undefined;
  const pct = (n: number, total: number) => (total === 0 ? '-' : `${n} (${Math.round((100 * n) / total)}%)`);

  const out: string[] = [`# Coverage report, season ${season}`, ''];
  out.push('Counts are clubs with a current tier 1/2 membership. "Missing" columns count clubs lacking the field.', '');
  out.push('| Association | Clubs | Expected | No stadium | No coordinates | No logo | No website |');
  out.push('|---|---:|---:|---:|---:|---:|---:|');

  const imported = associations.filter((a) => report[a.code]);
  for (const a of imported) {
    const cs = current.filter((c) => c.association === a.code);
    const expected = leagues.filter((l) => l.association === a.code).reduce((n, l) => n + (l.participants ?? 0), 0);
    out.push(
      `| ${a.code} ${a.name} | ${cs.length} | ${expected || '?'} | ${pct(cs.filter((c) => !primary(c)).length, cs.length)} | ` +
        `${pct(cs.filter((c) => !hasCoords(c)).length, cs.length)} | ${pct(cs.filter((c) => !c.logoFile).length, cs.length)} | ` +
        `${pct(cs.filter((c) => !c.officialWebsite).length, cs.length)} |`,
    );
  }
  out.push('', `Not imported yet: ${associations.length - imported.length} of ${associations.length} associations.`, '');

  const e = enrichment;
  out.push('## Enrichment', '');
  out.push('Counts of clubs that have the field. Logo: UEFA badge / Commons file. Colours: Wikidata official colours.', '');
  out.push('| Association | Clubs | Logo | Colours | Blurb | Stadium address | Fan shop candidate |');
  out.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const a of imported) {
    const cs = current.filter((c) => c.association === a.code);
    const has = (f: (c: Club) => boolean) => pct(cs.filter(f).length, cs.length);
    const count = (f: (c: Club) => boolean) => cs.filter(f).length;
    out.push(
      `| ${a.code} ${a.name} | ${cs.length} | ${count((c) => !!e.uefa[c.qid])} / ${count((c) => !!e.logos[c.qid])} | ${has((c) => !!e.colors[c.qid])} | ` +
        `${has((c) => !!e.blurbs[c.qid])} | ${has((c) => !!(c.stadiumIds[0] && e.addresses[c.stadiumIds[0]]))} | ` +
        `${has((c) => e.fanshops[c.qid]?.status === 'candidate')} |`,
    );
  }
  out.push('');

  out.push('## Leagues', '');
  out.push('| League | Tier | Status | Clubs found | Wikidata P1132 | Difference |');
  out.push('|---|---:|---|---:|---:|---:|');
  for (const a of imported) {
    for (const r of report[a.code] ?? []) {
      const info = leagues.find((l) => l.qid === r.league);
      const found = current.filter((c) => c.leagues.some((m) => m.season === season && m.league === r.league)).length;
      const diff = info?.participants ? found - info.participants : undefined;
      out.push(
        `| ${a.code} ${r.name} (${r.league}) | ${info?.tier ?? '?'} | ${r.status} | ${found} | ${info?.participants ?? '?'} | ` +
          `${diff === undefined ? '?' : diff > 0 ? `+${diff}` : diff} |`,
      );
    }
  }

  for (const a of imported) {
    for (const r of report[a.code] ?? []) {
      const info = leagues.find((l) => l.qid === r.league);
      const members = current
        .filter((c) => c.leagues.some((m) => m.season === season && m.league === r.league))
        .map((c) => c.name)
        .sort((x, y) => x.localeCompare(y));
      if (!info?.participants || members.length === info.participants) continue;
      out.push(
        '',
        `<details><summary>${a.code} ${r.name}: ${members.length} found, ${info.participants} expected</summary>`,
        '',
        members.join(', '),
        '',
        '</details>',
      );
    }
  }

  const issues: string[] = [];
  for (const c of current) {
    const tiers = new Set(c.leagues.filter((m) => m.season === season).map((m) => m.tier));
    if (tiers.size > 1) issues.push(`- ${c.association} ${c.name} (${c.qid}): current member of both tiers`);
  }
  for (const c of current) {
    if (c.stadiumIds.length > 1) {
      const names = c.stadiumIds.map((id) => stadiumById.get(id)?.name ?? id).join(', ');
      issues.push(`- ${c.association} ${c.name} (${c.qid}): several home venues (${names}); first one shown, set stadiumIds in overrides.json to choose`);
    }
    if (!primary(c)) issues.push(`- ${c.association} ${c.name} (${c.qid}): no home venue (P115)`);
    else if (!hasCoords(c)) issues.push(`- ${c.association} ${c.name} (${c.qid}): stadium ${primary(c)!.name} has no coordinates`);
  }
  for (const a of imported) {
    for (const r of report[a.code] ?? []) {
      for (const x of r.excluded) issues.push(`- ${a.code} ${r.name}: excluded ${x}`);
    }
  }
  for (const c of current) {
    const home = enrichment.homes[c.qid];
    if (typeof home === 'string') issues.push(`- ${c.association} ${c.name} (${c.qid}): plays abroad, home association ${home}`);
    else if (Array.isArray(home)) issues.push(`- ${c.association} ${c.name} (${c.qid}): located in several countries (${home.join(', ')}); home left unset`);
  }
  out.push('', '## To review', '', ...(issues.length ? issues.sort() : ['Nothing.']), '');
  return out.join('\n');
}
