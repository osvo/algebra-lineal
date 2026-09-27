// Expression parser for numeric inputs ("1/3", "-√2/2", "cos(pi/3)", "2π", "0,5")
// and for formulas in variables ("x + 0.5*sin(y)").
//
// parseNumber(text) → { ok, x, q, error }: x is the float value and q an exact
// Rational when the expression denotes a rational number exactly.
// compileFormula(text, vars) → { ok, fn, error } with fn(...values) → number.

import { Rational } from './rational.js';

const FUNCS = {
  sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  exp: Math.exp, ln: Math.log, log: Math.log, abs: Math.abs,
  floor: Math.floor, ceil: Math.ceil, sign: Math.sign,
  atan2: Math.atan2, min: Math.min, max: Math.max, hypot: Math.hypot,
};
const FUNC_ALIASES = { raiz: 'sqrt', sen: 'sin', arcsin: 'asin', arccos: 'acos', arctan: 'atan', arcsen: 'asin' };
const CONSTS = { pi: Math.PI, 'π': Math.PI, e: Math.E, tau: 2 * Math.PI, 'τ': 2 * Math.PI };

class ParseError extends Error {}

function tokenize(src, { commaDecimal = false } = {}) {
  const s = src
    .replace(/[−–]/g, '-')
    .replace(/[×·⋅]/g, '*')
    .replace(/÷/g, '/')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3');
  const isDecimalMark = (c) => c === '.' || (commaDecimal && c === ',');
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(s[i + 1] || ''))) {
      let j = i;
      let text = '';
      while (j < s.length && /[0-9]/.test(s[j])) text += s[j++];
      if (isDecimalMark(s[j]) && /[0-9]/.test(s[j + 1] || '')) {
        text += '.'; j++;
        while (j < s.length && /[0-9]/.test(s[j])) text += s[j++];
      }
      // Scientific notation only when unambiguous (1e-3, 2E5); a lone "2e" means 2·e.
      if (/[eE]/.test(s[j] || '') && (/[0-9]/.test(s[j + 1] || '') || (/[+-]/.test(s[j + 1] || '') && /[0-9]/.test(s[j + 2] || '')))) {
        let k = j + 1; let exp = 'e';
        if (/[+-]/.test(s[k])) exp += s[k++];
        while (k < s.length && /[0-9]/.test(s[k])) exp += s[k++];
        text += exp; j = k;
      }
      tokens.push({ type: 'num', text });
      i = j;
      continue;
    }
    if (/[a-zA-Zπτ_]/.test(ch)) {
      let j = i; let name = '';
      while (j < s.length && /[a-zA-Zπτ_]/.test(s[j])) name += s[j++];
      // Digits belong to the name only for functions such as atan2 ("sqrt2" is √2).
      let k = j; let digits = '';
      while (k < s.length && /[0-9]/.test(s[k])) digits += s[k++];
      if (digits && FUNCS[(name + digits).toLowerCase()]) { name += digits; j = k; }
      tokens.push({ type: 'id', text: name.toLowerCase() });
      i = j;
      continue;
    }
    if (ch === '√') { tokens.push({ type: 'sqrt' }); i++; continue; }
    if ('+-*/^(),|'.includes(ch)) { tokens.push({ type: ch }); i++; continue; }
    throw new ParseError(`char:${ch}`);
  }
  return tokens;
}

/** Splits identifiers like "xy" or "2pi" is handled by the tokenizer; "pix" → pi·x when needed. */
function splitIdentifier(name, vars) {
  if (FUNCS[name] || FUNC_ALIASES[name] || name in CONSTS || vars.includes(name)) return [name];
  // Greedy split into known pieces (e.g. "xy" → x, y; "pix" → pi, x).
  const pieces = [];
  let rest = name;
  const known = [...Object.keys(CONSTS), ...vars].sort((a, b) => b.length - a.length);
  while (rest.length) {
    const k = known.find((w) => rest.startsWith(w));
    if (!k) return null;
    pieces.push(k);
    rest = rest.slice(k.length);
  }
  return pieces;
}

