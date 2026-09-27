import { createLab } from '../ui/shell.js';
import { codec } from '../ui/store.js';
import { Plane2D } from '../ui/plane2d.js';
import { card, flagChip, readout, animator, selectBox, slider, button } from '../ui/controls.js';
import { h } from '../ui/dom.js';
import { tr, setText, setAttr } from '../ui/i18n.js';
import { compileFormula, describeParseError } from '../core/parse.js';
import { renderTex } from '../ui/tex.js';
import { texFloat, texMatrix, texVector, fmtDecimal, cls } from '../core/format.js';
import * as L from '../core/linalg.js';

const PRESETS = {
  shear: { label: { es: 'Lineal: cizalla (para comparar)', en: 'Linear: shear (for comparison)' }, f: (x, y) => [x + y, y], tex: 'T(x,y) = (x + y,\\; y)', f1: 'x + y', f2: 'y' },
  affine: { label: { es: 'Traslación (afín)', en: 'Translation (affine)' }, f: (x, y) => [x + 1.5, y + 1], tex: 'T(x,y) = (x + 1.5,\\; y + 1)', f1: 'x + 1.5', f2: 'y + 1' },
  quadratic: { label: { es: 'Término cuadrático', en: 'Quadratic term' }, f: (x, y) => [x, y + 0.2 * x * x], tex: 'T(x,y) = (x,\\; y + 0.2x^2)', f1: 'x', f2: 'y + 0.2x^2' },
  sine: { label: { es: 'Onda sinusoidal', en: 'Sine wave' }, f: (x, y) => [x, y + 1.5 * Math.sin(2 * x)], tex: 'T(x,y) = (x,\\; y + 1.5\\sin 2x)', f1: 'x', f2: 'y + 1.5 sin(2x)' },
  csq: { label: { es: 'Cuadrado complejo', en: 'Complex squaring' }, f: (x, y) => [0.2 * (x * x - y * y), 0.4 * x * y], tex: 'T(x,y) = 0.2\\,(x^2 - y^2,\\; 2xy)', f1: '0.2(x^2 - y^2)', f2: '0.4xy' },
  coupling: { label: { es: 'Acoplamiento sinusoidal', en: 'Sine coupling' }, f: (x, y) => [x + 0.8 * Math.sin(1.5 * y), y + 0.8 * Math.sin(1.5 * x)], tex: 'T(x,y) = (x + 0.8\\sin 1.5y,\\; y + 0.8\\sin 1.5x)', f1: 'x + 0.8 sin(1.5y)', f2: 'y + 0.8 sin(1.5x)' },
  swirl: {
    label: { es: 'Torbellino', en: 'Swirl' },
    f: (x, y) => { const a = 0.5 * Math.hypot(x, y), c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; },
    tex: 'T(\\mathbf{x}) = R_{\\alpha}\\mathbf{x},\\;\\; \\alpha = \\tfrac12\\lVert\\mathbf{x}\\rVert',
    f1: 'x cos(0.5 hypot(x,y)) - y sin(0.5 hypot(x,y))', f2: 'x sin(0.5 hypot(x,y)) + y cos(0.5 hypot(x,y))',
  },
  fold: { label: { es: 'Valor absoluto (pliegue)', en: 'Absolute value (fold)' }, f: (x, y) => [Math.abs(x), y], tex: 'T(x,y) = (|x|,\\; y)', f1: 'abs(x)', f2: 'y' },
  product: { label: { es: 'Producto de componentes', en: 'Product of components' }, f: (x, y) => [x, 0.5 * x * y], tex: 'T(x,y) = (x,\\; 0.5xy)', f1: 'x', f2: '0.5xy' },
  cexp: { label: { es: 'Exponencial compleja', en: 'Complex exponential' }, f: (x, y) => { const r = Math.exp(0.35 * x); return [r * Math.cos(0.5 * y), r * Math.sin(0.5 * y)]; }, tex: 'T(x,y) = e^{0.35x}(\\cos 0.5y,\\; \\sin 0.5y)', f1: 'exp(0.35x) cos(0.5y)', f2: 'exp(0.35x) sin(0.5y)' },
  custom: { label: { es: 'Personalizada…', en: 'Custom…' }, f: null, tex: null },
};

