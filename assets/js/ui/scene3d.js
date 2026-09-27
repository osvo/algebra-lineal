// Interactive 3D view built on three.js, with the mathematical convention z-up,
// an orthographic camera (parallel lines stay parallel), KaTeX labels, draggable
// handles with snapping, theme-aware colours and PNG snapshots.

import * as THREE from '../../../vendor/three/three-lab.min.js';
import { h, icon } from './dom.js';
import { setAttr, tr, onLangChange } from './i18n.js';
import { onThemeChange } from './theme.js';
import { texToHTML } from './tex.js';

const { OrbitControls, CSS2DRenderer, CSS2DObject } = THREE;

const COLOR_VARS = {
  bg: '--canvas-bg', grid: '--grid', gridMajor: '--grid-major', tgrid: '--tgrid', axis: '--axis', label: '--label',
  i: '--c-i', j: '--c-j', k: '--c-k', v: '--c-v', w: '--c-w', eig: '--c-eig', ker: '--c-ker', img: '--c-img',
  det: '--c-det', detNeg: '--c-det-neg', row1: '--c-row1', row2: '--c-row2', row3: '--c-row3', sol: '--c-sol', res: '--c-res',
  accent: '--accent', muted: '--muted', text: '--text',
};

const VIEWS = {
  iso: [1.1, 0.72, 0.62],
  xy: [0, 0, 1],
  xz: [0, -1, 0],
  yz: [1, 0, 0],
};

/** Parses CSS colours such as "#abc", "rgb()" or "rgba()" into { color, alpha }. */
function parseColor(str) {
  const s = str.trim();
  const m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) {
    const [r, g, b, a = '1'] = m[1].split(/[,\s/]+/).filter(Boolean);
    return { color: new THREE.Color(`rgb(${Math.round(+r)}, ${Math.round(+g)}, ${Math.round(+b)})`), alpha: parseFloat(a) };
  }
  return { color: new THREE.Color(s || '#888'), alpha: 1 };
}

