import { createLab } from '../ui/shell.js';
import { codec, M, V } from '../ui/store.js';
import { Plane2D } from '../ui/plane2d.js';
import { card, matrixEditor, vectorEditor, flagChip, readout, animator, segmented, button, stageLabels } from '../ui/controls.js';
import { h } from '../ui/dom.js';
import { tr, setText } from '../ui/i18n.js';
import { entryFromNumber, makeEntry } from '../core/parse.js';
import * as L from '../core/linalg.js';
import { texValue, texVector, texMatrix, cls } from '../core/format.js';
import { COLS, COL_VARS, presetSelect } from './common.js';

const PRESETS = [
  { id: 'id', label: { es: 'Identidad', en: 'Identity' }, value: [[1, 0], [0, 1]] },
  { id: 'rot90', label: { es: 'Rotación 90°', en: 'Rotation 90°' }, value: [[0, -1], [1, 0]] },
  { id: 'rot45', label: { es: 'Rotación 45°', en: 'Rotation 45°' }, value: [['√2/2', '-√2/2'], ['√2/2', '√2/2']] },
  { id: 'shear', label: { es: 'Cizalla horizontal', en: 'Horizontal shear' }, value: [[1, 1], [0, 1]] },
  { id: 'shearv', label: { es: 'Cizalla vertical', en: 'Vertical shear' }, value: [[1, 0], [1, 1]] },
  { id: 'scale', label: { es: 'Escalamiento (2, ½)', en: 'Scaling (2, ½)' }, value: [[2, 0], [0, 0.5]] },
  { id: 'reflx', label: { es: 'Reflexión eje x', en: 'Reflection x-axis' }, value: [[1, 0], [0, -1]] },
  { id: 'refly', label: { es: 'Reflexión eje y', en: 'Reflection y-axis' }, value: [[-1, 0], [0, 1]] },
  { id: 'reflyx', label: { es: 'Reflexión y = x', en: 'Reflection y = x' }, value: [[0, 1], [1, 0]] },
  { id: 'projx', label: { es: 'Proyección eje x', en: 'Projection x-axis' }, value: [[1, 0], [0, 0]] },
];

const product = (S, F) => L.mulFloat(S, F);

