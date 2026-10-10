import { describe, expect, it } from 'vitest';
import { commonsFile, parsePoint, qid } from './wikidata.ts';

describe('wikidata helpers', () => {
  it('extracts QIDs only from entity URIs', () => {
    expect(qid('http://www.wikidata.org/entity/Q9448')).toBe('Q9448');
    expect(qid('http://www.wikidata.org/entity/P118')).toBeUndefined();
    expect(qid(undefined)).toBeUndefined();
  });

  it('parses WKT points as lon lat', () => {
    expect(parsePoint('Point(-0.2795 51.556)')).toEqual({ lat: 51.556, lon: -0.2795 });
    expect(parsePoint('garbage')).toBeUndefined();
  });

  it('decodes Commons file names', () => {
    expect(commonsFile('http://commons.wikimedia.org/wiki/Special:FilePath/FC%20Rapid%20Bucure%C8%99ti.svg')).toBe(
      'FC Rapid București.svg',
    );
  });
});
