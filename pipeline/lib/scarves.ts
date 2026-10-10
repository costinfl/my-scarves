import type { Club, Scarf } from './types.ts';

export const STATUSES = ['owned', 'wishlist'] as const;
export const TYPES = ['match', 'vintage', 'supporter', 'other'] as const;

/** Lower-case, no diacritics: "Brașov" and "brasov" compare equal. */
export const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function slug(s: string): string {
  return fold(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Stable, readable id used as the photo folder name: "fc-rapid-bucuresti-2". */
export function nextScarfId(club: Pick<Club, 'name'>, existing: Scarf[]): string {
  const base = slug(club.name) || 'scarf';
  const taken = new Set(existing.map((s) => s.id));
  for (let n = 1; ; n++) {
    const id = `${base}-${n}`;
    if (!taken.has(id)) return id;
  }
}

/**
 * Finds clubs by QID or by name. An exact (folded) name match wins over partial matches,
 * so "Rapid" doesn't also return "SC Rapid Bucharest II" when a club is called exactly "Rapid".
 */
export function findClubs(clubs: Club[], query: string): Club[] {
  const q = query.trim();
  if (/^Q\d+$/i.test(q)) return clubs.filter((c) => c.qid === q.toUpperCase());
  const fq = fold(q);
  if (!fq) return [];
  const exact = clubs.filter((c) => fold(c.name) === fq);
  if (exact.length > 0) return exact;
  const words = fq.split(/\s+/);
  return clubs.filter((c) => words.every((w) => fold(c.name).includes(w)));
}

/** "50 RON" / "49.90 EUR" -> {amount, currency}. */
export function parsePrice(s: string): { amount: number; currency: string } | undefined {
  const m = s.trim().match(/^(\d+(?:[.,]\d+)?)\s*([A-Za-z]{3})$/);
  if (!m) return undefined;
  return { amount: Number(m[1]!.replace(',', '.')), currency: m[2]!.toUpperCase() };
}

/** Thumbnail path for a photo path: "x-1/1.jpg" -> "x-1/1.thumb.jpg". */
export const thumbOf = (photo: string) => photo.replace(/\.jpg$/, '.thumb.jpg');
