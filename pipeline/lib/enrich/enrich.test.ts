import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import type { Entity } from '../entities.ts';
import { formatAddress } from './addresses.ts';
import { trimSentences } from './blurbs.ts';
import { logoColors, wikidataColors } from './colors.ts';
import { findShopLinks, isMarketplace, looksLikeShop, robotsAllows } from './fanshops.ts';

describe('trimSentences', () => {
  const text =
    'Arsenal F.C. is a professional football club based in Islington, London. ' +
    'Arsenal compete in the Premier League. ' +
    'The club has won 13 league titles. ' +
    'It was founded in 1886.';

  it('keeps at most three whole sentences and does not split on "F.C."', () => {
    expect(trimSentences(text)).toBe(
      'Arsenal F.C. is a professional football club based in Islington, London. Arsenal compete in the Premier League. The club has won 13 league titles.',
    );
  });

  it('stops before exceeding the length budget, but always keeps the first sentence', () => {
    expect(trimSentences(text, 3, 100)).toBe('Arsenal F.C. is a professional football club based in Islington, London.');
    expect(trimSentences('A very long first sentence that goes on.', 3, 10)).toBe('A very long first sentence that goes on.');
  });
});

describe('formatAddress', () => {
  it('builds street, postcode and city in local form', () => {
    expect(formatAddress({ road: 'Strada Giulești', house_number: '18', postcode: '060271', city: 'București', country: 'România' })).toBe(
      'Strada Giulești 18, 060271 București',
    );
  });
  it('falls back to town or village, and returns undefined when empty', () => {
    expect(formatAddress({ road: 'High St', town: 'Burnley' })).toBe('High St, Burnley');
    expect(formatAddress({ country: 'España' })).toBeUndefined();
  });
});

describe('robotsAllows', () => {
  const robots = `
User-agent: *
Disallow: /admin
Disallow: /*.pdf$
Allow: /admin/public

User-agent: BadBot
Disallow: /
`;
  it('applies the * group, longest match wins', () => {
    expect(robotsAllows(robots, '/')).toBe(true);
    expect(robotsAllows(robots, '/admin/secret')).toBe(false);
    expect(robotsAllows(robots, '/admin/public/x')).toBe(true);
    expect(robotsAllows(robots, '/files/a.pdf')).toBe(false);
  });
  it('uses a group naming our agent instead of *', () => {
    expect(robotsAllows('User-agent: my-scarves\nDisallow: /\n\nUser-agent: *\nAllow: /', '/', 'my-scarves/0.1')).toBe(false);
  });
  it('allows everything for an empty file', () => expect(robotsAllows('', '/shop')).toBe(true));
});

describe('findShopLinks', () => {
  const html = `
    <a href="/news">News</a>
    <a href="https://www.club.ro/magazine">Magazine</a>
    <a href="/en/store/">Club <b>Store</b></a>
    <a href="https://shop.club.ro/kit?utm_source=club&amp;utm_medium=nav">Fans</a>
    <a href="/tickets?x=1">Official merchandise</a>
    <a href="https://www.emag.ro/club">eMAG</a>
    <a href="mailto:shop@club.ro">mail</a>`;
  const links = findShopLinks(html, 'https://www.club.ro/');

  it('ranks shop subdomains (linked at their root), then paths, then link text; drops tracking; ignores "magazine" and mailto', () => {
    expect(links.map((l) => l.url)).toEqual(['https://shop.club.ro', 'https://www.club.ro/en/store', 'https://www.club.ro/tickets']);
  });
  it('flags marketplaces', () => {
    expect(isMarketplace('https://www.emag.ro/club')).toBe(true);
    expect(isMarketplace('https://shop.club.ro')).toBe(false);
  });
  it('recognises shop pages', () => {
    expect(looksLikeShop('<button>Add to cart</button>')).toBe(true);
    expect(looksLikeShop('<span>Fular 49,90 lei</span>')).toBe(true);
    expect(looksLikeShop('<p>Latest news</p>')).toBe(false);
  });
});

describe('colors', () => {
  const entity = (claimsByProp: Record<string, unknown[]>, label = ''): Entity => ({
    id: 'Q0',
    claims: Object.fromEntries(
      Object.entries(claimsByProp).map(([p, vs]) => [p, vs.map((v) => ({ rank: 'normal' as const, mainsnak: { datavalue: { value: v } } }))]),
    ),
    sitelinks: {},
    labels: label ? { en: { value: label } } : {},
  });

  it('takes official colours in statement order with hex from the colour items', () => {
    const club = entity({ P6364: [{ id: 'Q1' }, { id: 'Q2' }, { id: 'Q3' }] });
    const items = new Map([
      ['Q1', entity({ P465: ['800032'] }, 'bordeaux')],
      ['Q2', entity({ P465: ['FFFFFF'] }, 'white')],
      ['Q3', entity({}, 'no hex')],
    ]);
    expect(wikidataColors(club, items)).toEqual({ primary: '#800032', secondary: '#FFFFFF', names: ['bordeaux', 'white'], source: 'wikidata' });
    expect(wikidataColors(entity({}), items)).toBeUndefined();
  });

  const dir = mkdtempSync(join(tmpdir(), 'logo-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('extracts the two dominant logo colours, ignoring transparency', async () => {
    const file = join(dir, 'logo.svg');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <rect width="100" height="60" fill="#7B1E2B"/><rect y="60" width="100" height="30" fill="#FFFFFF"/></svg>`;
    await sharp(Buffer.from(svg)).toFile(file.replace('.svg', '.png'));
    const colors = await logoColors(file.replace('.svg', '.png'));
    expect(colors).toEqual({ primary: '#7B1E2B', secondary: '#FFFFFF', source: 'auto' });
  });
});
