import { createLab } from '../ui/shell.js';
import { codec, M, V } from '../ui/store.js';
import { Plane2D } from '../ui/plane2d.js';
import { Scene3D } from '../ui/scene3d.js';
import { card, matrixEditor, vectorEditor, flagChip, readout, animator, segmented, slider, button, stageLabels } from '../ui/controls.js';
import { h } from '../ui/dom.js';
import { renderTex } from '../ui/tex.js';
import { tr, setText } from '../ui/i18n.js';
import { entryFromNumber, makeEntry } from '../core/parse.js';
import * as L from '../core/linalg.js';
import { RationalField } from '../core/fields.js';
import { texVector, fmtDecimal } from '../core/format.js';
import { COLS, COL_VARS, spanOp, texCombo, presetSelect, memo } from './common.js';

const KEYS = ['i', 'j', 'k'];
const DEFAULTS = {
  2: { V: [[2, -1, 1], [1, 1, 2]], w: [3, 3], k: 2 },
  3: { V: [[1, 0, 1], [0, 1, 1], [1, 1, 2]], w: [2, 1, 3], k: 2 },
};
const PRESETS = {
  2: [
    { id: 'std', label: { es: 'Base canónica î, ĵ', en: 'Standard basis î, ĵ' }, V: [[1, 0, 1], [0, 1, 1]], k: 2 },
    { id: 'default', label: { es: 'v₁ = (2, 1), v₂ = (−1, 1)', en: 'v₁ = (2, 1), v₂ = (−1, 1)' }, V: DEFAULTS[2].V, k: 2 },
    { id: 'parallel', label: { es: 'Dos vectores paralelos', en: 'Two parallel vectors' }, V: [[1, -2, 0], [2, -4, 0]], k: 2 },
    { id: 'three', label: { es: 'Tres vectores: v₃ = v₁ + v₂', en: 'Three vectors: v₃ = v₁ + v₂' }, V: DEFAULTS[2].V, k: 3 },
    { id: 'zero', label: { es: 'Con el vector cero', en: 'Including the zero vector' }, V: [[1, 0, 0], [1, 0, 0]], k: 2 },
  ],
  3: [
    { id: 'std', label: { es: 'Base canónica î, ĵ, k̂', en: 'Standard basis î, ĵ, k̂' }, V: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], k: 3 },
    { id: 'plane', label: { es: 'Plano: v₃ = v₁ + v₂', en: 'Plane: v₃ = v₁ + v₂' }, V: DEFAULTS[3].V, k: 3 },
    { id: 'basis', label: { es: 'Base (1,0,0), (1,1,0), (1,1,1)', en: 'Basis (1,0,0), (1,1,0), (1,1,1)' }, V: [[1, 1, 1], [0, 1, 1], [0, 0, 1]], k: 3 },
    { id: 'line', label: { es: 'Tres vectores en una recta', en: 'Three vectors on one line' }, V: [[1, 2, -1], [2, 4, -2], [1, 2, -1]], k: 3 },
    { id: 'two', label: { es: 'Dos vectores: un plano', en: 'Two vectors: a plane' }, V: [[1, 0, 0], [0, 1, 0], [1, 2, 0]], k: 2 },
  ],
};

const vt = (i) => `\\htmlClass{${COLS[i]}}{\\vec{v}_{${i + 1}}}`;
const VARS = ['x', 'y', 'z'];

const analyze = memo((Vfull, k, c, w, n) => {
  const cols = Vfull.map((row) => row.slice(0, k));
  const all = L.fieldMatrix([...cols, c.slice(0, k), w]);
  const F = all.F;
  const Vk = all.M.slice(0, n);
  const ck = all.M[n];
  const wv = all.M[n + 1];
  const { R, pivots, rank } = L.rref(Vk, F);
  return {
    F, Vk, ck, wv, R, pivots, rank, n, k,
    rel: L.nullspace(Vk, F), // coefficient vectors c with Σ cᵢvᵢ = 0
    eqs: L.nullspace(L.transpose(Vk), F), // y with yᵀV = 0: implicit equations y·x = 0 of the span
    u: L.matVec(Vk, ck, F),
    sol: L.solve(Vk, wv, F),
    Vf: Vk.map((row) => row.map((x) => F.toNumber(x))),
  };
});
const keyOf = (s) => `${s.n}|${s.k}|${s.V.map((r) => r.map((e) => e.text).join(',')).join(';')}|${s.c.map((e) => e.text).join(',')}|${s.w.map((e) => e.text).join(',')}`;

/** Float solve of a small square system with partial pivoting (null when singular). */
function solveFloat(A, b) {
  const n = A.length;
  const Mx = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(Mx[r][c]) > Math.abs(Mx[p][c])) p = r;
    if (Math.abs(Mx[p][c]) < 1e-14) return null;
    [Mx[c], Mx[p]] = [Mx[p], Mx[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = Mx[r][c] / Mx[c][c];
      for (let j = c; j <= n; j++) Mx[r][j] -= f * Mx[c][j];
    }
  }
  return Mx.map((row, i) => row[n] / row[i]);
}

/**
 * Coefficients closest to `c` whose combination is (as close as possible to) p:
 * c + Vᵀ(VVᵀ + εI)⁻¹(p − Vc), a regularised pseudo-inverse step.
 */
function nearestCoefficients(Vf, c, p) {
  const n = Vf.length, k = Vf[0].length;
  const r = p.map((x, i) => x - Vf[i].reduce((s, a, j) => s + a * c[j], 0));
  const G = Vf.map((ri) => Vf.map((rj) => ri.reduce((s, a, j) => s + a * rj[j], 0)));
  const scale = G.reduce((s, row, i) => s + row[i], 0) || 1;
  G.forEach((row, i) => { row[i] += 1e-9 * scale; });
  const y = solveFloat(G, r);
  if (!y) return c;
  return Array.from({ length: k }, (_, j) => c[j] + Vf.reduce((s, row, i) => s + row[j] * y[i], 0));
}

