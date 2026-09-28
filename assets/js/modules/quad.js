import { createLab } from '../ui/shell.js';
import { codec, M, V } from '../ui/store.js';
import { Plane2D } from '../ui/plane2d.js';
import { card, matrixEditor, vectorEditor, flagChip, readout, animator, slider } from '../ui/controls.js';
import { h } from '../ui/dom.js';
import { renderTex } from '../ui/tex.js';
import { tr, setText } from '../ui/i18n.js';
import { entryFromNumber } from '../core/parse.js';
import * as L from '../core/linalg.js';
import { symmetricEigen } from '../core/svd.js';
import { texValue, texMatrix, texVector, fmtDecimal, scalarNumber } from '../core/format.js';
import { analyzeSquare, texCombo, presetSelect, memo, entriesKey } from './common.js';

const PRESETS = [
  { id: 'ell', label: { es: 'Elipse girada: λ = 3, 1', en: 'Rotated ellipse: λ = 3, 1' }, value: [[2, 1], [1, 2]] },
  { id: 'surd', label: { es: 'Elipse: λ = 2 ± √2', en: 'Ellipse: λ = 2 ± √2' }, value: [[3, 1], [1, 1]] },
  { id: 'circle', label: { es: 'Círculo (A = I)', en: 'Circle (A = I)' }, value: [[1, 0], [0, 1]] },
  { id: 'hyp', label: { es: 'Hipérbola: λ = 2, −3', en: 'Hyperbola: λ = 2, −3' }, value: [[1, 2], [2, -2]] },
  { id: 'xy', label: { es: 'Q = xy', en: 'Q = xy' }, value: [[0, '1/2'], ['1/2', 0]] },
  { id: 'psd', label: { es: 'Semidefinida: λ = 5, 0', en: 'Semidefinite: λ = 5, 0' }, value: [[1, 2], [2, 4]] },
  { id: 'nd', label: { es: 'Definida negativa', en: 'Negative definite' }, value: [[-2, 1], [1, -1]] },
];

const analyze = memo((S) => analyzeSquare(S));

/** Kind of a 2 × 2 symmetric matrix from the exact trace and determinant. */
function classify(an) {
  const F = an.F;
  const d = F.toNumber(an.det), t = F.toNumber(an.trace);
  if (F.isZero(an.det)) {
    if (F.isZero(an.trace)) return 'zero';
    return t > 0 ? 'psd' : 'nsd';
  }
  if (d < 0) return 'indef';
  return t > 0 ? 'pd' : 'nd';
}
const KIND_TEXT = {
  pd: { es: 'Definida positiva', en: 'Positive definite' },
  nd: { es: 'Definida negativa', en: 'Negative definite' },
  indef: { es: 'Indefinida', en: 'Indefinite' },
  psd: { es: 'Semidefinida positiva', en: 'Positive semidefinite' },
  nsd: { es: 'Semidefinida negativa', en: 'Negative semidefinite' },
  zero: { es: 'Nula', en: 'Zero' },
};

/** Points of the level set λ₁X² + λ₂Y² = k in the plane, with q₁, q₂ orthonormal (floats). */
function levelCurves(l1, l2, q1, q2, k) {
  const P = (X, Y) => [X * q1[0] + Y * q2[0], X * q1[1] + Y * q2[1]];
  const eps = 1e-12;
  const curves = []; // each: { pts } or { line: [point, dir] }
  const z1 = Math.abs(l1) < eps, z2 = Math.abs(l2) < eps;
  if (z1 && z2) return curves;
  if (z1 || z2) {
    const [l, qa, qb] = z1 ? [l2, q2, q1] : [l1, q1, q2];
    if (Math.abs(k) < eps) curves.push({ line: [[0, 0], qb] });
    else if (k / l > 0) {
      const s = Math.sqrt(k / l);
      curves.push({ line: [[s * qa[0], s * qa[1]], qb] }, { line: [[-s * qa[0], -s * qa[1]], qb] });
    }
    return curves;
  }
  if (l1 * l2 > 0) {
    if (k / l1 <= 0) return curves;
    const a = Math.sqrt(k / l1), b = Math.sqrt(k / l2);
    const pts = [];
    for (let i = 0; i <= 160; i++) { const t = (2 * Math.PI * i) / 160; pts.push(P(a * Math.cos(t), b * Math.sin(t))); }
    curves.push({ pts });
    return curves;
  }
  if (Math.abs(k) < eps) {
    const m = Math.sqrt(-l1 / l2); // Y = ±m X
    curves.push({ line: [[0, 0], P(1, m)] }, { line: [[0, 0], P(1, -m)] });
    return curves;
  }
  // Hyperbola: the variable whose eigenvalue has the sign of k carries cosh.
  const along = k / l1 > 0 ? 1 : 2;
  const la = along === 1 ? l1 : l2, lb = along === 1 ? l2 : l1;
  const a = Math.sqrt(k / la), b = Math.sqrt(-k / lb);
  for (const sgn of [1, -1]) {
    const pts = [];
    for (let i = -80; i <= 80; i++) {
      const s = (i / 80) * 3.2;
      const u = sgn * a * Math.cosh(s), v = b * Math.sinh(s);
      pts.push(along === 1 ? P(u, v) : P(v, u));
    }
    curves.push({ pts });
  }
  return curves;
}

function rgbOf(ctx, color) {
  ctx.fillStyle = '#000';
  ctx.fillStyle = color;
  const s = ctx.fillStyle;
  if (s.startsWith('#')) return [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const m = /rgba?\(([^)]+)\)/.exec(s);
  return m ? m[1].split(',').slice(0, 3).map((x) => parseFloat(x)) : [128, 128, 128];
}

