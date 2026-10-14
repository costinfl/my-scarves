import { kitColors, parseKit } from './kits.ts';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import type { Entity } from '../entities.ts';
import { formatAddress } from './addresses.ts';
import { trimSentences } from './blurbs.ts';
import { palette, wikidataColors } from './colors.ts';
import { parseUefaId, uefaBadgeUrl } from './uefa.ts';
import { decideHome } from './homes.ts';

describe('decideHome', () => {
  it('is unset when the club is located where its league is, or nowhere known', () => {
    expect(decideHome('ENG', ['ENG'])).toBeUndefined();
    expect(decideHome('FRA', [])).toBeUndefined(); // AS Monaco: Monaco is not a UEFA member
  });
  it('picks the one other association (Swansea in an English league, Vaduz in a Swiss one)', () => {
    expect(decideHome('ENG', ['WAL'])).toBe('WAL');
    expect(decideHome('SUI', ['LIE'])).toBe('LIE');
  });
  it('returns the candidates when ambiguous', () => expect(decideHome('IRL', ['NIR', 'ENG'])).toEqual(['ENG', 'NIR']));
});
import { findShopLinks, isMarketplace, looksLikeShop, robotsAllows, shouldRecheck, TERMS_VERSION } from './fanshops.ts';

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
  it('prefers the town over a borough-level city, and says London', () => {
    expect(formatAddress({ road: 'Halfords Lane', town: 'Smethwick', city: 'Sandwell', postcode: 'B71 4LD' })).toBe('Halfords Lane, B71 4LD Smethwick');
    expect(formatAddress({ road: 'Queensland Road', city: 'Greater London', postcode: 'N7 7FF' })).toBe('Queensland Road, N7 7FF London');
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
    expect(looksLikeShop('<button>Afegeix a la cistella</button>')).toBe(true);
  });
  it('finds Catalan, Italian and French shop words', () => {
    const links = findShopLinks('<a href="/botiga">Botiga</a><a href="/it/bottega-ufficiale">x</a><a href="/la-boutique">x</a>', 'https://www.fcandorra.ad/');
    expect(links.map((l) => l.url)).toEqual(['https://www.fcandorra.ad/botiga', 'https://www.fcandorra.ad/it/bottega-ufficiale', 'https://www.fcandorra.ad/la-boutique']);
  });
  it('checks again clubs where older search words found nothing, once', () => {
    expect(shouldRecheck({ status: 'none' })).toBe(true);
    expect(shouldRecheck({ status: 'none', terms: TERMS_VERSION })).toBe(false);
    expect(shouldRecheck({ status: 'unchecked', terms: TERMS_VERSION })).toBe(true);
    expect(shouldRecheck({ status: 'candidate', url: 'https://shop.x' })).toBe(false);
  });
});

describe('uefa', () => {
  it('parses ids, slugs and team URLs', () => {
    expect(parseUefaId('53030')).toBe('53030');
    expect(parseUefaId('53030--petrolul')).toBe('53030');
    expect(parseUefaId('https://www.uefa.com/nationalassociations/teams/53030--petrolul/')).toBe('53030');
    expect(parseUefaId('Petrolul')).toBeUndefined();
  });
  it('builds badge URLs', () => expect(uefaBadgeUrl('53030')).toBe('https://img.uefa.com/imgml/TP/teams/logos/240x240/53030.png'));
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

  it('lists the main badge colours, most common first, ignoring transparency and tiny details', async () => {
    const file = join(dir, 'badge.png');
    // Bordeaux body, white band, a small yellow star (about 3% of the badge), transparent corners.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <rect x="10" width="80" height="60" fill="#7B1E2B"/><rect x="10" y="60" width="80" height="30" fill="#FFFFFF"/>
      <rect x="45" y="2" width="17" height="17" fill="#FFD700"/><rect x="48" y="90" width="2" height="2" fill="#00FF00"/></svg>`;
    await sharp(Buffer.from(svg)).png().toFile(file);
    const colours = await palette(file);
    // Downscaling blends edge pixels, so the star may come out a shade off #FFD700.
    expect(colours.slice(0, 2)).toEqual(['#7B1E2B', '#FFFFFF']);
    expect(colours).toHaveLength(3);
    expect(colours[2]).toMatch(/^#F[EF]D[67]0[0-9A-F]$/);
  });
});

describe('kits', () => {
  const infobox = `{{Infobox football club
| clubname = Dinamo București
| pattern_la1 = _dinamo2526h
| leftarm1 = FF0000 | body1 = ff0000 | rightarm1 = FF0000
| shorts1 = #FFF
| socks1 = FF0000
| body2 = FFFFFF
}}`;
  it('reads the home kit from the infobox, hex only', () => {
    expect(parseKit(infobox)).toEqual({ body: '#FF0000', shorts: '#FFFFFF', socks: '#FF0000' });
    expect(parseKit('| body1 = red\n| shorts1 = FFFFFF')).toBeUndefined();
    expect(parseKit('| body1 = \n| shorts1 = FFFFFF')).toBeUndefined();
  });
  it('uses the shirt first, then the first of shorts and socks that differs', () => {
    const source = 'https://en.wikipedia.org/wiki/FC_Dinamo_Bucure%C8%99ti';
    expect(kitColors({ body: '#FF0000', shorts: '#FFFFFF', socks: '#FF0000', source })).toEqual({ primary: '#FF0000', secondary: '#FFFFFF', source: 'kit', sourceUrl: source });
    expect(kitColors({ body: '#800080', shorts: '#800080', source })).toEqual({ primary: '#800080', source: 'kit', sourceUrl: source });
  });
});
