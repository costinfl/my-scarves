import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { thumbOf } from './scarves.ts';

export const FULL_SIZE = 1600;
export const THUMB_SIZE = 400;

/**
 * Writes <dir>/<n>.jpg (longest side at most 1600 px) and <n>.thumb.jpg (400 px).
 * EXIF orientation is applied, then all metadata is dropped, so GPS position from a
 * phone photo never ends up in the public repo.
 */
export async function savePhoto(input: string, photosRoot: string, scarfId: string, n: number): Promise<string> {
  const dir = join(photosRoot, scarfId);
  mkdirSync(dir, { recursive: true });
  const rel = `${scarfId}/${n}.jpg`;
  const image = sharp(input, { failOn: 'error' }).rotate();
  await image
    .clone()
    .resize({ width: FULL_SIZE, height: FULL_SIZE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(join(photosRoot, rel));
  await image
    .clone()
    .resize({ width: THUMB_SIZE, height: THUMB_SIZE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 75, mozjpeg: true })
    .toFile(join(photosRoot, thumbOf(rel)));
  return rel;
}

/** Total size in bytes of everything under dir (0 if it doesn't exist). */
export function dirSize(dir: string): number {
  let total = 0;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    total += e.isDirectory() ? dirSize(p) : statSync(p).size;
  }
  return total;
}
