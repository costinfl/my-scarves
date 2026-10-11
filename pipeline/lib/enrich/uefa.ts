import { claims, stringValue, type Entity } from '../entities.ts';
import type { UefaInfo } from '../types.ts';
import { parseUefaId } from '../uefa-id.ts';

export { parseUefaId, uefaBadgeUrl, uefaTeamUrl } from '../uefa-id.ts';

/** UEFA team id from Wikidata P7361. */
export function uefaFromEntity(e: Entity | undefined): UefaInfo | undefined {
  const raw = claims(e, 'P7361').map(stringValue)[0];
  const id = raw ? parseUefaId(raw) : undefined;
  return id ? { id } : undefined;
}
