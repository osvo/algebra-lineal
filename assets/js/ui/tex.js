// KaTeX rendering helpers.

import katex from '../../../vendor/katex/katex.min.mjs';

const OPTIONS = {
  throwOnError: false,
  strict: 'ignore',
  trust: (ctx) => ctx.command === '\\htmlClass',
};

export function texToHTML(tex, { display = false } = {}) {
  try {
    return katex.renderToString(tex, { ...OPTIONS, displayMode: display });
  } catch {
    return `<code>${escapeHTML(tex)}</code>`;
  }
}

export function renderTex(el, tex, { display = false } = {}) {
  if (el.__tex === tex && el.__display === display) return el;
  el.__tex = tex;
  el.__display = display;
  el.innerHTML = texToHTML(tex, { display });
  return el;
}

export function tex(tex, { display = false, className = '' } = {}) {
  const span = document.createElement(display ? 'div' : 'span');
  if (className) span.className = className;
  renderTex(span, tex, { display });
  return span;
}

export function escapeHTML(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/**
 * Renders a string of HTML that contains $…$ (inline) and $$…$$ (display) TeX.
 * The HTML itself is trusted (it comes from the site's own content files).
 */
export function richHTML(html) {
  let out = '';
  let i = 0;
  while (i < html.length) {
    if (html.startsWith('$$', i)) {
      const end = html.indexOf('$$', i + 2);
      if (end < 0) { out += html.slice(i); break; }
      out += texToHTML(decode(html.slice(i + 2, end)), { display: true });
      i = end + 2;
    } else if (html[i] === '$' && html[i - 1] !== '\\') {
      const end = html.indexOf('$', i + 1);
      if (end < 0) { out += html.slice(i); break; }
      out += texToHTML(decode(html.slice(i + 1, end)));
      i = end + 1;
    } else if (html[i] === '\\' && html[i + 1] === '$') {
      out += '$';
      i += 2;
    } else {
      out += html[i++];
    }
  }
  return out;
}

function decode(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
