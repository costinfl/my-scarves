// Shared by the pipeline and the site (no Node imports here).

/** "53030", "53030--petrolul" or a uefa.com team URL -> "53030". */
export function parseUefaId(input: string): string | undefined {
  return input.trim().match(/(?:teams\/)?(\d{2,9})(?:--[\w-]*)?\/?$/)?.[1];
}

/** UEFA badge URL; 240 px is the largest size UEFA serves. Embedded from UEFA, never stored in the repo. */
export const uefaBadgeUrl = (id: string, size: 70 | 100 | 240 = 240) => `https://img.uefa.com/imgml/TP/teams/logos/${size}x${size}/${id}.png`;

export const uefaTeamUrl = (id: string) => `https://www.uefa.com/nationalassociations/teams/${id}/`;