function jacobian(f, x, y) {
  const hs = 1e-5 * Math.max(1, Math.hypot(x, y));
  const fx1 = f(x + hs, y), fx0 = f(x - hs, y), fy1 = f(x, y + hs), fy0 = f(x, y - hs);
  return [
    [(fx1[0] - fx0[0]) / (2 * hs), (fy1[0] - fy0[0]) / (2 * hs)],
    [(fx1[1] - fx0[1]) / (2 * hs), (fy1[1] - fy0[1]) / (2 * hs)],
  ];
}

createLab({
  id: 'nl',
  lead: {
    es: 'Las transformaciones no lineales curvan la cuadrícula. Aun así, si te acercas lo suficiente a un punto, casi todas parecen lineales: esa aproximación es la matriz jacobiana.',
    en: 'Nonlinear maps bend the grid. Still, zoom in far enough around a point and almost all of them look linear: that approximation is the Jacobian matrix.',
  },
  state: {
    preset: { def: 'coupling', codec: codec.enum(Object.keys(PRESETS)) },
    f1: { def: 'x + 0.3 y^2', codec: codec.str(120) },
    f2: { def: 'y + 0.3 sin(x)', codec: codec.str(120) },
    t: { def: 1, codec: codec.num(0, 1) },
    p: { def: [1, 0.5], codec: codec.point() },
    u: { def: [[1, 0], [0, 1]], codec: codec.points() },
    r: { def: 0.6, codec: codec.num(0.05, 2) },
    show: { def: ['jac'], codec: codec.flags(['jac', 'test', 'basis']) },
  },

  build(ctx) {
    const { store } = ctx;
    const plane = new Plane2D(ctx.addView(), { range: 4.2 });
    const anim = animator({ store, key: 't', max: 1 });
    ctx.bar.append(anim.el);

    plane.addHandle({ id: 'p', color: 'accent', visible: () => store.get('show').includes('jac'), get: () => store.get('p'), set: (q) => store.set({ p: q }) });
    plane.addHandle({ id: 'u', color: 'v', visible: () => store.get('show').includes('test'), get: () => store.get('u')[0], set: (q) => store.set({ u: [q, store.get('u')[1]] }) });
    plane.addHandle({ id: 'w', color: 'w', visible: () => store.get('show').includes('test'), get: () => store.get('u')[1], set: (q) => store.set({ u: [store.get('u')[0], q] }) });

    // Panel ---------------------------------------------------------------------
    const presetSel = selectBox({
      options: Object.entries(PRESETS).map(([value, p]) => ({ value, label: p.label })),
      get: () => store.get('preset'), set: (preset) => {
        if (preset === 'custom' && store.get('preset') !== 'custom') {
          const cur = PRESETS[store.get('preset')];
          if (cur.f1) { store.set({ preset, f1: cur.f1, f2: cur.f2 }); return; }
        }
        store.set({ preset });
      },
      label: { es: 'Transformación', en: 'Transformation' },
    });
    const formula = h('div', { class: 'math-block' });
    const in1 = h('input', { class: 'input', type: 'text', spellcheck: 'false', autocomplete: 'off' });
    const in2 = h('input', { class: 'input', type: 'text', spellcheck: 'false', autocomplete: 'off' });
    setAttr(in1, 'aria-label', { es: 'Primera componente T₁(x, y)', en: 'First component T₁(x, y)' });
    setAttr(in2, 'aria-label', { es: 'Segunda componente T₂(x, y)', en: 'Second component T₂(x, y)' });
    in1.addEventListener('input', () => store.set({ f1: in1.value }));
    in2.addEventListener('input', () => store.set({ f2: in2.value }));
    const err = h('p', { class: 'c-danger', style: { margin: 0, fontSize: '13px' } });
    const customHelp = h('p');
    setText(customHelp, { es: 'Usa x, y, números, + − * / ^, sin, cos, tan, exp, ln, sqrt, abs, pi… Ejemplo: x + 0.3 y^2', en: 'Use x, y, numbers, + − * / ^, sin, cos, tan, exp, ln, sqrt, abs, pi… Example: x + 0.3 y^2' });
    const lab1 = h('label', { class: 'label', style: { textTransform: 'none' } }, 'T₁(x, y) ='), lab2 = h('label', { class: 'label', style: { textTransform: 'none' } }, 'T₂(x, y) =');
    const customBox = h('div', { class: 'card__body', style: { padding: 0 } }, h('div', { class: 'field' }, lab1, in1), h('div', { class: 'field' }, lab2, in2), err, customHelp);
    const tCard = card({ title: { es: 'Transformación', en: 'Transformation' }, body: [presetSel.el, formula, customBox] });

    const chips = [
      flagChip(store, 'show', 'jac', { es: 'Aproximación lineal (jacobiana)', en: 'Linear approximation (Jacobian)' }, 'var(--accent)'),
      flagChip(store, 'show', 'test', { es: 'Prueba de linealidad', en: 'Linearity test' }, 'var(--c-v)'),
      flagChip(store, 'show', 'basis', { es: 'Imágenes de î y ĵ', en: 'Images of î and ĵ' }, 'var(--c-i)'),
    ];
    const radius = slider({ label: { es: 'Radio de la lupa', en: 'Lens radius' }, min: 0.05, max: 2, step: 0.05, get: () => store.get('r'), set: (r) => store.set({ r }), format: (v) => v.toFixed(2) });
    const zoomBtn = button({
      label: { es: 'Acercarse a T(p)', en: 'Zoom into T(p)' }, iconName: 'target', small: true,
      onClick: () => {
        const T = currentMap();
        if (!T) return;
        const p = store.get('p');
        const q = T(p[0], p[1]);
        plane.view.cx = q[0]; plane.view.cy = q[1];
        plane.view.scale = Math.min(plane.opts.maxScale, 60 / Math.max(0.05, store.get('r')) * 2.5);
        plane.requestRender();
      },
    });
    const showCard = card({ title: { es: 'Explorar', en: 'Explore' }, body: [h('div', { class: 'chip-row' }, chips.map((c) => c.el)), radius.el, h('div', { class: 'row' }, zoomBtn)] });

    const r = {
      t0: readout(null, { labelTex: 'T(\\mathbf{0})' }),
      lin: readout({ es: 'Linealidad', en: 'Linearity' }, { block: true }),
      jac: readout({ es: 'Jacobiana', en: 'Jacobian' }, { block: true }),
      det: readout(null, { labelTex: '\\det J_T(\\mathbf{p})' }),
    };
    const resultsCard = card({ title: { es: 'Análisis numérico', en: 'Numerical analysis' }, body: [h('div', { class: 'readouts' }, Object.values(r).map((x) => x.el))] });
    ctx.panel.append(tCard.el, showCard.el, resultsCard.el);

    // Map --------------------------------------------------------------------------
    let custom = { key: '', fn: null, error: null };
    function currentMap() {
      const s = store.state;
      if (s.preset !== 'custom') return PRESETS[s.preset].f;
      const key = `${s.f1}|${s.f2}`;
      if (key !== custom.key) {
        const a = compileFormula(s.f1), b = compileFormula(s.f2);
        custom = { key, fn: a.ok && b.ok ? (x, y) => [a.fn(x, y), b.fn(x, y)] : null, error: a.ok ? (b.ok ? null : b.error) : a.error };
      }
      return custom.fn;
    }

    // Drawing ----------------------------------------------------------------------
    let cur = null;
    plane.setDraw((g) => {
      g.backgroundGrid();
      if (!cur || !cur.T) return;
      const { T, t, show, p, u, rad } = cur;
      const Tt = (x, y) => { const q = T(x, y); return [(1 - t) * x + t * q[0], (1 - t) * y + t * q[1]]; };
      const R = 10, N = 360;
      const fam = (fixedX) => {
        for (let i = -R; i <= R; i++) {
          const pts = [];
          for (let k = 0; k <= N; k++) {
            const s = -R + (2 * R * k) / N;
            pts.push(fixedX ? Tt(i, s) : Tt(s, i));
          }
          g.polyline(pts, { color: i === 0 ? g.c.axis : g.c.tgrid, width: i === 0 ? 2 : 1.4, alpha: i === 0 ? 0.9 : 0.85 });
        }
      };
      fam(true); fam(false);
      if (show.includes('basis')) {
        const seg = (e, color) => {
          const pts = [];
          for (let k = 0; k <= 40; k++) pts.push(Tt(e[0] * k / 40, e[1] * k / 40));
          g.polyline(pts, { color, width: 3.5 });
          const end = pts[pts.length - 1], prev = pts[pts.length - 3];
          g.arrow(prev, end, { color, width: 3.5, head: 13 });
        };
        seg([1, 0], g.c.i); seg([0, 1], g.c.j);
        g.point(Tt(0, 0), { color: g.c.axis, r: 4 });
      }
      if (show.includes('jac') && t > 0.999) {
        const J = jacobian(T, p[0], p[1]);
        const Tp = T(p[0], p[1]);
        const lin = (x, y) => { const d = [x - p[0], y - p[1]]; return [Tp[0] + J[0][0] * d[0] + J[0][1] * d[1], Tp[1] + J[1][0] * d[0] + J[1][1] * d[1]]; };
        const n = 4;
        for (let i = -n; i <= n; i++) {
          const a = (i / n) * rad;
          const curveV = [], curveH = [], linV = [], linH = [];
          for (let k = 0; k <= 30; k++) {
            const b = -rad + (2 * rad * k) / 30;
            curveV.push(T(p[0] + a, p[1] + b)); curveH.push(T(p[0] + b, p[1] + a));
            linV.push(lin(p[0] + a, p[1] + b)); linH.push(lin(p[0] + b, p[1] + a));
          }
          g.polyline(linV, { color: g.c.accent, width: 1.5, dash: [4, 4], alpha: 0.9 });
          g.polyline(linH, { color: g.c.accent, width: 1.5, dash: [4, 4], alpha: 0.9 });
          g.polyline(curveV, { color: g.c.accent, width: 2, alpha: 0.9 });
          g.polyline(curveH, { color: g.c.accent, width: 2, alpha: 0.9 });
        }
        // The small square around p in the domain, faint.
        g.polygon([[p[0] - rad, p[1] - rad], [p[0] + rad, p[1] - rad], [p[0] + rad, p[1] + rad], [p[0] - rad, p[1] + rad]], { stroke: g.c.accent, width: 1, alpha: 0.35, dash: [3, 4] });
        g.point(Tp, { color: g.c.accent, r: 5 });
        g.text(Tp, 'T(p)', { color: g.c.accent, offset: [10, 14], weight: 600 });
        g.text(p, 'p', { color: g.c.accent, offset: [12, -12], weight: 600 });
      }
      if (show.includes('test') && t > 0.999) {
        const [a, b] = u;
        const Ta = T(...a), Tb = T(...b), Tab = T(a[0] + b[0], a[1] + b[1]);
        const sum = [Ta[0] + Tb[0], Ta[1] + Tb[1]];
        g.arrow([0, 0], a, { color: g.c.v, width: 2, alpha: 0.35, dash: [5, 4] });
        g.arrow([0, 0], b, { color: g.c.w, width: 2, alpha: 0.35, dash: [5, 4] });
        g.arrow([0, 0], Ta, { color: g.c.v, width: 3 });
        g.arrow([0, 0], Tb, { color: g.c.w, width: 3 });
        g.polyline([Ta, sum, Tb], { color: g.c.muted, width: 1.5, dash: [4, 4] });
        g.point(sum, { color: g.c.text, r: 5 });
        g.text(sum, 'T(u)+T(w)', { color: g.c.text, offset: [10, -12], size: 11 });
        g.point(Tab, { color: g.c.ker, r: 5 });
        g.text(Tab, 'T(u+w)', { color: g.c.ker, offset: [10, 14], size: 11 });
        g.text(Ta, 'T(u)', { color: g.c.v, offset: [8, -12], size: 11 });
        g.text(Tb, 'T(w)', { color: g.c.w, offset: [8, -12], size: 11 });
      }
    });

    function render(state) {
      const T = currentMap();
      cur = { T, t: state.t, show: state.show, p: state.p, u: state.u, rad: state.r };
      plane.requestRender();
      presetSel.update(); anim.update(); radius.update();
      chips.forEach((c) => c.update());
      const isCustom = state.preset === 'custom';
      customBox.hidden = !isCustom;
      if (document.activeElement !== in1) in1.value = state.f1;
      if (document.activeElement !== in2) in2.value = state.f2;
      err.textContent = isCustom && custom.error ? tr(describeParseError(custom.error)) : '';
      formula.hidden = isCustom;
      if (!isCustom) renderTex(formula, PRESETS[state.preset].tex, { display: true });
      if (!T) {
        r.t0.set('\\text{—}'); r.lin.set('\\text{—}'); r.jac.set('\\text{—}'); r.det.set('\\text{—}');
        return { ok: false };
      }
      const T0 = T(0, 0);
      const zero = Math.hypot(...T0) < 1e-9;
      r.t0.set(texVector(T0.map((x) => clean(x))), zero ? null : { es: 'T(0) ≠ 0: una transformación lineal siempre fija el origen, así que T no es lineal.', en: 'T(0) ≠ 0: a linear map always fixes the origin, so T is not linear.' });
      // Numerical linearity test on a fixed set of points (plus the handles).
      const test = linearityDefect(T, state.u);
      r.lin.set({ html: `<span class="badge ${test.linear ? 'badge--ok' : 'badge--warn'}">${tr(test.linear ? { es: 'Supera la prueba: parece lineal', en: 'Passes the test: looks linear' } : { es: 'No es lineal', en: 'Not linear' })}</span>` },
        state.show.includes('test')
          ? { es: `‖T(u+w) − T(u) − T(w)‖ = ${fmtDecimal(test.add, 4)},  ‖T(2u) − 2T(u)‖ = ${fmtDecimal(test.hom, 4)}`, en: `‖T(u+w) − T(u) − T(w)‖ = ${fmtDecimal(test.add, 4)},  ‖T(2u) − 2T(u)‖ = ${fmtDecimal(test.hom, 4)}` }
          : { es: 'Activa «Prueba de linealidad» para comparar T(u + w) con T(u) + T(w).', en: 'Turn on “Linearity test” to compare T(u + w) with T(u) + T(w).' });
      const pp = state.p;
      const J = jacobian(T, pp[0], pp[1]);
      const Jc = J.map((row) => row.map(clean));
      r.jac.set(`J_T\\!\\left(${texVector(pp.map(clean))}\\right) \\approx ${texMatrix(Jc, { digits: 3 })}`, { es: 'Derivadas parciales por diferencias centradas. Cerca de p: T(p + h) ≈ T(p) + J h.', en: 'Partial derivatives by central differences. Near p: T(p + h) ≈ T(p) + J h.' });
      const d = L.det2(J);
      r.det.set(texFloat(clean(d), { digits: 3 }), Math.abs(d) < 1e-6
        ? { es: 'det J ≈ 0: cerca de p la transformación aplasta el área.', en: 'det J ≈ 0: near p the map squashes area.' }
        : d < 0 ? { es: `Cerca de p multiplica las áreas por ≈ ${fmtDecimal(Math.abs(d), 3)} e invierte la orientación.`, en: `Near p it multiplies areas by ≈ ${fmtDecimal(Math.abs(d), 3)} and reverses orientation.` }
          : { es: `Cerca de p multiplica las áreas por ≈ ${fmtDecimal(d, 3)}.`, en: `Near p it multiplies areas by ≈ ${fmtDecimal(d, 3)}.` });

      ctx.setLegend([
        { color: 'var(--tgrid)', label: { es: 'imagen de la cuadrícula', en: 'image of the grid' } },
        state.show.includes('jac') && { color: 'var(--accent)', label: { es: 'T cerca de p (continua) y su aproximación lineal (discontinua)', en: 'T near p (solid) and its linear approximation (dashed)' } },
        state.show.includes('test') && { color: 'var(--c-ker)', label: { es: 'T(u + w)', en: 'T(u + w)' } },
        state.show.includes('basis') && { color: 'var(--c-i)', label: { es: 'imagen del segmento [0, î]', en: 'image of the segment [0, î]' } },
      ]);
      return { ok: true, T, J, det: d, linear: test.linear, T0 };
    }

    return { render, snapshot: () => plane.snapshot(), togglePlay: () => anim.toggle(), onReset: () => { anim.pause(); plane.resetView(); } };
  },

  learn: {
    what: {
      es: `<p>Aquí la cuadrícula azul es la imagen de la cuadrícula original bajo una transformación $T:\\mathbb{R}^2\\to\\mathbb{R}^2$ que <strong>no</strong> es lineal: las líneas se curvan, dejan de estar igualmente espaciadas o el origen se mueve. Es el contraste con los demás módulos: una transformación es lineal exactamente cuando la cuadrícula sigue siendo recta, paralela, equiespaciada y con el origen fijo.</p>
<p>La <strong>prueba de linealidad</strong> compara $T(\\mathbf{u}+\\mathbf{w})$ con $T(\\mathbf{u})+T(\\mathbf{w})$ para los puntos que arrastres (y para una batería fija de puntos). Si alguna vez difieren, $T$ no es lineal.</p>
<p>La <strong>aproximación lineal</strong> dibuja, alrededor de $T(\\mathbf{p})$, la imagen de un pequeño cuadrado centrado en $\\mathbf{p}$ (curvas continuas) junto a su imagen por la aproximación afín $T(\\mathbf{p}) + J_T(\\mathbf{p})(\\mathbf{x}-\\mathbf{p})$ (líneas discontinuas). Reduce el radio o pulsa «Acercarse a T(p)»: cuanto más pequeño es el cuadrado, más se parecen. Por eso el cálculo en varias variables se apoya en el álgebra lineal: localmente, casi todo es una matriz.</p>`,
      en: `<p>Here the blue grid is the image of the original grid under a map $T:\\mathbb{R}^2\\to\\mathbb{R}^2$ that is <strong>not</strong> linear: lines bend, stop being evenly spaced, or the origin moves. This is the contrast with the other modules: a map is linear exactly when the grid stays straight, parallel, evenly spaced and the origin stays fixed.</p>
<p>The <strong>linearity test</strong> compares $T(\\mathbf{u}+\\mathbf{w})$ with $T(\\mathbf{u})+T(\\mathbf{w})$ for the points you drag (and for a fixed battery of points). If they ever differ, $T$ is not linear.</p>
<p>The <strong>linear approximation</strong> draws, around $T(\\mathbf{p})$, the image of a small square centred at $\\mathbf{p}$ (solid curves) next to its image under the affine approximation $T(\\mathbf{p}) + J_T(\\mathbf{p})(\\mathbf{x}-\\mathbf{p})$ (dashed lines). Shrink the radius or press “Zoom into T(p)”: the smaller the square, the more alike they look. That is why multivariable calculus rests on linear algebra: locally, almost everything is a matrix.</p>`,
    },
    prompts: {
      es: [
        'Compara «Lineal: cizalla» con «Traslación». La traslación deja la cuadrícula recta y equiespaciada; ¿qué propiedad de las transformaciones lineales viola?',
        'En «Cuadrado complejo», lleva $\\mathbf{p}$ al origen. ¿Qué le pasa a la aproximación lineal? Mira $\\det J$.',
        'En «Torbellino», mueve $\\mathbf{p}$ a varios sitios. ¿Cambia $\\det J$? ¿Qué significa eso para las áreas?',
        'En «Valor absoluto», coloca $\\mathbf{p}$ justo en el eje $y$. ¿Por qué la aproximación lineal falla allí?',
        'Elige «Personalizada» y escribe una fórmula lineal (por ejemplo $2x - y$, $x + 3y$). ¿Pasa la prueba de linealidad? ¿Qué relación tiene su jacobiana con la matriz de la transformación?',
      ],
      en: [
        'Compare “Linear: shear” with “Translation”. The translation keeps the grid straight and evenly spaced; which property of linear maps does it break?',
        'In “Complex squaring”, move $\\mathbf{p}$ to the origin. What happens to the linear approximation? Look at $\\det J$.',
        'In “Swirl”, move $\\mathbf{p}$ around. Does $\\det J$ change? What does that mean for areas?',
        'In “Absolute value”, put $\\mathbf{p}$ right on the $y$-axis. Why does the linear approximation fail there?',
        'Pick “Custom” and type a linear formula (e.g. $2x - y$, $x + 3y$). Does it pass the linearity test? How is its Jacobian related to the matrix of the map?',
      ],
    },
    formal: [
      {
        kind: 'definition',
        title: { es: 'Linealidad', en: 'Linearity' },
        body: {
          es: '<p>$T$ es lineal si $T(\\mathbf{u}+\\mathbf{w}) = T(\\mathbf{u}) + T(\\mathbf{w})$ y $T(c\\mathbf{u}) = cT(\\mathbf{u})$ para todos los vectores y escalares. En particular $T(\\mathbf{0}) = \\mathbf{0}$. Las transformaciones $\\mathbf{x}\\mapsto A\\mathbf{x} + \\mathbf{b}$ con $\\mathbf{b}\\neq\\mathbf{0}$ se llaman <strong>afines</strong>: conservan rectas y paralelismo, pero no son lineales.</p>',
          en: '<p>$T$ is linear if $T(\\mathbf{u}+\\mathbf{w}) = T(\\mathbf{u}) + T(\\mathbf{w})$ and $T(c\\mathbf{u}) = cT(\\mathbf{u})$ for all vectors and scalars. In particular $T(\\mathbf{0}) = \\mathbf{0}$. Maps $\\mathbf{x}\\mapsto A\\mathbf{x} + \\mathbf{b}$ with $\\mathbf{b}\\neq\\mathbf{0}$ are called <strong>affine</strong>: they preserve lines and parallelism, but are not linear.</p>',
        },
      },
      {
        kind: 'definition',
        title: { es: 'Diferenciabilidad y matriz jacobiana', en: 'Differentiability and the Jacobian matrix' },
        body: {
          es: '<p>$T$ es diferenciable en $\\mathbf{p}$ si existe una transformación lineal $L$ con $$\\lim_{\\mathbf{h}\\to\\mathbf{0}}\\frac{\\lVert T(\\mathbf{p}+\\mathbf{h}) - T(\\mathbf{p}) - L\\mathbf{h}\\rVert}{\\lVert\\mathbf{h}\\rVert} = 0.$$ Su matriz es la jacobiana $J_T(\\mathbf{p}) = \\left[\\dfrac{\\partial T_i}{\\partial x_j}(\\mathbf{p})\\right]$. Si $T(\\mathbf{x}) = A\\mathbf{x}$ es lineal, $J_T(\\mathbf{p}) = A$ en todo punto.</p>',
          en: '<p>$T$ is differentiable at $\\mathbf{p}$ if there is a linear map $L$ with $$\\lim_{\\mathbf{h}\\to\\mathbf{0}}\\frac{\\lVert T(\\mathbf{p}+\\mathbf{h}) - T(\\mathbf{p}) - L\\mathbf{h}\\rVert}{\\lVert\\mathbf{h}\\rVert} = 0.$$ Its matrix is the Jacobian $J_T(\\mathbf{p}) = \\left[\\dfrac{\\partial T_i}{\\partial x_j}(\\mathbf{p})\\right]$. If $T(\\mathbf{x}) = A\\mathbf{x}$ is linear, $J_T(\\mathbf{p}) = A$ at every point.</p>',
        },
      },
      {
        kind: 'theorem',
        title: { es: 'Cambio de variables y función inversa', en: 'Change of variables and inverse function' },
        body: {
          es: '<p>$|\\det J_T(\\mathbf{p})|$ es el factor local de cambio de área: $\\operatorname{área}(T(S))\\approx|\\det J_T(\\mathbf{p})|\\operatorname{área}(S)$ para regiones $S$ pequeñas alrededor de $\\mathbf{p}$ (base de la fórmula de cambio de variables en integrales dobles). Si $T$ es $C^1$ y $\\det J_T(\\mathbf{p})\\neq 0$, el teorema de la función inversa garantiza que $T$ es invertible cerca de $\\mathbf{p}$.</p>',
          en: '<p>$|\\det J_T(\\mathbf{p})|$ is the local area factor: $\\operatorname{area}(T(S))\\approx|\\det J_T(\\mathbf{p})|\\operatorname{area}(S)$ for small regions $S$ around $\\mathbf{p}$ (the basis of the change-of-variables formula for double integrals). If $T$ is $C^1$ and $\\det J_T(\\mathbf{p})\\neq 0$, the inverse function theorem guarantees that $T$ is invertible near $\\mathbf{p}$.</p>',
        },
      },
    ],
  },

  challenges: [
    {
      id: 'collapse',
      title: { es: 'Donde el área desaparece', en: 'Where area vanishes' },
      text: { es: 'En «Cuadrado complejo», encuentra un punto $\\mathbf{p}$ con $\\det J_T(\\mathbf{p}) = 0$.', en: 'In “Complex squaring”, find a point $\\mathbf{p}$ with $\\det J_T(\\mathbf{p}) = 0$.' },
      hint: { es: '$\\det J = 0.16\\,(x^2+y^2)$.', en: '$\\det J = 0.16\\,(x^2+y^2)$.' },
      setup: (store) => store.set({ preset: 'csq', p: [1, 1], show: ['jac'], t: 1 }),
      check: (s, d) => s.preset === 'csq' && d.ok && Math.abs(d.det) < 1e-6,
    },
    {
      id: 'x4',
      title: { es: 'Cuadruplica el área', en: 'Quadruple the area' },
      text: { es: 'En «Cuadrado complejo», mueve $\\mathbf{p}$ a un punto donde $T$ multiplique localmente las áreas por 4.', en: 'In “Complex squaring”, move $\\mathbf{p}$ to a point where $T$ locally multiplies areas by 4.' },
      hint: { es: '¿A qué distancia del origen ocurre? Hay toda una circunferencia de soluciones.', en: 'At what distance from the origin does it happen? There is a whole circle of solutions.' },
      setup: (store) => store.set({ preset: 'csq', p: [1, 1], show: ['jac'], t: 1 }),
      check: (s, d) => s.preset === 'csq' && d.ok && Math.abs(d.det - 4) < 0.05,
    },
    {
      id: 'flip',
      title: { es: 'Orientación invertida', en: 'Reversed orientation' },
      text: { es: 'En «Acoplamiento sinusoidal», encuentra un punto donde $T$ invierta localmente la orientación.', en: 'In “Sine coupling”, find a point where $T$ locally reverses orientation.' },
      hint: { es: '$\\det J = 1 - 1.44\\cos(1.5x)\\cos(1.5y)$. Prueba cerca del origen.', en: '$\\det J = 1 - 1.44\\cos(1.5x)\\cos(1.5y)$. Try near the origin.' },
      setup: (store) => store.set({ preset: 'coupling', p: [1, 0], show: ['jac'], t: 1 }),
      check: (s, d) => s.preset === 'coupling' && d.ok && d.det < 0,
    },
    {
      id: 'linear',
      title: { es: 'Escribe una lineal', en: 'Write a linear one' },
      text: { es: 'Con «Personalizada», escribe una transformación lineal no nula que pase la prueba de linealidad.', en: 'With “Custom”, type a non-zero linear map that passes the linearity test.' },
      hint: { es: 'Cada componente debe ser de la forma $ax + by$.', en: 'Each component must look like $ax + by$.' },
      setup: (store) => store.set({ preset: 'custom', f1: 'x + 0.3 y^2', f2: 'y + 0.3 sin(x)' }),
      check: (s, d) => s.preset === 'custom' && d.ok && d.linear && Math.hypot(...d.J.flat()) > 1e-6,
    },
  ],
});

