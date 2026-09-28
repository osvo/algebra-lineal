import { createLab } from '../ui/shell.js';
import { codec, M, V } from '../ui/store.js';
import { Plane2D } from '../ui/plane2d.js';
import { card, matrixEditor, vectorEditor, flagChip, readout, animator, segmented } from '../ui/controls.js';
import { h } from '../ui/dom.js';
import { tr, setText } from '../ui/i18n.js';
import { entryFromNumber } from '../core/parse.js';
import * as L from '../core/linalg.js';
import { texValue, texVector, texMatrix, cls } from '../core/format.js';
import { presetSelect } from './common.js';
import { RationalField } from '../core/fields.js';
import { makeEntry } from '../core/parse.js';

const A_PRESETS = [
  { id: 'sym', label: { es: 'Simétrica [[2,1],[1,2]]', en: 'Symmetric [[2,1],[1,2]]' }, value: [[2, 1], [1, 2]] },
  { id: 'shear', label: { es: 'Cizalla', en: 'Shear' }, value: [[1, 1], [0, 1]] },
  { id: 'rot', label: { es: 'Rotación 90°', en: 'Rotation 90°' }, value: [[0, -1], [1, 0]] },
  { id: 'proj', label: { es: 'Proyección sobre el eje x', en: 'Projection onto the x-axis' }, value: [[1, 0], [0, 0]] },
  { id: 'fib', label: { es: 'Fibonacci [[1,1],[1,0]]', en: 'Fibonacci [[1,1],[1,0]]' }, value: [[1, 1], [1, 0]] },
];
const B_PRESETS = [
  { id: 'std', label: { es: 'Canónica', en: 'Standard' }, value: [[1, 0], [0, 1]] },
  { id: 'default', label: { es: 'b₁ = (2, 1), b₂ = (−1, 1)', en: 'b₁ = (2, 1), b₂ = (−1, 1)' }, value: [[2, -1], [1, 1]] },
  { id: 'diag', label: { es: 'Diagonales (1, 1), (−1, 1)', en: 'Diagonals (1, 1), (−1, 1)' }, value: [[1, -1], [1, 1]] },
  { id: 'rot', label: { es: 'Ortonormal girada (3/5, 4/5)', en: 'Rotated orthonormal (3/5, 4/5)' }, value: [['3/5', '-4/5'], ['4/5', '3/5']] },
  { id: 'skew', label: { es: 'Oblicua (1, 0), (1, 2)', en: 'Oblique (1, 0), (1, 2)' }, value: [[1, 1], [0, 2]] },
];

