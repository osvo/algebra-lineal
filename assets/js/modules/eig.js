import { createLab } from '../ui/shell.js';
import { codec, M } from '../ui/store.js';
import { Plane2D } from '../ui/plane2d.js';
import { card, matrixEditor, flagChip, readout, animator, segmented, slider, button, stageLabels } from '../ui/controls.js';
import { h } from '../ui/dom.js';
import { tr, setText } from '../ui/i18n.js';
import { entryFromNumber, numberToInput } from '../core/parse.js';
import { RationalField, FloatField } from '../core/fields.js';
import { Surd } from '../core/fields.js';
import * as L from '../core/linalg.js';
import { realEigenDirections, rotationScalingForm, approxVector } from '../core/eigen.js';
import { texValue, texVector, texMatrix, cls, fmtDecimal } from '../core/format.js';
import { analyzeSquare, eigenTex, eigenvectorTex, defectiveNote, charPolyTex, COL_VARS, presetSelect, memo, entriesKey } from './common.js';

const PRESETS = [
  { id: 'saddle', label: { es: 'Silla: λ = 3/2 y 1/2', en: 'Saddle: λ = 3/2 and 1/2' }, value: [['5/2', -2], [1, '-1/2']] },
  { id: 'sink', label: { es: 'Atractor: λ = 0.8 y 0.5', en: 'Sink: λ = 0.8 and 0.5' }, value: [['0.8', 0], ['0.3', '0.5']] },
  { id: 'source', label: { es: 'Repulsor: λ = 1.2 y 1.1', en: 'Source: λ = 1.2 and 1.1' }, value: [['1.2', 0], ['0.1', '1.1']] },
  { id: 'fib', label: { es: 'Fibonacci', en: 'Fibonacci' }, value: [[1, 1], [1, 0]] },
  { id: 'spiralin', label: { es: 'Espiral hacia dentro', en: 'Inward spiral' }, value: [['0.8', '-0.4'], ['0.4', '0.8']] },
  { id: 'spiralout', label: { es: 'Espiral hacia fuera', en: 'Outward spiral' }, value: [['0.9', '-0.5'], ['0.5', '0.9']] },
  { id: 'rot', label: { es: 'Rotación de 30° (centro)', en: 'Rotation by 30° (centre)' }, value: [['√3/2', '-1/2'], ['1/2', '√3/2']] },
  { id: 'shear', label: { es: 'Cizalla (defectiva)', en: 'Shear (defective)' }, value: [[1, '0.5'], [0, 1]] },
  { id: 'flip', label: { es: 'Valor propio negativo', en: 'Negative eigenvalue' }, value: [['-0.9', 0], [0, '0.6']] },
  { id: 'markov', label: { es: 'Cadena de Markov', en: 'Markov chain' }, value: [['0.9', '0.2'], ['0.1', '0.8']] },
];

const analyze = memo((A) => analyzeSquare(A));
const SEED_COLORS = ['#72d9e8', '#ffb454', '#c29bff', '#8ce07a', '#ff7c9c', '#b9c2ba'];
const SUBS = '₀₁₂₃₄₅₆₇₈₉';

/** A = P · Mid · P⁻¹ with Mid diagonal, rotation-scaling or Jordan. Exact whenever possible. */
function decomposition(an) {
  const eig = an.eig;
  const reals = eig.eigen.filter((e) => e.real);
  if (reals.length === 1 && reals[0].alg === 2 && reals[0].geo === 2) {
    const F = reals[0].field;
    return { kind: 'scalar', F, P: L.identity(2, F), Mid: L.matScale(L.identity(2, F), reals[0].value, F), Pinv: L.identity(2, F) };
  }
  if (reals.length === 2) {
    const F = reals[0].field;
    const v1 = reals[0].vectors[0], v2 = reals[1].vectors[0];
    const P = [[v1[0], v2[0]], [v1[1], v2[1]]];
    const Pinv = L.inverse(P, F);
    const Mid = [[reals[0].value, F.zero], [F.zero, reals[1].value]];
    return { kind: 'diag', F, P, Mid, Pinv };
  }
  if (reals.length === 1 && reals[0].geo === 1) {
    // Jordan form: (A − λI)w = v.
    const e = reals[0];
    const F = e.field;
    const Ae = F === RationalField ? an.M : an.Af;
    const shifted = L.matSub(Ae, L.matScale(L.identity(2, F), e.value, F), F);
    const v = e.vectors[0];
    const s = L.solve(shifted, v, F);
    if (s.status === 'none') return null;
    const w = s.particular;
    const P = [[v[0], w[0]], [v[1], w[1]]];
    return { kind: 'jordan', F, P, Mid: [[e.value, F.one], [F.zero, e.value]], Pinv: L.inverse(P, F) };
  }
  const rs = rotationScalingForm(eig);
  if (!rs) return null;
  const F = FloatField(1e-12);
  return { kind: 'complex', F, P: rs.P, Mid: rs.C, Pinv: L.inv2(rs.P), rs };
}

const toFloat = (Mx, F) => Mx.map((row) => row.map((x) => (x instanceof Surd ? x.re() : F.toNumber(x))));

