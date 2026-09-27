// Reusable form controls. Every control exposes `el` and `update()`; the page
// shell calls update() after each state change so controls reflect the state.

import { h, icon, clamp } from './dom.js';
import { tr, setText, setAttr, onLangChange } from './i18n.js';
import { makeEntry, numberToInput, describeParseError } from '../core/parse.js';
import { renderTex } from './tex.js';

const COL_VARS = ['var(--c-i)', 'var(--c-j)', 'var(--c-k)', 'var(--c-w)'];

/**
 * Editable matrix of entries {text, x, q, ok}.
 * opts: rows, cols, get() → entries, set(entries), colColors (CSS colours per column),
 *       label (TeX shown before the matrix), augment (index of first augmented column).
 */
export function matrixEditor({ rows, cols, get, set, colColors = COL_VARS, label = null, augment = null, name = { es: 'Matriz', en: 'Matrix' }, cellLabel = null }) {
  const grid = h('div', { class: `matrix${cols > 3 ? ' matrix--wide' : ''}`, role: 'group' });
  setAttr(grid, 'aria-label', name);
  grid.style.gridTemplateColumns = `repeat(${cols}, auto)`;
  const inputs = [];
  for (let i = 0; i < rows; i++) {
    inputs.push([]);
    for (let j = 0; j < cols; j++) {
      const input = h('input', {
        type: 'text', inputmode: 'text', autocomplete: 'off', spellcheck: 'false',
        'data-r': i, 'data-c': j,
      });
      if (augment !== null && j === augment) input.dataset.sep = '1';
      const color = colColors ? colColors[j] : null;
      if (color) input.style.setProperty('--cell-color', color);
      setAttr(input, 'aria-label', cellLabel ? cellLabel(i, j) : { es: `Fila ${i + 1}, columna ${j + 1}`, en: `Row ${i + 1}, column ${j + 1}` });
      input.addEventListener('input', () => commit(i, j, input.value));
      input.addEventListener('keydown', (e) => onKey(e, i, j));
      input.addEventListener('blur', () => update(true));
      grid.append(input);
      inputs[i].push(input);
    }
  }

  function commit(i, j, text) {
    const entries = get().map((row) => row.slice());
    const e = makeEntry(text);
    inputs[i][j].setAttribute('aria-invalid', String(!e.ok));
    if (!e.ok) { inputs[i][j].title = tr(describeParseError(e.error)); return; }
    inputs[i][j].removeAttribute('title');
    entries[i][j] = e;
    set(entries);
  }

  function onKey(e, i, j) {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const cur = get()[i][j];
      if (!cur.ok) return;
      e.preventDefault();
      const step = e.shiftKey ? 0.1 : 1;
      const next = Math.round((cur.x + (e.key === 'ArrowUp' ? step : -step)) * 1e6) / 1e6;
      inputs[i][j].value = numberToInput(next);
      commit(i, j, inputs[i][j].value);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const flat = inputs.flat();
      const k = flat.indexOf(inputs[i][j]);
      (flat[k + 1] || flat[0]).focus();
      (flat[k + 1] || flat[0]).select();
    }
  }

  function update(force = false) {
    const entries = get();
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const input = inputs[i][j];
        if (!force && document.activeElement === input) continue;
        const text = entries[i][j].text;
        if (input.value !== text) input.value = text;
        input.setAttribute('aria-invalid', 'false');
      }
    }
  }

  const children = [];
  if (label) {
    const lab = h('span', { class: 'matrix-editor__label' });
    renderTex(lab, label);
    children.push(lab);
  }
  children.push(grid);
  const el = h('div', { class: 'matrix-editor' }, children);
  update(true);
  return { el, update, inputs };
}

export function vectorEditor({ n, get, set, color = 'var(--c-v)', label = null, name = { es: 'Vector', en: 'Vector' } }) {
  return matrixEditor({
    rows: n, cols: 1, label, name, colColors: [color],
    get: () => get().map((e) => [e]),
    set: (m) => set(m.map((row) => row[0])),
    cellLabel: (i) => ({ es: `Componente ${i + 1}`, en: `Component ${i + 1}` }),
  });
}

