// Editing data/collection/packs.json from the browser: pack membership on club pages, new packs on #/packs.
// Pure text-in, text-out functions (like overrides.ts), so a save that races another commit is simply re-applied.
import type { Pack } from '../../pipeline/lib/types.ts';
import type { CatalogClub } from './data.ts';
import { html, type Html } from './html.ts';

export const PACKS_PATH = 'data/collection/packs.json';

const parse = (text: string): Pack[] => (text.trim() ? (JSON.parse(text) as Pack[]) : []);
const format = (packs: Pack[]) => JSON.stringify(packs, null, 2) + '\n';

/** URL-safe id from a name: "Lion teams" -> "lion-teams", "Şoimii Pâncota" -> "soimii-pancota". */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Puts the club in exactly the packs listed in `ids`, among the packs the form showed (`shown`): added at the
 * end of a pack it joins (the album keeps my order), removed from the others shown. Packs the form did not
 * show (created elsewhere, not deployed yet) are left alone.
 */
export function setMembership(text: string, qid: string, ids: string[], shown: string[]): string {
  let changed = false;
  const packs = parse(text).map((p) => {
    if (!shown.includes(p.id)) return p;
    const has = p.clubs.includes(qid);
    const want = ids.includes(p.id);
    if (has === want) return p;
    changed = true;
    return { ...p, clubs: want ? [...p.clubs, qid] : p.clubs.filter((q) => q !== qid) };
  });
  // Unchanged text means no commit, even if I formatted the file by hand.
  return changed ? format(packs) : text;
}

/** Appends a new, empty pack (or one holding `firstClub`). Throws on an unusable or taken id. */
export function addPack(text: string, pack: { id: string; name: string; description?: string }, firstClub?: string): string {
  const packs = parse(text);
  if (!/^[a-z0-9-]+$/.test(pack.id)) throw new Error('the id may only use lowercase letters, digits and dashes');
  if (packs.some((p) => p.id === pack.id)) throw new Error(`a pack with the id "${pack.id}" already exists`);
  if (!pack.name.trim()) throw new Error('the pack needs a name');
  const added: Pack = {
    id: pack.id,
    name: pack.name.trim(),
    ...(pack.description?.trim() ? { description: pack.description.trim() } : {}),
    clubs: firstClub ? [firstClub] : [],
  };
  return format([...packs, added]);
}

/** Checkboxes for every pack, on a club page. */
export function packMembershipForm(c: CatalogClub, packs: Pack[]): Html {
  return html`<details class="pack-edit">
    <summary>Packs</summary>
    <form id="packs-form" class="editor" data-qid="${c.qid}">
      ${packs.length === 0
        ? html`<p class="muted">No packs yet.</p>`
        : html`<p class="pack-options">
            ${packs.map((p) => html`<label><input type="checkbox" name="pack" value="${p.id}" ${p.clubs.includes(c.qid) ? 'checked' : ''}> ${p.name}</label>
              <input type="hidden" name="shown" value="${p.id}">`)}
          </p>`}
      <p class="row-inline">
        <label>New pack <input type="text" name="newPack" placeholder="e.g. Favourite teams"></label>
        <small class="muted">created with this club in it</small>
      </p>
      <p><button type="submit" class="primary">Save packs</button> <span id="editor-status" role="status"></span></p>
    </form>
  </details>`;
}

/** "New pack" form on #/packs. */
export function newPackForm(): Html {
  return html`<details class="pack-edit">
    <summary>New pack</summary>
    <form id="new-pack-form" class="editor">
      <label class="row">Name <input type="text" name="name" required placeholder="Lion teams"></label>
      <label class="row">Description <input type="text" name="description" placeholder="A lion on the badge"></label>
      <!-- Not name="id": a field named id would shadow form.id in the DOM. -->
      <label class="row">Id <input type="text" name="slug" pattern="[a-z0-9\\-]+" placeholder="from the name: lion-teams"></label>
      <p><button type="submit" class="primary">Create pack</button> <span id="editor-status" role="status"></span></p>
    </form>
  </details>`;
}