function parse(tokens, vars) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const expect = (type) => { const t = next(); if (!t || t.type !== type) throw new ParseError(`expected ${type}`); return t; };

  // Expand identifiers into implicit products.
  const expanded = [];
  for (const t of tokens) {
    if (t.type !== 'id') { expanded.push(t); continue; }
    const pieces = splitIdentifier(t.text, vars);
    if (!pieces) throw new ParseError(`unknown:${t.text}`);
    pieces.forEach((p) => expanded.push({ type: 'id', text: p }));
  }
  tokens = expanded;

  const startsPrimary = (t) => t && (t.type === 'num' || t.type === 'id' || t.type === '(' || t.type === 'sqrt');

  function parseExpr() {
    let node = parseTerm();
    while (peek() && (peek().type === '+' || peek().type === '-')) {
      const op = next().type;
      node = { op, a: node, b: parseTerm() };
    }
    return node;
  }
  function parseTerm() {
    let node = parseUnary();
    for (;;) {
      const t = peek();
      if (t && (t.type === '*' || t.type === '/')) { next(); node = { op: t.type, a: node, b: parseUnary() }; }
      else if (startsPrimary(t)) { node = { op: '*', a: node, b: parsePower() }; } // implicit product
      else break;
    }
    return node;
  }
  function parseUnary() {
    const t = peek();
    if (t && (t.type === '-' || t.type === '+')) { next(); const a = parseUnary(); return t.type === '-' ? { op: 'neg', a } : a; }
    return parsePower();
  }
  function parsePower() {
    const base = parsePrimary();
    if (peek() && peek().type === '^') { next(); return { op: '^', a: base, b: parseUnary() }; }
    return base;
  }
  function parsePrimary() {
    const t = next();
    if (!t) throw new ParseError('end');
    if (t.type === 'num') return { op: 'num', text: t.text };
    if (t.type === '(') { const e = parseExpr(); expect(')'); return e; }
    if (t.type === '|') { const e = parseExpr(); expect('|'); return { op: 'call', name: 'abs', args: [e] }; }
    if (t.type === 'sqrt') {
      // √x, √(x), √2π → √(2)·π is ambiguous; we bind √ to the next power expression.
      return { op: 'call', name: 'sqrt', args: [parsePower()] };
    }
    if (t.type === 'id') {
      const name = FUNC_ALIASES[t.text] || t.text;
      if (FUNCS[name]) {
        if (peek() && peek().type === '(') {
          next();
          const args = [parseExpr()];
          while (peek() && peek().type === ',') { next(); args.push(parseExpr()); }
          expect(')');
          return { op: 'call', name, args };
        }
        // sin x, sqrt 2: apply to the next power expression.
        return { op: 'call', name, args: [parsePower()] };
      }
      if (name in CONSTS) return { op: 'const', name };
      if (vars.includes(name)) return { op: 'var', name };
      throw new ParseError(`unknown:${t.text}`);
    }
    throw new ParseError(`unexpected:${t.type}`);
  }

  const tree = parseExpr();
  if (pos < tokens.length) throw new ParseError('trailing');
  return tree;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

function evalFloat(node, env) {
  switch (node.op) {
    case 'num': return parseFloat(node.text);
    case 'const': return CONSTS[node.name];
    case 'var': return env[node.name];
    case 'neg': return -evalFloat(node.a, env);
    case '+': return evalFloat(node.a, env) + evalFloat(node.b, env);
    case '-': return evalFloat(node.a, env) - evalFloat(node.b, env);
    case '*': return evalFloat(node.a, env) * evalFloat(node.b, env);
    case '/': return evalFloat(node.a, env) / evalFloat(node.b, env);
    case '^': return Math.pow(evalFloat(node.a, env), evalFloat(node.b, env));
    case 'call': return FUNCS[node.name](...node.args.map((a) => evalFloat(a, env)));
    default: throw new ParseError('node');
  }
}

