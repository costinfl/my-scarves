const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const esc = (s: string | number) => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]!);

/** Pre-escaped HTML, so nested templates are not escaped twice. */
export class Html {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

type Part = string | number | Html | undefined | null | false | Part[];

/**
 * Tagged template that escapes interpolated values unless they are already Html.
 * Like a Thymeleaf th:text default: text is safe unless you opt out.
 */
export function html(strings: TemplateStringsArray, ...parts: Part[]): Html {
  let out = strings[0]!;
  parts.forEach((p, i) => {
    out += render(p) + strings[i + 1]!;
  });
  return new Html(out);
}

function render(p: Part): string {
  if (p === undefined || p === null || p === false) return '';
  if (Array.isArray(p)) return p.map(render).join('');
  if (p instanceof Html) return p.value;
  return esc(p);
}