createLab({
  id: 'cob',
  lead: {
    es: 'Un vector no «tiene» coordenadas: las recibe al elegir una base. Cambia la base y mira cómo cambian los números mientras la flecha sigue en su sitio.',
    en: 'A vector does not “have” coordinates: it gets them once a basis is chosen. Change the basis and watch the numbers change while the arrow stays put.',
  },
  state: {
    mode: { def: 'coords', codec: codec.enum(['coords', 'similar']) },
    P: { def: M([[2, -1], [1, 1]]), codec: codec.matrix(2, 2) }, // columns b₁, b₂
    v: { def: V([3, 3]), codec: codec.vector(2) },
    A: { def: M([[2, 1], [1, 2]]), codec: codec.matrix(2, 2) },
    t: { def: 1, codec: codec.num(0, 1) },
    show: { def: ['v', 'std'], codec: codec.flags(['v', 'std', 'bgrid']) },
  },

  build(ctx) {
    const { store } = ctx;
    const plane = new Plane2D(ctx.addView(), { range: 4.4 });
    let cur = null;
    const anim = animator({ store, key: 't', max: 1 });
    ctx.bar.append(anim.el);

    const Pf = () => store.get('P').map((r) => r.map((e) => e.x));
    const setB = (j) => ([x, y]) => {
      const P = store.get('P').map((row) => row.slice());
      P[0][j] = entryFromNumber(x); P[1][j] = entryFromNumber(y);
      store.set({ P });
    };
    plane.addHandle({ id: 'b1', color: 'i', get: () => [Pf()[0][0], Pf()[1][0]], set: setB(0) });
    plane.addHandle({ id: 'b2', color: 'j', get: () => [Pf()[0][1], Pf()[1][1]], set: setB(1) });
    // v snaps to the B-lattice (integer or half-integer B-coordinates) when close.
    plane.addHandle({
      id: 'v', color: 'v', visible: () => store.get('mode') === 'coords' && store.get('show').includes('v'),
      get: () => store.get('v').map((e) => e.x),
      set: ([x, y]) => store.set({ v: [entryFromNumber(x), entryFromNumber(y)] }),
      snap: ([wx, wy], free, pl) => {
        const P = Pf(); const Pi = L.inv2(P);
        if (!Pi || free) return [pl.snap(wx, free), pl.snap(wy, free)];
        const c = L.mv2(Pi, wx, wy);
        const tol = 9 / pl.view.scale;
        const rc = c.map((a) => Math.round(a * 2) / 2);
        const pB = L.mv2(P, rc[0], rc[1]);
        if (Math.hypot(pB[0] - wx, pB[1] - wy) < tol) return pB.map((a) => Math.round(a * 1e6) / 1e6);
        return [pl.snap(wx), pl.snap(wy)];
      },
    });

    // Panel -----------------------------------------------------------------------
    const modeSeg = segmented({
      options: [{ value: 'coords', label: { es: 'Coordenadas', en: 'Coordinates' } }, { value: 'similar', label: { es: 'Transformación en la base B', en: 'Map in basis B' } }],
      get: () => store.get('mode'), set: (mode) => store.set({ mode, t: 1 }),
      label: { es: 'Modo', en: 'Mode' },
    });
    const pEditor = matrixEditor({ rows: 2, cols: 2, label: 'P = [\\,\\mathbf{b}_1\\;\\mathbf{b}_2\\,] =', get: () => store.get('P'), set: (P) => store.set({ P }), name: { es: 'Base B (columnas)', en: 'Basis B (columns)' } });
    const bPresets = presetSelect({ store, key: 'P', presets: B_PRESETS });
    const basisCard = card({ title: { es: 'Base B', en: 'Basis B' }, body: [modeSeg.el, pEditor.el, bPresets.el] });

    const vEditor = vectorEditor({ n: 2, get: () => store.get('v'), set: (v) => store.set({ v }), label: '[\\vec{v}]_{E} =' });
    // Coordinates in B are editable too: v = P c.
    const cEditor = vectorEditor({
      n: 2, label: '[\\vec{v}]_{B} =', color: 'var(--c-w)',
      get: () => {
        const an = cur && cur.an;
        return an && an.cB ? an.cB.map((q) => entryFromNumber(an.F.toNumber(q))) .map((e, i) => ({ ...e, text: an.cBText[i] })) : [entryFromNumber(0), entryFromNumber(0)];
      },
      set: (c) => {
        const { F, M: Pm } = L.fieldMatrix([...store.get('P'), c]);
        const v = L.matVec(Pm.slice(0, 2), Pm[2], F);
        store.set({ v: v.map((x) => fromField(x, F)) });
      },
    });
    const chips = [
      flagChip(store, 'show', 'v', { es: 'Vector v', en: 'Vector v' }, 'var(--c-v)'),
      flagChip(store, 'show', 'std', { es: 'Cuadrícula canónica', en: 'Standard grid' }, 'var(--muted)'),
    ];
    const vCard = card({ title: { es: 'Vector', en: 'Vector' }, body: [h('div', { class: 'chip-row' }, chips.map((c) => c.el)), vEditor.el, cEditor.el] });

    const aEditor = matrixEditor({ rows: 2, cols: 2, label: 'A =', get: () => store.get('A'), set: (A) => store.set({ A }), colColors: ['var(--c-i)', 'var(--c-j)'], name: { es: 'Matriz A', en: 'Matrix A' } });
    const aPresets = presetSelect({ store, key: 'A', presets: A_PRESETS });
    const aNote = h('p');
    setText(aNote, { es: 'A está escrita en la base canónica. La cuadrícula de colores es la de B; la animación aplica A.', en: 'A is written in the standard basis. The coloured grid is B’s grid; the animation applies A.' });
    const aCard = card({ title: { es: 'Transformación', en: 'Transformation' }, body: [aEditor.el, aPresets.el, aNote] });

    const r = {
      valid: readout({ es: '¿Es base?', en: 'Is it a basis?' }),
      P: readout({ es: 'De B a E', en: 'From B to E' }, { block: true }),
      Pi: readout({ es: 'De E a B', en: 'From E to B' }, { block: true }),
      v: readout({ es: 'El mismo vector', en: 'The same vector' }, { block: true }),
      AB: readout(null, { labelTex: '[A]_B', block: true }),
      inv: readout({ es: 'Invariantes', en: 'Invariants' }, { block: true }),
      diag: readout({ es: '¿Diagonal?', en: 'Diagonal?' }),
    };
    const resultsCard = card({ title: { es: 'Resultado exacto', en: 'Exact result' }, body: [h('div', { class: 'readouts' }, Object.values(r).map((x) => x.el))] });
    ctx.panel.append(basisCard.el, vCard.el, aCard.el, resultsCard.el);

    // Drawing -------------------------------------------------------------------
    plane.setDraw((g) => {
      if (!cur) return;
      const { P, mode, show, v, an, Af, t } = cur;
      const b1 = [P[0][0], P[1][0]], b2 = [P[0][1], P[1][1]];
      if (show.includes('std')) g.backgroundGrid();
      else g.backgroundGrid({ color: 'transparent', ticks: false });
      const valid = Math.abs(L.det2(P)) > 1e-12;
      if (mode === 'coords') {
        if (valid) g.transformedGrid(P, { color: g.c.tgrid, alpha: 0.85, axes: true, axisColor: g.c.tgrid });
        if (show.includes('v')) {
          if (valid) {
            const c = L.mv2(L.inv2(P), v[0], v[1]);
            const p1 = [c[0] * b1[0], c[0] * b1[1]];
            g.arrow([0, 0], p1, { color: g.c.i, width: 2.5, dash: [6, 5], alpha: 0.9 });
            g.arrow(p1, [p1[0] + c[1] * b2[0], p1[1] + c[1] * b2[1]], { color: g.c.j, width: 2.5, dash: [6, 5], alpha: 0.9 });
          }
          g.arrow([0, 0], v, { color: g.c.v, width: 3.5 });
          g.mathLabel(v, 'v', { color: g.c.v, deco: 'arrow', offset: [16, -14] });
        }
      } else {
        const Mt = L.lerpMatrix(L.identityFloat(2), Af, t);
        if (valid) {
          g.transformedGrid(P, { color: g.c.tgrid, alpha: 0.25, axes: false, width: 1 });
          g.transformedGrid(L.mulFloat(Mt, P), { color: g.c.tgrid, alpha: 0.9, axes: true, axisColor: g.c.axis });
        }
        const Ab1 = L.mv2(Mt, ...b1), Ab2 = L.mv2(Mt, ...b2);
        if (valid && an.AB && t > 0.999) {
          // Decompose A b₁ in basis B: its B-coordinates are the first column of [A]_B.
          const ABf = an.ABf;
          const q1 = [ABf[0][0] * b1[0], ABf[0][0] * b1[1]];
          g.arrow([0, 0], q1, { color: g.c.i, width: 2, dash: [5, 5], alpha: 0.75 });
          g.arrow(q1, [q1[0] + ABf[1][0] * b2[0], q1[1] + ABf[1][0] * b2[1]], { color: g.c.j, width: 2, dash: [5, 5], alpha: 0.75 });
        }
        g.arrow([0, 0], Ab1, { color: g.c.i, width: 3.5 });
        g.arrow([0, 0], Ab2, { color: g.c.j, width: 3.5 });
        g.text(Ab1, 'Ab₁', { color: g.c.i, offset: [12, -12], font: '"KaTeX_Main", serif', size: 16, italic: true });
        g.text(Ab2, 'Ab₂', { color: g.c.j, offset: [12, -12], font: '"KaTeX_Main", serif', size: 16, italic: true });
      }
      g.arrow([0, 0], b1, { color: g.c.i, width: mode === 'coords' ? 3.5 : 2, alpha: mode === 'coords' ? 1 : 0.45 });
      g.arrow([0, 0], b2, { color: g.c.j, width: mode === 'coords' ? 3.5 : 2, alpha: mode === 'coords' ? 1 : 0.45 });
      g.mathLabel(b1, 'b', { color: g.c.i, sub: 1, away: b2 });
      g.mathLabel(b2, 'b', { color: g.c.j, sub: 2, away: b1 });
    });

    function render(state) {
      const { F, M: Pm } = L.fieldMatrix(state.P);
      const detP = L.det(Pm, F);
      const valid = !F.isZero(detP);
      const Pi = valid ? L.inverse(Pm, F) : null;
      // v in the same field as P (fall back to floats when needed).
      const all = L.fieldMatrix([...state.P, [state.v[0], state.v[1]], ...state.A]);
      const G = all.F;
      const Pg = all.M.slice(0, 2), vg = all.M[2], Ag = all.M.slice(3);
      const Pig = valid ? L.inverse(Pg, G) : null;
      const cB = Pig ? L.matVec(Pig, vg, G) : null;
      const AB = Pig ? L.matMul(L.matMul(Pig, Ag, G), Pg, G) : null;
      const an = { F: G, cB, cBText: cB ? cB.map((x) => plainEntry(x, G)) : null, AB, ABf: AB ? AB.map((row) => row.map((x) => G.toNumber(x))) : null };
      cur = { P: state.P.map((r2) => r2.map((e) => e.x)), mode: state.mode, show: state.show, v: state.v.map((e) => e.x), an, Af: state.A.map((r2) => r2.map((e) => e.x)), t: state.t };
      plane.requestRender();

      modeSeg.update(); pEditor.update(); vEditor.update(); cEditor.update(); aEditor.update(); anim.update();
      chips.forEach((c) => c.update());
      const coords = state.mode === 'coords';
      vCard.el.hidden = !coords;
      aCard.el.hidden = coords;
      ctx.bar.hidden = coords;

      r.valid.set({ html: `<span class="badge ${valid ? 'badge--ok' : 'badge--danger'}">${tr(valid ? { es: 'Sí: det P ≠ 0', en: 'Yes: det P ≠ 0' } : { es: 'No: b₁ y b₂ son paralelos', en: 'No: b₁ and b₂ are parallel' })}</span>` });
      r.P.set(`P_{E\\leftarrow B} = ${texMatrix(Pm, { colClasses: ['c-i', 'c-j'] })}`, { es: 'Sus columnas son b₁ y b₂ escritos en la base canónica E.', en: 'Its columns are b₁ and b₂ written in the standard basis E.' });
      r.Pi.set(Pi ? `P_{B\\leftarrow E} = P^{-1} = ${texMatrix(Pi)}` : '\\text{—}');
      if (coords) {
        r.v.show(true);
        r.v.set(cB
          ? `${cls('c-v', '\\vec{v}')} = ${texVector(vg)}_{E} = ${cls('c-w', texVector(cB))}_{B} \\;\\Longleftrightarrow\\; \\vec{v} = ${coef(cB[0], G)}\\,${cls('c-i', '\\mathbf{b}_1')} ${plusCoef(cB[1], G)}\\,${cls('c-j', '\\mathbf{b}_2')}`
          : `\\text{${tr({ es: 'sin coordenadas: B no es base', en: 'no coordinates: B is not a basis' })}}`,
        { es: 'La flecha no cambia; solo cambian los números que la describen: [v]_B = P⁻¹ v.', en: 'The arrow does not change; only the numbers describing it do: [v]_B = P⁻¹ v.' });
        r.AB.show(false); r.inv.show(false); r.diag.show(false);
      } else {
        r.v.show(false);
        r.AB.show(true); r.inv.show(true); r.diag.show(true);
        if (AB) {
          r.AB.set(`[A]_B = P^{-1}AP = ${texMatrix(AB, { colClasses: ['c-i', 'c-j'] })}`, { es: 'La columna j de [A]_B son las coordenadas de A b_j en la base B.', en: 'Column j of [A]_B holds the coordinates of A b_j in the basis B.' });
          r.inv.set(`\\operatorname{tr}[A]_B = ${texValue(L.trace(AB, G))} = \\operatorname{tr}A,\\qquad \\det[A]_B = ${texValue(L.det(AB, G))} = \\det A`);
          const isDiag = G.isZero(AB[0][1]) && G.isZero(AB[1][0]);
          r.diag.set({ html: `<span class="badge ${isDiag ? 'badge--ok' : ''}">${tr(isDiag ? { es: 'Sí: B está formada por vectores propios de A', en: 'Yes: B consists of eigenvectors of A' } : { es: 'No', en: 'No' })}</span>` });
        } else {
          r.AB.set(`\\text{${tr({ es: 'B no es base', en: 'B is not a basis' })}}`);
          r.inv.set('\\text{—}'); r.diag.set('\\text{—}');
        }
      }
      ctx.setLegend(coords ? [
        { color: 'var(--tgrid)', label: { es: 'cuadrícula de la base B', en: 'grid of basis B' } },
        { color: 'var(--c-i)', tex: '\\mathbf{b}_1' },
        { color: 'var(--c-j)', tex: '\\mathbf{b}_2' },
        state.show.includes('v') && { color: 'var(--c-v)', tex: '\\vec{v}' },
      ] : [
        { color: 'var(--tgrid)', label: { es: 'imagen de la cuadrícula de B bajo A', en: 'image of B’s grid under A' } },
        { color: 'var(--c-i)', tex: 'A\\mathbf{b}_1' },
        { color: 'var(--c-j)', tex: 'A\\mathbf{b}_2' },
      ]);
      return { valid, cB, AB, G, state };
    }

    return { render, snapshot: () => plane.snapshot(), togglePlay: () => anim.toggle(), onReset: () => { anim.pause(); plane.resetView(); } };
  },

  learn: {
    what: {
      es: `<p>Una base $B = \\{\\mathbf{b}_1, \\mathbf{b}_2\\}$ es otra forma de poner una cuadrícula sobre el plano (la de colores). Las <strong>coordenadas</strong> de $\\vec{v}$ en $B$ son los números $c_1, c_2$ tales que $\\vec{v} = c_1\\mathbf{b}_1 + c_2\\mathbf{b}_2$: cuántos pasos de $\\mathbf{b}_1$ y cuántos de $\\mathbf{b}_2$ llevan del origen a la punta de la flecha (el camino punteado).</p>
<p>La matriz $P = [\\,\\mathbf{b}_1\\;\\mathbf{b}_2\\,]$ traduce del «idioma» de $B$ al canónico: $\\vec{v} = P\\,[\\vec{v}]_B$. Su inversa traduce en sentido contrario. Puedes escribir cualquiera de los dos vectores de coordenadas y ver el otro.</p>
<p>En el modo <strong>Transformación en la base B</strong>, la matriz $A$ (escrita en coordenadas canónicas) actúa sobre la cuadrícula de $B$. Quien «habla» en la base $B$ describe la misma transformación con la matriz $[A]_B = P^{-1}AP$: traducir a canónicas, aplicar $A$ y volver a traducir. Cuando $B$ está formada por vectores propios, $[A]_B$ es diagonal.</p>`,
      en: `<p>A basis $B = \\{\\mathbf{b}_1, \\mathbf{b}_2\\}$ is another way of laying a grid over the plane (the coloured one). The <strong>coordinates</strong> of $\\vec{v}$ in $B$ are the numbers $c_1, c_2$ such that $\\vec{v} = c_1\\mathbf{b}_1 + c_2\\mathbf{b}_2$: how many steps of $\\mathbf{b}_1$ and of $\\mathbf{b}_2$ take you from the origin to the tip of the arrow (the dashed path).</p>
<p>The matrix $P = [\\,\\mathbf{b}_1\\;\\mathbf{b}_2\\,]$ translates from $B$’s “language” to the standard one: $\\vec{v} = P\\,[\\vec{v}]_B$. Its inverse translates the other way. You can type either coordinate vector and see the other.</p>
<p>In <strong>Map in basis B</strong> mode, the matrix $A$ (written in standard coordinates) acts on $B$’s grid. Someone “speaking” basis $B$ describes the same map with the matrix $[A]_B = P^{-1}AP$: translate to standard, apply $A$, translate back. When $B$ consists of eigenvectors, $[A]_B$ is diagonal.</p>`,
    },
    prompts: {
      es: [
        'Arrastra $\\vec{v}$: cerca de los nodos de la cuadrícula de $B$ se engancha a coordenadas enteras o semienteras en $B$. ¿Qué coordenadas canónicas tiene cada nodo?',
        'Escribe $[\\vec{v}]_B = (1, 0)$. ¿Dónde queda $\\vec{v}$? ¿Por qué?',
        'Haz $\\mathbf{b}_2$ paralelo a $\\mathbf{b}_1$. ¿Qué pasa con la cuadrícula y con las coordenadas?',
        'En el modo transformación, con $A = \\begin{bmatrix}2&1\\\\1&2\\end{bmatrix}$, elige la base «Diagonales». ¿Qué forma tiene $[A]_B$? ¿Qué son $\\mathbf{b}_1$ y $\\mathbf{b}_2$ para $A$?',
        'Comprueba que la traza y el determinante no dependen de la base elegida. ¿Qué otras cantidades crees que son invariantes?',
      ],
      en: [
        'Drag $\\vec{v}$: near the nodes of $B$’s grid it snaps to integer or half-integer $B$-coordinates. What standard coordinates does each node have?',
        'Type $[\\vec{v}]_B = (1, 0)$. Where does $\\vec{v}$ end up? Why?',
        'Make $\\mathbf{b}_2$ parallel to $\\mathbf{b}_1$. What happens to the grid and to the coordinates?',
        'In map mode, with $A = \\begin{bmatrix}2&1\\\\1&2\\end{bmatrix}$, pick the “Diagonals” basis. What does $[A]_B$ look like? What are $\\mathbf{b}_1$ and $\\mathbf{b}_2$ for $A$?',
        'Check that the trace and the determinant do not depend on the chosen basis. Which other quantities do you think are invariant?',
      ],
    },
    formal: [
      {
        kind: 'definition',
        title: { es: 'Coordenadas respecto de una base', en: 'Coordinates with respect to a basis' },
        body: {
          es: '<p>Si $B = (\\mathbf{b}_1,\\dots,\\mathbf{b}_n)$ es una base (ordenada) de $\\mathbb{R}^n$, cada $\\mathbf{v}$ se escribe de forma <em>única</em> como $\\mathbf{v} = \\sum_i c_i\\mathbf{b}_i$; el vector $[\\mathbf{v}]_B = (c_1,\\dots,c_n)$ son sus coordenadas. Con $P = [\\,\\mathbf{b}_1\\,\\cdots\\,\\mathbf{b}_n\\,]$ se tiene $\\mathbf{v} = P[\\mathbf{v}]_B$ y $[\\mathbf{v}]_B = P^{-1}\\mathbf{v}$. La unicidad equivale a la independencia lineal, es decir, a $\\det P\\neq 0$.</p>',
          en: '<p>If $B = (\\mathbf{b}_1,\\dots,\\mathbf{b}_n)$ is an (ordered) basis of $\\mathbb{R}^n$, each $\\mathbf{v}$ can be written <em>uniquely</em> as $\\mathbf{v} = \\sum_i c_i\\mathbf{b}_i$; the vector $[\\mathbf{v}]_B = (c_1,\\dots,c_n)$ holds its coordinates. With $P = [\\,\\mathbf{b}_1\\,\\cdots\\,\\mathbf{b}_n\\,]$ we have $\\mathbf{v} = P[\\mathbf{v}]_B$ and $[\\mathbf{v}]_B = P^{-1}\\mathbf{v}$. Uniqueness is equivalent to linear independence, i.e. to $\\det P\\neq 0$.</p>',
        },
      },
      {
        kind: 'theorem',
        title: { es: 'Matriz de una transformación en otra base', en: 'Matrix of a map in another basis' },
        body: {
          es: '<p>Si $T(\\mathbf{x}) = A\\mathbf{x}$ en la base canónica, su matriz en la base $B$ es $$[T]_B = P^{-1}AP,$$ es decir, $[T(\\mathbf{v})]_B = [T]_B\\,[\\mathbf{v}]_B$. Dos matrices relacionadas así se llaman <strong>semejantes</strong>: representan la misma transformación. Las matrices semejantes tienen el mismo polinomio característico, y por tanto la misma traza, el mismo determinante y los mismos valores propios.</p>',
          en: '<p>If $T(\\mathbf{x}) = A\\mathbf{x}$ in the standard basis, its matrix in the basis $B$ is $$[T]_B = P^{-1}AP,$$ that is, $[T(\\mathbf{v})]_B = [T]_B\\,[\\mathbf{v}]_B$. Two matrices related this way are called <strong>similar</strong>: they represent the same map. Similar matrices share the characteristic polynomial, hence the trace, the determinant and the eigenvalues.</p>',
        },
      },
      {
        kind: 'corollary',
        title: { es: 'Diagonalización', en: 'Diagonalization' },
        body: {
          es: '<p>$[T]_B$ es diagonal si y solo si cada $\\mathbf{b}_j$ es un vector propio de $A$; entonces $A = PDP^{-1}$ con $D = \\operatorname{diag}(\\lambda_1,\\dots,\\lambda_n)$. Si además $B$ es ortonormal ($P^{-1} = P^{\\mathsf T}$), como ocurre para toda matriz simétrica por el teorema espectral, $A = PDP^{\\mathsf T}$.</p>',
          en: '<p>$[T]_B$ is diagonal if and only if each $\\mathbf{b}_j$ is an eigenvector of $A$; then $A = PDP^{-1}$ with $D = \\operatorname{diag}(\\lambda_1,\\dots,\\lambda_n)$. If moreover $B$ is orthonormal ($P^{-1} = P^{\\mathsf T}$), as happens for every symmetric matrix by the spectral theorem, $A = PDP^{\\mathsf T}$.</p>',
        },
      },
    ],
  },

  challenges: [
    {
      id: 'coords11',
      title: { es: 'Coordenadas (1, 1)', en: 'Coordinates (1, 1)' },
      text: { es: 'Con $\\vec{v} = (3, 1)$ fijo, encuentra una base en la que $[\\vec{v}]_B = (1, 1)$.', en: 'With $\\vec{v} = (3, 1)$ fixed, find a basis in which $[\\vec{v}]_B = (1, 1)$.' },
      hint: { es: 'Necesitas $\\mathbf{b}_1 + \\mathbf{b}_2 = \\vec{v}$ y que no sean paralelos.', en: 'You need $\\mathbf{b}_1 + \\mathbf{b}_2 = \\vec{v}$ with non-parallel vectors.' },
      setup: (store) => store.set({ mode: 'coords', v: V([3, 1]), P: M([[1, 0], [0, 1]]), show: ['v', 'std'] }),
      check: (s, d) => d.valid && Math.abs(s.v[0].x - 3) < 1e-9 && Math.abs(s.v[1].x - 1) < 1e-9 && d.cB && d.cB.every((c) => Math.abs(d.G.toNumber(c) - 1) < 1e-9),
    },
    {
      id: 'diag',
      title: { es: 'Diagonaliza', en: 'Diagonalize' },
      text: { es: 'Encuentra una base en la que $A = \\begin{bmatrix}3&1\\\\0&2\\end{bmatrix}$ sea diagonal.', en: 'Find a basis in which $A = \\begin{bmatrix}3&1\\\\0&2\\end{bmatrix}$ is diagonal.' },
      hint: { es: 'Busca las dos rectas que $A$ no hace girar: una es el eje $x$.', en: 'Look for the two lines that $A$ does not turn: one of them is the $x$-axis.' },
      setup: (store) => store.set({ mode: 'similar', A: M([[3, 1], [0, 2]]), P: M([[1, 0], [1, 1]]), t: 1 }),
      check: (s, d) => d.valid && d.AB && s.A[0][0].x === 3 && s.A[0][1].x === 1 && s.A[1][0].x === 0 && s.A[1][1].x === 2 && d.G.isZero(d.AB[0][1]) && d.G.isZero(d.AB[1][0]),
    },
    {
      id: 'ortho',
      title: { es: 'Una base ortonormal nueva', en: 'A new orthonormal basis' },
      text: { es: 'Construye una base ortonormal que no esté alineada con los ejes, usando solo números racionales.', en: 'Build an orthonormal basis not aligned with the axes, using rational numbers only.' },
      hint: { es: 'Piensa en ternas pitagóricas: $3^2 + 4^2 = 5^2$.', en: 'Think of Pythagorean triples: $3^2 + 4^2 = 5^2$.' },
      setup: (store) => store.set({ mode: 'coords', P: M([[2, -1], [1, 1]]) }),
      check: (s) => {
        const P = s.P.map((r) => r.map((e) => e.x));
        const b1 = [P[0][0], P[1][0]], b2 = [P[0][1], P[1][1]];
        const unit = (b) => Math.abs(b[0] * b[0] + b[1] * b[1] - 1) < 1e-9;
        const rational = s.P.every((r) => r.every((e) => e.q));
        const aligned = [b1, b2].some((b) => Math.abs(b[0]) < 1e-9 || Math.abs(b[1]) < 1e-9);
        return rational && unit(b1) && unit(b2) && Math.abs(b1[0] * b2[0] + b1[1] * b2[1]) < 1e-9 && !aligned;
      },
    },
    {
      id: 'shear2',
      title: { es: 'La misma cizalla, otro número', en: 'Same shear, another number' },
      text: { es: 'Con $A = \\begin{bmatrix}1&1\\\\0&1\\end{bmatrix}$, encuentra una base en la que $[A]_B = \\begin{bmatrix}1&2\\\\0&1\\end{bmatrix}$.', en: 'With $A = \\begin{bmatrix}1&1\\\\0&1\\end{bmatrix}$, find a basis in which $[A]_B = \\begin{bmatrix}1&2\\\\0&1\\end{bmatrix}$.' },
      hint: { es: 'Deja $\\mathbf{b}_1 = (1,0)$ y cambia la longitud de $\\mathbf{b}_2$.', en: 'Keep $\\mathbf{b}_1 = (1,0)$ and change the length of $\\mathbf{b}_2$.' },
      setup: (store) => store.set({ mode: 'similar', A: M([[1, 1], [0, 1]]), P: M([[1, 0], [0, 1]]), t: 1 }),
      check: (s, d) => d.valid && d.AB && [[1, 2], [0, 1]].every((row, i) => row.every((x, j) => Math.abs(d.G.toNumber(d.AB[i][j]) - x) < 1e-9))
        && [[1, 1], [0, 1]].every((row, i) => row.every((x, j) => Math.abs(s.A[i][j].x - x) < 1e-12)),
    },
  ],
});

// ---------------------------------------------------------------------------

function fromField(x, F) {
  if (F === RationalField) return makeEntry(x.toString());
  return entryFromNumber(x);
}
function plainEntry(x, F) {
  if (F === RationalField) return x.toString();
  return String(Math.round(x * 1e6) / 1e6);
}
function coef(x, F) { return texValue(x); }
function plusCoef(x, F) {
  const t = texValue(x);
  return t.startsWith('-') ? `- ${t.slice(1)}` : `+ ${t}`;
}
