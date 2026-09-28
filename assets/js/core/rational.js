// Exact rational numbers backed by BigInt.
// Every value is kept in lowest terms with a positive denominator.

const ZERO_N = 0n;
const ONE_N = 1n;

function bigAbs(a) { return a < ZERO_N ? -a : a; }

export function bigGcd(a, b) {
  a = bigAbs(a); b = bigAbs(b);
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

export class Rational {
  constructor(num, den = ONE_N) {
    num = BigInt(num); den = BigInt(den);
    if (den === ZERO_N) throw new RangeError('Rational: zero denominator');
    if (den < ZERO_N) { num = -num; den = -den; }
    const g = bigGcd(num, den) || ONE_N;
    this.n = num / g;
    this.d = den / g;
  }

  static of(num, den = 1) { return new Rational(BigInt(num), BigInt(den)); }

  /** Exact conversion of a finite JS number whose decimal expansion is short (e.g. 1.25, -0.1). */
  static fromDecimalString(text) {
    const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text.trim());
    if (!m || (m[2] === '' && (m[3] === undefined || m[3] === ''))) return null;
    const sign = m[1] === '-' ? -ONE_N : ONE_N;
    const intPart = m[2] || '0';
    const frac = m[3] || '';
    let num = BigInt(intPart + frac);
    let den = 10n ** BigInt(frac.length);
    const exp = m[4] ? parseInt(m[4], 10) : 0;
    if (Math.abs(exp) > 60) return null;
    if (exp > 0) num *= 10n ** BigInt(exp);
    if (exp < 0) den *= 10n ** BigInt(-exp);
    return new Rational(sign * num, den);
  }

  /** Exact value of a JS number when it is a short decimal (as produced by snapping); otherwise null. */
  static fromNumber(x, maxDecimals = 12) {
    if (!Number.isFinite(x)) return null;
    if (Number.isInteger(x)) return new Rational(BigInt(x));
    const s = x.toFixed(maxDecimals).replace(/0+$/, '');
    const r = Rational.fromDecimalString(s);
    if (r && Math.abs(r.valueOf() - x) <= 1e-15 * Math.max(1, Math.abs(x))) return r;
    return null;
  }

  /** Best rational approximation with denominator <= maxDen (continued fractions), or null if not within tol. */
  static approximate(x, maxDen = 1000, tol = 1e-10) {
    if (!Number.isFinite(x)) return null;
    const sign = x < 0 ? -1 : 1;
    let v = Math.abs(x);
    let h0 = 0, h1 = 1, k0 = 1, k1 = 0;
    for (let i = 0; i < 40; i++) {
      const a = Math.floor(v);
      const h2 = a * h1 + h0; const k2 = a * k1 + k0;
      if (k2 > maxDen) break;
      h0 = h1; h1 = h2; k0 = k1; k1 = k2;
      if (Math.abs(Math.abs(x) - h1 / k1) <= tol * Math.max(1, Math.abs(x))) {
        return new Rational(BigInt(sign * h1), BigInt(k1));
      }
      const rest = v - a;
      if (rest < 1e-15) break;
      v = 1 / rest;
    }
    if (k1 > 0 && Math.abs(Math.abs(x) - h1 / k1) <= tol * Math.max(1, Math.abs(x))) {
      return new Rational(BigInt(sign * h1), BigInt(k1));
    }
    return null;
  }

  add(o) { return new Rational(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { return new Rational(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { return new Rational(this.n * o.n, this.d * o.d); }
  div(o) {
    if (o.n === ZERO_N) throw new RangeError('Rational: division by zero');
    return new Rational(this.n * o.d, this.d * o.n);
  }
  neg() { return new Rational(-this.n, this.d); }
  inv() { return new Rational(this.d, this.n); }
  abs() { return this.n < ZERO_N ? this.neg() : this; }
  pow(k) {
    let result = new Rational(ONE_N);
    let base = k < 0 ? this.inv() : this;
    let e = Math.abs(k);
    while (e > 0) {
      if (e & 1) result = result.mul(base);
      base = base.mul(base);
      e >>= 1;
    }
    return result;
  }
  isZero() { return this.n === ZERO_N; }
  isOne() { return this.n === ONE_N && this.d === ONE_N; }
  isInteger() { return this.d === ONE_N; }
  sign() { return this.n > ZERO_N ? 1 : this.n < ZERO_N ? -1 : 0; }
  equals(o) { return this.n === o.n && this.d === o.d; }
  cmp(o) { const diff = this.n * o.d - o.n * this.d; return diff > ZERO_N ? 1 : diff < ZERO_N ? -1 : 0; }
  valueOf() { return Number(this.n) / Number(this.d); }
  toNumber() {
    // Safe for large magnitudes: scale before converting.
    const n = this.n, d = this.d;
    const f = Number(n) / Number(d);
    if (Number.isFinite(f)) return f;
    const shift = BigInt(Math.max(0, n.toString().length - 300));
    return Number(n / 10n ** shift) / Number(d / 10n ** shift);
  }
  /** Size of the representation, used to decide whether a fraction is "readable". */
  get complexity() { return bigAbs(this.n).toString().length + this.d.toString().length; }
  toString() { return this.d === ONE_N ? this.n.toString() : `${this.n}/${this.d}`; }
}

export const Q = {
  ZERO: new Rational(0n),
  ONE: new Rational(1n),
  of: Rational.of,
};

/** Exact integer square root of a non-negative BigInt, or null if not a perfect square. */
export function bigSqrtExact(n) {
  if (n < ZERO_N) return null;
  if (n < 2n) return n;
  let x = BigInt(Math.floor(Math.sqrt(Number(n))));
  // Newton refinement for large values.
  for (let i = 0; i < 100; i++) {
    const y = (x + n / x) >> 1n;
    if (bigAbs(y - x) <= ONE_N) { x = y; break; }
    x = y;
  }
  while (x * x > n) x -= ONE_N;
  while ((x + ONE_N) * (x + ONE_N) <= n) x += ONE_N;
  return x * x === n ? x : null;
}

/**
 * Writes a non-negative BigInt as k² · m with m square-free (trial division, bounded).
 * Returns null when n is too large to factor quickly.
 */
export function squareFreeDecomposition(n) {
  if (n < ZERO_N) return null;
  if (n === ZERO_N) return { k: ZERO_N, m: ONE_N };
  if (n > 10n ** 14n) return null;
  let k = ONE_N, m = ONE_N, rest = n;
  for (let p = 2n; p * p <= rest; p += (p === 2n ? 1n : 2n)) {
    let e = 0;
    while (rest % p === ZERO_N) { rest /= p; e++; }
    if (e) {
      k *= p ** BigInt(Math.floor(e / 2));
      if (e % 2) m *= p;
    }
  }
  m *= rest;
  return { k, m };
}

/** sqrt of a non-negative rational as (a) · √m with a rational and m square-free integer. */
export function sqrtRational(r) {
  if (r.sign() < 0) return null;
  if (r.isZero()) return { coef: Q.ZERO, m: ONE_N };
  // √(n/d) = √(n·d)/d
  const dec = squareFreeDecomposition(r.n * r.d);
  if (!dec) return null;
  return { coef: new Rational(dec.k, r.d), m: dec.m };
}
