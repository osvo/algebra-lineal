import { createLab } from '../ui/shell.js';
import { codec, M, V } from '../ui/store.js';
import { Plane2D } from '../ui/plane2d.js';
import { Scene3D } from '../ui/scene3d.js';
import { card, matrixEditor, vectorEditor, flagChip, readout, animator, segmented, selectBox, button } from '../ui/controls.js';
import { h } from '../ui/dom.js';
import { renderTex } from '../ui/tex.js';
import { tr, setText } from '../ui/i18n.js';
import { entryFromNumber, makeEntry } from '../core/parse.js';
import * as L from '../core/linalg.js';
import { RationalField } from '../core/fields.js';
import { texValue, texMatrix, fmtDecimal, scalarNumber } from '../core/format.js';
import { COLS, COL_VARS, texCombo, presetSelect, memo, entriesKey } from './common.js';

const KEYS = ['i', 'j', 'k'];
const PRESETS2 = [
  { id: 'default', label: { es: 'det = 5', en: 'det = 5' }, value: [[3, 1], [1, 2]] },
  { id: 'shear', label: { es: 'Cizalla (det = 1)', en: 'Shear (det = 1)' }, value: [[1, 1], [0, 1]] },
  { id: 'rot', label: { es: 'Rotación 45° (det = 1)', en: 'Rotation 45° (det = 1)' }, value: [['√2/2', '-√2/2'], ['√2/2', '√2/2']] },
  { id: 'refl', label: { es: 'Reflexión (det = −1)', en: 'Reflection (det = −1)' }, value: [[1, 0], [0, -1]] },
  { id: 'scale', label: { es: 'Escalado (det = 6)', en: 'Scaling (det = 6)' }, value: [[2, 0], [0, 3]] },
  { id: 'sing', label: { es: 'Singular (det = 0)', en: 'Singular (det = 0)' }, value: [[2, 4], [1, 2]] },
];
const PRESETS3 = [
  { id: 'default', label: { es: 'det = 3', en: 'det = 3' }, value: [[2, 1, 0], [0, 1, 1], [1, 0, 1]] },
  { id: 'tri', label: { es: 'Triangular (det = 6)', en: 'Triangular (det = 6)' }, value: [[2, 1, 3], [0, 3, 1], [0, 0, 1]] },
  { id: 'perm', label: { es: 'Permutación cíclica (det = 1)', en: 'Cyclic permutation (det = 1)' }, value: [[0, 0, 1], [1, 0, 0], [0, 1, 0]] },
  { id: 'refl', label: { es: 'Reflexión en z = 0 (det = −1)', en: 'Reflection in z = 0 (det = −1)' }, value: [[1, 0, 0], [0, 1, 0], [0, 0, -1]] },
  { id: 'rot', label: { es: 'Rotación 90° en z (det = 1)', en: 'Rotation 90° about z (det = 1)' }, value: [[0, -1, 0], [1, 0, 0], [0, 0, 1]] },
  { id: 'sing', label: { es: 'Columnas coplanares (det = 0)', en: 'Coplanar columns (det = 0)' }, value: [[1, 0, 1], [0, 1, 1], [1, 1, 2]] },
];
const EXPANSIONS = ['r1', 'r2', 'r3', 'c1', 'c2', 'c3'];

const minorOf = (Mx, i, j) => Mx.filter((_, r) => r !== i).map((row) => row.filter((_, c) => c !== j));

const analyze = memo((entries) => {
  const { F, M: Mx } = L.fieldMatrix(entries);
  return { F, M: Mx, det: L.det(Mx, F), Af: entries.map((row) => row.map((e) => e.x)), n: entries.length };
});

