import { describe, expect, it } from 'vitest';
import { family, familiesOf } from './colours.ts';

describe('family', () => {
  it.each([
    ['#E30613', 'red'],
    ['#7A263A', 'red'], // claret
    ['#F58220', 'orange'],
    ['#FFD700', 'yellow'],
    ['#00843D', 'green'],
    ['#000080', 'blue'], // navy
    ['#87CEEB', 'blue'], // sky blue
    ['#5B2C83', 'purple'], // FC Argeș
    ['#FF69B4', 'pink'],
    ['#000000', 'black'],
    ['#0A0A0A', 'black'],
    ['#FFFFFF', 'white'],
    ['#F5F5F5', 'white'],
    ['#808080', 'grey'],
  ])('%s is %s', (hex, expected) => expect(family(hex)).toBe(expected));

  it('ignores values that are not six-digit hex', () => {
    expect(family('red')).toBeUndefined();
    expect(family('#fff')).toBeUndefined();
  });
});

describe('familiesOf', () => {
  it('combines primary and secondary without duplicates', () => {
    expect(familiesOf({ primary: '#000000', secondary: '#FFFFFF' })).toEqual(['black', 'white']);
    expect(familiesOf({ primary: '#E30613', secondary: '#C00000' })).toEqual(['red']);
    expect(familiesOf({ primary: '#E30613' })).toEqual(['red']);
    expect(familiesOf(undefined)).toEqual([]);
  });
});
