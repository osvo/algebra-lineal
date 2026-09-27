import { createLab } from '../ui/shell.js';
import { codec, M, V } from '../ui/store.js';
import { Plane2D } from '../ui/plane2d.js';
import { Scene3D } from '../ui/scene3d.js';
import { card, matrixEditor, vectorEditor, flagChip, readout, segmented, selectBox, button, slider } from '../ui/controls.js';
import { h } from '../ui/dom.js';
import { tr, setText, setAttr, onLangChange } from '../ui/i18n.js';
import { makeEntry, numberToInput } from '../core/parse.js';
import { RationalField, floatFieldFor } from '../core/fields.js';
import { renderTex } from '../ui/tex.js';
import * as L from '../core/linalg.js';
import { texValue, texVector, texMatrix, texAugmented, cls, fmtDecimal, plainValue } from '../core/format.js';
import { texSpan, rankOp } from './common.js';

const DEFAULTS = {
  2: { A: [[1, 2], [3, -1]], b: [4, 5] },
  3: { A: [[1, 1, 1], [1, -1, 2], [2, 1, -1]], b: [6, 5, 1] },
};
const PRESETS = {
  2: [
    { id: 'unique', label: { es: 'Solución única', en: 'Unique solution' }, A: [[1, 2], [3, -1]], b: [4, 5] },
    { id: 'parallel', label: { es: 'Rectas paralelas (sin solución)', en: 'Parallel lines (no solution)' }, A: [[1, 2], [2, 4]], b: [4, 3] },
    { id: 'same', label: { es: 'La misma recta (infinitas)', en: 'Same line (infinitely many)' }, A: [[1, 2], [2, 4]], b: [4, 8] },
    { id: 'frac', label: { es: 'Solución fraccionaria', en: 'Fractional solution' }, A: [[2, 3], [5, -1]], b: [1, 4] },
    { id: 'pivot0', label: { es: 'Necesita intercambio', en: 'Needs a swap' }, A: [[0, 1], [2, 1]], b: [3, 5] },
  ],
  3: [
    { id: 'unique', label: { es: 'Tres planos, un punto', en: 'Three planes, one point' }, A: [[1, 1, 1], [1, -1, 2], [2, 1, -1]], b: [6, 5, 1] },
    { id: 'sheaf', label: { es: 'Haz de planos (una recta)', en: 'Sheaf of planes (a line)' }, A: [[1, 1, 1], [1, -1, 1], [2, 0, 2]], b: [3, 1, 4] },
    { id: 'prism', label: { es: 'Prisma (sin solución)', en: 'Prism (no solution)' }, A: [[1, 1, 1], [1, -1, 1], [2, 0, 2]], b: [3, 1, 5] },
    { id: 'parallel', label: { es: 'Dos planos paralelos', en: 'Two parallel planes' }, A: [[1, 2, -1], [2, 4, -2], [1, 0, 1]], b: [2, 1, 3] },
    { id: 'same', label: { es: 'Un solo plano (repetido)', en: 'A single plane (repeated)' }, A: [[1, 1, 1], [2, 2, 2], [3, 3, 3]], b: [1, 2, 3] },
    { id: 'pivot0', label: { es: 'Pivote nulo', en: 'Zero pivot' }, A: [[0, 2, 1], [1, 1, 1], [2, 1, 3]], b: [5, 4, 9] },
  ],
};
const ROW_COLORS = ['row1', 'row2', 'row3'];
const ROW_VARS = ['var(--c-row1)', 'var(--c-row2)', 'var(--c-row3)'];

// Row operations are stored in the URL: S:i:j (swap), M:i:c (scale), A:i:j:c (Rᵢ ← Rᵢ + c·Rⱼ), 1-based.
function parseOps(str) {
  if (!str) return [];
  return str.split('~').map((s) => {
    const p = s.split(':');
    const auto = p[0] === p[0].toLowerCase();
    const k = p[0].toUpperCase();
    if (k === 'S') return { type: 'swap', i: +p[1] - 1, j: +p[2] - 1, auto };
    if (k === 'M') return { type: 'scale', i: +p[1] - 1, cText: p[2], auto };
    if (k === 'A') return { type: 'add', i: +p[1] - 1, j: +p[2] - 1, cText: p[3], auto };
    return null;
  }).filter(Boolean);
}
function formatOps(ops) {
  return ops.map((o) => {
    const k = (L) => (o.auto ? L.toLowerCase() : L);
    return o.type === 'swap' ? `${k('S')}:${o.i + 1}:${o.j + 1}` : o.type === 'scale' ? `${k('M')}:${o.i + 1}:${o.cText}` : `${k('A')}:${o.i + 1}:${o.j + 1}:${o.cText}`;
  }).join('~');
}
const cToText = (c, F) => (F === RationalField ? c.toString() : numberToInput(c));

function opTex(op, F) {
  const R = (k) => `R_{${k + 1}}`;
  if (op.type === 'swap') return `${R(op.i)} \\leftrightarrow ${R(op.j)}`;
  const c = op.c;
  const neg = F.toNumber(c) < 0;
  const abs = neg ? F.neg(c) : c;
  const coef = (x) => { const t = texValue(x); return t === '1' ? '' : t.includes('frac') || /[+-]/.test(t.slice(1)) ? `${t}\\,` : `${t}\\,`; };
  if (op.type === 'scale') return `${R(op.i)} \\leftarrow ${neg ? '-' : ''}${coef(abs)}${R(op.i)}`;
  return `${R(op.i)} \\leftarrow ${R(op.i)} ${neg ? '-' : '+'} ${coef(abs)}${R(op.j)}`;
}

