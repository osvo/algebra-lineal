import { createLab } from '../ui/shell.js';
import { codec, V } from '../ui/store.js';
import { Plane2D } from '../ui/plane2d.js';
import { card, vectorEditor, flagChip, readout, segmented, selectBox, slider, button } from '../ui/controls.js';
import { h } from '../ui/dom.js';
import { tr, setText } from '../ui/i18n.js';
import { entryFromNumber, makeEntry } from '../core/parse.js';
import * as L from '../core/linalg.js';
import { RationalField } from '../core/fields.js';
import { texValue, texMatrix, texVector, texPoly, fmtDecimal, scalarNumber } from '../core/format.js';
import { texCombo, memo, spanOp } from './common.js';
import { basisPolys, operatorMatrix, vandermonde, evalAsc } from '../core/polyspace.js';

const COLORS = ['i', 'j', 'k', 'w'];
const BASES = ['mono', 'taylor', 'lagrange', 'legendre'];
const OPS = ['D', 'S', 'xD'];

const texP = (asc, x = 'x') => texPoly(asc.slice().reverse(), x);
const evalF = evalAsc;

const analyze = memo((st) => {
  const n = st.deg, N = n + 1;
  const pts = st.pts.slice(0, N).map(([x, y]) => [entryFromNumber(x), entryFromNumber(y)]);
  const all = L.fieldMatrix([st.a.slice(0, N), st.c, pts.map((p) => p[0]), pts.map((p) => p[1])]);
  const F = all.F;
  const a = all.M[0], c = all.M[1][0], nodes = all.M[2], ys = all.M[3];
  const B = basisPolys(st.basis, n, F, { c, nodes });
  const P = B ? L.transpose(B) : null; // columns: basis polynomials in monomial coordinates
  const Pinv = P ? L.inverse(P, F) : null;
  const coords = Pinv ? L.matVec(Pinv, a, F) : null;
  const TE = operatorMatrix(st.op, n, F);
  const TB = Pinv ? L.matMul(L.matMul(Pinv, TE, F), P, F) : null;
  const Tp = L.matVec(TE, a, F);
  // Interpolation: Vandermonde system V a = y.
  const Vm = vandermonde(nodes, F);
  const interp = L.solve(Vm, ys, F);
  let detV = F.one;
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) detV = F.mul(detV, F.sub(nodes[j], nodes[i]));
  return { F, n, N, a, c, nodes, ys, B, P, Pinv, coords, TE, TB, Tp, Vm, interp, detV };
});
const keyOf = (s) => JSON.stringify([s.deg, s.basis, s.op, s.a.map((e) => e.text), s.c.map((e) => e.text), s.pts]);

