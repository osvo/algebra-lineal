// Interactive 2D plane on a <canvas>: HiDPI, responsive, pan & zoom (wheel with
// Ctrl/⌘ or after focusing, pinch on touch), draggable handles with snapping,
// keyboard control, theme-aware colours and a small drawing API in world units.

import { h, icon, clamp } from './dom.js';
import { setAttr, tr, onLangChange } from './i18n.js';
import { onThemeChange } from './theme.js';

const COLOR_VARS = {
  bg: '--canvas-bg', grid: '--grid', gridMajor: '--grid-major', tgrid: '--tgrid', axis: '--axis', label: '--label',
  i: '--c-i', j: '--c-j', k: '--c-k', v: '--c-v', w: '--c-w', eig: '--c-eig', ker: '--c-ker', img: '--c-img',
  det: '--c-det', detNeg: '--c-det-neg', row1: '--c-row1', row2: '--c-row2', row3: '--c-row3', sol: '--c-sol', res: '--c-res',
  accent: '--accent', muted: '--muted', text: '--text', line: '--line', surface: '--surface', coral: '--coral',
};

const MATH_FONT = '"KaTeX_Math", "Times New Roman", serif';
const MAIN_FONT = '"KaTeX_Main", "Times New Roman", serif';
const MONO_FONT = '"IBM Plex Mono", ui-monospace, monospace';

let fontsRequested = false;
function requestMathFonts() {
  if (fontsRequested || !document.fonts) return Promise.resolve();
  fontsRequested = true;
  return Promise.all([
    document.fonts.load(`italic 18px KaTeX_Math`),
    document.fonts.load(`18px KaTeX_Main`),
    document.fonts.load(`12px "IBM Plex Mono"`),
  ]).catch(() => {});
}