createLab({
  id: 'sys',
  wide: true,
  lead: {
    es: 'Resolver Ax = b tiene dos lecturas: cortar rectas o planos (filas) o combinar columnas para alcanzar b. La eliminación gaussiana cambia las ecuaciones sin cambiar las soluciones.',
    en: 'Solving Ax = b has two readings: intersecting lines or planes (rows) or combining columns to reach b. Gaussian elimination changes the equations without changing the solutions.',
  },
  state: {
    n: { def: '2', codec: codec.enum(['2', '3']) },
    A: { def: M(DEFAULTS[2].A), codec: codec.anyMatrix() },
    b: { def: V(DEFAULTS[2].b), codec: codec.vector(null) },
    ops: { def: '', codec: codec.str(2000) },
    view: { def: 'rows', codec: codec.enum(['rows', 'cols']) },
    x: { def: [0, 0, 0], codec: { parse: (s) => { const v = s.split(',').map(Number); return v.length === 3 && v.every(Number.isFinite) ? v : undefined; }, format: (v) => v.map((a) => numberToInput(a)).join(',') } },
    show: { def: ['orig'], codec: codec.flags(['orig', 'sol']) },
  },

  build(ctx) {
    const { store } = ctx;
    const nOf = () => +store.get('n');
    // Repair shapes from hand-edited URLs.
    {
      const n = nOf();
      if (store.get('A').length !== n || store.get('A').some((r) => r.length !== n) || store.get('b').length !== n) {
        store.set({ A: M(DEFAULTS[n].A), b: V(DEFAULTS[n].b), ops: '' });
      }
    }

    // Panel ---------------------------------------------------------------------
    const sizeSeg = segmented({
      options: [{ value: '2', label: { es: '2 × 2', en: '2 × 2' } }, { value: '3', label: { es: '3 × 3', en: '3 × 3' } }],
      get: () => store.get('n'), set: (n) => store.set({ n, A: M(DEFAULTS[n].A), b: V(DEFAULTS[n].b), ops: '', x: [0, 0, 0] }),
      label: { es: 'Tamaño', en: 'Size' },
    });
    const viewSeg = segmented({
      options: [{ value: 'rows', label: { es: 'Filas: rectas/planos', en: 'Rows: lines/planes' } }, { value: 'cols', label: { es: 'Columnas: combinación', en: 'Columns: combination' } }],
      get: () => store.get('view'), set: (view) => store.set({ view }),
      label: { es: 'Imagen', en: 'Picture' },
    });
    const presetSel = selectBox({
      options: [], get: () => '', set: (id) => {
        const p = PRESETS[nOf()].find((x) => x.id === id);
        if (p) store.set({ A: M(p.A), b: V(p.b), ops: '' });
        presetSel.el.value = '';
      },
      label: { es: 'Ejemplos', en: 'Examples' },
    });
    const rebuildPresets = () => {
      presetSel.el.replaceChildren(h('option', { value: '' }, tr({ es: 'Ejemplos…', en: 'Examples…' })), ...PRESETS[nOf()].map((p) => h('option', { value: p.id }, tr(p.label))));
      presetSel.el.value = '';
    };
    onLangChange(rebuildPresets);
    const editorSlot = h('div');
    const sysTex = h('div', { class: 'math-block' });
    const inputCard = card({ title: { es: 'Sistema', en: 'System' }, body: [h('div', { class: 'row' }, sizeSeg.el, viewSeg.el), editorSlot, presetSel.el, sysTex] });

    // Elimination
    const augTex = h('div', { class: 'math-block' });
    const phase = h('div', { class: 'row' });
    const nextBtn = button({ label: { es: 'Paso siguiente', en: 'Next step' }, iconName: 'step', kind: 'primary', small: true, onClick: () => stepForward(1) });
    const allBtn = button({ label: { es: 'Hasta el final', en: 'To the end' }, small: true, onClick: () => stepForward(50) });
    const undoBtn = button({ label: { es: 'Deshacer', en: 'Undo' }, iconName: 'back', small: true, onClick: () => { const ops = parseOps(store.get('ops')); ops.pop(); store.set({ ops: formatOps(ops) }); } });
    const clearBtn = button({ label: { es: 'Reiniciar', en: 'Restart' }, iconName: 'reset', small: true, onClick: () => store.set({ ops: '' }) });
    const nextDesc = h('p', { style: { margin: 0 } });
    // Manual operation builder
    const opType = h('select');
    const opI = h('select'), opJ = h('select');
    const opC = h('input', { class: 'input', type: 'text', value: '-1', style: { width: '6em' } });
    setAttr(opType, 'aria-label', { es: 'Tipo de operación', en: 'Operation type' });
    setAttr(opI, 'aria-label', { es: 'Fila que cambia', en: 'Row that changes' });
    setAttr(opJ, 'aria-label', { es: 'Otra fila', en: 'Other row' });
    setAttr(opC, 'aria-label', { es: 'Escalar c', en: 'Scalar c' });
    const fillOps = () => {
      const cur = opType.value || 'add';
      opType.replaceChildren(
        h('option', { value: 'add' }, tr({ es: 'Rᵢ ← Rᵢ + c·Rⱼ', en: 'Rᵢ ← Rᵢ + c·Rⱼ' })),
        h('option', { value: 'scale' }, tr({ es: 'Rᵢ ← c·Rᵢ', en: 'Rᵢ ← c·Rᵢ' })),
        h('option', { value: 'swap' }, tr({ es: 'Rᵢ ↔ Rⱼ', en: 'Rᵢ ↔ Rⱼ' })));
      opType.value = cur;
      const n = nOf();
      const iv = opI.value || '1', jv = opJ.value || '2';
      opI.replaceChildren(...Array.from({ length: n }, (_, k) => h('option', { value: String(k + 1) }, `i = ${k + 1}`)));
      opJ.replaceChildren(...Array.from({ length: n }, (_, k) => h('option', { value: String(k + 1) }, `j = ${k + 1}`)));
      opI.value = +iv <= n ? iv : '1'; opJ.value = +jv <= n ? jv : '2';
    };
    onLangChange(fillOps);
    const applyBtn = button({ label: { es: 'Aplicar', en: 'Apply' }, small: true, onClick: applyManual });
    const opMsg = h('p', { class: 'c-danger', style: { margin: 0, fontSize: '13px' } });
    const manual = h('div', { class: 'row op-builder' }, opType, opI, opJ, opC, applyBtn);
    const history = h('ol', { class: 'mono', style: { margin: 0, paddingLeft: '1.4em', display: 'grid', gap: '4px', fontSize: '13px' } });
    const eChips = [flagChip(store, 'show', 'orig', { es: 'Ver sistema original', en: 'Show original system' }, 'var(--muted)')];
    const elimCard = card({
      title: { es: 'Eliminación gaussiana', en: 'Gaussian elimination' },
      body: [augTex, phase, h('div', { class: 'row' }, nextBtn, allBtn, undoBtn, clearBtn), nextDesc, manual, opMsg, history, h('div', { class: 'chip-row' }, eChips.map((c) => c.el))],
    });

    // Column picture coefficients
    const xSliders = [0, 1, 2].map((k) => slider({
      label: { es: `x${k + 1}`, en: `x${k + 1}` }, labelTex: `x_{${k + 1}}`, min: -5, max: 5, step: 0.05,
      get: () => store.get('x')[k], set: (v) => { const x = store.get('x').slice(); x[k] = v; store.set({ x }); },
      format: (v) => fmtDecimal(v, 2),
    }));
    const solveBtn = button({ label: { es: 'Mostrar una solución', en: 'Show a solution' }, small: true, onClick: () => {
      const d = lastDerived;
      if (!d || !d.sol.particular) return;
      const x = [0, 0, 0];
      d.sol.particular.forEach((v, k) => { x[k] = d.F.toNumber(v); });
      store.set({ x });
    } });
    const colsCard = card({ title: { es: 'Combinación de columnas', en: 'Combination of columns' }, body: [...xSliders.map((s) => s.el), h('div', { class: 'row' }, solveBtn)] });

    const r = {
      cls: readout({ es: 'Clasificación', en: 'Classification' }, { block: true }),
      sol: readout({ es: 'Soluciones', en: 'Solutions' }, { block: true }),
      E: readout({ es: 'Matriz de las operaciones', en: 'Matrix of the operations' }, { block: true }),
    };
    const resultsCard = card({ title: { es: 'Resultado exacto', en: 'Exact result' }, body: [h('div', { class: 'readouts' }, Object.values(r).map((x) => x.el))] });
    ctx.panel.append(inputCard.el, elimCard.el, colsCard.el, resultsCard.el);

    // Views -------------------------------------------------------------------------
    let view = null, viewKey = '', editor = null, bEditor = null, editorKey = '';
    let cur = null, lastDerived = null;

    function buildView(state) {
      if (view) view.dispose();
      ctx.clearViews();
      const n = +state.n;
      const el = ctx.addView();
      if (n === 2) {
        view = new Plane2D(el, { range: 5.5 });
        view.setDraw((g) => cur && draw2D(g, cur));
      } else {
        view = new Scene3D(el, { extent: 5, frustum: 12 });
        view.onTheme = () => ctx.rerender();
      }
    }

    function draw2D(g, c) {
      g.backgroundGrid();
      const { Cur, Orig, F, sol, state } = c;
      if (state.view === 'rows') {
        if (state.show.includes('orig') && c.changed) Orig.forEach((row, i) => drawLine(g, row, g.c[ROW_COLORS[i]], true, i, F));
        Cur.forEach((row, i) => drawLine(g, row, g.c[ROW_COLORS[i]], false, i, F));
        if (sol.status === 'unique') {
          const p = sol.particular.map((v) => F.toNumber(v));
          g.point(p, { color: g.c.sol, r: 7, stroke: g.c.bg });
          g.text(p, `(${sol.particular.map((v) => plainValue(v)).join(', ')})`, { color: g.c.sol, offset: [12, -14], weight: 600 });
        } else if (sol.status === 'infinite' && sol.homogeneous.length === 1) {
          const p = sol.particular.map((v) => F.toNumber(v)), d = sol.homogeneous[0].map((v) => F.toNumber(v));
          g.infiniteLine(p, d, { color: g.c.sol, width: 6, alpha: 0.4 });
        }
      } else {
        const a = [0, 1].map((j) => Cur.map((row) => F.toNumber(row[j])));
        const bb = Cur.map((row) => F.toNumber(row[2]));
        if (Math.abs(a[0][0] * a[1][1] - a[0][1] * a[1][0]) > 1e-12) g.transformedGrid([[a[0][0], a[1][0]], [a[0][1], a[1][1]]], { color: g.c.tgrid, alpha: 0.35, axes: false, width: 1 });
        const x = state.x;
        const p1 = [x[0] * a[0][0], x[0] * a[0][1]];
        const p2 = [p1[0] + x[1] * a[1][0], p1[1] + x[1] * a[1][1]];
        g.arrow([0, 0], a[0], { color: g.c.i, width: 3.5 });
        g.arrow([0, 0], a[1], { color: g.c.j, width: 3.5 });
        g.mathLabel(a[0], 'a', { color: g.c.i, sub: 1, away: a[1] });
        g.mathLabel(a[1], 'a', { color: g.c.j, sub: 2, away: a[0] });
        g.arrow([0, 0], p1, { color: g.c.i, width: 2.5, dash: [6, 5], alpha: 0.9 });
        g.arrow(p1, p2, { color: g.c.j, width: 2.5, dash: [6, 5], alpha: 0.9 });
        const hit = Math.hypot(p2[0] - bb[0], p2[1] - bb[1]) < 1e-6;
        g.arrow([0, 0], bb, { color: g.c.v, width: 3.5 });
        g.mathLabel(bb, 'b', { color: g.c.v, deco: 'arrow', offset: [14, -14] });
        g.point(p2, { color: hit ? g.c.sol : g.c.text, r: hit ? 7 : 4.5 });
      }
    }

    function drawLine(g, row, color, faint, i, F) {
      const a = F.toNumber(row[0]), b = F.toNumber(row[1]), c = F.toNumber(row[2]);
      const nn = a * a + b * b;
      if (nn < 1e-18) return;
      const p0 = [(c * a) / nn, (c * b) / nn], d = [-b, a];
      g.infiniteLine(p0, d, faint ? { color, width: 1.5, dash: [5, 6], alpha: 0.55 } : { color, width: 3 });
      if (faint) return;
      const seg = g.clipLine(p0, d);
      if (!seg) return;
      const t = 0.12 + 0.1 * i;
      const q = [seg[0][0] + t * (seg[1][0] - seg[0][0]), seg[0][1] + t * (seg[1][1] - seg[0][1])];
      g.text(q, eqText(row, F), { color, offset: [8, -12], size: 12, weight: 600 });
    }

    function draw3D(sc, c) {
      sc.clear();
      const { Cur, Orig, F, sol, state } = c;
      if (state.view === 'rows') {
        if (state.show.includes('orig') && c.changed) Orig.forEach((row, i) => {
          const nrm = row.slice(0, 3).map((v) => F.toNumber(v));
          if (Math.hypot(...nrm) > 1e-12) sc.planeEq(nrm, F.toNumber(row[3]), ROW_COLORS[i], { size: 4, opacity: 0.05, edges: true });
        });
        Cur.forEach((row, i) => {
          const nrm = row.slice(0, 3).map((v) => F.toNumber(v));
          if (Math.hypot(...nrm) > 1e-12) sc.planeEq(nrm, F.toNumber(row[3]), ROW_COLORS[i], { size: 4, opacity: 0.22, edges: true });
        });
        if (sol.status === 'unique') {
          const p = sol.particular.map((v) => F.toNumber(v));
          sc.point(p, 'sol', { r: 0.14 });
          sc.label(p, `(${sol.particular.map((v) => plainValue(v)).join(', ')})`, 'sol', { offset: [14, -14], size: 13 });
        } else if (sol.status === 'infinite') {
          const p = sol.particular.map((v) => F.toNumber(v));
          if (sol.homogeneous.length === 1) sc.lineThrough(p, sol.homogeneous[0].map((v) => F.toNumber(v)), 'sol', { length: 10 });
        }
      } else {
        const a = [0, 1, 2].map((j) => Cur.map((row) => F.toNumber(row[j])));
        const bb = Cur.map((row) => F.toNumber(row[3]));
        const x = state.x;
        const keys = ['i', 'j', 'k'];
        let p = [0, 0, 0];
        a.forEach((col, j) => {
          sc.arrow([0, 0, 0], col, keys[j]);
          sc.label(col, `\\mathbf{a}_{${j + 1}}`, keys[j], { tex: true, offset: [12, -10] });
          const q = L.addVec(p, L.scaleVec(col, x[j]));
          sc.line([p, q], keys[j], { dashed: true });
          p = q;
        });
        sc.arrow([0, 0, 0], bb, 'v');
        sc.label(bb, '\\vec{b}', 'v', { tex: true, offset: [12, -12] });
        sc.point(p, Math.hypot(p[0] - bb[0], p[1] - bb[1], p[2] - bb[2]) < 1e-6 ? 'sol' : 'text', { r: 0.1 });
      }
      sc.requestRender();
    }

    // Elimination helpers ---------------------------------------------------------
    function systemField(state) {
      const n = +state.n;
      const aug = state.A.map((row, i) => [...row, state.b[i]]);
      const ops = parseOps(state.ops);
      const cEntries = ops.filter((o) => o.type !== 'swap').map((o) => makeEntry(o.cText));
      const all = [...aug, cEntries.length ? cEntries : [makeEntry('1')]];
      const exact = all.every((row) => row.every((e) => e.ok && e.q));
      const F = exact ? RationalField : floatFieldFor(aug.map((r) => r.map((e) => e.x)));
      const Orig = aug.map((row) => row.map((e) => (exact ? e.q : e.x)));
      let Cur = Orig;
      const applied = [];
      for (const o of ops) {
        const op = { ...o };
        if (o.type !== 'swap') {
          const e = makeEntry(o.cText);
          op.c = exact ? e.q : e.x;
          if (!e.ok || (o.type === 'scale' && F.isZero(op.c))) continue;
        }
        if (op.i < 0 || op.i >= n || (op.j !== undefined && (op.j < 0 || op.j >= n))) continue;
        Cur = L.applyRowOp(Cur, op, F);
        if (!F.exact) Cur = Cur.map((row) => row.map((v) => (F.isZero(v) ? 0 : v)));
        applied.push(op);
      }
      return { F, Orig, Cur, applied, n };
    }

    function stepForward(k) {
      const state = store.state;
      const { F, Cur, n } = systemField(state);
      const ops = parseOps(state.ops);
      let M2 = Cur;
      for (let s = 0; s < k; s++) {
        const next = L.nextEliminationStep(M2, F, n);
        if (!next) break;
        const op = next.op;
        ops.push(op.type === 'swap' ? { type: 'swap', i: op.i, j: op.j, auto: true } : { ...op, cText: cToText(op.c, F), auto: true });
        M2 = L.applyRowOp(M2, op, F);
        if (!F.exact) M2 = M2.map((row) => row.map((v) => (F.isZero(v) ? 0 : v)));
      }
      store.set({ ops: formatOps(ops) });
    }

    function applyManual() {
      const type = opType.value;
      const i = +opI.value - 1, j = +opJ.value - 1;
      opMsg.textContent = '';
      if (type !== 'scale' && i === j) { opMsg.textContent = tr({ es: 'Elige dos filas distintas.', en: 'Choose two different rows.' }); return; }
      const e = makeEntry(opC.value);
      if (type !== 'swap' && !e.ok) { opMsg.textContent = tr({ es: 'El escalar c no es válido.', en: 'The scalar c is not valid.' }); return; }
      if (type === 'scale' && Math.abs(e.x) < 1e-15) { opMsg.textContent = tr({ es: 'Multiplicar una fila por 0 no es una operación elemental: se perdería información.', en: 'Multiplying a row by 0 is not an elementary operation: information would be lost.' }); return; }
      const ops = parseOps(store.get('ops'));
      ops.push(type === 'swap' ? { type, i, j } : type === 'scale' ? { type, i, cText: e.text.replace(/,/g, '.').replace(/\s+/g, '') } : { type, i, j, cText: e.text.replace(/,/g, '.').replace(/\s+/g, '') });
      store.set({ ops: formatOps(ops) });
    }

    function render(state) {
      const n = +state.n;
      if (`${n}|${state.view}` !== viewKey) { viewKey = `${n}|${state.view}`; buildView(state); }
      if (editorKey !== String(n)) {
        editorKey = String(n);
        editor = matrixEditor({ rows: n, cols: n, label: 'A =', colColors: ['var(--c-i)', 'var(--c-j)', 'var(--c-k)'], get: () => store.get('A'), set: (A) => store.set({ A, ops: '' }), name: { es: 'Matriz A', en: 'Matrix A' } });
        bEditor = vectorEditor({ n, label: '\\vec{b} =', get: () => store.get('b'), set: (b) => store.set({ b, ops: '' }) });
        editorSlot.replaceChildren(h('div', { class: 'row', style: { alignItems: 'center', gap: '16px' } }, editor.el, bEditor.el));
        fillOps();
        rebuildPresets();
      }
      editor.update(); bEditor.update(); sizeSeg.update(); viewSeg.update();
      eChips.forEach((c) => c.update());
      xSliders.forEach((s, k) => { s.update(); s.el.hidden = k >= n; });
      colsCard.el.hidden = state.view !== 'cols';

      const { F, Orig, Cur, applied } = systemField(state);
      const changed = applied.length > 0;
      const sol = L.solve(Orig.map((r2) => r2.slice(0, n)), Orig.map((r2) => r2[n]), F);
      cur = { Cur, Orig, F, sol, state, changed };
      lastDerived = { F, sol };
      if (view instanceof Plane2D) view.requestRender(); else draw3D(view, cur);

      renderTex(sysTex, systemTex(Orig, F, n), { display: true });
      // Leading entries that already form a staircase (the pivots found so far).
      const pivots = [];
      for (const row of Cur) {
        let c = -1;
        for (let j = 0; j < n; j++) if (!F.isZero(row[j])) { c = j; break; }
        if (c < 0 || (pivots.length && c <= pivots[pivots.length - 1])) break;
        pivots.push(c);
      }
      renderTex(augTex, augmentedTex(Cur, F, n, pivots), { display: true });
      const echelon = L.isRowEchelon(Cur, F, n), reduced = L.isRREF(Cur, F, n);
      phase.innerHTML = `<span class="badge ${echelon ? 'badge--ok' : ''}">${tr({ es: 'Escalonada', en: 'Echelon' })}${echelon ? ' ✓' : ''}</span> <span class="badge ${reduced ? 'badge--ok' : ''}">${tr({ es: 'Escalonada reducida', en: 'Reduced echelon' })}${reduced ? ' ✓' : ''}</span>`;
      const next = L.nextEliminationStep(Cur, F, n);
      nextBtn.disabled = !next; allBtn.disabled = !next; undoBtn.disabled = !applied.length; clearBtn.disabled = !applied.length;
      if (next) {
        const why = next.op.type === 'swap'
          ? { es: 'el pivote es 0: intercambiar filas', en: 'the pivot is 0: swap rows' }
          : next.op.type === 'scale' ? { es: 'hacer el pivote igual a 1', en: 'make the pivot equal to 1' }
            : next.phase === 'forward' ? { es: 'anular la entrada bajo el pivote', en: 'clear the entry below the pivot' } : { es: 'anular la entrada sobre el pivote', en: 'clear the entry above the pivot' };
        nextDesc.innerHTML = `${tr({ es: 'Siguiente:', en: 'Next:' })} ${texInline(opTex(next.op, F))} <span class="muted">(${tr(why)})</span>`;
      } else nextDesc.textContent = tr({ es: 'La matriz ya está en forma escalonada reducida.', en: 'The matrix is already in reduced row echelon form.' });
      history.replaceChildren(...applied.map((op) => h('li', { html: texInline(opTex(op, F)) })));

      // Readouts
      const rA = sol.rankA, rAb = sol.rankAb;
      const statusBadge = { unique: ['badge--ok', { es: 'Compatible determinado: solución única', en: 'Consistent, independent: unique solution' }], infinite: ['badge--warn', { es: 'Compatible indeterminado: infinitas soluciones', en: 'Consistent, dependent: infinitely many solutions' }], none: ['badge--danger', { es: 'Incompatible: sin solución', en: 'Inconsistent: no solution' }] }[sol.status];
      r.cls.set({ html: `<span class="badge ${statusBadge[0]}">${tr(statusBadge[1])}</span>` }, {
        html: `${texInline(`${rankOp()} A = ${rA},\\; ${rankOp()}[A\\,|\\,\\vec{b}] = ${rAb},\\; n = ${n}`)}`,
      });
      if (sol.status === 'unique') r.sol.set(`\\vec{x} = ${cls('c-sol', texVector(sol.particular))}`);
      else if (sol.status === 'infinite') {
        const params = ['s', 't', 'u'];
        const hom = sol.homogeneous.map((v, k) => `${params[k]}\\,${texVector(v)}`).join(' + ');
        r.sol.set(`\\vec{x} = ${texVector(sol.particular)} + ${hom},\\quad ${params.slice(0, sol.homogeneous.length).join(', ')}\\in\\mathbb{R}`, { es: `Solución particular más cualquier vector de ker A (dimensión ${sol.homogeneous.length}).`, en: `A particular solution plus any vector of ker A (dimension ${sol.homogeneous.length}).` });
      } else r.sol.set(`\\text{${tr({ es: 'ninguna: aparece la ecuación 0 = c con c ≠ 0', en: 'none: the equation 0 = c with c ≠ 0 appears' })}}`);
      if (applied.length) {
        let E = L.identity(n, F);
        for (const op of applied) E = L.matMul(L.elementaryMatrix(n, op, F), E, F);
        r.E.set(`E = E_{${applied.length}}\\cdots E_{1} = ${texMatrix(E)},\\qquad E\\,[A\\,|\\,\\vec{b}] = [\\,EA\\,|\\,E\\vec{b}\\,]`, { es: 'Cada operación elemental es multiplicar a la izquierda por una matriz invertible; por eso no cambia las soluciones.', en: 'Each elementary operation is a left multiplication by an invertible matrix; that is why the solutions do not change.' });
        r.E.show(true);
      } else r.E.show(false);

      ctx.setLegend(state.view === 'rows' ? [
        ...Cur.map((_, i) => ({ color: ROW_VARS[i], label: { es: `ecuación ${i + 1}`, en: `equation ${i + 1}` } })),
        changed && state.show.includes('orig') && { color: 'var(--muted)', kind: 'dash', label: { es: 'sistema original', en: 'original system' } },
        { color: 'var(--c-sol)', label: { es: 'conjunto solución', en: 'solution set' } },
      ] : [
        { color: 'var(--c-i)', tex: '\\mathbf{a}_1' }, { color: 'var(--c-j)', tex: '\\mathbf{a}_2' }, n === 3 && { color: 'var(--c-k)', tex: '\\mathbf{a}_3' },
        { color: 'var(--c-v)', tex: '\\vec{b}' },
        { color: 'var(--muted)', kind: 'dash', tex: 'x_1\\mathbf{a}_1 + x_2\\mathbf{a}_2' + (n === 3 ? ' + x_3\\mathbf{a}_3' : '') },
      ]);
      return { F, sol, Cur, n, applied, reduced, Orig };
    }

    return {
      render,
      snapshot: () => view.snapshot(),
      onReset: () => { viewKey = ''; ctx.rerender(); },
    };
  },

  learn: {
    what: {
      es: `<p>Cada ecuación $a_{i1}x + a_{i2}y = b_i$ describe una recta (en $\\mathbb{R}^3$, un plano). Resolver el sistema es encontrar los puntos comunes: la <strong>imagen de filas</strong>. Dos rectas pueden cortarse en un punto, ser paralelas (ninguna solución) o coincidir (infinitas).</p>
<p>La <strong>imagen de columnas</strong> lee el mismo sistema como $x_1\\mathbf{a}_1 + x_2\\mathbf{a}_2 = \\vec{b}$: ¿qué combinación de las columnas de $A$ alcanza $\\vec{b}$? Mueve los deslizadores $x_i$ hasta que el camino punteado llegue a $\\vec{b}$. Hay solución exactamente cuando $\\vec{b}$ está en el espacio columna.</p>
<p>La <strong>eliminación gaussiana</strong> aplica operaciones elementales a las filas de $[A\\,|\\,\\vec{b}]$. En la imagen de filas verás que las rectas o planos <em>cambian</em>, pero su intersección no. Puedes avanzar con «Paso siguiente» (el algoritmo: eliminación hacia abajo y luego hacia arriba) o aplicar tus propias operaciones. Todo se calcula con fracciones exactas.</p>`,
      en: `<p>Each equation $a_{i1}x + a_{i2}y = b_i$ describes a line (in $\\mathbb{R}^3$, a plane). Solving the system means finding the common points: the <strong>row picture</strong>. Two lines can meet at a point, be parallel (no solution) or coincide (infinitely many).</p>
<p>The <strong>column picture</strong> reads the same system as $x_1\\mathbf{a}_1 + x_2\\mathbf{a}_2 = \\vec{b}$: which combination of the columns of $A$ reaches $\\vec{b}$? Move the sliders $x_i$ until the dashed path reaches $\\vec{b}$. There is a solution exactly when $\\vec{b}$ is in the column space.</p>
<p><strong>Gaussian elimination</strong> applies elementary operations to the rows of $[A\\,|\\,\\vec{b}]$. In the row picture you will see the lines or planes <em>change</em>, but not their intersection. Advance with “Next step” (the algorithm: elimination downwards, then upwards) or apply your own operations. Everything is computed with exact fractions.</p>`,
    },
    prompts: {
      es: [
        'Pulsa «Paso siguiente» varias veces en el ejemplo inicial. ¿Qué forma tienen las rectas al final? ¿Por qué el punto de corte nunca se mueve?',
        'Elige «Rectas paralelas». Lleva la eliminación hasta el final: ¿qué ecuación imposible aparece?',
        'En $3\\times3$, elige «Prisma». Ningún par de planos es paralelo y aun así no hay solución. ¿Cómo lo detecta el rango?',
        'En la imagen de columnas, ¿qué pasa si $\\mathbf{a}_1$ y $\\mathbf{a}_2$ son paralelos? ¿Para qué $\\vec{b}$ hay solución?',
        'Aplica una operación manual $R_1 \\leftarrow 2R_1$ y mira la matriz $E$. ¿Qué matriz deshace esa operación?',
      ],
      en: [
        'Press “Next step” several times on the initial example. What do the lines look like at the end? Why does the intersection point never move?',
        'Pick “Parallel lines”. Run the elimination to the end: which impossible equation appears?',
        'In $3\\times3$, pick “Prism”. No two planes are parallel and still there is no solution. How does the rank detect it?',
        'In the column picture, what happens if $\\mathbf{a}_1$ and $\\mathbf{a}_2$ are parallel? For which $\\vec{b}$ is there a solution?',
        'Apply the manual operation $R_1 \\leftarrow 2R_1$ and look at the matrix $E$. Which matrix undoes that operation?',
      ],
    },
    formal: [
      {
        kind: 'theorem',
        title: { es: 'Rouché–Frobenius', en: 'Rouché–Capelli (Rouché–Frobenius)' },
        body: {
          es: '<p>El sistema $A\\mathbf{x} = \\mathbf{b}$ con $A\\in\\mathbb{R}^{m\\times n}$ tiene solución si y solo si $\\operatorname{rango}A = \\operatorname{rango}[A\\,|\\,\\mathbf{b}]$. En ese caso, la solución es única si el rango es $n$, y si es $r<n$ el conjunto de soluciones es $\\mathbf{x}_p + \\ker A$, un subespacio afín de dimensión $n - r$.</p>',
          en: '<p>The system $A\\mathbf{x} = \\mathbf{b}$ with $A\\in\\mathbb{R}^{m\\times n}$ has a solution if and only if $\\operatorname{rank}A = \\operatorname{rank}[A\\,|\\,\\mathbf{b}]$. In that case the solution is unique if the rank is $n$, and if it is $r<n$ the solution set is $\\mathbf{x}_p + \\ker A$, an affine subspace of dimension $n - r$.</p>',
        },
      },
      {
        kind: 'proposition',
        title: { es: 'Operaciones elementales y matrices elementales', en: 'Elementary operations and elementary matrices' },
        body: {
          es: '<p>Intercambiar dos filas, multiplicar una fila por $c\\neq 0$ y sumar a una fila un múltiplo de otra equivalen a multiplicar a la izquierda por una matriz elemental $E$, que es invertible (su inversa es la operación opuesta). Como $E$ es invertible, $A\\mathbf{x}=\\mathbf{b} \\iff EA\\mathbf{x} = E\\mathbf{b}$: los sistemas equivalentes por filas tienen las mismas soluciones.</p>',
          en: '<p>Swapping two rows, multiplying a row by $c\\neq 0$ and adding a multiple of one row to another are equivalent to left multiplication by an elementary matrix $E$, which is invertible (its inverse is the opposite operation). Since $E$ is invertible, $A\\mathbf{x}=\\mathbf{b} \\iff EA\\mathbf{x} = E\\mathbf{b}$: row-equivalent systems have the same solutions.</p>',
        },
      },
      {
        kind: 'algorithm',
        title: { es: 'Eliminación de Gauss–Jordan', en: 'Gauss–Jordan elimination' },
        body: {
          es: '<p>1) Hacia abajo: para cada columna, elegir un pivote no nulo (intercambiando filas si hace falta) y anular las entradas debajo de él; se obtiene una forma escalonada. 2) Hacia arriba: dividir cada fila pivote por su pivote y anular las entradas sobre él; se obtiene la forma escalonada reducida $R$, que es <em>única</em>. Las columnas sin pivote corresponden a variables libres.</p>',
          en: '<p>1) Downwards: for each column choose a non-zero pivot (swapping rows if needed) and clear the entries below it; this gives an echelon form. 2) Upwards: divide each pivot row by its pivot and clear the entries above it; this gives the reduced row echelon form $R$, which is <em>unique</em>. Columns without a pivot correspond to free variables.</p>',
        },
      },
      {
        kind: 'remark',
        title: { es: 'Filas y columnas', en: 'Rows and columns' },
        body: {
          es: '<p>$A\\mathbf{x} = \\mathbf{b}$ tiene solución $\\iff \\mathbf{b}\\in\\operatorname{Im}A = \\operatorname{gen}\\{\\mathbf{a}_1,\\dots,\\mathbf{a}_n\\}$ (imagen de columnas). Para $A$ cuadrada, la solución es única para todo $\\mathbf{b}$ $\\iff \\det A \\neq 0$ $\\iff$ las $n$ rectas o hiperplanos no son «degenerados» $\\iff$ las columnas son una base.</p>',
          en: '<p>$A\\mathbf{x} = \\mathbf{b}$ has a solution $\\iff \\mathbf{b}\\in\\operatorname{Im}A = \\operatorname{span}\\{\\mathbf{a}_1,\\dots,\\mathbf{a}_n\\}$ (column picture). For square $A$, the solution is unique for every $\\mathbf{b}$ $\\iff \\det A \\neq 0$ $\\iff$ the $n$ lines or hyperplanes are not “degenerate” $\\iff$ the columns form a basis.</p>',
        },
      },
    ],
  },

  challenges: [
    {
      id: 'none2',
      title: { es: 'Sin solución', en: 'No solution' },
      text: { es: 'Modifica el sistema $2\\times 2$ para que sea incompatible.', en: 'Modify the $2\\times 2$ system so that it is inconsistent.' },
      hint: { es: 'Haz las rectas paralelas pero distintas: filas de $A$ proporcionales y $\\vec{b}$ no.', en: 'Make the lines parallel but distinct: proportional rows of $A$, but not of $\\vec{b}$.' },
      setup: (store) => store.set({ n: '2', A: M(DEFAULTS[2].A), b: V(DEFAULTS[2].b), ops: '', view: 'rows' }),
      check: (s, d) => s.n === '2' && d.sol.status === 'none',
    },
    {
      id: 'byhand',
      title: { es: 'Reduce a mano', en: 'Reduce by hand' },
      text: { es: 'Lleva el sistema $3\\times 3$ a forma escalonada reducida usando solo operaciones manuales (sin «Paso siguiente»).', en: 'Bring the $3\\times 3$ system to reduced row echelon form using only manual operations (no “Next step”).' },
      hint: { es: 'Primero anula debajo de cada pivote; después divide por los pivotes y anula hacia arriba.', en: 'First clear below each pivot; then divide by the pivots and clear upwards.' },
      setup: (store) => store.set({ n: '3', A: M(DEFAULTS[3].A), b: V(DEFAULTS[3].b), ops: '', view: 'rows' }),
      check: (s, d) => s.n === '3' && d.reduced && d.applied.length >= 3 && d.applied.every((op) => !op.auto),
    },
    {
      id: 'combo',
      title: { es: 'Una combinación prescrita', en: 'A prescribed combination' },
      text: { es: 'Cambia $\\vec{b}$ para que la única solución sea $\\vec{x} = (2, -1)$.', en: 'Change $\\vec{b}$ so that the unique solution is $\\vec{x} = (2, -1)$.' },
      hint: { es: '$\\vec{b} = 2\\mathbf{a}_1 - \\mathbf{a}_2$.', en: '$\\vec{b} = 2\\mathbf{a}_1 - \\mathbf{a}_2$.' },
      setup: (store) => store.set({ n: '2', A: M(DEFAULTS[2].A), b: V(DEFAULTS[2].b), ops: '', view: 'cols' }),
      check: (s, d) => s.n === '2' && d.sol.status === 'unique' && Math.abs(d.F.toNumber(d.sol.particular[0]) - 2) < 1e-9 && Math.abs(d.F.toNumber(d.sol.particular[1]) + 1) < 1e-9,
    },
    {
      id: 'sheaf',
      title: { es: 'Tres planos, una recta', en: 'Three planes, one line' },
      text: { es: 'En $3\\times 3$, consigue infinitas soluciones con tres planos distintos (ninguno repetido).', en: 'In $3\\times 3$, get infinitely many solutions with three distinct planes (none repeated).' },
      hint: { es: 'Haz que la tercera ecuación sea la suma de las dos primeras.', en: 'Make the third equation the sum of the first two.' },
      setup: (store) => store.set({ n: '3', A: M(DEFAULTS[3].A), b: V(DEFAULTS[3].b), ops: '', view: 'rows' }),
      check: (s, d) => s.n === '3' && d.sol.status === 'infinite' && d.sol.rankA === 2 && distinctRows(d.Orig, d.F),
    },
  ],
});

