import { createLab } from '../ui/shell.js';
import { codec, M, V } from '../ui/store.js';
import { Plane2D } from '../ui/plane2d.js';
import { card, matrixEditor, vectorEditor, flagChip, readout, animator } from '../ui/controls.js';
import { h } from '../ui/dom.js';
import { tr, setText } from '../ui/i18n.js';
import { entryFromNumber } from '../core/parse.js';
import { RationalField } from '../core/fields.js';
import * as L from '../core/linalg.js';
import { realEigenDirections } from '../core/eigen.js';
import { texValue, texVector, texMatrix, cls, fmtDecimal } from '../core/format.js';
import {
  analyzeSquare, texSpan, texDetNote, eigenTex, eigenvectorTex, defectiveNote, charPolyTex,
  COLS, COL_VARS, presetSelect, memo, entriesKey, rankOp,
} from './common.js';

const PRESETS = [
  { id: 'id', group: 'basic', label: { es: 'Identidad', en: 'Identity' }, value: [[1, 0], [0, 1]] },
  { id: 'cat', group: 'basic', label: { es: 'Gato de Arnold', en: 'Arnold’s cat map' }, value: [[2, 1], [1, 1]] },
  { id: 'scale', group: 'basic', label: { es: 'Escalamiento por ejes', en: 'Axis scaling' }, value: [[2, 0], [0, 0.5]] },
  { id: 'homot', group: 'basic', label: { es: 'Homotecia ×1.5', en: 'Uniform scaling ×1.5' }, value: [[1.5, 0], [0, 1.5]] },
  { id: 'zero', group: 'basic', label: { es: 'Matriz nula', en: 'Zero matrix' }, value: [[0, 0], [0, 0]] },
  { id: 'rot90', group: 'rot', label: { es: 'Rotación 90°', en: 'Rotation 90°' }, value: [[0, -1], [1, 0]] },
  { id: 'rot45', group: 'rot', label: { es: 'Rotación 45°', en: 'Rotation 45°' }, value: [['√2/2', '-√2/2'], ['√2/2', '√2/2']] },
  { id: 'rot30', group: 'rot', label: { es: 'Rotación 30°', en: 'Rotation 30°' }, value: [['√3/2', '-1/2'], ['1/2', '√3/2']] },
  { id: 'rotscale', group: 'rot', label: { es: 'Rotación-escalado', en: 'Rotation-scaling' }, value: [[1, -1], [1, 1]] },
  { id: 'shearx', group: 'shear', label: { es: 'Cizalla horizontal', en: 'Horizontal shear' }, value: [[1, 1], [0, 1]] },
  { id: 'sheary', group: 'shear', label: { es: 'Cizalla vertical', en: 'Vertical shear' }, value: [[1, 0], [1, 1]] },
  { id: 'reflx', group: 'refl', label: { es: 'Reflexión sobre el eje x', en: 'Reflection across the x-axis' }, value: [[1, 0], [0, -1]] },
  { id: 'reflyx', group: 'refl', label: { es: 'Reflexión sobre y = x', en: 'Reflection across y = x' }, value: [[0, 1], [1, 0]] },
  { id: 'projx', group: 'sing', label: { es: 'Proyección sobre el eje x', en: 'Projection onto the x-axis' }, value: [[1, 0], [0, 0]] },
  { id: 'projyx', group: 'sing', label: { es: 'Proyección sobre y = x', en: 'Projection onto y = x' }, value: [['1/2', '1/2'], ['1/2', '1/2']] },
  { id: 'collapse', group: 'sing', label: { es: 'Colapso sobre una recta', en: 'Collapse onto a line' }, value: [[1, 2], [0.5, 1]] },
];
const GROUPS = [
  { id: 'basic', label: { es: 'Básicas', en: 'Basic' } },
  { id: 'rot', label: { es: 'Rotaciones', en: 'Rotations' } },
  { id: 'shear', label: { es: 'Cizallas', en: 'Shears' } },
  { id: 'refl', label: { es: 'Reflexiones', en: 'Reflections' } },
  { id: 'sing', label: { es: 'Singulares (det = 0)', en: 'Singular (det = 0)' } },
];

const analyze = memo((A) => analyzeSquare(A));

