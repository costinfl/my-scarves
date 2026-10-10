import { describe, expect, it } from 'vitest';
import { html } from './html.ts';

describe('html', () => {
  it('escapes interpolated text but not nested templates', () => {
    const name = '<img src=x onerror=alert(1)> & "quotes"';
    expect(html`<p>${name}</p>${html`<b>ok</b>`}`.value).toBe(
      '<p>&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quotes&quot;</p><b>ok</b>',
    );
  });

  it('drops false, null and undefined, and joins arrays', () => {
    expect(html`${false}${null}${undefined}${[1, html`<i>2</i>`]}`.value).toBe('1<i>2</i>');
  });
});
