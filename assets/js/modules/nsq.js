import { createLab, composeCanvases } from '../ui/shell.js';
import { codec, M, V } from '../ui/store.js';
import { Plane2D } from '../ui/plane2d.js';
import { Scene3D, THREE } from '../ui/scene3d.js';
import { card, matrixEditor, vectorEditor, flagChip, readout, animator, segmented, selectBox } from '../ui/controls.js';
import { h } from '../ui/dom.js';
import { tr, setText } from '../ui/i18n.js';
import { entryFromNumber, makeEntry } from '../core/parse.js';
import * as L from '../core/linalg.js';
import { texVector, texMatrix, cls } from '../core/format.js';
import { COLS, COL_VARS, texSpan, rankOp, memo, entriesKey } from './common.js';

const DIMS = ['3x2', '2x3', '1x3', '1x2', '3x1', '2x1'];
const DEFAULTS = {
  '3x2': { A: [[1, 0], [0, 1], [1, -1]], v: [1, 1] },
  '2x3': { A: [[1, 0, 1], [0, 1, 1]], v: [1, 1, 1] },
  '1x3': { A: [[1, 2, -1]], v: [1, 0, 1] },
  '1x2': { A: [[1, 2]], v: [1, 1] },
  '3x1': { A: [[1], [2], [1]], v: [1] },
  '2x1': { A: [[2], [1]], v: [1] },
};
const dimsOf = (d) => d.split('x').map(Number); // [m, n]
const HATS = ['î', 'ĵ', 'k̂'];
const TEX_HATS = ['\\hat{\\imath}', '\\hat{\\jmath}', '\\hat{k}'];
const COLOR_KEYS = ['i', 'j', 'k'];
const cloudCache = {};

const analyze = memo((A) => {
  const { F, M: Mx } = L.fieldMatrix(A);
  const { R, rank } = L.rref(Mx, F);
  return { F, M: Mx, R, rank, ker: L.nullspace(Mx, F), img: L.columnSpace(Mx, F), Af: A.map((r) => r.map((e) => e.x)) };
});