export class Plane2D {
  constructor(container, { range = 4.5, fitWidth = null, center = [0, 0], pan = true, zoom = true, title = null, ariaLabel = null, minScale = 6, maxScale = 800 } = {}) {
    this.container = container;
    container.classList.add('view');
    container.tabIndex = 0;
    setAttr(container, 'role', { es: 'application', en: 'application' });
    setAttr(container, 'aria-label', ariaLabel || {
      es: 'Plano interactivo. Arrastra los puntos marcados; con el foco aquí usa las flechas para moverlos, [ y ] para cambiar de punto, + y − para acercar.',
      en: 'Interactive plane. Drag the marked points; with focus here use the arrow keys to move them, [ and ] to switch point, + and − to zoom.',
    });
    this.canvas = h('canvas');
    container.append(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.opts = { range, fitWidth, center, pan, zoom, minScale, maxScale };
    this.unsubs = [];
    this.view = { cx: center[0], cy: center[1], scale: 60 };
    this.fitted = false;
    this.handles = [];
    this.selected = 0;
    this.drag = null;
    this.pointers = new Map();
    this.drawFn = null;
    this.c = {};
    this.w = 1; this.h = 1; this.dpr = 1;
    this.frame = null;

    if (title) {
      const t = h('div', { class: 'view__title' });
      container.append(t);
      const upd = () => { t.textContent = tr(title); };
      upd(); this.unsubs.push(onLangChange(upd));
    }
    this.hint = h('div', { class: 'view__hint', hidden: true });
    container.append(this.hint);

    if (zoom || pan) {
      const tools = h('div', { class: 'view__tools' });
      const mk = (name, label, fn) => {
        const b = h('button', { type: 'button', class: 'icon-btn' }, icon(name));
        setAttr(b, 'aria-label', label); setAttr(b, 'title', label);
        b.addEventListener('click', fn);
        tools.append(b);
      };
      if (zoom) {
        mk('plus', { es: 'Acercar', en: 'Zoom in' }, () => this.zoomBy(1.25));
        mk('minus', { es: 'Alejar', en: 'Zoom out' }, () => this.zoomBy(0.8));
      }
      mk('target', { es: 'Encuadre inicial', en: 'Reset view' }, () => this.resetView());
      container.append(tools);
    }

    this.readColors();
    this.bindEvents();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.unsubs.push(onThemeChange(() => { this.readColors(); this.render(); }));
    requestMathFonts().then(() => this.requestRender());
  }

  dispose() {
    this.ro.disconnect();
    cancelAnimationFrame(this.frame);
    this.unsubs.forEach((u) => u());
    this.drawFn = null;
    this.container.replaceChildren();
  }

  readColors() {
    const cs = getComputedStyle(this.container);
    for (const [k, v] of Object.entries(COLOR_VARS)) this.c[k] = cs.getPropertyValue(v).trim() || '#888';
  }

  resize() {
    const r = this.container.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const hh = Math.max(1, Math.round(r.height));
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    if (w === this.w && hh === this.h && dpr === this.dpr && this.fitted) return;
    this.w = w; this.h = hh; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(hh * dpr);
    if (!this.fitted) { this.fit(); this.fitted = true; }
    this.render();
  }

  fit() {
    const { range, center, fitWidth } = this.opts;
    this.view.cx = center[0]; this.view.cy = center[1];
    this.view.scale = fitWidth ? this.w / (2 * fitWidth) : Math.min(this.h, this.w * 0.75) / (2 * range);
  }

  resetView() { this.fit(); this.requestRender(); }

  zoomBy(f, sx = this.w / 2, sy = this.h / 2) {
    const [wx, wy] = this.toWorld(sx, sy);
    const s = clamp(this.view.scale * f, this.opts.minScale, this.opts.maxScale);
    this.view.scale = s;
    // Keep the world point under the cursor fixed.
    this.view.cx = wx - (sx - this.w / 2) / s;
    this.view.cy = wy + (sy - this.h / 2) / s;
    this.requestRender();
  }

  toScreen(x, y) { return [this.w / 2 + (x - this.view.cx) * this.view.scale, this.h / 2 - (y - this.view.cy) * this.view.scale]; }
  toWorld(sx, sy) { return [this.view.cx + (sx - this.w / 2) / this.view.scale, this.view.cy - (sy - this.h / 2) / this.view.scale]; }
  bounds() {
    const [x0, y1] = this.toWorld(0, 0);
    const [x1, y0] = this.toWorld(this.w, this.h);
    return { xmin: x0, xmax: x1, ymin: y0, ymax: y1 };
  }

  setDraw(fn) { this.drawFn = fn; this.requestRender(); }

  /** handle: { id, get() → [x,y], set([x,y]), color: key of this.c, visible() → bool, label } */
  addHandle(handle) { this.handles.push({ visible: () => true, ...handle }); return handle; }
  clearHandles() { this.handles = []; this.selected = 0; }

  requestRender() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = null; this.render(); });
  }

  render() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = this.c.bg;
    ctx.fillRect(0, 0, this.w, this.h);
    const g = new Graphics(this);
    if (this.drawFn) this.drawFn(g);
    // Handles on top.
    const focused = document.activeElement === this.container;
    this.visibleHandles().forEach((hd, idx) => {
      const p = hd.get();
      g.handle(p, this.c[hd.color] || hd.color, { active: this.drag && this.drag.handle === hd, selected: focused && idx === this.selected });
    });
  }

  visibleHandles() { return this.handles.filter((hd) => hd.visible()); }

  // -------------------------------------------------------------------------
  // Interaction
  // -------------------------------------------------------------------------

  snap(v, free = false) {
    const px = this.view.scale;
    if (free) return Math.round(v * 100) / 100;
    const ri = Math.round(v);
    if (Math.abs(v - ri) * px < 8) return ri;
    const rh = Math.round(v * 2) / 2;
    if (Math.abs(v - rh) * px < 6) return rh;
    const res = px >= 160 ? 0.05 : px >= 36 ? 0.1 : px >= 14 ? 0.5 : 1;
    return Math.round(Math.round(v / res) * res * 1e6) / 1e6;
  }

  hitHandle(sx, sy, touch) {
    const radius = touch ? 26 : 16;
    let best = null, bestD = radius;
    for (const hd of this.visibleHandles()) {
      const [px, py] = this.toScreen(...hd.get());
      const d = Math.hypot(px - sx, py - sy);
      if (d <= bestD) { bestD = d; best = hd; }
    }
    return best;
  }

  localPoint(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  bindEvents() {
    const cv = this.canvas;
    cv.addEventListener('pointerdown', (e) => {
      const [sx, sy] = this.localPoint(e);
      this.pointers.set(e.pointerId, [sx, sy]);
      cv.setPointerCapture(e.pointerId);
      if (this.pointers.size === 2) {
        // Pinch start: cancel any drag.
        this.drag = { type: 'pinch', start: this.pinchState() };
        return;
      }
      const hd = this.hitHandle(sx, sy, e.pointerType === 'touch');
      if (hd) {
        this.drag = { type: 'handle', handle: hd };
        this.selected = this.visibleHandles().indexOf(hd);
        cv.style.cursor = 'grabbing';
        this.requestRender();
      } else if (this.opts.pan) {
        this.drag = { type: 'pan', sx, sy, cx: this.view.cx, cy: this.view.cy };
        cv.style.cursor = 'grabbing';
      }
    });
    cv.addEventListener('pointermove', (e) => {
      const [sx, sy] = this.localPoint(e);
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, [sx, sy]);
      if (!this.drag) {
        cv.style.cursor = this.hitHandle(sx, sy, false) ? 'grab' : (this.opts.pan ? 'move' : 'default');
        return;
      }
      if (this.drag.type === 'handle') {
        const [wx, wy] = this.toWorld(sx, sy);
        const free = e.altKey;
        const hd = this.drag.handle;
        hd.set(hd.snap ? hd.snap([wx, wy], free, this) : [this.snap(wx, free), this.snap(wy, free)]);
      } else if (this.drag.type === 'pan') {
        this.view.cx = this.drag.cx - (sx - this.drag.sx) / this.view.scale;
        this.view.cy = this.drag.cy + (sy - this.drag.sy) / this.view.scale;
        this.requestRender();
      } else if (this.drag.type === 'pinch' && this.pointers.size === 2) {
        const now = this.pinchState();
        const start = this.drag.start;
        const f = now.dist / Math.max(1, start.dist);
        this.view.scale = clamp(start.scale * f, this.opts.minScale, this.opts.maxScale);
        this.view.cx = start.wx - (now.mx - this.w / 2) / this.view.scale;
        this.view.cy = start.wy + (now.my - this.h / 2) / this.view.scale;
        this.requestRender();
      }
    });
    const end = (e) => {
      this.pointers.delete(e.pointerId);
      if (this.drag && this.drag.type === 'pinch' && this.pointers.size === 1) { this.drag = null; }
      else if (this.pointers.size === 0) this.drag = null;
      cv.style.cursor = '';
      this.requestRender();
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('lostpointercapture', (e) => { if (this.pointers.has(e.pointerId)) end(e); });

    cv.addEventListener('wheel', (e) => {
      if (!this.opts.zoom) return;
      const allowed = e.ctrlKey || e.metaKey || document.activeElement === this.container;
      if (!allowed) { this.flashHint({ es: 'Ctrl + rueda (o haz clic en el lienzo) para hacer zoom', en: 'Ctrl + wheel (or click the canvas) to zoom' }); return; }
      e.preventDefault();
      const [sx, sy] = this.localPoint(e);
      this.zoomBy(Math.exp(-e.deltaY * 0.0015), sx, sy);
    }, { passive: false });

    cv.addEventListener('pointerdown', () => { if (document.activeElement !== this.container) this.container.focus({ preventScroll: true }); });

    this.container.addEventListener('keydown', (e) => {
      if (e.target !== this.container) return;
      const hs = this.visibleHandles();
      if (e.key === '+' || e.key === '=') { this.zoomBy(1.2); e.preventDefault(); return; }
      if (e.key === '-' || e.key === '_') { this.zoomBy(1 / 1.2); e.preventDefault(); return; }
      if (e.key === '0') { this.resetView(); e.preventDefault(); return; }
      if (!hs.length) return;
      if (e.key === ']' || e.key === '[') {
        this.selected = (this.selected + (e.key === ']' ? 1 : hs.length - 1)) % hs.length;
        this.requestRender(); e.preventDefault(); return;
      }
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
      if (!d) return;
      e.preventDefault();
      const hd = hs[Math.min(this.selected, hs.length - 1)];
      const step = e.shiftKey ? 1 : 0.1;
      const [x, y] = hd.get();
      hd.set([Math.round((x + d[0] * step) * 1e6) / 1e6, Math.round((y + d[1] * step) * 1e6) / 1e6]);
    });
    this.container.addEventListener('focus', () => this.requestRender());
    this.container.addEventListener('blur', () => this.requestRender());
  }

  pinchState() {
    const [a, b] = [...this.pointers.values()];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const [wx, wy] = this.toWorld(mx, my);
    return { dist: Math.hypot(a[0] - b[0], a[1] - b[1]), mx, my, wx, wy, scale: this.view.scale };
  }

  flashHint(text) {
    this.hint.textContent = tr(text);
    this.hint.hidden = false;
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => { this.hint.hidden = true; }, 1600);
  }

  snapshot() { this.render(); return this.canvas; }
}

