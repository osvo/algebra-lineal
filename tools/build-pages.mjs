// Generates the thin HTML shell of every module page from the registry.
// Run with:  node tools/build-pages.mjs
// The pages are committed; this script only keeps them consistent.

import { writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { MODULES } from '../assets/js/modules/registry.js';

// GitHub Pages serves the site from the custom domain (osvo.github.io redirects there).
const SITE = 'https://osvo.com.co/algebra-lineal/';
const THREE_PAGES = new Set(['span', 't3d', 'det', 'nsq', 'sys', 'orth']);

const LEADS = {
  span: 'Combinaciones lineales, generado, independencia lineal, bases y dimensión en ℝ² y ℝ³, con ecuaciones exactas del generado.',
  t2d: 'Una matriz 2 × 2 mueve el plano entero: determinante, vectores propios, núcleo, imagen e inversa, de forma interactiva y exacta.',
  comp: 'Encadena dos transformaciones del plano y comprueba visualmente por qué el producto de matrices no conmuta.',
  t3d: 'Rotaciones, proyecciones, reflexiones y cizallas en el espacio: volumen, rango, ejes invariantes e inversa exacta.',
  det: 'Determinantes: área y volumen con signo, efecto de las operaciones de columna, regla de Cramer geométrica y desarrollo por cofactores.',
  sys: 'Sistemas de ecuaciones lineales 2 × 2 y 3 × 3: imagen de filas, imagen de columnas y eliminación gaussiana paso a paso.',
  nsq: 'Matrices no cuadradas como transformaciones entre espacios de distinta dimensión: imagen, núcleo y teorema del rango.',
  cob: 'Cambio de base: coordenadas de un mismo vector en dos bases y matrices semejantes P⁻¹AP.',
  eig: 'Valores y vectores propios: direcciones invariantes, dinámica discreta, diagonalización y forma de rotación-escalado.',
  orth: 'Producto punto, proyecciones ortogonales, Gram–Schmidt y mínimos cuadrados como proyección sobre el espacio columna.',
  quad: 'Formas cuadráticas y teorema espectral: cónicas como curvas de nivel, ejes principales, matrices definidas positivas y cociente de Rayleigh.',
  svd: 'Descomposición en valores singulares: el círculo unitario se convierte en una elipse; A = UΣVᵀ paso a paso.',
  poly: 'Espacios de polinomios: coordenadas en bases de monomios, Taylor, Lagrange y Legendre, la derivada como matriz e interpolación con Vandermonde.',
  nl: 'Transformaciones no lineales del plano, pruebas de linealidad y la matriz jacobiana como aproximación lineal local.',
};

export const EARLY_SCRIPT = `<script>(function(){var d=document.documentElement,l,t;try{l=new URLSearchParams(location.search).get('lang')||localStorage.getItem('linear-lab-language');t=localStorage.getItem('linear-lab-theme');}catch(e){}if(l!=='es'&&l!=='en')l=/^es/i.test(navigator.language||'')?'es':'en';d.lang=l;if(t==='auto')t=window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';else if(t!=='light')t='dark';d.setAttribute('data-theme',t);})();</script>`;

export function head({ title, description, path, extra = '' }) {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="theme-color" content="#181a1f">
<link rel="icon" href="assets/img/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="assets/img/icon-192.png">
<link rel="manifest" href="manifest.webmanifest">
<link rel="canonical" href="${SITE}${path}">
<link rel="alternate" hreflang="es" href="${SITE}${path}?lang=es">
<link rel="alternate" hreflang="en" href="${SITE}${path}?lang=en">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Laboratorio de Álgebra Lineal">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${SITE}${path}">
<meta property="og:image" content="${SITE}og.png">
<meta property="og:locale" content="es_CO">
<meta property="og:locale:alternate" content="en_US">
<meta name="twitter:card" content="summary_large_image">
${EARLY_SCRIPT}
<link rel="preload" href="vendor/fonts/manrope-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="assets/css/lab.css">
<link rel="stylesheet" href="vendor/katex/katex.min.css">${extra}`;
}

const NOSCRIPT = `<noscript><p style="padding:24px;font-family:sans-serif">Este laboratorio necesita JavaScript. · This laboratory needs JavaScript.</p></noscript>`;

for (const m of MODULES) {
  const importmap = THREE_PAGES.has(m.id)
    ? `\n<link rel="modulepreload" href="vendor/three/three-lab.min.js">`
    : '';
  const html = `<!doctype html>
<html lang="es" data-loading>
<head>
${head({ title: `${m.title.es} · Laboratorio de Álgebra Lineal`, description: LEADS[m.id], path: m.file, extra: importmap })}
<script type="module" src="assets/js/modules/${m.id}.js"></script>
</head>
<body>
${NOSCRIPT}
</body>
</html>
`;
  writeFileSync(new URL(`../${m.file}`, import.meta.url), html);
  console.log('wrote', m.file);
}

// ---------------------------------------------------------------------------
// Home page
// ---------------------------------------------------------------------------

const home = `<!doctype html>
<html lang="es" data-loading>
<head>
${head({ title: 'Laboratorio de Álgebra Lineal', description: 'Laboratorio interactivo y bilingüe de álgebra lineal: combinaciones lineales, transformaciones, determinantes, sistemas, cambio de base, valores propios, ortogonalidad, formas cuadráticas, SVD y espacios de polinomios, con cálculo exacto.', path: '' })}
<script type="module" src="assets/js/home.js"></script>
</head>
<body>
<noscript>
<main style="padding:16px;font-family:sans-serif">
<h1>Laboratorio de Álgebra Lineal</h1>
<p>Este laboratorio necesita JavaScript. · This laboratory needs JavaScript.</p>
<ul>${MODULES.map((m) => `<li><a href="${m.file}">${m.title.es}</a></li>`).join('')}</ul>
</main>
</noscript>
</body>
</html>
`;
writeFileSync(new URL('../index.html', import.meta.url), home);
console.log('wrote index.html');

// ---------------------------------------------------------------------------
// Service worker: precache every file the site needs, versioned by content hash.
// ---------------------------------------------------------------------------

const ROOT = new URL('..', import.meta.url).pathname;
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
const files = [
  ...MODULES.map((m) => m.file), 'index.html', 'manifest.webmanifest',
  ...walk(join(ROOT, 'assets')).map((f) => relative(ROOT, f)),
  ...walk(join(ROOT, 'vendor')).map((f) => relative(ROOT, f)).filter((f) => !/LICENSE$/.test(f)),
].filter((f, i, a) => a.indexOf(f) === i).sort();
const hash = createHash('sha1');
for (const f of files) { try { hash.update(f); hash.update(readFileSync(join(ROOT, f))); } catch { /* generated later */ } }
const version = hash.digest('hex').slice(0, 10);
const sw = `// Generated by tools/build-pages.mjs — do not edit by hand.
// Network first (always fresh when online), cache as offline fallback.
const CACHE = 'linear-lab-${version}';
const PRECACHE = ${JSON.stringify(['./', ...files], null, 0).replace(/","/g, '",\n  "')};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('linear-lab-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((cache) => cache.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html'))),
  );
});
`;
writeFileSync(join(ROOT, 'sw.js'), sw);
console.log('wrote sw.js', version, files.length, 'files');