createLab({
  id: 'nsq',
  wide: true,
  lead: {
    es: 'Una matriz m × n lleva ℝⁿ a ℝᵐ. Si n > m algo tiene que colapsar; si n < m la imagen no puede llenar el espacio de llegada.',
    en: 'An m × n matrix takes ℝⁿ to ℝᵐ. If n > m something must collapse; if n < m the image cannot fill the target space.',
  },
  state: {
    dims: { def: '3x2', codec: codec.enum(DIMS) },
    A: { def: M(DEFAULTS['3x2'].A), codec: codec.anyMatrix() },
    v: { def: V(DEFAULTS['3x2'].v), codec: codec.vector(null) },
    view: { def: 'split', codec: codec.enum(['split', 'morph']) },
    t: { def: 1, codec: codec.num(0, 1) },
    show: { def: ['ker', 'img', 'v'], codec: codec.flags(['ker', 'img', 'v', 'cloud']) },
  },

  build(ctx) {
    const { store } = ctx;
    // Make sure A and v match the dimensions (e.g. a hand-edited URL).
    const fixShape = () => {
      const [m, n] = dimsOf(store.get('dims'));
      const A = store.get('A');
      const patch = {};
      if (A.length !== m || A.some((row) => row.length !== n)) patch.A = M(DEFAULTS[store.get('dims')].A);
      if (store.get('v').length !== n) patch.v = V(DEFAULTS[store.get('dims')].v);
      if (Object.keys(patch).length) store.set(patch);
    };
    fixShape();

    const anim = animator({ store, key: 't', max: 1 });
    ctx.bar.append(anim.el);

    // Panel ---------------------------------------------------------------------
    const dimSel = selectBox({
      options: DIMS.map((d) => { const [m, n] = dimsOf(d); return { value: d, label: { es: `${m} × ${n}   (ℝ${sup(n)} → ℝ${sup(m)})`, en: `${m} × ${n}   (ℝ${sup(n)} → ℝ${sup(m)})` } }; }),
      get: () => store.get('dims'),
      set: (dims) => store.set({ dims, A: M(DEFAULTS[dims].A), v: V(DEFAULTS[dims].v), t: 1 }),
      label: { es: 'Dimensiones', en: 'Dimensions' },
    });
    const viewSeg = segmented({
      options: [{ value: 'split', label: { es: 'Dominio | codominio', en: 'Domain | codomain' } }, { value: 'morph', label: { es: 'Animación', en: 'Animation' } }],
      get: () => store.get('view'), set: (view) => store.set({ view }),
      label: { es: 'Vista', en: 'View' },
    });
    const editorSlot = h('div');
    const vSlot = h('div');
    const tip = h('p');
    setText(tip, { es: 'En el codominio arrastra las columnas Aî, Aĵ, Ak̂; en el dominio, el vector v.', en: 'In the codomain drag the columns Aî, Aĵ, Ak̂; in the domain, the vector v.' });
    const dimField = h('div', { class: 'field' }, h('label', null), dimSel.el);
    setText(dimField.firstChild, { es: 'Dimensiones', en: 'Dimensions' });
    const matrixCard = card({ title: { es: 'Matriz', en: 'Matrix' }, body: [dimField, editorSlot, viewSeg.el, tip] });

    const chips = [
      flagChip(store, 'show', 'ker', { es: 'Núcleo', en: 'Kernel' }, 'var(--c-ker)'),
      flagChip(store, 'show', 'img', { es: 'Imagen', en: 'Image' }, 'var(--c-img)'),
      flagChip(store, 'show', 'v', { es: 'Vector v', en: 'Vector v' }, 'var(--c-v)'),
      flagChip(store, 'show', 'cloud', { es: 'Nube de puntos', en: 'Point cloud' }, 'var(--c-w)'),
    ];
    const showCard = card({ title: { es: 'Mostrar', en: 'Show' }, body: [h('div', { class: 'chip-row' }, chips.map((c) => c.el)), vSlot] });

    const r = {
      map: readout({ es: 'Función', en: 'Map' }),
      rank: readout({ es: 'Rango y nulidad', en: 'Rank and nullity' }, { block: true }),
      img: readout(null, { labelTex: '\\operatorname{Im} A' }),
      ker: readout(null, { labelTex: '\\ker A' }),
      inj: readout({ es: 'Tipo', en: 'Type' }),
      av: readout(null, { labelTex: 'A\\vec{v}' }),
      rref: readout({ es: 'Escalonada reducida', en: 'Reduced echelon form' }),
    };
    const analysisCard = card({ title: { es: 'Análisis exacto', en: 'Exact analysis' }, body: [h('div', { class: 'readouts' }, Object.values(r).map((x) => x.el))] });
    ctx.panel.append(matrixCard.el, showCard.el, analysisCard.el);

    // Views ---------------------------------------------------------------------
    let views = [];
    let viewKey = '';
    let editor = null, vEditor = null, editorKey = '';
    let cur = null;

    const colAt = (j) => () => {
      const A = store.get('A');
      return A.map((row) => row[j].x);
    };
    const setColFromPoint = (j, m) => (p) => {
      const A = store.get('A').map((row) => row.slice());
      for (let i = 0; i < m; i++) A[i][j] = entryFromNumber(p[i]);
      store.set({ A });
    };
    const setV = (n) => (p) => store.set({ v: p.slice(0, n).map(entryFromNumber) });

    function buildViews(state) {
      views.forEach((v) => v.dispose());
      views = [];
      ctx.clearViews();
      const [m, n] = dimsOf(state.dims);
      if (state.view === 'split') {
        views.push(makeView(n, 'domain', { es: `Dominio ℝ${sup(n)}`, en: `Domain ℝ${sup(n)}` }, m, n));
        views.push(makeView(m, 'codomain', { es: `Codominio ℝ${sup(m)}`, en: `Codomain ℝ${sup(m)}` }, m, n));
      } else {
        const p = Math.max(m, n);
        views.push(makeView(p, 'morph', { es: `Espacio ambiente ℝ${sup(p)}`, en: `Ambient space ℝ${sup(p)}` }, m, n));
      }
    }

    function makeView(dim, role, title, m, n) {
      const el = ctx.addView();
      if (dim === 3) {
        const sc = new Scene3D(el, { title, extent: 4, frustum: 10 });
        sc.role = role; sc.dim = 3;
        if (role === 'codomain') for (let j = 0; j < n; j++) sc.addHandle({ id: `c${j}`, color: COLOR_KEYS[j], get: colAt(j), set: setColFromPoint(j, 3) });
        if (role === 'domain') sc.addHandle({ id: 'v', color: 'v', visible: () => store.get('show').includes('v'), get: () => store.get('v').map((e) => e.x), set: setV(3) });
        sc.onTheme = () => ctx.rerender();
        return sc;
      }
      const pl = new Plane2D(el, dim === 1 ? { title, fitWidth: 5, range: 1.5 } : { title, range: 3.6 });
      pl.role = role; pl.dim = dim;
      if (role === 'codomain') {
        for (let j = 0; j < n; j++) {
          if (dim === 2) pl.addHandle({ id: `c${j}`, color: COLOR_KEYS[j], get: colAt(j), set: setColFromPoint(j, 2) });
          else pl.addHandle({ id: `c${j}`, color: COLOR_KEYS[j], get: () => [colAt(j)()[0], lane(j)], set: ([x]) => setColFromPoint(j, 1)([x]) });
        }
      }
      if (role === 'domain') {
        if (dim === 2) pl.addHandle({ id: 'v', color: 'v', visible: () => store.get('show').includes('v'), get: () => store.get('v').map((e) => e.x), set: setV(2) });
        else pl.addHandle({ id: 'v', color: 'v', visible: () => store.get('show').includes('v'), get: () => [store.get('v')[0].x, -0.45], set: ([x]) => setV(1)([x]) });
      }
      pl.setDraw((g) => cur && draw2D(g, pl, cur));
      return pl;
    }

    // --- 2D / 1D drawing -------------------------------------------------------
    function draw2D(g, pl, c) {
      const { m, n, an, show, v, t } = c;
      const Af = an.Af;
      if (pl.dim === 1) numberLine(g);
      else g.backgroundGrid();
      if (pl.role === 'domain') {
        if (show.includes('cloud')) cloudPoints(n).forEach(({ p, color }) => g.point(pl.dim === 1 ? [p[0], 0] : p, { color, r: 2.6, alpha: 0.9 }));
        if (show.includes('ker')) drawKernel2D(g, pl, c);
        for (let j = 0; j < n; j++) {
          const e = [0, 0]; e[j] = 1;
          const y = pl.dim === 1 ? lane(j) : 0;
          g.arrow(pl.dim === 1 ? [0, y] : [0, 0], pl.dim === 1 ? [1, y] : e, { color: g.c[COLOR_KEYS[j]], width: 3.2 });
          g.text(pl.dim === 1 ? [1, y] : e, HATS[j], { color: g.c[COLOR_KEYS[j]], offset: [8, -12], font: '"KaTeX_Main", serif', size: 17, italic: true });
        }
        if (show.includes('v')) {
          if (pl.dim === 1) { g.arrow([0, -0.45], [v[0], -0.45], { color: g.c.v, width: 3.2 }); }
          else { g.arrow([0, 0], v, { color: g.c.v, width: 3.2 }); g.mathLabel(v, 'v', { color: g.c.v, deco: 'arrow' }); }
        }
      } else if (pl.role === 'codomain') {
        if (show.includes('img')) drawImage2D(g, pl, c);
        if (show.includes('cloud')) cloudPoints(n).forEach(({ p, color }) => {
          const q = matVecF(Af, p);
          g.point(pl.dim === 1 ? [q[0], 0] : q, { color, r: 2.6, alpha: 0.75 });
        });
        for (let j = 0; j < n; j++) {
          const col = Af.map((row) => row[j]);
          const y = pl.dim === 1 ? lane(j) : 0;
          const tip = pl.dim === 1 ? [col[0], y] : col;
          g.arrow(pl.dim === 1 ? [0, y] : [0, 0], tip, { color: g.c[COLOR_KEYS[j]], width: 3.2 });
          g.text(tip, `A${HATS[j]}`, { color: g.c[COLOR_KEYS[j]], offset: [12, -14], font: '"KaTeX_Main", serif', size: 16, italic: true });
        }
        if (show.includes('v')) {
          const av = matVecF(Af, v);
          if (pl.dim === 1) g.arrow([0, -0.45], [av[0], -0.45], { color: g.c.v, width: 3.2 });
          else { g.arrow([0, 0], av, { color: g.c.v, width: 3.2 }); g.text(av, 'Av', { color: g.c.v, offset: [12, -14], font: '"KaTeX_Math", serif', size: 16, italic: true }); }
        }
      } else {
        // Morph, ambient ℝ²: n = 2 → m = 1 (collapse onto the x-axis), or n = 1 → m = 2.
        const Mt = morphMatrix(m, n, Af, t, 2);
        if (n === 2) {
          g.transformedGrid(Mt, { color: g.c.tgrid });
          if (show.includes('cloud')) cloudPoints(2).forEach(({ p, color }) => g.point(L.mv2(Mt, p[0], p[1]), { color, r: 2.6 }));
        } else {
          const d = [Mt[0][0], Mt[1][0]];
          g.infiniteLine([0, 0], d, { color: g.c.tgrid, width: 2 });
          for (let k = -12; k <= 12; k++) g.point([k * d[0], k * d[1]], { color: g.c.tgrid, r: 2.5 });
          if (show.includes('cloud')) cloudPoints(1).forEach(({ p, color }) => g.point([p[0] * d[0], p[0] * d[1]], { color, r: 2.6 }));
        }
        for (let j = 0; j < n; j++) {
          const col = [Mt[0][j], Mt[1][j]];
          g.arrow([0, 0], col, { color: g.c[COLOR_KEYS[j]], width: 3.2 });
          g.text(col, HATS[j], { color: g.c[COLOR_KEYS[j]], offset: [10, -12], font: '"KaTeX_Main", serif', size: 17, italic: true });
        }
        if (show.includes('v')) {
          const mv = Mt.map((row) => row.reduce((s, a, k) => s + a * v[k], 0));
          g.arrow([0, 0], mv, { color: g.c.v, width: 3.2 });
        }
      }
    }

    function numberLine(g) {
      const { xmin, xmax } = g.p.bounds();
      g.line([xmin - 1, 0], [xmax + 1, 0], { color: g.c.axis, width: 1.5, alpha: 0.8 });
      for (let k = Math.ceil(xmin); k <= xmax; k++) {
        g.line([k, -0.06], [k, 0.06], { color: g.c.axis, width: 1, alpha: 0.7 });
        g.text([k, 0], String(k).replace('-', '−'), { color: g.c.muted, align: 'center', offset: [0, 20], size: 11, halo: false });
      }
    }

    function drawKernel2D(g, pl, c) {
      const { an } = c;
      const ker = an.ker.map((v) => v.map((x) => an.F.toNumber(x)));
      if (pl.dim === 1) {
        if (ker.length) g.line([-50, 0], [50, 0], { color: g.c.ker, width: 6, alpha: 0.5 });
        else g.point([0, 0], { color: g.c.ker, r: 6 });
        return;
      }
      if (ker.length === 1) g.infiniteLine([0, 0], ker[0], { color: g.c.ker, width: 3, dash: [9, 6] });
      else if (ker.length === 2) tintAll(g, g.c.ker);
      else g.point([0, 0], { color: g.c.ker, r: 6 });
    }

    function drawImage2D(g, pl, c) {
      const { an } = c;
      const img = an.img.map((v) => v.map((x) => an.F.toNumber(x)));
      if (pl.dim === 1) {
        if (img.length) g.line([-50, 0], [50, 0], { color: g.c.img, width: 6, alpha: 0.35 });
        else g.point([0, 0], { color: g.c.img, r: 6 });
        return;
      }
      if (img.length === 1) {
        g.infiniteLine([0, 0], img[0], { color: g.c.img, width: 5, alpha: 0.45 });
        if (c.n === 1) { const d = img[0]; for (let k = -12; k <= 12; k++) g.point([k * c.an.Af[0][0], k * c.an.Af[1][0]], { color: g.c.tgrid, r: 2.5 }); }
      } else if (img.length === 2) tintAll(g, g.c.img);
      else g.point([0, 0], { color: g.c.img, r: 6 });
    }

    function tintAll(g, color) {
      const ctx2 = g.ctx;
      ctx2.globalAlpha = 0.07; ctx2.fillStyle = color;
      ctx2.fillRect(0, 0, g.p.w, g.p.h);
      ctx2.globalAlpha = 1;
    }

    // --- 3D drawing -------------------------------------------------------------
    function draw3D(sc, c) {
      const { m, n, an, show, v, t } = c;
      const Af = an.Af;
      sc.clear();
      if (sc.role === 'domain') {
        for (let j = 0; j < 3; j++) { const e = [0, 0, 0]; e[j] = 1; sc.arrow([0, 0, 0], e, COLOR_KEYS[j]); sc.label(e, TEX_HATS[j], COLOR_KEYS[j], { tex: true, offset: [10, -10], size: 17 }); }
        if (show.includes('cloud')) sc.add(pointsObject(cloudPoints(3)));
        if (show.includes('ker')) {
          const ker = an.ker.map((k) => k.map((x) => an.F.toNumber(x)));
          if (ker.length === 1) sc.lineThrough([0, 0, 0], ker[0], 'ker', { length: 8 });
          else if (ker.length === 2) sc.planeSpan([0, 0, 0], L.normalize(ker[0]), orthoTo(ker[0], ker[1]), 'ker', { size: 3.5, opacity: 0.2 });
          else if (ker.length === 3) sc.point([0, 0, 0], 'ker', { r: 0.25, opacity: 0.4 });
        }
        if (show.includes('v')) { sc.arrow([0, 0, 0], v, 'v'); sc.label(v, '\\vec{v}', 'v', { tex: true, offset: [12, -12] }); }
      } else if (sc.role === 'codomain') {
        if (show.includes('img')) {
          const img = an.img.map((k) => k.map((x) => an.F.toNumber(x)));
          if (n === 2 && img.length === 2) sc.planeSpan([0, 0, 0], Af.map((r) => r[0]), Af.map((r) => r[1]), 'img', { size: 3, opacity: 0.14, grid: 1 });
          else if (img.length === 2) sc.planeSpan([0, 0, 0], L.normalize(img[0]), orthoTo(img[0], img[1]), 'img', { size: 3.5, opacity: 0.14 });
          else if (img.length === 1) {
            sc.lineThrough([0, 0, 0], img[0], 'img', { length: 8 });
            if (n === 1) for (let k = -6; k <= 6; k++) sc.point(Af.map((r) => r[0] * k), 'tgrid', { r: 0.05 });
          }
        }
        if (show.includes('cloud')) sc.add(pointsObject(cloudPoints(n).map(({ p, color }) => ({ p: matVecF(Af, p), color }))));
        for (let j = 0; j < n; j++) {
          const col = Af.map((r) => r[j]);
          sc.arrow([0, 0, 0], col, COLOR_KEYS[j]);
          sc.label(col, `A${TEX_HATS[j]}`, COLOR_KEYS[j], { tex: true, offset: [14, -12], size: 16 });
        }
        if (show.includes('v')) { const av = matVecF(Af, v); sc.arrow([0, 0, 0], av, 'v'); sc.label(av, 'A\\vec{v}', 'v', { tex: true, offset: [14, -12] }); }
      } else {
        const Mt = morphMatrix(m, n, Af, t, 3); // 3 × n
        if (n === 3) {
          const grp = sc.transformedGroup(Mt);
          grp.add(pointsObject(cloudPoints(3)));
        } else if (n === 2) {
          sc.planeSpan([0, 0, 0], Mt.map((r) => r[0]), Mt.map((r) => r[1]), 'tgrid', { size: 3, opacity: 0.12, grid: 1 });
          if (show.includes('cloud')) sc.add(pointsObject(cloudPoints(2).map(({ p, color }) => ({ p: matVecF(Mt, p), color }))));
        } else {
          const d = Mt.map((r) => r[0]);
          sc.lineThrough([0, 0, 0], d, 'tgrid', { length: 12 });
          for (let k = -6; k <= 6; k++) sc.point(d.map((x) => x * k), 'tgrid', { r: 0.05 });
        }
        for (let j = 0; j < n; j++) {
          const col = Mt.map((r) => r[j]);
          sc.arrow([0, 0, 0], col, COLOR_KEYS[j]);
          sc.label(col, TEX_HATS[j], COLOR_KEYS[j], { tex: true, offset: [12, -10], size: 16 });
        }
        if (show.includes('v')) sc.arrow([0, 0, 0], matVecF(Mt, v), 'v');
      }
      sc.syncHandles();
      sc.requestRender();
    }

    function render(state) {
      const [m, n] = dimsOf(state.dims);
      const A = state.A;
      const an = analyze(entriesKey(A), A);
      const show = state.show;
      const vk = `${state.dims}|${state.view}`;
      if (vk !== viewKey) { viewKey = vk; buildViews(state); }
      if (editorKey !== state.dims) {
        editorKey = state.dims;
        editor = matrixEditor({ rows: m, cols: n, colColors: COL_VARS, label: 'A =', get: () => store.get('A'), set: (A2) => store.set({ A: A2 }), name: { es: 'Matriz A', en: 'Matrix A' } });
        editorSlot.replaceChildren(editor.el);
        vEditor = vectorEditor({ n, get: () => store.get('v'), set: (v) => store.set({ v }), label: '\\vec{v} =' });
        vSlot.replaceChildren(vEditor.el);
      }
      cur = { m, n, an, show, v: state.v.map((e) => e.x), t: state.t };
      for (const vw of views) {
        if (vw.dim === 3) draw3D(vw, cur);
        else { vw.requestRender(); }
      }
      editor.update(); vEditor.update(); dimSel.update(); viewSeg.update(); anim.update();
      chips.forEach((c) => c.update());
      vSlot.hidden = !show.includes('v');
      ctx.bar.hidden = state.view !== 'morph';

      // Readouts
      const F = an.F;
      r.map.set(`A\\in\\mathbb{R}^{${m}\\times ${n}},\\quad T:\\mathbb{R}^{${n}}\\to\\mathbb{R}^{${m}}`);
      r.rank.set(`${rankOp()} A + \\dim\\ker A = ${an.rank} + ${n - an.rank} = ${n}`);
      r.img.set(`${cls('c-img', texSpan(an.img, m))}\\subseteq\\mathbb{R}^{${m}}`, describe(an.rank, m, 'img'));
      r.ker.set(`${cls('c-ker', texSpan(an.ker, n))}\\subseteq\\mathbb{R}^{${n}}`, describe(n - an.rank, n, 'ker'));
      const injective = an.rank === n, surjective = an.rank === m;
      r.inj.set({ html: `<span class="badge ${injective ? 'badge--ok' : ''}">${tr(injective ? { es: 'inyectiva', en: 'injective' } : { es: 'no inyectiva', en: 'not injective' })}</span> <span class="badge ${surjective ? 'badge--ok' : ''}">${tr(surjective ? { es: 'sobreyectiva', en: 'surjective' } : { es: 'no sobreyectiva', en: 'not surjective' })}</span>` },
        n > m ? { es: `Como n = ${n} > m = ${m}, al menos ${n - m} dimensión(es) del dominio colapsa(n): nunca es inyectiva.`, en: `Since n = ${n} > m = ${m}, at least ${n - m} dimension(s) of the domain collapse: it is never injective.` }
          : { es: `Como n = ${n} < m = ${m}, la imagen tiene dimensión ≤ ${n}: nunca es sobreyectiva.`, en: `Since n = ${n} < m = ${m}, the image has dimension ≤ ${n}: it is never surjective.` });
      if (show.includes('v')) {
        const vf = L.fieldVector(state.v, F);
        r.av.set(`${texMatrix(an.M, { colClasses: COLS })}${cls('c-v', texVector(vf))} = ${cls('c-v', texVector(L.matVec(an.M, vf, F)))}`);
        r.av.show(true);
      } else r.av.show(false);
      r.rref.set(texMatrix(an.R));

      ctx.setLegend([
        { color: 'var(--c-i)', tex: 'A\\hat{\\imath}' },
        n > 1 && { color: 'var(--c-j)', tex: 'A\\hat{\\jmath}' },
        n > 2 && { color: 'var(--c-k)', tex: 'A\\hat{k}' },
        show.includes('ker') && { color: 'var(--c-ker)', kind: 'dash', label: { es: 'núcleo (en el dominio)', en: 'kernel (in the domain)' } },
        show.includes('img') && { color: 'var(--c-img)', label: { es: 'imagen (en el codominio)', en: 'image (in the codomain)' } },
        show.includes('v') && { color: 'var(--c-v)', tex: '\\vec{v}\\mapsto A\\vec{v}' },
        show.includes('cloud') && { color: 'var(--c-w)', label: { es: 'cada punto conserva su color al transformarse', en: 'each point keeps its colour when mapped' } },
      ]);
      return { an, m, n };
    }

    return {
      render,
      snapshot: () => composeCanvases(views.map((v) => v.snapshot())),
      togglePlay: () => { if (store.get('view') === 'morph') anim.toggle(); },
      onReset: () => { anim.pause(); viewKey = ''; ctx.rerender(); },
    };
  },

  learn: {
    what: {
      es: `<p>Una matriz $A$ de tamaño $m\\times n$ define una transformación lineal $T:\\mathbb{R}^n\\to\\mathbb{R}^m$. Tiene $n$ columnas porque hay $n$ vectores en la base del <strong>dominio</strong>, y cada columna tiene $m$ entradas porque es un vector del <strong>codominio</strong>: la columna $j$ es $A\\hat{e}_j$.</p>
<p>En la vista dividida, a la izquierda está el dominio (con $\\hat{\\imath}, \\hat{\\jmath}, \\hat{k}$, el vector $\\vec{v}$ y el núcleo) y a la derecha el codominio (con las columnas, que puedes arrastrar, $A\\vec{v}$ y la imagen). La <strong>nube de puntos</strong> colorea cada punto del dominio según su posición y lo dibuja con el mismo color en el codominio: cuando $n>m$ verás colores mezclados, porque puntos distintos caen en el mismo lugar.</p>
<p>La vista <strong>Animación</strong> sumerge ambos espacios en $\\mathbb{R}^{\\max(m,n)}$ y muestra el paso continuo de la inclusión del dominio a su imagen, por ejemplo un plano que se levanta en $\\mathbb{R}^3$ o el espacio que se aplasta sobre un plano.</p>`,
      en: `<p>An $m\\times n$ matrix $A$ defines a linear map $T:\\mathbb{R}^n\\to\\mathbb{R}^m$. It has $n$ columns because there are $n$ vectors in the basis of the <strong>domain</strong>, and each column has $m$ entries because it is a vector of the <strong>codomain</strong>: column $j$ is $A\\hat{e}_j$.</p>
<p>In the split view the domain is on the left (with $\\hat{\\imath}, \\hat{\\jmath}, \\hat{k}$, the vector $\\vec{v}$ and the kernel) and the codomain on the right (with the columns, which you can drag, $A\\vec{v}$ and the image). The <strong>point cloud</strong> colours each domain point by its position and draws it with the same colour in the codomain: when $n>m$ you will see mixed colours, because different points land on the same spot.</p>
<p>The <strong>Animation</strong> view embeds both spaces in $\\mathbb{R}^{\\max(m,n)}$ and shows the continuous passage from the inclusion of the domain to its image, e.g. a plane lifting into $\\mathbb{R}^3$ or space being squashed onto a plane.</p>`,
    },
    prompts: {
      es: [
        'En $3\\times 2$, arrastra $A\\hat{\\jmath}$ hasta que sea paralela a $A\\hat{\\imath}$. ¿Qué le pasa a la imagen? ¿Y al núcleo en el dominio?',
        'En $2\\times 3$, activa la nube de puntos. ¿Qué puntos del dominio terminan en el mismo lugar? ¿Cómo se relaciona con el núcleo?',
        'En $1\\times 2$ la matriz es una fila $[a\\;b]$. ¿Qué forma tienen los conjuntos de nivel $\\{\\mathbf{x} : A\\mathbf{x} = c\\}$? (Pista: son rectas paralelas al núcleo.)',
        'Comprueba en varios casos que $\\operatorname{rango} A + \\dim\\ker A = n$. ¿Por qué el número de filas no aparece en la fórmula?',
        'Pasa a la vista «Animación» en $3\\times 2$ y reproduce: ¿qué le ocurre a la cuadrícula del plano?',
      ],
      en: [
        'In $3\\times 2$, drag $A\\hat{\\jmath}$ until it is parallel to $A\\hat{\\imath}$. What happens to the image? And to the kernel in the domain?',
        'In $2\\times 3$, turn on the point cloud. Which domain points end up in the same place? How does it relate to the kernel?',
        'In $1\\times 2$ the matrix is a row $[a\\;b]$. What do the level sets $\\{\\mathbf{x} : A\\mathbf{x} = c\\}$ look like? (Hint: they are lines parallel to the kernel.)',
        'Check in several cases that $\\operatorname{rank} A + \\dim\\ker A = n$. Why does the number of rows not appear in the formula?',
        'Switch to the “Animation” view in $3\\times 2$ and play: what happens to the grid of the plane?',
      ],
    },
    formal: [
      {
        kind: 'theorem',
        title: { es: 'Teorema del rango (rango–nulidad)', en: 'Rank–nullity theorem' },
        body: {
          es: '<p>Para $A\\in\\mathbb{R}^{m\\times n}$: $$\\dim\\operatorname{Im}A + \\dim\\ker A = n.$$ En consecuencia, $A$ no puede ser inyectiva si $n>m$ (pues $\\dim\\ker A\\ge n-m>0$) ni sobreyectiva si $n<m$ (pues $\\dim\\operatorname{Im} A\\le n<m$).</p>',
          en: '<p>For $A\\in\\mathbb{R}^{m\\times n}$: $$\\dim\\operatorname{Im}A + \\dim\\ker A = n.$$ Hence $A$ cannot be injective if $n>m$ (since $\\dim\\ker A\\ge n-m>0$) nor surjective if $n<m$ (since $\\dim\\operatorname{Im} A\\le n<m$).</p>',
        },
      },
      {
        kind: 'proposition',
        title: { es: 'Bases de la imagen y del núcleo', en: 'Bases of the image and the kernel' },
        body: {
          es: '<p>Sea $R$ la forma escalonada reducida de $A$. Las columnas de $A$ en las posiciones pivote de $R$ son una base de $\\operatorname{Im}A$ (¡de $A$, no de $R$!). Las soluciones de $R\\mathbf{x}=\\mathbf{0}$ obtenidas dando valor $1$ a una variable libre y $0$ a las demás son una base de $\\ker A$.</p>',
          en: '<p>Let $R$ be the reduced row echelon form of $A$. The columns of $A$ in the pivot positions of $R$ form a basis of $\\operatorname{Im}A$ (of $A$, not of $R$!). The solutions of $R\\mathbf{x}=\\mathbf{0}$ obtained by setting one free variable to $1$ and the others to $0$ form a basis of $\\ker A$.</p>',
        },
      },
      {
        kind: 'remark',
        title: { es: 'Rango de filas = rango de columnas', en: 'Row rank = column rank' },
        body: {
          es: '<p>$\\dim\\operatorname{gen}\\{\\text{filas}\\} = \\dim\\operatorname{gen}\\{\\text{columnas}\\}$, aunque las filas vivan en $\\mathbb{R}^n$ y las columnas en $\\mathbb{R}^m$. Además $\\ker A = (\\text{espacio de filas})^{\\perp}$: el núcleo es exactamente el conjunto de vectores ortogonales a todas las filas.</p>',
          en: '<p>$\\dim\\operatorname{span}\\{\\text{rows}\\} = \\dim\\operatorname{span}\\{\\text{columns}\\}$, even though rows live in $\\mathbb{R}^n$ and columns in $\\mathbb{R}^m$. Moreover $\\ker A = (\\text{row space})^{\\perp}$: the kernel is exactly the set of vectors orthogonal to every row.</p>',
        },
      },
    ],
  },

  challenges: [
    {
      id: 'plane',
      title: { es: 'Un plano prescrito', en: 'A prescribed plane' },
      text: { es: 'Con una matriz $3\\times 2$, haz que la imagen sea el plano $x+y+z=0$.', en: 'With a $3\\times 2$ matrix, make the image the plane $x+y+z=0$.' },
      hint: { es: 'Las dos columnas deben cumplir la ecuación y no ser paralelas.', en: 'Both columns must satisfy the equation and not be parallel.' },
      setup: (store) => store.set({ dims: '3x2', A: M(DEFAULTS['3x2'].A), v: V(DEFAULTS['3x2'].v), view: 'split' }),
      check: (s, d) => s.dims === '3x2' && d.an.rank === 2 && [0, 1].every((j) => Math.abs(d.an.Af[0][j] + d.an.Af[1][j] + d.an.Af[2][j]) < 1e-9),
    },
    {
      id: 'ker111',
      title: { es: 'Colapsa la diagonal', en: 'Collapse the diagonal' },
      text: { es: 'Con una matriz $2\\times 3$ sobreyectiva, haz que el núcleo sea la recta generada por $(1,1,1)$.', en: 'With a surjective $2\\times 3$ matrix, make the kernel the line spanned by $(1,1,1)$.' },
      hint: { es: 'Cada fila debe ser ortogonal a $(1,1,1)$ y las filas no deben ser paralelas.', en: 'Each row must be orthogonal to $(1,1,1)$ and the rows must not be parallel.' },
      setup: (store) => store.set({ dims: '2x3', A: M(DEFAULTS['2x3'].A), v: V(DEFAULTS['2x3'].v), view: 'split' }),
      check: (s, d) => s.dims === '2x3' && d.an.rank === 2 && d.an.Af.every((row) => Math.abs(row[0] + row[1] + row[2]) < 1e-9),
    },
    {
      id: 'functional',
      title: { es: 'Una funcional', en: 'A functional' },
      text: { es: 'Con una matriz $1\\times 2$, envía $(1,2)$ a $0$ y $(1,0)$ a $3$.', en: 'With a $1\\times 2$ matrix, send $(1,2)$ to $0$ and $(1,0)$ to $3$.' },
      hint: { es: 'Plantea $a + 2b = 0$ y $a = 3$. Puedes escribir fracciones en las celdas.', en: 'Set up $a + 2b = 0$ and $a = 3$. You can type fractions in the cells.' },
      setup: (store) => store.set({ dims: '1x2', A: M(DEFAULTS['1x2'].A), v: V(DEFAULTS['1x2'].v), view: 'split' }),
      check: (s, d) => s.dims === '1x2' && Math.abs(d.an.Af[0][0] - 3) < 1e-9 && Math.abs(d.an.Af[0][1] + 1.5) < 1e-9,
    },
    {
      id: 'surj',
      title: { es: 'Recupera la sobreyectividad', en: 'Recover surjectivity' },
      text: { es: 'Esta matriz $2\\times 3$ tiene rango 1. Cambia una sola entrada para que sea sobreyectiva.', en: 'This $2\\times 3$ matrix has rank 1. Change a single entry to make it surjective.' },
      hint: { es: 'Basta con que las dos filas dejen de ser proporcionales.', en: 'It is enough for the two rows to stop being proportional.' },
      setup: (store) => store.set({ dims: '2x3', A: M([[1, 2, 3], [2, 4, 6]]), v: V([1, 1, 1]), view: 'split' }),
      check: (s, d) => {
        if (s.dims !== '2x3' || d.an.rank !== 2) return false;
        const base = [[1, 2, 3], [2, 4, 6]];
        let changed = 0;
        base.forEach((row, i) => row.forEach((x, j) => { if (Math.abs(d.an.Af[i][j] - x) > 1e-12) changed++; }));
        return changed === 1;
      },
    },
  ],
});