createLab({
  id: 't2d',
  lead: {
    es: 'Una matriz 2 × 2 es una forma de mover el plano entero. Arrastra dónde caen î y ĵ, o escribe las entradas, y observa qué se conserva y qué no.',
    en: 'A 2 × 2 matrix is a way of moving the whole plane. Drag where î and ĵ land, or type the entries, and watch what is preserved and what is not.',
  },
  state: {
    A: { def: M([[2, 1], [1, 1]]), codec: codec.matrix(2, 2) },
    v: { def: V([1, 1]), codec: codec.vector(2) },
    t: { def: 1, codec: codec.num(0, 1) },
    show: { def: ['det'], codec: codec.flags(['det', 'eig', 'ker', 'v', 'circle']) },
  },

  build(ctx) {
    const { store } = ctx;
    const plane = new Plane2D(ctx.addView(), { range: 4.2 });
    const anim = animator({ store, key: 't', max: 1 });
    ctx.bar.append(anim.el);

    // Handles: target positions of î, ĵ (columns of A) and the free vector v.
    const setCol = (j) => ([x, y]) => {
      const A = store.get('A').map((row) => row.slice());
      A[0][j] = entryFromNumber(x); A[1][j] = entryFromNumber(y);
      anim.pause();
      store.set({ A, t: 1 });
    };
    plane.addHandle({ id: 'i', color: 'i', get: () => [store.get('A')[0][0].x, store.get('A')[1][0].x], set: setCol(0) });
    plane.addHandle({ id: 'j', color: 'j', get: () => [store.get('A')[0][1].x, store.get('A')[1][1].x], set: setCol(1) });
    plane.addHandle({
      id: 'v', color: 'v', visible: () => store.get('show').includes('v'),
      get: () => store.get('v').map((e) => e.x),
      set: ([x, y]) => store.set({ v: [entryFromNumber(x), entryFromNumber(y)] }),
    });

    // Panel ------------------------------------------------------------------
    const editor = matrixEditor({ rows: 2, cols: 2, get: () => store.get('A'), set: (A) => store.set({ A }), colColors: COL_VARS, label: 'A =', name: { es: 'Matriz A', en: 'Matrix A' } });
    const presets = presetSelect({ store, key: 'A', presets: PRESETS, groups: GROUPS, onPick: (p) => { anim.pause(); store.set({ A: M(p.value), t: 1 }); } });
    const tip = h('p');
    setText(tip, { es: 'Arrastra las cruces del lienzo o escribe valores exactos: 1/3, √2/2, cos(π/6)… Con ↑/↓ en una celda sumas ±1 (Mayús: ±0.1).', en: 'Drag the crosshairs on the canvas or type exact values: 1/3, √2/2, cos(π/6)… Use ↑/↓ in a cell to add ±1 (Shift: ±0.1).' });
    const matrixCard = card({ title: { es: 'Matriz', en: 'Matrix' }, body: [editor.el, presets.el, tip] });

    const chips = [
      flagChip(store, 'show', 'det', { es: 'Determinante', en: 'Determinant' }, 'var(--c-det)'),
      flagChip(store, 'show', 'eig', { es: 'Vectores propios', en: 'Eigenvectors' }, 'var(--c-eig)'),
      flagChip(store, 'show', 'ker', { es: 'Núcleo e imagen', en: 'Kernel and image' }, 'var(--c-ker)'),
      flagChip(store, 'show', 'v', { es: 'Vector v', en: 'Vector v' }, 'var(--c-v)'),
      flagChip(store, 'show', 'circle', { es: 'Círculo unitario', en: 'Unit circle' }, 'var(--c-w)'),
    ];
    const vEditor = vectorEditor({ n: 2, get: () => store.get('v'), set: (v) => store.set({ v }), label: '\\vec{v} =' });
    const vRow = h('div', null, vEditor.el);
    const showCard = card({ title: { es: 'Mostrar', en: 'Show' }, body: [h('div', { class: 'chip-row' }, chips.map((c) => c.el)), vRow] });

    const r = {
      av: readout(null, { labelTex: 'A\\vec{v}' }),
      det: readout(null, { labelTex: '\\det A' }),
      rank: readout({ es: 'Rango y nulidad', en: 'Rank and nullity' }),
      ker: readout(null, { labelTex: '\\ker A' }),
      img: readout(null, { labelTex: '\\operatorname{Im} A' }),
      poly: readout({ es: 'Polinomio', en: 'Polynomial' }),
      eigval: readout({ es: 'Valores propios', en: 'Eigenvalues' }),
      eigvec: readout({ es: 'Vectores propios', en: 'Eigenvectors' }),
      inv: readout(null, { labelTex: 'A^{-1}' }),
    };
    const analysisCard = card({ title: { es: 'Análisis exacto', en: 'Exact analysis' }, body: [h('div', { class: 'readouts' }, Object.values(r).map((x) => x.el))] });
    ctx.panel.append(matrixCard.el, showCard.el, analysisCard.el);

    // Drawing -----------------------------------------------------------------
    let cur = null;
    plane.setDraw((g) => {
      if (!cur) return;
      const { A, Af, t, show, v, an } = cur;
      const Mt = L.lerpMatrix(L.identityFloat(2), Af, t);
      g.backgroundGrid();
      const singular = an.rank < 2 && t > 0.999;
      g.transformedGrid(Mt, { color: g.c.tgrid, alpha: 0.9 });

      if (show.includes('circle')) {
        g.curve((s) => [Math.cos(s), Math.sin(s)], 0, 2 * Math.PI, 120, { color: g.c.w, width: 1.5, alpha: 0.5, dash: [5, 5] });
        g.ellipse(Mt, { color: g.c.w, width: 2.5 });
      }
      if (show.includes('det')) {
        const sq = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => L.mv2(Mt, x, y));
        const d = L.det2(Mt);
        const col = d < -1e-12 ? g.c.detNeg : g.c.det;
        g.polygon(sq, { fill: col, stroke: col, width: 2, fillAlpha: 0.22 });
        const c = [(sq[0][0] + sq[2][0]) / 2, (sq[0][1] + sq[2][1]) / 2];
        const label = t > 0.999 ? `det = ${plainDet(an)}` : `det = ${fmtDecimal(d, 2)}`;
        g.text(c, label, { color: col, align: 'center', size: 12, weight: 600 });
      }
      if (show.includes('ker')) {
        if (an.rank === 1) {
          const k = an.ker[0].map((x) => an.F.toNumber(x));
          g.infiniteLine([0, 0], k, { color: g.c.ker, width: 3, dash: [9, 6], alpha: 0.9 });
          const kn = Math.hypot(...k);
          const lab = [(k[0] / kn) * 2.4, (k[1] / kn) * 2.4];
          g.text(lab, tr({ es: 'núcleo', en: 'kernel' }), { color: g.c.ker, offset: [8, -10], weight: 600 });
          const im = an.img[0].map((x) => an.F.toNumber(x));
          g.infiniteLine([0, 0], im, { color: g.c.img, width: 5, alpha: 0.45 });
        } else if (an.rank === 0) {
          g.point([0, 0], { color: g.c.ker, r: 7 });
        } else {
          g.point([0, 0], { color: g.c.ker, r: 5 });
        }
      }
      if (show.includes('eig')) {
        for (const e of realEigenDirections(an.eig)) {
          for (const d of e.dirs) {
            g.infiniteLine([0, 0], d, { color: g.c.eig, width: 2, dash: [2, 7], alpha: 0.95 });
            const scale = 1 - t + t * e.lambda;
            g.arrow([0, 0], d, { color: g.c.eig, width: 2, alpha: 0.35 });
            g.arrow([0, 0], [d[0] * scale, d[1] * scale], { color: g.c.eig, width: 3 });
            const tip = [d[0] * Math.max(1, scale), d[1] * Math.max(1, scale)];
            g.text(tip, `λ = ${fmtDecimal(e.lambda, 3)}`, { color: g.c.eig, offset: [10, 14], weight: 600 });
          }
        }
      }
      // Basis vectors (original, faint) and their images.
      g.arrow([0, 0], [1, 0], { color: g.c.i, width: 2, alpha: 0.28 });
      g.arrow([0, 0], [0, 1], { color: g.c.j, width: 2, alpha: 0.28 });
      const ti = L.mv2(Mt, 1, 0), tj = L.mv2(Mt, 0, 1);
      g.arrow([0, 0], ti, { color: g.c.i, width: 3.5 });
      g.arrow([0, 0], tj, { color: g.c.j, width: 3.5 });
      g.mathLabel(ti, 'i', { color: g.c.i, deco: 'hat', away: tj });
      g.mathLabel(tj, 'j', { color: g.c.j, deco: 'hat', away: ti });
      if (show.includes('v')) {
        const vv = v.map((e) => e.x);
        const tv = L.mv2(Mt, vv[0], vv[1]);
        g.arrow([0, 0], vv, { color: g.c.v, width: 2, alpha: 0.35, dash: [6, 5] });
        g.arrow([0, 0], tv, { color: g.c.v, width: 3.5 });
        g.mathLabel(tv, 'v', { color: g.c.v, deco: 'arrow', offset: [14, -14] });
      }
      if (singular && show.includes('ker')) {
        g.text([0, 0], tr({ es: 'todo el núcleo va al origen', en: 'the whole kernel goes to the origin' }), { color: g.c.ker, offset: [12, 18], size: 11 });
      }
    });

    function render(state) {
      const A = state.A;
      const an = analyze(entriesKey(A), A);
      const show = state.show;
      cur = { A, Af: an.Af, t: state.t, show, v: state.v, an };
      plane.requestRender();
      editor.update(); vEditor.update(); anim.update();
      chips.forEach((c) => c.update());
      vRow.hidden = !show.includes('v');

      // Readouts
      const F = an.F;
      if (show.includes('v')) {
        const vf = L.fieldVector(state.v, F);
        const av = L.matVec(an.M, vf, F);
        r.av.set(`${texMatrix(an.M, { colClasses: COLS })}${cls('c-v', texVector(vf))} = ${cls('c-v', texVector(av))}`);
        r.av.show(true);
      } else r.av.show(false);
      r.det.set(`${texValue(an.det)}`, texDetNote(an.det, F, 2));
      r.rank.set(`${rankOp()} A = ${an.rank},\\quad \\dim\\ker A = ${an.nullity}`);
      r.ker.set(cls('c-ker', texSpan(an.ker, 2)));
      r.img.set(cls('c-img', texSpan(an.img, 2)));
      r.poly.set(charPolyTex(an.eig));
      const et = eigenTex(an.eig);
      r.eigval.set(et.values, et.complex.length
        ? { es: 'Valores propios complejos: ninguna recta real conserva su dirección (hay una rotación involucrada).', en: 'Complex eigenvalues: no real line keeps its direction (there is a rotation involved).' }
        : null);
      if (et.reals.length) {
        r.eigvec.set(eigenvectorTex(an.eig), defectiveNote(an.eig));
        r.eigvec.show(true);
      } else r.eigvec.show(false);
      r.inv.set(an.inv ? texMatrix(an.inv) : `\\text{${tr({ es: 'no existe', en: 'does not exist' })}}`);

      ctx.setLegend([
        { color: 'var(--tgrid)', label: { es: 'cuadrícula transformada', en: 'transformed grid' } },
        { color: 'var(--c-i)', tex: 'A\\hat{\\imath}' },
        { color: 'var(--c-j)', tex: 'A\\hat{\\jmath}' },
        show.includes('det') && { color: 'var(--c-det)', kind: 'area', label: { es: 'imagen del cuadrado unidad', en: 'image of the unit square' } },
        show.includes('eig') && { color: 'var(--c-eig)', kind: 'dash', label: { es: 'rectas propias', en: 'eigenlines' } },
        show.includes('ker') && { color: 'var(--c-ker)', kind: 'dash', label: { es: 'núcleo', en: 'kernel' } },
        show.includes('ker') && an.rank === 1 && { color: 'var(--c-img)', label: { es: 'imagen', en: 'image' } },
        show.includes('circle') && { color: 'var(--c-w)', label: { es: 'imagen del círculo unitario', en: 'image of the unit circle' } },
        show.includes('v') && { color: 'var(--c-v)', tex: 'A\\vec{v}' },
      ]);
      return { an };
    }

    return {
      render,
      snapshot: () => plane.snapshot(),
      togglePlay: () => anim.toggle(),
      onReset: () => { anim.pause(); plane.resetView(); },
    };
  },

  learn: {
    what: {
      es: `<p>La cuadrícula gris es el plano original; la azul es su imagen bajo la transformación lineal $T(\\mathbf{x}) = A\\mathbf{x}$. Una transformación lineal queda determinada por dónde envía la base canónica: la primera columna de $A$ es $A\\hat{\\imath}$ (verde) y la segunda es $A\\hat{\\jmath}$ (roja). Cualquier otro vector $\\mathbf{v} = x\\hat{\\imath} + y\\hat{\\jmath}$ va a parar a $x\\,A\\hat{\\imath} + y\\,A\\hat{\\jmath}$; por eso las líneas de la cuadrícula siguen siendo rectas, paralelas y equiespaciadas, y el origen no se mueve.</p>
<p>El deslizador $t$ muestra la interpolación $(1-t)I + tA$ entre la identidad y $A$. Es solo una animación para ver el movimiento; la transformación es el estado final.</p>
<ul>
<li><strong>Determinante.</strong> El cuadrado unidad se convierte en el paralelogramo generado por las columnas; su área con signo es $\\det A$. Si es negativo, la orientación se invierte: $A\\hat{\\jmath}$ queda en el sentido horario de $A\\hat{\\imath}$.</li>
<li><strong>Vectores propios.</strong> Rectas por el origen que la transformación no hace girar; los vectores de cada una se multiplican por su valor propio $\\lambda$.</li>
<li><strong>Núcleo e imagen.</strong> Si $\\det A = 0$, toda una recta (el núcleo) colapsa en el origen y el plano entero cae en la imagen, que es una recta o un punto.</li>
</ul>`,
      en: `<p>The grey grid is the original plane; the blue one is its image under the linear map $T(\\mathbf{x}) = A\\mathbf{x}$. A linear map is determined by where it sends the standard basis: the first column of $A$ is $A\\hat{\\imath}$ (green) and the second is $A\\hat{\\jmath}$ (red). Any other vector $\\mathbf{v} = x\\hat{\\imath} + y\\hat{\\jmath}$ lands on $x\\,A\\hat{\\imath} + y\\,A\\hat{\\jmath}$; that is why grid lines stay straight, parallel and evenly spaced, and the origin stays put.</p>
<p>The slider $t$ shows the interpolation $(1-t)I + tA$ between the identity and $A$. It is only an animation to see the motion; the transformation is the final state.</p>
<ul>
<li><strong>Determinant.</strong> The unit square becomes the parallelogram spanned by the columns; its signed area is $\\det A$. If it is negative, orientation is reversed: $A\\hat{\\jmath}$ ends up clockwise from $A\\hat{\\imath}$.</li>
<li><strong>Eigenvectors.</strong> Lines through the origin that the map does not rotate; vectors on each one are multiplied by their eigenvalue $\\lambda$.</li>
<li><strong>Kernel and image.</strong> If $\\det A = 0$, a whole line (the kernel) collapses to the origin and the entire plane lands in the image, which is a line or a point.</li>
</ul>`,
    },
    prompts: {
      es: [
        'Arrastra $\\hat{\\imath}$ y $\\hat{\\jmath}$ hasta que el paralelogramo desaparezca. ¿Qué relación hay entre las dos columnas cuando $\\det A = 0$?',
        'Elige «Rotación 90°» y activa los vectores propios. ¿Por qué no aparece ninguna recta invariante? Mira los valores propios.',
        'Con «Cizalla horizontal», ¿cuántas direcciones propias hay? Compara la multiplicidad algebraica con la geométrica.',
        'Escribe $A = \\begin{bmatrix} 1 & 2 \\\\ 2 & 4 \\end{bmatrix}$ y activa núcleo e imagen. ¿Qué vectores van a parar al origen? ¿Dónde cae todo lo demás?',
        'Activa el círculo unitario: toda matriz invertible lo convierte en una elipse. ¿Para qué matrices la elipse vuelve a ser un círculo del mismo radio?',
        'Cambia el signo de una sola columna. ¿Qué le pasa al determinante y a la orientación de la cuadrícula?',
      ],
      en: [
        'Drag $\\hat{\\imath}$ and $\\hat{\\jmath}$ until the parallelogram disappears. How are the two columns related when $\\det A = 0$?',
        'Pick “Rotation 90°” and turn on eigenvectors. Why does no invariant line appear? Look at the eigenvalues.',
        'With “Horizontal shear”, how many eigen-directions are there? Compare the algebraic and geometric multiplicities.',
        'Type $A = \\begin{bmatrix} 1 & 2 \\\\ 2 & 4 \\end{bmatrix}$ and turn on kernel and image. Which vectors land on the origin? Where does everything else go?',
        'Turn on the unit circle: every invertible matrix turns it into an ellipse. For which matrices is the ellipse again a circle of the same radius?',
        'Flip the sign of a single column. What happens to the determinant and to the orientation of the grid?',
      ],
    },
    formal: [
      {
        kind: 'definition',
        title: { es: 'Transformación lineal y su matriz', en: 'Linear map and its matrix' },
        body: {
          es: '<p>Una función $T:\\mathbb{R}^2\\to\\mathbb{R}^2$ es <strong>lineal</strong> si $T(\\mathbf{u}+\\mathbf{v}) = T(\\mathbf{u})+T(\\mathbf{v})$ y $T(c\\,\\mathbf{u}) = c\\,T(\\mathbf{u})$ para todos $\\mathbf{u},\\mathbf{v}\\in\\mathbb{R}^2$, $c\\in\\mathbb{R}$. Toda transformación lineal es de la forma $T(\\mathbf{x}) = A\\mathbf{x}$ con $$A = \\begin{bmatrix} T(\\hat{\\imath}) & T(\\hat{\\jmath}) \\end{bmatrix},$$ es decir, las columnas de $A$ son las imágenes de la base canónica.</p>',
          en: '<p>A function $T:\\mathbb{R}^2\\to\\mathbb{R}^2$ is <strong>linear</strong> if $T(\\mathbf{u}+\\mathbf{v}) = T(\\mathbf{u})+T(\\mathbf{v})$ and $T(c\\,\\mathbf{u}) = c\\,T(\\mathbf{u})$ for all $\\mathbf{u},\\mathbf{v}\\in\\mathbb{R}^2$, $c\\in\\mathbb{R}$. Every linear map has the form $T(\\mathbf{x}) = A\\mathbf{x}$ with $$A = \\begin{bmatrix} T(\\hat{\\imath}) & T(\\hat{\\jmath}) \\end{bmatrix},$$ that is, the columns of $A$ are the images of the standard basis.</p>',
        },
      },
      {
        kind: 'theorem',
        title: { es: 'El determinante mide áreas con signo', en: 'The determinant measures signed area' },
        body: {
          es: '<p>Para toda región medible $S\\subset\\mathbb{R}^2$ se cumple $\\operatorname{área}(A(S)) = |\\det A|\\,\\operatorname{área}(S)$. El signo de $\\det A$ indica si $A$ conserva $(>0)$ o invierte $(<0)$ la orientación. Además, $\\det(AB) = \\det A\\,\\det B$, y $A$ es invertible si y solo si $\\det A \\neq 0$.</p>',
          en: '<p>For every measurable region $S\\subset\\mathbb{R}^2$, $\\operatorname{area}(A(S)) = |\\det A|\\,\\operatorname{area}(S)$. The sign of $\\det A$ tells whether $A$ preserves $(>0)$ or reverses $(<0)$ orientation. Moreover $\\det(AB) = \\det A\\,\\det B$, and $A$ is invertible if and only if $\\det A \\neq 0$.</p>',
        },
      },
      {
        kind: 'definition',
        title: { es: 'Valores y vectores propios', en: 'Eigenvalues and eigenvectors' },
        body: {
          es: '<p>$\\lambda\\in\\mathbb{C}$ es un <strong>valor propio</strong> de $A$ si existe $\\mathbf{v}\\neq\\mathbf{0}$ con $A\\mathbf{v}=\\lambda\\mathbf{v}$; tal $\\mathbf{v}$ es un <strong>vector propio</strong>. Equivalentemente, $p(\\lambda)=\\det(\\lambda I - A) = 0$. Para $2\\times 2$, $$p(\\lambda) = \\lambda^2 - \\operatorname{tr}(A)\\,\\lambda + \\det A,$$ de modo que $\\lambda_1+\\lambda_2 = \\operatorname{tr} A$ y $\\lambda_1\\lambda_2 = \\det A$. Los valores propios son reales exactamente cuando $\\operatorname{tr}(A)^2 - 4\\det A \\ge 0$.</p>',
          en: '<p>$\\lambda\\in\\mathbb{C}$ is an <strong>eigenvalue</strong> of $A$ if there is $\\mathbf{v}\\neq\\mathbf{0}$ with $A\\mathbf{v}=\\lambda\\mathbf{v}$; such a $\\mathbf{v}$ is an <strong>eigenvector</strong>. Equivalently, $p(\\lambda)=\\det(\\lambda I - A) = 0$. For $2\\times 2$, $$p(\\lambda) = \\lambda^2 - \\operatorname{tr}(A)\\,\\lambda + \\det A,$$ so $\\lambda_1+\\lambda_2 = \\operatorname{tr} A$ and $\\lambda_1\\lambda_2 = \\det A$. The eigenvalues are real exactly when $\\operatorname{tr}(A)^2 - 4\\det A \\ge 0$.</p>',
        },
      },
      {
        kind: 'remark',
        title: { es: 'Multiplicidad algebraica y geométrica', en: 'Algebraic and geometric multiplicity' },
        body: {
          es: '<p>La multiplicidad algebraica de $\\lambda$ es su multiplicidad como raíz de $p$; la geométrica es $\\dim\\ker(A-\\lambda I)$. Siempre $1\\le \\text{geométrica} \\le \\text{algebraica}$. Una matriz real es diagonalizable sobre $\\mathbb{R}$ si y solo si $p$ se factoriza en factores lineales reales y ambas multiplicidades coinciden para cada valor propio. La cizalla $\\begin{bmatrix}1&1\\\\0&1\\end{bmatrix}$ tiene $\\lambda=1$ doble con una sola dirección propia.</p>',
          en: '<p>The algebraic multiplicity of $\\lambda$ is its multiplicity as a root of $p$; the geometric one is $\\dim\\ker(A-\\lambda I)$. Always $1\\le \\text{geometric} \\le \\text{algebraic}$. A real matrix is diagonalizable over $\\mathbb{R}$ if and only if $p$ splits into real linear factors and both multiplicities agree for every eigenvalue. The shear $\\begin{bmatrix}1&1\\\\0&1\\end{bmatrix}$ has the double eigenvalue $\\lambda=1$ with a single eigen-direction.</p>',
        },
      },
      {
        kind: 'theorem',
        title: { es: 'Rango y nulidad', en: 'Rank–nullity' },
        body: {
          es: '<p>Para $A\\in\\mathbb{R}^{2\\times 2}$: $\\operatorname{rango}(A) + \\dim\\ker A = 2$, donde $\\operatorname{rango}(A)=\\dim\\operatorname{Im} A$. Así, si una recta colapsa al origen, la imagen es una recta; si nada colapsa, la imagen es todo el plano.</p>',
          en: '<p>For $A\\in\\mathbb{R}^{2\\times 2}$: $\\operatorname{rank}(A) + \\dim\\ker A = 2$, where $\\operatorname{rank}(A)=\\dim\\operatorname{Im} A$. So if a line collapses to the origin, the image is a line; if nothing collapses, the image is the whole plane.</p>',
        },
      },
      {
        kind: 'proposition',
        title: { es: 'Inversa de una matriz 2 × 2', en: 'Inverse of a 2 × 2 matrix' },
        body: {
          es: '<p>Si $\\det A = ad-bc\\neq 0$, $$\\begin{bmatrix} a & b \\\\ c & d\\end{bmatrix}^{-1} = \\frac{1}{ad-bc}\\begin{bmatrix} d & -b \\\\ -c & a\\end{bmatrix}.$$ Geométricamente, $A^{-1}$ deshace el movimiento: devuelve $A\\hat{\\imath}$ y $A\\hat{\\jmath}$ a $\\hat{\\imath}$ y $\\hat{\\jmath}$.</p>',
          en: '<p>If $\\det A = ad-bc\\neq 0$, $$\\begin{bmatrix} a & b \\\\ c & d\\end{bmatrix}^{-1} = \\frac{1}{ad-bc}\\begin{bmatrix} d & -b \\\\ -c & a\\end{bmatrix}.$$ Geometrically, $A^{-1}$ undoes the motion: it sends $A\\hat{\\imath}$ and $A\\hat{\\jmath}$ back to $\\hat{\\imath}$ and $\\hat{\\jmath}$.</p>',
        },
      },
    ],
  },

  challenges: [
    {
      id: 'flip2',
      title: { es: 'Invierte y duplica', en: 'Flip and double' },
      text: { es: 'Construye una transformación que invierta la orientación y duplique todas las áreas.', en: 'Build a map that reverses orientation and doubles every area.' },
      hint: { es: 'Necesitas $\\det A = -2$. Prueba a intercambiar el papel de las columnas.', en: 'You need $\\det A = -2$. Try swapping the roles of the columns.' },
      check: (s, d) => Math.abs(d.an.F.toNumber(d.an.det) + 2) < 1e-9,
    },
    {
      id: 'eig11',
      title: { es: 'Una dirección privilegiada', en: 'A privileged direction' },
      text: { es: 'Haz que $(1,1)$ sea vector propio con valor propio $2$, sin que $A$ sea diagonal.', en: 'Make $(1,1)$ an eigenvector with eigenvalue $2$, without $A$ being diagonal.' },
      hint: { es: 'Necesitas $A\\begin{bmatrix}1\\\\1\\end{bmatrix} = \\begin{bmatrix}2\\\\2\\end{bmatrix}$: la suma de cada fila debe ser 2.', en: 'You need $A\\begin{bmatrix}1\\\\1\\end{bmatrix} = \\begin{bmatrix}2\\\\2\\end{bmatrix}$: each row must add up to 2.' },
      check: (s) => {
        const a = s.A.map((r) => r.map((e) => e.x));
        return Math.abs(a[0][0] + a[0][1] - 2) < 1e-9 && Math.abs(a[1][0] + a[1][1] - 2) < 1e-9 && (Math.abs(a[0][1]) > 1e-9 || Math.abs(a[1][0]) > 1e-9);
      },
    },
    {
      id: 'rank1',
      title: { es: 'Aplasta el plano', en: 'Squash the plane' },
      text: { es: 'Consigue que todo el plano caiga sobre una recta (no sobre un punto).', en: 'Make the whole plane land on a line (not on a point).' },
      hint: { es: 'Las dos columnas deben ser paralelas y al menos una no nula.', en: 'Both columns must be parallel and at least one non-zero.' },
      check: (s, d) => d.an.rank === 1,
    },
    {
      id: 'rot90',
      title: { es: 'Un cuarto de vuelta', en: 'A quarter turn' },
      text: { es: 'Construye la rotación de 90° en sentido antihorario sin usar los ejemplos.', en: 'Build the counter-clockwise rotation by 90° without using the examples.' },
      hint: { es: '¿Adónde debe ir $\\hat{\\imath}$? ¿Y $\\hat{\\jmath}$?', en: 'Where must $\\hat{\\imath}$ go? And $\\hat{\\jmath}$?' },
      check: (s) => {
        const a = s.A.map((r) => r.map((e) => e.x));
        return [[0, -1], [1, 0]].every((row, i) => row.every((x, j) => Math.abs(a[i][j] - x) < 1e-9));
      },
    },
    {
      id: 'complex',
      title: { es: 'Gira y crece', en: 'Turn and grow' },
      text: { es: 'Encuentra una matriz sin valores propios reales que no conserve las longitudes (no sea una rotación pura).', en: 'Find a matrix with no real eigenvalues that does not preserve lengths (it is not a pure rotation).' },
      hint: { es: 'Una rotación seguida de un escalamiento uniforme, por ejemplo $\\begin{bmatrix}a & -b\\\\ b & a\\end{bmatrix}$ con $a^2+b^2\\neq 1$.', en: 'A rotation followed by a uniform scaling, e.g. $\\begin{bmatrix}a & -b\\\\ b & a\\end{bmatrix}$ with $a^2+b^2\\neq 1$.' },
      check: (s, d) => {
        if (d.an.eig.eigen.some((e) => e.real)) return false;
        const a = d.an.Af;
        const ata = L.mulFloat(L.transpose(a), a);
        return !(Math.abs(ata[0][0] - 1) < 1e-9 && Math.abs(ata[1][1] - 1) < 1e-9 && Math.abs(ata[0][1]) < 1e-9);
      },
    },
  ],
});

function plainDet(an) {
  const d = an.det;
  if (an.F === RationalField) return d.d === 1n ? d.n.toString().replace('-', '−') : `${d.toString().replace('-', '−')}`;
  return fmtDecimal(d, 3);
}
