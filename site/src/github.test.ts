import { afterEach, describe, expect, it, vi } from 'vitest';
import { fromBase64, toBase64, updateFile } from './github.ts';
import { applyEdit } from './overrides.ts';

describe('base64', () => {
  it('round-trips UTF-8', () => {
    const text = '{"name":"Stadionul Giulești – Valentin Stănescu"}';
    expect(fromBase64(toBase64(text))).toBe(text);
    expect(fromBase64('eyJh\nIjoxfQ==')).toBe('{"a":1}');
  });
});

describe('applyEdit', () => {
  it('sets and unsets fields, sorts by QID, drops empty entries', () => {
    const before = JSON.stringify({ Q245162: { blurb: { text: 'x' } }, Q9617: { colors: { primary: '#f00' } } });
    const after = applyEdit(before, {
      Q245162: { set: { stadiumIds: ['Q97889239', 'Q1888199'] }, unset: ['blurb'] },
      Q9617: { unset: ['colors'] },
      Q97889239: { set: { address: { text: 'Calea Giulești 18' } } },
    });
    expect(after).toBe(
      JSON.stringify({ Q245162: { stadiumIds: ['Q97889239', 'Q1888199'] }, Q97889239: { address: { text: 'Calea Giulești 18' } } }, null, 2) + '\n',
    );
  });
  it('starts from an empty file', () => {
    expect(applyEdit('', { Q1: { set: { logoSource: 'none' } } })).toBe('{\n  "Q1": {\n    "logoSource": "none"\n  }\n}\n');
  });
});

describe('updateFile', () => {
  afterEach(() => vi.unstubAllGlobals());
  const config = { token: 't', repo: 'me/repo', branch: 'main' };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  it('retries once on a stale sha, re-applying the change to the newer file', async () => {
    const calls: { method: string; body?: { content: string; sha?: string } }[] = [];
    const responses = [
      json(200, { content: toBase64('{"Q1":{"a":1}}'), sha: 'old' }),
      json(409, { message: 'conflict' }),
      json(200, { content: toBase64('{"Q1":{"a":1},"Q2":{"b":2}}'), sha: 'new' }),
      json(200, {}),
    ];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit = {}) => {
      calls.push({ method: init.method ?? 'GET', ...(init.body ? { body: JSON.parse(init.body as string) } : {}) });
      return responses.shift()!;
    });
    const saved = await updateFile(config, 'data/manual/overrides.json', (t) => applyEdit(t, { Q3: { set: { c: 3 } } }), 'edit');
    expect(saved).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(['GET', 'PUT', 'GET', 'PUT']);
    expect(calls[3]!.body!.sha).toBe('new');
    expect(JSON.parse(fromBase64(calls[3]!.body!.content))).toEqual({ Q1: { a: 1 }, Q2: { b: 2 }, Q3: { c: 3 } });
  });

  it('does not commit when nothing changes', async () => {
    vi.stubGlobal('fetch', async () => json(200, { content: toBase64('{}\n'), sha: 's' }));
    expect(await updateFile(config, 'x.json', (t) => t, 'edit')).toBe(false);
  });
});