// ---------------------------------------------------------------------------

function sup(n) { return ['⁰', '¹', '²', '³'][n]; }
function lane(j) { return 0.35 + 0.3 * j; }
function matVecF(A, v) { return A.map((row) => row.reduce((s, a, k) => s + a * v[k], 0)); }

/** Ambient p×n matrix of the morph: (1−t)·[I; 0] + t·[A; 0] (both embedded in ℝᵖ). */
function morphMatrix(m, n, Af, t, p) {
  const out = Array.from({ length: p }, () => Array(n).fill(0));
  for (let i = 0; i < p; i++) for (let j = 0; j < n; j++) {
    const incl = i === j ? 1 : 0;
    const img = i < m ? Af[i][j] : 0;
    out[i][j] = (1 - t) * incl + t * img;
  }
  return out;
}

function cloudPoints(n) {
  if (cloudCache[n]) return cloudCache[n];
  const pts = [];
  const R = 2, step = n === 3 ? 1 : n === 2 ? 0.5 : 0.25;
  const col = (a, b, c) => `rgb(${Math.round(255 * a)}, ${Math.round(255 * b)}, ${Math.round(255 * c)})`;
  if (n === 1) for (let x = -R; x <= R + 1e-9; x += step) pts.push({ p: [x], color: `hsl(${((x + R) / (2 * R)) * 300}, 80%, 58%)` });
  if (n === 2) for (let x = -R; x <= R + 1e-9; x += step) for (let y = -R; y <= R + 1e-9; y += step) pts.push({ p: [x, y], color: col((x + R) / (2 * R), (y + R) / (2 * R), 0.55) });
  if (n === 3) for (let x = -R; x <= R; x += step) for (let y = -R; y <= R; y += step) for (let z = -R; z <= R; z += step) pts.push({ p: [x, y, z], color: col((x + R) / (2 * R), (y + R) / (2 * R), (z + R) / (2 * R)) });
  cloudCache[n] = pts;
  return pts;
}

