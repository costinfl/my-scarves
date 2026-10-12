import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import { dirSize, savePhoto } from './photos.ts';
import { findClubs, nextScarfId, parsePrice, slug, thumbOf, checkScarfInput, makeScarf } from './scarves.ts';
import type { Club } from './types.ts';

const club = (qid: string, name: string): Club => ({ qid, name, association: 'ROU', leagues: [], stadiumIds: [] });
const clubs = [club('Q1', 'FC Rapid București'), club('Q2', 'Rapid'), club('Q3', 'FC Dinamo Bucharest'), club('Q4', 'FC Brașov')];

describe('findClubs', () => {
  it('finds by QID', () => expect(findClubs(clubs, 'q3').map((c) => c.qid)).toEqual(['Q3']));
  it('prefers an exact name match', () => expect(findClubs(clubs, 'rapid').map((c) => c.qid)).toEqual(['Q2']));
  it('matches all words, ignoring diacritics', () => {
    expect(findClubs(clubs, 'rapid bucuresti').map((c) => c.qid)).toEqual(['Q1']);
    expect(findClubs(clubs, 'brasov').map((c) => c.qid)).toEqual(['Q4']);
  });
  it('returns several matches when ambiguous', () => expect(findClubs(clubs, 'fc').length).toBe(3));
});

describe('ids and parsing', () => {
  it('slugs names', () => expect(slug('Cádiz CF / Ñandú')).toBe('cadiz-cf-nandu'));
  it('numbers scarves per club', () => {
    expect(nextScarfId(clubs[0]!, [])).toBe('fc-rapid-bucuresti-1');
    expect(nextScarfId(clubs[0]!, [{ id: 'fc-rapid-bucuresti-1', clubQid: 'Q1', status: 'owned' }])).toBe('fc-rapid-bucuresti-2');
  });
  it('parses prices', () => {
    expect(parsePrice('50 ron')).toEqual({ amount: 50, currency: 'RON' });
    expect(parsePrice('49,90 EUR')).toEqual({ amount: 49.9, currency: 'EUR' });
    expect(parsePrice('cheap')).toBeUndefined();
  });
  it('derives thumbnail paths', () => expect(thumbOf('x-1/2.jpg')).toBe('x-1/2.thumb.jpg'));
});

describe('savePhoto', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scarves-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('resizes to 1600 px plus a 400 px thumbnail and strips metadata', async () => {
    const input = join(dir, 'in.png');
    await sharp({ create: { width: 4000, height: 1000, channels: 3, background: '#b3261e' } })
      .withMetadata({ exif: { IFD0: { Copyright: 'secret' } } })
      .png()
      .toFile(input);

    const rel = await savePhoto(input, join(dir, 'photos'), 'rapid-1', 1);
    expect(rel).toBe('rapid-1/1.jpg');

    const full = await sharp(join(dir, 'photos', rel)).metadata();
    const thumb = await sharp(join(dir, 'photos', thumbOf(rel))).metadata();
    expect([full.format, full.width, full.height]).toEqual(['jpeg', 1600, 400]);
    expect([thumb.width, thumb.height]).toEqual([400, 100]);
    expect(full.exif).toBeUndefined();
    expect(dirSize(join(dir, 'photos'))).toBeGreaterThan(0);
  });

  it('never enlarges small photos', async () => {
    const input = join(dir, 'small.jpg');
    await sharp({ create: { width: 300, height: 200, channels: 3, background: '#fff' } }).jpeg().toFile(input);
    const rel = await savePhoto(input, join(dir, 'photos'), 'small-1', 1);
    expect((await sharp(join(dir, 'photos', rel)).metadata()).width).toBe(300);
  });
});

describe('checkScarfInput and makeScarf', () => {
  it('rejects bad values with a message', () => {
    expect(checkScarfInput({ status: 'sold' })).toMatch(/Status/);
    expect(checkScarfInput({ type: 'scarf' })).toMatch(/Type/);
    expect(checkScarfInput({ date: '12.05.2024' })).toMatch(/Date/);
    expect(checkScarfInput({ price: 'fifty' })).toMatch(/Price/);
    expect(checkScarfInput({ status: '', type: '', date: '2024-05', price: '50 ron' })).toBeUndefined();
  });

  it('builds the entry, leaving out empty fields and defaulting to owned', () => {
    expect(makeScarf('rapid-1', 'Q245162', { type: '', date: '2024-05-12', place: ' Giulești ', price: '50 ron', notes: '' }, ['rapid-1/1.jpg'])).toEqual({
      id: 'rapid-1',
      clubQid: 'Q245162',
      status: 'owned',
      acquired: { date: '2024-05-12', place: 'Giulești' },
      price: { amount: 50, currency: 'RON' },
      photos: ['rapid-1/1.jpg'],
    });
    expect(makeScarf('x-1', 'Q1', { status: 'wishlist' }, [])).toEqual({ id: 'x-1', clubQid: 'Q1', status: 'wishlist' });
  });
});