createLab({
  id: 'quad',
  lead: {
    es: 'Una matriz simétrica define una forma cuadrática Q(x) = xᵀAx. Sus curvas de nivel son cónicas, y sus ejes son los vectores propios de A, que siempre son perpendiculares: el teorema espectral.',
    en: 'A symmetric matrix defines a quadratic form Q(x) = xᵀAx. Its level curves are conics, and their axes are the eigenvectors of A, which are always perpendicular: the spectral theorem.',
  },
  state: {
    S: { def: M([[2, 1], [1, 2]]), codec: codec.matrix(2, 2) },
    k: { def: V([1]), codec: codec.vector(1) },
    theta: { def: 20, codec: codec.num(0, 360) },
    t: { def: 0, codec: codec.num(0, 1) },
    show: { def: ['sign', 'levels', 'axes', 'x'], codec: codec.flags(['sign', 'levels', 'axes', 'x', 'circle']) },
  },

  build(ctx) {
    const { store } = ctx;
    const plane = new Plane2D(ctx.addView(), { range: 3.2 });
    const anim = animator({ store, key: 't', max: 1, unitsPerSecond: 0.4 });
    ctx.bar.append(anim.el);

    // Keeps the matrix symmetric: the off-diagonal entry that changed is mirrored.
    const setS = (S) => {
      const old = store.get('S');
      const next = S.map((row) => row.slice());
      if (next[0][1] !== old[0][1]) next[1][0] = next[0][1];
      else if (next[1][0] !== old[1][0]) next[0][1] = next[1][0];
      store.set({ S: next });
    };
    plane.addHandle({
      id: 'x', color: 'v', visible: () => store.get('show').includes('x'),
      get: () => { const th = (store.get('theta') * Math.PI) / 180; return [Math.cos(th), Math.sin(th)]; },
      set: ([x, y]) => { const deg = (Math.atan2(y, x) * 180) / Math.PI; store.set({ theta: ((Math.round(deg * 2) / 2) + 360) % 360 }); },
      snap: (p) => p,
    });

    // Panel -----------------------------------------------------------------------
    const editor = matrixEditor({ rows: 2, cols: 2, label: 'A =', colColors: null, get: () => store.get('S'), set: setS, name: { es: 'Matriz simétrica A', en: 'Symmetric matrix A' } });
    const entrySlider = (i, j, tex) => slider({
      label: tex, labelTex: tex, min: -4, max: 4, step: 0.1,
      get: () => store.get('S')[i][j].x,
      set: (x) => { const S = store.get('S').map((row) => row.slice()); const e = entryFromNumber(Math.round(x * 10) / 10); S[i][j] = e; S[j][i] = e; store.set({ S }); },
      format: (x) => fmtDecimal(x, 2),
    });
    const sliders = [entrySlider(0, 0, 'a'), entrySlider(0, 1, 'b'), entrySlider(1, 1, 'c')];
    const presets = presetSelect({ store, key: 'S', presets: PRESETS });
    const symNote = h('p');
    setText(symNote, { es: 'A = [[a, b], [b, c]]: al editar una entrada fuera de la diagonal se copia en su simétrica.', en: 'A = [[a, b], [b, c]]: editing an off-diagonal entry copies it to its mirror.' });
    const matrixCard = card({ title: { es: 'Matriz simétrica', en: 'Symmetric matrix' }, body: [editor.el, ...sliders.map((s) => s.el), presets.el, symNote] });

    const kEditor = vectorEditor({ n: 1, label: 'Q(\\mathbf{x}) = ', color: 'var(--c-det)', get: () => store.get('k'), set: (k) => store.set({ k }), name: { es: 'Nivel', en: 'Level' } });
    const chips = [
      flagChip(store, 'show', 'sign', { es: 'Signo de Q', en: 'Sign of Q' }, 'var(--c-det)'),
      flagChip(store, 'show', 'levels', { es: 'Curvas de nivel', en: 'Level curves' }, 'var(--c-w)'),
      flagChip(store, 'show', 'axes', { es: 'Ejes principales', en: 'Principal axes' }, 'var(--c-eig)'),
      flagChip(store, 'show', 'x', { es: 'Vector unitario x', en: 'Unit vector x' }, 'var(--c-v)'),
      flagChip(store, 'show', 'circle', { es: 'Círculo y su imagen', en: 'Circle and its image' }, 'var(--muted)'),
    ];
    const showCard = card({ title: { es: 'Mostrar', en: 'Show' }, body: [kEditor.el, h('div', { class: 'chip-row' }, chips.map((c) => c.el))] });

    // Rayleigh gauge
    const gaugeMarker = h('span', { style: { position: 'absolute', top: '-3px', width: '3px', height: '14px', background: 'var(--c-v)', borderRadius: '2px', transform: 'translateX(-1px)' } });
    const gaugeLo = h('span', { class: 'mono', style: { fontSize: '11px', color: 'var(--muted)' } });
    const gaugeHi = h('span', { class: 'mono', style: { fontSize: '11px', color: 'var(--muted)' } });
    const gauge = h('div', null,
      h('div', { style: { position: 'relative', height: '8px', borderRadius: '4px', background: 'linear-gradient(90deg, var(--c-eig), var(--c-det))', margin: '10px 2px 4px', opacity: 0.85 } }, gaugeMarker),
      h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, gaugeLo, gaugeHi));

    const r = {
      form: readout({ es: 'Forma cuadrática', en: 'Quadratic form' }, { block: true }),
      eig: readout({ es: 'Valores y vectores propios', en: 'Eigenvalues and eigenvectors' }, { block: true }),
      spec: readout({ es: 'Descomposición espectral', en: 'Spectral decomposition' }, { block: true }),
      axes: readout({ es: 'En los ejes principales', en: 'In the principal axes' }, { block: true }),
      kind: readout({ es: 'Clasificación', en: 'Classification' }, { block: true }),
      level: readout({ es: 'Curva de nivel', en: 'Level curve' }, { block: true }),
      ray: readout({ es: 'Cociente de Rayleigh', en: 'Rayleigh quotient' }, { block: true }),
    };
    r.ray.el.append(gauge);
    const resultsCard = card({ title: { es: 'Análisis exacto', en: 'Exact analysis' }, body: [h('div', { class: 'readouts' }, Object.values(r).map((x) => x.el))] });
    ctx.panel.append(matrixCard.el, showCard.el, resultsCard.el);

    // Drawing -------------------------------------------------------------------------
    let cur = null;
    const heat = document.createElement('canvas');
    const hctx = heat.getContext('2d');

    function drawSign(g, c) {
      const step = 4;
      const W = Math.ceil(g.p.w / step), H = Math.ceil(g.p.h / step);
      if (heat.width !== W || heat.height !== H) { heat.width = W; heat.height = H; }
      const img = hctx.createImageData(W, H);
      const pos = rgbOf(hctx, g.c.det), neg = rgbOf(hctx, g.c.i);
      const [[a, b], [, cc]] = c.Sf;
      const scale = Math.max(Math.abs(c.l1), Math.abs(c.l2), 1e-9);
      for (let py = 0; py < H; py++) {
        for (let px = 0; px < W; px++) {
          const [x, y] = g.p.toWorld((px + 0.5) * step, (py + 0.5) * step);
          const q = a * x * x + 2 * b * x * y + cc * y * y;
          const col = q >= 0 ? pos : neg;
          const alpha = Math.tanh(Math.abs(q) / (2 * scale)) * 0.2;
          const o = (py * W + px) * 4;
          img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = Math.round(alpha * 255);
        }
      }
      hctx.putImageData(img, 0, 0);
      const x2 = g.ctx;
      x2.save();
      x2.imageSmoothingEnabled = true;
      x2.drawImage(heat, 0, 0, W * step, H * step);
      x2.restore();
    }

    function drawCurves(g, curves, style) {
      for (const cv of curves) {
        if (cv.pts) g.polyline(cv.pts, style);
        else g.infiniteLine(cv.line[0], cv.line[1], style);
      }
    }

    plane.setDraw((g) => {
      if (!cur) return;
      const c = cur;
      const { show, t } = c;
      if (show.includes('sign')) drawSign(g, c);
      // Grid rotating from the standard axes to the principal axes.
      const phi = Math.atan2(c.q1[1], c.q1[0]);
      let phiT = phi;
      while (phiT > Math.PI / 2) phiT -= Math.PI;
      while (phiT < -Math.PI / 2) phiT += Math.PI;
      if (t > 0) {
        const ang = t * phiT;
        const R = [[Math.cos(ang), -Math.sin(ang)], [Math.sin(ang), Math.cos(ang)]];
        g.backgroundGrid({ color: 'transparent', ticks: false });
        g.transformedGrid(R, { color: g.c.tgrid, alpha: 0.55, axes: true, axisColor: g.c.eig, width: 1 });
      } else g.backgroundGrid();
      if (show.includes('levels')) {
        const k = c.kf;
        const base = Math.abs(k) > 1e-12 ? Math.abs(k) : 1;
        for (let m = 1; m <= 6; m++) {
          for (const sgn of [1, -1]) {
            const lev = sgn * m * base;
            if (Math.abs(lev - k) < 1e-12) continue;
            drawCurves(g, levelCurves(c.l1, c.l2, c.q1, c.q2, lev), { color: sgn > 0 ? g.c.det : g.c.i, width: 1, alpha: 0.4 });
          }
        }
        drawCurves(g, levelCurves(c.l1, c.l2, c.q1, c.q2, 0), { color: g.c.muted, width: 1, alpha: 0.6, dash: [4, 5] });
        drawCurves(g, levelCurves(c.l1, c.l2, c.q1, c.q2, k), { color: g.c.w, width: 3 });
      }
      if (show.includes('axes')) {
        g.infiniteLine([0, 0], c.q1, { color: g.c.eig, width: 1.5, dash: [2, 6] });
        g.infiniteLine([0, 0], c.q2, { color: g.c.eig, width: 1.5, dash: [2, 6] });
        g.arrow([0, 0], c.q1, { color: g.c.eig, width: 3 });
        g.arrow([0, 0], c.q2, { color: g.c.eig, width: 3 });
        g.rightAngle([0, 0], c.q1, c.q2, { color: g.c.eig, size: 14 });
        g.mathLabel(c.q1, 'q', { color: g.c.eig, sub: 1, away: c.q2 });
        g.mathLabel(c.q2, 'q', { color: g.c.eig, sub: 2, away: c.q1 });
      }
      if (show.includes('circle')) {
        g.curve((s) => [Math.cos(s), Math.sin(s)], 0, 2 * Math.PI, 120, { color: g.c.muted, width: 1.5, dash: [5, 5] });
        g.ellipse(c.Sf, { color: g.c.muted, width: 2 });
      }
      if (show.includes('x')) {
        const th = (c.theta * Math.PI) / 180;
        const x = [Math.cos(th), Math.sin(th)];
        const Ax = L.mv2(c.Sf, ...x);
        g.arrow([0, 0], Ax, { color: g.c.w, width: 2.5, alpha: 0.8 });
        g.text(Ax, 'Ax', { color: g.c.w, offset: [10, -12], font: '"KaTeX_Math", serif', size: 15, italic: true });
        g.arrow([0, 0], x, { color: g.c.v, width: 3.5 });
        g.text(x, `xᵀAx = ${fmtDecimal(L.dotFloat(x, Ax), 3)}`, { color: g.c.v, offset: [12, 16], weight: 600 });
      }
    });

    function render(state) {
      const an = analyze(entriesKey(state.S), state.S);
      const F = an.F;
      const Sf = an.Af;
      const { values, vectors } = symmetricEigen(Sf);
      // q₁ for the larger eigenvalue; orient so that det[q₁ q₂] = 1.
      const q1 = L.normalize(vectors[0]);
      const q2 = [-q1[1], q1[0]];
      const kE = state.k[0];
      cur = { an, Sf, l1: values[0], l2: values[1], q1, q2, kf: kE.x, show: state.show, theta: state.theta, t: state.t };
      plane.requestRender();
      editor.update(); kEditor.update(); anim.update();
      sliders.forEach((s) => s.update());
      chips.forEach((ch) => ch.update());

      const [[a, b], [, c]] = an.M;
      const two = F.fromInt(2);
      r.form.set(`Q(x, y) = \\mathbf{x}^{\\mathsf T}A\\mathbf{x} = ${texCombo([a, F.mul(two, b), c], ['x^2', 'xy', 'y^2'], { zero: '0' })}`);

      // Eigenvalues (exact when possible) and orthogonality.
      const eig = an.eig;
      const reals = eig.eigen.filter((e) => e.real);
      let eigTex = '', specTex = null, axesTex;
      if (reals.length === 1 && reals[0].alg === 2) {
        eigTex = `\\lambda_1 = \\lambda_2 = ${texValue(reals[0].value)}`;
        specTex = `A = ${texValue(reals[0].value)}\\,I`;
        axesTex = `Q = ${texValue(reals[0].value)}\\,(X^2 + Y^2)`;
      } else if (reals.length === 2) {
        const [e1, e2] = reals[0].approx.re >= reals[1].approx.re ? reals : [reals[1], reals[0]];
        const G = e1.field;
        const v1 = e1.vectors[0], v2 = e2.vectors[0];
        const dot = L.dot(v1, v2, G);
        eigTex = `\\begin{gathered}\\lambda_1 = ${texValue(e1.value)},\\; \\mathbf{v}_1 = ${texVector(v1)};\\quad \\lambda_2 = ${texValue(e2.value)},\\; \\mathbf{v}_2 = ${texVector(v2)} \\\\ \\mathbf{v}_1\\cdot\\mathbf{v}_2 = ${texValue(dot)}\\end{gathered}`;
        if (G.exact) {
          const proj = (v) => { const n2 = L.dot(v, v, G); return v.map((x) => v.map((y) => G.div(G.mul(x, y), n2))); };
          specTex = `A = ${texValue(e1.value)}\\,${texMatrix(proj(v1))} ${scalarNumber(e2.value) < 0 ? '-' : '+'} ${texValue(scalarNumber(e2.value) < 0 ? G.neg(e2.value) : e2.value)}\\,${texMatrix(proj(v2))}`;
        }
        axesTex = `Q = ${texCombo([e1.value, e2.value], ['X^2', 'Y^2'], { zero: '0' })}`;
      } else {
        eigTex = '\\text{—}';
        axesTex = '\\text{—}';
      }
      r.eig.set(eigTex, { es: 'Para una matriz simétrica los valores propios son reales y los vectores propios de valores distintos son perpendiculares.', en: 'For a symmetric matrix the eigenvalues are real and eigenvectors of different eigenvalues are perpendicular.' });
      r.spec.show(!!specTex);
      if (specTex) r.spec.set(specTex, { es: 'A = λ₁ q₁q₁ᵀ + λ₂ q₂q₂ᵀ: cada matriz es la proyección ortogonal sobre un eje principal.', en: 'A = λ₁ q₁q₁ᵀ + λ₂ q₂q₂ᵀ: each matrix is the orthogonal projection onto a principal axis.' });
      r.axes.set(axesTex, { es: 'X, Y son las coordenadas en la base ortonormal {q₁, q₂}: al girar los ejes desaparece el término cruzado xy. Reproduce la animación.', en: 'X, Y are the coordinates in the orthonormal basis {q₁, q₂}: rotating the axes removes the cross term xy. Play the animation.' });

      // Classification: eigenvalues, Sylvester and completing the square.
      const kind = classify(an);
      const badgeCls = kind === 'pd' || kind === 'nd' ? 'badge--ok' : kind === 'indef' ? 'badge--danger' : '';
      let square;
      if (!F.isZero(a)) {
        const t1 = F.div(b, a), t2 = F.div(an.det, a);
        square = `Q = ${texValue(a)}\\left(x ${scalarNumber(t1) < 0 ? '-' : '+'} ${F.isZero(t1) ? '0' : texValue(scalarNumber(t1) < 0 ? F.neg(t1) : t1)}\\,y\\right)^2 ${scalarNumber(t2) < 0 ? '-' : '+'} ${texValue(scalarNumber(t2) < 0 ? F.neg(t2) : t2)}\\,y^2`;
      } else if (!F.isZero(c)) {
        const t1 = F.div(b, c), t2 = F.div(an.det, c);
        square = `Q = ${texValue(c)}\\left(y ${scalarNumber(t1) < 0 ? '-' : '+'} ${texValue(scalarNumber(t1) < 0 ? F.neg(t1) : t1)}\\,x\\right)^2 ${scalarNumber(t2) < 0 ? '-' : '+'} ${texValue(scalarNumber(t2) < 0 ? F.neg(t2) : t2)}\\,x^2`;
      } else square = `Q = 2\\,${texValue(b)}\\,xy`;
      const wrap = h('div');
      wrap.innerHTML = `<span class="badge ${badgeCls}">${tr(KIND_TEXT[kind])}</span>`;
      const texEl = h('div', { style: { marginTop: '6px' } });
      wrap.append(texEl);
      r.kind.set(wrap, {
        es: `Criterio de Sylvester: a = ${fmtDecimal(F.toNumber(a), 4)}, det A = ${fmtDecimal(F.toNumber(an.det), 4)}. Definida positiva ⇔ a > 0 y det A > 0.`,
        en: `Sylvester’s criterion: a = ${fmtDecimal(F.toNumber(a), 4)}, det A = ${fmtDecimal(F.toNumber(an.det), 4)}. Positive definite ⇔ a > 0 and det A > 0.`,
      });
      renderTex(texEl, square);

      // Level set description.
      const k = kE.x, l1 = values[0], l2 = values[1];
      const eps = 1e-12;
      let levelText;
      const kTex = texValue(kE.q || kE.x);
      if (Math.abs(l1) < eps && Math.abs(l2) < eps) levelText = Math.abs(k) < eps ? { es: 'Todo el plano (Q ≡ 0).', en: 'The whole plane (Q ≡ 0).' } : { es: 'Vacía: Q ≡ 0.', en: 'Empty: Q ≡ 0.' };
      else if (Math.abs(l1) < eps || Math.abs(l2) < eps) {
        const l = Math.abs(l1) < eps ? l2 : l1;
        levelText = Math.abs(k) < eps ? { es: 'Una recta (doble): el eje del valor propio 0.', en: 'A (double) line: the axis of the eigenvalue 0.' }
          : k / l > 0 ? { es: 'Dos rectas paralelas (cónica degenerada).', en: 'Two parallel lines (degenerate conic).' } : { es: 'Vacía.', en: 'Empty.' };
      } else if (l1 * l2 > 0) {
        levelText = Math.abs(k) < eps ? { es: 'Solo el origen.', en: 'Only the origin.' }
          : k / l1 > 0 ? { es: `Una elipse con semiejes √(k/λ₁) = ${fmtDecimal(Math.sqrt(k / l1), 3)} sobre q₁ y √(k/λ₂) = ${fmtDecimal(Math.sqrt(k / l2), 3)} sobre q₂.`, en: `An ellipse with semi-axes √(k/λ₁) = ${fmtDecimal(Math.sqrt(k / l1), 3)} along q₁ and √(k/λ₂) = ${fmtDecimal(Math.sqrt(k / l2), 3)} along q₂.` }
            : { es: 'Vacía: Q no toma valores de ese signo.', en: 'Empty: Q never takes values of that sign.' };
      } else {
        levelText = Math.abs(k) < eps ? { es: 'Dos rectas que se cortan: las asíntotas.', en: 'Two crossing lines: the asymptotes.' }
          : { es: `Una hipérbola cuyo eje transversal va sobre ${k / l1 > 0 ? 'q₁' : 'q₂'}.`, en: `A hyperbola whose transverse axis lies along ${k / l1 > 0 ? 'q₁' : 'q₂'}.` };
      }
      r.level.set(`Q(\\mathbf{x}) = ${kTex}`, levelText);

      // Rayleigh quotient.
      const th = (state.theta * Math.PI) / 180;
      const x = [Math.cos(th), Math.sin(th)];
      const R = L.dotFloat(x, L.mv2(Sf, ...x));
      r.ray.set(`\\begin{gathered}R(\\mathbf{x}) = \\frac{\\mathbf{x}^{\\mathsf T}A\\mathbf{x}}{\\mathbf{x}^{\\mathsf T}\\mathbf{x}} = ${fmtDecimal(R, 4, { unicodeMinus: false })} \\\\ \\lambda_{\\min} = ${fmtDecimal(l2, 4, { unicodeMinus: false })} \\le R \\le ${fmtDecimal(l1, 4, { unicodeMinus: false })} = \\lambda_{\\max}\\end{gathered}`,
        { es: 'Gira x: el máximo y el mínimo de Q sobre el círculo unidad son los valores propios y se alcanzan en los ejes principales.', en: 'Turn x: the maximum and minimum of Q on the unit circle are the eigenvalues, reached on the principal axes.' });
      const frac = l1 - l2 > 1e-12 ? (R - l2) / (l1 - l2) : 0.5;
      gaugeMarker.style.left = `${Math.max(0, Math.min(1, frac)) * 100}%`;
      gaugeLo.textContent = `λmin = ${fmtDecimal(l2, 3)}`;
      gaugeHi.textContent = `λmax = ${fmtDecimal(l1, 3)}`;
      r.ray.show(state.show.includes('x'));

      ctx.setLegend([
        state.show.includes('sign') && { color: 'var(--c-det)', kind: 'area', label: { es: 'Q > 0', en: 'Q > 0' } },
        state.show.includes('sign') && { color: 'var(--c-i)', kind: 'area', label: { es: 'Q < 0', en: 'Q < 0' } },
        state.show.includes('levels') && { color: 'var(--c-w)', tex: `Q = ${kTex}` },
        state.show.includes('axes') && { color: 'var(--c-eig)', label: { es: 'ejes principales q₁, q₂', en: 'principal axes q₁, q₂' } },
        state.show.includes('x') && { color: 'var(--c-v)', tex: '\\mathbf{x}' },
      ]);
      return { an, kind, R, l1, l2, state };
    }

    return { render, snapshot: () => plane.snapshot(), togglePlay: () => anim.toggle(), onReset: () => { anim.pause(); plane.resetView(); } };
  },

  learn: {
    what: {
      es: `<p>Una <strong>forma cuadrática</strong> es un polinomio homogéneo de grado 2, como $Q(x, y) = ax^2 + 2bxy + cy^2$. Se escribe $Q(\\mathbf{x}) = \\mathbf{x}^{\\mathsf T}A\\mathbf{x}$ con la matriz <em>simétrica</em> $A = \\begin{bmatrix}a&b\\\\b&c\\end{bmatrix}$. El color de fondo indica el signo de $Q$ y las curvas son sus <strong>curvas de nivel</strong> $Q = k$: elipses, hipérbolas o pares de rectas.</p>
<p>El <strong>teorema espectral</strong> dice que una matriz simétrica tiene valores propios reales y una base ortonormal de vectores propios $\\mathbf{q}_1, \\mathbf{q}_2$: los <em>ejes principales</em>. En las coordenadas $X, Y$ de esa base el término cruzado desaparece, $Q = \\lambda_1X^2 + \\lambda_2Y^2$. Así los signos de los valores propios deciden la forma de las curvas.</p>
<p>Sobre el círculo unidad, $Q(\\mathbf{x}) = \\mathbf{x}^{\\mathsf T}A\\mathbf{x}$ (el <strong>cociente de Rayleigh</strong>) oscila entre $\\lambda_{\\min}$ y $\\lambda_{\\max}$, y alcanza esos extremos justo en los ejes principales. Es la puerta de entrada a la SVD y a los problemas de optimización.</p>`,
      en: `<p>A <strong>quadratic form</strong> is a homogeneous polynomial of degree 2, such as $Q(x, y) = ax^2 + 2bxy + cy^2$. It is written $Q(\\mathbf{x}) = \\mathbf{x}^{\\mathsf T}A\\mathbf{x}$ with the <em>symmetric</em> matrix $A = \\begin{bmatrix}a&b\\\\b&c\\end{bmatrix}$. The background colour shows the sign of $Q$ and the curves are its <strong>level curves</strong> $Q = k$: ellipses, hyperbolas or pairs of lines.</p>
<p>The <strong>spectral theorem</strong> says that a symmetric matrix has real eigenvalues and an orthonormal basis of eigenvectors $\\mathbf{q}_1, \\mathbf{q}_2$: the <em>principal axes</em>. In the coordinates $X, Y$ of that basis the cross term disappears, $Q = \\lambda_1X^2 + \\lambda_2Y^2$. So the signs of the eigenvalues decide the shape of the curves.</p>
<p>On the unit circle, $Q(\\mathbf{x}) = \\mathbf{x}^{\\mathsf T}A\\mathbf{x}$ (the <strong>Rayleigh quotient</strong>) moves between $\\lambda_{\\min}$ and $\\lambda_{\\max}$, and reaches those extremes exactly on the principal axes. It is the doorway to the SVD and to optimization problems.</p>`,
    },
    prompts: {
      es: [
        'Mueve el deslizador $b$ desde 0: ¿cómo giran los ejes principales? ¿Siguen siendo perpendiculares?',
        'Haz $\\det A$ negativo. ¿Qué forma tienen ahora las curvas de nivel? ¿Qué pasa con la curva $Q = 0$?',
        'Con el ejemplo «Semidefinida», ¿qué tipo de curva es $Q = 1$? ¿Qué dirección no cambia $Q$?',
        'Gira el vector $\\mathbf{x}$ y observa $\\mathbf{x}^{\\mathsf T}A\\mathbf{x}$. ¿En qué ángulos está el máximo? ¿Hacia dónde apunta $A\\mathbf{x}$ allí?',
        'Reproduce la animación: al girar la cuadrícula hasta los ejes principales, ¿qué ecuación tiene la cónica en las nuevas coordenadas?',
      ],
      en: [
        'Move the slider $b$ away from 0: how do the principal axes turn? Are they still perpendicular?',
        'Make $\\det A$ negative. What shape do the level curves have now? What happens to the curve $Q = 0$?',
        'With the “Semidefinite” example, what kind of curve is $Q = 1$? Along which direction does $Q$ not change?',
        'Turn the vector $\\mathbf{x}$ and watch $\\mathbf{x}^{\\mathsf T}A\\mathbf{x}$. At which angles is the maximum? Where does $A\\mathbf{x}$ point there?',
        'Play the animation: after the grid turns to the principal axes, what is the equation of the conic in the new coordinates?',
      ],
    },
    formal: [
      {
        kind: 'definition',
        title: { es: 'Forma cuadrática', en: 'Quadratic form' },
        body: {
          es: '<p>Una forma cuadrática en $\\mathbb{R}^n$ es $Q(\\mathbf{x}) = \\mathbf{x}^{\\mathsf T}A\\mathbf{x}$ con $A$ simétrica. (Cualquier $B$ da la misma forma que su parte simétrica $\\tfrac12(B + B^{\\mathsf T})$.) $Q$ es <em>definida positiva</em> si $Q(\\mathbf{x}) > 0$ para todo $\\mathbf{x}\\neq\\mathbf{0}$, <em>semidefinida positiva</em> si $Q\\ge 0$, e <em>indefinida</em> si toma valores de ambos signos.</p>',
          en: '<p>A quadratic form on $\\mathbb{R}^n$ is $Q(\\mathbf{x}) = \\mathbf{x}^{\\mathsf T}A\\mathbf{x}$ with $A$ symmetric. (Any $B$ gives the same form as its symmetric part $\\tfrac12(B + B^{\\mathsf T})$.) $Q$ is <em>positive definite</em> if $Q(\\mathbf{x}) > 0$ for every $\\mathbf{x}\\neq\\mathbf{0}$, <em>positive semidefinite</em> if $Q\\ge 0$, and <em>indefinite</em> if it takes values of both signs.</p>',
        },
      },
      {
        kind: 'theorem',
        title: { es: 'Teorema espectral', en: 'Spectral theorem' },
        body: {
          es: '<p>Si $A\\in\\mathbb{R}^{n\\times n}$ es simétrica, sus valores propios son reales y existe una matriz ortogonal $Q$ con $A = Q\\Lambda Q^{\\mathsf T} = \\sum_i \\lambda_i\\,\\mathbf{q}_i\\mathbf{q}_i^{\\mathsf T}$. <em>Idea:</em> si $A\\mathbf{u} = \\lambda\\mathbf{u}$ y $A\\mathbf{v} = \\mu\\mathbf{v}$ con $\\lambda\\neq\\mu$, entonces $\\lambda\\,\\mathbf{u}\\cdot\\mathbf{v} = (A\\mathbf{u})\\cdot\\mathbf{v} = \\mathbf{u}\\cdot(A\\mathbf{v}) = \\mu\\,\\mathbf{u}\\cdot\\mathbf{v}$, luego $\\mathbf{u}\\perp\\mathbf{v}$. En $2\\times 2$ el discriminante $\\left(\\tfrac{a-c}{2}\\right)^2 + b^2\\ge 0$ muestra que las raíces son reales.</p>',
          en: '<p>If $A\\in\\mathbb{R}^{n\\times n}$ is symmetric, its eigenvalues are real and there is an orthogonal matrix $Q$ with $A = Q\\Lambda Q^{\\mathsf T} = \\sum_i \\lambda_i\\,\\mathbf{q}_i\\mathbf{q}_i^{\\mathsf T}$. <em>Idea:</em> if $A\\mathbf{u} = \\lambda\\mathbf{u}$ and $A\\mathbf{v} = \\mu\\mathbf{v}$ with $\\lambda\\neq\\mu$, then $\\lambda\\,\\mathbf{u}\\cdot\\mathbf{v} = (A\\mathbf{u})\\cdot\\mathbf{v} = \\mathbf{u}\\cdot(A\\mathbf{v}) = \\mu\\,\\mathbf{u}\\cdot\\mathbf{v}$, so $\\mathbf{u}\\perp\\mathbf{v}$. In the $2\\times 2$ case the discriminant $\\left(\\tfrac{a-c}{2}\\right)^2 + b^2\\ge 0$ shows the roots are real.</p>',
        },
      },
      {
        kind: 'theorem',
        title: { es: 'Ejes principales y clasificación', en: 'Principal axes and classification' },
        body: {
          es: '<p>Con el cambio ortogonal $\\mathbf{x} = Q\\mathbf{y}$, $Q(\\mathbf{x}) = \\sum_i\\lambda_i y_i^2$. Por tanto $A$ es definida positiva si y solo si todos sus valores propios son positivos (análogamente para los demás casos). En $\\mathbb{R}^2$ y para $k\\neq 0$, la curva $Q = k$ es una elipse si $\\det A > 0$ y $k$ tiene el signo de $\\operatorname{tr}A$, una hipérbola si $\\det A < 0$, y un par de rectas paralelas (o vacía) si $\\det A = 0$.</p>',
          en: '<p>With the orthogonal change $\\mathbf{x} = Q\\mathbf{y}$, $Q(\\mathbf{x}) = \\sum_i\\lambda_i y_i^2$. Hence $A$ is positive definite if and only if all its eigenvalues are positive (likewise for the other cases). In $\\mathbb{R}^2$ and for $k\\neq 0$, the curve $Q = k$ is an ellipse if $\\det A > 0$ and $k$ has the sign of $\\operatorname{tr}A$, a hyperbola if $\\det A < 0$, and a pair of parallel lines (or empty) if $\\det A = 0$.</p>',
        },
      },
      {
        kind: 'theorem',
        title: { es: 'Criterio de Sylvester', en: 'Sylvester’s criterion' },
        body: {
          es: '<p>Una matriz simétrica es definida positiva si y solo si todos sus menores principales iniciales son positivos: $\\det A_1 > 0,\\ \\dots,\\ \\det A_n > 0$, donde $A_k$ es la submatriz $k\\times k$ de la esquina superior izquierda. En $2\\times 2$: $a > 0$ y $ac - b^2 > 0$; es lo mismo que completar el cuadrado $Q = a\\left(x + \\tfrac{b}{a}y\\right)^2 + \\tfrac{\\det A}{a}\\,y^2$.</p>',
          en: '<p>A symmetric matrix is positive definite if and only if all its leading principal minors are positive: $\\det A_1 > 0,\\ \\dots,\\ \\det A_n > 0$, where $A_k$ is the top-left $k\\times k$ submatrix. For $2\\times 2$: $a > 0$ and $ac - b^2 > 0$; this is the same as completing the square $Q = a\\left(x + \\tfrac{b}{a}y\\right)^2 + \\tfrac{\\det A}{a}\\,y^2$.</p>',
        },
      },
      {
        kind: 'theorem',
        title: { es: 'Cociente de Rayleigh', en: 'Rayleigh quotient' },
        body: {
          es: '<p>Para $A$ simétrica y $\\mathbf{x}\\neq\\mathbf{0}$, $\\lambda_{\\min}\\le R(\\mathbf{x}) = \\dfrac{\\mathbf{x}^{\\mathsf T}A\\mathbf{x}}{\\mathbf{x}^{\\mathsf T}\\mathbf{x}}\\le\\lambda_{\\max}$, con igualdad exactamente en los vectores propios correspondientes. <em>Demostración:</em> en la base $\\{\\mathbf{q}_i\\}$, $R = \\sum_i\\lambda_i y_i^2/\\sum_i y_i^2$ es un promedio ponderado de los $\\lambda_i$.</p>',
          en: '<p>For symmetric $A$ and $\\mathbf{x}\\neq\\mathbf{0}$, $\\lambda_{\\min}\\le R(\\mathbf{x}) = \\dfrac{\\mathbf{x}^{\\mathsf T}A\\mathbf{x}}{\\mathbf{x}^{\\mathsf T}\\mathbf{x}}\\le\\lambda_{\\max}$, with equality exactly at the corresponding eigenvectors. <em>Proof:</em> in the basis $\\{\\mathbf{q}_i\\}$, $R = \\sum_i\\lambda_i y_i^2/\\sum_i y_i^2$ is a weighted average of the $\\lambda_i$.</p>',
        },
      },
    ],
  },

  challenges: [
    {
      id: 'ell45',
      title: { es: 'Elipse diagonal', en: 'Diagonal ellipse' },
      text: { es: 'Haz que $Q = 1$ sea una elipse con ejes sobre las rectas $y = \\pm x$ y semiejes $1$ y $\\tfrac12$.', en: 'Make $Q = 1$ an ellipse with axes on the lines $y = \\pm x$ and semi-axes $1$ and $\\tfrac12$.' },
      hint: { es: 'Los valores propios deben ser $1$ y $4$, con vectores propios $(1, 1)$ y $(1, -1)$: $A = \\tfrac{1+4}{2}I \\pm \\tfrac{4-1}{2}\\begin{bmatrix}0&1\\\\1&0\\end{bmatrix}$.', en: 'The eigenvalues must be $1$ and $4$, with eigenvectors $(1, 1)$ and $(1, -1)$: $A = \\tfrac{1+4}{2}I \\pm \\tfrac{4-1}{2}\\begin{bmatrix}0&1\\\\1&0\\end{bmatrix}$.' },
      setup: (store) => store.set({ S: M([[1, 0], [0, 1]]), k: V([1]), show: ['sign', 'levels', 'axes'] }),
      check: (s) => {
        const [[a, b], [, c]] = s.S.map((row) => row.map((e) => e.x));
        return Math.abs(a - 2.5) < 1e-9 && Math.abs(c - 2.5) < 1e-9 && Math.abs(Math.abs(b) - 1.5) < 1e-9 && Math.abs(s.k[0].x - 1) < 1e-12;
      },
    },
    {
      id: 'asym',
      title: { es: 'Asíntotas y = ±x', en: 'Asymptotes y = ±x' },
      text: { es: 'Consigue una forma indefinida cuya curva $Q = 0$ sean las rectas $y = x$ e $y = -x$.', en: 'Get an indefinite form whose curve $Q = 0$ is the pair of lines $y = x$ and $y = -x$.' },
      hint: { es: 'Sustituye $y = \\pm x$ en $ax^2 + 2bxy + cy^2 = 0$.', en: 'Substitute $y = \\pm x$ in $ax^2 + 2bxy + cy^2 = 0$.' },
      setup: (store) => store.set({ S: M([[2, 1], [1, 2]]), show: ['sign', 'levels', 'axes'] }),
      check: (s, d) => {
        const [[a, b], [, c]] = s.S.map((row) => row.map((e) => e.x));
        return d.kind === 'indef' && Math.abs(b) < 1e-12 && Math.abs(a + c) < 1e-12;
      },
    },
    {
      id: 'rmin',
      title: { es: 'El mínimo de Rayleigh', en: 'Rayleigh minimum' },
      text: { es: 'Con $A = \\begin{bmatrix}2&1\\\\1&2\\end{bmatrix}$, gira el vector unitario $\\mathbf{x}$ hasta que $\\mathbf{x}^{\\mathsf T}A\\mathbf{x}$ sea mínimo.', en: 'With $A = \\begin{bmatrix}2&1\\\\1&2\\end{bmatrix}$, turn the unit vector $\\mathbf{x}$ until $\\mathbf{x}^{\\mathsf T}A\\mathbf{x}$ is minimal.' },
      hint: { es: 'El mínimo es el menor valor propio, $\\lambda = 1$, y se alcanza en su eje principal.', en: 'The minimum is the smallest eigenvalue, $\\lambda = 1$, reached on its principal axis.' },
      setup: (store) => store.set({ S: M([[2, 1], [1, 2]]), theta: 20, show: ['sign', 'levels', 'axes', 'x'] }),
      check: (s, d) => [[2, 1], [1, 2]].every((row, i) => row.every((x, j) => s.S[i][j].x === x)) && Math.abs(d.R - 1) < 1e-3,
    },
    {
      id: 'psd',
      title: { es: 'Semidefinida sin ceros', en: 'Semidefinite, no zeros' },
      text: { es: 'Encuentra una matriz semidefinida positiva, pero no definida, con $a$, $b$ y $c$ distintos de cero.', en: 'Find a positive semidefinite, but not definite, matrix with $a$, $b$ and $c$ all non-zero.' },
      hint: { es: 'Necesitas $\\det A = ac - b^2 = 0$ y $a + c > 0$.', en: 'You need $\\det A = ac - b^2 = 0$ and $a + c > 0$.' },
      setup: (store) => store.set({ S: M([[1, 0], [0, 1]]), show: ['sign', 'levels', 'axes'] }),
      check: (s, d) => d.kind === 'psd' && s.S.every((row) => row.every((e) => Math.abs(e.x) > 1e-12)),
    },
  ],
});
