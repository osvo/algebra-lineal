import { createLab } from '../ui/shell.js';
import { codec, M } from '../ui/store.js';
import { Plane2D } from '../ui/plane2d.js';
import { card, matrixEditor, flagChip, readout, animator, stageLabels } from '../ui/controls.js';
import { h } from '../ui/dom.js';
import { tr } from '../ui/i18n.js';
import { entryFromNumber } from '../core/parse.js';
import { RationalField } from '../core/fields.js';
import { Rational } from '../core/rational.js';
import * as L from '../core/linalg.js';
import { eigenAnalysis } from '../core/eigen.js';
import { svd, conditionNumber } from '../core/svd.js';
import { texValue, texMatrix, texSqrt, fmtDecimal, cls } from '../core/format.js';
import { COL_VARS, presetSelect, memo, entriesKey } from './common.js';

const PRESETS = [
  { id: 'default', label: { es: 'σ = 3√5 y √5', en: 'σ = 3√5 and √5' }, value: [[3, 0], [4, 5]] },
  { id: 'shear', label: { es: 'Cizalla', en: 'Shear' }, value: [[1, 1], [0, 1]] },
  { id: 'sym', label: { es: 'Simétrica', en: 'Symmetric' }, value: [[2, 1], [1, 2]] },
  { id: 'rotscale', label: { es: 'Rotación-escalado', en: 'Rotation-scaling' }, value: [[1, -1], [1, 1]] },
  { id: 'refl', label: { es: 'Con reflexión (det < 0)', en: 'With reflection (det < 0)' }, value: [[1, 2], [2, 1]] },
  { id: 'rank1', label: { es: 'Rango 1', en: 'Rank 1' }, value: [[2, 1], [4, 2]] },
  { id: 'ill', label: { es: 'Mal condicionada', en: 'Ill-conditioned' }, value: [[1, 1], [1, '1.1']] },
];

const analyze = memo((A) => {
  const { F, M: Mx } = L.fieldMatrix(A);
  const Af = A.map((r) => r.map((e) => e.x));
  const AtA = L.matMul(L.transpose(Mx), Mx, F);
  const eig = eigenAnalysis({ exact: F === RationalField ? AtA : null, float: L.toFloatMatrix(AtA, F) });
  const dec = svd(Af);
  return { F, Mx, Af, AtA, eig, dec, det: L.det(Mx, F) };
});

const rot = (a) => [[Math.cos(a), -Math.sin(a)], [Math.sin(a), Math.cos(a)]];
const angleOf = (Q) => Math.atan2(Q[1][0], Q[0][0]);

/** Continuous path I → Q for an orthogonal 2×2 Q: a rotation by angle, or rotation ∘ flip for reflections. */
function orthoPath(Q, s) {
  if (L.det2(Q) > 0) return rot(s * angleOf(Q));
  // Q = Rot(φ)·diag(1, −1)
  const phi = Math.atan2(Q[1][0], Q[0][0]);
  return L.mulFloat(rot(s * phi), [[1, 0], [0, 1 - 2 * s]]);
}

