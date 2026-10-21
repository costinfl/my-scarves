import { describe, expect, it } from 'vitest';
import { countryFeature, simplifyLine, simplifyRing, type Ring, type SourceFeature } from './geo.ts';

const square = (x: number, y: number, size: number): Ring => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
  [x, y],
];

describe('simplifyLine', () => {
  it('drops points closer to the line than the tolerance and keeps the corners', () => {
    const line: Ring = [
      [0, 0],
      [1, 0.001],
      [2, 0],
      [2, 2],
    ];
    expect(simplifyLine(line, 0.01)).toEqual([
      [0, 0],
      [2, 0],
      [2, 2],
    ]);
  });
});

describe('simplifyRing', () => {
  it('keeps a tiny territory at full detail instead of collapsing it', () => {
    const gibraltar = square(-5.35, 36.11, 0.01);
    expect(simplifyRing(gibraltar, 0.05)).toEqual(gibraltar);
  });

  it('rounds coordinates', () => {
    expect(simplifyRing(square(10.12345, 50.98765, 2), 0.01)[0]).toEqual([10.123, 50.988]);
  });
});

describe('countryFeature', () => {
  const poly = (ring: Ring): SourceFeature => ({ properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } });

  it('merges map units into one MultiPolygon and drops polygons outside Europe', () => {
    const flanders = poly(square(3, 50.8, 1));
    const wallonia = poly(square(4, 49.8, 1));
    const guiana: SourceFeature = { properties: {}, geometry: { type: 'MultiPolygon', coordinates: [[square(-53, 4, 1)]] } };
    const f = countryFeature('BEL', [flanders, wallonia, guiana], 0.01)!;
    expect(f.properties.code).toBe('BEL');
    expect(f.geometry.coordinates).toHaveLength(2);
  });

  it('returns nothing when no polygon is in Europe', () => {
    expect(countryFeature('XXX', [poly(square(-53, 4, 1))], 0.01)).toBeUndefined();
  });
});
