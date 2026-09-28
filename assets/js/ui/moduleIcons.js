// Small line drawings that identify each app in the sidebar and on the launcher.
// viewBox 0 0 48 48; colours come from the theme through CSS custom properties.

const s = (c) => `stroke:var(--${c})`;
const line = (x1, y1, x2, y2, c, w = 2.2, extra = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="${s(c)};stroke-width:${w}" ${extra}/>`;
const dash = (x1, y1, x2, y2, c, w = 1.6) => line(x1, y1, x2, y2, c, w, 'stroke-dasharray="3 3"');

/** Arrow from (x1, y1) to (x2, y2) with a small open head. */
function arrow(x1, y1, x2, y2, c, w = 2.4) {
  const a = Math.atan2(y2 - y1, x2 - x1), L = 5.5, sp = 0.5;
  const p = (t) => `${(x2 - L * Math.cos(a + t)).toFixed(1)},${(y2 - L * Math.sin(a + t)).toFixed(1)}`;
  return `${line(x1, y1, x2, y2, c, w)}<polyline points="${p(sp)} ${x2},${y2} ${p(-sp)}" style="${s(c)};stroke-width:${w};fill:none"/>`;
}
const poly = (pts, c, { fill = null, op = 0.25, w = 1.8, dashArr = null } = {}) =>
  `<polygon points="${pts.map((p) => p.join(',')).join(' ')}" style="${s(c)};stroke-width:${w};fill:${fill ? `var(--${fill})` : 'none'};fill-opacity:${op}" ${dashArr ? `stroke-dasharray="${dashArr}"` : ''}/>`;
const path = (d, c, w = 2, extra = '') => `<path d="${d}" style="${s(c)};stroke-width:${w};fill:none" ${extra}/>`;
const dot = (x, y, c, r = 2.6) => `<circle cx="${x}" cy="${y}" r="${r}" style="fill:var(--${c});stroke:none"/>`;
const ellipse = (cx, cy, rx, ry, rot, c, w = 1.8, extra = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${cx} ${cy})" style="${s(c)};stroke-width:${w};fill:none" ${extra}/>`;

const ICONS = {
  span: poly([[10, 38], [28, 32], [36, 12], [18, 18]], 'c-img', { fill: 'c-img', op: 0.14, w: 0.8 })
    + dash(28, 32, 36, 12, 'c-j') + arrow(10, 38, 28, 32, 'c-i') + arrow(10, 38, 18, 18, 'c-j') + arrow(10, 38, 36, 12, 'c-v'),
  t2d: [0, 1, 2, 3].map((k) => line(6 + k * 10, 42, 16 + k * 10, 6, 'tgrid', 1)).join('')
    + [0, 1, 2, 3].map((k) => line(4, 40 - k * 10, 44, 34 - k * 10, 'tgrid', 1)).join('')
    + arrow(14, 34, 28, 30, 'c-i') + arrow(14, 34, 20, 16, 'c-j'),
  comp: path('M8 36 Q10 12 24 14', 'c-i', 2.2) + path('M24 14 Q38 16 40 36', 'c-j', 2.2)
    + `<polyline points="35.5,31.5 40,36 43,30.5" style="${s('c-j')};stroke-width:2.2;fill:none"/>`
    + dot(8, 36, 'muted', 3) + dot(24, 14, 'text', 3) + dot(40, 36, 'c-v', 3),
  t3d: poly([[12, 20], [28, 14], [38, 20], [22, 26]], 'tgrid', { w: 1.2 }) + poly([[12, 20], [22, 26], [22, 40], [12, 34]], 'tgrid', { w: 1.2 })
    + poly([[22, 26], [38, 20], [38, 34], [22, 40]], 'tgrid', { w: 1.2 })
    + arrow(22, 40, 38, 34, 'c-i', 2) + arrow(22, 40, 12, 34, 'c-j', 2) + arrow(22, 40, 22, 24, 'c-k', 2),
  det: poly([[10, 38], [30, 32], [38, 12], [18, 18]], 'c-det', { fill: 'c-det', op: 0.3, w: 1.4 })
    + arrow(10, 38, 30, 32, 'c-i') + arrow(10, 38, 18, 18, 'c-j'),
  sys: line(4, 34, 44, 18, 'c-row1', 2) + line(8, 6, 36, 44, 'c-row2', 2) + line(4, 16, 44, 32, 'c-row3', 2) + dot(21.5, 26.5, 'c-sol', 3.4),
  nsq: poly([[4, 30], [16, 22], [24, 30], [12, 38]], 'c-ker', { fill: 'c-ker', op: 0.15, w: 1.4 })
    + arrow(26, 26, 34, 26, 'muted', 1.8) + line(40, 8, 40, 42, 'c-img', 3) + dot(40, 26, 'c-v', 3),
  cob: [0, 1, 2].map((k) => line(4, 14 + k * 12, 44, 14 + k * 12, 'grid-major', 1)).join('')
    + [0, 1, 2].map((k) => line(12 + k * 12, 4, 12 + k * 12, 44, 'grid-major', 1)).join('')
    + [0, 1, 2, 3].map((k) => line(4 + k * 12, 44, 16 + k * 12, 4, 'tgrid', 1.1)).join('')
    + arrow(12, 38, 34, 16, 'c-v'),
  eig: dash(4, 44, 44, 4, 'c-eig', 1.6) + arrow(12, 36, 22, 26, 'c-v', 2.6) + arrow(22, 26, 36, 12, 'c-w', 2.2)
    + arrow(12, 36, 30, 38, 'muted', 1.6),
  orth: line(4, 38, 44, 30, 'c-img', 2) + arrow(8, 37, 26, 12, 'c-v') + dash(26, 12, 30.5, 32.5, 'c-w', 1.6)
    + arrow(8, 37, 30, 32.5, 'c-w', 2) + path('M26.6 29.6 L27.3 26.1 L30.8 25.4', 'muted', 1.2),
  quad: ellipse(24, 24, 18, 8, -35, 'c-w', 1.2) + ellipse(24, 24, 12, 5.4, -35, 'c-w', 1.6) + ellipse(24, 24, 6, 2.7, -35, 'c-det', 2)
    + dash(8, 35.2, 40, 12.8, 'c-eig', 1.2) + dash(18.3, 15.8, 29.7, 32.2, 'c-eig', 1.2),
  svd: `<circle cx="24" cy="24" r="10" style="${s('muted')};stroke-width:1.4;fill:none" stroke-dasharray="3 3"/>`
    + ellipse(24, 24, 18, 7, -28, 'c-w', 2) + arrow(24, 24, 39.9, 15.5, 'c-i', 2) + arrow(24, 24, 20.7, 17.8, 'c-j', 2),
  poly: path('M4 40 C 12 4, 22 44, 30 20 S 40 10, 44 8', 'c-v', 2.4)
    + dot(9, 26, 'c-i', 3) + dot(19, 27, 'c-j', 3) + dot(30, 20, 'c-k', 3) + dot(40, 10, 'c-w', 3),
  nl: [0, 1, 2, 3].map((k) => path(`M4 ${10 + k * 10} Q 24 ${2 + k * 12} 44 ${14 + k * 9}`, 'tgrid', 1.2)).join('')
    + [0, 1, 2, 3].map((k) => path(`M${10 + k * 10} 4 Q ${4 + k * 12} 24 ${14 + k * 9} 44`, 'tgrid', 1.2)).join('')
    + dot(24, 24, 'c-v', 3),
};

/** Inline SVG element with the drawing of an app. */
export function moduleIcon(id, { size = 20 } = {}) {
  const wrap = document.createElement('span');
  wrap.innerHTML = `<svg class="app-icon" viewBox="0 0 48 48" width="${size}" height="${size}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[id] || ''}</svg>`;
  return wrap.firstChild;
}