// ---------------------------------------------------------------------------
// Drawing API (world coordinates, pixel-constant stroke widths)
// ---------------------------------------------------------------------------

export class Graphics {
  constructor(plane) {
    this.p = plane;
    this.ctx = plane.ctx;
    this.c = plane.c;
  }

  S(x, y) { return this.p.toScreen(x, y); }

  style({ color = this.c.axis, width = 2, dash = null, alpha = 1, cap = 'round' } = {}) {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = cap;
    ctx.lineJoin = 'round';
    ctx.globalAlpha = alpha;
    ctx.setLineDash(dash || []);
  }

  reset() { const ctx = this.ctx; ctx.globalAlpha = 1; ctx.setLineDash([]); }

  line(a, b, opts = {}) {
    this.style(opts);
    const ctx = this.ctx;
    ctx.beginPath(); ctx.moveTo(...this.S(...a)); ctx.lineTo(...this.S(...b)); ctx.stroke();
    this.reset();
  }

  polyline(points, opts = {}) {
    if (points.length < 2) return;
    this.style(opts);
    const ctx = this.ctx;
    ctx.beginPath();
    let moved = false;
    for (const pt of points) {
      if (!pt || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) { moved = false; continue; }
      const [sx, sy] = this.S(...pt);
      if (!moved) { ctx.moveTo(sx, sy); moved = true; } else ctx.lineTo(sx, sy);
    }
    if (opts.close) ctx.closePath();
    ctx.stroke();
    this.reset();
  }

