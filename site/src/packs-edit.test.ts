import { describe, expect, it } from 'vitest';
import { addPack, setMembership, slugify } from './packs-edit.ts';

const file = (packs: object[]) => JSON.stringify(packs, null, 2) + '\n';
const lions = { id: 'lions', name: 'Lion teams', clubs: ['Q1', 'Q2'] };
const favs = { id: 'favs', name: 'Favourites', clubs: ['Q2'] };

describe('slugify', () => {
  it.each([
    ['Lion teams', 'lion-teams'],
    ['Şoimii Pâncota!', 'soimii-pancota'],
    ['  Eagles & Hawks  ', 'eagles-hawks'],
  ])('%s -> %s', (name, id) => expect(slugify(name)).toBe(id));
});

describe('setMembership', () => {
  it('adds at the end, removes elsewhere, and leaves other clubs alone', () => {
    const shown = ['lions', 'favs'];
    const next = JSON.parse(setMembership(file([lions, favs]), 'Q3', ['lions'], shown));
    expect(next[0].clubs).toEqual(['Q1', 'Q2', 'Q3']);
    expect(next[1].clubs).toEqual(['Q2']);
    const removed = JSON.parse(setMembership(file([lions, favs]), 'Q2', ['favs'], shown));
    expect(removed[0].clubs).toEqual(['Q1']);
    expect(removed[1].clubs).toEqual(['Q2']);
  });

  it('returns the same text when nothing changes, so no empty commit is made', () => {
    const text = file([lions, favs]);
    expect(setMembership(text, 'Q2', ['lions', 'favs'], ['lions', 'favs'])).toBe(text);
    const handFormatted = JSON.stringify([lions, favs]);
    expect(setMembership(handFormatted, 'Q2', ['lions', 'favs'], ['lions', 'favs'])).toBe(handFormatted);
  });

  it('leaves packs the form did not show alone, so a stale page cannot remove a club from a newer pack', () => {
    const next = JSON.parse(setMembership(file([lions, favs]), 'Q2', [], ['lions']));
    expect(next[0].clubs).toEqual(['Q1']);
    expect(next[1].clubs).toEqual(['Q2']);
  });
});

describe('addPack', () => {
  it('appends a pack, optionally with a first club, trimming text', () => {
    const next = JSON.parse(addPack('', { id: 'lions', name: ' Lion teams ', description: ' ' }, 'Q9'));
    expect(next).toEqual([{ id: 'lions', name: 'Lion teams', clubs: ['Q9'] }]);
  });

  it('refuses taken or unusable ids and empty names', () => {
    expect(() => addPack(file([lions]), { id: 'lions', name: 'Again' })).toThrow(/already exists/);
    expect(() => addPack('', { id: 'Lion Teams', name: 'x' })).toThrow(/lowercase/);
    expect(() => addPack('', { id: 'x', name: '  ' })).toThrow(/name/);
  });
});
