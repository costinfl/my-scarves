// Colour families for the scarf wall filter, worked out from a club's hex colours.
// Coarse on purpose: "blue" should match navy and sky blue alike.
export const FAMILIES = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'black', 'white', 'grey'] as const;
export type Family = (typeof FAMILIES)[number];

export function family(hex: string): Family | undefined {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return undefined;
  const n = parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  if (l < 0.12) return 'black';
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (s < 0.15) return l > 0.8 ? 'white' : l < 0.3 ? 'black' : 'grey';
  if (l > 0.93) return 'white';
  const h = max === r ? (60 * ((g - b) / d) + 360) % 360 : max === g ? 60 * ((b - r) / d) + 120 : 60 * ((r - g) / d) + 240;
  if (h < 15 || h >= 340) return 'red';
  if (h < 40) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 170) return 'green';
  if (h < 255) return 'blue';
  if (h < 290) return 'purple';
  return 'pink';
}

/** Families of a club's primary and secondary colours (none when the colours are unknown). */
export const familiesOf = (colors: { primary: string; secondary?: string } | undefined): Family[] =>
  colors ? [...new Set([colors.primary, colors.secondary].flatMap((c) => (c ? (family(c) ?? []) : [])))] : [];