// ---------------------------------------------------------------------------

function texInline(tex) {
  const span = document.createElement('span');
  renderTex(span, tex);
  return span.innerHTML;
}

function eqText(row, F) {
  const n = row.length - 1;
  const vars = ['x', 'y', 'z'];
  let s = '';
  for (let j = 0; j < n; j++) {
    const v = F.toNumber(row[j]);
    if (Math.abs(v) < 1e-12) continue;
    const mag = plainValue(F.exact ? row[j].abs() : Math.abs(v));
    const coef = mag === '1' ? '' : mag;
    s += s ? (v < 0 ? ' − ' : ' + ') : v < 0 ? '−' : '';
    s += `${coef}${vars[j]}`;
  }
  return `${s || '0'} = ${plainValue(row[n])}`;
}

function systemTex(Aug, F, n) {
  const vars = ['x', 'y', 'z'];
  const lines = Aug.map((row, i) => {
    let lhs = '';
    for (let j = 0; j < n; j++) {
      const x = F.toNumber(row[j]);
      if (Math.abs(x) < 1e-12) continue;
      let t = texValue(F.exact ? row[j].abs() : Math.abs(x));
      if (t === '1') t = '';
      lhs += lhs ? (x < 0 ? ' - ' : ' + ') : x < 0 ? '-' : '';
      lhs += `${t}${vars[j]}`;
    }
    return `${cls(`c-row${i + 1}`, lhs || '0')} &= ${cls(`c-row${i + 1}`, texValue(row[n]))}`;
  });
  return `\\begin{aligned} ${lines.join(' \\\\ ')} \\end{aligned}`;
}

function augmentedTex(Aug, F, n, pivots) {
  const pivotSet = new Set(pivots.map((c, r) => `${r},${c}`));
  const rows = Aug.map((row, i) => row.map((v, j) => {
    const t = texValue(v);
    return pivotSet.has(`${i},${j}`) ? `\\htmlClass{c-accent}{\\boxed{${t}}}` : t;
  }).join(' & '));
  return `\\left[\\begin{array}{${'c'.repeat(n)}|c} ${rows.join(' \\\\ ')} \\end{array}\\right]`;
}

function distinctRows(Aug, F) {
  const proportional = (r1, r2) => {
    // r1 ∥ r2 ⇔ all 2×2 minors vanish.
    for (let a = 0; a < r1.length; a++) for (let b = a + 1; b < r1.length; b++) {
      if (Math.abs(F.toNumber(r1[a]) * F.toNumber(r2[b]) - F.toNumber(r1[b]) * F.toNumber(r2[a])) > 1e-9) return false;
    }
    return true;
  };
  for (let i = 0; i < Aug.length; i++) for (let j = i + 1; j < Aug.length; j++) if (proportional(Aug[i], Aug[j])) return false;
  return true;
}
