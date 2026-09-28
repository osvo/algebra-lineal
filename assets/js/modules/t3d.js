import { createLab } from '../ui/shell.js';
import { codec, M, V } from '../ui/store.js';
import { Scene3D, THREE } from '../ui/scene3d.js';
import { card, matrixEditor, vectorEditor, flagChip, readout, animator, segmented, slider } from '../ui/controls.js';
import { h } from '../ui/dom.js';
import { tr, setText } from '../ui/i18n.js';
import { makeEntry, entryFromNumber, numberToInput } from '../core/parse.js';
import { RationalField, FloatField } from '../core/fields.js';
import { Rational } from '../core/rational.js';
import * as L from '../core/linalg.js';
import { realEigenDirections, approxVector } from '../core/eigen.js';
import { texValue, texVector, texMatrix, cls } from '../core/format.js';
import {
  analyzeSquare, texSpan, texDetNote, eigenTex, eigenvectorTex, defectiveNote, charPolyTex,
  COLS, COL_VARS, presetSelect, memo, entriesKey, rankOp,
} from './common.js';

const c45 = '√2/2', s60 = '√3/2';
const PRESETS = [
  { id: 'id', group: 'basic', label: { es: 'Identidad', en: 'Identity' }, value: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
  { id: 'default', group: 'basic', label: { es: 'Estira x y gira el plano yz', en: 'Stretch x, turn the yz-plane' }, value: [[2, 0, 0], [0, 1, -1], [0, 1, 1]] },
  { id: 'zero', group: 'basic', label: { es: 'Matriz nula', en: 'Zero matrix' }, value: [[0, 0, 0], [0, 0, 0], [0, 0, 0]] },
  { id: 'unif', group: 'basic', label: { es: 'Homotecia ×1.5', en: 'Uniform scaling ×1.5' }, value: [[1.5, 0, 0], [0, 1.5, 0], [0, 0, 1.5]] },
  { id: 'axes', group: 'basic', label: { es: 'Escalamiento por ejes', en: 'Axis scaling' }, value: [[1.5, 0, 0], [0, 0.5, 0], [0, 0, 1]] },
  { id: 'pxy', group: 'proj', label: { es: 'Sobre el plano XY', en: 'Onto the XY plane' }, value: [[1, 0, 0], [0, 1, 0], [0, 0, 0]] },
  { id: 'pxz', group: 'proj', label: { es: 'Sobre el plano XZ', en: 'Onto the XZ plane' }, value: [[1, 0, 0], [0, 0, 0], [0, 0, 1]] },
  { id: 'pyz', group: 'proj', label: { es: 'Sobre el plano YZ', en: 'Onto the YZ plane' }, value: [[0, 0, 0], [0, 1, 0], [0, 0, 1]] },
  { id: 'px', group: 'proj', label: { es: 'Sobre el eje X', en: 'Onto the X axis' }, value: [[1, 0, 0], [0, 0, 0], [0, 0, 0]] },
  { id: 'pz', group: 'proj', label: { es: 'Sobre el eje Z', en: 'Onto the Z axis' }, value: [[0, 0, 0], [0, 0, 0], [0, 0, 1]] },
  { id: 'projl', group: 'proj', label: { es: 'Sobre la recta gen{n}…', en: 'Onto the line span{n}…' }, param: 'projl' },
  { id: 'projp', group: 'proj', label: { es: 'Sobre el plano ⟂ n…', en: 'Onto the plane ⟂ n…' }, param: 'projp' },
  { id: 'ro', group: 'refl', label: { es: 'Respecto al origen', en: 'Through the origin' }, value: [[-1, 0, 0], [0, -1, 0], [0, 0, -1]] },
  { id: 'rxy', group: 'refl', label: { es: 'Respecto al plano XY', en: 'Across the XY plane' }, value: [[1, 0, 0], [0, 1, 0], [0, 0, -1]] },
  { id: 'rxz', group: 'refl', label: { es: 'Respecto al plano XZ', en: 'Across the XZ plane' }, value: [[1, 0, 0], [0, -1, 0], [0, 0, 1]] },
  { id: 'ryz', group: 'refl', label: { es: 'Respecto al plano YZ', en: 'Across the YZ plane' }, value: [[-1, 0, 0], [0, 1, 0], [0, 0, 1]] },
  { id: 'refl', group: 'refl', label: { es: 'Respecto al plano ⟂ n…', en: 'Across the plane ⟂ n…' }, param: 'refl' },
  { id: 'rx45', group: 'rot', label: { es: 'Eje X, 45°', en: 'X axis, 45°' }, value: [[1, 0, 0], [0, c45, `-${c45}`], [0, c45, c45]] },
  { id: 'rx90', group: 'rot', label: { es: 'Eje X, 90°', en: 'X axis, 90°' }, value: [[1, 0, 0], [0, 0, -1], [0, 1, 0]] },
  { id: 'ry60', group: 'rot', label: { es: 'Eje Y, 60°', en: 'Y axis, 60°' }, value: [['1/2', 0, s60], [0, 1, 0], [`-${s60}`, 0, '1/2']] },
  { id: 'ry90', group: 'rot', label: { es: 'Eje Y, 90°', en: 'Y axis, 90°' }, value: [[0, 0, 1], [0, 1, 0], [-1, 0, 0]] },
  { id: 'rz45', group: 'rot', label: { es: 'Eje Z, 45°', en: 'Z axis, 45°' }, value: [[c45, `-${c45}`, 0], [c45, c45, 0], [0, 0, 1]] },
  { id: 'rz90', group: 'rot', label: { es: 'Eje Z, 90°', en: 'Z axis, 90°' }, value: [[0, -1, 0], [1, 0, 0], [0, 0, 1]] },
  { id: 'rot', group: 'rot', label: { es: 'Eje n, ángulo θ…', en: 'Axis n, angle θ…' }, param: 'rot' },
  { id: 'sxy', group: 'shear', label: { es: 'x += y', en: 'x += y' }, value: [[1, 1, 0], [0, 1, 0], [0, 0, 1]] },
  { id: 'sxz', group: 'shear', label: { es: 'x += z', en: 'x += z' }, value: [[1, 0, 1], [0, 1, 0], [0, 0, 1]] },
  { id: 'syz', group: 'shear', label: { es: 'y += z', en: 'y += z' }, value: [[1, 0, 0], [0, 1, 1], [0, 0, 1]] },
  { id: 'szx', group: 'shear', label: { es: 'z += x', en: 'z += x' }, value: [[1, 0, 0], [0, 1, 0], [1, 0, 1]] },
];
const GROUPS = [
  { id: 'basic', label: { es: 'Básicas', en: 'Basic' } },
  { id: 'proj', label: { es: 'Proyecciones', en: 'Projections' } },
  { id: 'refl', label: { es: 'Reflexiones', en: 'Reflections' } },
  { id: 'rot', label: { es: 'Rotaciones', en: 'Rotations' } },
  { id: 'shear', label: { es: 'Cizallas', en: 'Shears' } },
];

// Parametric matrices, exact over ℚ when n is rational (rotations are floating point).
function paramMatrix(kind, nEntries, thetaDeg) {
  const exact = nEntries.every((e) => e.q);
  const F = exact ? RationalField : FloatField(1e-12);
  const n = exact ? nEntries.map((e) => e.q) : nEntries.map((e) => e.x);
  const nn = L.dot(n, n, F);
  if (F.isZero(nn)) return null;
  const outer = n.map((a) => n.map((b) => F.div(F.mul(a, b), nn))); // n nᵀ / nᵀn
  const I = L.identity(3, F);
  let Mx;
  if (kind === 'projl') Mx = outer;
  else if (kind === 'projp') Mx = L.matSub(I, outer, F);
  else if (kind === 'refl') Mx = L.matSub(I, L.matScale(outer, F.fromInt(2), F), F);
  else if (kind === 'rot') {
    const u = L.normalize(nEntries.map((e) => e.x));
    const th = (thetaDeg * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th), C = 1 - c;
    const [x, y, z] = u;
    const R = [
      [c + x * x * C, x * y * C - z * s, x * z * C + y * s],
      [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
      [z * x * C - y * s, z * y * C + x * s, c + z * z * C],
    ];
    return R.map((row) => row.map(floatEntry));
  }
  return Mx.map((row) => row.map((a) => (F === RationalField ? makeEntry(a.toString()) : floatEntry(a))));
}

function floatEntry(x) {
  const r = Math.abs(x) < 1e-12 ? 0 : x;
  return { text: numberToInput(r), x: r, q: Math.abs(r - Math.round(r)) < 1e-12 ? Rational.of(Math.round(r)) : null, ok: true };
}

const analyze = memo((A) => analyzeSquare(A));
const effective = (s) => (s.param ? paramMatrix(s.param, s.n, s.theta) || s.A : s.A);

createLab({
  id: 't3d',
  lead: {
    es: 'Una matriz 3 × 3 mueve todo el espacio. Sus columnas dicen adónde van î, ĵ y k̂; el resto lo decide la linealidad.',
    en: 'A 3 × 3 matrix moves all of space. Its columns say where î, ĵ and k̂ go; linearity decides the rest.',
  },
  state: {
    A: { def: M([[2, 0, 0], [0, 1, -1], [0, 1, 1]]), codec: codec.matrix(3, 3) },
    param: { def: '', codec: codec.enum(['', 'rot', 'refl', 'projl', 'projp']) },
    n: { def: V([1, 1, 1]), codec: codec.vector(3) },
    theta: { def: 120, codec: codec.num(-360, 360) },
    v: { def: V([1, 1, 1]), codec: codec.vector(3) },
    t: { def: 1, codec: codec.num(0, 1) },
    mode: { def: 'cubes', codec: codec.enum(['cubes', 'lattice', 'points', 'none']) },
    show: { def: ['det'], codec: codec.flags(['det', 'eig', 'ker', 'v']) },
  },

  build(ctx) {
    const { store } = ctx;
    const scene = new Scene3D(ctx.addView(), { extent: 5 });
    const anim = animator({ store, key: 't', max: 1 });
    ctx.bar.append(anim.el);

    const toCustom = (A) => { anim.pause(); store.set({ A, param: '', t: 1 }); };
    const setCol = (j) => (p) => {
      const A = effective(store.state).map((row) => row.slice());
      for (let i = 0; i < 3; i++) A[i][j] = entryFromNumber(p[i]);
      toCustom(A);
    };
    const col = (j) => () => { const A = effective(store.state); return [A[0][j].x, A[1][j].x, A[2][j].x]; };
    scene.addHandle({ id: 'i', color: 'i', get: col(0), set: setCol(0) });
    scene.addHandle({ id: 'j', color: 'j', get: col(1), set: setCol(1) });
    scene.addHandle({ id: 'k', color: 'k', get: col(2), set: setCol(2) });
    scene.addHandle({ id: 'v', color: 'v', visible: () => store.get('show').includes('v'), get: () => store.get('v').map((e) => e.x), set: (p) => store.set({ v: p.map(entryFromNumber) }) });

    // Panel -------------------------------------------------------------------
    const editor = matrixEditor({
      rows: 3, cols: 3, colColors: COL_VARS, label: 'A =', name: { es: 'Matriz A', en: 'Matrix A' },
      get: () => effective(store.state),
      set: (A) => toCustom(A),
    });
    const presets = presetSelect({
      store, key: 'A', presets: PRESETS, groups: GROUPS,
      onPick: (p) => {
        anim.pause();
        if (p.param) store.set({ param: p.param, t: 1 });
        else store.set({ A: M(p.value), param: '', t: 1 });
      },
    });
    const nEditor = vectorEditor({ n: 3, get: () => store.get('n'), set: (n) => store.set({ n }), label: '\\mathbf{n} =', color: 'var(--c-w)', name: { es: 'Vector n', en: 'Vector n' } });
    const theta = slider({ label: { es: 'Ángulo θ', en: 'Angle θ' }, labelTex: '\\theta', min: -180, max: 180, step: 1, get: () => store.get('theta'), set: (v) => store.set({ theta: v }), format: (v) => `${v}°` });
    const paramNote = h('p');
    const paramBox = h('div', { class: 'card__body', style: { padding: '0' } }, nEditor.el, theta.el, paramNote);
    const tip = h('p');
    setText(tip, { es: 'Arrastra las esferas de colores (columnas de A) o escribe valores exactos. Arrastra el fondo para girar la vista.', en: 'Drag the coloured spheres (columns of A) or type exact values. Drag the background to rotate the view.' });
    const matrixCard = card({ title: { es: 'Matriz', en: 'Matrix' }, body: [editor.el, presets.el, paramBox, tip] });

    const modeSeg = segmented({
      options: [
        { value: 'cubes', label: { es: 'Octantes', en: 'Octants' } },
        { value: 'lattice', label: { es: 'Retícula', en: 'Lattice' } },
        { value: 'points', label: { es: 'Puntos', en: 'Points' } },
        { value: 'none', label: { es: 'Nada', en: 'None' } },
      ],
      get: () => store.get('mode'), set: (mode) => store.set({ mode }),
      label: { es: 'Qué se transforma', en: 'What is transformed' },
    });
    const chips = [
      flagChip(store, 'show', 'det', { es: 'Determinante', en: 'Determinant' }, 'var(--c-det)'),
      flagChip(store, 'show', 'eig', { es: 'Vectores propios', en: 'Eigenvectors' }, 'var(--c-eig)'),
      flagChip(store, 'show', 'ker', { es: 'Núcleo e imagen', en: 'Kernel and image' }, 'var(--c-ker)'),
      flagChip(store, 'show', 'v', { es: 'Vector v', en: 'Vector v' }, 'var(--c-v)'),
    ];
    const vEditor = vectorEditor({ n: 3, get: () => store.get('v'), set: (v) => store.set({ v }), label: '\\vec{v} =' });
    const vRow = h('div', null, vEditor.el);
    const showCard = card({ title: { es: 'Mostrar', en: 'Show' }, body: [modeSeg.el, h('div', { class: 'chip-row' }, chips.map((c) => c.el)), vRow] });

    const r = {
      av: readout(null, { labelTex: 'A\\vec{v}' }),
      det: readout(null, { labelTex: '\\det A' }),
      rank: readout({ es: 'Rango y nulidad', en: 'Rank and nullity' }),
      ker: readout(null, { labelTex: '\\ker A' }),
      img: readout(null, { labelTex: '\\operatorname{Im} A' }),
      poly: readout({ es: 'Polinomio', en: 'Polynomial' }, { block: true }),
      eigval: readout({ es: 'Valores propios', en: 'Eigenvalues' }, { block: true }),
      eigvec: readout({ es: 'Vectores propios', en: 'Eigenvectors' }, { block: true }),
      inv: readout(null, { labelTex: 'A^{-1}' }),
    };
    const analysisCard = card({ title: { es: 'Análisis', en: 'Analysis' }, body: [h('div', { class: 'readouts' }, Object.values(r).map((x) => x.el))] });
    ctx.panel.append(matrixCard.el, showCard.el, analysisCard.el);

    // Scene ---------------------------------------------------------------------
    let space = null; // transformed content (rebuilt when the mode or theme changes)
    let spaceKey = '';
    let staticKey = '';
    let staticGroup = null;
    let movingGroup = null;

    function buildSpace(mode) {
      if (space) { scene.dynamic.remove(space); disposeTree(space); }
      space = scene.transformedGroup(L.identityFloat(3));
      if (mode === 'cubes') {
        const cols = ['#ff5d52', '#3d8bff', '#43c75e', '#b35cff', '#ffd23f', '#5fd8ff', '#ff9340', '#3fb58f'];
        let k = 0;
        for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
          const box = boxMesh(scene, [x, y, z], 2, cols[k++ % cols.length]);
          space.add(box);
        }
      } else if (mode === 'lattice') {
        const pts = [];
        const R = 3;
        for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) {
          pts.push(-R, a, b, R, a, b, a, -R, b, a, R, b, a, b, -R, a, b, R);
        }
        space.add(latticeSegments(scene, pts));
      } else if (mode === 'points') {
        space.add(pointCloud(scene));
      }
    }

    function render(state, changed) {
      const A = effective(state);
      const an = analyze(entriesKey(A), A);
      const show = state.show;
      const t = state.t;
      const Mt = L.lerpMatrix(L.identityFloat(3), an.Af, t);

      editor.update(); nEditor.update(); vEditor.update(); anim.update(); modeSeg.update(); theta.update();
      chips.forEach((c) => c.update());
      vRow.hidden = !show.includes('v');
      paramBox.hidden = !state.param;
      theta.el.hidden = state.param !== 'rot';
      setText(paramNote, {
        rot: { es: 'Rotación de ángulo θ alrededor del eje gen{n} (regla de la mano derecha).', en: 'Rotation by θ about the axis span{n} (right-hand rule).' },
        refl: { es: 'Reflexión de Householder: A = I − 2 n nᵀ/(nᵀn). Exacta si n es racional.', en: 'Householder reflection: A = I − 2 n nᵀ/(nᵀn). Exact when n is rational.' },
        projl: { es: 'Proyección ortogonal sobre la recta gen{n}: A = n nᵀ/(nᵀn).', en: 'Orthogonal projection onto the line span{n}: A = n nᵀ/(nᵀn).' },
        projp: { es: 'Proyección ortogonal sobre el plano n·x = 0: A = I − n nᵀ/(nᵀn).', en: 'Orthogonal projection onto the plane n·x = 0: A = I − n nᵀ/(nᵀn).' },
      }[state.param] || '');

      // Rebuild the transformed content only when needed.
      const sk = `${state.mode}`;
      if (sk !== spaceKey || !space) { spaceKey = sk; buildSpace(state.mode); }
      scene.setGroupMatrix(space, Mt);

      // Static per matrix: eigen lines, kernel, image.
      const stk = `${entriesKey(A)}|${show.join('.')}`;
      if (stk !== staticKey) {
        staticKey = stk;
        if (staticGroup) { scene.dynamic.remove(staticGroup); disposeTree(staticGroup); }
        staticGroup = new THREE.Group();
        scene.dynamic.add(staticGroup);
        buildStatic(an, show, staticGroup);
      }
      // Moving objects: basis arrows, det box, v.
      if (movingGroup) { scene.dynamic.remove(movingGroup); disposeTree(movingGroup); }
      movingGroup = new THREE.Group();
      scene.dynamic.add(movingGroup);
      const g = movingGroup;
      const cols = [0, 1, 2].map((j) => [Mt[0][j], Mt[1][j], Mt[2][j]]);
      const names = ['\\hat{\\imath}', '\\hat{\\jmath}', '\\hat{k}'];
      ['i', 'j', 'k'].forEach((c, j) => {
        const e = [0, 0, 0]; e[j] = 1;
        scene.arrow([0, 0, 0], e, c, { opacity: 0.3, radius: 0.025, group: g });
        scene.arrow([0, 0, 0], cols[j], c, { group: g, radius: 0.04 });
        scene.label(cols[j], names[j], c, { tex: true, offset: [12, -12], group: g, size: 17 });
      });
      if (show.includes('det')) {
        const d = L.det3(Mt);
        scene.parallelepiped(Mt, d < -1e-12 ? 'detNeg' : 'det', { opacity: 0.28, group: g });
      }
      if (show.includes('v')) {
        const vv = state.v.map((e) => e.x);
        const tv = L.mv3(Mt, vv);
        scene.arrow([0, 0, 0], vv, 'v', { opacity: 0.35, radius: 0.025, group: g });
        scene.arrow([0, 0, 0], tv, 'v', { group: g, radius: 0.04 });
        scene.label(tv, 'A\\vec{v}', 'v', { tex: true, offset: [14, -12], group: g });
      }
      scene.syncHandles();
      scene.requestRender();

      // Readouts
      const F = an.F;
      if (show.includes('v')) {
        const vf = L.fieldVector(state.v, F);
        r.av.set(`${cls('c-v', texVector(L.matVec(an.M, vf, F)))}`);
        r.av.show(true);
      } else r.av.show(false);
      r.det.set(texValue(an.det), texDetNote(an.det, F, 3));
      r.rank.set(`${rankOp()} A = ${an.rank},\\quad \\dim\\ker A = ${an.nullity}`);
      r.ker.set(cls('c-ker', texSpan(an.ker, 3)));
      r.img.set(cls('c-img', texSpan(an.img, 3)));
      r.poly.set(charPolyTex(an.eig));
      const et = eigenTex(an.eig);
      r.eigval.set(et.values, an.eig.exact ? null : { es: 'Valores aproximados (el polinomio no se factoriza en ℚ, o las entradas no son racionales).', en: 'Approximate values (the polynomial does not factor over ℚ, or the entries are not rational).' });
      if (et.reals.length) { r.eigvec.set(eigenvectorTex(an.eig), defectiveNote(an.eig) || (et.complex.length ? { es: 'El par complejo corresponde a un plano invariante donde A actúa como rotación-escalado.', en: 'The complex pair corresponds to an invariant plane on which A acts as a rotation-scaling.' } : null)); r.eigvec.show(true); }
      else r.eigvec.show(false);
      r.inv.set(an.inv ? texMatrix(an.inv) : `\\text{${tr({ es: 'no existe', en: 'does not exist' })}}`);

      ctx.setLegend([
        { color: 'var(--c-i)', tex: 'A\\hat{\\imath}' },
        { color: 'var(--c-j)', tex: 'A\\hat{\\jmath}' },
        { color: 'var(--c-k)', tex: 'A\\hat{k}' },
        show.includes('det') && { color: 'var(--c-det)', kind: 'area', label: { es: 'imagen del cubo unidad (volumen = |det A|)', en: 'image of the unit cube (volume = |det A|)' } },
        show.includes('eig') && { color: 'var(--c-eig)', kind: 'dash', label: { es: 'ejes propios / plano invariante', en: 'eigen-axes / invariant plane' } },
        show.includes('ker') && { color: 'var(--c-ker)', label: { es: 'núcleo', en: 'kernel' } },
        show.includes('ker') && { color: 'var(--c-img)', kind: 'area', label: { es: 'imagen', en: 'image' } },
        show.includes('v') && { color: 'var(--c-v)', tex: 'A\\vec{v}' },
      ]);
      return { an, A };
    }

    function buildStatic(an, show, group) {
      const F = an.F;
      if (show.includes('eig')) {
        for (const e of realEigenDirections(an.eig)) {
          e.dirs.forEach((d) => {
            scene.lineThrough([0, 0, 0], d, 'eig', { dashed: true, group, length: 9 });
            scene.label(d.map((x) => x * 3.2), `\\lambda = ${texValue(e.lambda)}`, 'eig', { tex: true, group, size: 13 });
          });
        }
        const cpx = an.eig.eigen.find((e) => !e.real && e.approx.im > 0);
        if (cpx && cpx.vectors.length) {
          const w = approxVector(cpx.vectors[0]);
          const u = L.normalize(w.map((z) => z.re)), v0 = w.map((z) => z.im);
          // Orthonormalise the (real, imaginary) pair to draw the invariant plane.
          const vproj = L.subVec(v0, L.scaleVec(u, L.dotFloat(v0, u)));
          const vv = L.normalize(vproj);
          if (L.norm(vv) > 0.5) scene.planeSpan([0, 0, 0], u, vv, 'eig', { size: 4, opacity: 0.12, grid: 1, group });
        }
      }
      if (show.includes('ker')) {
        const ker = an.ker.map((v) => v.map((x) => F.toNumber(x)));
        if (ker.length === 1) scene.lineThrough([0, 0, 0], ker[0], 'ker', { group, length: 9 });
        else if (ker.length === 2) scene.planeSpan([0, 0, 0], L.normalize(ker[0]), L.orthoTo(ker[0], ker[1]), 'ker', { size: 4, opacity: 0.18, group });
        const img = an.img.map((v) => v.map((x) => F.toNumber(x)));
        if (img.length === 1) scene.lineThrough([0, 0, 0], img[0], 'img', { group, length: 9 });
        else if (img.length === 2) scene.planeSpan([0, 0, 0], L.normalize(img[0]), L.orthoTo(img[0], img[1]), 'img', { size: 4, opacity: 0.16, grid: 1, group });
        if (an.rank === 0) scene.point([0, 0, 0], 'img', { r: 0.14, group });
      }
    }

    scene.onTheme = () => { staticKey = ''; spaceKey = ''; ctx.rerender(); };

    return {
      render,
      snapshot: () => scene.snapshot(),
      togglePlay: () => anim.toggle(),
      onReset: () => { anim.pause(); scene.setView('iso'); },
    };
  },

  learn: {
    what: {
      es: `<p>Los ejes grises son $x$, $y$ (horizontales) y $z$ (vertical). Las flechas tenues son $\\hat{\\imath}, \\hat{\\jmath}, \\hat{k}$; las intensas son sus imágenes, es decir, las <strong>columnas de $A$</strong>. Todo lo demás (los ocho cubos de los octantes, la retícula o la nube de puntos coloreada por posición) se mueve de forma lineal: cada punto $x\\hat{\\imath}+y\\hat{\\jmath}+z\\hat{k}$ va a $x\\,A\\hat{\\imath}+y\\,A\\hat{\\jmath}+z\\,A\\hat{k}$.</p>
<ul>
<li><strong>Determinante.</strong> El cubo unidad $[0,1]^3$ se convierte en el paralelepípedo generado por las columnas; su volumen es $|\\det A|$. Un determinante negativo invierte la orientación (la regla de la mano derecha pasa a ser de la mano izquierda).</li>
<li><strong>Vectores propios.</strong> Rectas que no giran. Un par de valores propios complejos $a\\pm bi$ no da rectas reales, sino un <em>plano invariante</em> en el que $A$ actúa como una rotación-escalado.</li>
<li><strong>Núcleo e imagen.</strong> Cuando $\\det A = 0$, una recta o un plano entero colapsa en el origen y el espacio cae en un plano, una recta o un punto.</li>
</ul>
<p>Los ejemplos «n…» construyen la matriz a partir de un vector $\\mathbf{n}$: proyecciones $\\frac{\\mathbf{n}\\mathbf{n}^{\\mathsf T}}{\\mathbf{n}^{\\mathsf T}\\mathbf{n}}$, reflexiones de Householder y rotaciones alrededor de un eje (fórmula de Rodrigues).</p>`,
      en: `<p>The grey axes are $x$, $y$ (horizontal) and $z$ (vertical). The faint arrows are $\\hat{\\imath}, \\hat{\\jmath}, \\hat{k}$; the bright ones are their images, that is, the <strong>columns of $A$</strong>. Everything else (the eight octant cubes, the lattice or the point cloud coloured by position) moves linearly: each point $x\\hat{\\imath}+y\\hat{\\jmath}+z\\hat{k}$ goes to $x\\,A\\hat{\\imath}+y\\,A\\hat{\\jmath}+z\\,A\\hat{k}$.</p>
<ul>
<li><strong>Determinant.</strong> The unit cube $[0,1]^3$ becomes the parallelepiped spanned by the columns; its volume is $|\\det A|$. A negative determinant reverses orientation (the right-hand rule becomes a left-hand rule).</li>
<li><strong>Eigenvectors.</strong> Lines that do not turn. A pair of complex eigenvalues $a\\pm bi$ gives no real lines, but an <em>invariant plane</em> on which $A$ acts as a rotation-scaling.</li>
<li><strong>Kernel and image.</strong> When $\\det A = 0$, a whole line or plane collapses to the origin and space lands on a plane, a line or a point.</li>
</ul>
<p>The “n…” examples build the matrix from a vector $\\mathbf{n}$: projections $\\frac{\\mathbf{n}\\mathbf{n}^{\\mathsf T}}{\\mathbf{n}^{\\mathsf T}\\mathbf{n}}$, Householder reflections and rotations about an axis (Rodrigues’ formula).</p>`,
    },
    prompts: {
      es: [
        'Con la matriz inicial, activa los vectores propios: ¿por qué hay una sola recta propia y un plano invariante? Relaciónalo con los valores propios $2$ y $1\\pm i$.',
        'Elige «Sobre el plano XY». ¿Qué parte del espacio colapsa? Activa núcleo e imagen y comprueba el teorema del rango: $\\operatorname{rango} + \\operatorname{nulidad} = 3$.',
        'Elige «Eje n, ángulo θ» con $\\mathbf{n} = (1,1,1)$ y $\\theta = 120°$. ¿Qué hace la matriz con $\\hat{\\imath}, \\hat{\\jmath}, \\hat{k}$?',
        'En «Respecto al plano ⟂ n…», cambia $\\mathbf{n}$. ¿Cuánto vale siempre $\\det A$? ¿Y $A^2$?',
        'Arrastra $\\hat{k}$ hasta el plano generado por $A\\hat{\\imath}$ y $A\\hat{\\jmath}$. ¿Qué le pasa al volumen?',
      ],
      en: [
        'With the initial matrix, turn on eigenvectors: why is there a single eigenline plus an invariant plane? Relate it to the eigenvalues $2$ and $1\\pm i$.',
        'Pick “Onto the XY plane”. Which part of space collapses? Turn on kernel and image and check the rank–nullity theorem: $\\operatorname{rank} + \\operatorname{nullity} = 3$.',
        'Pick “Axis n, angle θ” with $\\mathbf{n} = (1,1,1)$ and $\\theta = 120°$. What does the matrix do to $\\hat{\\imath}, \\hat{\\jmath}, \\hat{k}$?',
        'In “Across the plane ⟂ n…”, change $\\mathbf{n}$. What is $\\det A$ always? And $A^2$?',
        'Drag $\\hat{k}$ into the plane spanned by $A\\hat{\\imath}$ and $A\\hat{\\jmath}$. What happens to the volume?',
      ],
    },
    formal: [
      {
        kind: 'theorem',
        title: { es: 'Determinante y volumen', en: 'Determinant and volume' },
        body: {
          es: '<p>Para $A\\in\\mathbb{R}^{3\\times3}$ y toda región medible $S$, $\\operatorname{vol}(A(S)) = |\\det A|\\operatorname{vol}(S)$. En particular, el paralelepípedo generado por las columnas $\\mathbf{a}_1,\\mathbf{a}_2,\\mathbf{a}_3$ tiene volumen $|\\det A| = |\\mathbf{a}_1\\cdot(\\mathbf{a}_2\\times\\mathbf{a}_3)|$.</p>',
          en: '<p>For $A\\in\\mathbb{R}^{3\\times3}$ and every measurable region $S$, $\\operatorname{vol}(A(S)) = |\\det A|\\operatorname{vol}(S)$. In particular, the parallelepiped spanned by the columns $\\mathbf{a}_1,\\mathbf{a}_2,\\mathbf{a}_3$ has volume $|\\det A| = |\\mathbf{a}_1\\cdot(\\mathbf{a}_2\\times\\mathbf{a}_3)|$.</p>',
        },
      },
      {
        kind: 'proposition',
        title: { es: 'Toda matriz real 3 × 3 tiene un valor propio real', en: 'Every real 3 × 3 matrix has a real eigenvalue' },
        body: {
          es: '<p>El polinomio característico $p(\\lambda) = \\lambda^3 - \\operatorname{tr}(A)\\lambda^2 + c_1\\lambda - \\det A$ tiene grado impar, así que tiene una raíz real. Si $R$ es una rotación ($R^{\\mathsf T}R = I$, $\\det R = 1$), todos sus valores propios cumplen $|\\lambda| = 1$ y su producto es $1$; de ahí que $\\lambda = 1$ sea valor propio: toda rotación de $\\mathbb{R}^3$ tiene un eje de vectores fijos. Si las otras raíces son $a\\pm bi$ con $b\\neq 0$ y $\\mathbf{w} = \\mathbf{u}+i\\mathbf{v}$ es vector propio, el plano $\\operatorname{gen}\\{\\mathbf{u},\\mathbf{v}\\}$ es invariante.</p>',
          en: '<p>The characteristic polynomial $p(\\lambda) = \\lambda^3 - \\operatorname{tr}(A)\\lambda^2 + c_1\\lambda - \\det A$ has odd degree, so it has a real root. If $R$ is a rotation ($R^{\\mathsf T}R = I$, $\\det R = 1$), all its eigenvalues satisfy $|\\lambda| = 1$ and their product is $1$; hence $\\lambda = 1$ is an eigenvalue: every rotation of $\\mathbb{R}^3$ has an axis of fixed vectors. If the other roots are $a\\pm bi$ with $b\\neq 0$ and $\\mathbf{w} = \\mathbf{u}+i\\mathbf{v}$ is an eigenvector, the plane $\\operatorname{span}\\{\\mathbf{u},\\mathbf{v}\\}$ is invariant.</p>',
        },
      },
      {
        kind: 'definition',
        title: { es: 'Proyecciones, reflexiones y rotaciones', en: 'Projections, reflections and rotations' },
        body: {
          es: '<p>Con $\\mathbf{n}\\neq\\mathbf{0}$ y $P = \\dfrac{\\mathbf{n}\\mathbf{n}^{\\mathsf T}}{\\mathbf{n}^{\\mathsf T}\\mathbf{n}}$: $P$ es la proyección ortogonal sobre $\\operatorname{gen}\\{\\mathbf{n}\\}$ ($P^2 = P = P^{\\mathsf T}$), $I-P$ proyecta sobre el plano $\\mathbf{n}^{\\perp}$ y $H = I-2P$ es la reflexión respecto de $\\mathbf{n}^{\\perp}$ ($H^2 = I$, $\\det H = -1$). La rotación de ángulo $\\theta$ alrededor del eje unitario $\\mathbf{u}$ es $R = \\cos\\theta\\, I + \\sin\\theta\\,[\\mathbf{u}]_\\times + (1-\\cos\\theta)\\,\\mathbf{u}\\mathbf{u}^{\\mathsf T}$ (Rodrigues), con $R^{\\mathsf T}R = I$ y $\\det R = 1$.</p>',
          en: '<p>With $\\mathbf{n}\\neq\\mathbf{0}$ and $P = \\dfrac{\\mathbf{n}\\mathbf{n}^{\\mathsf T}}{\\mathbf{n}^{\\mathsf T}\\mathbf{n}}$: $P$ is the orthogonal projection onto $\\operatorname{span}\\{\\mathbf{n}\\}$ ($P^2 = P = P^{\\mathsf T}$), $I-P$ projects onto the plane $\\mathbf{n}^{\\perp}$ and $H = I-2P$ is the reflection across $\\mathbf{n}^{\\perp}$ ($H^2 = I$, $\\det H = -1$). The rotation by $\\theta$ about the unit axis $\\mathbf{u}$ is $R = \\cos\\theta\\, I + \\sin\\theta\\,[\\mathbf{u}]_\\times + (1-\\cos\\theta)\\,\\mathbf{u}\\mathbf{u}^{\\mathsf T}$ (Rodrigues), with $R^{\\mathsf T}R = I$ and $\\det R = 1$.</p>',
        },
      },
      {
        kind: 'theorem',
        title: { es: 'Rango y nulidad', en: 'Rank–nullity' },
        body: {
          es: '<p>$\\dim\\operatorname{Im}A + \\dim\\ker A = 3$. Las columnas pivote de $A$ forman una base de $\\operatorname{Im}A$, y las soluciones básicas de $A\\mathbf{x} = \\mathbf{0}$ (una por variable libre) forman una base de $\\ker A$.</p>',
          en: '<p>$\\dim\\operatorname{Im}A + \\dim\\ker A = 3$. The pivot columns of $A$ form a basis of $\\operatorname{Im}A$, and the basic solutions of $A\\mathbf{x} = \\mathbf{0}$ (one per free variable) form a basis of $\\ker A$.</p>',
        },
      },
    ],
  },

  challenges: [
    {
      id: 'vol3',
      title: { es: 'Volumen −3', en: 'Volume −3' },
      text: { es: 'Construye una transformación que triplique los volúmenes e invierta la orientación.', en: 'Build a map that triples volumes and reverses orientation.' },
      hint: { es: 'Una matriz diagonal basta; ¿qué signos necesitas?', en: 'A diagonal matrix is enough; which signs do you need?' },
      check: (s, d) => Math.abs(d.an.F.toNumber(d.an.det) + 3) < 1e-9,
    },
    {
      id: 'ker111',
      title: { es: 'Aplasta la diagonal', en: 'Squash the diagonal' },
      text: { es: 'Haz que el núcleo sea exactamente la recta generada por $(1,1,1)$.', en: 'Make the kernel exactly the line spanned by $(1,1,1)$.' },
      hint: { es: 'Cada fila debe sumar $0$ y el rango debe ser $2$. Prueba con la proyección sobre el plano ⟂ n.', en: 'Each row must add up to $0$ and the rank must be $2$. Try the projection onto the plane ⟂ n.' },
      check: (s, d) => d.an.rank === 2 && d.an.Af.every((row) => Math.abs(row[0] + row[1] + row[2]) < 1e-9),
    },
    {
      id: 'rot120',
      title: { es: 'Permuta los ejes girando', en: 'Permute the axes by turning' },
      text: { es: 'Construye una rotación que lleve $\\hat{\\imath}\\to\\hat{\\jmath}\\to\\hat{k}\\to\\hat{\\imath}$. ¿Cuál es su eje y su ángulo?', en: 'Build a rotation sending $\\hat{\\imath}\\to\\hat{\\jmath}\\to\\hat{k}\\to\\hat{\\imath}$. What are its axis and angle?' },
      hint: { es: 'Las columnas son $\\hat{\\jmath}, \\hat{k}, \\hat{\\imath}$. El eje es $(1,1,1)$.', en: 'The columns are $\\hat{\\jmath}, \\hat{k}, \\hat{\\imath}$. The axis is $(1,1,1)$.' },
      check: (s, d) => {
        const a = d.an.Af, T = [[0, 0, 1], [1, 0, 0], [0, 1, 0]];
        return T.every((row, i) => row.every((x, j) => Math.abs(a[i][j] - x) < 1e-6));
      },
    },
    {
      id: 'oblique',
      title: { es: 'Proyección oblicua', en: 'Oblique projection' },
      text: { es: 'Encuentra una proyección sobre un plano que <em>no</em> sea ortogonal: $A^2 = A$, rango 2, pero $A^{\\mathsf T}\\neq A$.', en: 'Find a projection onto a plane that is <em>not</em> orthogonal: $A^2 = A$, rank 2, but $A^{\\mathsf T}\\neq A$.' },
      hint: { es: 'Parte de «Sobre el plano XY» y cambia la tercera columna: ¿qué condición debe cumplir para que $A^2 = A$?', en: 'Start from “Onto the XY plane” and change the third column: what must it satisfy so that $A^2 = A$?' },
      check: (s, d) => {
        const a = d.an.Af;
        const a2 = L.mulFloat(a, a);
        const idem = a2.every((row, i) => row.every((x, j) => Math.abs(x - a[i][j]) < 1e-9));
        const sym = a.every((row, i) => row.every((x, j) => Math.abs(x - a[j][i]) < 1e-9));
        return idem && !sym && d.an.rank === 2;
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Scene helpers
// ---------------------------------------------------------------------------

function boxMesh(scene, center, size, color) {
  const geo = new THREE.BoxGeometry(size, size, size);
  geo.translate(...center);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })));
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.7 })));
  return g;
}

function latticeSegments(scene, pts) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: scene.color('tgrid'), transparent: true, opacity: 0.55 }));
}

function pointCloud(scene) {
  const pos = [], col = [];
  const R = 3;
  for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) for (let k = -R; k <= R; k++) {
    pos.push(i * 0.75, j * 0.75, k * 0.75);
    col.push((i + R) / (2 * R), (j + R) / (2 * R), (k + R) / (2 * R));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, vertexColors: true }));
}

function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
    if (o.isCSS2DObject && o.element && o.element.parentNode) o.element.parentNode.removeChild(o.element);
  });
}
