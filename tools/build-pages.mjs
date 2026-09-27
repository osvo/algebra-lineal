// Generates the thin HTML shell of every module page from the registry.
// Run with:  node tools/build-pages.mjs
// The pages are committed; this script only keeps them consistent.

import { writeFileSync } from 'node:fs';
import { MODULES } from '../assets/js/modules/registry.js';

const SITE = 'https://osvo.github.io/algebra-lineal/';
const THREE_PAGES = new Set(['t3d', 'nsq', 'sys', 'orth', 'svd']);

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