export class Scene3D {
  constructor(container, { title = null, extent = 5, view = 'iso', frustum = 11, grid = true, ariaLabel = null } = {}) {
    this.container = container;
    container.classList.add('view', 'view--3d');
    container.tabIndex = 0;
    setAttr(container, 'aria-label', ariaLabel || {
      es: 'Vista 3D interactiva. Arrastra para girar, rueda o pellizco para acercar, y arrastra los puntos marcados para moverlos.',
      en: 'Interactive 3D view. Drag to rotate, wheel or pinch to zoom, and drag the marked points to move them.',
    });
    this.extent = extent;
    this.frustum = frustum;
    this.showGrid = grid;
    this.c = {};
    this.handles = [];
    this.labels = [];
    this.frame = null;
    this.onTheme = null;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2.5, window.devicePixelRatio || 1));
    container.append(this.renderer.domElement);
    this.labelRenderer = new CSS2DRenderer();
    Object.assign(this.labelRenderer.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    container.append(this.labelRenderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 200);
    this.camera.up.set(0, 0, 1);
    this.static = new THREE.Group();
    this.dynamic = new THREE.Group();
    this.handleGroup = new THREE.Group();
    this.scene.add(this.static, this.dynamic, this.handleGroup);

    if (title) {
      const t = h('div', { class: 'view__title' });
      container.append(t);
      const upd = () => { t.textContent = tr(title); };
      upd(); onLangChange(upd);
    }
    this.buildTools();
    this.bindHandleEvents(); // before OrbitControls so we can disable it on handle hits
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true;
    this.controls.addEventListener('change', () => { this.updateHandleScale(); this.requestRender(); });

    this.readColors();
    this.setView(view, false);
    this.buildStatic();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    onThemeChange(() => {
      this.readColors();
      this.buildStatic();
      if (this.onTheme) this.onTheme();
      this.requestRender();
    });
  }

  buildTools() {
    const tools = h('div', { class: 'view__tools' });
    const mk = (content, label, fn) => {
      const b = h('button', { type: 'button', class: 'icon-btn' });
      if (typeof content === 'string') { b.textContent = content; b.style.fontSize = '10px'; } else b.append(content);
      setAttr(b, 'aria-label', label); setAttr(b, 'title', label);
      b.addEventListener('click', fn);
      tools.append(b);
    };
    mk(icon('cube'), { es: 'Vista en perspectiva isométrica', en: 'Isometric view' }, () => this.setView('iso'));
    mk('XY', { es: 'Mirar el plano XY desde arriba', en: 'Look at the XY plane from above' }, () => this.setView('xy'));
    mk('XZ', { es: 'Mirar el plano XZ de frente', en: 'Look at the XZ plane from the front' }, () => this.setView('xz'));
    mk('YZ', { es: 'Mirar el plano YZ de lado', en: 'Look at the YZ plane from the side' }, () => this.setView('yz'));
    this.container.append(tools);
  }

  readColors() {
    const cs = getComputedStyle(this.container);
    for (const [k, v] of Object.entries(COLOR_VARS)) this.c[k] = cs.getPropertyValue(v).trim() || '#888';
    this.scene.background = parseColor(this.c.bg).color;
  }

  color(name) { return parseColor(this.c[name] || name).color; }

  setView(name, render = true) {
    const d = new THREE.Vector3(...VIEWS[name]).normalize().multiplyScalar(40);
    this.camera.position.copy(d);
    this.camera.up.set(0, 0, 1);
    if (name === 'xy') this.camera.up.set(0, 1, 0);
    this.camera.zoom = 1;
    this.camera.lookAt(0, 0, 0);
    if (this.controls) { this.controls.target.set(0, 0, 0); this.controls.update(); }
    this.camera.updateProjectionMatrix();
    if (name !== 'xy') this.camera.up.set(0, 0, 1);
    this.updateHandleScale();
    if (render) this.requestRender();
  }

  resize() {
    const r = this.container.getBoundingClientRect();
    const w = Math.max(1, r.width), hh = Math.max(1, r.height);
    const aspect = w / hh;
    const f = this.frustum;
    const half = aspect >= 1 ? [f * aspect / 2, f / 2] : [f / 2, f / aspect / 2];
    Object.assign(this.camera, { left: -half[0], right: half[0], top: half[1], bottom: -half[1] });
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, hh, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.labelRenderer.setSize(w, hh);
    this.w = w; this.h = hh;
    this.updateHandleScale();
    this.render();
  }

  requestRender() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = null; this.render(); });
  }

  render() {
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }

  // -------------------------------------------------------------------------
  // Static scene: axes, ground grid, axis labels
  // -------------------------------------------------------------------------

  buildStatic() {
    disposeGroup(this.static);
    const L = this.extent;
    if (this.showGrid) {
      const pts = [];
      for (let i = -L; i <= L; i++) {
        if (i === 0) continue;
        pts.push(i, -L, 0, i, L, 0, -L, i, 0, L, i, 0);
      }
      const { color, alpha } = parseColor(this.c.grid);
      this.static.add(segments(pts, color, Math.min(1, alpha * 1.6)));
    }
    const axisColor = parseColor(this.c.axis).color;
    const ax = [];
    ax.push(-L - 1, 0, 0, L + 1, 0, 0, 0, -L - 1, 0, 0, L + 1, 0, 0, 0, -L - 1, 0, 0, L + 1);
    this.static.add(segments(ax, axisColor, 0.55));
    // Ticks
    const ticks = [];
    const s = 0.08;
    for (let i = -L; i <= L; i++) {
      if (!i) continue;
      ticks.push(i, -s, 0, i, s, 0, -s, i, 0, s, i, 0, -s, 0, i, s, 0, i);
    }
    this.static.add(segments(ticks, axisColor, 0.45));
    for (const [name, p] of [['x', [L + 1.4, 0, 0]], ['y', [0, L + 1.4, 0]], ['z', [0, 0, L + 1.4]]]) {
      this.static.add(this.makeLabel(p, name, this.c.muted, { tex: true, size: 15 }));
    }
    this.requestRender();
  }

  // -------------------------------------------------------------------------
  // Dynamic primitives (added to the dynamic group; call clear() before rebuilding)
  // -------------------------------------------------------------------------

  clear() {
    disposeGroup(this.dynamic);
    this.labels = this.labels.filter((l) => l.static);
  }

  add(obj, group = this.dynamic) { group.add(obj); return obj; }

  arrow(from, to, colorName, { radius = 0.035, head = 0.28, opacity = 1, group = this.dynamic } = {}) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const obj = new THREE.Group();
    const mat = basic(this.color(colorName), opacity);
    if (len < 1e-6) {
      obj.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 2.2, 12, 8), mat));
      obj.position.copy(a);
      return this.add(obj, group);
    }
    const hl = Math.min(head, len * 0.4);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len - hl, 10), mat);
    shaft.position.y = (len - hl) / 2;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(radius * 3, hl, 16), mat);
    cone.position.y = len - hl / 2;
    obj.add(shaft, cone);
    obj.position.copy(a);
    obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return this.add(obj, group);
  }

  line(points, colorName, { opacity = 1, dashed = false, dash = 0.18, gap = 0.12, group = this.dynamic } = {}) {
    const geo = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(...p)));
    const col = this.color(colorName);
    const mat = dashed
      ? new THREE.LineDashedMaterial({ color: col, dashSize: dash, gapSize: gap, transparent: opacity < 1, opacity })
      : new THREE.LineBasicMaterial({ color: col, transparent: opacity < 1, opacity });
    const line = new THREE.Line(geo, mat);
    if (dashed) line.computeLineDistances();
    return this.add(line, group);
  }

  /** Infinite-looking line through `point` with direction `dir`. */
  lineThrough(point, dir, colorName, opts = {}) {
    const d = new THREE.Vector3(...dir);
    if (d.length() < 1e-9) return null;
    d.normalize().multiplyScalar(opts.length || 40);
    const p = new THREE.Vector3(...point);
    return this.line([p.clone().sub(d).toArray(), p.clone().add(d).toArray()], colorName, opts);
  }

  segments(flat, colorName, { opacity = 1, group = this.dynamic } = {}) {
    return this.add(segments(flat, this.color(colorName), opacity), group);
  }

  /** Parallelogram/plane spanned by u, v through `center`, covering [-size, size]² in those coordinates. */
  planeSpan(center, u, v, colorName, { size = 6, opacity = 0.22, edges = true, grid = 0, group = this.dynamic } = {}) {
    const U = new THREE.Vector3(...u), Vv = new THREE.Vector3(...v), C = new THREE.Vector3(...center);
    const corner = (a, b) => C.clone().addScaledVector(U, a).addScaledVector(Vv, b);
    const quad = [corner(-size, -size), corner(size, -size), corner(size, size), corner(-size, size)];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([...quad[0].toArray(), ...quad[1].toArray(), ...quad[2].toArray(), ...quad[0].toArray(), ...quad[2].toArray(), ...quad[3].toArray()], 3));
    const col = this.color(colorName);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
    const g = new THREE.Group();
    g.add(mesh);
    if (edges) g.add(segments([...quad[0].toArray(), ...quad[1].toArray(), ...quad[1].toArray(), ...quad[2].toArray(), ...quad[2].toArray(), ...quad[3].toArray(), ...quad[3].toArray(), ...quad[0].toArray()], col, 0.6));
    if (grid) {
      const pts = [];
      for (let k = -size; k <= size; k += grid) {
        pts.push(...corner(k, -size).toArray(), ...corner(k, size).toArray(), ...corner(-size, k).toArray(), ...corner(size, k).toArray());
      }
      g.add(segments(pts, col, Math.min(0.5, opacity * 2)));
    }
    return this.add(g, group);
  }

  /** Plane n·x = d (n need not be unit). */
  planeEq(n, d, colorName, opts = {}) {
    const N = new THREE.Vector3(...n);
    const len2 = N.lengthSq();
    if (len2 < 1e-12) return null;
    const center = N.clone().multiplyScalar(d / len2);
    const a = Math.abs(N.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const u = N.clone().cross(a).normalize();
    const v = N.clone().cross(u).normalize();
    return this.planeSpan(center.toArray(), u.toArray(), v.toArray(), colorName, opts);
  }

  /** Image of the unit cube [0,1]³ under the 3×3 matrix m (rows). */
  parallelepiped(m, colorName, { opacity = 0.25, group = this.dynamic } = {}) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0.5, 0.5, 0.5);
    const mat4 = matrix4(m);
    const col = this.color(colorName);
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false })));
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: col }));
    g.add(edges);
    g.matrixAutoUpdate = false;
    g.matrix.copy(mat4);
    return this.add(g, group);
  }

  point(p, colorName, { r = 0.09, opacity = 1, group = this.dynamic } = {}) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), basic(this.color(colorName), opacity));
    m.position.set(...p);
    return this.add(m, group);
  }

  /** Label anchored at a 3D point. text is TeX when tex = true, otherwise plain text. */
  label(p, text, colorName, { tex = false, size = 14, offset = [0, 0], group = this.dynamic, plain = null } = {}) {
    const obj = this.makeLabel(p, text, this.c[colorName] || colorName, { tex, size, offset, plain });
    return this.add(obj, group);
  }

  makeLabel(p, text, color, { tex = false, size = 14, offset = [0, 0], plain = null } = {}) {
    const div = document.createElement('div');
    div.className = 'label3d';
    div.style.color = color;
    div.style.fontSize = `${size}px`;
    div.style.transform = `translate(${offset[0]}px, ${offset[1]}px)`;
    if (tex) div.innerHTML = texToHTML(text); else div.textContent = text;
    const obj = new CSS2DObject(div);
    obj.position.set(...p);
    obj.userData.plain = plain || (tex ? texPlain(text) : text);
    obj.userData.color = color;
    obj.userData.size = size;
    obj.userData.offset = offset;
    return obj;
  }

  /** Object group whose world matrix is the given 3×3 linear map (for transforming meshes). */
  transformedGroup(m, group = this.dynamic) {
    const g = new THREE.Group();
    g.matrixAutoUpdate = false;
    g.matrix.copy(matrix4(m));
    return this.add(g, group);
  }

  setGroupMatrix(g, m) { g.matrix.copy(matrix4(m)); g.matrixWorldNeedsUpdate = true; }

  // -------------------------------------------------------------------------
  // Handles
  // -------------------------------------------------------------------------

  /** handle: { id, get() → [x,y,z], set([x,y,z]), color, visible() , plane?: 'view' | 'xy' } */
  addHandle(hd) {
    const handle = { visible: () => true, plane: 'view', ...hd };
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), basic(this.color(handle.color), 0.9));
    const ring = new THREE.Mesh(new THREE.SphereGeometry(1.9, 16, 10), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    mesh.add(ring);
    mesh.userData.handle = handle;
    ring.userData.handle = handle;
    handle.mesh = mesh;
    this.handleGroup.add(mesh);
    this.handles.push(handle);
    this.syncHandles();
    return handle;
  }

  syncHandles() {
    for (const hd of this.handles) {
      hd.mesh.visible = hd.visible();
      hd.mesh.position.set(...hd.get());
      hd.mesh.material.color.copy(this.color(hd.color));
    }
    this.updateHandleScale();
  }

  updateHandleScale() {
    // Constant on-screen size: world size proportional to 1/zoom.
    const worldPerPx = (this.camera.right - this.camera.left) / Math.max(1, this.w || 1) / (this.camera.zoom || 1);
    const r = 6 * worldPerPx;
    for (const hd of this.handles) hd.mesh.scale.setScalar(r);
  }

  snap(v) {
    const ri = Math.round(v);
    if (Math.abs(v - ri) < 0.12) return ri;
    const rh = Math.round(v * 2) / 2;
    if (Math.abs(v - rh) < 0.07) return rh;
    return Math.round(v * 10) / 10;
  }

  bindHandleEvents() {
    const el = this.renderer.domElement;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane();
    let drag = null;
    const toNdc = (e) => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    el.addEventListener('pointerdown', (e) => {
      toNdc(e);
      ray.setFromCamera(ndc, this.camera);
      const targets = this.handles.filter((hd) => hd.mesh.visible).flatMap((hd) => [hd.mesh, ...hd.mesh.children]);
      const hit = ray.intersectObjects(targets, false)[0];
      if (!hit) return;
      const hd = hit.object.userData.handle;
      const pos = hd.mesh.position.clone();
      const normal = hd.plane === 'xy' ? new THREE.Vector3(0, 0, 1) : this.camera.getWorldDirection(new THREE.Vector3()).negate();
      plane.setFromNormalAndCoplanarPoint(normal, pos);
      drag = { hd, pointerId: e.pointerId };
      this.controls.enabled = false;
      el.setPointerCapture(e.pointerId);
      e.stopImmediatePropagation();
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag) {
        toNdc(e);
        ray.setFromCamera(ndc, this.camera);
        const targets = this.handles.filter((hd) => hd.mesh.visible).flatMap((hd) => [hd.mesh, ...hd.mesh.children]);
        el.style.cursor = ray.intersectObjects(targets, false).length ? 'grab' : '';
        return;
      }
      toNdc(e);
      ray.setFromCamera(ndc, this.camera);
      const p = new THREE.Vector3();
      if (!ray.ray.intersectPlane(plane, p)) return;
      const L = this.extent + 2;
      const clampv = (x) => Math.max(-L, Math.min(L, x));
      const next = [this.snap(clampv(p.x)), this.snap(clampv(p.y)), drag.hd.plane === 'xy' ? 0 : this.snap(clampv(p.z))];
      drag.hd.set(next);
    });
    const end = () => {
      if (!drag) return;
      drag = null;
      this.controls.enabled = true;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  // -------------------------------------------------------------------------
  // Export
  // -------------------------------------------------------------------------

  snapshot() {
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement;
    const out = document.createElement('canvas');
    out.width = src.width; out.height = src.height;
    const ctx = out.getContext('2d');
    ctx.drawImage(src, 0, 0);
    const sx = out.width / this.w, sy = out.height / this.h;
    const v = new THREE.Vector3();
    this.scene.traverse((obj) => {
      if (!obj.isCSS2DObject || !obj.visible) return;
      obj.getWorldPosition(v);
      v.project(this.camera);
      const x = ((v.x + 1) / 2) * this.w + (obj.userData.offset?.[0] || 0);
      const y = ((1 - v.y) / 2) * this.h + (obj.userData.offset?.[1] || 0);
      ctx.font = `italic ${Math.round((obj.userData.size || 14) * sx)}px "KaTeX_Math", Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = obj.userData.color || '#fff';
      ctx.fillText(obj.userData.plain || '', x * sx, y * sy);
    });
    return out;
  }
}

// ---------------------------------------------------------------------------

function basic(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
}

function segments(flat, color, opacity = 1) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
}

export function matrix4(m) {
  const M = new THREE.Matrix4();
  M.set(
    m[0][0], m[0][1], m[0][2], 0,
    m[1][0], m[1][1], m[1][2], 0,
    m[2][0], m[2][1], m[2][2], 0,
    0, 0, 0, 1,
  );
  return M;
}

function disposeGroup(group) {
  for (const child of [...group.children]) {
    child.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      if (o.isCSS2DObject && o.element && o.element.parentNode) o.element.parentNode.removeChild(o.element);
    });
    group.remove(child);
  }
}

function texPlain(tex) {
  return tex
    .replace(/\\hat\{\\imath\}/g, 'î').replace(/\\hat\{\\jmath\}/g, 'ĵ').replace(/\\hat\{k\}/g, 'k̂')
    .replace(/\\vec\{(\w)\}/g, '$1⃗').replace(/\\mathbf\{(\w+)\}/g, '$1')
    .replace(/\\lambda/g, 'λ').replace(/[{}\\]/g, '').replace(/_/g, '');
}

export { THREE };