/** Toggle chip bound to a boolean (or to membership of a flag in a list). */
export function chip({ label, get, set, color = null, title = null }) {
  const el = h('button', { type: 'button', class: 'chip' });
  if (color) el.style.setProperty('--chip-color', color);
  const text = h('span');
  setText(text, label);
  el.append(text);
  if (title) setAttr(el, 'title', title);
  el.addEventListener('click', () => set(!get()));
  const update = () => el.setAttribute('aria-pressed', String(!!get()));
  update();
  return { el, update };
}

/** Chip bound to the presence of `flag` in store[key] (an array). */
export function flagChip(store, key, flag, label, color) {
  return chip({
    label, color,
    get: () => store.get(key).includes(flag),
    set: (on) => {
      const cur = store.get(key).filter((f) => f !== flag);
      store.set({ [key]: on ? [...cur, flag] : cur });
    },
  });
}

export function segmented({ options, get, set, label = null }) {
  const el = h('div', { class: 'seg', role: 'group' });
  if (label) setAttr(el, 'aria-label', label);
  const buttons = options.map((o) => {
    const b = h('button', { type: 'button' });
    if (o.tex) renderTex(b, o.tex); else setText(b, o.label);
    if (o.title) setAttr(b, 'title', o.title);
    b.addEventListener('click', () => set(o.value));
    el.append(b);
    return [o.value, b];
  });
  const update = () => { for (const [v, b] of buttons) b.setAttribute('aria-pressed', String(get() === v)); };
  update();
  return { el, update };
}

/**
 * Select with optional groups: options = [{ value, label }] or groups = [{ label, options }].
 */
export function selectBox({ options = null, groups = null, get, set, label = null, id = null }) {
  const sel = h('select', id ? { id } : null);
  if (label) setAttr(sel, 'aria-label', label);
  const build = () => {
    const current = get();
    sel.replaceChildren();
    const addOpts = (parent, opts) => opts.forEach((o) => parent.append(h('option', { value: o.value }, tr(o.label))));
    if (groups) groups.forEach((g) => { const og = h('optgroup', { label: tr(g.label) }); addOpts(og, g.options); sel.append(og); });
    else addOpts(sel, options);
    sel.value = current;
  };
  build();
  onLangChange(build);
  sel.addEventListener('change', () => set(sel.value));
  const update = () => { if (sel.value !== get()) sel.value = get(); };
  return { el: sel, update, rebuild: build };
}

export function slider({ label, min, max, step, get, set, format = (x) => x.toFixed(2), labelTex = null }) {
  const input = h('input', { type: 'range', min, max, step });
  const lab = h('span', { class: 'slider__label' });
  if (labelTex) renderTex(lab, labelTex); else setText(lab, label);
  if (label) setAttr(input, 'aria-label', label);
  const value = h('output', { class: 'slider__value' });
  input.addEventListener('input', () => set(parseFloat(input.value)));
  const el = h('div', { class: 'slider' }, lab, input, value);
  const update = () => {
    const v = get();
    if (parseFloat(input.value) !== v) input.value = v;
    value.textContent = format(v);
  };
  update();
  return { el, update, input };
}

export function button({ label, iconName = null, onClick, kind = '', title = null, small = false }) {
  const el = h('button', { type: 'button', class: `btn${kind ? ` btn--${kind}` : ''}${small ? ' btn--sm' : ''}` });
  if (iconName) el.append(icon(iconName));
  if (label) { const s = h('span'); setText(s, label); el.append(s); }
  if (title) setAttr(el, 'title', title);
  el.addEventListener('click', onClick);
  return el;
}

export function iconButton({ iconName, label, onClick, pressed = null }) {
  const el = h('button', { type: 'button', class: 'icon-btn' }, icon(iconName));
  setAttr(el, 'aria-label', label);
  setAttr(el, 'title', label);
  if (pressed !== null) el.setAttribute('aria-pressed', String(pressed));
  el.addEventListener('click', onClick);
  return el;
}

export function card({ title, actions = [], body = [], className = '' }) {
  const t = h('h2', { class: 'card__title' });
  setText(t, title);
  const bodyEl = h('div', { class: 'card__body' }, body);
  const el = h('section', { class: `card ${className}` },
    h('div', { class: 'card__head' }, t, actions.length ? h('div', { class: 'row' }, actions) : null),
    bodyEl);
  return { el, body: bodyEl, title: t };
}

