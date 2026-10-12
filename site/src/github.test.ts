import { afterEach, describe, expect, it, vi } from 'vitest';
import { bytesToBase64, commitFiles, fromBase64, toBase64, updateFile } from './github.ts';
import { applyEdit } from './overrides.ts';

describe('base64', () => {
  it('round-trips UTF-8', () => {
    const text = '{"name":"Stadionul Giulești – Valentin Stănescu"}';
    expect(fromBase64(toBase64(text))).toBe(text);
    expect(fromBase64('eyJh\nIjoxfQ==')).toBe('{"a":1}');
  });
  it('encodes binary data larger than one chunk', () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, i) => i % 256);
    expect(Uint8Array.from(atob(bytesToBase64(bytes)), (c) => c.charCodeAt(0))).toEqual(bytes);
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

describe('commitFiles', () => {
  afterEach(() => vi.unstubAllGlobals());
  const config = { token: 't', repo: 'me/repo', branch: 'main' };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  it('commits on top of the branch head, and starts over from the new head if the branch moved', async () => {
    const calls: string[] = [];
    const trees: unknown[] = [];
    let head = 'c1';
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      const path = url.replace('https://api.github.com/repos/me/repo', '');
      const method = init.method ?? 'GET';
      calls.push(`${method} ${path.replace(/\?.*/, '')}`);
      if (path === '/git/ref/heads/main') return json(200, { object: { sha: head } });
      if (path.startsWith('/git/commits/')) return json(200, { tree: { sha: `tree-of-${path.slice(13)}` } });
      if (path.startsWith('/contents/')) return json(200, { content: toBase64(`scarves at ${path.split('ref=')[1]}`), sha: 'f' });
      if (path === '/git/trees') return trees.push(JSON.parse(init.body as string)), json(201, { sha: 'tree-new' });
      if (path === '/git/commits') return json(201, { sha: 'new-commit' });
      // Someone else pushed between reading and moving the branch, the first time only.
      if (path === '/git/refs/heads/main') return head === 'c1' ? ((head = 'c2'), json(422, { message: 'Update is not a fast forward' })) : json(200, {});
      throw new Error(`unexpected ${path}`);
    });
    const seen: string[] = [];
    await commitFiles(config, 'Add scarf', async (read) => {
      const text = await read('data/collection/scarves.json');
      seen.push(text);
      return [{ path: 'assets/photos/x-1/1.jpg', blobSha: 'b1' }, { path: 'data/collection/scarves.json', text: `${text}+1` }];
    });
    expect(seen).toEqual(['scarves at c1', 'scarves at c2']);
    expect(trees[1]).toEqual({
      base_tree: 'tree-of-c2',
      tree: [
        { path: 'assets/photos/x-1/1.jpg', mode: '100644', type: 'blob', sha: 'b1' },
        { path: 'data/collection/scarves.json', mode: '100644', type: 'blob', content: 'scarves at c2+1' },
      ],
    });
    expect(calls.filter((c) => c.startsWith('PATCH'))).toHaveLength(2);
  });
});