createLab({
  id: 'eig',
  lead: {
    es: 'Casi todos los vectores cambian de dirección al aplicar A. Los que no, los vectores propios, revelan la estructura de la transformación y deciden el futuro de xₖ₊₁ = A xₖ.',
    en: 'Almost every vector changes direction under A. Those that do not, the eigenvectors, reveal the structure of the map and decide the future of xₖ₊₁ = A xₖ.',
  },
  state: {
    A: { def: M([['5/2', -2], [1, '-1/2']]), codec: codec.matrix(2, 2) },
    mode: { def: 'search', codec: codec.enum(['search', 'dyn', 'diag']) },
    theta: { def: 20, codec: codec.num(0, 360) },
    seeds: { def: [[1, 2], [-2, 1], [2, -1.5], [-1, -2]], codec: codec.points() },
    k: { def: 6, codec: codec.num(0, 30) },
    t: { def: 3, codec: codec.num(0, 3) },
    show: { def: ['eig', 'circle'], codec: codec.flags(['eig', 'circle', 'grid']) },
  },

  build(ctx) {
    const { store } = ctx;
    const plane = new Plane2D(ctx.addView(), { range: 4 });
    const animSearch = animator({ store, key: 'theta', max: 360, labelTex: '\\theta', format: (v) => `${Math.round(v)}°`, unitsPerSecond: 30 });
    const animDyn = animator({ store, key: 'k', max: 30, labelTex: 'k', format: (v) => v.toFixed(1), unitsPerSecond: 2 });
    const animDiag = animator({ store, key: 't', max: 3 });
    ctx.bar.append(animSearch.el, animDyn.el, animDiag.el);
    const diagStages = stageLabels();
    animDiag.el.append(diagStages.el);

    const setCol = (j) => ([x, y]) => {
      const A = store.get('A').map((row) => row.slice());
      A[0][j] = entryFromNumber(x); A[1][j] = entryFromNumber(y);
      store.set({ A });
    };
    plane.addHandle({ id: 'i', color: 'i', visible: () => store.get('mode') !== 'dyn', get: () => [store.get('A')[0][0].x, store.get('A')[1][0].x], set: setCol(0) });
    plane.addHandle({ id: 'j', color: 'j', visible: () => store.get('mode') !== 'dyn', get: () => [store.get('A')[0][1].x, store.get('A')[1][1].x], set: setCol(1) });
    plane.addHandle({
      id: 'x', color: 'v', visible: () => store.get('mode') === 'search',
      get: () => { const th = (store.get('theta') * Math.PI) / 180; return [Math.cos(th), Math.sin(th)]; },
      set: ([x, y]) => { animSearch.pause(); store.set({ theta: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360 }); },
      snap: (p) => p,
    });
    for (let s = 0; s < 6; s++) {
      plane.addHandle({
        id: `s${s}`, color: 'w', visible: () => store.get('mode') === 'dyn' && store.get('seeds').length > s,
        get: () => store.get('seeds')[s] || [0, 0],
        set: (p) => { const seeds = store.get('seeds').map((q) => q.slice()); seeds[s] = p; store.set({ seeds }); },
      });
    }

    // Panel ---------------------------------------------------------------------
    const modeSeg = segmented({
      options: [
        { value: 'search', label: { es: 'Buscar', en: 'Search' } },
        { value: 'dyn', label: { es: 'Dinámica', en: 'Dynamics' } },
        { value: 'diag', label: { es: 'Descomponer', en: 'Decompose' } },
      ],
      get: () => store.get('mode'), set: (mode) => { [animSearch, animDyn, animDiag].forEach((a) => a.pause()); store.set({ mode }); },
      label: { es: 'Modo', en: 'Mode' },
    });
    const editor = matrixEditor({ rows: 2, cols: 2, label: 'A =', colColors: COL_VARS, get: () => store.get('A'), set: (A) => store.set({ A }), name: { es: 'Matriz A', en: 'Matrix A' } });
    const presets = presetSelect({ store, key: 'A', presets: PRESETS });
    const modeHelp = h('p');
    const matrixCard = card({ title: { es: 'Matriz y modo', en: 'Matrix and mode' }, body: [modeSeg.el, editor.el, presets.el, modeHelp] });

    const chips = [
      flagChip(store, 'show', 'eig', { es: 'Rectas propias', en: 'Eigenlines' }, 'var(--c-eig)'),
      flagChip(store, 'show', 'circle', { es: 'Círculo y su imagen', en: 'Circle and its image' }, 'var(--c-w)'),
      flagChip(store, 'show', 'grid', { es: 'Cuadrícula de vectores propios', en: 'Eigenvector grid' }, 'var(--tgrid)'),
    ];
    const addSeed = button({ label: { es: 'Añadir semilla', en: 'Add seed' }, iconName: 'plus', small: true, onClick: () => {
      const seeds = store.get('seeds');
      if (seeds.length >= 6) return;
      const ang = Math.random() * Math.PI * 2;
      store.set({ seeds: [...seeds, [Math.round(2.5 * Math.cos(ang) * 10) / 10, Math.round(2.5 * Math.sin(ang) * 10) / 10]] });
    } });
    const delSeed = button({ label: { es: 'Quitar', en: 'Remove' }, iconName: 'minus', small: true, onClick: () => store.set({ seeds: store.get('seeds').slice(0, -1) }) });
    const seedRow = h('div', { class: 'row' }, addSeed, delSeed);
    const showCard = card({ title: { es: 'Mostrar', en: 'Show' }, body: [h('div', { class: 'chip-row' }, chips.map((c) => c.el)), seedRow] });

    const r = {
      now: readout({ es: 'Ahora', en: 'Now' }, { block: true }),
      poly: readout({ es: 'Polinomio', en: 'Polynomial' }, { block: true }),
      val: readout({ es: 'Valores propios', en: 'Eigenvalues' }, { block: true }),
      vec: readout({ es: 'Vectores propios', en: 'Eigenvectors' }, { block: true }),
      check: readout({ es: 'Comprobación', en: 'Check' }, { block: true }),
      dyn: readout({ es: 'Comportamiento', en: 'Behaviour' }, { block: true }),
      dec: readout({ es: 'Descomposición', en: 'Decomposition' }, { block: true }),
    };
    const resultsCard = card({ title: { es: 'Análisis exacto', en: 'Exact analysis' }, body: [h('div', { class: 'readouts' }, Object.values(r).map((x) => x.el))] });
    ctx.panel.append(matrixCard.el, showCard.el, resultsCard.el);

    // Drawing -------------------------------------------------------------------
    let cur = null;
    plane.setDraw((g) => {
      if (!cur) return;
      const { an, Af, mode, show, theta, seeds, k, t, dec } = cur;
      g.backgroundGrid();
      const dirs = realEigenDirections(an.eig);
      if (show.includes('grid') && dirs.length) {
        const d = dirs.flatMap((e) => e.dirs);
        if (d.length >= 2) g.transformedGrid([[d[0][0], d[1][0]], [d[0][1], d[1][1]]], { color: g.c.eig, alpha: 0.25, axes: false, width: 1 });
      }
      if (mode === 'diag' && dec) {
        const Mt = diagMatrix(dec, t);
        g.transformedGrid(Mt, { color: g.c.tgrid });
        const Pf = dec.Pf;
        const e1 = L.mv2(Mt, 1, 0), e2 = L.mv2(Mt, 0, 1);
        g.arrow([0, 0], e1, { color: g.c.i, width: 3.5 });
        g.arrow([0, 0], e2, { color: g.c.j, width: 3.5 });
        // Images of the columns of P (the eigenvectors).
        const p1 = L.mv2(Mt, Pf[0][0], Pf[1][0]), p2 = L.mv2(Mt, Pf[0][1], Pf[1][1]);
        g.arrow([0, 0], p1, { color: g.c.eig, width: 3, dash: [6, 4] });
        g.arrow([0, 0], p2, { color: g.c.eig, width: 3, dash: [2, 5] });
        g.text(p1, 'p₁', { color: g.c.eig, offset: [10, -12], font: '"KaTeX_Main", serif', size: 16, italic: true });
        g.text(p2, 'p₂', { color: g.c.eig, offset: [10, -12], font: '"KaTeX_Main", serif', size: 16, italic: true });
        return;
      }
      if (show.includes('eig')) for (const e of dirs) for (const d of e.dirs) g.infiniteLine([0, 0], d, { color: g.c.eig, width: 2, dash: [2, 7] });
      if (mode === 'search') {
        if (show.includes('circle')) {
          g.curve((s) => [Math.cos(s), Math.sin(s)], 0, 2 * Math.PI, 120, { color: g.c.w, width: 1.5, alpha: 0.55, dash: [5, 5] });
          g.ellipse(Af, { color: g.c.w, width: 2 });
        }
        const th = (theta * Math.PI) / 180;
        const x = [Math.cos(th), Math.sin(th)];
        const Ax = L.mv2(Af, ...x);
        const cross = x[0] * Ax[1] - x[1] * Ax[0];
        const aligned = Math.hypot(...Ax) > 1e-9 ? Math.abs(cross) / Math.hypot(...Ax) < Math.sin((1.2 * Math.PI) / 180) : true;
        g.infiniteLine([0, 0], x, { color: g.c.v, width: 1, alpha: 0.35 });
        g.arrow([0, 0], Ax, { color: aligned ? g.c.eig : g.c.w, width: 4 });
        g.arrow([0, 0], x, { color: g.c.v, width: 3.5 });
        g.mathLabel(x, 'x', { color: g.c.v, deco: 'arrow', away: [0, 0] });
        g.text(Ax, aligned ? `A x = ${fmtDecimal(L.dotFloat(Ax, x), 3)} x` : 'A x', { color: aligned ? g.c.eig : g.c.w, offset: [12, -14], weight: 600 });
      } else if (mode === 'dyn') {
        const K = Math.floor(k), frac = k - K;
        seeds.forEach((s0, idx) => {
          let pts = [s0];
          let p = s0;
          for (let i = 0; i < K; i++) { p = L.mv2(Af, ...p); if (Math.hypot(...p) > 1e4) break; pts.push(p); }
          if (frac > 0 && Math.hypot(...p) <= 1e4) { const q = L.mv2(Af, ...p); pts.push([p[0] + frac * (q[0] - p[0]), p[1] + frac * (q[1] - p[1])]); }
          const col = SEED_COLORS[idx % SEED_COLORS.length];
          g.polyline(pts, { color: col, width: 1.5, alpha: 0.6 });
          pts.forEach((q, i) => g.point(q, { color: col, r: i === pts.length - 1 ? 5 : 3, alpha: 0.35 + 0.65 * ((i + 1) / pts.length) }));
          g.text(pts[pts.length - 1], `x${sub(Math.min(K + (frac > 0 ? 1 : 0), pts.length - 1))}`, { color: col, offset: [9, -10], size: 11 });
        });
      }
      g.arrow([0, 0], [Af[0][0], Af[1][0]], { color: g.c.i, width: 2, alpha: mode === 'dyn' ? 0.25 : 0.6 });
      g.arrow([0, 0], [Af[0][1], Af[1][1]], { color: g.c.j, width: 2, alpha: mode === 'dyn' ? 0.25 : 0.6 });
    });

    function render(state) {
      const A = state.A;
      const an = analyze(entriesKey(A), A);
      let dec = decomposition(an);
      if (dec) dec = { ...dec, Pf: toFloat(dec.P, dec.F), Midf: toFloat(dec.Mid, dec.F), Pinvf: dec.Pinv ? toFloat(dec.Pinv, dec.F) : null };
      cur = { an, Af: an.Af, mode: state.mode, show: state.show, theta: state.theta, seeds: state.seeds, k: state.k, t: state.t, dec };
      plane.requestRender();
      editor.update(); modeSeg.update(); animSearch.update(); animDyn.update(); animDiag.update();
      chips.forEach((c) => c.update());
      const mode = state.mode;
      animSearch.el.hidden = mode !== 'search';
      animDyn.el.hidden = mode !== 'dyn';
      animDiag.el.hidden = mode !== 'diag';
      seedRow.hidden = mode !== 'dyn';
      chips[1].el.hidden = mode !== 'search';
      setText(modeHelp, {
        search: { es: 'Gira el vector x (o reproduce): cuando A x queda sobre la misma recta que x, has encontrado un vector propio.', en: 'Turn the vector x (or press play): when A x lands on the same line as x, you have found an eigenvector.' },
        dyn: { es: 'Cada semilla x₀ genera x₁ = A x₀, x₂ = A x₁, … Arrastra las semillas y avanza k.', en: 'Each seed x₀ generates x₁ = A x₀, x₂ = A x₁, … Drag the seeds and advance k.' },
        diag: { es: 'A = P·D·P⁻¹ se reproduce en tres etapas: P⁻¹ lleva los vectores propios a los ejes, D estira, y P los devuelve.', en: 'A = P·D·P⁻¹ plays in three stages: P⁻¹ sends the eigenvectors to the axes, D stretches, and P sends them back.' },
      }[mode]);
      if (mode === 'diag') {
        const t = state.t;
        const names = dec && dec.kind === 'complex' ? ['P^{-1}', 'C', 'P'] : dec && dec.kind === 'jordan' ? ['P^{-1}', 'J', 'P'] : ['P^{-1}', 'D', 'P'];
        diagStages.update(names.map((nm, i) => `${i + 1}.\;${nm}`), Math.min(2, Math.floor(t)));
      }

      // Readouts
      const eig = an.eig;
      if (mode === 'search') {
        const th = (state.theta * Math.PI) / 180;
        const x = [Math.cos(th), Math.sin(th)];
        const Ax = L.mv2(an.Af, ...x);
        const ang = Math.atan2(x[0] * Ax[1] - x[1] * Ax[0], L.dotFloat(x, Ax));
        r.now.set(`\\theta = ${fmtDecimal(state.theta, 1)}^{\\circ},\\quad \\angle(\\vec{x}, A\\vec{x}) = ${fmtDecimal((ang * 180) / Math.PI, 1)}^{\\circ}`);
        r.now.show(true);
      } else if (mode === 'dyn' && state.seeds.length) {
        const s0 = state.seeds[0];
        const reals = eig.eigen.filter((e) => e.real);
        if (dec && dec.kind === 'diag') {
          const c = L.mv2(dec.Pinvf, ...s0);
          const l1 = reals[0].approx.re, l2 = reals[1].approx.re;
          r.now.set(`\\vec{x}_k = A^k\\vec{x}_0 = ${fmtDecimal(c[0], 3, { unicodeMinus: false })}\\,(${fmtDecimal(l1, 3, { unicodeMinus: false })})^{k}\\,\\mathbf{p}_1 ${c[1] < 0 ? '-' : '+'} ${fmtDecimal(Math.abs(c[1]), 3, { unicodeMinus: false })}\\,(${fmtDecimal(l2, 3, { unicodeMinus: false })})^{k}\\,\\mathbf{p}_2`,
            { es: 'Escribiendo la primera semilla en la base de vectores propios, cada componente se multiplica por su λ en cada paso.', en: 'Writing the first seed in the eigenbasis, each component gets multiplied by its λ at every step.' });
        } else r.now.set(`\\vec{x}_k = A^k\\vec{x}_0`);
        r.now.show(true);
      } else r.now.show(false);

      r.poly.set(charPolyTex(eig));
      const et = eigenTex(eig);
      r.val.set(et.values, et.complex.length ? { es: `|λ| = ${fmtDecimal(Math.hypot(et.complex[0].approx.re, et.complex[0].approx.im), 4)}, arg λ = ±${fmtDecimal((Math.abs(Math.atan2(et.complex[0].approx.im, et.complex[0].approx.re)) * 180) / Math.PI, 2)}°`, en: `|λ| = ${fmtDecimal(Math.hypot(et.complex[0].approx.re, et.complex[0].approx.im), 4)}, arg λ = ±${fmtDecimal((Math.abs(Math.atan2(et.complex[0].approx.im, et.complex[0].approx.re)) * 180) / Math.PI, 2)}°` } : null);
      if (et.reals.length) { r.vec.set(eigenvectorTex(eig), defectiveNote(eig)); r.vec.show(true); } else r.vec.show(false);
      const lamE = eig.eigen.flatMap((e) => Array(e.alg).fill(e));
      if (lamE.length === 2) {
        let sumTex, prodTex;
        const [e1, e2] = lamE;
        if (eig.exact && e1.field === e2.field) {
          const F = e1.field;
          sumTex = texValue(F.add(e1.value, e2.value));
          prodTex = texValue(F.mul(e1.value, e2.value));
        } else {
          const a = e1.approx, b = e2.approx;
          sumTex = texValue(a.re + b.re);
          prodTex = texValue(a.re * b.re - a.im * b.im);
        }
        r.check.set(`\\lambda_1 + \\lambda_2 = ${sumTex} = \\operatorname{tr}A,\\qquad \\lambda_1\\lambda_2 = ${prodTex} = \\det A`);
      }
      r.dyn.set({ html: `<span class="badge">${tr(classify(eig))}</span>` });
      if (dec) {
        const nm = dec.kind === 'complex' ? 'C' : dec.kind === 'jordan' ? 'J' : 'D';
        const P = dec.kind === 'complex' ? dec.Pf : dec.P, Mid = dec.kind === 'complex' ? dec.Midf : dec.Mid, Pinv = dec.kind === 'complex' ? dec.Pinvf : dec.Pinv;
        r.dec.set(`A = P\\,${nm}\\,P^{-1} = ${texMatrix(P)}${texMatrix(Mid)}${Pinv ? texMatrix(Pinv) : ''}`, {
          diag: { es: 'Diagonalizable: las columnas de P son vectores propios y D contiene los valores propios.', en: 'Diagonalizable: the columns of P are eigenvectors and D holds the eigenvalues.' },
          scalar: { es: 'A es un múltiplo de la identidad: todo vector es propio.', en: 'A is a multiple of the identity: every vector is an eigenvector.' },
          jordan: { es: 'No diagonalizable: forma de Jordan con un bloque 2 × 2. La segunda columna de P es un vector propio generalizado.', en: 'Not diagonalizable: Jordan form with a 2 × 2 block. The second column of P is a generalized eigenvector.' },
          complex: { es: 'Valores propios complejos a ± bi: forma real C = [[a, −b], [b, a]], una rotación de ángulo arg λ seguida de un escalamiento por |λ| (valores aproximados).', en: 'Complex eigenvalues a ± bi: real form C = [[a, −b], [b, a]], a rotation by arg λ followed by a scaling by |λ| (approximate values).' },
        }[dec.kind]);
        r.dec.show(true);
      } else r.dec.show(false);

      ctx.setLegend([
        state.show.includes('eig') && { color: 'var(--c-eig)', kind: 'dash', label: { es: 'rectas propias', en: 'eigenlines' } },
        mode === 'search' && { color: 'var(--c-v)', tex: '\\vec{x}' },
        mode === 'search' && { color: 'var(--c-w)', tex: 'A\\vec{x}' },
        mode === 'search' && state.show.includes('circle') && { color: 'var(--c-w)', label: { es: 'imagen del círculo unitario', en: 'image of the unit circle' } },
        mode === 'dyn' && { color: 'var(--c-w)', label: { es: 'órbitas x₀, x₁, x₂, …', en: 'orbits x₀, x₁, x₂, …' } },
        mode === 'diag' && { color: 'var(--tgrid)', label: { es: 'cuadrícula tras cada etapa', en: 'grid after each stage' } },
      ]);
      return { an, dec, eig };
    }

    return {
      render,
      snapshot: () => plane.snapshot(),
      togglePlay: () => ({ search: animSearch, dyn: animDyn, diag: animDiag })[store.get('mode')].toggle(),
      onReset: () => { [animSearch, animDyn, animDiag].forEach((a) => a.pause()); plane.resetView(); },
    };
  },

  learn: {
    what: {
      es: `<p>Un <strong>vector propio</strong> de $A$ es un vector no nulo que $A$ no saca de su recta: $A\\mathbf{v} = \\lambda\\mathbf{v}$. En el modo <em>Buscar</em>, el vector unitario $\\vec{x}$ recorre el círculo mientras dibujamos $A\\vec{x}$; el ángulo entre ambos se anula exactamente en las direcciones propias. La imagen del círculo es una elipse (o un segmento, si $\\det A = 0$).</p>
<p>En <em>Dinámica</em>, cada semilla genera la órbita $\\vec{x}_{k+1} = A\\vec{x}_k$. Si $A$ es diagonalizable y $\\vec{x}_0 = c_1\\mathbf{p}_1 + c_2\\mathbf{p}_2$, entonces $\\vec{x}_k = c_1\\lambda_1^k\\mathbf{p}_1 + c_2\\lambda_2^k\\mathbf{p}_2$: la componente con mayor $|\\lambda|$ termina dominando. Con valores propios complejos las órbitas giran; con uno negativo, saltan de un lado a otro.</p>
<p>En <em>Descomponer</em> se ve $A = PDP^{-1}$ como tres movimientos: $P^{-1}$ lleva los vectores propios (flechas punteadas) a los ejes, $D$ estira cada eje por su $\\lambda$, y $P$ lo devuelve todo. Cuando no hay base de vectores propios aparece la forma de rotación-escalado (valores complejos) o la de Jordan (caso defectivo).</p>`,
      en: `<p>An <strong>eigenvector</strong> of $A$ is a non-zero vector that $A$ does not knock off its line: $A\\mathbf{v} = \\lambda\\mathbf{v}$. In <em>Search</em> mode the unit vector $\\vec{x}$ sweeps the circle while we draw $A\\vec{x}$; the angle between them vanishes exactly on the eigen-directions. The image of the circle is an ellipse (or a segment, if $\\det A = 0$).</p>
<p>In <em>Dynamics</em>, each seed generates the orbit $\\vec{x}_{k+1} = A\\vec{x}_k$. If $A$ is diagonalizable and $\\vec{x}_0 = c_1\\mathbf{p}_1 + c_2\\mathbf{p}_2$, then $\\vec{x}_k = c_1\\lambda_1^k\\mathbf{p}_1 + c_2\\lambda_2^k\\mathbf{p}_2$: the component with the largest $|\\lambda|$ eventually dominates. With complex eigenvalues orbits turn; with a negative one, they jump from side to side.</p>
<p>In <em>Decompose</em> you see $A = PDP^{-1}$ as three motions: $P^{-1}$ takes the eigenvectors (dashed arrows) to the axes, $D$ stretches each axis by its $\\lambda$, and $P$ brings everything back. When there is no eigenbasis you get the rotation-scaling form (complex eigenvalues) or the Jordan form (defective case).</p>`,
    },
    prompts: {
      es: [
        'En «Buscar» con la silla inicial, reproduce la animación: ¿cuántas veces por vuelta se alinean $\\vec{x}$ y $A\\vec{x}$? ¿Por qué siempre es un número par?',
        'Pasa a «Dinámica». ¿Hacia qué recta se acercan todas las órbitas? ¿Qué semilla es excepcional?',
        'Elige «Fibonacci» y pon una semilla en $(1, 0)$. Las coordenadas de $\\vec{x}_k$ son números de Fibonacci; ¿qué pendiente alcanzan las órbitas? Compárala con la razón áurea.',
        'Con «Espiral hacia dentro» mira $|\\lambda|$ y $\\arg\\lambda$: ¿cuánto gira y cuánto se encoge la órbita en cada paso?',
        'Con «Cadena de Markov», ¿a qué vector convergen las órbitas que empiezan en el primer cuadrante? ¿Qué valor propio le corresponde?',
      ],
      en: [
        'In “Search” with the initial saddle, press play: how many times per turn do $\\vec{x}$ and $A\\vec{x}$ line up? Why is it always an even number?',
        'Switch to “Dynamics”. Which line do all orbits approach? Which seed is exceptional?',
        'Pick “Fibonacci” and put a seed at $(1, 0)$. The coordinates of $\\vec{x}_k$ are Fibonacci numbers; which slope do the orbits reach? Compare it with the golden ratio.',
        'With “Inward spiral”, look at $|\\lambda|$ and $\\arg\\lambda$: how much does the orbit turn and shrink at each step?',
        'With “Markov chain”, which vector do orbits starting in the first quadrant converge to? Which eigenvalue does it belong to?',
      ],
    },
    formal: [
      {
        kind: 'theorem',
        title: { es: 'Diagonalización', en: 'Diagonalization' },
        body: {
          es: '<p>$A\\in\\mathbb{R}^{n\\times n}$ es diagonalizable sobre $\\mathbb{R}$ si y solo si existe una base de $\\mathbb{R}^n$ formada por vectores propios. En tal caso $A = PDP^{-1}$, con los vectores propios como columnas de $P$ y los valores propios en la diagonal de $D$, y $A^k = PD^kP^{-1}$. Vectores propios de valores propios distintos son linealmente independientes; en particular, $n$ valores propios reales distintos garantizan la diagonalizabilidad.</p>',
          en: '<p>$A\\in\\mathbb{R}^{n\\times n}$ is diagonalizable over $\\mathbb{R}$ if and only if there is a basis of $\\mathbb{R}^n$ made of eigenvectors. Then $A = PDP^{-1}$, with the eigenvectors as the columns of $P$ and the eigenvalues on the diagonal of $D$, and $A^k = PD^kP^{-1}$. Eigenvectors of distinct eigenvalues are linearly independent; in particular, $n$ distinct real eigenvalues guarantee diagonalizability.</p>',
        },
      },
      {
        kind: 'proposition',
        title: { es: 'Forma real de valores propios complejos', en: 'Real form for complex eigenvalues' },
        body: {
          es: '<p>Si $A\\in\\mathbb{R}^{2\\times2}$ tiene valores propios $a\\pm bi$ ($b\\neq0$) y $\\mathbf{w} = \\mathbf{u} + i\\mathbf{v}$ es vector propio de $a+bi$, entonces con $P = [\\,\\mathbf{v}\\;\\mathbf{u}\\,]$: $$A = P\\begin{bmatrix} a & -b\\\\ b & a\\end{bmatrix}P^{-1} = P\\,\\big(r R_\\theta\\big)\\,P^{-1},\\quad r = |\\lambda|,\\ \\theta = \\arg\\lambda.$$ Las órbitas de $\\vec{x}_{k+1} = A\\vec{x}_k$ giran $\\theta$ y se escalan por $r$ en cada paso (en las coordenadas de $P$).</p>',
          en: '<p>If $A\\in\\mathbb{R}^{2\\times2}$ has eigenvalues $a\\pm bi$ ($b\\neq0$) and $\\mathbf{w} = \\mathbf{u} + i\\mathbf{v}$ is an eigenvector of $a+bi$, then with $P = [\\,\\mathbf{v}\\;\\mathbf{u}\\,]$: $$A = P\\begin{bmatrix} a & -b\\\\ b & a\\end{bmatrix}P^{-1} = P\\,\\big(r R_\\theta\\big)\\,P^{-1},\\quad r = |\\lambda|,\\ \\theta = \\arg\\lambda.$$ Orbits of $\\vec{x}_{k+1} = A\\vec{x}_k$ turn by $\\theta$ and are scaled by $r$ at each step (in the coordinates of $P$).</p>',
        },
      },
      {
        kind: 'proposition',
        title: { es: 'Forma de Jordan 2 × 2', en: '2 × 2 Jordan form' },
        body: {
          es: '<p>Si $\\lambda$ es raíz doble de $p$ pero $\\dim\\ker(A-\\lambda I) = 1$, tomando $\\mathbf{v}$ propio y $\\mathbf{w}$ con $(A-\\lambda I)\\mathbf{w} = \\mathbf{v}$ se obtiene $A = P\\begin{bmatrix}\\lambda&1\\\\0&\\lambda\\end{bmatrix}P^{-1}$ con $P = [\\,\\mathbf{v}\\;\\mathbf{w}\\,]$, y $A^k = P\\begin{bmatrix}\\lambda^k & k\\lambda^{k-1}\\\\ 0&\\lambda^k\\end{bmatrix}P^{-1}$.</p>',
          en: '<p>If $\\lambda$ is a double root of $p$ but $\\dim\\ker(A-\\lambda I) = 1$, taking an eigenvector $\\mathbf{v}$ and $\\mathbf{w}$ with $(A-\\lambda I)\\mathbf{w} = \\mathbf{v}$ gives $A = P\\begin{bmatrix}\\lambda&1\\\\0&\\lambda\\end{bmatrix}P^{-1}$ with $P = [\\,\\mathbf{v}\\;\\mathbf{w}\\,]$, and $A^k = P\\begin{bmatrix}\\lambda^k & k\\lambda^{k-1}\\\\ 0&\\lambda^k\\end{bmatrix}P^{-1}$.</p>',
        },
      },
      {
        kind: 'theorem',
        title: { es: 'Estabilidad de sistemas discretos', en: 'Stability of discrete systems' },
        body: {
          es: '<p>Para $\\vec{x}_{k+1} = A\\vec{x}_k$, todas las órbitas tienden a $\\mathbf{0}$ si y solo si el radio espectral $\\rho(A) = \\max|\\lambda_i| < 1$. Si $\\rho(A)>1$ casi todas las órbitas se alejan; si $|\\lambda_1|>1>|\\lambda_2|$ el origen es un punto de silla.</p>',
          en: '<p>For $\\vec{x}_{k+1} = A\\vec{x}_k$, every orbit tends to $\\mathbf{0}$ if and only if the spectral radius $\\rho(A) = \\max|\\lambda_i| < 1$. If $\\rho(A)>1$ almost every orbit escapes; if $|\\lambda_1|>1>|\\lambda_2|$ the origin is a saddle point.</p>',
        },
      },
    ],
  },

  challenges: [
    {
      id: 'defective',
      title: { es: 'Una sola dirección', en: 'A single direction' },
      text: { es: 'Construye una matriz con un valor propio doble y una sola recta propia.', en: 'Build a matrix with a double eigenvalue and a single eigenline.' },
      hint: { es: 'Una cizalla: $\\begin{bmatrix}\\lambda & c\\\\ 0 & \\lambda\\end{bmatrix}$ con $c\\neq0$.', en: 'A shear: $\\begin{bmatrix}\\lambda & c\\\\ 0 & \\lambda\\end{bmatrix}$ with $c\\neq0$.' },
      check: (s, d) => d.eig.eigen.length === 1 && d.eig.eigen[0].real && d.eig.eigen[0].alg === 2 && d.eig.eigen[0].geo === 1,
    },
    {
      id: 'spiral',
      title: { es: 'Espiral hacia el origen', en: 'Spiral into the origin' },
      text: { es: 'Haz que las órbitas giren y converjan al origen.', en: 'Make the orbits turn and converge to the origin.' },
      hint: { es: 'Valores propios complejos con $|\\lambda| < 1$, por ejemplo $\\begin{bmatrix}a&-b\\\\b&a\\end{bmatrix}$ con $a^2+b^2<1$.', en: 'Complex eigenvalues with $|\\lambda| < 1$, e.g. $\\begin{bmatrix}a&-b\\\\b&a\\end{bmatrix}$ with $a^2+b^2<1$.' },
      setup: (store) => store.set({ mode: 'dyn', A: M([['5/2', -2], [1, '-1/2']]) }),
      check: (s, d) => d.eig.eigen.every((e) => !e.real) && d.eig.eigen.every((e) => Math.hypot(e.approx.re, e.approx.im) < 1 - 1e-9),
    },
    {
      id: 'saddle',
      title: { es: 'Silla con λ = 2 y 1/2', en: 'Saddle with λ = 2 and 1/2' },
      text: { es: 'Construye una matriz no diagonal con valores propios exactamente $2$ y $1/2$.', en: 'Build a non-diagonal matrix with eigenvalues exactly $2$ and $1/2$.' },
      hint: { es: 'Necesitas $\\operatorname{tr}A = 5/2$ y $\\det A = 1$.', en: 'You need $\\operatorname{tr}A = 5/2$ and $\\det A = 1$.' },
      check: (s, d) => {
        const vals = d.eig.eigen.filter((e) => e.real).map((e) => e.approx.re).sort((a, b) => a - b);
        const a = d.an.Af;
        return vals.length === 2 && Math.abs(vals[0] - 0.5) < 1e-9 && Math.abs(vals[1] - 2) < 1e-9 && (Math.abs(a[0][1]) > 1e-12 || Math.abs(a[1][0]) > 1e-12);
      },
    },
    {
      id: 'prescribed',
      title: { es: 'Espectro prescrito', en: 'Prescribed spectrum' },
      text: { es: 'Encuentra $A$ con valor propio $3$ en la dirección $(1,1)$ y $-1$ en la dirección $(1,-1)$.', en: 'Find $A$ with eigenvalue $3$ along $(1,1)$ and $-1$ along $(1,-1)$.' },
      hint: { es: 'Calcula $PDP^{-1}$ con $P = \\begin{bmatrix}1&1\\\\1&-1\\end{bmatrix}$ y $D = \\operatorname{diag}(3,-1)$.', en: 'Compute $PDP^{-1}$ with $P = \\begin{bmatrix}1&1\\\\1&-1\\end{bmatrix}$ and $D = \\operatorname{diag}(3,-1)$.' },
      check: (s, d) => [[1, 2], [2, 1]].every((row, i) => row.every((x, j) => Math.abs(d.an.Af[i][j] - x) < 1e-9)),
    },
  ],
});

