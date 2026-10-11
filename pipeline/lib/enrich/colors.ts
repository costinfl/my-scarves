import sharp from 'sharp';
import { claims, itemValue, stringValue, type Entity } from '../entities.ts';
import type { ColorInfo } from '../types.ts';

/** Colours from P6364 "official colour", in Wikidata's statement order; hex from the colour item's P465. */
export function wikidataColors(club: Entity | undefined, colorItems: Map<string, Entity>): ColorInfo | undefined {
  const picked: { hex: string; name: string }[] = [];
  for (const c of claims(club, 'P6364')) {
    const item = colorItems.get(itemValue(c));
    const hex = claims(item, 'P465').map(stringValue)[0];
    if (!item || !hex || !/^[0-9A-Fa-f]{6}$/.test(hex)) continue;
    if (!picked.some((p) => p.hex === hex.toUpperCase())) picked.push({ hex: hex.toUpperCase(), name: item.labels.en?.value ?? '' });
  }
  if (picked.length === 0) return undefined;
  return {
    primary: `#${picked[0]!.hex}`,
    ...(picked[1] ? { secondary: `#${picked[1].hex}` } : {}),
    names: picked.map((p) => p.name).filter(Boolean),
    source: 'wikidata',
  };
}

/**
 * The main colours of a badge, most common first, as suggestions for me to pick from.
 * Not a guess at the club colours: a badge's yellow championship star is not a club colour.
 * Pixels are bucketed to 4 bits per channel; transparent pixels are ignored; near-duplicates are merged.
 */
export async function palette(input: string | Buffer, max = 5): Promise<string[]> {
  const { data, info } = await sharp(input, { density: 72 })
    .resize(64, 64, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const counts = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < info.width * info.height * 4; i += 4) {
    if (data[i + 3]! < 128) continue;
    const [r, g, b] = [data[i]!, data[i + 1]!, data[i + 2]!];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = counts.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n++;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    counts.set(key, bucket);
  }
  const total = [...counts.values()].reduce((n, b) => n + b.n, 0);
  const picked: (readonly number[])[] = [];
  for (const b of [...counts.values()].sort((x, y) => y.n - x.n)) {
    if (b.n < total * 0.02) break; // ignore anti-aliasing and tiny details
    const c = [b.r / b.n, b.g / b.n, b.b / b.n] as const;
    if (picked.every((p) => distance(p, c) > 60)) picked.push(c);
    if (picked.length >= max) break;
  }
  return picked.map(toHex);
}

const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
const toHex = (c: readonly number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
