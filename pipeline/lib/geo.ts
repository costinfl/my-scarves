// Shrinks Natural Earth country outlines to what the progress map needs: Europe-sized polygons,
// simplified (Douglas-Peucker) and rounded, one feature per UEFA association.
export type Position = [number, number];
export type Ring = Position[];
export type Polygon = Ring[];

export interface SourceFeature {
  properties: Record<string, unknown>;
  geometry: { type: 'Polygon'; coordinates: Polygon } | { type: 'MultiPolygon'; coordinates: Polygon[] } | null;
}

export interface CountryFeature {
  type: 'Feature';
  properties: { code: string };
  geometry: { type: 'MultiPolygon'; coordinates: Polygon[] };
}

/** Lon/lat box that holds every association's home territory (Azores to Kazakhstan, Israel to Svalbard's latitude). */
export const EUROPE = { minLon: -32, maxLon: 90, minLat: 27, maxLat: 82 };

const polygonsOf = (f: SourceFeature): Polygon[] =>
  !f.geometry ? [] : f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;

/** Average of the outer ring's points: good enough to tell French Guiana from France. */
export function centroid(ring: Ring): Position {
  const n = ring.length || 1;
  return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
}

function distanceToSegment([x, y]: Position, [x1, y1]: Position, [x2, y2]: Position): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

/** Douglas-Peucker on an open line; the first and last points are always kept. */
export function simplifyLine(points: Ring, tolerance: number): Ring {
  if (points.length < 3) return points;
  let index = 0;
  let max = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = distanceToSegment(points[i]!, points[0]!, points.at(-1)!);
    if (d > max) [index, max] = [i, d];
  }
  if (max <= tolerance) return [points[0]!, points.at(-1)!];
  return [...simplifyLine(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplifyLine(points.slice(index), tolerance)];
}

const round = (p: Position, digits: number): Position => [Number(p[0].toFixed(digits)), Number(p[1].toFixed(digits))];

/**
 * Simplifies and rounds a closed ring. A ring that would collapse below a triangle (Gibraltar, San Marino) is
 * kept at full detail instead, so small associations never disappear from the map.
 */
export function simplifyRing(ring: Ring, tolerance: number, digits = 3): Ring {
  const simplified = simplifyLine(ring, tolerance).map((p) => round(p, digits));
  const deduped = simplified.filter((p, i) => i === 0 || p[0] !== simplified[i - 1]![0] || p[1] !== simplified[i - 1]![1]);
  if (deduped.length >= 4) return deduped;
  return ring.map((p) => round(p, digits));
}

/**
 * One MultiPolygon per association from the source features matched to it (Belgium and Bosnia come as several
 * map units). Polygons whose centre lies outside Europe (overseas territories, Chukotka across the date line)
 * are dropped; holes are kept.
 */
export function countryFeature(code: string, sources: SourceFeature[], tolerance: number): CountryFeature | undefined {
  const polygons = sources
    .flatMap(polygonsOf)
    .filter((poly) => {
      const [lon, lat] = centroid(poly[0]!);
      return lon >= EUROPE.minLon && lon <= EUROPE.maxLon && lat >= EUROPE.minLat && lat <= EUROPE.maxLat;
    })
    .map((poly) => poly.map((ring) => simplifyRing(ring, tolerance)));
  if (polygons.length === 0) return undefined;
  return { type: 'Feature', properties: { code }, geometry: { type: 'MultiPolygon', coordinates: polygons } };
}