  polygon(points, { fill = null, stroke = null, width = 2, alpha = 1, fillAlpha = 0.25, dash = null } = {}) {
    const ctx = this.ctx;
    ctx.beginPath();
    points.forEach((pt, i) => { const [sx, sy] = this.S(...pt); if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); });
    ctx.closePath();
    if (fill) { ctx.globalAlpha = fillAlpha * alpha; ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { this.style({ color: stroke, width, alpha, dash }); ctx.stroke(); }
    this.reset();
  }

  /** Infinite line through `point` with direction `dir`, clipped to the viewport. */
  infiniteLine(point, dir, opts = {}) {
    const seg = this.clipLine(point, dir);
    if (seg) this.line(seg[0], seg[1], opts);
  }

  clipLine(point, dir) {
    const [px, py] = this.S(...point);
    const [qx, qy] = this.S(point[0] + dir[0], point[1] + dir[1]);
    const dx = qx - px, dy = qy - py;
    if (Math.hypot(dx, dy) < 1e-9) return null;
    let t0 = -Infinity, t1 = Infinity;
    const W = this.p.w, H = this.p.h, pad = 4;
    const edges = [[-dx, px + pad], [dx, W + pad - px], [-dy, py + pad], [dy, H + pad - py]];
    for (const [p, q] of edges) {
      if (Math.abs(p) < 1e-12) { if (q < 0) return null; continue; }
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
    }
    if (t0 > t1) return null;
    const a = this.p.toWorld(px + t0 * dx, py + t0 * dy);
    const b = this.p.toWorld(px + t1 * dx, py + t1 * dy);
    return [a, b];
  }

