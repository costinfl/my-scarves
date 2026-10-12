import { describe, expect, it } from 'vitest';
import { appendScarf, photoPaths, scarfIdFor } from './scarf-form.ts';

describe('scarf form helpers', () => {
  it('appends to scarves.json, starting from a missing file', () => {
    const first = appendScarf('', { id: 'a-1', clubQid: 'Q1', status: 'owned' });
    expect(first).toBe('[\n  {\n    "id": "a-1",\n    "clubQid": "Q1",\n    "status": "owned"\n  }\n]\n');
    expect(JSON.parse(appendScarf(first, { id: 'a-2', clubQid: 'Q1', status: 'wishlist' })).map((s: { id: string }) => s.id)).toEqual(['a-1', 'a-2']);
  });

  it('numbers ids and photo paths after the existing scarves', () => {
    const text = JSON.stringify([{ id: 'fc-rapid-bucuresti-1', clubQid: 'Q245162', status: 'owned' }]);
    expect(scarfIdFor({ name: 'FC Rapid București' }, text)).toBe('fc-rapid-bucuresti-2');
    expect(photoPaths('x-1', 2)).toEqual(['x-1/1.jpg', 'x-1/2.jpg']);
  });
});
