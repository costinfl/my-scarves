import type { Entity } from '../entities.ts';
import { getJson } from '../http.ts';
import type { BlurbInfo } from '../types.ts';

const MAX_CHARS = 420;

/**
 * First 2-3 sentences of a summary, never cutting a sentence in half.
 * Intl.Segmenter knows that "F.C." or "St." do not end a sentence in most cases;
 * a "sentence" shorter than 25 characters is glued to the next one to cover the rest.
 */
export function trimSentences(text: string, maxSentences = 3, maxChars = MAX_CHARS): string {
  const raw = [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text.replace(/\s+/g, ' ').trim())].map((s) => s.segment);
  const sentences: string[] = [];
  for (const s of raw) {
    const last = sentences.at(-1);
    if (last !== undefined && last.trim().length < 25) sentences[sentences.length - 1] = last + s;
    else sentences.push(s);
  }
  let out = '';
  for (const [i, s] of sentences.entries()) {
    if (i >= maxSentences || (i >= 1 && (out + s).trim().length > maxChars)) break;
    out += s;
  }
  return out.trim();
}

interface Summary {
  type: string;
  extract?: string;
  content_urls?: { desktop?: { page?: string } };
}

/** Wikipedia REST summary of the club's English article (CC BY-SA, so the source URL is kept). */
export async function fetchBlurb(entity: Entity | undefined, opts: { refresh?: boolean } = {}): Promise<BlurbInfo | undefined> {
  const title = entity?.sitelinks.enwiki?.title;
  if (!title) return undefined;
  const summary = await getJson<Summary>(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    { cache: true, maxAgeDays: 90, refresh: opts.refresh, minIntervalMs: 200 },
  );
  if (!summary?.extract || summary.type === 'disambiguation') return undefined;
  const text = trimSentences(summary.extract);
  if (!text) return undefined;
  return {
    text,
    source: summary.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    status: 'draft',
  };
}
