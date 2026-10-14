import type { CatalogClub } from './data.ts';
import { html, type Html } from './html.ts';
import type { Edit } from './overrides.ts';
import { href } from './router.ts';
import { parseUefaId, uefaBadgeUrl as uefaBadge } from '../../pipeline/lib/uefa-id.ts';

function chips(colors: string[], target: string): Html {
  return html`${colors.map((c) => html`<button type="button" class="chip" data-target="${target}" data-color="${c}" style="--c:${c}" title="${c}"></button>`)}`;
}

function resetButton(section: string, label: string): Html {
  return html`<button type="button" class="link" data-reset="${section}" data-label="${label}">${label}</button>`;
}

/** The edit form for one club. Each fieldset is a section; only sections I touch are saved. */
export function editorView(c: CatalogClub): Html {
  const automatic = c.colors && c.colors.source !== 'manual' ? [c.colors.primary, c.colors.secondary].filter((x): x is string => !!x) : [];
  const suggestions = [...new Set([...automatic, ...(c.palette ?? [])])];
  const primary = c.colors?.primary ?? suggestions[0] ?? '#ffffff';
  const secondary = c.colors?.secondary ?? suggestions.find((x) => x !== primary) ?? '#ffffff';
  const shop = c.fanshop;

  return html`
    <form id="editor" class="editor" data-qid="${c.qid}">
      <p class="muted">Changes are committed to <code>data/manual/overrides.json</code>; the site shows them after the next deploy (about a minute).</p>

      <fieldset data-section="stadium">
        <legend>Home stadium</legend>
        ${c.venues.length === 0
          ? html`<p class="muted">Wikidata lists no home venue for this club.</p>`
          : c.venues.map(
              (v, i) => html`<label class="row"><input type="radio" name="stadium" value="${v.qid}" data-name="${v.name}" data-address="${v.address?.text ?? ''}" ${i === 0 ? 'checked' : ''}> ${v.name}
                <a class="muted" href="https://www.wikidata.org/wiki/${v.qid}" target="_blank" rel="noopener">${v.qid}</a></label>`,
            )}
        ${c.venues.length > 1 && resetButton('stadium', 'Back to Wikidata order')}
      </fieldset>

      ${c.stadium &&
      html`<fieldset data-section="address" data-stadium="${c.stadium.qid}">
        <legend>Address of <span class="stadium-name">${c.stadium.name}</span></legend>
        <input name="address" type="text" value="${c.stadium.address?.text ?? ''}" placeholder="Street, postcode city">
        ${resetButton('address', 'Back to OpenStreetMap address')}
      </fieldset>`}

      <fieldset data-section="colors">
        <legend>Club colours</legend>
        <p class="muted">${c.colors?.source === 'wikidata'
            ? `Wikidata: ${c.colors.names?.join(', ') ?? automatic.join(', ')}. `
            : c.colors?.source === 'kit'
              ? html`No official colours on Wikidata; shown from the home kit in the <a href="${c.colors.sourceUrl ?? '#'}" target="_blank" rel="noopener">Wikipedia</a> infobox. `
              : c.colors?.source === 'manual'
                ? 'Chosen by me. '
                : 'No official colours on Wikidata and no home kit on Wikipedia. '}
          Chips are those colours and the colours of the badge.</p>
        <label class="row">Primary <input type="color" name="primary" value="${primary}"> ${chips(suggestions, 'primary')}</label>
        <label class="row">Secondary <input type="color" name="secondary" value="${secondary}"> ${chips(suggestions, 'secondary')}</label>
        <label class="row"><input type="checkbox" name="noSecondary" ${c.colors && !c.colors.secondary ? 'checked' : ''}> Single colour</label>
        ${resetButton('colors', 'Back to automatic colours')}
      </fieldset>

      <fieldset data-section="logo">
        <legend>Logo</legend>
        <div class="logo-options">
          <label><input type="radio" name="logo" value="uefa" ${c.uefaId && c.logoSource !== 'commons' && c.logoSource !== 'none' ? 'checked' : ''} ${c.uefaId ? '' : 'disabled'}>
            UEFA badge ${c.uefaId && html`<img src="${uefaBadge(c.uefaId)}" alt="" referrerpolicy="no-referrer">`}</label>
          <label><input type="radio" name="logo" value="commons" ${(!c.uefaId || c.logoSource === 'commons') && c.logo && c.logoSource !== 'none' ? 'checked' : ''} ${c.logo ? '' : 'disabled'}>
            Commons ${c.logo && html`<img src="${import.meta.env.BASE_URL}logos/${c.logo.file}" alt="">`}</label>
          <label><input type="radio" name="logo" value="none" ${c.logoSource === 'none' || (!c.uefaId && !c.logo) ? 'checked' : ''}> None</label>
        </div>
        <label class="row">UEFA team page or id <input name="uefa" type="text" value="${c.uefaId ?? ''}" placeholder="https://www.uefa.com/nationalassociations/teams/53030--petrolul/"></label>
        ${resetButton('logo', 'Back to automatic')}
      </fieldset>

      <fieldset data-section="fanshop">
        <legend>Fan shop</legend>
        <p class="muted">${shop
          ? `Found automatically: ${shop.status}${shop.note ? ` (${shop.note})` : ''}${shop.checkedAt ? `, checked ${shop.checkedAt}` : ''}.`
          : 'Not checked yet.'}</p>
        <input name="shopUrl" type="url" value="${shop?.url ?? ''}" placeholder="https://shop.example.com/">
        <label class="row"><input type="radio" name="shopStatus" value="confirmed" ${shop?.status === 'confirmed' || shop?.status === 'manual' ? 'checked' : ''}> This is the official shop</label>
        <label class="row"><input type="radio" name="shopStatus" value="none" ${shop?.status === 'none' ? 'checked' : ''}> No official online shop</label>
        ${resetButton('fanshop', 'Back to automatic')}
      </fieldset>

      <fieldset data-section="blurb">
        <legend>Presentation</legend>
        <textarea name="blurb" rows="5">${c.blurb?.text ?? ''}</textarea>
        <label class="row"><input type="checkbox" name="reviewed" ${c.blurb?.status === 'reviewed' ? 'checked' : ''}> Reviewed</label>
        ${c.blurb && html`<p class="muted">Source: <a href="${c.blurb.source}" target="_blank" rel="noopener">Wikipedia</a> (CC BY-SA, keep it attributed).</p>`}
        ${resetButton('blurb', 'Back to Wikipedia text')}
      </fieldset>

      <p class="actions">
        <button type="submit" class="primary">Save</button>
        <a href="${href.club(c.qid)}">Cancel</a>
        <span id="editor-status" role="status"></span>
      </p>
    </form>
  `;
}

