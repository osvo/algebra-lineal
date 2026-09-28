import { createLab, composeCanvases } from '../ui/shell.js';
import { codec, M, V } from '../ui/store.js';
import { Plane2D } from '../ui/plane2d.js';
import { Scene3D } from '../ui/scene3d.js';
import { card, matrixEditor, vectorEditor, flagChip, readout, animator, segmented, button, stageLabels } from '../ui/controls.js';
import { h } from '../ui/dom.js';
import { tr, setText } from '../ui/i18n.js';
import { entryFromNumber } from '../core/parse.js';
import { RationalField, FloatField } from '../core/fields.js';
import { Rational, sqrtRational } from '../core/rational.js';
import * as L from '../core/linalg.js';
import { texValue, texVector, texMatrix, cls, fmtDecimal, texSqrt, texRationalSqrt, plainValue } from '../core/format.js';

createLab({
  id: 'orth',
  wide: true,
  lead: {
    es: 'El producto punto mide cuánto de un vector apunta en la dirección de otro. De ahí salen las proyecciones, las bases ortonormales y la mejor aproximación posible cuando un sistema no tiene solución.',
    en: 'The dot product measures how much of one vector points along another. From it come projections, orthonormal bases and the best possible approximation when a system has no solution.',
  },
  state: {
    mode: { def: 'dot', codec: codec.enum(['dot', 'gs', 'ls', 'cross']) },
    cu: { def: V([1, 0, -2]), codec: codec.vector(3) },
    cv: { def: V([0, 2, 2]), codec: codec.vector(3) },
    cw: { def: V([0, 0, 2]), codec: codec.vector(3) },
    cshow: { def: ['par', 'w'], codec: codec.flags(['par', 'w']) },
    u: { def: V([3, 1]), codec: codec.vector(2) },
    v: { def: V([1, 2]), codec: codec.vector(2) },
    W: { def: M([[1, 1, 0], [1, 0, 1], [0, 1, 1]]), codec: codec.matrix(3, 3) },
    g: { def: 4, codec: codec.num(0, 4) },
    pts: { def: [[0, 1], [1, 3], [2, 2]], codec: codec.points() },
    model: { def: 'affine', codec: codec.enum(['affine', 'origin']) },
  },

  build(ctx) {
    const { store } = ctx;
    const anim = animator({ store, key: 'g', max: 4 });
    ctx.bar.append(anim.el);
    const stageRow = stageLabels();
    anim.el.append(stageRow.el);

    // Panel -------------------------------------------------------------------------
    const modeSeg = segmented({
      options: [
        { value: 'dot', label: { es: 'Proyección', en: 'Projection' } },
        { value: 'gs', label: { es: 'Gram–Schmidt', en: 'Gram–Schmidt' } },
        { value: 'ls', label: { es: 'Mínimos cuadrados', en: 'Least squares' } },
        { value: 'cross', label: { es: 'Producto cruz', en: 'Cross product' } },
      ],
      get: () => store.get('mode'), set: (mode) => { anim.pause(); store.set({ mode }); },
      label: { es: 'Modo', en: 'Mode' },
    });
    const uEd = vectorEditor({ n: 2, get: () => store.get('u'), set: (u) => store.set({ u }), label: '\\mathbf{u} =', color: 'var(--c-i)' });
    const vEd = vectorEditor({ n: 2, get: () => store.get('v'), set: (v) => store.set({ v }), label: '\\mathbf{v} =' });
    const dotBox = h('div', { class: 'row', style: { gap: '18px' } }, uEd.el, vEd.el);
    const wEd = matrixEditor({ rows: 3, cols: 3, label: '[\\,\\mathbf{v}_1\\;\\mathbf{v}_2\\;\\mathbf{v}_3\\,] =', colColors: ['var(--c-i)', 'var(--c-j)', 'var(--c-k)'], get: () => store.get('W'), set: (W) => store.set({ W }), name: { es: 'Vectores v₁, v₂, v₃ (columnas)', en: 'Vectors v₁, v₂, v₃ (columns)' } });
    const modelSeg = segmented({
      options: [{ value: 'affine', tex: 'y = c_0 + c_1x' }, { value: 'origin', tex: 'y = c\\,x' }],
      get: () => store.get('model'), set: (model) => store.set({ model }),
      label: { es: 'Modelo', en: 'Model' },
    });
    const addPt = button({ label: { es: 'Añadir punto', en: 'Add point' }, iconName: 'plus', small: true, onClick: () => {
      const pts = store.get('pts');
      if (pts.length >= 8) return;
      const x = Math.round((Math.max(...pts.map((p) => p[0])) + 1) * 10) / 10;
      store.set({ pts: [...pts, [x, Math.round((pts[pts.length - 1][1] + 0.5) * 10) / 10]] });
    } });
    const delPt = button({ label: { es: 'Quitar punto', en: 'Remove point' }, iconName: 'minus', small: true, onClick: () => { const pts = store.get('pts'); if (pts.length > 2) store.set({ pts: pts.slice(0, -1) }); } });
    const lsBox = h('div', { class: 'card__body', style: { padding: 0 } }, modelSeg.el, h('div', { class: 'row' }, addPt, delPt));
    const cuEd = vectorEditor({ n: 3, get: () => store.get('cu'), set: (cu) => store.set({ cu }), label: '\\mathbf{u} =', color: 'var(--c-i)' });
    const cvEd = vectorEditor({ n: 3, get: () => store.get('cv'), set: (cv) => store.set({ cv }), label: '\\mathbf{v} =', color: 'var(--c-j)' });
    const cwEd = vectorEditor({ n: 3, get: () => store.get('cw'), set: (cw) => store.set({ cw }), label: '\\mathbf{w} =', color: 'var(--c-k)' });
    const crossChips = [
      flagChip(store, 'cshow', 'par', { es: 'Paralelogramo', en: 'Parallelogram' }, 'var(--c-det)'),
      flagChip(store, 'cshow', 'w', { es: 'Tercer vector w', en: 'Third vector w' }, 'var(--c-k)'),
    ];
    const crossBox = h('div', { class: 'card__body', style: { padding: 0 } }, h('div', { class: 'row', style: { gap: '14px' } }, cuEd.el, cvEd.el, cwEd.el), h('div', { class: 'chip-row' }, crossChips.map((c) => c.el)));
    const help = h('p');
    const inputCard = card({ title: { es: 'Modo y datos', en: 'Mode and data' }, body: [modeSeg.el, dotBox, wEd.el, lsBox, crossBox, help] });

    const rs = Array.from({ length: 7 }, () => readout('', { block: true }));
    const resultsCard = card({ title: { es: 'Resultado exacto', en: 'Exact result' }, body: [h('div', { class: 'readouts' }, rs.map((x) => x.el))] });
    ctx.panel.append(inputCard.el, resultsCard.el);
    const setR = (i, label, tex, note = null) => {
      rs[i].el.querySelector('.readout__k').textContent = tr(label);
      rs[i].set(tex, note);
      rs[i].show(true);
    };

    // Views --------------------------------------------------------------------------
    let views = { plane: null, scene: null };
    let viewKey = '';
    let cur = null;

    function buildViews(state) {
      if (views.plane) views.plane.dispose();
      if (views.scene) views.scene.dispose();
      views = { plane: null, scene: null };
      ctx.clearViews();
      const mode = state.mode;
      if (mode === 'dot' || mode === 'ls') {
        const pl = new Plane2D(ctx.addView(), mode === 'ls' ? { range: 3.2, center: [1.5, 2], title: { es: 'Datos', en: 'Data' } } : { range: 3.6 });
        views.plane = pl;
        if (mode === 'dot') {
          pl.addHandle({ id: 'u', color: 'i', get: () => store.get('u').map((e) => e.x), set: ([x, y]) => store.set({ u: [entryFromNumber(x), entryFromNumber(y)] }) });
          pl.addHandle({ id: 'v', color: 'v', get: () => store.get('v').map((e) => e.x), set: ([x, y]) => store.set({ v: [entryFromNumber(x), entryFromNumber(y)] }) });
        } else {
          for (let k = 0; k < 8; k++) {
            pl.addHandle({
              id: `p${k}`, color: 'v', visible: () => store.get('pts').length > k,
              get: () => store.get('pts')[k] || [0, 0],
              set: (p) => { const pts = store.get('pts').map((q) => q.slice()); pts[k] = p; store.set({ pts }); },
            });
          }
        }
        pl.setDraw((g) => cur && (mode === 'dot' ? drawDot(g, cur) : drawData(g, cur)));
      }
      if (mode === 'cross') {
        const sc = new Scene3D(ctx.addView(), { extent: 4, frustum: 10 });
        views.scene = sc;
        sc.onTheme = () => ctx.rerender();
        const setVec = (key) => (p) => store.set({ [key]: p.map(entryFromNumber) });
        sc.addHandle({ id: 'cu', color: 'i', get: () => store.get('cu').map((e) => e.x), set: setVec('cu') });
        sc.addHandle({ id: 'cv', color: 'j', get: () => store.get('cv').map((e) => e.x), set: setVec('cv') });
        sc.addHandle({ id: 'cw', color: 'k', visible: () => store.get('cshow').includes('w'), get: () => store.get('cw').map((e) => e.x), set: setVec('cw') });
      }
      if (mode === 'gs' || (mode === 'ls' && state.pts.length === 3)) {
        const sc = new Scene3D(ctx.addView(), mode === 'ls' ? { title: { es: 'ℝ³: b y el espacio columna', en: 'ℝ³: b and the column space' }, extent: 4, frustum: 11 } : { extent: 3, frustum: 8 });
        views.scene = sc;
        sc.onTheme = () => ctx.rerender();
        if (mode === 'gs') {
          ['i', 'j', 'k'].forEach((c, j) => sc.addHandle({
            id: `v${j}`, color: c,
            get: () => store.get('W').map((row) => row[j].x),
            set: (p) => { const W = store.get('W').map((row) => row.slice()); p.forEach((x, i) => { W[i][j] = entryFromNumber(x); }); store.set({ W, g: 4 }); },
          }));
        } else {
          // Face the column-space plane obliquely so that both the plane and the residual are visible.
          const xs = state.pts.map((p) => p[0]);
          const nrm = state.model === 'affine' ? L.normalize(L.cross([1, 1, 1], xs)) : [0, 0, 0];
          if (L.norm(nrm) > 0.5) {
            const a = L.normalize([1, 1, 1]);
            sc.setViewDir(L.addVec(L.scaleVec(nrm[2] < 0 ? L.scaleVec(nrm, -1) : nrm, 1), L.scaleVec(a, 0.9)), false);
          }
          sc.addHandle({
            id: 'b', color: 'v',
            get: () => store.get('pts').map((p) => p[1]),
            set: (b) => { const pts = store.get('pts').map((p, i) => [p[0], b[i]]); store.set({ pts }); },
          });
        }
      }
    }

    // --- Projection -------------------------------------------------------------------
    function drawDot(g, c) {
      const { uf, vf, projf } = c;
      g.backgroundGrid();
      if (Math.hypot(...uf) > 1e-12) g.infiniteLine([0, 0], uf, { color: g.c.i, width: 1.5, dash: [6, 6], alpha: 0.6 });
      if (projf) {
        g.line(projf, vf, { color: g.c.muted, width: 2, dash: [5, 5] });
        g.arrow([0, 0], projf, { color: g.c.w, width: 5, alpha: 0.9 });
        const perp = [vf[0] - projf[0], vf[1] - projf[1]];
        if (Math.hypot(...perp) > 1e-9 && Math.hypot(...projf) > 1e-9) g.rightAngle(projf, [-projf[0], -projf[1]], perp, { color: g.c.muted });
        g.text(projf, 'proj', { color: g.c.w, offset: [0, 18], align: 'center', size: 11 });
      }
      // Angle arc
      const a1 = Math.atan2(uf[1], uf[0]), a2 = Math.atan2(vf[1], vf[0]);
      let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      const rr = 0.55;
      g.curve((t) => [rr * Math.cos(a1 + d * t), rr * Math.sin(a1 + d * t)], 0, 1, 40, { color: g.c.accent, width: 2 });
      g.text([0.85 * Math.cos(a1 + d / 2), 0.85 * Math.sin(a1 + d / 2)], 'θ', { color: g.c.accent, align: 'center', font: '"KaTeX_Math", serif', size: 17, italic: true });
      g.arrow([0, 0], uf, { color: g.c.i, width: 3.5 });
      g.arrow([0, 0], vf, { color: g.c.v, width: 3.5 });
      g.mathLabel(uf, 'u', { color: g.c.i, away: vf });
      g.mathLabel(vf, 'v', { color: g.c.v, away: uf });
    }

    function renderDot(state) {
      const { F, M: rows } = L.fieldMatrix([state.u, state.v]);
      const [u, v] = rows;
      const dot = L.dot(u, v, F), uu = L.dot(u, u, F), vv = L.dot(v, v, F);
      const uf = u.map((x) => F.toNumber(x)), vf = v.map((x) => F.toNumber(x));
      const proj = F.isZero(uu) ? null : u.map((x) => F.mul(F.div(dot, uu), x));
      const projf = proj ? proj.map((x) => F.toNumber(x)) : null;
      cur = { uf, vf, projf };
      const exact = F === RationalField;
      const norm = (r) => (exact ? texSqrt(r) : fmtDecimal(Math.sqrt(F.toNumber(r)), 4, { unicodeMinus: false }));
      setR(0, { es: 'Producto punto', en: 'Dot product' }, `${cls('c-i', '\\mathbf{u}')}\\cdot${cls('c-v', '\\mathbf{v}')} = ${u.map((x, i) => `${paren(texValue(x))}\\cdot ${paren(texValue(v[i]))}`).join(' + ')} = ${texValue(dot)}`,
        F.isZero(dot) ? { es: 'u · v = 0: los vectores son perpendiculares.', en: 'u · v = 0: the vectors are perpendicular.' }
          : F.toNumber(dot) > 0 ? { es: 'u · v > 0: forman un ángulo agudo.', en: 'u · v > 0: they form an acute angle.' } : { es: 'u · v < 0: forman un ángulo obtuso.', en: 'u · v < 0: they form an obtuse angle.' });
      setR(1, { es: 'Normas', en: 'Norms' }, `\\lVert\\mathbf{u}\\rVert = \\sqrt{${texValue(uu)}} = ${norm(uu)},\\qquad \\lVert\\mathbf{v}\\rVert = ${norm(vv)}`);
      let cosTex = '\\text{—}';
      if (!F.isZero(uu) && !F.isZero(vv)) {
        if (exact) {
          const s = sqrtRational(uu.mul(vv));
          cosTex = s ? texRationalSqrt(dot.div(s.coef.mul(new Rational(s.m))), s.m) : fmtDecimal(F.toNumber(dot) / Math.sqrt(F.toNumber(uu) * F.toNumber(vv)), 4);
        } else cosTex = fmtDecimal(F.toNumber(dot) / Math.sqrt(F.toNumber(uu) * F.toNumber(vv)), 4, { unicodeMinus: false });
        const ang = (Math.acos(Math.max(-1, Math.min(1, F.toNumber(dot) / Math.sqrt(F.toNumber(uu) * F.toNumber(vv))))) * 180) / Math.PI;
        setR(2, { es: 'Ángulo', en: 'Angle' }, `\\cos\\theta = \\frac{\\mathbf{u}\\cdot\\mathbf{v}}{\\lVert\\mathbf{u}\\rVert\\,\\lVert\\mathbf{v}\\rVert} = ${cosTex},\\qquad \\theta \\approx ${fmtDecimal(ang, 2)}^{\\circ}`);
      } else setR(2, { es: 'Ángulo', en: 'Angle' }, '\\text{—}');
      if (proj) {
        const perp = v.map((x, i) => F.sub(x, proj[i]));
        setR(3, { es: 'Proyección', en: 'Projection' }, `\\operatorname{proj}_{\\mathbf{u}}\\mathbf{v} = \\frac{\\mathbf{u}\\cdot\\mathbf{v}}{\\mathbf{u}\\cdot\\mathbf{u}}\\,\\mathbf{u} = ${texValue(F.div(dot, uu))}\\,${texVector(u)} = ${cls('c-w', texVector(proj))}`);
        setR(4, { es: 'Componente ortogonal', en: 'Orthogonal component' }, `\\mathbf{v} - \\operatorname{proj}_{\\mathbf{u}}\\mathbf{v} = ${texVector(perp)},\\qquad \\big(\\mathbf{v}-\\operatorname{proj}_{\\mathbf{u}}\\mathbf{v}\\big)\\cdot\\mathbf{u} = ${texValue(L.dot(perp, u, F))}`);
        const P = u.map((a) => u.map((b) => F.div(F.mul(a, b), uu)));
        setR(5, { es: 'Matriz de proyección', en: 'Projection matrix' }, `P = \\frac{\\mathbf{u}\\mathbf{u}^{\\mathsf T}}{\\mathbf{u}^{\\mathsf T}\\mathbf{u}} = ${texMatrix(P)}`, { es: 'P² = P y Pᵀ = P. Su núcleo es la recta perpendicular a u.', en: 'P² = P and Pᵀ = P. Its kernel is the line perpendicular to u.' });
      } else { rs[3].show(false); rs[4].show(false); rs[5].show(false); }
      rs[6].show(false);
      ctx.setLegend([
        { color: 'var(--c-i)', tex: '\\mathbf{u}' }, { color: 'var(--c-v)', tex: '\\mathbf{v}' },
        { color: 'var(--c-w)', tex: '\\operatorname{proj}_{\\mathbf{u}}\\mathbf{v}' },
      ]);
      return { dot: F.toNumber(dot), proj, F, uu: F.toNumber(uu) };
    }

    // --- Gram–Schmidt ----------------------------------------------------------------
    function gramSchmidt(W, F) {
      const vs = [0, 1, 2].map((j) => W.map((row) => row[j]));
      const ws = [];
      const U = L.identity(3, F);
      vs.forEach((v, k) => {
        let w = v.slice();
        for (let j = 0; j < k; j++) {
          const wj = ws[j];
          const n2 = L.dot(wj, wj, F);
          if (F.isZero(n2)) { U[j][k] = F.zero; continue; }
          const c = F.div(L.dot(v, wj, F), n2);
          U[j][k] = c;
          w = w.map((x, i) => F.sub(x, F.mul(c, wj[i])));
        }
        ws.push(w);
      });
      return { vs, ws, U };
    }

    function renderGS(state) {
      const { F, M: Wm } = L.fieldMatrix(state.W);
      const { vs, ws, U } = gramSchmidt(Wm, F);
      const g = state.g;
      const vf = vs.map((v) => v.map((x) => F.toNumber(x))), wf = ws.map((w) => w.map((x) => F.toNumber(x)));
      const norms = wf.map((w) => Math.hypot(...w));
      const sc = views.scene;
      sc.clear();
      const keys = ['i', 'j', 'k'];
      // Current vectors along the animation.
      const current = [0, 1, 2].map((k) => {
        let p = vf[k];
        if (k >= 1 && g > k) { const s = Math.min(1, g - k); p = vf[k].map((x, i) => x + s * (wf[k][i] - x)); }
        if (k >= 1 && g <= k) p = vf[k];
        if (g > 3) { const s = g - 3; const n = norms[k]; if (n > 1e-12) p = wf[k].map((x) => x * (1 + s * (1 / n - 1))); }
        return p;
      });
      vf.forEach((v, k) => sc.arrow([0, 0, 0], v, keys[k], { opacity: 0.25, radius: 0.02 }));
      current.forEach((p, k) => {
        sc.arrow([0, 0, 0], p, keys[k], { radius: 0.035 });
        sc.label(p, g > 3 ? `\\mathbf{q}_{${k + 1}}` : g > k ? `\\mathbf{w}_{${k + 1}}` : `\\mathbf{v}_{${k + 1}}`, keys[k], { tex: true, offset: [12, -10] });
      });
      // What is being subtracted at the active stage.
      const stage = Math.min(3, Math.floor(g));
      if (stage === 1 || stage === 2) {
        const k = stage;
        let proj = [0, 0, 0];
        for (let j = 0; j < k; j++) {
          const n2 = L.dotFloat(wf[j], wf[j]);
          if (n2 < 1e-12) continue;
          proj = L.addVec(proj, L.scaleVec(wf[j], L.dotFloat(vf[k], wf[j]) / n2));
        }
        sc.arrow([0, 0, 0], proj, 'muted', { radius: 0.025, opacity: 0.9 });
        sc.line([proj, vf[k]], 'muted', { dashed: true });
        if (k === 2 && norms[0] > 1e-9 && norms[1] > 1e-9) sc.planeSpan([0, 0, 0], L.normalize(wf[0]), L.normalize(wf[1]), 'j', { size: 2.5, opacity: 0.1, grid: 0.5 });
        else if (k === 1 && norms[0] > 1e-9) sc.lineThrough([0, 0, 0], wf[0], 'i', { dashed: true, length: 6 });
      }
      sc.syncHandles();
      sc.requestRender();

      const exact = F === RationalField;
      const normTex = (w) => (exact ? texSqrt(L.dot(w, w, F)) : fmtDecimal(Math.hypot(...w.map((x) => F.toNumber(x))), 4, { unicodeMinus: false }));
      const steps = ws.map((w, k) => {
        const terms = [];
        for (let j = 0; j < k; j++) {
          if (F.isZero(U[j][k])) continue;
          const c = texValue(U[j][k]);
          terms.push(c.startsWith('-') ? `+ ${c.slice(1)}\\,\\mathbf{w}_{${j + 1}}` : `- ${c}\\,\\mathbf{w}_{${j + 1}}`);
        }
        return `\\mathbf{w}_{${k + 1}} = \\mathbf{v}_{${k + 1}} ${terms.join(' ')} = ${cls(['c-i', 'c-j', 'c-k'][k], texVector(w))}`;
      });
      setR(0, { es: 'Ortogonalización', en: 'Orthogonalization' }, `\\begin{aligned} ${steps.map((s) => s.replace('=', '&=')).join(' \\\\ ')} \\end{aligned}`,
        { es: 'Cada coeficiente es (vₖ · wⱼ)/(wⱼ · wⱼ): se resta la proyección de vₖ sobre los w anteriores.', en: 'Each coefficient is (vₖ · wⱼ)/(wⱼ · wⱼ): the projection of vₖ onto the previous w’s is subtracted.' });
      const zeros = ws.map((w, k) => (w.every((x) => F.isZero(x)) ? k + 1 : null)).filter(Boolean);
      setR(1, { es: 'Normalización', en: 'Normalization' }, ws.map((w, k) => (w.every((x) => F.isZero(x)) ? `\\mathbf{w}_{${k + 1}} = \\mathbf{0}` : `\\mathbf{q}_{${k + 1}} = \\frac{1}{${normTex(w)}}\\,\\mathbf{w}_{${k + 1}}`)).join(',\\quad '),
        zeros.length ? { es: `w${sub(zeros[0])} = 0: v${sub(zeros[0])} depende linealmente de los anteriores y no aporta una nueva dirección.`, en: `w${sub(zeros[0])} = 0: v${sub(zeros[0])} depends linearly on the previous ones and adds no new direction.` } : null);
      const dots = [[0, 1], [0, 2], [1, 2]].map(([a, b]) => `\\mathbf{w}_{${a + 1}}\\cdot\\mathbf{w}_{${b + 1}} = ${texValue(L.dot(ws[a], ws[b], F))}`);
      setR(2, { es: 'Comprobación', en: 'Check' }, dots.join(',\\quad '));
      const Wmat = [0, 1, 2].map((i) => ws.map((w) => w[i]));
      setR(3, { es: 'Factorización', en: 'Factorization' }, `A = [\\,\\mathbf{v}_1\\,\\mathbf{v}_2\\,\\mathbf{v}_3\\,] = W\\,U = ${texMatrix(Wmat, { colClasses: ['c-i', 'c-j', 'c-k'] })}${texMatrix(U)}`,
        { es: 'W tiene columnas ortogonales y U es triangular superior con unos en la diagonal. Normalizando las columnas de W se obtiene la factorización QR: Q = W·diag(1/‖wᵢ‖), R = diag(‖wᵢ‖)·U.', en: 'W has orthogonal columns and U is upper triangular with ones on the diagonal. Normalizing the columns of W gives the QR factorization: Q = W·diag(1/‖wᵢ‖), R = diag(‖wᵢ‖)·U.' });
      for (let i = 4; i < 7; i++) rs[i].show(false);
      const names = ['\\mathbf{w}_1 = \\mathbf{v}_1', '\\mathbf{w}_2', '\\mathbf{w}_3', '\\mathbf{q}_i'];
      stageRow.update(names, Math.max(0, Math.min(3, Math.ceil(g) - 1)));
      ctx.setLegend([
        { color: 'var(--c-i)', tex: '\\mathbf{w}_1' }, { color: 'var(--c-j)', tex: '\\mathbf{w}_2' }, { color: 'var(--c-k)', tex: '\\mathbf{w}_3' },
        { color: 'var(--muted)', label: { es: 'proyección que se resta', en: 'projection being subtracted' } },
      ]);
      return { ws, F, U, orthonormalInput: isOrthogonal(vs, F) };
    }

    // --- Least squares -----------------------------------------------------------------
    function drawData(g, c) {
      g.backgroundGrid();
      const { pts, coef, predf } = c;
      if (coef) {
        const f = (x) => (c.model === 'affine' ? coef[0] + coef[1] * x : coef[0] * x);
        const { xmin, xmax } = g.p.bounds();
        g.line([xmin, f(xmin)], [xmax, f(xmax)], { color: g.c.w, width: 3 });
        pts.forEach((p, i) => g.line(p, [p[0], predf[i]], { color: g.c.res, width: 2.5, alpha: 0.9 }));
        pts.forEach((p, i) => g.point([p[0], predf[i]], { color: g.c.w, r: 3.5 }));
      }
      pts.forEach((p, i) => g.text(p, `(${fmtDecimal(p[0], 2)}, ${fmtDecimal(p[1], 2)})`, { color: g.c.muted, offset: [12, 12], size: 11 }));
    }

    function renderLS(state) {
      const pts = state.pts;
      const N = pts.length;
      const exact = pts.every((p) => p.every((x) => Rational.fromNumber(x)));
      const cols = state.model === 'affine' ? 2 : 1;
      const toF = (x) => (exact ? Rational.fromNumber(x) : x);
      const G = exact ? RationalField : floatField();
      const A = pts.map((p) => (cols === 2 ? [G === RationalField ? Rational.of(1) : 1, toF(p[0])] : [toF(p[0])]));
      const b = pts.map((p) => toF(p[1]));
      const At = L.transpose(A);
      const AtA = L.matMul(At, A, G), Atb = L.matVec(At, b, G);
      const sol = L.solve(AtA, Atb, G);
      let coef = null, pred = null, res = null, e2 = null;
      if (sol.status === 'unique') {
        coef = sol.particular;
        pred = L.matVec(A, coef, G);
        res = b.map((x, i) => G.sub(x, pred[i]));
        e2 = L.dot(res, res, G);
      }
      const coeff = coef ? coef.map((x) => G.toNumber(x)) : null;
      cur = { pts, coef: coeff, predf: pred ? pred.map((x) => G.toNumber(x)) : null, model: state.model };
      if (views.plane) views.plane.requestRender();

      const sc = views.scene;
      if (sc) {
        sc.clear();
        const bf = b.map((x) => G.toNumber(x));
        const a = [0, 1].slice(0, cols).map((j) => A.map((row) => G.toNumber(row[j])));
        if (cols === 2) sc.planeSpan([0, 0, 0], a[0], a[1], 'img', { size: 2, opacity: 0.12, grid: 1 });
        else sc.lineThrough([0, 0, 0], a[0], 'img', { length: 8 });
        a.forEach((col, j) => { sc.arrow([0, 0, 0], col, j ? 'j' : 'i', { radius: 0.025 }); sc.label(col, `\\mathbf{a}_{${j + 1}}`, j ? 'j' : 'i', { tex: true, offset: [10, -10] }); });
        sc.arrow([0, 0, 0], bf, 'v');
        sc.label(bf, '\\mathbf{b}', 'v', { tex: true, offset: [12, -12] });
        if (pred) {
          const pf = pred.map((x) => G.toNumber(x));
          sc.arrow([0, 0, 0], pf, 'w');
          sc.label(pf, 'A\\hat{\\mathbf{x}}', 'w', { tex: true, offset: [12, 14] });
          sc.line([pf, bf], 'res', {});
          sc.label(pf.map((x, i) => (x + bf[i]) / 2), '\\mathbf{e}', 'res', { tex: true, offset: [10, 0] });
        }
        sc.syncHandles();
        sc.requestRender();
      }

      const Atex = texMatrix(A);
      setR(0, { es: 'Sistema', en: 'System' }, `A\\mathbf{x} = \\mathbf{b}:\\quad ${Atex}${state.model === 'affine' ? '\\begin{bmatrix}c_0\\\\c_1\\end{bmatrix}' : '\\begin{bmatrix}c\\end{bmatrix}'} = ${cls('c-v', texVector(b))}`,
        { es: `${N} ecuaciones y ${cols} incógnitas: en general no hay solución exacta.`, en: `${N} equations and ${cols} unknowns: in general there is no exact solution.` });
      setR(1, { es: 'Ecuaciones normales', en: 'Normal equations' }, `A^{\\mathsf T}A\\,\\hat{\\mathbf{x}} = A^{\\mathsf T}\\mathbf{b}:\\quad ${texMatrix(AtA)}\\hat{\\mathbf{x}} = ${texVector(Atb)}`);
      if (coef) {
        const fit = state.model === 'affine' ? `y = ${texValue(coef[0])} ${signed(texValue(coef[1]))}\\,x` : `y = ${texValue(coef[0])}\\,x`;
        setR(2, { es: 'Mejor ajuste', en: 'Best fit' }, `\\hat{\\mathbf{x}} = ${texVector(coef)},\\qquad ${cls('c-w', fit)}`);
        setR(3, { es: 'Residuo', en: 'Residual' }, `\\mathbf{e} = \\mathbf{b} - A\\hat{\\mathbf{x}} = ${cls('c-res', texVector(res))},\\qquad \\lVert\\mathbf{e}\\rVert^2 = ${texValue(e2)}`,
          { es: 'Es la suma de los cuadrados de los segmentos rosados: ninguna otra elección de coeficientes la hace más pequeña.', en: 'It is the sum of the squares of the pink segments: no other choice of coefficients makes it smaller.' });
        setR(4, { es: 'Ortogonalidad', en: 'Orthogonality' }, `A^{\\mathsf T}\\mathbf{e} = ${texVector(L.matVec(At, res, G))}`,
          { es: 'El residuo es perpendicular a cada columna de A, es decir, al espacio columna: Ax̂ es la proyección ortogonal de b.', en: 'The residual is perpendicular to every column of A, i.e. to the column space: Ax̂ is the orthogonal projection of b.' });
      } else {
        setR(2, { es: 'Mejor ajuste', en: 'Best fit' }, `\\text{${tr({ es: 'no es único: AᵀA es singular (todos los x son iguales)', en: 'not unique: AᵀA is singular (all x are equal)' })}}`);
        rs[3].show(false); rs[4].show(false);
      }
      if (N !== 3) setR(5, { es: 'Vista en ℝᴺ', en: 'View in ℝᴺ' }, `\\text{${tr({ es: `b vive en ℝ${supN(N)}: la vista 3D solo se muestra con 3 puntos`, en: `b lives in ℝ${supN(N)}: the 3D view is shown only with 3 points` })}}`);
      else rs[5].show(false);
      rs[6].show(false);
      ctx.setLegend([
        { color: 'var(--c-v)', label: { es: 'datos (b)', en: 'data (b)' } },
        { color: 'var(--c-w)', label: { es: 'ajuste y proyección Ax̂', en: 'fit and projection Ax̂' } },
        { color: 'var(--c-res)', label: { es: 'residuos', en: 'residuals' } },
        views.scene && { color: 'var(--c-img)', kind: 'area', label: { es: 'espacio columna de A', en: 'column space of A' } },
      ]);
      return { coef: coeff, e2: e2 === null ? null : G.toNumber(e2), N };
    }

    // --- Cross product --------------------------------------------------------------
    function renderCross(state) {
      const { F, M: rows } = L.fieldMatrix([state.cu, state.cv, state.cw]);
      const [u, v, w] = rows;
      const c = [
        F.sub(F.mul(u[1], v[2]), F.mul(u[2], v[1])),
        F.sub(F.mul(u[2], v[0]), F.mul(u[0], v[2])),
        F.sub(F.mul(u[0], v[1]), F.mul(u[1], v[0])),
      ];
      const cf = c.map((x) => F.toNumber(x));
      const uf = u.map((x) => F.toNumber(x)), vf = v.map((x) => F.toNumber(x)), wf = w.map((x) => F.toNumber(x));
      const triple = L.dot(c, w, F);
      const showW = state.cshow.includes('w');
      const sc = views.scene;
      if (sc) {
        sc.clear();
        if (state.cshow.includes('par')) {
          const center = uf.map((x, i) => (x + vf[i]) / 2);
          sc.planeSpan(center, uf.map((x) => x / 2), vf.map((x) => x / 2), 'det', { size: 1, opacity: 0.28, edges: true });
        }
        if (showW) {
          const vol = F.toNumber(triple);
          sc.parallelepiped([0, 1, 2].map((i) => [uf[i], vf[i], wf[i]]), Math.abs(vol) < 1e-12 ? 'muted' : vol < 0 ? 'detNeg' : 'k', { opacity: 0.07, edgeOpacity: 0.45 });
          sc.arrow([0, 0, 0], wf, 'k', { radius: 0.03 });
          sc.label(wf, '\\mathbf{w}', 'k', { tex: true, offset: [12, -10] });
        }
        sc.arrow([0, 0, 0], uf, 'i');
        sc.arrow([0, 0, 0], vf, 'j');
        sc.label(uf, '\\mathbf{u}', 'i', { tex: true, offset: [12, -10] });
        sc.label(vf, '\\mathbf{v}', 'j', { tex: true, offset: [12, -10] });
        if (Math.hypot(...cf) > 1e-9) {
          sc.arrow([0, 0, 0], cf, 'v', { radius: 0.05 });
          const nc = Math.hypot(...cf);
          sc.label(cf.map((x) => x * (1 + 0.55 / nc)), '\\mathbf{u}\\times\\mathbf{v}', 'v', { tex: true, size: 15 });
        }
        sc.syncHandles();
        sc.requestRender();
      }
      const paren = (t) => (t.startsWith('-') ? `(${t})` : t);
      const minor = (a, b, cc, d) => `${paren(texValue(a))}\\cdot${paren(texValue(b))} - ${paren(texValue(cc))}\\cdot${paren(texValue(d))}`;
      setR(0, { es: 'Producto cruz', en: 'Cross product' },
        `${cls('c-i', '\\mathbf{u}')}\\times${cls('c-j', '\\mathbf{v}')} = \\begin{vmatrix}\\hat{\\imath}&\\hat{\\jmath}&\\hat{k}\\\\ ${u.map(texValue).join('&')}\\\\ ${v.map(texValue).join('&')}\\end{vmatrix} = \\begin{bmatrix} ${minor(u[1], v[2], u[2], v[1])} \\\\ ${minor(u[2], v[0], u[0], v[2])} \\\\ ${minor(u[0], v[1], u[1], v[0])} \\end{bmatrix} = ${cls('c-v', texVector(c))}`);
      setR(1, { es: 'Perpendicular a ambos', en: 'Perpendicular to both' },
        `(\\mathbf{u}\\times\\mathbf{v})\\cdot\\mathbf{u} = ${texValue(L.dot(c, u, F))},\\qquad (\\mathbf{u}\\times\\mathbf{v})\\cdot\\mathbf{v} = ${texValue(L.dot(c, v, F))}`,
        { es: 'Su sentido sigue la regla de la mano derecha: si los dedos van de u a v, el pulgar apunta a u × v. Por eso v × u = −(u × v).', en: 'Its direction follows the right-hand rule: if your fingers go from u to v, your thumb points along u × v. That is why v × u = −(u × v).' });
      const cc = L.dot(c, c, F);
      const normTex = F === RationalField ? (() => { const r = sqrtRational(cc); return r ? texRationalSqrt(r.coef, r.m) : `\\sqrt{${texValue(cc)}}`; })() : fmtDecimal(Math.sqrt(F.toNumber(cc)), 4);
      setR(2, { es: 'Área', en: 'Area' },
        `\\lVert\\mathbf{u}\\times\\mathbf{v}\\rVert = \\sqrt{${texValue(cc)}} = ${normTex} = \\lVert\\mathbf{u}\\rVert\\,\\lVert\\mathbf{v}\\rVert\\sin\\theta`,
        Math.abs(F.toNumber(cc)) < 1e-12 ? { es: 'u y v son paralelos: el paralelogramo se reduce a un segmento y u × v = 0.', en: 'u and v are parallel: the parallelogram collapses to a segment and u × v = 0.' } : { es: 'Es el área del paralelogramo generado por u y v.', en: 'It is the area of the parallelogram spanned by u and v.' });
      if (showW) {
        const vol = F.toNumber(triple);
        setR(3, { es: 'Producto mixto', en: 'Triple product' },
          `(\\mathbf{u}\\times\\mathbf{v})\\cdot\\mathbf{w} = \\det[\\,\\mathbf{u}\\;\\mathbf{v}\\;\\mathbf{w}\\,] = ${texValue(triple)}`,
          Math.abs(vol) < 1e-12 ? { es: 'u, v y w son coplanares: volumen 0.', en: 'u, v and w are coplanar: volume 0.' }
            : { es: `Es el volumen con signo del paralelepípedo: ${vol > 0 ? 'positivo, porque w está del mismo lado que u × v' : 'negativo, porque w está al otro lado del plano de u y v'}.`, en: `It is the signed volume of the parallelepiped: ${vol > 0 ? 'positive, because w lies on the same side as u × v' : 'negative, because w lies on the other side of the plane of u and v'}.` });
      } else rs[3].show(false);
      setR(4, { es: 'Dualidad', en: 'Duality' },
        `\\det[\\,\\mathbf{x}\\;\\mathbf{u}\\;\\mathbf{v}\\,] = ${cls('c-v', '(\\mathbf{u}\\times\\mathbf{v})')}\\cdot\\mathbf{x}\\quad\\text{${tr({ es: 'para todo', en: 'for every' })}}\\ \\mathbf{x}\\in\\mathbb{R}^3`,
        { es: 'Con u y v fijos, x ↦ det[x u v] es lineal de ℝ³ en ℝ, así que es un producto punto con un único vector: ese vector es u × v.', en: 'With u and v fixed, x ↦ det[x u v] is linear from ℝ³ to ℝ, so it is a dot product with a unique vector: that vector is u × v.' });
      const Z = F.zero;
      const Ux = [[Z, F.neg(u[2]), u[1]], [u[2], Z, F.neg(u[0])], [F.neg(u[1]), u[0], Z]];
      setR(5, { es: 'Como matriz', en: 'As a matrix' }, `\\mathbf{u}\\times\\mathbf{v} = [\\mathbf{u}]_\\times\\,\\mathbf{v},\\qquad [\\mathbf{u}]_\\times = ${texMatrix(Ux)}`,
        { es: 'Es antisimétrica ([u]ₓᵀ = −[u]ₓ) y su núcleo es la recta de u. Aparece en la fórmula de Rodrigues de las rotaciones.', en: 'It is skew-symmetric ([u]ₓᵀ = −[u]ₓ) and its kernel is the line of u. It appears in Rodrigues’ rotation formula.' });
      rs[6].show(false);
      ctx.setLegend([
        { color: 'var(--c-i)', tex: '\\mathbf{u}' }, { color: 'var(--c-j)', tex: '\\mathbf{v}' },
        { color: 'var(--c-v)', tex: '\\mathbf{u}\\times\\mathbf{v}' },
        state.cshow.includes('par') && { color: 'var(--c-det)', kind: 'area', label: { es: 'paralelogramo (área = ‖u × v‖)', en: 'parallelogram (area = ‖u × v‖)' } },
        showW && { color: 'var(--c-k)', tex: '\\mathbf{w}' },
        showW && { color: F.toNumber(triple) < 0 ? 'var(--c-det-neg)' : 'var(--c-k)', kind: 'area', label: { es: 'paralelepípedo (volumen = |det[u v w]|)', en: 'parallelepiped (volume = |det[u v w]|)' } },
      ]);
      return { cross: c, F, triple };
    }

    function render(state) {
      const key = `${state.mode}|${state.mode === 'ls' && state.pts.length === 3}`;
      if (key !== viewKey) { viewKey = key; buildViews(state); }
      modeSeg.update(); uEd.update(); vEd.update(); wEd.update(); modelSeg.update(); anim.update();
      cuEd.update(); cvEd.update(); cwEd.update(); crossChips.forEach((c) => c.update());
      const mode = state.mode;
      dotBox.hidden = mode !== 'dot';
      wEd.el.hidden = mode !== 'gs';
      lsBox.hidden = mode !== 'ls';
      crossBox.hidden = mode !== 'cross';
      cwEd.el.hidden = !state.cshow.includes('w');
      ctx.bar.hidden = mode !== 'gs';
      setText(help, {
        dot: { es: 'Arrastra u y v. La flecha cian es la sombra de v sobre la recta de u.', en: 'Drag u and v. The cyan arrow is the shadow of v on the line of u.' },
        gs: { es: 'Arrastra v₁, v₂, v₃ en 3D y reproduce: cada vector pierde su componente sobre los anteriores y al final se normaliza.', en: 'Drag v₁, v₂, v₃ in 3D and press play: each vector loses its component along the previous ones and is finally normalized.' },
        ls: { es: 'Arrastra los puntos (o b en la vista 3D). La recta minimiza la suma de los cuadrados de los residuos verticales.', en: 'Drag the points (or b in the 3D view). The line minimizes the sum of the squares of the vertical residuals.' },
        cross: { es: 'Arrastra u y v en 3D: u × v es perpendicular a ambos, su longitud es el área del paralelogramo y su sentido sigue la regla de la mano derecha.', en: 'Drag u and v in 3D: u × v is perpendicular to both, its length is the area of the parallelogram and its direction follows the right-hand rule.' },
      }[mode]);
      const d = mode === 'dot' ? renderDot(state) : mode === 'gs' ? renderGS(state) : mode === 'ls' ? renderLS(state) : renderCross(state);
      if (views.plane) views.plane.requestRender();
      return { mode, ...d };
    }

    return {
      render,
      snapshot: () => composeCanvases([views.plane, views.scene].filter(Boolean).map((v) => v.snapshot())),
      togglePlay: () => { if (store.get('mode') === 'gs') anim.toggle(); },
      onReset: () => { anim.pause(); viewKey = ''; ctx.rerender(); },
    };
  },

  learn: {
    what: {
      es: `<p>El producto punto $\\mathbf{u}\\cdot\\mathbf{v} = \\sum u_iv_i$ tiene una lectura geométrica: $\\mathbf{u}\\cdot\\mathbf{v} = \\lVert\\mathbf{u}\\rVert\\,\\lVert\\mathbf{v}\\rVert\\cos\\theta$. En <em>Proyección</em>, la flecha cian es la sombra de $\\mathbf{v}$ sobre la recta de $\\mathbf{u}$; lo que sobra es perpendicular a $\\mathbf{u}$. Todos los valores son exactos: las normas aparecen como radicales simplificados.</p>
<p><em>Gram–Schmidt</em> convierte tres vectores independientes en una base ortonormal: a cada $\\mathbf{v}_k$ se le resta su proyección sobre los $\\mathbf{w}$ anteriores (la flecha gris) y al final se divide cada $\\mathbf{w}_k$ por su norma.</p>
<p>En <em>Mínimos cuadrados</em> los datos no están alineados, así que $A\\mathbf{x} = \\mathbf{b}$ no tiene solución. La mejor aproximación $\\hat{\\mathbf{x}}$ hace que $A\\hat{\\mathbf{x}}$ sea la <strong>proyección ortogonal de $\\mathbf{b}$ sobre el espacio columna</strong>. Con tres puntos puedes verlo en $\\mathbb{R}^3$: $\\mathbf{b}$, el plano de las combinaciones $c_0\\mathbf{a}_1 + c_1\\mathbf{a}_2$ y el residuo perpendicular. Arrastra $\\mathbf{b}$ allí y observa cómo se mueven los datos.</p>
<p>El <strong>producto cruz</strong> de $\\mathbf{u},\\mathbf{v}\\in\\mathbb{R}^3$ es el único vector $\\mathbf{u}\\times\\mathbf{v}$ tal que $\\det[\\,\\mathbf{x}\\;\\mathbf{u}\\;\\mathbf{v}\\,] = (\\mathbf{u}\\times\\mathbf{v})\\cdot\\mathbf{x}$ para todo $\\mathbf{x}$. De esa definición salen sus propiedades: es perpendicular a $\\mathbf{u}$ y a $\\mathbf{v}$, su longitud es el área del paralelogramo que generan y su sentido sigue la regla de la mano derecha.</p>`,
      en: `<p>The dot product $\\mathbf{u}\\cdot\\mathbf{v} = \\sum u_iv_i$ has a geometric reading: $\\mathbf{u}\\cdot\\mathbf{v} = \\lVert\\mathbf{u}\\rVert\\,\\lVert\\mathbf{v}\\rVert\\cos\\theta$. In <em>Projection</em>, the cyan arrow is the shadow of $\\mathbf{v}$ on the line of $\\mathbf{u}$; what is left over is perpendicular to $\\mathbf{u}$. Every value is exact: norms appear as simplified radicals.</p>
<p><em>Gram–Schmidt</em> turns three independent vectors into an orthonormal basis: from each $\\mathbf{v}_k$ we subtract its projection onto the previous $\\mathbf{w}$’s (the grey arrow) and finally divide each $\\mathbf{w}_k$ by its norm.</p>
<p>In <em>Least squares</em> the data are not aligned, so $A\\mathbf{x} = \\mathbf{b}$ has no solution. The best approximation $\\hat{\\mathbf{x}}$ makes $A\\hat{\\mathbf{x}}$ the <strong>orthogonal projection of $\\mathbf{b}$ onto the column space</strong>. With three points you can see it in $\\mathbb{R}^3$: $\\mathbf{b}$, the plane of combinations $c_0\\mathbf{a}_1 + c_1\\mathbf{a}_2$ and the perpendicular residual. Drag $\\mathbf{b}$ there and watch the data move.</p>
<p>The <strong>cross product</strong> of $\\mathbf{u},\\mathbf{v}\\in\\mathbb{R}^3$ is the unique vector $\\mathbf{u}\\times\\mathbf{v}$ such that $\\det[\\,\\mathbf{x}\\;\\mathbf{u}\\;\\mathbf{v}\\,] = (\\mathbf{u}\\times\\mathbf{v})\\cdot\\mathbf{x}$ for every $\\mathbf{x}$. Its properties follow from that definition: it is perpendicular to $\\mathbf{u}$ and $\\mathbf{v}$, its length is the area of the parallelogram they span and its direction follows the right-hand rule.</p>`,
    },
    prompts: {
      es: [
        'En «Proyección», gira $\\mathbf{v}$ alrededor del origen. ¿Cuándo cambia de signo $\\mathbf{u}\\cdot\\mathbf{v}$? ¿Qué pasa con la proyección cuando el ángulo es obtuso?',
        'Duplica $\\mathbf{u}$ (por ejemplo, de $(3,1)$ a $(6,2)$). ¿Cambia la proyección de $\\mathbf{v}$? ¿Cambia la matriz $P$? ¿Por qué?',
        'En «Gram–Schmidt», haz $\\mathbf{v}_3 = \\mathbf{v}_1 + \\mathbf{v}_2$. ¿Qué le pasa a $\\mathbf{w}_3$?',
        'En «Mínimos cuadrados», alinea los tres puntos. ¿Cuánto vale el residuo? ¿Dónde queda $\\mathbf{b}$ respecto del plano?',
        'Cambia al modelo $y = cx$. ¿Por qué ahora el espacio columna es una recta en $\\mathbb{R}^3$?',
        'En «Producto cruz», haz $\\mathbf{v}$ paralelo a $\\mathbf{u}$. ¿Qué le pasa a $\\mathbf{u}\\times\\mathbf{v}$? Después mueve $\\mathbf{w}$ al otro lado del plano de $\\mathbf{u}$ y $\\mathbf{v}$: ¿qué signo toma el producto mixto?',
      ],
      en: [
        'In “Projection”, turn $\\mathbf{v}$ around the origin. When does $\\mathbf{u}\\cdot\\mathbf{v}$ change sign? What happens to the projection when the angle is obtuse?',
        'Double $\\mathbf{u}$ (e.g. from $(3,1)$ to $(6,2)$). Does the projection of $\\mathbf{v}$ change? Does the matrix $P$? Why?',
        'In “Gram–Schmidt”, make $\\mathbf{v}_3 = \\mathbf{v}_1 + \\mathbf{v}_2$. What happens to $\\mathbf{w}_3$?',
        'In “Least squares”, line the three points up. What is the residual? Where is $\\mathbf{b}$ relative to the plane?',
        'Switch to the model $y = cx$. Why is the column space now a line in $\\mathbb{R}^3$?',
        'In “Cross product”, make $\\mathbf{v}$ parallel to $\\mathbf{u}$. What happens to $\\mathbf{u}\\times\\mathbf{v}$? Then move $\\mathbf{w}$ to the other side of the plane of $\\mathbf{u}$ and $\\mathbf{v}$: what sign does the triple product take?',
      ],
    },
    formal: [
      {
        kind: 'proposition',
        title: { es: 'Proyección ortogonal sobre una recta', en: 'Orthogonal projection onto a line' },
        body: {
          es: '<p>Para $\\mathbf{u}\\neq\\mathbf{0}$, $\\operatorname{proj}_{\\mathbf{u}}\\mathbf{v} = \\dfrac{\\mathbf{u}\\cdot\\mathbf{v}}{\\mathbf{u}\\cdot\\mathbf{u}}\\,\\mathbf{u}$ es el único punto de $\\operatorname{gen}\\{\\mathbf{u}\\}$ tal que $\\mathbf{v}-\\operatorname{proj}_{\\mathbf{u}}\\mathbf{v}\\perp\\mathbf{u}$, y es el punto de la recta más cercano a $\\mathbf{v}$. Por Cauchy–Schwarz, $|\\mathbf{u}\\cdot\\mathbf{v}|\\le\\lVert\\mathbf{u}\\rVert\\lVert\\mathbf{v}\\rVert$, lo que justifica la definición del ángulo.</p>',
          en: '<p>For $\\mathbf{u}\\neq\\mathbf{0}$, $\\operatorname{proj}_{\\mathbf{u}}\\mathbf{v} = \\dfrac{\\mathbf{u}\\cdot\\mathbf{v}}{\\mathbf{u}\\cdot\\mathbf{u}}\\,\\mathbf{u}$ is the unique point of $\\operatorname{span}\\{\\mathbf{u}\\}$ such that $\\mathbf{v}-\\operatorname{proj}_{\\mathbf{u}}\\mathbf{v}\\perp\\mathbf{u}$, and it is the point of the line closest to $\\mathbf{v}$. By Cauchy–Schwarz, $|\\mathbf{u}\\cdot\\mathbf{v}|\\le\\lVert\\mathbf{u}\\rVert\\lVert\\mathbf{v}\\rVert$, which justifies the definition of the angle.</p>',
        },
      },
      {
        kind: 'algorithm',
        title: { es: 'Gram–Schmidt y factorización QR', en: 'Gram–Schmidt and the QR factorization' },
        body: {
          es: '<p>$\\mathbf{w}_1 = \\mathbf{v}_1$, $\\ \\mathbf{w}_k = \\mathbf{v}_k - \\sum_{j<k}\\dfrac{\\mathbf{v}_k\\cdot\\mathbf{w}_j}{\\mathbf{w}_j\\cdot\\mathbf{w}_j}\\mathbf{w}_j$, $\\ \\mathbf{q}_k = \\mathbf{w}_k/\\lVert\\mathbf{w}_k\\rVert$. Los $\\mathbf{w}_k$ son ortogonales y $\\operatorname{gen}\\{\\mathbf{w}_1,\\dots,\\mathbf{w}_k\\} = \\operatorname{gen}\\{\\mathbf{v}_1,\\dots,\\mathbf{v}_k\\}$ para cada $k$. Matricialmente, $A = QR$ con $Q$ de columnas ortonormales y $R$ triangular superior con diagonal positiva.</p>',
          en: '<p>$\\mathbf{w}_1 = \\mathbf{v}_1$, $\\ \\mathbf{w}_k = \\mathbf{v}_k - \\sum_{j<k}\\dfrac{\\mathbf{v}_k\\cdot\\mathbf{w}_j}{\\mathbf{w}_j\\cdot\\mathbf{w}_j}\\mathbf{w}_j$, $\\ \\mathbf{q}_k = \\mathbf{w}_k/\\lVert\\mathbf{w}_k\\rVert$. The $\\mathbf{w}_k$ are orthogonal and $\\operatorname{span}\\{\\mathbf{w}_1,\\dots,\\mathbf{w}_k\\} = \\operatorname{span}\\{\\mathbf{v}_1,\\dots,\\mathbf{v}_k\\}$ for every $k$. In matrix form, $A = QR$ with $Q$ having orthonormal columns and $R$ upper triangular with positive diagonal.</p>',
        },
      },
      {
        kind: 'theorem',
        title: { es: 'Mínimos cuadrados', en: 'Least squares' },
        body: {
          es: '<p>Para $A\\in\\mathbb{R}^{m\\times n}$ y $\\mathbf{b}\\in\\mathbb{R}^m$, $\\hat{\\mathbf{x}}$ minimiza $\\lVert A\\mathbf{x}-\\mathbf{b}\\rVert$ si y solo si $A^{\\mathsf T}(\\mathbf{b} - A\\hat{\\mathbf{x}}) = \\mathbf{0}$, es decir, si resuelve las <strong>ecuaciones normales</strong> $A^{\\mathsf T}A\\hat{\\mathbf{x}} = A^{\\mathsf T}\\mathbf{b}$. La solución es única si y solo si las columnas de $A$ son independientes, y entonces $A\\hat{\\mathbf{x}} = A(A^{\\mathsf T}A)^{-1}A^{\\mathsf T}\\mathbf{b}$ es la proyección ortogonal de $\\mathbf{b}$ sobre $\\operatorname{Im}A$.</p>',
          en: '<p>For $A\\in\\mathbb{R}^{m\\times n}$ and $\\mathbf{b}\\in\\mathbb{R}^m$, $\\hat{\\mathbf{x}}$ minimizes $\\lVert A\\mathbf{x}-\\mathbf{b}\\rVert$ if and only if $A^{\\mathsf T}(\\mathbf{b} - A\\hat{\\mathbf{x}}) = \\mathbf{0}$, i.e. if it solves the <strong>normal equations</strong> $A^{\\mathsf T}A\\hat{\\mathbf{x}} = A^{\\mathsf T}\\mathbf{b}$. The solution is unique if and only if the columns of $A$ are independent, and then $A\\hat{\\mathbf{x}} = A(A^{\\mathsf T}A)^{-1}A^{\\mathsf T}\\mathbf{b}$ is the orthogonal projection of $\\mathbf{b}$ onto $\\operatorname{Im}A$.</p>',
        },
      },
      {
        kind: 'definition',
        title: { es: 'Producto cruz y producto mixto', en: 'Cross product and triple product' },
        body: {
          es: '<p>Para $\\mathbf{u},\\mathbf{v}\\in\\mathbb{R}^3$, la aplicación $\\mathbf{x}\\mapsto\\det[\\,\\mathbf{x}\\;\\mathbf{u}\\;\\mathbf{v}\\,]$ es lineal, así que existe un único $\\mathbf{p}$ con $\\det[\\,\\mathbf{x}\\;\\mathbf{u}\\;\\mathbf{v}\\,] = \\mathbf{p}\\cdot\\mathbf{x}$; se define $\\mathbf{u}\\times\\mathbf{v} = \\mathbf{p} = (u_2v_3-u_3v_2,\\ u_3v_1-u_1v_3,\\ u_1v_2-u_2v_1)$. Es bilineal y antisimétrico, $(\\mathbf{u}\\times\\mathbf{v})\\perp\\mathbf{u},\\mathbf{v}$, $\\lVert\\mathbf{u}\\times\\mathbf{v}\\rVert = \\lVert\\mathbf{u}\\rVert\\lVert\\mathbf{v}\\rVert\\sin\\theta$ (identidad de Lagrange: $\\lVert\\mathbf{u}\\times\\mathbf{v}\\rVert^2 = \\lVert\\mathbf{u}\\rVert^2\\lVert\\mathbf{v}\\rVert^2 - (\\mathbf{u}\\cdot\\mathbf{v})^2$), y $\\mathbf{u}\\times\\mathbf{v} = \\mathbf{0}$ si y solo si son paralelos. El producto mixto $(\\mathbf{u}\\times\\mathbf{v})\\cdot\\mathbf{w} = \\det[\\,\\mathbf{u}\\;\\mathbf{v}\\;\\mathbf{w}\\,]$ es el volumen con signo del paralelepípedo.</p>',
          en: '<p>For $\\mathbf{u},\\mathbf{v}\\in\\mathbb{R}^3$ the map $\\mathbf{x}\\mapsto\\det[\\,\\mathbf{x}\\;\\mathbf{u}\\;\\mathbf{v}\\,]$ is linear, so there is a unique $\\mathbf{p}$ with $\\det[\\,\\mathbf{x}\\;\\mathbf{u}\\;\\mathbf{v}\\,] = \\mathbf{p}\\cdot\\mathbf{x}$; we define $\\mathbf{u}\\times\\mathbf{v} = \\mathbf{p} = (u_2v_3-u_3v_2,\\ u_3v_1-u_1v_3,\\ u_1v_2-u_2v_1)$. It is bilinear and antisymmetric, $(\\mathbf{u}\\times\\mathbf{v})\\perp\\mathbf{u},\\mathbf{v}$, $\\lVert\\mathbf{u}\\times\\mathbf{v}\\rVert = \\lVert\\mathbf{u}\\rVert\\lVert\\mathbf{v}\\rVert\\sin\\theta$ (Lagrange’s identity: $\\lVert\\mathbf{u}\\times\\mathbf{v}\\rVert^2 = \\lVert\\mathbf{u}\\rVert^2\\lVert\\mathbf{v}\\rVert^2 - (\\mathbf{u}\\cdot\\mathbf{v})^2$), and $\\mathbf{u}\\times\\mathbf{v} = \\mathbf{0}$ if and only if they are parallel. The triple product $(\\mathbf{u}\\times\\mathbf{v})\\cdot\\mathbf{w} = \\det[\\,\\mathbf{u}\\;\\mathbf{v}\\;\\mathbf{w}\\,]$ is the signed volume of the parallelepiped.</p>',
        },
      },
    ],
  },

  challenges: [
    {
      id: 'cross6',
      title: { es: 'Un producto cruz vertical', en: 'A vertical cross product' },
      text: { es: 'Con $\\mathbf{u} = (2, 1, 0)$ fijo, elige $\\mathbf{v}$ para que $\\mathbf{u}\\times\\mathbf{v} = (0, 0, 6)$.', en: 'With $\\mathbf{u} = (2, 1, 0)$ fixed, choose $\\mathbf{v}$ so that $\\mathbf{u}\\times\\mathbf{v} = (0, 0, 6)$.' },
      hint: { es: '$\\mathbf{v}$ debe estar en el plano $z = 0$ (perpendicular a $(0,0,6)$) y el paralelogramo debe tener área $6$ con orientación positiva.', en: '$\\mathbf{v}$ must lie in the plane $z = 0$ (perpendicular to $(0,0,6)$) and the parallelogram must have area $6$ with positive orientation.' },
      setup: (store) => store.set({ mode: 'cross', cu: V([2, 1, 0]), cv: V([0, 1, 2]) }),
      check: (s, d) => s.mode === 'cross' && [2, 1, 0].every((x, i) => s.cu[i].x === x) && d.cross && [0, 0, 6].every((x, i) => Math.abs(d.F.toNumber(d.cross[i]) - x) < 1e-12),
    },
    {
      id: 'perp',
      title: { es: 'Perpendiculares', en: 'Perpendicular' },
      text: { es: 'En «Proyección», haz que $\\mathbf{u}$ y $\\mathbf{v}$ sean perpendiculares y no nulos, sin que ninguno esté sobre un eje.', en: 'In “Projection”, make $\\mathbf{u}$ and $\\mathbf{v}$ perpendicular and non-zero, neither of them on an axis.' },
      hint: { es: 'Si $\\mathbf{u} = (a, b)$, prueba $\\mathbf{v} = (-b, a)$.', en: 'If $\\mathbf{u} = (a, b)$, try $\\mathbf{v} = (-b, a)$.' },
      setup: (store) => store.set({ mode: 'dot', u: V([3, 1]), v: V([1, 2]) }),
      check: (s, d) => d.mode === 'dot' && Math.abs(d.dot) < 1e-9 && [s.u, s.v].every((w) => w.every((e) => Math.abs(e.x) > 1e-9)),
    },
    {
      id: 'shadow2',
      title: { es: 'Una sombra de longitud 2', en: 'A shadow of length 2' },
      text: { es: 'Con $\\mathbf{u} = (3, 4)$ fijo, mueve $\\mathbf{v}$ para que su proyección sobre $\\mathbf{u}$ mida exactamente $2$ y apunte en el sentido de $\\mathbf{u}$.', en: 'With $\\mathbf{u} = (3, 4)$ fixed, move $\\mathbf{v}$ so that its projection onto $\\mathbf{u}$ has length exactly $2$ and points along $\\mathbf{u}$.' },
      hint: { es: 'La longitud de la sombra es $(\\mathbf{u}\\cdot\\mathbf{v})/\\lVert\\mathbf{u}\\rVert$, y aquí $\\lVert\\mathbf{u}\\rVert = 5$.', en: 'The shadow’s length is $(\\mathbf{u}\\cdot\\mathbf{v})/\\lVert\\mathbf{u}\\rVert$, and here $\\lVert\\mathbf{u}\\rVert = 5$.' },
      setup: (store) => store.set({ mode: 'dot', u: V([3, 4]), v: V([1, 2]) }),
      check: (s, d) => d.mode === 'dot' && Math.abs(s.u[0].x - 3) < 1e-12 && Math.abs(s.u[1].x - 4) < 1e-12 && Math.abs(d.dot - 10) < 1e-9,
    },
    {
      id: 'collinear',
      title: { es: 'Residuo cero', en: 'Zero residual' },
      text: { es: 'En «Mínimos cuadrados», coloca los puntos para que el residuo sea exactamente $0$ con una recta de pendiente no nula.', en: 'In “Least squares”, place the points so that the residual is exactly $0$ with a line of non-zero slope.' },
      hint: { es: 'Los tres puntos deben estar alineados; entonces $\\mathbf{b}$ está en el plano.', en: 'The three points must be aligned; then $\\mathbf{b}$ lies in the plane.' },
      setup: (store) => store.set({ mode: 'ls', model: 'affine', pts: [[0, 1], [1, 3], [2, 2]] }),
      check: (s, d) => d.mode === 'ls' && s.model === 'affine' && d.e2 !== null && Math.abs(d.e2) < 1e-12 && Math.abs(d.coef[1]) > 1e-9,
    },
    {
      id: 'already',
      title: { es: 'Nada que restar', en: 'Nothing to subtract' },
      text: { es: 'En «Gram–Schmidt», elige tres vectores independientes, ninguno sobre un eje, para los que el algoritmo no cambie nada: $\\mathbf{w}_k = \\mathbf{v}_k$.', en: 'In “Gram–Schmidt”, choose three independent vectors, none on an axis, for which the algorithm changes nothing: $\\mathbf{w}_k = \\mathbf{v}_k$.' },
      hint: { es: 'Deben ser ortogonales dos a dos, por ejemplo $(1,1,0)$, $(1,-1,1)$, $(1,-1,-2)$.', en: 'They must be pairwise orthogonal, e.g. $(1,1,0)$, $(1,-1,1)$, $(1,-1,-2)$.' },
      setup: (store) => store.set({ mode: 'gs', W: M([[1, 1, 0], [1, 0, 1], [0, 1, 1]]), g: 4 }),
      check: (s, d) => d.mode === 'gs' && d.orthonormalInput && d.ws.every((w) => w.some((x) => !d.F.isZero(x)))
        && [0, 1, 2].every((j) => s.W.filter((row) => Math.abs(row[j].x) > 1e-12).length >= 2),
    },
  ],
});

// ---------------------------------------------------------------------------

function paren(t) { return t.startsWith('-') ? `(${t})` : t; }
function signed(t) { return t.startsWith('-') ? `- ${t.slice(1)}` : `+ ${t}`; }
function sub(k) { return '₀₁₂₃₄₅₆₇₈₉'[k] || k; }
function supN(n) { return { 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸' }[n] || `^${n}`; }
function floatField() { return FloatField(1e-10); }
function isOrthogonal(vs, F) {
  for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) if (!F.isZero(L.dot(vs[i], vs[j], F))) return false;
  return true;
}