createLab({
  id: 'svd',
  lead: {
    es: 'Toda matriz, simétrica o no, es una rotación, un estiramiento a lo largo de dos ejes perpendiculares y otra rotación (quizá con reflexión). Por eso transforma el círculo unitario en una elipse.',
    en: 'Every matrix, symmetric or not, is a rotation, a stretch along two perpendicular axes and another rotation (perhaps with a reflection). That is why it turns the unit circle into an ellipse.',
  },
  state: {
    A: { def: M([[3, 0], [4, 5]]), codec: codec.matrix(2, 2) },
    t: { def: 3, codec: codec.num(0, 3) },
    show: { def: ['circle', 'axes', 'grid'], codec: codec.flags(['circle', 'axes', 'grid', 'rank1']) },
  },

  build(ctx) {
    const { store } = ctx;
    const plane = new Plane2D(ctx.addView(), { range: 7.2 });
    const anim = animator({ store, key: 't', max: 3 });
    ctx.bar.append(anim.el);
    const stageRow = stageLabels();
    anim.el.append(stageRow.el);

    const setCol = (j) => ([x, y]) => {
      const A = store.get('A').map((row) => row.slice());
      A[0][j] = entryFromNumber(x); A[1][j] = entryFromNumber(y);
      anim.pause();
      store.set({ A, t: 3 });
    };
    plane.addHandle({ id: 'i', color: 'i', get: () => [store.get('A')[0][0].x, store.get('A')[1][0].x], set: setCol(0) });
    plane.addHandle({ id: 'j', color: 'j', get: () => [store.get('A')[0][1].x, store.get('A')[1][1].x], set: setCol(1) });

    const editor = matrixEditor({ rows: 2, cols: 2, label: 'A =', colColors: COL_VARS, get: () => store.get('A'), set: (A) => store.set({ A, t: 3 }), name: { es: 'Matriz A', en: 'Matrix A' } });
    const presets = presetSelect({ store, key: 'A', presets: PRESETS, onPick: (p) => { anim.pause(); store.set({ A: M(p.value), t: 3 }); } });
    const chips = [
      flagChip(store, 'show', 'circle', { es: 'Círculo → elipse', en: 'Circle → ellipse' }, 'var(--c-v)'),
      flagChip(store, 'show', 'axes', { es: 'Vectores singulares', en: 'Singular vectors' }, 'var(--c-w)'),
      flagChip(store, 'show', 'grid', { es: 'Cuadrícula', en: 'Grid' }, 'var(--tgrid)'),
      flagChip(store, 'show', 'rank1', { es: 'Aproximación de rango 1', en: 'Rank-1 approximation' }, 'var(--c-eig)'),
    ];
    const matrixCard = card({ title: { es: 'Matriz', en: 'Matrix' }, body: [editor.el, presets.el, h('div', { class: 'chip-row' }, chips.map((c) => c.el))] });
    const r = {
      ata: readout(null, { labelTex: 'A^{\\mathsf T}A', block: true }),
      sig: readout({ es: 'Valores singulares', en: 'Singular values' }, { block: true }),
      dec: readout({ es: 'Descomposición', en: 'Decomposition' }, { block: true }),
      geo: readout({ es: 'Geometría', en: 'Geometry' }, { block: true }),
      cond: readout({ es: 'Condicionamiento', en: 'Conditioning' }, { block: true }),
      r1: readout({ es: 'Rango 1', en: 'Rank 1' }, { block: true }),
    };
    const resultsCard = card({ title: { es: 'Análisis', en: 'Analysis' }, body: [h('div', { class: 'readouts' }, Object.values(r).map((x) => x.el))] });
    ctx.panel.append(matrixCard.el, resultsCard.el);

    let cur = null;
    plane.setDraw((g) => {
      if (!cur) return;
      const { dec, t, show } = cur;
      const { U, V, S } = dec;
      const Vt = L.transpose(V);
      let Mt;
      if (t <= 1) Mt = orthoPath(Vt, t);
      else if (t <= 2) { const s = t - 1; Mt = L.mulFloat([[1 + s * (S[0] - 1), 0], [0, 1 + s * (S[1] - 1)]], Vt); }
      else Mt = L.mulFloat(orthoPath(U, t - 2), L.mulFloat([[S[0], 0], [0, S[1]]], Vt));
      g.backgroundGrid();
      if (show.includes('grid')) g.transformedGrid(Mt, { color: g.c.tgrid, alpha: 0.75 });
      if (show.includes('circle')) {
        g.curve((s) => [Math.cos(s), Math.sin(s)], 0, 2 * Math.PI, 100, { color: g.c.v, width: 1.5, alpha: 0.4, dash: [5, 5] });
        const pts = [];
        for (let k = 0; k <= 160; k++) { const a = (2 * Math.PI * k) / 160; pts.push(L.mv2(Mt, Math.cos(a), Math.sin(a))); }
        g.fillCurve(pts, { color: g.c.v, alpha: 0.08 });
        g.polyline(pts, { color: g.c.v, width: 2.5 });
      }
      if (show.includes('rank1') && t > 2.999) {
        const u1 = [U[0][0], U[1][0]];
        g.line([-S[0] * u1[0], -S[0] * u1[1]], [S[0] * u1[0], S[0] * u1[1]], { color: g.c.eig, width: 6, alpha: 0.5 });
      }
      if (show.includes('axes')) {
        const v1 = [V[0][0], V[1][0]], v2 = [V[0][1], V[1][1]];
        const a1 = L.mv2(Mt, ...v1), a2 = L.mv2(Mt, ...v2);
        g.arrow([0, 0], v1, { color: g.c.w, width: 2, alpha: 0.35, dash: [4, 4] });
        g.arrow([0, 0], v2, { color: g.c.eig, width: 2, alpha: 0.35, dash: [4, 4] });
        g.arrow([0, 0], a1, { color: g.c.w, width: 3.5 });
        g.arrow([0, 0], a2, { color: g.c.eig, width: 3.5 });
        if (Math.hypot(...a1) > 0.01 && Math.hypot(...a2) > 0.01) g.rightAngle([0, 0], a1, a2, { color: g.c.muted, size: 12 });
        const lab = t > 2.999 ? ['σ₁u₁', 'σ₂u₂'] : t < 1e-6 ? ['v₁', 'v₂'] : ['', ''];
        if (lab[0]) g.text(a1, lab[0], { color: g.c.w, offset: [12, -12], font: '"KaTeX_Main", serif', size: 16, italic: true });
        if (lab[1]) g.text(a2, lab[1], { color: g.c.eig, offset: [12, -12], font: '"KaTeX_Main", serif', size: 16, italic: true });
      }
      const ti = L.mv2(Mt, 1, 0), tj = L.mv2(Mt, 0, 1);
      g.arrow([0, 0], ti, { color: g.c.i, width: 2.5, alpha: 0.8 });
      g.arrow([0, 0], tj, { color: g.c.j, width: 2.5, alpha: 0.8 });
    });

    function render(state) {
      const A = state.A;
      const an = analyze(entriesKey(A), A);
      cur = { dec: an.dec, t: state.t, show: state.show };
      plane.requestRender();
      editor.update(); anim.update(); chips.forEach((c) => c.update());
      const t = state.t;
      const reflU = L.det2(an.dec.U) < 0;
      const names = ['V^{\\mathsf T}', '\\Sigma', 'U'];
      stageRow.update(names.map((nm, i) => `${i + 1}.\;${nm}`), Math.min(2, Math.floor(t)));

      const { F, AtA, eig, dec } = an;
      r.ata.set(`A^{\\mathsf T}A = ${texMatrix(AtA)}`, { es: 'Simétrica y semidefinida positiva: sus valores propios son ≥ 0 y sus vectores propios son perpendiculares.', en: 'Symmetric positive semidefinite: its eigenvalues are ≥ 0 and its eigenvectors are perpendicular.' });
      const lams = eig.eigen.flatMap((e) => Array(e.alg).fill(e)).slice(0, 2);
      const sigTex = lams.map((e, i) => {
        const exactSqrt = e.value instanceof Rational && e.value.sign() >= 0;
        const s = exactSqrt ? texSqrt(e.value) : texValue(Math.sqrt(Math.max(0, e.approx.re)));
        const raw = exactSqrt ? `\\sqrt{${texValue(e.value)}}` : '';
        return `\\sigma_{${i + 1}} = \\sqrt{\\lambda_{${i + 1}}} = ${raw && raw !== s ? `${raw} = ` : ''}${s}`;
      });
      r.sig.set(sigTex.join(',\\qquad '), { es: `≈ ${fmtDecimal(dec.S[0], 4)} y ${fmtDecimal(dec.S[1], 4)}. Son las longitudes de los semiejes de la elipse.`, en: `≈ ${fmtDecimal(dec.S[0], 4)} and ${fmtDecimal(dec.S[1], 4)}. They are the lengths of the ellipse’s semi-axes.` });
      const Sig = [[dec.S[0], 0], [0, dec.S[1]]];
      r.dec.set(`A = U\\Sigma V^{\\mathsf T} = ${texMatrix(dec.U, { colClasses: ['c-w', 'c-eig'] })}${texMatrix(Sig)}${texMatrix(L.transpose(dec.V))}`,
        reflU ? { es: 'det A < 0: U es una reflexión (V se eligió como rotación).', en: 'det A < 0: U is a reflection (V was chosen to be a rotation).' } : { es: 'U y V son rotaciones.', en: 'U and V are rotations.' });
      const detTex = texValue(F === RationalField ? an.det.abs() : Math.abs(F.toNumber(an.det)));
      r.geo.set(`\\sigma_1\\sigma_2 = |\\det A| = ${detTex},\\qquad \\sigma_1^2 + \\sigma_2^2 = \\lVert A\\rVert_F^2 = \\operatorname{tr}(A^{\\mathsf T}A) = ${texValue(L.trace(AtA, F))}`,
        { es: 'El área de la elipse es π·σ₁·σ₂ = π·|det A|.', en: 'The ellipse’s area is π·σ₁·σ₂ = π·|det A|.' });
      const kappa = conditionNumber(dec.S);
      let kTex = Number.isFinite(kappa) ? fmtDecimal(kappa, 4, { unicodeMinus: false }) : '\\infty';
      if (lams.length === 2 && lams.every((e) => e.value instanceof Rational) && !lams[1].value.isZero()) kTex = texSqrt(lams[0].value.div(lams[1].value));
      r.cond.set(`\\lVert A\\rVert_2 = \\sigma_1,\\qquad \\kappa(A) = \\frac{\\sigma_1}{\\sigma_2} = ${kTex}`,
        !Number.isFinite(kappa) ? { es: 'σ₂ = 0: A es singular (rango ' + dec.rank + ').', en: 'σ₂ = 0: A is singular (rank ' + dec.rank + ').' }
          : kappa > 50 ? { es: 'κ grande: A está cerca de ser singular; resolver Ax = b amplifica los errores relativos hasta κ veces.', en: 'Large κ: A is close to singular; solving Ax = b amplifies relative errors up to κ times.' } : null);
      const A1 = L.mulFloat([[dec.U[0][0] * dec.S[0]], [dec.U[1][0] * dec.S[0]]], [[dec.V[0][0], dec.V[1][0]]]);
      r.r1.set(`A_1 = \\sigma_1\\mathbf{u}_1\\mathbf{v}_1^{\\mathsf T} = ${texMatrix(A1, { digits: 3 })},\\qquad \\lVert A - A_1\\rVert_2 = \\sigma_2`,
        { es: 'Es la matriz de rango 1 más cercana a A (Eckart–Young).', en: 'It is the rank-1 matrix closest to A (Eckart–Young).' });

      ctx.setLegend([
        state.show.includes('circle') && { color: 'var(--c-v)', label: { es: 'imagen del círculo unitario', en: 'image of the unit circle' } },
        state.show.includes('axes') && { color: 'var(--c-w)', tex: '\\sigma_1\\mathbf{u}_1' },
        state.show.includes('axes') && { color: 'var(--c-eig)', tex: '\\sigma_2\\mathbf{u}_2' },
        state.show.includes('rank1') && { color: 'var(--c-eig)', label: { es: 'imagen bajo A₁ (un segmento)', en: 'image under A₁ (a segment)' } },
      ]);
      return { S: dec.S, dec, Af: an.Af, kappa };
    }

    return { render, snapshot: () => plane.snapshot(), togglePlay: () => anim.toggle(), onReset: () => { anim.pause(); plane.resetView(); } };
  },

  learn: {
    what: {
      es: `<p>La animación descompone $A = U\\Sigma V^{\\mathsf T}$ en tres movimientos. Primero $V^{\\mathsf T}$ gira el plano hasta que las direcciones $\\mathbf{v}_1, \\mathbf{v}_2$ (flechas punteadas sobre el círculo) quedan sobre los ejes. Después $\\Sigma$ estira el eje $x$ por $\\sigma_1$ y el eje $y$ por $\\sigma_2$: el círculo ya es una elipse con los ejes horizontales. Por último $U$ la gira (o la refleja) hasta su posición final.</p>
<p>Los <strong>valores singulares</strong> $\\sigma_1\\ge\\sigma_2\\ge 0$ son las longitudes de los semiejes de la elipse, y son las raíces cuadradas de los valores propios de $A^{\\mathsf T}A$. A diferencia de los valores propios, siempre son reales y no negativos, existen para toda matriz (incluso no cuadrada) y vienen con dos pares de direcciones perpendiculares: $\\mathbf{v}_1 \\perp \\mathbf{v}_2$ y $A\\mathbf{v}_i = \\sigma_i\\mathbf{u}_i$ con $\\mathbf{u}_1\\perp\\mathbf{u}_2$.</p>
<p>La <strong>aproximación de rango 1</strong> $A_1 = \\sigma_1\\mathbf{u}_1\\mathbf{v}_1^{\\mathsf T}$ se queda solo con el estiramiento principal; es la idea detrás de la compresión de imágenes y del análisis de componentes principales.</p>`,
      en: `<p>The animation splits $A = U\\Sigma V^{\\mathsf T}$ into three motions. First $V^{\\mathsf T}$ turns the plane until the directions $\\mathbf{v}_1, \\mathbf{v}_2$ (dashed arrows on the circle) lie on the axes. Then $\\Sigma$ stretches the $x$-axis by $\\sigma_1$ and the $y$-axis by $\\sigma_2$: the circle is now an ellipse with horizontal axes. Finally $U$ turns it (or reflects it) into its final position.</p>
<p>The <strong>singular values</strong> $\\sigma_1\\ge\\sigma_2\\ge 0$ are the lengths of the ellipse’s semi-axes, and they are the square roots of the eigenvalues of $A^{\\mathsf T}A$. Unlike eigenvalues, they are always real and non-negative, exist for every matrix (even non-square ones) and come with two pairs of perpendicular directions: $\\mathbf{v}_1 \\perp \\mathbf{v}_2$ and $A\\mathbf{v}_i = \\sigma_i\\mathbf{u}_i$ with $\\mathbf{u}_1\\perp\\mathbf{u}_2$.</p>
<p>The <strong>rank-1 approximation</strong> $A_1 = \\sigma_1\\mathbf{u}_1\\mathbf{v}_1^{\\mathsf T}$ keeps only the main stretch; it is the idea behind image compression and principal component analysis.</p>`,
    },
    prompts: {
      es: [
        'Reproduce la animación con la matriz inicial y detenla en $t = 1$ y en $t = 2$. ¿Qué forma tiene la imagen del círculo en cada momento?',
        'Elige «Cizalla». Sus valores propios son $1$ y $1$, pero sus valores singulares no. ¿Por qué no coinciden?',
        'Elige «Simétrica» y compara $\\mathbf{v}_i$ con $\\mathbf{u}_i$. ¿Qué relación hay entre la SVD y la diagonalización cuando $A = A^{\\mathsf T}$?',
        'Con «Mal condicionada», ¿cómo es la elipse? Cambia $1.1$ por $1.01$: ¿qué le pasa a $\\kappa(A)$?',
        'Arrastra $\\hat{\\imath}$ hasta que $\\det A < 0$. ¿En qué etapa aparece la reflexión?',
      ],
      en: [
        'Play the animation with the initial matrix and stop it at $t = 1$ and at $t = 2$. What does the image of the circle look like at each moment?',
        'Pick “Shear”. Its eigenvalues are $1$ and $1$, but its singular values are not. Why do they differ?',
        'Pick “Symmetric” and compare $\\mathbf{v}_i$ with $\\mathbf{u}_i$. How are the SVD and diagonalization related when $A = A^{\\mathsf T}$?',
        'With “Ill-conditioned”, what does the ellipse look like? Change $1.1$ to $1.01$: what happens to $\\kappa(A)$?',
        'Drag $\\hat{\\imath}$ until $\\det A < 0$. In which stage does the reflection appear?',
      ],
    },
    formal: [
      {
        kind: 'theorem',
        title: { es: 'Descomposición en valores singulares', en: 'Singular value decomposition' },
        body: {
          es: '<p>Toda $A\\in\\mathbb{R}^{m\\times n}$ se escribe como $A = U\\Sigma V^{\\mathsf T}$ con $U\\in O(m)$, $V\\in O(n)$ ortogonales y $\\Sigma\\in\\mathbb{R}^{m\\times n}$ «diagonal» con entradas $\\sigma_1\\ge\\cdots\\ge\\sigma_r>0$ (y ceros), donde $r = \\operatorname{rango}A$. Las columnas de $V$ son vectores propios ortonormales de $A^{\\mathsf T}A$, $\\sigma_i^2$ sus valores propios, y $\\mathbf{u}_i = A\\mathbf{v}_i/\\sigma_i$.</p>',
          en: '<p>Every $A\\in\\mathbb{R}^{m\\times n}$ can be written as $A = U\\Sigma V^{\\mathsf T}$ with orthogonal $U\\in O(m)$, $V\\in O(n)$ and a “diagonal” $\\Sigma\\in\\mathbb{R}^{m\\times n}$ with entries $\\sigma_1\\ge\\cdots\\ge\\sigma_r>0$ (and zeros), where $r = \\operatorname{rank}A$. The columns of $V$ are orthonormal eigenvectors of $A^{\\mathsf T}A$, the $\\sigma_i^2$ are its eigenvalues, and $\\mathbf{u}_i = A\\mathbf{v}_i/\\sigma_i$.</p>',
        },
      },
      {
        kind: 'proposition',
        title: { es: 'Normas y número de condición', en: 'Norms and condition number' },
        body: {
          es: '<p>$\\lVert A\\rVert_2 = \\max_{\\lVert\\mathbf{x}\\rVert = 1}\\lVert A\\mathbf{x}\\rVert = \\sigma_1$ y $\\lVert A\\rVert_F^2 = \\sum\\sigma_i^2$. Para $A$ invertible, $\\kappa(A) = \\lVert A\\rVert_2\\lVert A^{-1}\\rVert_2 = \\sigma_1/\\sigma_n$ acota la amplificación del error relativo al resolver $A\\mathbf{x}=\\mathbf{b}$: $\\frac{\\lVert\\delta\\mathbf{x}\\rVert}{\\lVert\\mathbf{x}\\rVert}\\le\\kappa(A)\\frac{\\lVert\\delta\\mathbf{b}\\rVert}{\\lVert\\mathbf{b}\\rVert}$.</p>',
          en: '<p>$\\lVert A\\rVert_2 = \\max_{\\lVert\\mathbf{x}\\rVert = 1}\\lVert A\\mathbf{x}\\rVert = \\sigma_1$ and $\\lVert A\\rVert_F^2 = \\sum\\sigma_i^2$. For invertible $A$, $\\kappa(A) = \\lVert A\\rVert_2\\lVert A^{-1}\\rVert_2 = \\sigma_1/\\sigma_n$ bounds the amplification of the relative error when solving $A\\mathbf{x}=\\mathbf{b}$: $\\frac{\\lVert\\delta\\mathbf{x}\\rVert}{\\lVert\\mathbf{x}\\rVert}\\le\\kappa(A)\\frac{\\lVert\\delta\\mathbf{b}\\rVert}{\\lVert\\mathbf{b}\\rVert}$.</p>',
        },
      },
      {
        kind: 'theorem',
        title: { es: 'Eckart–Young', en: 'Eckart–Young' },
        body: {
          es: '<p>Para $k<r$, $A_k = \\sum_{i\\le k}\\sigma_i\\mathbf{u}_i\\mathbf{v}_i^{\\mathsf T}$ minimiza $\\lVert A - B\\rVert_2$ (y $\\lVert A - B\\rVert_F$) entre todas las matrices $B$ de rango $\\le k$, con $\\lVert A - A_k\\rVert_2 = \\sigma_{k+1}$.</p>',
          en: '<p>For $k<r$, $A_k = \\sum_{i\\le k}\\sigma_i\\mathbf{u}_i\\mathbf{v}_i^{\\mathsf T}$ minimizes $\\lVert A - B\\rVert_2$ (and $\\lVert A - B\\rVert_F$) among all matrices $B$ of rank $\\le k$, with $\\lVert A - A_k\\rVert_2 = \\sigma_{k+1}$.</p>',
        },
      },
      {
        kind: 'remark',
        title: { es: 'Valores singulares y valores propios', en: 'Singular values and eigenvalues' },
        body: {
          es: '<p>En general $\\sigma_i\\neq|\\lambda_i|$, aunque siempre $\\prod\\sigma_i = |\\det A| = \\prod|\\lambda_i|$ y $\\sigma_n\\le|\\lambda|\\le\\sigma_1$. Coinciden ($\\sigma_i = |\\lambda_i|$) exactamente cuando $A$ es <strong>normal</strong>, $A^{\\mathsf T}A = AA^{\\mathsf T}$: por ejemplo, simétricas, ortogonales o de rotación-escalado.</p>',
          en: '<p>In general $\\sigma_i\\neq|\\lambda_i|$, although always $\\prod\\sigma_i = |\\det A| = \\prod|\\lambda_i|$ and $\\sigma_n\\le|\\lambda|\\le\\sigma_1$. They agree ($\\sigma_i = |\\lambda_i|$) exactly when $A$ is <strong>normal</strong>, $A^{\\mathsf T}A = AA^{\\mathsf T}$: e.g. symmetric, orthogonal or rotation-scaling matrices.</p>',
        },
      },
    ],
  },

  challenges: [
    {
      id: 's31',
      title: { es: 'Semiejes 3 y 1', en: 'Semi-axes 3 and 1' },
      text: { es: 'Construye una matriz no diagonal cuya elipse tenga semiejes exactamente $3$ y $1$.', en: 'Build a non-diagonal matrix whose ellipse has semi-axes exactly $3$ and $1$.' },
      hint: { es: 'Necesitas $\\det A = \\pm 3$ y $\\lVert A\\rVert_F^2 = 10$. Por ejemplo $\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}$ con $a^2+b^2+c^2+d^2 = 10$.', en: 'You need $\\det A = \\pm 3$ and $\\lVert A\\rVert_F^2 = 10$, e.g. $\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}$ with $a^2+b^2+c^2+d^2 = 10$.' },
      check: (s, d) => Math.abs(d.S[0] - 3) < 1e-6 && Math.abs(d.S[1] - 1) < 1e-6 && (Math.abs(d.Af[0][1]) > 1e-9 || Math.abs(d.Af[1][0]) > 1e-9),
    },
    {
      id: 'kappa1',
      title: { es: 'Un círculo perfecto', en: 'A perfect circle' },
      text: { es: 'Consigue $\\kappa(A) = 1$ sin que $A$ sea múltiplo de la identidad.', en: 'Get $\\kappa(A) = 1$ without $A$ being a multiple of the identity.' },
      hint: { es: 'Una rotación (o reflexión) multiplicada por un escalar.', en: 'A rotation (or reflection) times a scalar.' },
      check: (s, d) => Math.abs(d.kappa - 1) < 1e-9 && !(Math.abs(d.Af[0][1]) < 1e-12 && Math.abs(d.Af[1][0]) < 1e-12 && Math.abs(d.Af[0][0] - d.Af[1][1]) < 1e-12),
    },
    {
      id: 'segment',
      title: { es: 'Una elipse aplastada', en: 'A squashed ellipse' },
      text: { es: 'Construye una matriz de rango 1 con $\\sigma_1 = 5$.', en: 'Build a rank-1 matrix with $\\sigma_1 = 5$.' },
      hint: { es: 'Columnas paralelas; por ejemplo, $\\sigma_1^2$ es la suma de los cuadrados de las entradas cuando el rango es 1.', en: 'Parallel columns; for instance, $\\sigma_1^2$ is the sum of the squares of the entries when the rank is 1.' },
      check: (s, d) => d.dec.rank === 1 && Math.abs(d.S[0] - 5) < 1e-6,
    },
    {
      id: 'normal',
      title: { es: 'Singulares = |propios|', en: 'Singular = |eigen|' },
      text: { es: 'Encuentra $A$ no simétrica con $A^{\\mathsf T}A = AA^{\\mathsf T}$ (así $\\sigma_i = |\\lambda_i|$).', en: 'Find a non-symmetric $A$ with $A^{\\mathsf T}A = AA^{\\mathsf T}$ (so that $\\sigma_i = |\\lambda_i|$).' },
      hint: { es: 'Prueba con $\\begin{bmatrix}a & -b\\\\ b & a\\end{bmatrix}$, $b\\neq0$.', en: 'Try $\\begin{bmatrix}a & -b\\\\ b & a\\end{bmatrix}$, $b\\neq0$.' },
      check: (s, d) => {
        const a = d.Af, at = L.transpose(a);
        const x = L.mulFloat(at, a), y = L.mulFloat(a, at);
        const normal = x.every((row, i) => row.every((v, j) => Math.abs(v - y[i][j]) < 1e-9));
        return normal && Math.abs(a[0][1] - a[1][0]) > 1e-9;
      },
    },
  ],
});