createLab({
  id: 'poly',
  lead: {
    es: 'Los polinomios de grado ≤ n también son vectores: se suman, se escalan y tienen coordenadas en una base. La derivada es una matriz, e interpolar es resolver un sistema lineal.',
    en: 'Polynomials of degree ≤ n are vectors too: they add, they scale and they have coordinates in a basis. The derivative is a matrix, and interpolating means solving a linear system.',
  },
  state: {
    mode: { def: 'coords', codec: codec.enum(['coords', 'op', 'interp']) },
    deg: { def: 2, codec: codec.int(2, 3) },
    a: { def: V([1, 2, -1, 0]), codec: codec.vector(4) }, // p(x) = a₀ + a₁x + a₂x² + a₃x³
    basis: { def: 'taylor', codec: codec.enum(BASES) },
    c: { def: V([1]), codec: codec.vector(1) },
    op: { def: 'D', codec: codec.enum(OPS) },
    pts: { def: [[-1, 1], [0, -1], [1, 0], [2, 2]], codec: codec.points() },
    show: { def: ['parts', 'nodes'], codec: codec.flags(['parts', 'nodes', 'basis']) },
  },

  build(ctx) {
    const { store } = ctx;
    if (store.get('pts').length < 4) store.set({ pts: [[-1, 1], [0, -1], [1, 0], [2, 2]] });
    const plane = new Plane2D(ctx.addView(), { range: 4 });
    ctx.bar.hidden = true;
    for (let i = 0; i < 4; i++) {
      plane.addHandle({
        id: `p${i}`, color: COLORS[i],
        visible: () => store.get('mode') === 'interp' && i <= store.get('deg'),
        get: () => store.get('pts')[i],
        set: (p) => { const pts = store.get('pts').map((q) => q.slice()); pts[i] = p; store.set({ pts }); },
      });
    }

    // Panel -----------------------------------------------------------------------
    const modeSeg = segmented({
      options: [
        { value: 'coords', label: { es: 'Coordenadas', en: 'Coordinates' } },
        { value: 'op', label: { es: 'Operadores', en: 'Operators' } },
        { value: 'interp', label: { es: 'Interpolación', en: 'Interpolation' } },
      ],
      get: () => store.get('mode'), set: (mode) => store.set({ mode }),
      label: { es: 'Modo', en: 'Mode' },
    });
    const degSeg = segmented({
      options: [{ value: 2, tex: '\\mathcal{P}_2' }, { value: 3, tex: '\\mathcal{P}_3' }],
      get: () => store.get('deg'), set: (deg) => store.set({ deg }),
      label: { es: 'Espacio', en: 'Space' },
    });
    const coefSliders = [0, 1, 2, 3].map((j) => slider({
      label: `a${j}`, labelTex: `a_${j}`, min: -4, max: 4, step: 0.1,
      get: () => store.get('a')[j].x,
      set: (x) => { const a = store.get('a').slice(); a[j] = entryFromNumber(Math.round(x * 10) / 10); store.set({ a }); },
      format: (x) => fmtDecimal(x, 2),
    }));
    const aEditor = vectorEditor({ n: 4, label: '[p]_{E} =', color: 'var(--c-v)', get: () => store.get('a'), set: (a) => store.set({ a }), name: { es: 'Coeficientes de p', en: 'Coefficients of p' } });
    const helpP = h('p');
    setText(helpP, { es: 'p(x) = a₀ + a₁x + a₂x² + a₃x³: sus coeficientes son sus coordenadas en la base de monomios E = {1, x, x², x³}.', en: 'p(x) = a₀ + a₁x + a₂x² + a₃x³: its coefficients are its coordinates in the monomial basis E = {1, x, x², x³}.' });
    const pCard = card({ title: { es: 'Polinomio p', en: 'Polynomial p' }, body: [modeSeg.el, degSeg.el, ...coefSliders.map((s) => s.el), aEditor.el, helpP] });

    const basisSel = selectBox({
      options: [
        { value: 'mono', label: { es: 'Monomios 1, x, x², x³', en: 'Monomials 1, x, x², x³' } },
        { value: 'taylor', label: { es: 'Taylor: 1, (x − c), (x − c)², …', en: 'Taylor: 1, (x − c), (x − c)², …' } },
        { value: 'lagrange', label: { es: 'Lagrange en los nodos', en: 'Lagrange at the nodes' } },
        { value: 'legendre', label: { es: 'Legendre (ortogonal en [−1, 1])', en: 'Legendre (orthogonal on [−1, 1])' } },
      ],
      get: () => store.get('basis'), set: (basis) => store.set({ basis }),
      label: { es: 'Base B', en: 'Basis B' },
    });
    const cEditor = vectorEditor({ n: 1, label: 'c =', color: 'var(--accent)', get: () => store.get('c'), set: (c) => store.set({ c }), name: { es: 'Centro de Taylor', en: 'Taylor centre' } });
    const opSel = selectBox({
      options: [
        { value: 'D', label: { es: 'Derivada D(p) = p′', en: 'Derivative D(p) = p′' } },
        { value: 'S', label: { es: 'Traslación S(p)(x) = p(x + 1)', en: 'Shift S(p)(x) = p(x + 1)' } },
        { value: 'xD', label: { es: 'Euler T(p) = x·p′', en: 'Euler T(p) = x·p′' } },
      ],
      get: () => store.get('op'), set: (op) => store.set({ op }),
      label: { es: 'Operador', en: 'Operator' },
    });
    const opField = h('div', { class: 'field' }, h('label'), opSel.el);
    setText(opField.firstChild, { es: 'Operador lineal', en: 'Linear operator' });
    const basisField = h('div', { class: 'field' }, h('label'), basisSel.el);
    setText(basisField.firstChild, { es: 'Base B', en: 'Basis B' });
    const chips = [
      flagChip(store, 'show', 'parts', { es: 'Componentes cᵢbᵢ', en: 'Components cᵢbᵢ' }, 'var(--c-i)'),
      flagChip(store, 'show', 'basis', { es: 'Polinomios de la base', en: 'Basis polynomials' }, 'var(--tgrid)'),
      flagChip(store, 'show', 'nodes', { es: 'Nodos', en: 'Nodes' }, 'var(--c-w)'),
    ];
    const useBtn = button({
      label: { es: 'Usar como p', en: 'Use as p' }, iconName: 'check', small: true,
      onClick: () => {
        const an = cur && cur.an;
        if (!an || !an.interp.particular) return;
        const a = store.get('a').slice();
        for (let j = 0; j < 4; j++) a[j] = j < an.N ? (an.F === RationalField ? makeEntry(an.interp.particular[j].toString()) : entryFromNumber(an.interp.particular[j])) : makeEntry('0');
        store.set({ a, mode: 'coords' });
      },
    });
    const interpHelp = h('p');
    setText(interpHelp, { es: 'Arrastra los n + 1 puntos: hay un único polinomio de grado ≤ n que pasa por ellos si sus abscisas son distintas.', en: 'Drag the n + 1 points: there is a unique polynomial of degree ≤ n through them if their x-values are distinct.' });
    const setupCard = card({ title: { es: 'Base y operador', en: 'Basis and operator' }, body: [basisField, cEditor.el, opField, h('div', { class: 'chip-row' }, chips.map((c) => c.el)), interpHelp, h('div', { class: 'row' }, useBtn)] });

    const r = {
      p: readout(null, { labelTex: 'p(x)', block: true }),
      basis: readout({ es: 'Base B', en: 'Basis B' }, { block: true }),
      coords: readout(null, { labelTex: '[p]_B', block: true }),
      P: readout({ es: 'Matriz de cambio de base', en: 'Change-of-basis matrix' }, { block: true }),
      T: readout({ es: 'Matriz del operador', en: 'Matrix of the operator' }, { block: true }),
      Tp: readout({ es: 'Imagen', en: 'Image' }, { block: true }),
      kerim: readout({ es: 'Núcleo e imagen', en: 'Kernel and image' }, { block: true }),
      eig: readout({ es: 'Valores propios', en: 'Eigenvalues' }, { block: true }),
      V: readout({ es: 'Sistema de Vandermonde', en: 'Vandermonde system' }, { block: true }),
      q: readout({ es: 'Interpolador', en: 'Interpolant' }, { block: true }),
    };
    const resultsCard = card({ title: { es: 'Álgebra exacta', en: 'Exact algebra' }, body: [h('div', { class: 'readouts' }, Object.values(r).map((x) => x.el))] });
    ctx.panel.append(pCard.el, setupCard.el, resultsCard.el);

    // Drawing -------------------------------------------------------------------------
    let cur = null;
    plane.setDraw((g) => {
      if (!cur) return;
      const { an, mode, show } = cur;
      g.backgroundGrid();
      const { xmin, xmax } = g.p.bounds();
      const graph = (asc, opts) => g.curve((x) => [x, evalF(asc, x)], xmin, xmax, 360, opts);
      const af = an.a.map((x) => an.F.toNumber(x));
      if (mode === 'coords') {
        if (an.B) {
          const Bf = an.B.map((b) => b.map((x) => an.F.toNumber(x)));
          if (show.includes('basis')) Bf.forEach((b, i) => graph(b, { color: g.c[COLORS[i]], width: 1.2, alpha: 0.45 }));
          if (show.includes('parts') && an.coords) {
            an.coords.forEach((ci, i) => {
              const cf = an.F.toNumber(ci);
              if (Math.abs(cf) < 1e-12) return;
              graph(Bf[i].map((x) => cf * x), { color: g.c[COLORS[i]], width: 2, dash: [7, 5], alpha: 0.9 });
            });
          }
        }
        if (cur.basis === 'taylor') {
          const cf = an.F.toNumber(an.c);
          g.infiniteLine([cf, 0], [0, 1], { color: g.c.muted, width: 1, dash: [3, 5] });
          g.point([cf, evalF(af, cf)], { color: g.c.v, r: 5 });
        }
        if (cur.basis === 'lagrange' && show.includes('nodes')) an.nodes.forEach((x, i) => { const xf = an.F.toNumber(x); g.point([xf, evalF(af, xf)], { color: g.c[COLORS[i]], r: 5 }); });
        graph(af, { color: g.c.v, width: 3.5 });
      } else if (mode === 'op') {
        const tf = an.Tp.map((x) => an.F.toNumber(x));
        graph(af, { color: g.c.v, width: 3 });
        graph(tf, { color: g.c.w, width: 3, dash: cur.op === 'S' ? [8, 5] : null });
      } else {
        if (an.interp.particular) graph(an.interp.particular.map((x) => an.F.toNumber(x)), { color: g.c.v, width: 3.5 });
        cur.pts.forEach((p, i) => g.text(p, `(${fmtDecimal(p[0], 2)}, ${fmtDecimal(p[1], 2)})`, { color: g.c[COLORS[i]], offset: [12, -14], size: 11 }));
      }
    });

    const polyName = (asc) => texP(asc);

    function render(state) {
      const an = analyze(keyOf(state), state);
      const { F, n, N } = an;
      cur = { an, mode: state.mode, show: state.show, basis: state.basis, op: state.op, pts: state.pts.slice(0, N) };
      plane.requestRender();
      modeSeg.update(); degSeg.update(); basisSel.update(); opSel.update(); aEditor.update(); cEditor.update();
      coefSliders.forEach((s, j) => { s.update(); s.el.hidden = j > n || state.mode === 'interp'; });
      chips.forEach((ch) => ch.update());
      // The 4th coefficient is ignored in P₂: grey it out.
      aEditor.inputs[3][0].disabled = n < 3;
      const mode = state.mode;
      aEditor.el.hidden = helpP.hidden = mode === 'interp';
      basisField.hidden = mode === 'interp';
      cEditor.el.hidden = mode === 'interp' || state.basis !== 'taylor';
      opField.hidden = mode !== 'op';
      chips[0].el.hidden = chips[1].el.hidden = mode !== 'coords';
      chips[2].el.hidden = mode !== 'coords' || state.basis !== 'lagrange';
      interpHelp.hidden = useBtn.hidden = mode !== 'interp';

      const pTex = polyName(an.a, F);
      r.p.set(`p(x) = ${pTex}`);
      r.p.show(mode !== 'interp');

      // Coordinates -------------------------------------------------------------
      const showCoords = mode === 'coords' || mode === 'op';
      r.basis.show(showCoords); r.coords.show(mode === 'coords'); r.P.show(mode === 'coords');
      if (showCoords) {
        if (!an.B) {
          r.basis.set('\\text{—}', { es: 'Los nodos se repiten: los polinomios de Lagrange no están definidos.', en: 'Two nodes coincide: the Lagrange polynomials are not defined.' });
          r.coords.set('\\text{—}'); r.P.set('\\text{—}');
        } else {
          const bNames = an.B.map((_, i) => `b_{${i}}`);
          r.basis.set(`${an.B.map((b, i) => `\\htmlClass{c-${COLORS[i]}}{b_{${i}}} = ${polyName(b, F)}`).join(',\\quad ')}`,
            { mono: { es: 'La base canónica de 𝒫ₙ.', en: 'The standard basis of 𝒫ₙ.' },
              taylor: { es: 'Las coordenadas son p(c), p′(c), p″(c)/2!, …: el desarrollo de Taylor en c es exacto para polinomios.', en: 'The coordinates are p(c), p′(c), p″(c)/2!, …: the Taylor expansion at c is exact for polynomials.' },
              lagrange: { es: 'bᵢ vale 1 en el nodo i y 0 en los demás, así que las coordenadas son los valores p(xᵢ).', en: 'bᵢ is 1 at node i and 0 at the others, so the coordinates are the values p(xᵢ).' },
              legendre: { es: 'Ortogonales para ⟨f, g⟩ = ∫₋₁¹ f g dx: cada coordenada es ⟨p, bᵢ⟩ / ⟨bᵢ, bᵢ⟩.', en: 'Orthogonal for ⟨f, g⟩ = ∫₋₁¹ f g dx: each coordinate is ⟨p, bᵢ⟩ / ⟨bᵢ, bᵢ⟩.' } }[state.basis]);
          if (an.coords) {
            r.coords.set(`[p]_B = ${texVector(an.coords)} \\;\\Longleftrightarrow\\; p = ${texCombo(an.coords, bNames.map((b, i) => `\\htmlClass{c-${COLORS[i]}}{${b}}`), { zero: '0' })}`);
          }
          r.P.set(`P_{E\\leftarrow B} = ${texMatrix(an.P)},\\qquad [p]_B = P^{-1}[p]_E`,
            { es: 'La columna j son los coeficientes de bⱼ: el mismo mecanismo que el cambio de base en ℝⁿ.', en: 'Column j holds the coefficients of bⱼ: the same mechanism as a change of basis in ℝⁿ.' });
        }
      }

      // Operators ----------------------------------------------------------------
      const isOp = mode === 'op';
      r.T.show(isOp); r.Tp.show(isOp); r.kerim.show(isOp); r.eig.show(isOp);
      if (isOp) {
        const opTex = { D: 'D', S: 'S', xD: 'T' }[state.op];
        const TBtex = an.TB && state.basis !== 'mono' ? `,\\qquad [${opTex}]_B = P^{-1}[${opTex}]_E\\,P = ${texMatrix(an.TB)}` : '';
        r.T.set(`[${opTex}]_E = ${texMatrix(an.TE)}${TBtex}`, { es: 'La columna j es la imagen del j-ésimo vector de la base, escrita en coordenadas.', en: 'Column j is the image of the j-th basis vector, written in coordinates.' });
        const TpTex = polyName(an.Tp, F);
        const def = { D: `p'(x)`, S: 'p(x + 1)', xD: `x\\,p'(x)` }[state.op];
        r.Tp.set(`\\begin{gathered}${opTex}(p) = ${def} = ${TpTex} \\\\ [${opTex}(p)]_E = ${texMatrix(an.TE)}${texVector(an.a)} = ${texVector(an.Tp)}\\end{gathered}`);
        const ker = L.nullspace(an.TE, F);
        const rank = N - ker.length;
        const kerTex = ker.length ? `${spanOp()}\\{${ker.map((v) => polyName(v, F)).join(',\\;')}\\}` : '\\{0\\}';
        r.kerim.set(`\\ker ${opTex} = ${kerTex},\\qquad \\dim\\operatorname{Im} ${opTex} = ${rank},\\qquad ${rank} + ${ker.length} = ${N} = \\dim\\mathcal{P}_{${n}}`,
          { D: { es: `El núcleo son las constantes y la imagen es 𝒫${n === 2 ? '₁' : '₂'}: D no es invertible.`, en: `The kernel is the constants and the image is 𝒫${n === 2 ? '₁' : '₂'}: D is not invertible.` },
            S: { es: 'S es invertible: su inversa es p(x) ↦ p(x − 1).', en: 'S is invertible: its inverse is p(x) ↦ p(x − 1).' },
            xD: { es: 'El núcleo son las constantes; la imagen, los polinomios sin término independiente.', en: 'The kernel is the constants; the image, the polynomials with no constant term.' } }[state.op]);
        const diag = an.TE.map((row, i) => row[i]);
        const distinct = [...new Set(diag.map((x) => scalarNumber(x)))];
        r.eig.set(`\\lambda \\in \\{${distinct.map((x) => texValue(x)).join(',\\,')}\\}`,
          { D: { es: `[D]_E es triangular con diagonal nula: el único valor propio es 0 y D^${N} = 0 (nilpotente). No es diagonalizable.`, en: `[D]_E is triangular with zero diagonal: the only eigenvalue is 0 and D^${N} = 0 (nilpotent). It is not diagonalizable.` },
            S: { es: 'El único valor propio es 1 (solo las constantes quedan fijas). Por Taylor, S = I + D + D²/2! + D³/3! = e^D.', en: 'The only eigenvalue is 1 (only constants stay fixed). By Taylor, S = I + D + D²/2! + D³/3! = e^D.' },
            xD: { es: 'T(xᵏ) = k·xᵏ: los monomios son vectores propios y [T]_E es diagonal.', en: 'T(xᵏ) = k·xᵏ: the monomials are eigenvectors and [T]_E is diagonal.' } }[state.op]);
      }

      // Interpolation --------------------------------------------------------------
      const isInt = mode === 'interp';
      r.V.show(isInt); r.q.show(isInt);
      if (isInt) {
        const s = an.interp;
        const detF = [];
        for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) detF.push(`(x_${j} - x_${i})`);
        r.V.set(`\\begin{gathered}${texMatrix(an.Vm)}${texVector(Array.from({ length: N }, (_, j) => `a_${j}`), { raw: true })} = ${texVector(an.ys)} \\\\ \\det V = ${N === 4 ? `${detF.slice(0, 3).join('')} \\\\ \\cdot ${detF.slice(3).join('')}` : detF.join('')} = ${texValue(an.detV)}\\end{gathered}`,
          F.isZero(an.detV) ? { es: 'Dos nodos tienen la misma abscisa: V es singular.', en: 'Two nodes share the same x-value: V is singular.' } : { es: 'Los nodos son distintos, así que det V ≠ 0 y la solución es única.', en: 'The nodes are distinct, so det V ≠ 0 and the solution is unique.' });
        if (s.status === 'unique') {
          r.q.set(`p(x) = ${polyName(s.particular, F)}`, { es: `Grado ${degreeOf(s.particular, F)}: puede ser menor que ${n} si los puntos lo permiten.`, en: `Degree ${degreeOf(s.particular, F)}: it can be lower than ${n} if the points allow it.` });
        } else if (s.status === 'none') {
          r.q.set('\\text{—}', { es: 'No hay polinomio: dos puntos con la misma x y distinta y.', en: 'No polynomial: two points with the same x and different y.' });
        } else {
          r.q.set(`p(x) = ${polyName(s.particular, F)} + \\dots`, { es: 'Hay infinitos: sobran condiciones repetidas.', en: 'Infinitely many: some conditions are repeated.' });
        }
      }

      ctx.setLegend(mode === 'coords' ? [
        { color: 'var(--c-v)', tex: 'p' },
        state.show.includes('parts') && { color: 'var(--c-i)', kind: 'dash', tex: 'c_i\\,b_i' },
        state.show.includes('basis') && { color: 'var(--tgrid)', tex: 'b_i' },
      ] : mode === 'op' ? [
        { color: 'var(--c-v)', tex: 'p' },
        { color: 'var(--c-w)', tex: { D: `p'`, S: 'p(x+1)', xD: `x\\,p'` }[state.op] },
      ] : [
        { color: 'var(--c-v)', label: { es: 'polinomio interpolador', en: 'interpolating polynomial' } },
      ]);
      return { an, state };
    }

    return { render, snapshot: () => plane.snapshot(), onReset: () => plane.resetView() };
  },

  learn: {
    what: {
      es: `<p>El conjunto $\\mathcal{P}_n$ de los polinomios de grado $\\le n$ es un <strong>espacio vectorial</strong>: sumar dos polinomios o multiplicar uno por un número da otro polinomio de $\\mathcal{P}_n$, y se cumplen las mismas reglas que con las flechas. Un polinomio no es una flecha, pero al elegir una base se describe con $n+1$ números, sus <strong>coordenadas</strong>, y todo lo que sabemos de $\\mathbb{R}^{n+1}$ se puede usar.</p>
<p>En <em>Coordenadas</em> ves $p$ como combinación de los polinomios de la base (curvas punteadas). En la base de monomios las coordenadas son los coeficientes; en la de Taylor, las derivadas en $c$; en la de Lagrange, los valores en los nodos. En <em>Operadores</em>, la derivada y la traslación son <strong>transformaciones lineales</strong>, así que tienen matriz, núcleo, imagen y valores propios. En <em>Interpolación</em>, pedir que $p$ pase por $n+1$ puntos es un sistema lineal cuya matriz es la de Vandermonde.</p>`,
      en: `<p>The set $\\mathcal{P}_n$ of polynomials of degree $\\le n$ is a <strong>vector space</strong>: adding two polynomials or multiplying one by a number gives another polynomial in $\\mathcal{P}_n$, and the same rules hold as for arrows. A polynomial is not an arrow, but once a basis is chosen it is described by $n+1$ numbers, its <strong>coordinates</strong>, and everything we know about $\\mathbb{R}^{n+1}$ can be used.</p>
<p>In <em>Coordinates</em> you see $p$ as a combination of the basis polynomials (dashed curves). In the monomial basis the coordinates are the coefficients; in the Taylor basis, the derivatives at $c$; in the Lagrange basis, the values at the nodes. In <em>Operators</em>, the derivative and the shift are <strong>linear maps</strong>, so they have a matrix, a kernel, an image and eigenvalues. In <em>Interpolation</em>, asking $p$ to pass through $n+1$ points is a linear system whose matrix is the Vandermonde matrix.</p>`,
    },
    prompts: {
      es: [
        'En la base de Taylor, cambia $c$. ¿Qué relación hay entre la primera coordenada y la gráfica? ¿Y la segunda?',
        'Elige la base de Lagrange y activa los nodos. ¿Por qué las coordenadas son exactamente los valores de $p$ en los nodos?',
        'En <em>Operadores</em> con la derivada, calcula $[D]_E^3$ mentalmente en $\\mathcal{P}_2$. ¿Qué transformación es?',
        'Con el operador de Euler $x\\,p\'$, ¿qué polinomios solo se escalan? ¿Por qué su matriz es diagonal?',
        'En <em>Interpolación</em>, alinea tres puntos en una recta. ¿Qué grado tiene el interpolador? ¿Y si dos puntos tienen la misma $x$?',
      ],
      en: [
        'In the Taylor basis, change $c$. How is the first coordinate related to the graph? And the second one?',
        'Pick the Lagrange basis and show the nodes. Why are the coordinates exactly the values of $p$ at the nodes?',
        'In <em>Operators</em> with the derivative, compute $[D]_E^3$ in your head for $\\mathcal{P}_2$. Which map is it?',
        'With the Euler operator $x\\,p\'$, which polynomials are only scaled? Why is its matrix diagonal?',
        'In <em>Interpolation</em>, put three points on a line. What degree does the interpolant have? And if two points share the same $x$?',
      ],
    },
    formal: [
      {
        kind: 'definition',
        title: { es: 'Espacio vectorial', en: 'Vector space' },
        body: {
          es: '<p>Un espacio vectorial real es un conjunto $V$ con una suma y un producto por escalares que cumplen: $(V, +)$ es un grupo abeliano, y $a(\\mathbf{u}+\\mathbf{v}) = a\\mathbf{u} + a\\mathbf{v}$, $(a+b)\\mathbf{u} = a\\mathbf{u} + b\\mathbf{u}$, $(ab)\\mathbf{u} = a(b\\mathbf{u})$, $1\\mathbf{u} = \\mathbf{u}$. Ejemplos: $\\mathbb{R}^n$, $\\mathcal{P}_n$, las matrices $m\\times n$, las funciones continuas en $[a, b]$.</p>',
          en: '<p>A real vector space is a set $V$ with an addition and a scalar multiplication such that $(V, +)$ is an abelian group and $a(\\mathbf{u}+\\mathbf{v}) = a\\mathbf{u} + a\\mathbf{v}$, $(a+b)\\mathbf{u} = a\\mathbf{u} + b\\mathbf{u}$, $(ab)\\mathbf{u} = a(b\\mathbf{u})$, $1\\mathbf{u} = \\mathbf{u}$. Examples: $\\mathbb{R}^n$, $\\mathcal{P}_n$, the $m\\times n$ matrices, the continuous functions on $[a, b]$.</p>',
        },
      },
      {
        kind: 'theorem',
        title: { es: 'Isomorfismo de coordenadas', en: 'Coordinate isomorphism' },
        body: {
          es: '<p>Si $B = (b_0,\\dots,b_n)$ es una base de $V$, la aplicación $v\\mapsto[v]_B$ es un isomorfismo lineal $V\\to\\mathbb{R}^{n+1}$. En particular $\\dim\\mathcal{P}_n = n+1$, y una transformación lineal $T: V\\to V$ queda representada por la matriz $[T]_B$ cuya columna $j$ es $[T(b_j)]_B$, con $[T(v)]_B = [T]_B[v]_B$ y $[T]_{B\'} = P^{-1}[T]_B P$ al cambiar de base.</p>',
          en: '<p>If $B = (b_0,\\dots,b_n)$ is a basis of $V$, the map $v\\mapsto[v]_B$ is a linear isomorphism $V\\to\\mathbb{R}^{n+1}$. In particular $\\dim\\mathcal{P}_n = n+1$, and a linear map $T: V\\to V$ is represented by the matrix $[T]_B$ whose column $j$ is $[T(b_j)]_B$, with $[T(v)]_B = [T]_B[v]_B$ and $[T]_{B\'} = P^{-1}[T]_B P$ under a change of basis.</p>',
        },
      },
      {
        kind: 'theorem',
        title: { es: 'Interpolación y Vandermonde', en: 'Interpolation and Vandermonde' },
        body: {
          es: '<p>Dados $x_0,\\dots,x_n$ distintos y valores $y_0,\\dots,y_n$, existe un único $p\\in\\mathcal{P}_n$ con $p(x_i) = y_i$. En la base de monomios es el sistema $V\\mathbf{a} = \\mathbf{y}$ con $V_{ij} = x_i^{\\,j}$ y $\\det V = \\prod_{i<j}(x_j - x_i)\\neq 0$. En la base de Lagrange, $\\ell_i(x) = \\prod_{j\\neq i}\\frac{x - x_j}{x_i - x_j}$, la solución es directamente $p = \\sum_i y_i\\,\\ell_i$.</p>',
          en: '<p>Given distinct $x_0,\\dots,x_n$ and values $y_0,\\dots,y_n$, there is a unique $p\\in\\mathcal{P}_n$ with $p(x_i) = y_i$. In the monomial basis it is the system $V\\mathbf{a} = \\mathbf{y}$ with $V_{ij} = x_i^{\\,j}$ and $\\det V = \\prod_{i<j}(x_j - x_i)\\neq 0$. In the Lagrange basis, $\\ell_i(x) = \\prod_{j\\neq i}\\frac{x - x_j}{x_i - x_j}$, the solution is simply $p = \\sum_i y_i\\,\\ell_i$.</p>',
        },
      },
      {
        kind: 'example',
        title: { es: 'La derivada es nilpotente', en: 'The derivative is nilpotent' },
        body: {
          es: '<p>En $\\mathcal{P}_n$, $D^{n+1} = 0$ porque cada derivada baja el grado. Su único valor propio es $0$, con espacio propio $\\mathcal{P}_0$ de dimensión $1 < n+1$, así que $D$ no es diagonalizable: en la base $\\left(\\tfrac{x^n}{n!},\\dots,x,1\\right)$ su matriz es un bloque de Jordan. La traslación es $S = e^{D} = \\sum_{k=0}^{n} D^k/k!$, que es la fórmula de Taylor.</p>',
          en: '<p>On $\\mathcal{P}_n$, $D^{n+1} = 0$ because each derivative lowers the degree. Its only eigenvalue is $0$, with eigenspace $\\mathcal{P}_0$ of dimension $1 < n+1$, so $D$ is not diagonalizable: in the basis $\\left(\\tfrac{x^n}{n!},\\dots,x,1\\right)$ its matrix is a Jordan block. The shift is $S = e^{D} = \\sum_{k=0}^{n} D^k/k!$, which is Taylor’s formula.</p>',
        },
      },
    ],
  },

  challenges: [
    {
      id: 'taylor',
      title: { es: 'Coordenadas de Taylor', en: 'Taylor coordinates' },
      text: { es: 'En $\\mathcal{P}_2$ con la base de Taylor en $c = 1$, escribe los coeficientes de un $p$ con $[p]_B = (2, 0, 1)$.', en: 'In $\\mathcal{P}_2$ with the Taylor basis at $c = 1$, type the coefficients of a $p$ with $[p]_B = (2, 0, 1)$.' },
      hint: { es: '$p = 2 + 0\\,(x-1) + 1\\,(x-1)^2$. Desarrolla el cuadrado.', en: '$p = 2 + 0\\,(x-1) + 1\\,(x-1)^2$. Expand the square.' },
      setup: (store) => store.set({ mode: 'coords', deg: 2, basis: 'taylor', c: V([1]), a: V([0, 0, 1, 0]) }),
      check: (s, d) => s.deg === 2 && s.basis === 'taylor' && d.an.c && Math.abs(scalarNumber(d.an.c) - 1) < 1e-12 && d.an.coords && [2, 0, 1].every((x, i) => Math.abs(scalarNumber(d.an.coords[i]) - x) < 1e-9),
    },
    {
      id: 'eigen2',
      title: { es: 'Vector propio de x·p′', en: 'Eigenvector of x·p′' },
      text: { es: 'Con el operador $T(p) = x\\,p\'$, encuentra un polinomio no nulo con $T(p) = 2p$.', en: 'With the operator $T(p) = x\\,p\'$, find a non-zero polynomial with $T(p) = 2p$.' },
      hint: { es: 'Prueba con monomios: $T(x^k) = k\\,x^k$.', en: 'Try monomials: $T(x^k) = k\\,x^k$.' },
      setup: (store) => store.set({ mode: 'op', op: 'xD', a: V([1, 1, 1, 0]) }),
      check: (s, d) => s.op === 'xD' && d.an.a.some((x) => !d.an.F.isZero(x)) && d.an.Tp.every((x, i) => d.an.F.isZero(d.an.F.sub(x, d.an.F.mul(d.an.F.fromInt(2), d.an.a[i])))),
    },
    {
      id: 'sum',
      title: { es: 'Una diferencia finita', en: 'A finite difference' },
      text: { es: 'Con la traslación $S$, encuentra $p\\in\\mathcal{P}_2$ tal que $p(x+1) - p(x) = x$.', en: 'With the shift $S$, find $p\\in\\mathcal{P}_2$ such that $p(x+1) - p(x) = x$.' },
      hint: { es: 'Si $p = ax^2 + bx + c$, entonces $p(x+1) - p(x) = 2ax + a + b$. (Así se suma $0 + 1 + \\dots + (m-1) = p(m) - p(0)$.)', en: 'If $p = ax^2 + bx + c$, then $p(x+1) - p(x) = 2ax + a + b$. (This is how to add $0 + 1 + \\dots + (m-1) = p(m) - p(0)$.)' },
      setup: (store) => store.set({ mode: 'op', op: 'S', deg: 2, a: V([0, 0, 1, 0]) }),
      check: (s, d) => {
        if (s.op !== 'S' || s.deg !== 2) return false;
        const F = d.an.F;
        const diff = d.an.Tp.map((x, i) => F.sub(x, d.an.a[i]));
        return F.isZero(diff[0]) && F.eq(diff[1], F.one) && F.isZero(diff[2]);
      },
    },
    {
      id: 'deg2',
      title: { es: 'Cuatro puntos, grado 2', en: 'Four points, degree 2' },
      text: { es: 'En $\\mathcal{P}_3$, deja los tres primeros puntos en $(-1, 1)$, $(0, -1)$, $(1, 0)$ y mueve el cuarto (con $x \\ne -1, 0, 1$) para que el interpolador tenga grado 2.', en: 'In $\\mathcal{P}_3$, keep the first three points at $(-1, 1)$, $(0, -1)$, $(1, 0)$ and move the fourth one (with $x \\ne -1, 0, 1$) so that the interpolant has degree 2.' },
      hint: { es: 'El cuarto punto debe estar sobre la parábola que pasa por los tres primeros.', en: 'The fourth point must lie on the parabola through the first three.' },
      setup: (store) => store.set({ mode: 'interp', deg: 3, pts: [[-1, 1], [0, -1], [1, 0], [2, 2]] }),
      check: (s, d) => {
        if (s.mode !== 'interp' || s.deg !== 3) return false;
        const fixed = [[-1, 1], [0, -1], [1, 0]].every(([x, y], i) => s.pts[i][0] === x && s.pts[i][1] === y);
        const sol = d.an.interp;
        return fixed && sol.status === 'unique' && d.an.F.isZero(sol.particular[3]);
      },
    },
  ],
});

function degreeOf(asc, F) {
  for (let i = asc.length - 1; i >= 0; i--) if (!F.isZero(asc[i])) return i;
  return 0;
}