// ---------------------------------------------------------------------------

function sub(k) { return String(k).split('').map((d) => SUBS[+d]).join(''); }

function diagMatrix(dec, t) {
  const I = L.identityFloat(2);
  const Pinv = dec.Pinvf, Mid = dec.Midf, P = dec.Pf;
  if (!Pinv) return I;
  if (t <= 1) return L.lerpMatrix(I, Pinv, t);
  if (t <= 2) return L.mulFloat(L.lerpMatrix(I, Mid, t - 1), Pinv);
  return L.mulFloat(L.lerpMatrix(I, P, t - 2), L.mulFloat(Mid, Pinv));
}

function classify(eig) {
  const reals = eig.eigen.filter((e) => e.real);
  const mods = eig.eigen.flatMap((e) => Array(e.alg).fill(Math.hypot(e.approx.re, e.approx.im)));
  const tol = 1e-9;
  if (!reals.length) {
    const r = mods[0];
    if (Math.abs(r - 1) < tol) return { es: 'Centro: las órbitas giran sin acercarse ni alejarse (|λ| = 1)', en: 'Centre: orbits turn without approaching or escaping (|λ| = 1)' };
    return r < 1 ? { es: 'Espiral atractora (|λ| < 1)', en: 'Attracting spiral (|λ| < 1)' } : { es: 'Espiral repulsora (|λ| > 1)', en: 'Repelling spiral (|λ| > 1)' };
  }
  const big = mods.filter((m) => m > 1 + tol).length, small = mods.filter((m) => m < 1 - tol).length;
  const neg = reals.some((e) => e.approx.re < 0) ? { es: '; un λ negativo alterna el lado', en: '; a negative λ alternates sides' } : { es: '', en: '' };
  if (big && small) return { es: `Punto de silla: una dirección crece y otra decrece${neg.es}`, en: `Saddle point: one direction grows and another shrinks${neg.en}` };
  if (small === 2) return { es: `Atractor: todas las órbitas van al origen${neg.es}`, en: `Sink: every orbit goes to the origin${neg.en}` };
  if (big === 2) return { es: `Repulsor: las órbitas se alejan del origen${neg.es}`, en: `Source: orbits move away from the origin${neg.en}` };
  return { es: `Caso límite: algún |λ| = 1 (hay vectores que no crecen ni decrecen)${neg.es}`, en: `Borderline: some |λ| = 1 (there are vectors that neither grow nor shrink)${neg.en}` };
}

