import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { claims, current, stringValue, type Entity } from '../entities.ts';
import { getBytes, getJson } from '../http.ts';
import { paths } from '../paths.ts';
import type { LogoInfo } from '../types.ts';

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

interface ImageInfo {
  url: string;
  thumburl?: string;
  mime: string;
  descriptionurl: string;
  extmetadata?: Record<string, { value: string }>;
}

export const stripTags = (s: string) => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/**
 * Downloads the P154 logo from Commons: SVG as is (small, scales), rasters as a 256 px PNG thumbnail.
 * Commons only hosts freely licensed files, so everything stored here may be republished with attribution.
 */
export async function fetchLogo(qid: string, entity: Entity | undefined, opts: { refresh?: boolean } = {}): Promise<LogoInfo | undefined> {
  const claim = claims(entity, 'P154').find(current);
  if (!claim) return undefined;
  const commonsFile = stringValue(claim);

  const json = await getJson<{ query: { pages: { imageinfo?: ImageInfo[] }[] } }>(
    `${COMMONS_API}?${new URLSearchParams({
      action: 'query',
      titles: `File:${commonsFile}`,
      prop: 'imageinfo',
      iiprop: 'url|mime|extmetadata',
      iiurlwidth: '256',
      format: 'json',
      formatversion: '2',
    })}`,
    { cache: true, maxAgeDays: 30, refresh: opts.refresh },
  );
  const info = json?.query.pages[0]?.imageinfo?.[0];
  if (!info) return undefined;

  const isSvg = info.mime === 'image/svg+xml';
  const file = `${qid}.${isSvg ? 'svg' : 'png'}`;
  const target = join(paths.logos, file);
  if (opts.refresh || !existsSync(target)) {
    const download = await getBytes(isSvg ? info.url : (info.thumburl ?? info.url));
    if (download.status !== 200) throw new Error(`logo download ${download.status} for ${commonsFile}`);
    mkdirSync(paths.logos, { recursive: true });
    writeFileSync(target, download.bytes);
  }

  const meta = info.extmetadata ?? {};
  const author = meta.Artist?.value ? stripTags(meta.Artist.value) : undefined;
  return {
    file,
    commonsFile,
    sourceUrl: info.descriptionurl,
    license: stripTags(meta.LicenseShortName?.value ?? 'unknown'),
    ...(author ? { author } : {}),
    attributionRequired: meta.AttributionRequired?.value === 'true',
  };
}
