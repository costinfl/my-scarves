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

/** Photo sizes (longest side, px), shared by the CLI (sharp) and the site's add-scarf form (canvas). */
export const PHOTO_SIZE = 1600;
export const THUMB_SIZE = 400;

/** The scarf fields as typed by me, in the CLI or the site form. Empty strings count as not given. */
export interface ScarfInput {
  status?: string;
  type?: string;
  date?: string;
  place?: string;
  price?: string;
  condition?: string;
  notes?: string;
}

/** Checks the input and returns an error message, or undefined when it is valid. */
export function checkScarfInput(input: ScarfInput): string | undefined {
  const t = (s?: string) => s?.trim() ?? '';
  if (t(input.status) && !(STATUSES as readonly string[]).includes(t(input.status))) return `Status must be one of ${STATUSES.join(', ')}`;
  if (t(input.type) && !(TYPES as readonly string[]).includes(t(input.type))) return `Type must be one of ${TYPES.join(', ')}`;
  if (t(input.date) && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(t(input.date))) return 'Date must look like 2024, 2024-05 or 2024-05-12';
  if (t(input.price) && !parsePrice(t(input.price))) return 'Price must look like "50 RON" or "49.90 EUR"';
  return undefined;
}

/** Builds the scarves.json entry from checked input; status defaults to owned. */
export function makeScarf(id: string, clubQid: string, input: ScarfInput, photos: string[]): Scarf {
  const t = (s?: string) => s?.trim() || undefined;
  const [date, place, price] = [t(input.date), t(input.place), t(input.price)];
  return {
    id,
    clubQid,
    status: (t(input.status) ?? 'owned') as Scarf['status'],
    ...(t(input.type) ? { type: t(input.type) as Scarf['type'] } : {}),
    ...(date || place ? { acquired: { ...(date ? { date } : {}), ...(place ? { place } : {}) } } : {}),
    ...(price ? { price: parsePrice(price)! } : {}),
    ...(t(input.condition) ? { condition: t(input.condition)! } : {}),
    ...(t(input.notes) ? { notes: t(input.notes)! } : {}),
    ...(photos.length ? { photos } : {}),
  };
}