/** Is the node a rational multiple of π? Returns the Rational coefficient or null. */
function piMultiple(node) {
  if (node.op === 'const' && (node.name === 'pi' || node.name === 'π')) return Rational.of(1);
  if (node.op === 'const' && (node.name === 'tau' || node.name === 'τ')) return Rational.of(2);
  if (node.op === 'neg') { const k = piMultiple(node.a); return k && k.neg(); }
  if (node.op === '*') {
    const ka = piMultiple(node.a), qb = evalExact(node.b);
    if (ka && qb) return ka.mul(qb);
    const kb = piMultiple(node.b), qa = evalExact(node.a);
    if (kb && qa) return kb.mul(qa);
  }
  if (node.op === '/') {
    const ka = piMultiple(node.a), qb = evalExact(node.b);
    if (ka && qb && !qb.isZero()) return ka.div(qb);
  }
  if (node.op === '+' || node.op === '-') {
    const ka = piMultiple(node.a), kb = piMultiple(node.b);
    if (ka && kb) return node.op === '+' ? ka.add(kb) : ka.sub(kb);
  }
  const q = evalExact(node);
  if (q && q.isZero()) return q;
  return null;
}

function floorRational(r) {
  const q = r.n / r.d; // BigInt division truncates toward zero
  return r.n < 0n && q * r.d !== r.n ? q - 1n : q;
}

/** Exact trigonometric values at rational multiples of π when the value is rational. */
function exactTrig(name, k) {
  // k = angle / π, reduce modulo 2.
  const two = Rational.of(2);
  const r = k.sub(two.mul(new Rational(floorRational(k.div(two)))));
  const is = (n, d) => r.equals(Rational.of(n, d));
  const half = Rational.of(1, 2);
  if (name === 'sin') {
    if (is(0, 1) || is(1, 1)) return Rational.of(0);
    if (is(1, 2)) return Rational.of(1);
    if (is(3, 2)) return Rational.of(-1);
    if (is(1, 6) || is(5, 6)) return half;
    if (is(7, 6) || is(11, 6)) return half.neg();
  }
  if (name === 'cos') {
    if (is(0, 1)) return Rational.of(1);
    if (is(1, 1)) return Rational.of(-1);
    if (is(1, 2) || is(3, 2)) return Rational.of(0);
    if (is(1, 3) || is(5, 3)) return half;
    if (is(2, 3) || is(4, 3)) return half.neg();
  }
  if (name === 'tan') {
    if (is(0, 1) || is(1, 1)) return Rational.of(0);
    if (is(1, 4) || is(5, 4)) return Rational.of(1);
    if (is(3, 4) || is(7, 4)) return Rational.of(-1);
  }
  return null;
}

function evalExact(node) {
  try {
    switch (node.op) {
      case 'num': return Rational.fromDecimalString(node.text);
      case 'neg': { const a = evalExact(node.a); return a && a.neg(); }
      case '+': case '-': case '*': case '/': {
        const a = evalExact(node.a); if (!a) return null;
        const b = evalExact(node.b); if (!b) return null;
        if (node.op === '+') return a.add(b);
        if (node.op === '-') return a.sub(b);
        if (node.op === '*') return a.mul(b);
        return b.isZero() ? null : a.div(b);
      }
      case '^': {
        const a = evalExact(node.a); const b = evalExact(node.b);
        if (!a || !b) return null;
        if (b.isInteger() && Math.abs(b.toNumber()) <= 64) {
          if (a.isZero() && b.sign() < 0) return null;
          return a.pow(b.toNumber());
        }
        if (b.equals(Rational.of(1, 2))) return exactSqrt(a);
        return null;
      }
      case 'call': {
        if (node.name === 'sqrt') { const a = evalExact(node.args[0]); return a && exactSqrt(a); }
        if (node.name === 'abs') { const a = evalExact(node.args[0]); return a && a.abs(); }
        if (['sin', 'cos', 'tan'].includes(node.name)) {
          const k = piMultiple(node.args[0]);
          return k ? exactTrig(node.name, k) : null;
        }
        return null;
      }
      default: return null;
    }
  } catch { return null; }
}

