// "Add a scarf" form: the browser version of `npm run add-scarf`. Photos are resized here with a
// canvas (sharp only runs in Node), then the photos and scarves.json are committed in one commit.
import type { Scarf } from '../../pipeline/lib/types.ts';
import { nextScarfId, PHOTO_SIZE, STATUSES, THUMB_SIZE, TYPES, type ScarfInput } from '../../pipeline/lib/scarves.ts';
import type { CatalogClub } from './data.ts';
import { html, type Html } from './html.ts';

export const SCARVES_PATH = 'data/collection/scarves.json';
export const PHOTOS_DIR = 'assets/photos';

export function scarfFormView(c: CatalogClub): Html {
  return html`
    <form id="scarf-form" class="editor" data-qid="${c.qid}">
      <p class="muted">Photos are resized in this browser to ${PHOTO_SIZE} px plus a ${THUMB_SIZE} px thumbnail; location and other
        metadata are dropped. The photos and <code>data/collection/scarves.json</code> are committed together.</p>
      <fieldset>
        <legend>Scarf</legend>
        <label class="row">Status <select name="status">${STATUSES.map((s) => html`<option value="${s}">${s}</option>`)}</select></label>
        <label class="row">Type <select name="type"><option value="">not set</option>${TYPES.map((t) => html`<option value="${t}">${t}</option>`)}</select></label>
        <label class="row">Photos <input type="file" name="photos" accept="image/*" multiple></label>
        <div class="photos" id="photo-preview"></div>
      </fieldset>
      <fieldset>
        <legend>Details <small class="muted">(optional)</small></legend>
        <label class="row">Acquired <input type="text" name="date" placeholder="2024-05-12, 2024-05 or 2024" pattern="\\d{4}(-\\d{2}(-\\d{2})?)?"></label>
        <label class="row">Where <input type="text" name="place" placeholder="Giulești, club shop"></label>
        <label class="row">Price <input type="text" name="price" placeholder="50 RON"></label>
        <label class="row">Condition <input type="text" name="condition" placeholder="good"></label>
        <label>Notes <textarea name="notes" rows="3"></textarea></label>
      </fieldset>
      <p>
        <button type="submit" class="primary">Add scarf</button>
        <span id="editor-status" role="status"></span>
      </p>
    </form>
  `;
}

export function readScarfForm(form: HTMLFormElement): { input: ScarfInput; files: File[] } {
  const data = new FormData(form);
  const text = (name: string) => String(data.get(name) ?? '');
  return {
    input: { status: text('status'), type: text('type'), date: text('date'), place: text('place'), price: text('price'), condition: text('condition'), notes: text('notes') },
    files: data.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0),
  };
}

/** Shows thumbnails of the chosen files before saving. */
export function previewPhotos(input: HTMLInputElement, target: HTMLElement): void {
  for (const img of target.querySelectorAll('img')) URL.revokeObjectURL(img.src);
  target.replaceChildren(
    ...[...(input.files ?? [])].map((f) => Object.assign(document.createElement('img'), { src: URL.createObjectURL(f), alt: f.name })),
  );
}

/** Decodes an image, applies its EXIF rotation and re-encodes it as JPEG (which drops all metadata). */
export async function resizeToJpeg(file: Blob, max: number, quality: number): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('The browser could not encode the photo');
  return new Uint8Array(await blob.arrayBuffer());
}

/** Photo paths for a new scarf, relative to assets/photos: "fc-rapid-1/1.jpg", "fc-rapid-1/2.jpg". */
export const photoPaths = (id: string, count: number) => Array.from({ length: count }, (_, i) => `${id}/${i + 1}.jpg`);

/** Appends a scarf to the text of scarves.json, formatted like the pipeline writes JSON. */
export function appendScarf(text: string, scarf: Scarf): string {
  const scarves = (text.trim() ? JSON.parse(text) : []) as Scarf[];
  return JSON.stringify([...scarves, scarf], null, 2) + '\n';
}

/** The id the new scarf gets, given scarves.json at the branch head. */
export function scarfIdFor(club: Pick<CatalogClub, 'name'>, scarvesText: string): string {
  return nextScarfId(club, (scarvesText.trim() ? JSON.parse(scarvesText) : []) as Scarf[]);
}