function pointsObject(list) {
  const pos = [], cols = [];
  for (const { p, color } of list) {
    const q = [p[0] || 0, p[1] || 0, p[2] || 0];
    pos.push(...q);
    const c = new THREE.Color(color);
    cols.push(c.r, c.g, c.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ size: 6, sizeAttenuation: false, vertexColors: true }));
}

function orthoTo(a, b) {
  const u = L.normalize(a);
  return L.normalize(L.subVec(b, L.scaleVec(u, L.dotFloat(b, u))));
}

function describe(dim, total, kind) {
  if (kind === 'img') {
    if (dim === 0) return { es: 'Solo el origen.', en: 'Only the origin.' };
    if (dim === total) return { es: `Todo ℝ${sup(total)}.`, en: `All of ℝ${sup(total)}.` };
    return { es: dim === 1 ? 'Una recta por el origen.' : 'Un plano por el origen.', en: dim === 1 ? 'A line through the origin.' : 'A plane through the origin.' };
  }
  if (dim === 0) return { es: 'Solo el origen: la transformación es inyectiva.', en: 'Only the origin: the map is injective.' };
  if (dim === total) return { es: `Todo el dominio ℝ${sup(total)} colapsa: A es la matriz nula.`, en: `The whole domain ℝ${sup(total)} collapses: A is the zero matrix.` };
  return { es: dim === 1 ? 'Una recta que colapsa en el origen.' : 'Un plano que colapsa en el origen.', en: dim === 1 ? 'A line that collapses to the origin.' : 'A plane that collapses to the origin.' };
}