/** Wires chips, "back to automatic" buttons and dirty tracking. */
export function mountEditor(form: HTMLFormElement): void {
  const markDirty = (el: Element | null) => el?.closest('fieldset')?.setAttribute('data-dirty', '1');
  form.addEventListener('input', (e) => markDirty(e.target as Element));
  form.addEventListener('change', (e) => {
    markDirty(e.target as Element);
    const t = e.target as HTMLInputElement;
    // The address field follows the selected stadium.
    if (t.name === 'stadium') {
      const address = form.querySelector<HTMLInputElement>('input[name=address]');
      const fs = address?.closest('fieldset');
      if (address && fs) {
        fs.dataset.stadium = t.value;
        fs.dataset.dirty = '';
        fs.querySelector('.stadium-name')!.textContent = t.dataset.name ?? '';
        address.value = t.dataset.address ?? '';
      }
    }
  });
  form.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const chip = target.closest<HTMLElement>('.chip');
    if (chip) {
      const input = form.querySelector<HTMLInputElement>(`input[name=${chip.dataset.target}]`);
      if (input) input.value = chip.dataset.color!.toLowerCase();
      if (chip.dataset.target === 'secondary') form.querySelector<HTMLInputElement>('input[name=noSecondary]')!.checked = false;
      markDirty(chip);
      return;
    }
    const reset = target.closest<HTMLElement>('[data-reset]');
    if (reset) {
      const fs = reset.closest('fieldset')!;
      const on = fs.dataset.reset !== '1';
      fs.dataset.reset = on ? '1' : '';
      fs.dataset.dirty = '1';
      reset.textContent = on ? 'Will go back to automatic (click to undo)' : reset.dataset.label!;
    }
  });
}

/** Reads the touched sections into an edit of overrides.json. */
export function collectEdit(form: HTMLFormElement, c: CatalogClub, today = new Date().toISOString().slice(0, 10)): { edit: Edit; summary: string[] } {
  const value = (name: string) => form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name=${name}]`)?.value.trim() ?? '';
  const checked = (name: string) => form.querySelector<HTMLInputElement>(`[name=${name}]:checked`)?.value;
  const edit: Edit = {};
  const club: { set: Record<string, unknown>; unset: string[] } = { set: {}, unset: [] };
  const summary: string[] = [];

  for (const fs of form.querySelectorAll<HTMLFieldSetElement>('fieldset[data-dirty="1"]')) {
    const section = fs.dataset.section!;
    const reset = fs.dataset.reset === '1';
    summary.push(section);
    switch (section) {
      case 'stadium': {
        if (reset) club.unset.push('stadiumIds');
        else {
          const chosen = checked('stadium');
          if (chosen) club.set.stadiumIds = [chosen, ...c.venues.map((v) => v.qid).filter((q) => q !== chosen)];
        }
        break;
      }
      case 'address': {
        const stadium = fs.dataset.stadium!;
        const text = value('address');
        edit[stadium] = reset || !text ? { unset: ['address'] } : { set: { address: { text } } };
        break;
      }
      case 'colors': {
        if (reset) club.unset.push('colors');
        else {
          const noSecondary = form.querySelector<HTMLInputElement>('[name=noSecondary]')!.checked;
          club.set.colors = {
            primary: value('primary').toUpperCase(),
            ...(noSecondary ? {} : { secondary: value('secondary').toUpperCase() }),
            source: 'manual',
          };
        }
        break;
      }
      case 'logo': {
        if (reset) club.unset.push('logoSource', 'uefaId');
        else {
          const id = parseUefaId(value('uefa'));
          if (id && id !== c.uefaId) club.set.uefaId = id;
          const choice = checked('logo');
          if (choice) club.set.logoSource = choice === 'none' || id || choice !== 'uefa' ? choice : 'none';
        }
        break;
      }
      case 'fanshop': {
        if (reset) club.unset.push('fanshop');
        else if (checked('shopStatus') === 'none') club.set.fanshop = { status: 'none', checkedAt: today, note: 'checked by me' };
        else {
          const url = value('shopUrl');
          if (url) {
            const same = url === c.fanshop?.url && c.fanshop?.status === 'candidate';
            club.set.fanshop = { url, status: same ? 'confirmed' : 'manual', checkedAt: today };
          }
        }
        break;
      }
      case 'blurb': {
        const text = value('blurb');
        if (reset || !text) club.unset.push('blurb');
        else {
          const reviewed = form.querySelector<HTMLInputElement>('[name=reviewed]')!.checked;
          club.set.blurb = { text, source: c.blurb?.source ?? '', status: reviewed ? 'reviewed' : 'draft' };
        }
        break;
      }
    }
  }
  if (Object.keys(club.set).length || club.unset.length) edit[c.qid] = club;
  return { edit, summary };
}