/** A label/value row; set(tex | Node | string, note). */
export function readout(label, { block = false, labelTex = null } = {}) {
  const k = h('div', { class: 'readout__k' });
  if (labelTex) renderTex(k, labelTex); else setText(k, label);
  const v = h('div', { class: 'readout__v' });
  const note = h('div', { class: 'readout__note', hidden: true });
  const el = h('div', { class: `readout${block ? ' readout--block' : ''}` }, k, v, note);
  return {
    el,
    set(value, noteValue = null, { display = false } = {}) {
      if (value instanceof Node) v.replaceChildren(value);
      else if (typeof value === 'string') renderTex(v, value, { display });
      else if (value && value.html !== undefined) { v.innerHTML = value.html; v.__tex = null; }
      if (noteValue) {
        note.hidden = false;
        if (noteValue instanceof Node) note.replaceChildren(noteValue);
        else if (noteValue.html !== undefined) note.innerHTML = noteValue.html;
        else note.textContent = tr(noteValue);
      } else note.hidden = true;
    },
    show(visible) { el.hidden = !visible; },
  };
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

/**
 * Animation of a parameter t ∈ [0, max] stored in store[key].
 * stages: optional [{ from, to, label }] shown under the controls.
 */
export function animator({ store, key = 't', max = 1, stages = null, speed = 1, labelTex = 't', format = (x) => x.toFixed(2) }) {
  let playing = false;
  let loop = false;
  let rate = speed;
  let raf = null;
  let last = null;

  const playBtn = h('button', { type: 'button', class: 'icon-btn' });
  const loopBtn = h('button', { type: 'button', class: 'icon-btn' }, icon('loop'));
  setAttr(loopBtn, 'aria-label', { es: 'Repetir', en: 'Loop' });
  setAttr(loopBtn, 'title', { es: 'Repetir', en: 'Loop' });
  const tSlider = slider({
    label: { es: 'Parámetro de la animación', en: 'Animation parameter' }, labelTex, min: 0, max, step: max > 20 ? 0.5 : 0.005,
    get: () => store.get(key),
    set: (v) => { pause(); store.set({ [key]: v }); },
    format,
  });
  const speedSlider = slider({
    label: { es: 'Velocidad', en: 'Speed' }, min: 0.25, max: 3, step: 0.25,
    get: () => rate, set: (v) => { rate = v; speedSlider.update(); },
    format: (v) => `${v}×`,
  });
  const stageEls = stages ? stages.map((s) => { const e = h('span', { class: 'anim__stage' }); renderTex(e, s.label); return e; }) : [];
  const el = h('div', { class: 'anim' },
    h('div', { class: 'anim__buttons' }, playBtn, loopBtn),
    tSlider.el, speedSlider.el,
    stages ? h('div', { class: 'anim__stages' }, stageEls.flatMap((e, i) => (i ? [h('span', null, '→'), e] : [e]))) : null);

  function frame(now) {
    if (!playing) return;
    if (last === null) last = now;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    let t = store.get(key) + dt * rate * 0.5;
    if (t >= max) {
      if (loop) t = 0;
      else { t = max; playing = false; }
    }
    store.set({ [key]: t });
    renderPlay();
    if (playing) raf = requestAnimationFrame(frame);
  }
  function play() {
    if (playing) return;
    if (store.get(key) >= max - 1e-6) store.set({ [key]: 0 });
    playing = true; last = null;
    raf = requestAnimationFrame(frame);
    renderPlay();
  }
  function pause() {
    playing = false;
    cancelAnimationFrame(raf);
    renderPlay();
  }
  function toggle() { if (playing) pause(); else play(); }
  function renderPlay() {
    playBtn.replaceChildren(icon(playing ? 'pause' : 'play'));
    const lbl = playing ? { es: 'Pausar', en: 'Pause' } : { es: 'Reproducir', en: 'Play' };
    setAttr(playBtn, 'aria-label', lbl);
    setAttr(playBtn, 'title', lbl);
  }
  playBtn.addEventListener('click', toggle);
  loopBtn.addEventListener('click', () => { loop = !loop; loopBtn.setAttribute('aria-pressed', String(loop)); });
  loopBtn.setAttribute('aria-pressed', 'false');
  renderPlay();

  function update() {
    tSlider.update();
    if (stages) {
      const t = store.get(key);
      stages.forEach((s, i) => { stageEls[i].dataset.active = String(t > s.from - 1e-9 && (t < s.to || (i === stages.length - 1 && t <= s.to))); });
    }
  }
  update();
  return { el, update, play, pause, toggle, get playing() { return playing; } };
}

export { clamp };