createLab({
  id: 'det',
  lead: {
    es: 'El determinante mide cuánto estira una matriz las áreas (o los volúmenes) y si les da la vuelta. Mira por qué una cizalla no lo cambia, por qué un intercambio le cambia el signo y de dónde sale la regla de Cramer.',
    en: 'The determinant measures how much a matrix stretches areas (or volumes) and whether it flips them. See why a shear does not change it, why a swap flips its sign and where Cramer’s rule comes from.',
  },
  state: {
    mode: { def: 'area', codec: codec.enum(['area', 'cramer', 'vol']) },
    A: { def: M([[3, 1], [1, 2]]), codec: codec.matrix(2, 2) },
    B: { def: M([[2, 1, 0], [0, 1, 1], [1, 0, 1]]), codec: codec.matrix(3, 3) },
    op: { def: 'shear', codec: codec.enum(['none', 'scale', 'swap', 'shear']) },
    col: { def: 2, codec: codec.int(1, 2) },
    p: { def: V([1]), codec: codec.vector(1) },
    b: { def: V([5, 5]), codec: codec.vector(2) },
    coord: { def: 1, codec: codec.int(1, 2) },
    exp: { def: 'r1', codec: codec.enum(EXPANSIONS) },
    t: { def: 0, codec: codec.num(0, 1) },
    show: { def: ['unit', 'orient'], codec: codec.flags(['unit', 'orient', 'grid']) },
  },

  build(ctx) {
    const { store } = ctx;
    const anim = animator({ store, key: 't', max: 1, unitsPerSecond: 0.45 });
    ctx.bar.append(anim.el);

    // Panel -----------------------------------------------------------------------
    const modeSeg = segmented({
      options: [
        { value: 'area', label: { es: 'Área', en: 'Area' } },
        { value: 'cramer', label: { es: 'Cramer', en: 'Cramer' } },
        { value: 'vol', label: { es: 'Volumen 3D', en: '3D volume' } },
      ],
      get: () => store.get('mode'), set: (mode) => { anim.pause(); store.set({ mode, t: mode === 'cramer' ? 1 : 0 }); },
      label: { es: 'Modo', en: 'Mode' },
    });
    const ed2 = matrixEditor({ rows: 2, cols: 2, label: 'A =', colColors: COL_VARS, get: () => store.get('A'), set: (A) => store.set({ A }), name: { es: 'Matriz A', en: 'Matrix A' } });
    const ed3 = matrixEditor({ rows: 3, cols: 3, label: 'A =', colColors: COL_VARS, get: () => store.get('B'), set: (B) => store.set({ B }), name: { es: 'Matriz A', en: 'Matrix A' } });
    const pre2 = presetSelect({ store, key: 'A', presets: PRESETS2, onPick: (p) => store.set({ A: M(p.value), t: store.get('mode') === 'cramer' ? 1 : 0 }) });
    const pre3 = presetSelect({ store, key: 'B', presets: PRESETS3 });
    const modeHelp = h('p');
    const matrixCard = card({ title: { es: 'Matriz y modo', en: 'Matrix and mode' }, body: [modeSeg.el, ed2.el, ed3.el, pre2.el, pre3.el, modeHelp] });

    // Column operation (area mode)
    const opSeg = segmented({
      options: [
        { value: 'none', label: { es: 'Ninguna', en: 'None' } },
        { value: 'scale', label: { es: 'Escalar', en: 'Scale' } },
        { value: 'swap', label: { es: 'Intercambiar', en: 'Swap' } },
        { value: 'shear', label: { es: 'Cizalla', en: 'Shear' } },
      ],
      get: () => store.get('op'),
      set: (op) => { anim.pause(); store.set({ op, t: 0, p: V([op === 'scale' ? 2 : 1]) }); },
      label: { es: 'Operación de columna', en: 'Column operation' },
    });
    const colSeg = segmented({
      options: [{ value: 1, tex: '\\hat{a}_1' }, { value: 2, tex: '\\hat{a}_2' }],
      get: () => store.get('col'), set: (col) => store.set({ col }),
      label: { es: 'Columna que cambia', en: 'Column that changes' },
    });
    const pEditor = vectorEditor({ n: 1, label: 'k =', color: 'var(--accent)', get: () => store.get('p'), set: (p) => store.set({ p }), name: { es: 'Parámetro', en: 'Parameter' } });
    const opFormula = h('p');
    const applyBtn = button({
      label: { es: 'Aplicar a A', en: 'Apply to A' }, iconName: 'check', small: true,
      onClick: () => {
        const res = cur && cur.opResult;
        if (!res) return;
        anim.pause();
        store.set({ A: res.map((row) => row.map((x) => (cur.opField === RationalField ? makeEntry(x.toString()) : entryFromNumber(x)))), t: 0 });
      },
    });
    const opCard = card({ title: { es: 'Operación de columna', en: 'Column operation' }, body: [opSeg.el, colSeg.el, pEditor.el, opFormula, h('div', { class: 'row' }, applyBtn)] });

    // Cramer
    const bEditor = vectorEditor({ n: 2, label: '\\mathbf{b} =', color: 'var(--c-w)', get: () => store.get('b'), set: (b) => store.set({ b }), name: { es: 'Vector b', en: 'Vector b' } });
    const coordSeg = segmented({
      options: [{ value: 1, tex: 'x_1' }, { value: 2, tex: 'x_2' }],
      get: () => store.get('coord'), set: (coord) => store.set({ coord }),
      label: { es: 'Coordenada', en: 'Coordinate' },
    });
    const cramerCard = card({ title: { es: 'Sistema A x = b', en: 'System A x = b' }, body: [bEditor.el, coordSeg.el] });

    // 3D expansion choice
    const expSel = selectBox({
      options: EXPANSIONS.map((e) => ({ value: e, label: e[0] === 'r' ? { es: `Desarrollar por la fila ${e[1]}`, en: `Expand along row ${e[1]}` } : { es: `Desarrollar por la columna ${e[1]}`, en: `Expand along column ${e[1]}` } })),
      get: () => store.get('exp'), set: (exp) => store.set({ exp }),
      label: { es: 'Desarrollo por cofactores', en: 'Cofactor expansion' },
    });
    const expCard = card({ title: { es: 'Desarrollo', en: 'Expansion' }, body: [expSel.el] });

    const chips = [
      flagChip(store, 'show', 'unit', { es: 'Cuadrado o cubo unidad', en: 'Unit square or cube' }, 'var(--muted)'),
      flagChip(store, 'show', 'orient', { es: 'Orientación', en: 'Orientation' }, 'var(--c-det)'),
      flagChip(store, 'show', 'grid', { es: 'Cuadrícula transformada', en: 'Transformed grid' }, 'var(--tgrid)'),
    ];
    const showCard = card({ title: { es: 'Mostrar', en: 'Show' }, body: [h('div', { class: 'chip-row' }, chips.map((c) => c.el))] });

    const r = {
      det: readout(null, { labelTex: '\\det A', block: true }),
      meaning: readout({ es: 'Significado', en: 'Meaning' }, { block: true }),
      op: readout({ es: 'Efecto de la operación', en: 'Effect of the operation' }, { block: true }),
      cramer: readout({ es: 'Regla de Cramer', en: 'Cramer’s rule' }, { block: true }),
      now: readout({ es: 'Ahora', en: 'Now' }, { block: true }),
      cof: readout({ es: 'Por cofactores', en: 'By cofactors' }, { block: true }),
      elim: readout({ es: 'Por eliminación', en: 'By elimination' }, { block: true }),
    };
    const resultsCard = card({ title: { es: 'Cálculo exacto', en: 'Exact computation' }, body: [h('div', { class: 'readouts' }, Object.values(r).map((x) => x.el))] });
    ctx.panel.append(matrixCard.el, opCard.el, cramerCard.el, expCard.el, showCard.el, resultsCard.el);

    // Views ---------------------------------------------------------------------------
    let view = null, viewKind = '', cur = null, pLabelTex = 'k =';
    const setCol2 = (j) => ([x, y]) => {
      const A = store.get('A').map((row) => row.slice());
      A[0][j] = entryFromNumber(x); A[1][j] = entryFromNumber(y);
      anim.pause();
      store.set({ A, t: store.get('mode') === 'cramer' ? 1 : 0 });
    };
    const setCol3 = (j) => (p) => {
      const B = store.get('B').map((row) => row.slice());
      for (let i = 0; i < 3; i++) B[i][j] = entryFromNumber(p[i]);
      store.set({ B });
    };
    function buildView(kind) {
      if (view) view.dispose();
      ctx.clearViews();
      const el = ctx.addView();
      if (kind === '2d') {
        const pl = new Plane2D(el, { range: 4.2 });
        const colGet = (j) => () => { const A = store.get('A'); return [A[0][j].x, A[1][j].x]; };
        pl.addHandle({ id: 'a1', color: 'i', get: colGet(0), set: setCol2(0) });
        pl.addHandle({ id: 'a2', color: 'j', get: colGet(1), set: setCol2(1) });
        pl.addHandle({ id: 'b', color: 'w', visible: () => store.get('mode') === 'cramer', get: () => store.get('b').map((e) => e.x), set: (p) => store.set({ b: p.map(entryFromNumber), t: 1 }) });
        pl.setDraw((g) => cur && draw2D(g, cur));
        view = pl;
      } else {
        const sc = new Scene3D(el, { extent: 4, frustum: 9 });
        [0, 1, 2].forEach((j) => sc.addHandle({ id: `a${j}`, color: KEYS[j], get: () => store.get('B').map((row) => row[j].x), set: setCol3(j) }));
        sc.onTheme = () => ctx.rerender();
        view = sc;
      }
      viewKind = kind;
    }

    /** Columns of A after the column operation at progress t (floats), and the signed-area factor. */
    function opColumns(Af, op, col, p, t) {
      const a = [[Af[0][0], Af[1][0]], [Af[0][1], Af[1][1]]];
      const j = col - 1, i = 1 - j;
      if (op === 'scale') { const f = 1 + t * (p - 1); a[j] = a[j].map((x) => x * f); return { a, factor: f }; }
      if (op === 'shear') { a[j] = a[j].map((x, k) => x + t * p * a[i][k]); return { a, factor: 1 }; }
      if (op === 'swap') {
        const a1 = a[0].map((x, k) => (1 - t) * x + t * a[1][k]);
        const a2 = a[1].map((x, k) => (1 - t) * x + t * a[0][k]);
        return { a: [a1, a2], factor: 1 - 2 * t };
      }
      return { a, factor: 1 };
    }

    function orientationArc(g, a1, a2, sign, color) {
      if (!sign || Math.hypot(...a1) < 1e-9 || Math.hypot(...a2) < 1e-9) return;
      const ctx2 = g.ctx;
      const [ox, oy] = g.S(0, 0);
      const t1 = Math.atan2(a1[1], a1[0]);
      let d = Math.atan2(a2[1], a2[0]) - t1;
      if (sign > 0) { while (d <= 0) d += 2 * Math.PI; } else { while (d >= 0) d -= 2 * Math.PI; }
      const rad = 34;
      g.style({ color, width: 2 });
      ctx2.beginPath();
      ctx2.arc(ox, oy, rad, -t1, -(t1 + d), sign > 0);
      ctx2.stroke();
      const te = t1 + d;
      const tip = [ox + rad * Math.cos(te), oy - rad * Math.sin(te)];
      const tan = [-Math.sin(te) * sign, -Math.cos(te) * sign]; // screen direction of travel
      const nrm = [-tan[1], tan[0]];
      ctx2.fillStyle = color;
      ctx2.beginPath();
      ctx2.moveTo(tip[0] + tan[0] * 6, tip[1] + tan[1] * 6);
      ctx2.lineTo(tip[0] - tan[0] * 4 + nrm[0] * 5, tip[1] - tan[1] * 4 + nrm[1] * 5);
      ctx2.lineTo(tip[0] - tan[0] * 4 - nrm[0] * 5, tip[1] - tan[1] * 4 - nrm[1] * 5);
      ctx2.closePath(); ctx2.fill();
      g.reset();
    }

    function parallelogram(g, a1, a2, { alpha = 1, label = null } = {}) {
      const d = a1[0] * a2[1] - a1[1] * a2[0];
      const col = d < -1e-12 ? g.c.detNeg : g.c.det;
      g.polygon([[0, 0], a1, [a1[0] + a2[0], a1[1] + a2[1]], a2], { fill: col, stroke: col, width: 2, fillAlpha: 0.26, alpha });
      if (label) g.text([(a1[0] + a2[0]) / 2, (a1[1] + a2[1]) / 2], label, { color: col, align: 'center', size: 13, weight: 600 });
      return d;
    }

    function draw2D(g, c) {
      const { an, show, mode, t } = c;
      g.backgroundGrid();
      const Af = an.Af;
      if (mode === 'area') {
        const { a } = opColumns(Af, c.op, c.col, c.p, t);
        const Mt = [[a[0][0], a[1][0]], [a[0][1], a[1][1]]];
        if (show.includes('grid')) g.transformedGrid(Mt, { color: g.c.tgrid, alpha: 0.5, axes: false, width: 1 });
        if (show.includes('unit')) g.polygon([[0, 0], [1, 0], [1, 1], [0, 1]], { stroke: g.c.muted, width: 1.5, dash: [5, 5] });
        if (c.op !== 'none' && t > 0) {
          // The original parallelogram, faint.
          const o1 = [Af[0][0], Af[1][0]], o2 = [Af[0][1], Af[1][1]];
          g.polygon([[0, 0], o1, [o1[0] + o2[0], o1[1] + o2[1]], o2], { stroke: g.c.muted, width: 1.2, dash: [3, 4], alpha: 0.8 });
        }
        const d = parallelogram(g, a[0], a[1], { label: `det = ${fmtDecimal(L.det2(Mt), 3)}` });
        if (show.includes('orient')) orientationArc(g, a[0], a[1], Math.sign(Math.abs(d) < 1e-12 ? 0 : d), d < 0 ? g.c.detNeg : g.c.det);
        g.arrow([0, 0], a[0], { color: g.c.i, width: 3.4 });
        g.arrow([0, 0], a[1], { color: g.c.j, width: 3.4 });
        g.mathLabel(a[0], 'a', { color: g.c.i, deco: 'hat', sub: 1, away: a[1] });
        g.mathLabel(a[1], 'a', { color: g.c.j, deco: 'hat', sub: 2, away: a[0] });
      } else {
        // Cramer: the parallelogram spanned by x and the other basis vector, carried by A.
        const Mt = L.lerpMatrix(L.identityFloat(2), Af, t);
        const x = c.xf;
        if (show.includes('grid')) g.transformedGrid(Mt, { color: g.c.tgrid, alpha: 0.5, axes: false, width: 1 });
        const e1 = L.mv2(Mt, 1, 0), e2 = L.mv2(Mt, 0, 1);
        if (show.includes('unit')) g.polygon([[0, 0], e1, [e1[0] + e2[0], e1[1] + e2[1]], e2], { stroke: g.c.muted, width: 1.5, dash: [5, 5] });
        if (x) {
          const Mx = L.mv2(Mt, ...x);
          const pair = c.coord === 1 ? [Mx, e2] : [e1, Mx];
          const dd = parallelogram(g, pair[0], pair[1], { label: `${fmtDecimal(L.det2(Mt), 3)} · x${c.coord === 1 ? '₁' : '₂'}` });
          if (show.includes('orient')) orientationArc(g, pair[0], pair[1], Math.sign(Math.abs(dd) < 1e-12 ? 0 : dd), dd < 0 ? g.c.detNeg : g.c.det);
          g.arrow([0, 0], Mx, { color: g.c.w, width: 3.4 });
          if (t < 0.001 || t > 0.999) g.mathLabel(Mx, t < 0.001 ? 'x' : 'b', { color: g.c.w, away: [0, 0] });
        }
        g.arrow([0, 0], e1, { color: g.c.i, width: 3 });
        g.arrow([0, 0], e2, { color: g.c.j, width: 3 });
        g.mathLabel(e1, t > 0.5 ? 'a' : 'i', { color: g.c.i, deco: 'hat', sub: t > 0.5 ? 1 : null, away: e2 });
        g.mathLabel(e2, t > 0.5 ? 'a' : 'j', { color: g.c.j, deco: 'hat', sub: t > 0.5 ? 2 : null, away: e1 });
      }
    }

    function draw3D(sc, c) {
      const { an, show } = c;
      sc.clear();
      const Af = an.Af;
      const d = L.det3(Af);
      if (show.includes('unit')) sc.parallelepiped([[1, 0, 0], [0, 1, 0], [0, 0, 1]], 'muted', { opacity: 0.05 });
      sc.parallelepiped(Af, Math.abs(d) < 1e-12 ? 'muted' : d < 0 ? 'detNeg' : 'det', { opacity: 0.28 });
      for (let j = 0; j < 3; j++) {
        const col = Af.map((row) => row[j]);
        sc.arrow([0, 0, 0], col, KEYS[j]);
        sc.label(col, `\\hat{a}_{${j + 1}}`, KEYS[j], { tex: true, offset: [14, -12], size: 16 });
      }
      sc.syncHandles();
      sc.requestRender();
    }

    const detLine2 = (Mx) => {
      const [[a, b], [c, d]] = Mx;
      const par = (v) => { const s = texValue(v); return s.startsWith('-') || /[+]/.test(s) ? `(${s})` : s; };
      return `${par(a)}\\cdot${par(d)} - ${par(b)}\\cdot${par(c)}`;
    };

    function render(state) {
      const mode = state.mode;
      const kind = mode === 'vol' ? '3d' : '2d';
      if (kind !== viewKind) buildView(kind);
      const an = mode === 'vol' ? analyze(entriesKey(state.B), state.B) : analyze(entriesKey(state.A), state.A);
      const F = an.F;
      const p = state.p[0];
      cur = { an, mode, show: state.show, t: state.t, op: state.op, col: state.col, p: p.x, coord: state.coord };

      // Exact result of the column operation (at t = 1).
      let opResult = null, detAfter = null;
      if (mode === 'area' && state.op !== 'none') {
        const all = L.fieldMatrix([...state.A, [p]]);
        const G = all.F;
        const Am = all.M.slice(0, 2), pv = all.M[2][0];
        const j = state.col - 1, i = 1 - j;
        opResult = Am.map((row) => row.slice());
        if (state.op === 'scale') opResult.forEach((row) => { row[j] = G.mul(pv, row[j]); });
        else if (state.op === 'shear') opResult.forEach((row) => { row[j] = G.add(row[j], G.mul(pv, row[i])); });
        else opResult.forEach((row) => { [row[0], row[1]] = [row[1], row[0]]; });
        detAfter = { value: L.det(opResult, G), G };
      }
      cur.opResult = opResult;
      cur.opField = detAfter ? detAfter.G : null;

      // Cramer's rule, exactly.
      let cram = null;
      if (mode === 'cramer') {
        const all = L.fieldMatrix([...state.A, state.b]);
        const G = all.F;
        const Am = all.M.slice(0, 2), bv = all.M[2];
        const dA = L.det(Am, G);
        const A1 = Am.map((row, k) => [bv[k], row[1]]);
        const A2 = Am.map((row, k) => [row[0], bv[k]]);
        const d1 = L.det(A1, G), d2 = L.det(A2, G);
        cram = { G, Am, bv, dA, A1, A2, d1, d2, x: G.isZero(dA) ? null : [G.div(d1, dA), G.div(d2, dA)] };
        cur.xf = cram.x ? cram.x.map((v) => G.toNumber(v)) : null;
      }

      if (kind === '2d') view.requestRender(); else draw3D(view, cur);

      // Controls
      modeSeg.update(); opSeg.update(); colSeg.update(); coordSeg.update(); expSel.update(); anim.update();
      ed2.update(); ed3.update(); pEditor.update(); bEditor.update();
      chips.forEach((ch) => ch.update());
      ed2.el.hidden = pre2.el.hidden = mode === 'vol';
      ed3.el.hidden = pre3.el.hidden = mode !== 'vol';
      opCard.el.hidden = mode !== 'area';
      cramerCard.el.hidden = mode !== 'cramer';
      expCard.el.hidden = mode !== 'vol';
      ctx.bar.hidden = mode === 'vol' || (mode === 'area' && state.op === 'none');
      chips[1].el.hidden = mode === 'vol';
      chips[2].el.hidden = mode === 'vol';
      colSeg.el.hidden = state.op === 'swap' || state.op === 'none';
      pEditor.el.hidden = state.op === 'swap' || state.op === 'none';
      applyBtn.hidden = state.op === 'none';
      const pName = state.op === 'scale' ? 'k =' : 's =';
      if (pName !== pLabelTex) { pLabelTex = pName; renderTex(pEditor.el.querySelector('.matrix-editor__label'), pName); }
      setText(modeHelp, {
        area: { es: 'Arrastra â₁ y â₂: el paralelogramo es la imagen del cuadrado unidad y su área con signo es det A.', en: 'Drag â₁ and â₂: the parallelogram is the image of the unit square and its signed area is det A.' },
        cramer: { es: 'Reproduce la animación: el paralelogramo de x y un vector de la base se transforma; su área pasa de xᵢ a det A · xᵢ.', en: 'Play the animation: the parallelogram of x and one basis vector is transformed; its area goes from xᵢ to det A · xᵢ.' },
        vol: { es: 'Arrastra las columnas: el paralelepípedo es la imagen del cubo unidad y su volumen con signo es det A.', en: 'Drag the columns: the parallelepiped is the image of the unit cube and its signed volume is det A.' },
      }[mode]);
      const opText = {
        none: { es: 'Elige una operación y reprodúcela.', en: 'Pick an operation and play it.' },
        scale: { es: 'Multiplicar una columna por k multiplica el determinante por k.', en: 'Multiplying a column by k multiplies the determinant by k.' },
        swap: { es: 'Intercambiar dos columnas cambia el signo. Durante el giro el área pasa por 0.', en: 'Swapping two columns flips the sign. Halfway through, the area goes through 0.' },
        shear: { es: 'Sumar a una columna un múltiplo de otra no cambia el determinante: misma base, misma altura.', en: 'Adding a multiple of one column to another does not change the determinant: same base, same height.' },
      }[state.op];
      setText(opFormula, opText);

      // Readouts
      const n = an.n;
      const detTex = texValue(an.det);
      if (n === 2) r.det.set(`\\det A = ${detLine2(an.M)} = ${detTex}`);
      else r.det.set(`\\det A = ${detTex}`);
      const x = F.toNumber(an.det);
      const zero = F.isZero(an.det);
      const factor = fmtDecimal(Math.abs(x), 4);
      r.meaning.set({ html: `<span class="badge ${zero ? 'badge--danger' : 'badge--ok'}">${tr(zero ? { es: 'No invertible', en: 'Not invertible' } : { es: 'Invertible', en: 'Invertible' })}</span>` },
        zero ? (n === 2 ? { es: 'Las columnas son paralelas: el plano se aplasta en una recta o un punto.', en: 'The columns are parallel: the plane is squashed onto a line or a point.' } : { es: 'Las columnas son coplanares: el espacio se aplasta en un plano, una recta o un punto.', en: 'The columns are coplanar: space is squashed onto a plane, a line or a point.' })
          : x > 0 ? (n === 2 ? { es: `Toda área se multiplica por ${factor}; la orientación se conserva (â₁ → â₂ gira en sentido antihorario).`, en: `Every area is multiplied by ${factor}; orientation is preserved (â₁ → â₂ turns counterclockwise).` } : { es: `Todo volumen se multiplica por ${factor}; la orientación se conserva (regla de la mano derecha).`, en: `Every volume is multiplied by ${factor}; orientation is preserved (right-hand rule).` })
            : (n === 2 ? { es: `Toda área se multiplica por ${factor} y la orientación se invierte (â₁ → â₂ gira en sentido horario).`, en: `Every area is multiplied by ${factor} and orientation is reversed (â₁ → â₂ turns clockwise).` } : { es: `Todo volumen se multiplica por ${factor} y la orientación se invierte (como en un espejo).`, en: `Every volume is multiplied by ${factor} and orientation is reversed (as in a mirror).` }));

      r.op.show(mode === 'area' && state.op !== 'none');
      r.now.show(mode !== 'vol' && (mode === 'cramer' || state.op !== 'none'));
      if (mode === 'area' && opResult) {
        const rule = state.op === 'scale' ? `k\\cdot\\det A = ${texValue(detAfter.value)}` : state.op === 'swap' ? `-\\det A = ${texValue(detAfter.value)}` : `\\det A = ${texValue(detAfter.value)}`;
        const Ename = state.op === 'scale' ? `\\hat{a}_${state.col} \\to k\\,\\hat{a}_${state.col}` : state.op === 'swap' ? '\\hat{a}_1 \\leftrightarrow \\hat{a}_2' : `\\hat{a}_${state.col} \\to \\hat{a}_${state.col} + s\\,\\hat{a}_${3 - state.col}`;
        r.op.set(`${Ename}:\\quad ${texMatrix(opResult, { colClasses: COLS })},\\quad \\det = ${rule}`);
        const { factor: f } = opColumns(an.Af, state.op, state.col, p.x, state.t);
        const factorTex = state.op === 'scale' ? `(1 + t(k-1))` : state.op === 'swap' ? '(1 - 2t)' : '1';
        r.now.set(`t = ${fmtDecimal(state.t, 2)}:\\quad \\det = ${factorTex}\\cdot\\det A = ${fmtDecimal(f * x, 3, { unicodeMinus: false })}`);
      }

      r.cramer.show(mode === 'cramer');
      if (mode === 'cramer') {
        const { d1, d2, dA } = cram;
        if (cram.x) {
          r.cramer.set(`x_1 = \\frac{\\det[\\,\\mathbf{b}\\;\\hat{a}_2\\,]}{\\det A} = \\frac{${texValue(d1)}}{${texValue(dA)}} = ${texValue(cram.x[0])},\\qquad x_2 = \\frac{\\det[\\,\\hat{a}_1\\;\\mathbf{b}\\,]}{\\det A} = \\frac{${texValue(d2)}}{${texValue(dA)}} = ${texValue(cram.x[1])}`,
            { es: `Columna sustituida: ${state.coord === 1 ? 'la primera' : 'la segunda'} matriz es ${state.coord === 1 ? '[b â₂]' : '[â₁ b]'}.`, en: `Replaced column: the ${state.coord === 1 ? 'first' : 'second'} matrix is ${state.coord === 1 ? '[b â₂]' : '[â₁ b]'}.` });
          const dT = L.det2(L.lerpMatrix(L.identityFloat(2), an.Af, state.t));
          const xi = cur.xf[state.coord - 1];
          r.now.set(`t = ${fmtDecimal(state.t, 2)}:\\quad \\text{${tr({ es: 'área', en: 'area' })}} = \\det(M_t)\\cdot x_${state.coord} = ${fmtDecimal(dT, 3, { unicodeMinus: false })}\\cdot ${fmtDecimal(xi, 3, { unicodeMinus: false })} = ${fmtDecimal(dT * xi, 3, { unicodeMinus: false })}`,
            { es: 'Al principio (t = 0) el área es la coordenada xᵢ; al final (t = 1) es el determinante de la matriz con b en la columna i.', en: 'At the start (t = 0) the area is the coordinate xᵢ; at the end (t = 1) it is the determinant of the matrix with b in column i.' });
        } else {
          r.cramer.set(`\\det A = 0`, { es: 'La regla de Cramer necesita det A ≠ 0: el sistema no tiene solución única.', en: 'Cramer’s rule needs det A ≠ 0: the system has no unique solution.' });
          r.now.show(false);
        }
      }

      r.cof.show(mode === 'vol');
      r.elim.show(mode === 'vol');
      if (mode === 'vol') {
        const e = state.exp;
        const isRow = e[0] === 'r';
        const idx = Number(e[1]) - 1;
        const coefs = [], terms = [], values = [];
        for (let k = 0; k < 3; k++) {
          const [i, j] = isRow ? [idx, k] : [k, idx];
          const sign = (i + j) % 2 === 0 ? F.one : F.neg(F.one);
          const minor = minorOf(an.M, i, j);
          coefs.push(F.mul(sign, an.M[i][j]));
          terms.push(texMatrix(minor, { env: 'vmatrix' }));
          const mv = L.det(minor, F);
          values.push(`(${texValue(mv)})`);
        }
        const zeros = coefs.filter((cf) => F.isZero(cf)).length;
        r.cof.set(`\\det A = ${texCombo(coefs, terms, { zero: '0' })} = ${texCombo(coefs, values, { zero: '0' })} = ${detTex}`,
          zeros ? { es: `${zeros} término${zeros > 1 ? 's' : ''} con entrada 0 no hace${zeros > 1 ? 'n' : ''} falta: conviene desarrollar por la fila o columna con más ceros.`, en: `${zeros} term${zeros > 1 ? 's' : ''} with a 0 entry ${zeros > 1 ? 'are' : 'is'} not needed: expand along the row or column with the most zeros.` }
            : { es: 'Signos de los cofactores: (−1)^{i+j}, en damero + − + / − + − / + − +.', en: 'Cofactor signs: (−1)^{i+j}, in a checkerboard + − + / − + − / + − +.' });
        const { U, swaps } = L.triangularize(an.M, F);
        const diag = U.map((row, i) => row[i]);
        const prod = diag.map((v) => { const s = texValue(v); return s.startsWith('-') || /[+]/.test(s) ? `(${s})` : s; }).join('\\cdot');
        r.elim.set(`U = ${texMatrix(U)},\\quad \\det A = ${swaps % 2 ? '-' : ''}${prod} = ${detTex}`,
          { es: `Eliminación hacia delante con ${swaps} intercambio${swaps === 1 ? '' : 's'} de filas: sumar múltiplos de filas no cambia el determinante y el de una matriz triangular es el producto de su diagonal.`, en: `Forward elimination with ${swaps} row swap${swaps === 1 ? '' : 's'}: adding multiples of rows does not change the determinant, and that of a triangular matrix is the product of its diagonal.` });
      }

      ctx.setLegend(mode === 'vol' ? [
        { color: 'var(--c-det)', kind: 'area', label: { es: 'volumen positivo', en: 'positive volume' } },
        { color: 'var(--c-det-neg)', kind: 'area', label: { es: 'volumen negativo', en: 'negative volume' } },
      ] : [
        { color: 'var(--c-det)', kind: 'area', label: { es: 'área con signo +', en: 'signed area +' } },
        { color: 'var(--c-det-neg)', kind: 'area', label: { es: 'área con signo −', en: 'signed area −' } },
        state.show.includes('unit') && { color: 'var(--muted)', kind: 'dash', label: mode === 'cramer' ? { es: 'imagen del cuadrado unidad', en: 'image of the unit square' } : { es: 'cuadrado unidad', en: 'unit square' } },
        mode === 'cramer' && { color: 'var(--c-w)', tex: '\\mathbf{x}\\to A\\mathbf{x} = \\mathbf{b}' },
      ]);
      return { an, cram, detAfter, state };
    }

    return {
      render,
      snapshot: () => view.snapshot(),
      togglePlay: () => anim.toggle(),
      onReset: () => { anim.pause(); viewKind = ''; ctx.rerender(); },
    };
  },

  learn: {
    what: {
      es: `<p>Las columnas $\\hat{a}_1, \\hat{a}_2$ de $A$ son las imágenes de $\\hat{\\imath}$ y $\\hat{\\jmath}$, así que el cuadrado unidad se convierte en el paralelogramo que forman. Su <strong>área con signo</strong> es $\\det A$: el valor absoluto dice por cuánto se multiplican <em>todas</em> las áreas y el signo dice si la orientación se conserva (de $\\hat{a}_1$ a $\\hat{a}_2$ se gira en sentido antihorario) o se invierte.</p>
<p>Las <strong>operaciones de columna</strong> muestran las propiedades que definen el determinante: una <em>cizalla</em> mueve un lado paralelo a otro y no cambia ni la base ni la altura; <em>escalar</em> una columna escala el área; <em>intercambiar</em> dos columnas invierte la orientación, y para ello el área tiene que pasar por cero. Lo mismo vale para filas, porque $\\det A^{\\mathsf T} = \\det A$.</p>
<p>La <strong>regla de Cramer</strong> sale de mirar un paralelogramo concreto: el que forman la incógnita $\\mathbf{x}$ y $\\hat{\\jmath}$ tiene área $x_1$. Al aplicar $A$ se convierte en el de $\\mathbf{b}$ y $\\hat{a}_2$, y su área queda multiplicada por $\\det A$. Así $\\det A\\cdot x_1 = \\det[\\,\\mathbf{b}\\;\\hat{a}_2\\,]$. En 3D el paralelepípedo hace el papel del paralelogramo, y el determinante se puede calcular por cofactores o por eliminación.</p>`,
      en: `<p>The columns $\\hat{a}_1, \\hat{a}_2$ of $A$ are the images of $\\hat{\\imath}$ and $\\hat{\\jmath}$, so the unit square becomes the parallelogram they span. Its <strong>signed area</strong> is $\\det A$: the absolute value tells by how much <em>every</em> area is multiplied, and the sign tells whether orientation is kept (going from $\\hat{a}_1$ to $\\hat{a}_2$ turns counterclockwise) or reversed.</p>
<p>The <strong>column operations</strong> show the properties that define the determinant: a <em>shear</em> slides one side parallel to another and changes neither the base nor the height; <em>scaling</em> a column scales the area; <em>swapping</em> two columns reverses orientation, and to do so the area has to go through zero. The same holds for rows, because $\\det A^{\\mathsf T} = \\det A$.</p>
<p><strong>Cramer’s rule</strong> comes from looking at one particular parallelogram: the one spanned by the unknown $\\mathbf{x}$ and $\\hat{\\jmath}$ has area $x_1$. Applying $A$ turns it into the one spanned by $\\mathbf{b}$ and $\\hat{a}_2$, and its area gets multiplied by $\\det A$. So $\\det A\\cdot x_1 = \\det[\\,\\mathbf{b}\\;\\hat{a}_2\\,]$. In 3D the parallelepiped plays the role of the parallelogram, and the determinant can be computed by cofactors or by elimination.</p>`,
    },
    prompts: {
      es: [
        'Arrastra $\\hat{a}_2$ hasta hacerla paralela a $\\hat{a}_1$. ¿Qué área queda? ¿Qué pasa con el signo si sigues girando?',
        'Con la operación «Cizalla», reproduce la animación con la cuadrícula activada. ¿Por qué no cambia el área aunque la figura se deforme?',
        'Con «Intercambiar», detén la animación en $t = 1/2$. ¿Qué forma tiene el paralelogramo? ¿Por qué el signo no puede cambiar sin pasar por 0?',
        'En «Cramer», mueve $\\mathbf{b}$ y observa el paralelogramo coloreado al final de la animación. ¿Qué matriz tiene ese paralelogramo como imagen del cuadrado unidad?',
        'En 3D elige la matriz triangular y desarrolla por distintas filas y columnas. ¿Cuál es la más rápida? ¿Por qué el resultado siempre es el producto de la diagonal?',
      ],
      en: [
        'Drag $\\hat{a}_2$ until it is parallel to $\\hat{a}_1$. What area is left? What happens to the sign if you keep turning?',
        'With the “Shear” operation, play the animation with the grid on. Why does the area not change although the shape deforms?',
        'With “Swap”, stop the animation at $t = 1/2$. What does the parallelogram look like? Why can the sign not change without going through 0?',
        'In “Cramer”, move $\\mathbf{b}$ and look at the coloured parallelogram at the end of the animation. Which matrix has that parallelogram as the image of the unit square?',
        'In 3D pick the triangular matrix and expand along different rows and columns. Which one is fastest? Why is the result always the product of the diagonal?',
      ],
    },
    formal: [
      {
        kind: 'definition',
        title: { es: 'El determinante', en: 'The determinant' },
        body: {
          es: '<p>Existe una única función $\\det:\\mathbb{R}^{n\\times n}\\to\\mathbb{R}$ que, vista como función de las columnas, es (i) lineal en cada columna, (ii) alternada (vale 0 si dos columnas son iguales) y (iii) cumple $\\det I = 1$. Viene dada por la fórmula de Leibniz $$\\det A = \\sum_{\\sigma\\in S_n}\\operatorname{sgn}(\\sigma)\\,a_{\\sigma(1)1}\\cdots a_{\\sigma(n)n}.$$ Para $n = 2$: $\\det A = a_{11}a_{22} - a_{12}a_{21}$.</p>',
          en: '<p>There is a unique function $\\det:\\mathbb{R}^{n\\times n}\\to\\mathbb{R}$ which, as a function of the columns, is (i) linear in each column, (ii) alternating (it is 0 when two columns are equal) and (iii) satisfies $\\det I = 1$. It is given by the Leibniz formula $$\\det A = \\sum_{\\sigma\\in S_n}\\operatorname{sgn}(\\sigma)\\,a_{\\sigma(1)1}\\cdots a_{\\sigma(n)n}.$$ For $n = 2$: $\\det A = a_{11}a_{22} - a_{12}a_{21}$.</p>',
        },
      },
      {
        kind: 'theorem',
        title: { es: 'Operaciones elementales', en: 'Elementary operations' },
        body: {
          es: '<p>Intercambiar dos columnas (o filas) cambia el signo de $\\det A$; multiplicar una por $k$ multiplica $\\det A$ por $k$; sumar a una un múltiplo de otra no lo cambia. En consecuencia, si la eliminación lleva $A$ a una matriz triangular $U$ con $s$ intercambios y sin escalar filas, $\\det A = (-1)^s\\,u_{11}\\cdots u_{nn}$, y $A$ es invertible si y solo si $\\det A\\neq 0$.</p>',
          en: '<p>Swapping two columns (or rows) changes the sign of $\\det A$; multiplying one by $k$ multiplies $\\det A$ by $k$; adding a multiple of one to another does not change it. Consequently, if elimination takes $A$ to a triangular matrix $U$ with $s$ swaps and no row scaling, $\\det A = (-1)^s\\,u_{11}\\cdots u_{nn}$, and $A$ is invertible if and only if $\\det A\\neq 0$.</p>',
        },
      },
      {
        kind: 'theorem',
        title: { es: 'Producto, transpuesta y medida', en: 'Product, transpose and measure' },
        body: {
          es: '<p>$\\det(AB) = \\det A\\,\\det B$ y $\\det A^{\\mathsf T} = \\det A$. Para toda región medible $R\\subset\\mathbb{R}^n$, $\\operatorname{vol}(A(R)) = |\\det A|\\operatorname{vol}(R)$; el signo de $\\det A$ indica si $A$ conserva la orientación.</p>',
          en: '<p>$\\det(AB) = \\det A\\,\\det B$ and $\\det A^{\\mathsf T} = \\det A$. For every measurable region $R\\subset\\mathbb{R}^n$, $\\operatorname{vol}(A(R)) = |\\det A|\\operatorname{vol}(R)$; the sign of $\\det A$ tells whether $A$ preserves orientation.</p>',
        },
      },
      {
        kind: 'theorem',
        title: { es: 'Desarrollo de Laplace', en: 'Laplace expansion' },
        body: {
          es: '<p>Para cualquier fila $i$, $\\det A = \\sum_{j} (-1)^{i+j}a_{ij}\\det A_{ij}$, donde $A_{ij}$ es la submatriz que resulta de quitar la fila $i$ y la columna $j$; análogamente por columnas. Los números $C_{ij} = (-1)^{i+j}\\det A_{ij}$ son los cofactores, y $A^{-1} = \\frac{1}{\\det A}\\,C^{\\mathsf T}$.</p>',
          en: '<p>For any row $i$, $\\det A = \\sum_{j} (-1)^{i+j}a_{ij}\\det A_{ij}$, where $A_{ij}$ is the submatrix obtained by removing row $i$ and column $j$; likewise along columns. The numbers $C_{ij} = (-1)^{i+j}\\det A_{ij}$ are the cofactors, and $A^{-1} = \\frac{1}{\\det A}\\,C^{\\mathsf T}$.</p>',
        },
      },
      {
        kind: 'theorem',
        title: { es: 'Regla de Cramer', en: 'Cramer’s rule' },
        body: {
          es: '<p>Si $\\det A\\neq 0$, la única solución de $A\\mathbf{x} = \\mathbf{b}$ es $x_i = \\det A_i(\\mathbf{b})/\\det A$, donde $A_i(\\mathbf{b})$ es $A$ con su columna $i$ sustituida por $\\mathbf{b}$. <em>Demostración:</em> $A\\,I_i(\\mathbf{x}) = A_i(\\mathbf{b})$, donde $I_i(\\mathbf{x})$ es la identidad con la columna $i$ sustituida por $\\mathbf{x}$, y $\\det I_i(\\mathbf{x}) = x_i$. Es útil en teoría; para calcular, la eliminación es mucho más eficiente.</p>',
          en: '<p>If $\\det A\\neq 0$, the unique solution of $A\\mathbf{x} = \\mathbf{b}$ is $x_i = \\det A_i(\\mathbf{b})/\\det A$, where $A_i(\\mathbf{b})$ is $A$ with its column $i$ replaced by $\\mathbf{b}$. <em>Proof:</em> $A\\,I_i(\\mathbf{x}) = A_i(\\mathbf{b})$, where $I_i(\\mathbf{x})$ is the identity with column $i$ replaced by $\\mathbf{x}$, and $\\det I_i(\\mathbf{x}) = x_i$. It is useful in theory; for computing, elimination is far more efficient.</p>',
        },
      },
    ],
  },

  challenges: [
    {
      id: 'flip3',
      title: { es: 'Área 3, al revés', en: 'Area 3, flipped' },
      text: { es: 'Con $\\hat{a}_1 = (2, 1)$ fija, mueve $\\hat{a}_2$ para que $\\det A = -3$.', en: 'With $\\hat{a}_1 = (2, 1)$ fixed, move $\\hat{a}_2$ so that $\\det A = -3$.' },
      hint: { es: '$\\det A = 2a_{22} - a_{12}$. Prueba con $\\hat{a}_2$ al otro lado de la recta de $\\hat{a}_1$.', en: '$\\det A = 2a_{22} - a_{12}$. Try $\\hat{a}_2$ on the other side of the line of $\\hat{a}_1$.' },
      setup: (store) => store.set({ mode: 'area', A: M([[2, 0], [1, 1]]), op: 'none', t: 0 }),
      check: (s, d) => s.mode === 'area' && s.A[0][0].x === 2 && s.A[1][0].x === 1 && Math.abs(scalarNumber(d.an.det) + 3) < 1e-9,
    },
    {
      id: 'tri',
      title: { es: 'Triangular sin cambiar el área', en: 'Triangular, same area' },
      text: { es: 'Parte de $A = \\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}$ y consigue una matriz con $a_{21} = 0$ y el mismo determinante.', en: 'Start from $A = \\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}$ and reach a matrix with $a_{21} = 0$ and the same determinant.' },
      hint: { es: 'Una cizalla que sume a la primera columna un múltiplo de la segunda no cambia el determinante.', en: 'A shear adding a multiple of the second column to the first does not change the determinant.' },
      setup: (store) => store.set({ mode: 'area', A: M([[1, 2], [3, 4]]), op: 'shear', col: 1, p: V([1]), t: 0 }),
      check: (s, d) => s.mode === 'area' && s.A[1][0].x === 0 && Math.abs(scalarNumber(d.an.det) + 2) < 1e-9,
    },
    {
      id: 'cramer',
      title: { es: 'Diseña el sistema', en: 'Design the system' },
      text: { es: 'Con $A = \\begin{bmatrix}3&1\\\\1&2\\end{bmatrix}$, elige $\\mathbf{b}$ para que la solución sea $\\mathbf{x} = (-1, 2)$.', en: 'With $A = \\begin{bmatrix}3&1\\\\1&2\\end{bmatrix}$, choose $\\mathbf{b}$ so that the solution is $\\mathbf{x} = (-1, 2)$.' },
      hint: { es: '$\\mathbf{b} = A\\mathbf{x} = -\\hat{a}_1 + 2\\hat{a}_2$.', en: '$\\mathbf{b} = A\\mathbf{x} = -\\hat{a}_1 + 2\\hat{a}_2$.' },
      setup: (store) => store.set({ mode: 'cramer', A: M([[3, 1], [1, 2]]), b: V([1, 1]), t: 1 }),
      check: (s, d) => s.mode === 'cramer' && [[3, 1], [1, 2]].every((row, i) => row.every((x, j) => s.A[i][j].x === x)) && d.cram && d.cram.x
        && Math.abs(scalarNumber(d.cram.x[0]) + 1) < 1e-9 && Math.abs(scalarNumber(d.cram.x[1]) - 2) < 1e-9,
    },
    {
      id: 'flat',
      title: { es: 'Volumen cero', en: 'Zero volume' },
      text: { es: 'En 3D, con $\\hat{a}_1 = (1, 0, 0)$ y $\\hat{a}_2 = (0, 1, 0)$, mueve $\\hat{a}_3$ para que el volumen sea 0 sin que $\\hat{a}_3$ sea paralela a ninguna de las otras.', en: 'In 3D, with $\\hat{a}_1 = (1, 0, 0)$ and $\\hat{a}_2 = (0, 1, 0)$, move $\\hat{a}_3$ so that the volume is 0 without $\\hat{a}_3$ being parallel to either of the others.' },
      hint: { es: '$\\hat{a}_3$ tiene que quedar en el plano $z = 0$.', en: '$\\hat{a}_3$ has to lie in the plane $z = 0$.' },
      setup: (store) => store.set({ mode: 'vol', B: M([[1, 0, 1], [0, 1, 1], [0, 0, 1]]) }),
      check: (s, d) => {
        if (s.mode !== 'vol') return false;
        const B = s.B.map((row) => row.map((e) => e.x));
        const fixed = B[0][0] === 1 && B[1][0] === 0 && B[2][0] === 0 && B[0][1] === 0 && B[1][1] === 1 && B[2][1] === 0;
        const a3 = [B[0][2], B[1][2], B[2][2]];
        const par = (u) => Math.hypot(...L.cross(u, a3)) < 1e-9;
        return fixed && Math.abs(scalarNumber(d.an.det)) < 1e-12 && !par([1, 0, 0]) && !par([0, 1, 0]) && Math.hypot(...a3) > 1e-9;
      },
    },
  ],
});