  /** Background grid (axis-aligned, adaptive spacing) with optional numeric ticks. */
  backgroundGrid({ ticks = true, color = this.c.grid, major = this.c.gridMajor, minStep = 1 } = {}) {
    const { xmin, xmax, ymin, ymax } = this.p.bounds();
    const step = Math.max(minStep, niceStep(24 / this.p.view.scale));
    const ctx = this.ctx;
    this.style({ color, width: 1, cap: 'butt' });
    ctx.beginPath();
    for (let x = Math.ceil(xmin / step) * step; x <= xmax; x += step) { const [sx] = this.S(x, 0); ctx.moveTo(Math.round(sx) + 0.5, 0); ctx.lineTo(Math.round(sx) + 0.5, this.p.h); }
    for (let y = Math.ceil(ymin / step) * step; y <= ymax; y += step) { const [, sy] = this.S(0, y); ctx.moveTo(0, Math.round(sy) + 0.5); ctx.lineTo(this.p.w, Math.round(sy) + 0.5); }
    ctx.stroke();
    // Axes of the reference grid.
    this.style({ color: major, width: 1.5, cap: 'butt' });
    ctx.beginPath();
    const [ox, oy] = this.S(0, 0);
    ctx.moveTo(ox, 0); ctx.lineTo(ox, this.p.h); ctx.moveTo(0, oy); ctx.lineTo(this.p.w, oy);
    ctx.stroke();
    this.reset();
    if (!ticks) return;
    const tickStep = niceStep(56 / this.p.view.scale);
    ctx.font = `11px ${MONO_FONT}`;
    ctx.fillStyle = this.c.muted;
    ctx.globalAlpha = 0.85;
    const yLabel = clamp(oy + 14, 12, this.p.h - 6);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let x = Math.ceil(xmin / tickStep) * tickStep; x <= xmax; x += tickStep) {
      if (Math.abs(x) < 1e-9) continue;
      ctx.fillText(fmtTick(x), this.S(x, 0)[0], yLabel);
    }
    const xLabel = clamp(ox - 8, 18, this.p.w - 8);
    ctx.textAlign = 'right';
    for (let y = Math.ceil(ymin / tickStep) * tickStep; y <= ymax; y += tickStep) {
      if (Math.abs(y) < 1e-9) continue;
      ctx.fillText(fmtTick(y), xLabel, this.S(0, y)[1]);
    }
    this.reset();
  }

  /**
   * Image of the integer lattice under the matrix m (float 2×2):
   * lines {x = i} ↦ i·c₁ + s·c₂ and {y = j} ↦ j·c₂ + s·c₁.
   */
  transformedGrid(m, { color = this.c.tgrid, width = 1.4, alpha = 1, axes = true, axisColor = this.c.axis, step = 1 } = {}) {
    const c1 = [m[0][0], m[1][0]], c2 = [m[0][1], m[1][1]];
    this.lineFamily(c1, c2, { color, width, alpha, step });
    this.lineFamily(c2, c1, { color, width, alpha, step });
    if (axes) {
      if (Math.hypot(...c1) > 1e-9) this.infiniteLine([0, 0], c1, { color: axisColor, width: 2, alpha });
      if (Math.hypot(...c2) > 1e-9) this.infiniteLine([0, 0], c2, { color: axisColor, width: 2, alpha });
    }
  }

  /** Lines through i·a (i ∈ ℤ) with direction d, only those crossing the viewport. */
  lineFamily(a, d, { color, width, alpha = 1, step = 1, offset = [0, 0] } = {}) {
    const dn = Math.hypot(...d);
    if (dn < 1e-9) return;
    const { xmin, xmax, ymin, ymax } = this.p.bounds();
    const C = [(xmin + xmax) / 2 - offset[0], (ymin + ymax) / 2 - offset[1]];
    const R = Math.hypot(xmax - xmin, ymax - ymin) / 2;
    const crossAD = a[0] * d[1] - a[1] * d[0];
    const crossCD = C[0] * d[1] - C[1] * d[0];
    this.style({ color, width, alpha });
    const ctx = this.ctx;
    ctx.beginPath();
    const drawOne = (i) => {
      const seg = this.clipLine([offset[0] + i * a[0], offset[1] + i * a[1]], d);
      if (!seg) return;
      ctx.moveTo(...this.S(...seg[0])); ctx.lineTo(...this.S(...seg[1]));
    };
    if (Math.abs(crossAD) < 1e-9 * Math.max(1, dn * Math.hypot(...a))) {
      drawOne(0);
    } else {
      let lo = (crossCD - R * dn) / crossAD, hi = (crossCD + R * dn) / crossAD;
      if (lo > hi) [lo, hi] = [hi, lo];
      lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
      let k = step;
      const spacingPx = (Math.abs(crossAD) / dn) * this.p.view.scale;
      while ((hi - lo) / k > 400 || spacingPx * k < 7) k *= 2;
      for (let i = Math.ceil(lo / k) * k; i <= hi; i += k) drawOne(i);
    }
    ctx.stroke();
    this.reset();
  }

  arrow(from, to, { color = this.c.axis, width = 3, head = 13, alpha = 1, dash = null } = {}) {
    const [ax, ay] = this.S(...from);
    const [bx, by] = this.S(...to);
    const len = Math.hypot(bx - ax, by - ay);
    const ctx = this.ctx;
    this.style({ color, width, alpha, dash });
    if (len < 2) {
      ctx.beginPath(); ctx.arc(ax, ay, width + 1, 0, Math.PI * 2); ctx.fill();
      this.reset();
      return;
    }
    const hl = Math.min(head, len * 0.55);
    const ux = (bx - ax) / len, uy = (by - ay) / len;
    const baseX = bx - ux * hl, baseY = by - uy * hl;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(baseX + ux * 1, baseY + uy * 1); ctx.stroke();
    ctx.setLineDash([]);
    const hw = hl * 0.48;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(baseX - uy * hw, baseY + ux * hw);
    ctx.lineTo(baseX + uy * hw, baseY - ux * hw);
    ctx.closePath();
    ctx.fill();
    this.reset();
  }

  vector(to, opts = {}) { this.arrow([0, 0], to, opts); }

  point(p, { color = this.c.axis, r = 4, stroke = null, alpha = 1 } = {}) {
    const ctx = this.ctx;
    const [sx, sy] = this.S(...p);
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
    this.reset();
  }

  /** Parametric curve f(t) = [x, y], t ∈ [t0, t1]. */
  curve(f, t0, t1, n = 200, opts = {}) {
    const pts = [];
    for (let k = 0; k <= n; k++) pts.push(f(t0 + ((t1 - t0) * k) / n));
    this.polyline(pts, opts);
  }

  /** Image of the unit circle (or a circle of radius r) under the float matrix m. */
  ellipse(m, { r = 1, center = [0, 0], ...opts } = {}) {
    this.curve((t) => {
      const x = r * Math.cos(t), y = r * Math.sin(t);
      return [center[0] + m[0][0] * x + m[0][1] * y, center[1] + m[1][0] * x + m[1][1] * y];
    }, 0, Math.PI * 2, 160, opts);
  }

  fillCurve(points, { color, alpha = 0.18 } = {}) {
    const ctx = this.ctx;
    ctx.beginPath();
    points.forEach((pt, i) => { const [sx, sy] = this.S(...pt); if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); });
    ctx.closePath();
    ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.fill();
    this.reset();
  }

  /** Right-angle marker at `corner` between unit directions u and v (world). */
  rightAngle(corner, u, v, { color = this.c.muted, size = 12 } = {}) {
    const s = size / this.p.view.scale;
    const nu = norm2(u), nv = norm2(v);
    if (!nu || !nv) return;
    const a = [corner[0] + (u[0] / nu) * s, corner[1] + (u[1] / nu) * s];
    const b = [a[0] + (v[0] / nv) * s, a[1] + (v[1] / nv) * s];
    const c = [corner[0] + (v[0] / nv) * s, corner[1] + (v[1] / nv) * s];
    this.polyline([a, b, c], { color, width: 1.5 });
  }

  text(p, str, { color = this.c.label, size = 12, font = MONO_FONT, align = 'left', baseline = 'middle', offset = [0, 0], weight = 500, italic = false, halo = true, alpha = 1 } = {}) {
    const ctx = this.ctx;
    const [sx, sy] = this.S(...p);
    ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${font}`;
    ctx.textAlign = align; ctx.textBaseline = baseline;
    ctx.globalAlpha = alpha;
    const x = sx + offset[0], y = sy + offset[1];
    if (halo) {
      ctx.lineWidth = 4; ctx.strokeStyle = this.c.bg; ctx.lineJoin = 'round';
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    this.reset();
  }

  /**
   * Math label near a point: letter (italic, KaTeX font) with optional decoration
   * ('arrow' → v⃗, 'hat' → î) and subscript. Placed at an offset away from `away` if given.
   */
  mathLabel(p, letter, { color = this.c.label, deco = null, sub = null, size = 19, offset = null, away = null, prime = false } = {}) {
    const ctx = this.ctx;
    let [sx, sy] = this.S(...p);
    let off = offset;
    if (!off) {
      if (away) {
        const [ax, ay] = this.S(...away);
        let dx = sx - ax, dy = sy - ay;
        const n = Math.hypot(dx, dy) || 1;
        off = [(dx / n) * 24, (dy / n) * 24];
      } else off = [16, -16];
    }
    sx += off[0]; sy += off[1];
    const isLatin = /^[a-zA-Z]$/.test(letter);
    const dotless = { i: 'ı', j: 'ȷ' };
    const glyph = deco === 'hat' && dotless[letter] ? dotless[letter] : letter;
    ctx.font = `${isLatin ? 'italic ' : ''}${size}px ${isLatin ? MATH_FONT : MAIN_FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(glyph).width;
    ctx.lineWidth = 4; ctx.strokeStyle = this.c.bg; ctx.lineJoin = 'round';
    ctx.strokeText(glyph, sx, sy);
    ctx.fillStyle = color;
    ctx.fillText(glyph, sx, sy);
    let right = sx + w / 2;
    if (prime) { ctx.font = `${size}px ${MAIN_FONT}`; ctx.fillText('′', right + 3, sy - 2); right += 6; }
    if (sub !== null && sub !== undefined) {
      ctx.font = `${Math.round(size * 0.68)}px ${MAIN_FONT}`;
      ctx.textAlign = 'left';
      ctx.strokeText(String(sub), right + 1, sy + size * 0.32);
      ctx.fillText(String(sub), right + 1, sy + size * 0.32);
    }
    ctx.strokeStyle = color; ctx.fillStyle = color;
    const top = sy - size * 0.62;
    if (deco === 'arrow') {
      const x0 = sx - w * 0.45, x1 = sx + w * 0.6;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x0, top); ctx.lineTo(x1, top); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x1 + 1.5, top); ctx.lineTo(x1 - 3.5, top - 3); ctx.lineTo(x1 - 3.5, top + 3); ctx.closePath(); ctx.fill();
    } else if (deco === 'hat') {
      const cx = sx + (isLatin ? w * 0.08 : 0);
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(cx - 4, top + 3); ctx.lineTo(cx, top - 1); ctx.lineTo(cx + 4, top + 3); ctx.stroke();
    }
    this.reset();
  }

  /** Crosshair handle (constant screen size). */
  handle(p, color, { active = false, selected = false } = {}) {
    const ctx = this.ctx;
    const [sx, sy] = this.S(...p);
    const r = active ? 9 : 7.5;
    ctx.lineWidth = 2;
    ctx.strokeStyle = this.c.bg;
    ctx.beginPath(); ctx.arc(sx, sy, r + 1.5, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.moveTo(sx, sy - r - 5); ctx.lineTo(sx, sy - r + 3);
    ctx.moveTo(sx, sy + r - 3); ctx.lineTo(sx, sy + r + 5);
    ctx.moveTo(sx - r - 5, sy); ctx.lineTo(sx - r + 3, sy);
    ctx.moveTo(sx + r - 3, sy); ctx.lineTo(sx + r + 5, sy);
    ctx.stroke();
    if (selected) {
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = this.c.accent;
      ctx.beginPath(); ctx.arc(sx, sy, r + 7, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

function norm2(v) { return Math.hypot(v[0], v[1]); }

export function niceStep(minWorld) {
  const steps = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000];
  return steps.find((s) => s >= minWorld) || 1000;
}

function fmtTick(x) {
  const r = Math.round(x * 1000) / 1000;
  return String(r).replace('-', '−');
}