createLab({
  id: 'comp',
  lead: {
    es: 'Aplicar una transformación y luego otra es multiplicar matrices, de derecha a izquierda. Cambia el orden y mira cómo cambia el resultado.',
    en: 'Applying one map and then another is multiplying matrices, right to left. Swap the order and see the result change.',
  },
  state: {
    M1: { def: M([[0, -1], [1, 0]]), codec: codec.matrix(2, 2) },
    M2: { def: M([[1, 1], [0, 1]]), codec: codec.matrix(2, 2) },
    first: { def: '1', codec: codec.enum(['1', '2']) },
    active: { def: '1', codec: codec.enum(['1', '2']) },
    v: { def: V([1, 1]), codec: codec.vector(2) },
    t: { def: 2, codec: codec.num(0, 2) },
    show: { def: ['other'], codec: codec.flags(['other', 'det', 'v', 'cols']) },
  },

  build(ctx) {
    const { store } = ctx;
    const plane = new Plane2D(ctx.addView(), { range: 4.2 });
    const anim = animator({ store, key: 't', max: 2 });
    ctx.bar.append(anim.el);
    const stageInfo = stageLabels();
    anim.el.append(stageInfo.el);

    const key = (n) => `M${n}`;
    const order = (s) => (s.first === '1' ? ['1', '2'] : ['2', '1']);
    const setCol = (j) => ([x, y]) => {
      const k = key(store.get('active'));
      const A = store.get(k).map((row) => row.slice());
      A[0][j] = entryFromNumber(x); A[1][j] = entryFromNumber(y);
      store.set({ [k]: A });
    };
    const colOf = (j) => () => { const A = store.get(key(store.get('active'))); return [A[0][j].x, A[1][j].x]; };
    plane.addHandle({ id: 'i', color: 'i', get: colOf(0), set: setCol(0) });
    plane.addHandle({ id: 'j', color: 'j', get: colOf(1), set: setCol(1) });
    plane.addHandle({ id: 'v', color: 'v', visible: () => store.get('show').includes('v'), get: () => store.get('v').map((e) => e.x), set: ([x, y]) => store.set({ v: [entryFromNumber(x), entryFromNumber(y)] }) });

    // Panel ---------------------------------------------------------------------
    const editors = ['1', '2'].map((n) => matrixEditor({
      rows: 2, cols: 2, colColors: COL_VARS, label: `M_{${n}} =`, name: { es: `Matriz M${n}`, en: `Matrix M${n}` },
      get: () => store.get(key(n)), set: (A) => store.set({ [key(n)]: A }),
    }));
    const presets = ['1', '2'].map((n) => presetSelect({ store, key: key(n), presets: PRESETS }));
    const activeSeg = segmented({
      options: [{ value: '1', tex: 'M_1' }, { value: '2', tex: 'M_2' }],
      get: () => store.get('active'), set: (active) => store.set({ active }),
      label: { es: 'Matriz que se edita en el lienzo', en: 'Matrix edited on the canvas' },
    });
    const activeLabel = h('span', { class: 'label' });
    setText(activeLabel, { es: 'Arrastrar en el lienzo:', en: 'Drag on the canvas:' });
    const matricesCard = card({
      title: { es: 'Matrices', en: 'Matrices' },
      body: [
        editors[0].el, presets[0].el,
        editors[1].el, presets[1].el,
        h('div', { class: 'row' }, activeLabel, activeSeg.el),
      ],
    });

    const orderSeg = segmented({
      options: [
        { value: '1', tex: 'M_2 M_1', title: { es: 'Primero M₁, después M₂', en: 'First M₁, then M₂' } },
        { value: '2', tex: 'M_1 M_2', title: { es: 'Primero M₂, después M₁', en: 'First M₂, then M₁' } },
      ],
      get: () => store.get('first'), set: (first) => store.set({ first }),
      label: { es: 'Orden de aplicación', en: 'Order of application' },
    });
    const swapBtn = button({ label: { es: 'Invertir orden', en: 'Swap order' }, iconName: 'swap', small: true, onClick: () => store.set({ first: store.get('first') === '1' ? '2' : '1' }) });
    const orderNote = h('p');
    const chips = [
      flagChip(store, 'show', 'other', { es: 'Comparar con el otro orden', en: 'Compare with the other order' }, 'var(--c-w)'),
      flagChip(store, 'show', 'cols', { es: 'Columnas de la matriz activa', en: 'Columns of the active matrix' }, 'var(--c-i)'),
      flagChip(store, 'show', 'det', { es: 'Determinante', en: 'Determinant' }, 'var(--c-det)'),
      flagChip(store, 'show', 'v', { es: 'Vector v', en: 'Vector v' }, 'var(--c-v)'),
    ];
    const vEditor = vectorEditor({ n: 2, get: () => store.get('v'), set: (v) => store.set({ v }), label: '\\vec{v} =' });
    const vRow = h('div', null, vEditor.el);
    const orderCard = card({ title: { es: 'Orden y opciones', en: 'Order and options' }, body: [h('div', { class: 'row' }, orderSeg.el, swapBtn), orderNote, h('div', { class: 'chip-row' }, chips.map((c) => c.el)), vRow] });

    const r = {
      prod: readout({ es: 'Composición', en: 'Composition' }, { block: true }),
      other: readout({ es: 'Otro orden', en: 'Other order' }, { block: true }),
      comm: readout({ es: '¿Conmutan?', en: 'Do they commute?' }),
      det: readout({ es: 'Determinantes', en: 'Determinants' }, { block: true }),
      inv: readout({ es: 'Inversa', en: 'Inverse' }, { block: true }),
      v: readout(null, { labelTex: '\\vec{v}' }),
    };
    const resultsCard = card({ title: { es: 'Resultado exacto', en: 'Exact result' }, body: [h('div', { class: 'readouts' }, Object.values(r).map((x) => x.el))] });
    ctx.panel.append(matricesCard.el, orderCard.el, resultsCard.el);

    // Drawing -------------------------------------------------------------------
    let cur = null;
    const transformAt = (t, Fm, Sm) => {
      const I = L.identityFloat(2);
      if (t <= 1) return L.lerpMatrix(I, Fm, t);
      return product(L.lerpMatrix(I, Sm, t - 1), Fm);
    };

    plane.setDraw((g) => {
      if (!cur) return;
      const { Fm, Sm, t, show, v, activeM, active } = cur;
      const Mt = transformAt(t, Fm, Sm);
      g.backgroundGrid();
      if (show.includes('other')) {
        const other = product(Fm, Sm); // the opposite order, final state
        g.transformedGrid(other, { color: g.c.w, width: 1.2, alpha: 0.55, axes: false });
        g.infiniteLine([0, 0], [other[0][0], other[1][0]], { color: g.c.w, width: 1.5, dash: [6, 5], alpha: 0.8 });
        g.infiniteLine([0, 0], [other[0][1], other[1][1]], { color: g.c.w, width: 1.5, dash: [6, 5], alpha: 0.8 });
      }
      if (t > 1 && t < 2) {
        g.transformedGrid(Fm, { color: g.c.tgrid, width: 1, alpha: 0.18, axes: false });
      }
      g.transformedGrid(Mt, { color: g.c.tgrid });
      if (show.includes('det')) {
        const sq = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => L.mv2(Mt, x, y));
        const d = L.det2(Mt);
        const col = d < -1e-12 ? g.c.detNeg : g.c.det;
        g.polygon(sq, { fill: col, stroke: col, width: 2, fillAlpha: 0.22 });
      }
      if (show.includes('cols')) {
        const c1 = [activeM[0][0], activeM[1][0]], c2 = [activeM[0][1], activeM[1][1]];
        g.arrow([0, 0], c1, { color: g.c.i, width: 2, dash: [5, 4], alpha: 0.8 });
        g.arrow([0, 0], c2, { color: g.c.j, width: 2, dash: [5, 4], alpha: 0.8 });
        g.text(c1, `M${active}î`, { color: g.c.i, offset: [10, 14], size: 11 });
        g.text(c2, `M${active}ĵ`, { color: g.c.j, offset: [10, 14], size: 11 });
      }
      g.arrow([0, 0], [1, 0], { color: g.c.i, width: 2, alpha: 0.28 });
      g.arrow([0, 0], [0, 1], { color: g.c.j, width: 2, alpha: 0.28 });
      const ti = L.mv2(Mt, 1, 0), tj = L.mv2(Mt, 0, 1);
      g.arrow([0, 0], ti, { color: g.c.i, width: 3.5 });
      g.arrow([0, 0], tj, { color: g.c.j, width: 3.5 });
      g.mathLabel(ti, 'i', { color: g.c.i, deco: 'hat', away: tj });
      g.mathLabel(tj, 'j', { color: g.c.j, deco: 'hat', away: ti });
      if (show.includes('v')) {
        const tv = L.mv2(Mt, v[0], v[1]);
        g.arrow([0, 0], v, { color: g.c.v, width: 2, alpha: 0.35, dash: [6, 5] });
        g.arrow([0, 0], tv, { color: g.c.v, width: 3.5 });
        g.mathLabel(tv, 'v', { color: g.c.v, deco: 'arrow' });
      }
    });

    function render(state) {
      const [fn, sn] = order(state);
      const Fe = state[key(fn)], Se = state[key(sn)];
      const Fm = Fe.map((row) => row.map((e) => e.x)), Sm = Se.map((row) => row.map((e) => e.x));
      cur = { Fm, Sm, t: state.t, show: state.show, v: state.v.map((e) => e.x), activeM: state[key(state.active)].map((row) => row.map((e) => e.x)), active: state.active };
      plane.requestRender();
      editors.forEach((e) => e.update()); vEditor.update(); anim.update(); activeSeg.update(); orderSeg.update();
      chips.forEach((c) => c.update());
      vRow.hidden = !state.show.includes('v');
      setText(orderNote, fn === '1'
        ? { es: 'Primero M₁ y después M₂: la matriz de la composición es M₂M₁ (se lee de derecha a izquierda).', en: 'First M₁, then M₂: the matrix of the composition is M₂M₁ (read right to left).' }
        : { es: 'Primero M₂ y después M₁: la matriz de la composición es M₁M₂ (se lee de derecha a izquierda).', en: 'First M₂, then M₁: the matrix of the composition is M₁M₂ (read right to left).' });
      const t = state.t;
      stageInfo.update([`1.\\;M_{${fn}}`, `2.\\;M_{${sn}}`], t <= 1 ? 0 : 1);

      // Exact algebra (both matrices in a common field).
      const { F, M: both } = L.fieldMatrix([...Fe, ...Se]);
      const Fx = both.slice(0, 2), Sx = both.slice(2);
      const P = L.matMul(Sx, Fx, F), Q = L.matMul(Fx, Sx, F);
      const nameP = `M_{${sn}}M_{${fn}}`, nameQ = `M_{${fn}}M_{${sn}}`;
      const SUB = { 1: '₁', 2: '₂' };
      const plainP = `M${SUB[sn]}M${SUB[fn]}`, plainQ = `M${SUB[fn]}M${SUB[sn]}`;
      r.prod.set(`${nameP} = ${texMatrix(Sx, { colClasses: COLS })}${texMatrix(Fx, { colClasses: COLS })} = ${texMatrix(P)}`, {
        es: `Cada columna de ${plainP} es M${SUB[sn]} aplicada a la columna correspondiente de M${SUB[fn]}.`,
        en: `Each column of ${plainP} is M${SUB[sn]} applied to the matching column of M${SUB[fn]}.`,
      });
      r.other.set(`${nameQ} = ${texMatrix(Q)}`);
      const commute = L.matEq(P, Q, F);
      r.comm.set({ html: `<span class="badge ${commute ? 'badge--ok' : 'badge--warn'}">${tr(commute ? { es: 'Sí: M₁M₂ = M₂M₁', en: 'Yes: M₁M₂ = M₂M₁' } : { es: 'No: M₁M₂ ≠ M₂M₁', en: 'No: M₁M₂ ≠ M₂M₁' })}</span>` });
      const d1 = L.det(Fx, F), d2 = L.det(Sx, F), dp = L.det(P, F);
      r.det.set(`\\det(${nameP}) = \\det M_{${sn}}\\cdot\\det M_{${fn}} = ${texValue(d2)}\\cdot ${paren(texValue(d1))} = ${texValue(dp)}`);
      const iF = L.inverse(Fx, F), iS = L.inverse(Sx, F);
      if (iF && iS) {
        r.inv.set(`(${nameP})^{-1} = M_{${fn}}^{-1}M_{${sn}}^{-1} = ${texMatrix(L.matMul(iF, iS, F))}`, {
          es: 'Para deshacer la composición se deshacen los pasos en orden inverso.',
          en: 'To undo the composition, undo the steps in reverse order.',
        });
      } else {
        r.inv.set(`\\text{${tr({ es: 'no existe: alguna de las dos matrices es singular', en: 'does not exist: one of the matrices is singular' })}}`);
      }
      if (state.show.includes('v')) {
        const vf = L.fieldVector(state.v, F);
        const w1 = L.matVec(Fx, vf, F), w2 = L.matVec(Sx, w1, F);
        r.v.set(`${cls('c-v', texVector(vf))} \\xrightarrow{M_{${fn}}} ${texVector(w1)} \\xrightarrow{M_{${sn}}} ${cls('c-v', texVector(w2))}`);
        r.v.show(true);
      } else r.v.show(false);

      ctx.setLegend([
        { color: 'var(--tgrid)', label: { es: `composición ${plainP}`, en: `composition ${plainP}` } },
        state.show.includes('other') && { color: 'var(--c-w)', kind: 'dash', label: { es: `otro orden ${plainQ}`, en: `other order ${plainQ}` } },
        { color: 'var(--c-i)', tex: '\\hat{\\imath}' },
        { color: 'var(--c-j)', tex: '\\hat{\\jmath}' },
        state.show.includes('det') && { color: 'var(--c-det)', kind: 'area', label: { es: 'imagen del cuadrado unidad', en: 'image of the unit square' } },
      ]);
      return { F, P, Q, commute };
    }

    return { render, snapshot: () => plane.snapshot(), togglePlay: () => anim.toggle(), onReset: () => { anim.pause(); plane.resetView(); } };
  },

  learn: {
    what: {
      es: `<p>La animación tiene dos etapas. Entre $t=0$ y $t=1$ se aplica la primera matriz; entre $t=1$ y $t=2$ se aplica la segunda <em>sobre el resultado</em>. Si primero actúa $M_1$ y después $M_2$, un vector $\\mathbf{v}$ termina en $M_2(M_1\\mathbf{v}) = (M_2M_1)\\mathbf{v}$: la matriz de la composición es el producto, leído de derecha a izquierda como la composición de funciones $M_2\\circ M_1$.</p>
<p>La cuadrícula punteada en cian muestra el resultado final del <strong>otro orden</strong>. Casi siempre las dos cuadrículas difieren: el producto de matrices no es conmutativo. Las columnas de $M_2M_1$ son $M_2$ aplicada a las columnas de $M_1$; por eso para seguir a $\\hat{\\imath}$ basta seguir la primera columna.</p>
<p>Las cruces del lienzo editan la matriz activa ($M_1$ o $M_2$); sus columnas siempre se describen en la base canónica, no en la cuadrícula ya transformada.</p>`,
      en: `<p>The animation has two stages. Between $t=0$ and $t=1$ the first matrix is applied; between $t=1$ and $t=2$ the second one is applied <em>to the result</em>. If $M_1$ acts first and $M_2$ second, a vector $\\mathbf{v}$ ends at $M_2(M_1\\mathbf{v}) = (M_2M_1)\\mathbf{v}$: the matrix of the composition is the product, read right to left like the composition of functions $M_2\\circ M_1$.</p>
<p>The dashed cyan grid shows the final result of the <strong>other order</strong>. The two grids almost always differ: matrix multiplication is not commutative. The columns of $M_2M_1$ are $M_2$ applied to the columns of $M_1$; to follow $\\hat{\\imath}$ you only need to follow the first column.</p>
<p>The crosshairs edit the active matrix ($M_1$ or $M_2$); its columns are always described in the standard basis, not in the already transformed grid.</p>`,
    },
    prompts: {
      es: [
        'Con la rotación y la cizalla iniciales, pulsa «Invertir orden». ¿En qué se diferencian $M_2M_1$ y $M_1M_2$ geométricamente?',
        'Elige dos rotaciones para $M_1$ y $M_2$. ¿Conmutan? ¿Por qué tiene sentido geométricamente?',
        'Elige dos reflexiones distintas. ¿Qué tipo de transformación es la composición? Mira el determinante.',
        'Pon $M_1$ = proyección sobre el eje $x$ y $M_2$ = rotación de 90°. ¿Cuál es el núcleo de cada orden?',
        'Comprueba en los resultados que $\\det(M_2M_1) = \\det M_2\\det M_1$ para cualquier par que construyas. ¿Qué dice esto sobre áreas?',
      ],
      en: [
        'With the initial rotation and shear, press “Swap order”. How do $M_2M_1$ and $M_1M_2$ differ geometrically?',
        'Pick two rotations for $M_1$ and $M_2$. Do they commute? Why does that make geometric sense?',
        'Pick two different reflections. What kind of map is the composition? Look at the determinant.',
        'Set $M_1$ = projection onto the $x$-axis and $M_2$ = rotation by 90°. What is the kernel of each order?',
        'Check in the results that $\\det(M_2M_1) = \\det M_2\\det M_1$ for any pair you build. What does this say about areas?',
      ],
    },
    formal: [
      {
        kind: 'proposition',
        title: { es: 'La matriz de una composición es el producto', en: 'The matrix of a composition is the product' },
        body: {
          es: '<p>Si $S(\\mathbf{x}) = A\\mathbf{x}$ y $T(\\mathbf{x}) = B\\mathbf{x}$, entonces $(T\\circ S)(\\mathbf{x}) = B(A\\mathbf{x}) = (BA)\\mathbf{x}$. La $j$-ésima columna de $BA$ es $B\\,\\mathbf{a}_j$, donde $\\mathbf{a}_j$ es la $j$-ésima columna de $A$. El producto es asociativo, $(CB)A = C(BA)$, porque la composición de funciones lo es.</p>',
          en: '<p>If $S(\\mathbf{x}) = A\\mathbf{x}$ and $T(\\mathbf{x}) = B\\mathbf{x}$, then $(T\\circ S)(\\mathbf{x}) = B(A\\mathbf{x}) = (BA)\\mathbf{x}$. The $j$-th column of $BA$ is $B\\,\\mathbf{a}_j$, where $\\mathbf{a}_j$ is the $j$-th column of $A$. The product is associative, $(CB)A = C(BA)$, because composition of functions is.</p>',
        },
      },
      {
        kind: 'remark',
        title: { es: 'No conmutatividad', en: 'Non-commutativity' },
        body: {
          es: '<p>En general $AB\\neq BA$. Por ejemplo, con la rotación $R = \\begin{bmatrix}0&-1\\\\1&0\\end{bmatrix}$ y la cizalla $C=\\begin{bmatrix}1&1\\\\0&1\\end{bmatrix}$ se obtiene $CR = \\begin{bmatrix}1&-1\\\\1&0\\end{bmatrix}$ y $RC = \\begin{bmatrix}0&-1\\\\1&1\\end{bmatrix}$. Sí conmutan, por ejemplo, dos rotaciones del plano, una matriz con sus potencias, o dos matrices diagonales.</p>',
          en: '<p>In general $AB\\neq BA$. For instance, with the rotation $R = \\begin{bmatrix}0&-1\\\\1&0\\end{bmatrix}$ and the shear $C=\\begin{bmatrix}1&1\\\\0&1\\end{bmatrix}$ we get $CR = \\begin{bmatrix}1&-1\\\\1&0\\end{bmatrix}$ and $RC = \\begin{bmatrix}0&-1\\\\1&1\\end{bmatrix}$. Two plane rotations do commute, as do a matrix and its powers, or two diagonal matrices.</p>',
        },
      },
      {
        kind: 'theorem',
        title: { es: 'Determinante e inversa de un producto', en: 'Determinant and inverse of a product' },
        body: {
          es: '<p>$\\det(BA) = \\det B\\,\\det A$ (las áreas se multiplican en cada paso). Si $A$ y $B$ son invertibles, $(BA)^{-1} = A^{-1}B^{-1}$: para deshacer «ponerse los calcetines y luego los zapatos» hay que quitarse primero los zapatos.</p>',
          en: '<p>$\\det(BA) = \\det B\\,\\det A$ (areas get multiplied at each step). If $A$ and $B$ are invertible, $(BA)^{-1} = A^{-1}B^{-1}$: to undo “socks, then shoes” you must take off the shoes first.</p>',
        },
      },
    ],
  },

  challenges: [
    {
      id: 'commute',
      title: { es: 'Conmutan', en: 'They commute' },
      text: { es: 'Encuentra $M_1, M_2$ que conmuten sin que ninguna sea múltiplo de la identidad.', en: 'Find $M_1, M_2$ that commute, neither of them a multiple of the identity.' },
      hint: { es: 'Dos rotaciones, o dos matrices diagonales, o una matriz y su cuadrado.', en: 'Two rotations, or two diagonal matrices, or a matrix and its square.' },
      check: (s, d) => d.commute && !isScalar(s.M1) && !isScalar(s.M2),
    },
    {
      id: 'undo',
      title: { es: 'Deshacer', en: 'Undo' },
      text: { es: 'Haz que la composición sea la identidad sin que $M_1$ lo sea.', en: 'Make the composition the identity without $M_1$ being the identity.' },
      hint: { es: '$M_2$ debe ser la inversa de $M_1$.', en: '$M_2$ must be the inverse of $M_1$.' },
      check: (s, d) => isIdentity(d.P, d.F) && !isIdentity(s.M1.map((r) => r.map((e) => e.x)), null),
    },
    {
      id: 'reflect',
      title: { es: 'Dos espejos, un giro', en: 'Two mirrors, one turn' },
      text: { es: 'Con dos reflexiones ($M^2 = I$, $\\det M = -1$), consigue que la composición sea la rotación de 90°.', en: 'Using two reflections ($M^2 = I$, $\\det M = -1$), make the composition the rotation by 90°.' },
      hint: { es: 'La composición de dos reflexiones es una rotación del doble del ángulo entre los espejos. Prueba con el eje $x$ y la recta $y = x$.', en: 'Composing two reflections gives a rotation by twice the angle between the mirrors. Try the $x$-axis and the line $y = x$.' },
      check: (s, d) => isReflection(s.M1) && isReflection(s.M2) && close(d.P, d.F, [[0, -1], [1, 0]]),
    },
    {
      id: 'zero',
      title: { es: 'Nada sobrevive', en: 'Nothing survives' },
      text: { es: 'Haz que la composición sea la matriz nula aunque ni $M_1$ ni $M_2$ lo sean.', en: 'Make the composition the zero matrix although neither $M_1$ nor $M_2$ is zero.' },
      hint: { es: 'La imagen de la primera debe quedar dentro del núcleo de la segunda.', en: 'The image of the first map must lie inside the kernel of the second one.' },
      check: (s, d) => close(d.P, d.F, [[0, 0], [0, 0]]) && !isZeroE(s.M1) && !isZeroE(s.M2),
    },
  ],
});

function paren(tex) { return tex.startsWith('-') ? `(${tex})` : tex; }
const num = (F, x) => (F ? F.toNumber(x) : x);
function close(Mx, F, T) { return T.every((row, i) => row.every((x, j) => Math.abs(num(F, Mx[i][j]) - x) < 1e-9)); }
function isIdentity(Mx, F) { return close(Mx, F, [[1, 0], [0, 1]]); }
function isScalar(E) { const a = E.map((r) => r.map((e) => e.x)); return Math.abs(a[0][1]) < 1e-12 && Math.abs(a[1][0]) < 1e-12 && Math.abs(a[0][0] - a[1][1]) < 1e-12; }
function isZeroE(E) { return E.every((r) => r.every((e) => Math.abs(e.x) < 1e-12)); }
function isReflection(E) {
  const a = E.map((r) => r.map((e) => e.x));
  const a2 = L.mulFloat(a, a);
  return Math.abs(L.det2(a) + 1) < 1e-9 && close(a2, null, [[1, 0], [0, 1]]);
}
