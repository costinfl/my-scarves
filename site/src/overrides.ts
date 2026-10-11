import type { Overrides } from '../../pipeline/lib/types.ts';

export const OVERRIDES_PATH = 'data/manual/overrides.json';

export type Entry = Overrides[string];

/** One editor save: fields to set and fields to drop (back to automatic), per QID (club or stadium). */
export type Edit = Record<string, { set?: Record<string, unknown>; unset?: string[] }>;

const byQid = (a: string, b: string) => Number(a.slice(1)) - Number(b.slice(1)) || a.localeCompare(b);

/**
 * Applies an edit to the text of overrides.json and returns the new text, formatted like the
 * pipeline writes JSON (2 spaces, trailing newline) with keys in QID order, so diffs stay small.
 * Entries left empty are removed.
 */
export function applyEdit(text: string, edit: Edit): string {
  const current = (text.trim() ? JSON.parse(text) : {}) as Overrides;
  for (const [qid, { set = {}, unset = [] }] of Object.entries(edit)) {
    const entry: Record<string, unknown> = { ...(current[qid] ?? {}) };
    for (const key of unset) delete entry[key];
    Object.assign(entry, set);
    if (Object.keys(entry).length === 0) delete current[qid];
    else current[qid] = entry as Entry;
  }
  const sorted = Object.fromEntries(Object.entries(current).sort(([a], [b]) => byQid(a, b)));
  return JSON.stringify(sorted, null, 2) + '\n';
}