function exactSqrt(a) {
  if (a.sign() < 0) return null;
  const rootN = intSqrt(a.n), rootD = intSqrt(a.d);
  return rootN !== null && rootD !== null ? new Rational(rootN, rootD) : null;
}

function intSqrt(n) {
  if (n < 0n) return null;
  const r = BigInt(Math.round(Math.sqrt(Number(n))));
  for (const c of [r - 1n, r, r + 1n]) if (c >= 0n && c * c === n) return c;
  return null;
}

function compileNode(node) {
  switch (node.op) {
    case 'num': { const v = parseFloat(node.text); return () => v; }
    case 'const': { const v = CONSTS[node.name]; return () => v; }
    case 'var': { const k = node.name; return (env) => env[k]; }
    case 'neg': { const a = compileNode(node.a); return (env) => -a(env); }
    case '+': { const a = compileNode(node.a), b = compileNode(node.b); return (env) => a(env) + b(env); }
    case '-': { const a = compileNode(node.a), b = compileNode(node.b); return (env) => a(env) - b(env); }
    case '*': { const a = compileNode(node.a), b = compileNode(node.b); return (env) => a(env) * b(env); }
    case '/': { const a = compileNode(node.a), b = compileNode(node.b); return (env) => a(env) / b(env); }
    case '^': { const a = compileNode(node.a), b = compileNode(node.b); return (env) => Math.pow(a(env), b(env)); }
    case 'call': {
      const f = FUNCS[node.name]; const args = node.args.map(compileNode);
      if (args.length === 1) { const a = args[0]; return (env) => f(a(env)); }
      return (env) => f(...args.map((g) => g(env)));
    }
    default: throw new ParseError('node');
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseNumber(text) {
  const src = String(text ?? '').trim();
  if (!src) return { ok: false, error: 'empty' };
  try {
    const tree = parse(tokenize(src, { commaDecimal: true }), []);
    const q = evalExact(tree);
    const x = q ? q.toNumber() : evalFloat(tree, {});
    if (!Number.isFinite(x)) return { ok: false, error: 'nan' };
    return { ok: true, x, q };
  } catch (err) {
    return { ok: false, error: err instanceof ParseError ? err.message : 'syntax' };
  }
}

export function compileFormula(text, vars = ['x', 'y']) {
  const src = String(text ?? '').trim();
  if (!src) return { ok: false, error: 'empty' };
  try {
    const tree = parse(tokenize(src), vars);
    const f = compileNode(tree);
    const fn = (...values) => {
      const env = {};
      vars.forEach((v, i) => { env[v] = values[i]; });
      return f(env);
    };
    // Smoke test at a generic point.
    const probe = fn(...vars.map((_, i) => 0.37 + 0.11 * i));
    if (typeof probe !== 'number') return { ok: false, error: 'nan' };
    return { ok: true, fn };
  } catch (err) {
    return { ok: false, error: err instanceof ParseError ? err.message : 'syntax' };
  }
}

/** Canonical text for a snapped float (used when a handle is dragged). */
export function numberToInput(x) {
  if (Math.abs(x) < 1e-12) return '0';
  const r = Math.round(x * 1e6) / 1e6;
  return String(r);
}

/** Entry object used across the UI: { text, x, q, ok }. */
export function makeEntry(text) {
  const p = parseNumber(text);
  return p.ok ? { text: String(text), x: p.x, q: p.q, ok: true } : { text: String(text), x: 0, q: null, ok: false, error: p.error };
}

export function entryFromNumber(x) { return makeEntry(numberToInput(x)); }