createLab({
  id: 'span',
  lead: {
    es: 'Escalar flechas y sumarlas: con eso se alcanza un punto, una recta, un plano o todo el espacio. Aquí se ve cuándo un vector sobra y qué es una base.',
    en: 'Scale arrows and add them: that reaches a point, a line, a plane or the whole space. Here you see when a vector is redundant and what a basis is.',
  },
  state: {
    n: { def: 2, codec: codec.int(2, 3) },
    k: { def: 2, codec: codec.int(1, 3) },
    V: { def: M(DEFAULTS[2].V), codec: codec.anyMatrix() }, // n × 3, columns v₁, v₂, v₃
    c: { def: V([1, 1, 0]), codec: codec.vector(3) },
    w: { def: V(DEFAULTS[2].w), codec: codec.vector(null) },
    t: { def: 1, codec: codec.num(0, 1) },
    show: { def: ['span', 'path'], codec: codec.flags(['span', 'path', 'lattice', 'w']) },
  },

  build(ctx) {
    const { store } = ctx;
    const fixShape = () => {
      const n = store.get('n');
      const patch = {};
      const Vs = store.get('V');
      if (Vs.length !== n || Vs.some((row) => row.length !== 3)) patch.V = M(DEFAULTS[n].V);
      if (store.get('w').length !== n) patch.w = V(DEFAULTS[n].w);
      if (Object.keys(patch).length) store.set(patch);
    };
    fixShape();

    const anim = animator({ store, key: 't', max: 1, unitsPerSecond: 0.4 });
    const stages = stageLabels();
    anim.el.append(stages.el);
    ctx.bar.append(anim.el);

    // State helpers ---------------------------------------------------------------
    const colF = (j) => () => store.get('V').map((row) => row[j].x);
    const setCol = (j) => (p) => {
      const Vs = store.get('V').map((row) => row.slice());
      for (let i = 0; i < store.get('n'); i++) Vs[i][j] = entryFromNumber(p[i]);
      store.set({ V: Vs });
    };
    const combination = () => {
      const k = store.get('k'), c = store.get('c');
      const Vs = store.get('V');
      return Vs.map((row) => row.slice(0, k).reduce((s, e, j) => s + e.x * c[j].x, 0));
    };
    /** Dragging the tip of u changes the coefficients (snapping them to integers and halves). */
    const setFromTip = (p, pxPerUnit = null) => {
      const k = store.get('k');
      const Vf = store.get('V').map((row) => row.slice(0, k).map((e) => e.x));
      const c0 = store.get('c').slice(0, k).map((e) => e.x);
      const cNew = nearestCoefficients(Vf, c0, p);
      const snapped = cNew.map((x, j) => {
        const len = Math.hypot(...Vf.map((row) => row[j])) || 1;
        const tol = pxPerUnit ? 9 / (pxPerUnit * len) : 0.12 / len;
        if (Math.abs(x - Math.round(x)) < tol) return Math.round(x);
        if (Math.abs(x - Math.round(x * 2) / 2) < tol * 0.7) return Math.round(x * 2) / 2;
        return Math.round(x * 20) / 20;
      });
      const c = store.get('c').slice();
      snapped.forEach((x, j) => { c[j] = entryFromNumber(x); });
      anim.pause();
      store.set({ c, t: 1 });
    };

    // Panel -----------------------------------------------------------------------
    const dimSeg = segmented({
      options: [{ value: 2, tex: '\\mathbb{R}^2' }, { value: 3, tex: '\\mathbb{R}^3' }],
      get: () => store.get('n'),
      set: (n) => store.set({ n, V: M(DEFAULTS[n].V), w: V(DEFAULTS[n].w), k: DEFAULTS[n].k, c: V([1, 1, 0]), t: 1 }),
      label: { es: 'Espacio', en: 'Space' },
    });
    const kSeg = segmented({
      options: [1, 2, 3].map((k) => ({ value: k, label: { es: k === 1 ? '1 vector' : `${k} vectores`, en: k === 1 ? '1 vector' : `${k} vectors` } })),
      get: () => store.get('k'), set: (k) => store.set({ k, t: 1 }),
      label: { es: 'Número de vectores', en: 'Number of vectors' },
    });
    const editorSlot = h('div');
    const presetSlot = h('div');
    const vecCard = card({ title: { es: 'Vectores', en: 'Vectors' }, body: [dimSeg.el, kSeg.el, editorSlot, presetSlot] });

    const sliders = [0, 1, 2].map((j) => slider({
      label: { es: `Coeficiente c${j + 1}`, en: `Coefficient c${j + 1}` },
      labelTex: `\\htmlClass{${COLS[j]}}{c_{${j + 1}}}`,
      min: -4, max: 4, step: 0.05,
      get: () => store.get('c')[j].x,
      set: (x) => { const c = store.get('c').slice(); c[j] = entryFromNumber(Math.round(x * 100) / 100); anim.pause(); store.set({ c, t: 1 }); },
      format: (x) => fmtDecimal(x, 2),
    }));
    const cSlot = h('div');
    const zeroBtn = button({ label: { es: 'Coeficientes a cero', en: 'Zero coefficients' }, iconName: 'reset', small: true, onClick: () => store.set({ c: V([0, 0, 0]) }) });
    const comboHelp = h('p');
    setText(comboHelp, { es: 'También puedes arrastrar la punta de u: los coeficientes se ajustan solos.', en: 'You can also drag the tip of u: the coefficients follow.' });
    const comboCard = card({ title: { es: 'Combinación lineal', en: 'Linear combination' }, body: [...sliders.map((s) => s.el), cSlot, h('div', { class: 'row' }, zeroBtn), comboHelp] });

    const chips = [
      flagChip(store, 'show', 'span', { es: 'Generado', en: 'Span' }, 'var(--c-img)'),
      flagChip(store, 'show', 'path', { es: 'Camino', en: 'Path' }, 'var(--c-v)'),
      flagChip(store, 'show', 'lattice', { es: 'Coeficientes enteros', en: 'Integer coefficients' }, 'var(--tgrid)'),
      flagChip(store, 'show', 'w', { es: 'Objetivo w', en: 'Target w' }, 'var(--c-w)'),
    ];
    const wSlot = h('div');
    const useBtn = button({
      label: { es: 'Usar estos coeficientes', en: 'Use these coefficients' }, iconName: 'check', small: true,
      onClick: () => {
        const an = cur && cur.an;
        if (!an || !an.sol.particular) return;
        const c = store.get('c').slice();
        an.sol.particular.forEach((x, j) => { c[j] = an.F === RationalField ? makeEntry(x.toString()) : entryFromNumber(Math.round(x * 1e6) / 1e6); });
        store.set({ c, t: 1 });
      },
    });
    const showCard = card({ title: { es: 'Mostrar', en: 'Show' }, body: [h('div', { class: 'chip-row' }, chips.map((c) => c.el)), wSlot, h('div', { class: 'row' }, useBtn)] });

    const r = {
      combo: readout({ es: 'Combinación', en: 'Combination' }, { block: true }),
      span: readout({ es: 'Generado', en: 'Span' }, { block: true }),
      indep: readout({ es: 'Independencia', en: 'Independence' }, { block: true }),
      basis: readout({ es: 'Base', en: 'Basis' }, { block: true }),
      target: readout(null, { labelTex: '\\vec{w}', block: true }),
    };
    const resultsCard = card({ title: { es: 'Análisis exacto', en: 'Exact analysis' }, body: [h('div', { class: 'readouts' }, Object.values(r).map((x) => x.el))] });
    ctx.panel.append(vecCard.el, comboCard.el, showCard.el, resultsCard.el);

    // Editors depend on n and k -----------------------------------------------------
    let editors = null, editorKey = '';
    function buildEditors(n, k) {
      const vEd = matrixEditor({
        rows: n, cols: k, colColors: COL_VARS,
        label: `\\left[\\,${Array.from({ length: k }, (_, j) => vt(j)).join('\\;')}\\,\\right] =`,
        get: () => store.get('V').map((row) => row.slice(0, k)),
        set: (m) => { const Vs = store.get('V').map((row, i) => [...m[i], ...row.slice(k)]); store.set({ V: Vs }); },
        name: { es: 'Vectores en columnas', en: 'Vectors as columns' },
      });
      const cEd = vectorEditor({
        n: k, label: '\\mathbf{c} =', color: 'var(--c-v)', name: { es: 'Coeficientes', en: 'Coefficients' },
        get: () => store.get('c').slice(0, k),
        set: (v) => { const c = store.get('c').slice(); v.forEach((e, j) => { c[j] = e; }); store.set({ c }); },
      });
      const wEd = vectorEditor({ n, label: '\\vec{w} =', color: 'var(--c-w)', get: () => store.get('w'), set: (w) => store.set({ w }), name: { es: 'Vector objetivo', en: 'Target vector' } });
      const pre = presetSelect({ store, key: 'V', presets: PRESETS[n], onPick: (p) => store.set({ V: M(p.V), k: p.k, t: 1 }) });
      editorSlot.replaceChildren(vEd.el);
      cSlot.replaceChildren(cEd.el);
      wSlot.replaceChildren(wEd.el);
      presetSlot.replaceChildren(pre.el);
      return { vEd, cEd, wEd };
    }

    // Views ---------------------------------------------------------------------------
    let view = null, viewN = 0, cur = null;
    function buildView(n) {
      if (view) view.dispose();
      ctx.clearViews();
      const el = ctx.addView();
      if (n === 2) {
        const pl = new Plane2D(el, { range: 4.2 });
        [0, 1, 2].forEach((j) => pl.addHandle({ id: `v${j}`, color: KEYS[j], visible: () => store.get('k') > j, get: colF(j), set: setCol(j) }));
        pl.addHandle({ id: 'w', color: 'w', visible: () => store.get('show').includes('w'), get: () => store.get('w').map((e) => e.x), set: (p) => store.set({ w: p.map(entryFromNumber) }) });
        pl.addHandle({ id: 'u', color: 'v', get: combination, set: (p) => setFromTip(p, pl.view.scale), snap: (p) => p });
        pl.setDraw((g) => cur && draw2D(g, cur));
        view = pl;
      } else {
        const sc = new Scene3D(el, { extent: 4, frustum: 10 });
        [0, 1, 2].forEach((j) => sc.addHandle({ id: `v${j}`, color: KEYS[j], visible: () => store.get('k') > j, get: colF(j), set: setCol(j) }));
        sc.addHandle({ id: 'w', color: 'w', visible: () => store.get('show').includes('w'), get: () => store.get('w').map((e) => e.x), set: (p) => store.set({ w: p.map(entryFromNumber) }) });
        sc.addHandle({ id: 'u', color: 'v', get: combination, set: (p) => setFromTip(p) });
        sc.onTheme = () => ctx.rerender();
        view = sc;
      }
      viewN = n;
    }

    /** Partial sums of the combination, staged by t: returns [[from, to, j]] and the tip. */
    function pathOf(c) {
      const s = c.t * c.k;
      let p = Array(c.n).fill(0);
      const segs = [];
      for (let j = 0; j < c.k; j++) {
        const f = Math.max(0, Math.min(1, s - j));
        if (f <= 0) break;
        const q = p.map((x, i) => x + f * c.cf[j] * c.an.Vf[i][j]);
        segs.push([p, q, j]);
        p = q;
      }
      return { segs, tip: p };
    }

    function latticePoints(c, R = 3) {
      const pts = [];
      const rec = (j, acc) => {
        if (j === c.k) { pts.push(acc); return; }
        for (let m = -R; m <= R; m++) rec(j + 1, acc.map((x, i) => x + m * c.an.Vf[i][j]));
      };
      rec(0, Array(c.n).fill(0));
      return pts;
    }

    function draw2D(g, c) {
      const { an, show } = c;
      g.backgroundGrid();
      const nz = an.Vf[0].map((_, j) => [an.Vf[0][j], an.Vf[1][j]]).filter((v) => Math.hypot(...v) > 1e-12);
      if (show.includes('span')) {
        if (an.rank === 0) g.point([0, 0], { color: g.c.img, r: 7 });
        else if (an.rank === 1) g.infiniteLine([0, 0], nz[0], { color: g.c.img, width: 7, alpha: 0.35 });
        else { const x = g.ctx; x.globalAlpha = 0.08; x.fillStyle = g.c.img; x.fillRect(0, 0, g.p.w, g.p.h); x.globalAlpha = 1; }
      }
      if (show.includes('lattice')) {
        if (c.k === 2 && an.rank === 2) g.transformedGrid([[an.Vf[0][0], an.Vf[0][1]], [an.Vf[1][0], an.Vf[1][1]]], { color: g.c.tgrid, alpha: 0.55, axes: false, width: 1.2 });
        latticePoints(c, c.k === 3 ? 2 : 4).forEach((p) => g.point(p, { color: g.c.tgrid, r: 2.6, alpha: 0.8 }));
      }
      if (show.includes('w')) {
        g.arrow([0, 0], c.w, { color: g.c.w, width: 2.5, dash: [7, 5] });
        g.mathLabel(c.w, 'w', { color: g.c.w, deco: 'arrow', offset: [16, 16] });
      }
      for (let j = 0; j < c.k; j++) {
        const v = [an.Vf[0][j], an.Vf[1][j]];
        g.arrow([0, 0], v, { color: g.c[KEYS[j]], width: 3.2 });
        g.mathLabel(v, 'v', { color: g.c[KEYS[j]], deco: 'arrow', sub: j + 1, away: [0, 0] });
      }
      const { segs, tip } = pathOf(c);
      if (show.includes('path')) segs.forEach(([p, q, j]) => g.arrow(p, q, { color: g.c[KEYS[j]], width: 2.4, dash: [6, 4], alpha: 0.95, head: 10 }));
      g.arrow([0, 0], tip, { color: g.c.v, width: 4.2 });
      g.mathLabel(tip, 'u', { color: g.c.v, deco: 'arrow', away: [0, 0] });
    }

    function draw3D(sc, c) {
      const { an, show } = c;
      sc.clear();
      const cols = an.Vf[0].map((_, j) => an.Vf.map((row) => row[j]));
      if (show.includes('span')) {
        const basis = an.pivots.map((j) => cols[j]);
        if (an.rank === 0) sc.point([0, 0, 0], 'img', { r: 0.18, opacity: 0.6 });
        else if (an.rank === 1) sc.lineThrough([0, 0, 0], basis[0], 'img', { length: 9 });
        else if (an.rank === 2) sc.planeSpan([0, 0, 0], L.normalize(basis[0]), L.orthoTo(basis[0], basis[1]), 'img', { size: 3.6, opacity: 0.16, grid: 1 });
        else sc.parallelepiped(an.Vf, 'img', { opacity: 0.12 });
      }
      if (show.includes('lattice')) latticePoints(c, 3).filter((p) => Math.hypot(...p) <= 4.6).forEach((p) => sc.point(p, 'tgrid', { r: 0.045, opacity: 0.8 }));
      if (show.includes('w')) {
        sc.arrow([0, 0, 0], c.w, 'w', { opacity: 0.75, radius: 0.028 });
        sc.label(c.w, '\\vec{w}', 'w', { tex: true, offset: [12, 12] });
      }
      for (let j = 0; j < c.k; j++) {
        sc.arrow([0, 0, 0], cols[j], KEYS[j]);
        sc.label(cols[j], `\\vec{v}_{${j + 1}}`, KEYS[j], { tex: true, offset: [12, -12], size: 16 });
      }
      const { segs, tip } = pathOf(c);
      if (show.includes('path')) segs.forEach(([p, q, j]) => sc.arrow(p, q, KEYS[j], { opacity: 0.55, radius: 0.022, head: 0.22 }));
      sc.arrow([0, 0, 0], tip, 'v', { radius: 0.05 });
      sc.label(tip, '\\vec{u}', 'v', { tex: true, offset: [14, -14], size: 17 });
      sc.syncHandles();
      sc.requestRender();
    }

    function render(state) {
      const { n, k } = state;
      if (n !== viewN) buildView(n);
      const ek = `${n}|${k}`;
      if (ek !== editorKey) { editorKey = ek; editors = buildEditors(n, k); }
      const an = analyze(keyOf(state), state.V, k, state.c, state.w, n);
      cur = { an, n, k, show: state.show, t: state.t, cf: state.c.map((e) => e.x), w: state.w.map((e) => e.x) };
      if (n === 2) view.requestRender(); else draw3D(view, cur);

      dimSeg.update(); kSeg.update(); anim.update();
      editors.vEd.update(); editors.cEd.update(); editors.wEd.update();
      sliders.forEach((s, j) => { s.update(); s.el.hidden = j >= k; });
      chips.forEach((ch) => ch.update());
      const showW = state.show.includes('w');
      wSlot.hidden = !showW;
      useBtn.hidden = !showW || an.sol.status === 'none';
      stages.update(Array.from({ length: k }, (_, j) => `${j ? '+\\,' : ''}c_{${j + 1}}${vt(j)}`), Math.min(k - 1, Math.floor(state.t * k - 1e-9)));

      const { F } = an;
      const terms = Array.from({ length: k }, (_, j) => vt(j));
      // Combination
      r.combo.set(`\\htmlClass{c-v}{\\vec{u}} = ${texCombo(an.ck, terms)} = ${texVector(an.u)}`);
      // Span
      const spanTex = `${spanOp()}\\{${terms.join(',')}\\}`;
      let spanDesc;
      if (an.rank === n) spanDesc = `${spanTex} = \\mathbb{R}^{${n}}`;
      else {
        const eqs = an.eqs.map((y) => `${texCombo(y, VARS.slice(0, n), { zero: '0' })} = 0`).join(',\\;\\; ');
        spanDesc = `${spanTex} = \\left\\{(${VARS.slice(0, n).join(',')}) : ${eqs}\\right\\}`;
      }
      const kindText = [
        { es: 'Solo el origen: dimensión 0.', en: 'Only the origin: dimension 0.' },
        { es: 'Una recta por el origen: dimensión 1.', en: 'A line through the origin: dimension 1.' },
        n === 2 ? { es: 'Todo el plano: dimensión 2.', en: 'The whole plane: dimension 2.' } : { es: 'Un plano por el origen: dimensión 2.', en: 'A plane through the origin: dimension 2.' },
        { es: 'Todo el espacio: dimensión 3.', en: 'The whole space: dimension 3.' },
      ][an.rank];
      r.span.set(spanDesc, an.rank < n
        ? { es: `${kindText.es} Las ecuaciones salen de los vectores y con yᵀV = 0.`, en: `${kindText.en} The equations come from the vectors y with yᵀV = 0.` }
        : kindText);
      // Independence
      const indep = an.rank === k;
      const relTex = an.rel.map((cv) => `${texCombo(cv, terms)} = \\mathbf{0}`);
      const redundant = [];
      for (let j = 0; j < k; j++) {
        if (an.pivots.includes(j)) continue;
        const coefs = an.pivots.map((_, row) => an.R[row][j]);
        redundant.push(`${vt(j)} = ${texCombo(coefs, an.pivots.map((p) => vt(p)))}`);
      }
      const badge = `<span class="badge ${indep ? 'badge--ok' : 'badge--danger'}">${tr(indep ? { es: 'Linealmente independientes', en: 'Linearly independent' } : { es: 'Linealmente dependientes', en: 'Linearly dependent' })}</span>`;
      if (indep) {
        r.indep.set({ html: badge }, { es: 'La única combinación que da 0 es la trivial (todos los cᵢ = 0).', en: 'The only combination giving 0 is the trivial one (all cᵢ = 0).' });
      } else {
        const wrap = h('div');
        wrap.innerHTML = badge;
        const texEl = h('div', { style: { marginTop: '6px' } });
        wrap.append(texEl);
        r.indep.set(wrap, k > n
          ? { es: `Hay ${k} vectores en ℝ${n === 2 ? '²' : '³'}: más vectores que dimensiones siempre son dependientes.`, en: `There are ${k} vectors in ℝ${n === 2 ? '²' : '³'}: more vectors than dimensions are always dependent.` }
          : { es: 'Una combinación no trivial da el vector cero: algún vector sobra.', en: 'A non-trivial combination gives the zero vector: some vector is redundant.' });
        renderTex(texEl, [...relTex, ...redundant].join(',\\qquad '));
      }
      // Basis
      const pivTex = `\\{${an.pivots.map((p) => vt(p)).join(',')}\\}`;
      const isBasis = indep && k === n;
      const why = isBasis ? null : k < n
        ? { es: `Faltan vectores: ${k} vector${k > 1 ? 'es' : ''} no pueden generar ℝ${n === 2 ? '²' : '³'}.`, en: `Too few vectors: ${k} vector${k > 1 ? 's' : ''} cannot span ℝ${n === 2 ? '²' : '³'}.` }
        : k > n ? { es: 'Sobran vectores: no son independientes.', en: 'Too many vectors: they are not independent.' }
          : { es: 'Hay tantos vectores como dimensiones, pero son dependientes.', en: 'There are as many vectors as dimensions, but they are dependent.' };
      r.basis.set(an.rank
        ? `\\text{${tr({ es: 'base del generado: ', en: 'basis of the span: ' })}}${pivTex},\\quad \\dim = ${an.rank}`
        : `\\text{${tr({ es: 'base del generado: ', en: 'basis of the span: ' })}}\\varnothing,\\quad \\dim = 0`,
      isBasis ? { es: `Sí es una base de ℝ${n === 2 ? '²' : '³'}: cada vector se escribe de una única forma.`, en: `It is a basis of ℝ${n === 2 ? '²' : '³'}: every vector is written in exactly one way.` } : why);
      // Target
      r.target.show(showW);
      let uIsW = false;
      if (showW) {
        const s = an.sol;
        uIsW = an.u.every((x, i) => F.eq(x, an.wv[i]));
        if (s.status === 'none') {
          r.target.set(`\\vec{w} = ${texVector(an.wv)} \\notin ${spanTex}`, { es: 'Ninguna combinación alcanza w: está fuera del generado.', en: 'No combination reaches w: it lies outside the span.' });
        } else {
          const extra = s.status === 'infinite' ? s.homogeneous.map((hv, i) => `${s.homogeneous.length > 1 ? `t_{${i + 1}}` : 't'}\\,(${texCombo(hv, terms)})`).join(' + ') : '';
          r.target.set(`\\vec{w} = ${texCombo(s.particular, terms)}${extra ? ` + ${extra}` : ''}`,
            s.status === 'unique'
              ? { es: `Coeficientes únicos${uIsW ? ' — ¡u ya es w!' : '.'}`, en: `Unique coefficients${uIsW ? ' — u is already w!' : '.'}` }
              : { es: `Infinitas formas: se puede añadir cualquier combinación que dé 0 (t ∈ ℝ)${uIsW ? ' — ¡u ya es w!' : '.'}`, en: `Infinitely many ways: add any combination that gives 0 (t ∈ ℝ)${uIsW ? ' — u is already w!' : '.'}` });
        }
      }

      ctx.setLegend([
        { color: 'var(--c-i)', tex: '\\vec{v}_1' },
        k > 1 && { color: 'var(--c-j)', tex: '\\vec{v}_2' },
        k > 2 && { color: 'var(--c-k)', tex: '\\vec{v}_3' },
        { color: 'var(--c-v)', tex: `\\vec{u} = ${Array.from({ length: k }, (_, j) => `c_{${j + 1}}\\vec{v}_{${j + 1}}`).join('+')}` },
        state.show.includes('span') && { color: 'var(--c-img)', kind: 'area', label: { es: 'generado', en: 'span' } },
        showW && { color: 'var(--c-w)', kind: 'dash', tex: '\\vec{w}' },
      ]);
      return { an, state, uIsW, indep };
    }

    return {
      render,
      snapshot: () => view.snapshot(),
      togglePlay: () => anim.toggle(),
      onReset: () => { anim.pause(); viewN = 0; ctx.rerender(); },
    };
  },

  learn: {
    what: {
      es: `<p>Con unos vectores $\\vec{v}_1,\\dots,\\vec{v}_k$ y unos números $c_1,\\dots,c_k$ se forma la <strong>combinación lineal</strong> $\\vec{u} = c_1\\vec{v}_1+\\dots+c_k\\vec{v}_k$: se escala cada flecha y se colocan una tras otra (el camino punteado). Mueve los deslizadores, escribe los coeficientes o arrastra la punta de $\\vec{u}$.</p>
<p>El <strong>generado</strong> $\\operatorname{gen}\\{\\vec{v}_1,\\dots,\\vec{v}_k\\}$ es el conjunto de <em>todas</em> las combinaciones posibles: el origen, una recta, un plano o todo el espacio (zona sombreada). El panel da sus ecuaciones implícitas exactas.</p>
<p>Los vectores son <strong>linealmente independientes</strong> si ninguno sobra: quitar cualquiera encoge el generado. Si son dependientes, hay una combinación con coeficientes no todos nulos que da $\\mathbf{0}$, y el panel la escribe. Una <strong>base</strong> de un subespacio es un conjunto independiente que lo genera; su número de vectores es la <strong>dimensión</strong>.</p>`,
      en: `<p>With some vectors $\\vec{v}_1,\\dots,\\vec{v}_k$ and some numbers $c_1,\\dots,c_k$ we build the <strong>linear combination</strong> $\\vec{u} = c_1\\vec{v}_1+\\dots+c_k\\vec{v}_k$: scale each arrow and place them tip to tail (the dashed path). Move the sliders, type the coefficients or drag the tip of $\\vec{u}$.</p>
<p>The <strong>span</strong> $\\operatorname{span}\\{\\vec{v}_1,\\dots,\\vec{v}_k\\}$ is the set of <em>all</em> possible combinations: the origin, a line, a plane or the whole space (shaded area). The panel gives its exact implicit equations.</p>
<p>The vectors are <strong>linearly independent</strong> if none is redundant: removing any of them shrinks the span. If they are dependent, some combination with coefficients not all zero gives $\\mathbf{0}$, and the panel writes it. A <strong>basis</strong> of a subspace is an independent set that spans it; its number of vectors is the <strong>dimension</strong>.</p>`,
    },
    prompts: {
      es: [
        'Con dos vectores en $\\mathbb{R}^2$ activa «Coeficientes enteros»: ¿qué puntos alcanzas con $c_1, c_2$ enteros? ¿Y con coeficientes cualesquiera?',
        'Haz $\\vec{v}_2$ paralelo a $\\vec{v}_1$. ¿Qué le pasa al generado? ¿Qué relación de dependencia aparece en el panel?',
        'Con tres vectores en $\\mathbb{R}^2$, ¿puedes lograr que sean independientes? ¿Por qué no?',
        'En $\\mathbb{R}^3$, con dos vectores independientes, activa el objetivo $\\vec{w}$ y muévelo. ¿Cuándo se puede alcanzar? Compara con la ecuación del plano.',
        'Con el ejemplo «Plano: v₃ = v₁ + v₂», alcanza el mismo $\\vec{w}$ con dos listas de coeficientes distintas. ¿Qué tienen en común sus diferencias?',
      ],
      en: [
        'With two vectors in $\\mathbb{R}^2$ turn on “Integer coefficients”: which points can you reach with integer $c_1, c_2$? And with arbitrary coefficients?',
        'Make $\\vec{v}_2$ parallel to $\\vec{v}_1$. What happens to the span? Which dependency relation shows up in the panel?',
        'With three vectors in $\\mathbb{R}^2$, can you make them independent? Why not?',
        'In $\\mathbb{R}^3$, with two independent vectors, turn on the target $\\vec{w}$ and move it. When can it be reached? Compare with the equation of the plane.',
        'With the example “Plane: v₃ = v₁ + v₂”, reach the same $\\vec{w}$ with two different lists of coefficients. What do their differences have in common?',
      ],
    },
    formal: [
      {
        kind: 'definition',
        title: { es: 'Combinación lineal y generado', en: 'Linear combination and span' },
        body: {
          es: '<p>Una combinación lineal de $\\mathbf{v}_1,\\dots,\\mathbf{v}_k\\in\\mathbb{R}^n$ es un vector $\\sum_i c_i\\mathbf{v}_i$ con $c_i\\in\\mathbb{R}$. El generado $\\operatorname{gen}\\{\\mathbf{v}_1,\\dots,\\mathbf{v}_k\\}$ es el conjunto de todas ellas; es un subespacio, y es el menor subespacio que contiene a los $\\mathbf{v}_i$. Con $V = [\\,\\mathbf{v}_1\\,\\cdots\\,\\mathbf{v}_k\\,]$ se tiene $\\sum_i c_i\\mathbf{v}_i = V\\mathbf{c}$, así que el generado es el espacio columna $\\operatorname{Col} V$.</p>',
          en: '<p>A linear combination of $\\mathbf{v}_1,\\dots,\\mathbf{v}_k\\in\\mathbb{R}^n$ is a vector $\\sum_i c_i\\mathbf{v}_i$ with $c_i\\in\\mathbb{R}$. The span $\\operatorname{span}\\{\\mathbf{v}_1,\\dots,\\mathbf{v}_k\\}$ is the set of all of them; it is a subspace, and it is the smallest subspace containing the $\\mathbf{v}_i$. With $V = [\\,\\mathbf{v}_1\\,\\cdots\\,\\mathbf{v}_k\\,]$ we have $\\sum_i c_i\\mathbf{v}_i = V\\mathbf{c}$, so the span is the column space $\\operatorname{Col} V$.</p>',
        },
      },
      {
        kind: 'definition',
        title: { es: 'Independencia lineal', en: 'Linear independence' },
        body: {
          es: '<p>$\\mathbf{v}_1,\\dots,\\mathbf{v}_k$ son linealmente independientes si $\\sum_i c_i\\mathbf{v}_i = \\mathbf{0}$ implica $c_1 = \\dots = c_k = 0$. Son equivalentes: (i) independencia; (ii) todo vector del generado se escribe de una única forma; (iii) ningún $\\mathbf{v}_j$ es combinación de los demás; (iv) $\\operatorname{rango} V = k$, es decir, $\\ker V = \\{\\mathbf{0}\\}$.</p>',
          en: '<p>$\\mathbf{v}_1,\\dots,\\mathbf{v}_k$ are linearly independent if $\\sum_i c_i\\mathbf{v}_i = \\mathbf{0}$ implies $c_1 = \\dots = c_k = 0$. The following are equivalent: (i) independence; (ii) every vector in the span is written in exactly one way; (iii) no $\\mathbf{v}_j$ is a combination of the others; (iv) $\\operatorname{rank} V = k$, that is, $\\ker V = \\{\\mathbf{0}\\}$.</p>',
        },
      },
      {
        kind: 'theorem',
        title: { es: 'Base y dimensión', en: 'Basis and dimension' },
        body: {
          es: '<p>(Lema de intercambio de Steinitz) Si $k$ vectores independientes están en el generado de $m$ vectores, entonces $k\\le m$. Por tanto todas las bases de un subespacio $W$ tienen el mismo número de elementos, $\\dim W$. En $\\mathbb{R}^n$: más de $n$ vectores son dependientes, menos de $n$ no generan, y para $n$ vectores son equivalentes «son base», «son independientes», «generan $\\mathbb{R}^n$» y $\\det V\\neq 0$.</p>',
          en: '<p>(Steinitz exchange lemma) If $k$ independent vectors lie in the span of $m$ vectors, then $k\\le m$. Hence all bases of a subspace $W$ have the same number of elements, $\\dim W$. In $\\mathbb{R}^n$: more than $n$ vectors are dependent, fewer than $n$ do not span, and for $n$ vectors “basis”, “independent”, “span $\\mathbb{R}^n$” and $\\det V\\neq 0$ are equivalent.</p>',
        },
      },
      {
        kind: 'algorithm',
        title: { es: 'Cómo lo calcula el laboratorio', en: 'How the lab computes it' },
        body: {
          es: '<p>Se reduce $V$ a su forma escalonada reducida $R$. Las columnas pivote de $V$ forman una base del generado. Cada columna no pivote es combinación de las pivote anteriores con los coeficientes que se leen en esa columna de $R$. Una base de $\\ker V$ da las relaciones de dependencia. Y como $\\operatorname{Col} V = (\\ker V^{\\mathsf T})^{\\perp}$, cada $\\mathbf{y}$ de una base de $\\ker V^{\\mathsf T}$ da una ecuación implícita $\\mathbf{y}\\cdot\\mathbf{x} = 0$ del generado.</p>',
          en: '<p>$V$ is reduced to its reduced echelon form $R$. The pivot columns of $V$ form a basis of the span. Each non-pivot column is a combination of the earlier pivot columns, with the coefficients read in that column of $R$. A basis of $\\ker V$ gives the dependency relations. And since $\\operatorname{Col} V = (\\ker V^{\\mathsf T})^{\\perp}$, each $\\mathbf{y}$ in a basis of $\\ker V^{\\mathsf T}$ gives an implicit equation $\\mathbf{y}\\cdot\\mathbf{x} = 0$ of the span.</p>',
        },
      },
    ],
  },

  challenges: [
    {
      id: 'reach',
      title: { es: 'Llega al objetivo', en: 'Reach the target' },
      text: { es: 'Con $\\vec{v}_1 = (1, 2)$ y $\\vec{v}_2 = (3, 1)$ fijos, elige $c_1, c_2$ para que $\\vec{u} = \\vec{w} = (5, 5)$.', en: 'With $\\vec{v}_1 = (1, 2)$ and $\\vec{v}_2 = (3, 1)$ fixed, choose $c_1, c_2$ so that $\\vec{u} = \\vec{w} = (5, 5)$.' },
      hint: { es: 'Plantea $c_1 + 3c_2 = 5$ y $2c_1 + c_2 = 5$, o arrastra la punta de $\\vec{u}$ con la retícula activada.', en: 'Set up $c_1 + 3c_2 = 5$ and $2c_1 + c_2 = 5$, or drag the tip of $\\vec{u}$ with the lattice on.' },
      setup: (store) => store.set({ n: 2, k: 2, V: M([[1, 3, 0], [2, 1, 0]]), w: V([5, 5]), c: V([0, 0, 0]), t: 1, show: ['span', 'path', 'lattice', 'w'] }),
      check: (s, d) => s.n === 2 && s.k === 2 && sameCols(s.V, [[1, 3], [2, 1]]) && d.uIsW && s.w[0].x === 5 && s.w[1].x === 5,
    },
    {
      id: 'trivial',
      title: { es: 'Una suma que da cero', en: 'A sum that gives zero' },
      text: { es: 'Con $\\vec{v}_1 = (1, 1)$, $\\vec{v}_2 = (2, -1)$ y $\\vec{v}_3 = (0, 3)$ fijos, encuentra coeficientes no todos nulos con $\\vec{u} = \\mathbf{0}$.', en: 'With $\\vec{v}_1 = (1, 1)$, $\\vec{v}_2 = (2, -1)$ and $\\vec{v}_3 = (0, 3)$ fixed, find coefficients, not all zero, with $\\vec{u} = \\mathbf{0}$.' },
      hint: { es: 'Escribe $\\vec{v}_3$ como combinación de $\\vec{v}_1$ y $\\vec{v}_2$ y pasa todo a un lado.', en: 'Write $\\vec{v}_3$ as a combination of $\\vec{v}_1$ and $\\vec{v}_2$ and move everything to one side.' },
      setup: (store) => store.set({ n: 2, k: 3, V: M([[1, 2, 0], [1, -1, 3]]), c: V([1, 0, 0]), t: 1 }),
      check: (s, d) => s.n === 2 && s.k === 3 && sameCols(s.V, [[1, 2, 0], [1, -1, 3]]) && d.an.u.every((x) => d.an.F.isZero(x)) && d.an.ck.some((x) => !d.an.F.isZero(x)),
    },
    {
      id: 'plane',
      title: { es: 'Un plano concreto', en: 'A given plane' },
      text: { es: 'En $\\mathbb{R}^3$, con dos vectores, haz que su generado sea exactamente el plano $x + y + z = 0$.', en: 'In $\\mathbb{R}^3$, with two vectors, make their span exactly the plane $x + y + z = 0$.' },
      hint: { es: 'Los dos vectores deben cumplir la ecuación y no ser paralelos.', en: 'Both vectors must satisfy the equation and not be parallel.' },
      setup: (store) => store.set({ n: 3, k: 2, V: M([[1, 0, 0], [0, 1, 0], [0, 0, 1]]), t: 1, show: ['span', 'path'] }),
      check: (s, d) => s.n === 3 && s.k === 2 && d.an.rank === 2 && [0, 1].every((j) => Math.abs(s.V[0][j].x + s.V[1][j].x + s.V[2][j].x) < 1e-9),
    },
    {
      id: 'basis3',
      title: { es: 'Completa la base', en: 'Complete the basis' },
      text: { es: 'Deja $\\vec{v}_1 = (1, 0, 1)$ y $\\vec{v}_2 = (0, 1, 1)$ y mueve solo $\\vec{v}_3$ para obtener una base de $\\mathbb{R}^3$ en la que $\\vec{w} = (2, 2, 2)$ tenga coordenadas $(1, 1, 1)$.', en: 'Keep $\\vec{v}_1 = (1, 0, 1)$ and $\\vec{v}_2 = (0, 1, 1)$ and move only $\\vec{v}_3$ to get a basis of $\\mathbb{R}^3$ in which $\\vec{w} = (2, 2, 2)$ has coordinates $(1, 1, 1)$.' },
      hint: { es: 'Necesitas $\\vec{v}_1 + \\vec{v}_2 + \\vec{v}_3 = \\vec{w}$.', en: 'You need $\\vec{v}_1 + \\vec{v}_2 + \\vec{v}_3 = \\vec{w}$.' },
      setup: (store) => store.set({ n: 3, k: 3, V: M([[1, 0, 1], [0, 1, 1], [1, 1, 2]]), w: V([2, 2, 2]), t: 1, show: ['span', 'path', 'w'] }),
      check: (s, d) => s.n === 3 && s.k === 3 && d.an.rank === 3 && sameCols(s.V.map((row) => row.slice(0, 2)), [[1, 0], [0, 1], [1, 1]])
        && s.w.every((e) => e.x === 2) && d.an.sol.status === 'unique' && d.an.sol.particular.every((x) => Math.abs(d.an.F.toNumber(x) - 1) < 1e-9),
    },
  ],
});

function sameCols(Vs, target) {
  return target.every((row, i) => row.every((x, j) => Math.abs(Vs[i][j].x - x) < 1e-12));
}
