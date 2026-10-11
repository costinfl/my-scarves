// Saves my edits by committing to the repo through GitHub's REST API, with a fine-grained token
// (this repo only, Contents: read and write) that lives only in this browser's localStorage.
// Like a tiny REST client in Java: fetch() is the HttpClient, JSON in and out.

export interface GitHubConfig {
  token: string;
  repo: string; // "owner/name"
  branch: string;
}

const KEY = 'my-scarves.github';
export const DEFAULT_REPO = 'costinfl/my-scarves';

export function loadConfig(): GitHubConfig | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    const c = raw ? (JSON.parse(raw) as GitHubConfig) : undefined;
    return c?.token ? c : undefined;
  } catch {
    return undefined;
  }
}

export function saveConfig(c: GitHubConfig | undefined): void {
  try {
    if (c) localStorage.setItem(KEY, JSON.stringify(c));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked (private mode): editing simply stays unavailable.
  }
}

/** UTF-8 safe base64, since btoa() only handles Latin-1 ("Giulești" would throw). */
export function toBase64(text: string): string {
  let bin = '';
  for (const byte of new TextEncoder().encode(text)) bin += String.fromCharCode(byte);
  return btoa(bin);
}

export function fromBase64(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export class GitHubError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function api(c: GitHubConfig, path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`https://api.github.com/repos/${c.repo}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${c.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok && res.status !== 404) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new GitHubError(res.status, body.message ?? res.statusText);
  }
  return res;
}

/** Checks the token can push to the repo. */
export async function checkAccess(c: GitHubConfig): Promise<string> {
  const res = await api(c, '');
  if (res.status === 404) throw new GitHubError(404, `Repository ${c.repo} not found, or the token cannot see it`);
  const repo = (await res.json()) as { full_name: string; permissions?: { push?: boolean } };
  if (repo.permissions && !repo.permissions.push) throw new GitHubError(403, 'The token can read but not write. Give it Contents: Read and write.');
  return repo.full_name;
}

export async function getFile(c: GitHubConfig, path: string): Promise<{ text: string; sha?: string }> {
  const res = await api(c, `/contents/${path}?ref=${encodeURIComponent(c.branch)}`, { cache: 'no-store' });
  if (res.status === 404) return { text: '' };
  const json = (await res.json()) as { content: string; sha: string };
  return { text: fromBase64(json.content), sha: json.sha };
}

export async function putFile(c: GitHubConfig, path: string, text: string, sha: string | undefined, message: string): Promise<void> {
  await api(c, `/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: toBase64(text), branch: c.branch, ...(sha ? { sha } : {}) }),
  });
}

/**
 * Read-modify-write of one file. If someone else committed in between (409, or 422 for a stale sha),
 * re-read and apply the change again once.
 */
export async function updateFile(c: GitHubConfig, path: string, change: (text: string) => string | undefined, message: string): Promise<boolean> {
  for (let attempt = 1; ; attempt++) {
    const { text, sha } = await getFile(c, path);
    const next = change(text);
    if (next === undefined || next === text) return false;
    try {
      await putFile(c, path, next, sha, message);
      return true;
    } catch (e) {
      if (attempt < 2 && e instanceof GitHubError && (e.status === 409 || e.status === 422)) continue;
      throw e;
    }
  }
}
