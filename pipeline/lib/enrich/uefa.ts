import { claims, stringValue, type Entity } from '../entities.ts';
import type { UefaInfo } from '../types.ts';

/** UEFA badge URL; 240 px is the largest size UEFA serves. Embedded from UEFA, never stored in the repo. */
export const uefaBadgeUrl = (id: string, size: 70 | 100 | 240 = 240) => `https://img.uefa.com/imgml/TP/teams/logos/${size}x${size}/${id}.png`;

export const uefaTeamUrl = (id: string) => `https://www.uefa.com/nationalassociations/teams/${id}/`;

/** "53030", "53030--petrolul" or a full uefa.com team URL -> "53030". */
export function parseUefaId(input: string): string | undefined {
  const m = input.trim().match(/(?:teams\/)?(\d{2,9})(?:--[\w-]*)?\/?$/);
  return m?.[1];
}

/** UEFA team id from Wikidata P7361. */
export function uefaFromEntity(e: Entity | undefined): UefaInfo | undefined {
  const raw = claims(e, 'P7361').map(stringValue)[0];
  const id = raw ? parseUefaId(raw) : undefined;
  return id ? { id } : undefined;
}