function clean(x) { return Math.abs(x) < 1e-9 ? 0 : Math.round(x * 1e6) / 1e6; }

function linearityDefect(T, handles) {
  const pts = [[1, 0.5], [-0.7, 1.3], [2, -1], [0.3, -2.2], ...(handles || [])];
  let add = 0, hom = 0;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j];
      const lhs = T(a[0] + b[0], a[1] + b[1]);
      const ta = T(...a), tb = T(...b);
      add = Math.max(add, Math.hypot(lhs[0] - ta[0] - tb[0], lhs[1] - ta[1] - tb[1]));
    }
    const a = pts[i], ta = T(...a);
    for (const c of [2, -1.5]) {
      const lhs = T(c * a[0], c * a[1]);
      hom = Math.max(hom, Math.hypot(lhs[0] - c * ta[0], lhs[1] - c * ta[1]));
    }
  }
  // Report the defect for the dragged handles themselves.
  const [u, w] = handles || [[1, 0], [0, 1]];
  const lhs = T(u[0] + w[0], u[1] + w[1]), tu = T(...u), tw = T(...w), t2 = T(2 * u[0], 2 * u[1]);
  return {
    linear: add < 1e-9 && hom < 1e-9,
    add: Math.hypot(lhs[0] - tu[0] - tw[0], lhs[1] - tu[1] - tw[1]),
    hom: Math.hypot(t2[0] - 2 * tu[0], t2[1] - 2 * tu[1]),
  };
}
