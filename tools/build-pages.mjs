// Generates the thin HTML shell of every module page from the registry.
// Run with:  node tools/build-pages.mjs
// The pages are committed; this script only keeps them consistent.

import { writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { MODULES } from '../assets/js/modules/registry.js';

const SITE = 'https://osvo.github.io/algebra-lineal/';
const THREE_PAGES = new Set(['t3d', 'nsq', 'sys', 'orth']);

const LEADS = {
  t2d: 'Una matriz 2 × 2 mueve el plano entero: determinante, vectores propios, núcleo, imagen e inversa, de forma interactiva y exacta.',
  comp: 'Encadena dos transformaciones del plano y comprueba visualmente por qué el producto de matrices no conmuta.',
  t3d: 'Rotaciones, proyecciones, reflexiones y cizallas en el espacio: volumen, rango, ejes invariantes e inversa exacta.',
  sys: 'Sistemas de ecuaciones lineales 2 × 2 y 3 × 3: imagen de filas, imagen de columnas y eliminación gaussiana paso a paso.',
  nsq: 'Matrices no cuadradas como transformaciones entre espacios de distinta dimensión: imagen, núcleo y teorema del rango.',
  cob: 'Cambio de base: coordenadas de un mismo vector en dos bases y matrices semejantes P⁻¹AP.',
  eig: 'Valores y vectores propios: direcciones invariantes, dinámica discreta, diagonalización y forma de rotación-escalado.',
  orth: 'Producto punto, proyecciones ortogonales, Gram–Schmidt y mínimos cuadrados como proyección sobre el espacio columna.',
  svd: 'Descomposición en valores singulares: el círculo unitario se convierte en una elipse; A = UΣVᵀ paso a paso.',
  nl: 'Transformaciones no lineales del plano, pruebas de linealidad y la matriz jacobiana como aproximación lineal local.',
};

export const EARLY_SCRIPT = `<script>(function(){var d=document.documentElement,l,t;try{l=new URLSearchParams(location.search).get('lang')||localStorage.getItem('linear-lab-language');t=localStorage.getItem('linear-lab-theme');}catch(e){}if(l!=='es'&&l!=='en')l=/^es/i.test(navigator.language||'')?'es':'en';d.lang=l;if(t!=='dark'&&t!=='light')t=window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';d.setAttribute('data-theme',t);})();</script>`;

export function head({ title, description, path, extra = '' }) {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="theme-color" content="#0c0f0d">
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

const T = (es, en, tag = 'span', attrs = '') => `<${tag} data-es="${es.replace(/"/g, '&quot;')}" data-en="${en.replace(/"/g, '&quot;')}"${attrs}>${es}</${tag}>`;

const TOTAL = MODULES.reduce((s, m) => s + m.challenges, 0);
const FEATURES = [
  ['ℚ', 'Exacto', 'Exact', 'Escribe 1/3, √2 o cos(π/6). Determinantes, inversas, valores propios y proyecciones se calculan con fracciones y radicales exactos.', 'Type 1/3, √2 or cos(π/6). Determinants, inverses, eigenvalues and projections are computed with exact fractions and radicals.'],
  ['∴', 'Explicado', 'Explained', 'Cada módulo explica qué estás viendo y trae una sección «Formalmente» con definiciones y teoremas enunciados con precisión.', 'Every module explains what you are seeing and has a “Formally” section with precisely stated definitions and theorems.'],
  ['✓', 'Retos', 'Challenges', `${TOTAL} ejercicios interactivos con verificación automática y pistas. Tu progreso se guarda en este navegador.`, `${TOTAL} interactive exercises with automatic checking and hints. Your progress is saved in this browser.`],
  ['↗', 'Compartible', 'Shareable', 'Cada configuración vive en la URL: compártela, proyéctala en modo presentación o descárgala como PNG. Funciona sin conexión.', 'Every configuration lives in the URL: share it, project it in presentation mode or download it as a PNG. Works offline.'],
];

const home = `<!doctype html>
<html lang="es" data-loading>
<head>
${head({ title: 'Laboratorio de Álgebra Lineal · Las matrices también se mueven', description: 'Laboratorio interactivo y bilingüe para aprender álgebra lineal de forma visual y exacta: transformaciones, sistemas, cambio de base, valores propios, ortogonalidad y SVD.', path: '' })}
<script type="module" src="assets/js/home.js"></script>
</head>
<body class="home">
<a class="skip-link" href="#modulos">${T('Saltar a los módulos', 'Skip to the modules')}</a>
<main>
  <section class="home-hero">
    <div>
      <p class="kicker">${T('Álgebra lineal, a la vista', 'Linear algebra, in plain sight')}</p>
      <h1 data-es="Las matrices también se &lt;em&gt;mueven.&lt;/em&gt;" data-en="Matrices move, &lt;em&gt;too.&lt;/em&gt;" data-html>Las matrices también se <em>mueven.</em></h1>
    </div>
    <div class="hero-copy">
      ${T('Arrastra un vector, cambia una base y observa cómo responde el espacio. Diez laboratorios que convierten operaciones abstractas en intuición visible, con cálculos exactos y explicaciones rigurosas.', 'Drag a vector, change a basis and watch space respond. Ten labs that turn abstract operations into visible intuition, with exact computations and rigorous explanations.', 'p')}
      <div class="hero-actions">
        <a class="btn btn--primary" href="transformaciones_2D.html">${T('Empezar por el módulo 01', 'Start with module 01')}</a>
        <a class="btn" href="#modulos">${T('Ver todos los módulos', 'See all modules')}</a>
      </div>
      <p class="credit">${T('Proyecto independiente inspirado en las matemáticas visuales de', 'Independent project inspired by the visual mathematics of')} <a href="https://www.3blue1brown.com/" target="_blank" rel="noopener noreferrer">3Blue1Brown ↗</a></p>
    </div>
  </section>
  <div class="hero-art" id="hero-art"><div class="hero-art__caption" id="hero-caption"></div></div>

  <section class="features" aria-label="features">
    <div class="features__inner">
${FEATURES.map(([sym, es, en, des, den]) => `      <div class="feature"><span aria-hidden="true">${sym}</span>${T(es, en, 'h3')}${T(des, den, 'p')}</div>`).join('\n')}
    </div>
  </section>

  <section class="modules" id="modulos">
    <div class="section-head">
      ${T('Diez formas de ver lo invisible.', 'Ten ways to see the invisible.', 'h2')}
      ${T('Un recorrido sugerido: del plano al espacio, de los sistemas a los subespacios, del cambio de base al espectro, y de la geometría euclídea a lo que ya no es lineal. Cada módulo es independiente.', 'A suggested path: from the plane to space, from systems to subspaces, from change of basis to the spectrum, and from Euclidean geometry to what is no longer linear. Every module stands on its own.', 'p')}
    </div>
    <div id="module-list"></div>
    <noscript><ul>${MODULES.map((m) => `<li><a href="${m.file}">${m.title.es}</a></li>`).join('')}</ul></noscript>
  </section>

  <section class="learning-note">
    <div class="learning-note__inner">
      ${T('No memorices primero. Manipula, observa y luego nombra.', 'Do not memorize first. Manipulate, observe, then name.', 'h2')}
      ${T('Cada control modifica una representación matemática y cada gráfico convierte el resultado en algo que puedes inspeccionar. Cuando la intuición esté lista, la pestaña «Formalmente» te espera con los enunciados precisos.', 'Every control changes a mathematical representation and every picture turns the result into something you can inspect. When the intuition is ready, the “Formally” tab is waiting with the precise statements.', 'p')}
    </div>
  </section>
</main>
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
