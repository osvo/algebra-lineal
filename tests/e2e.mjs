// Browser smoke tests: every page loads without errors in both languages and
// themes, the core interactions work, and a few exact results appear on screen.
// Run with:  node tests/e2e.mjs   (requires Playwright with Chromium)

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const { MODULES } = await import('../assets/js/modules/registry.js');

let playwright;
try { playwright = await import('playwright'); } catch { playwright = await import('/opt/node22/lib/node_modules/playwright/index.mjs'); }
const { chromium } = playwright;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html';
  try {
    const data = await readFile(join(ROOT, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
let failures = 0;
const results = [];

async function check(name, fn) {
  try { await fn(); results.push(`ok   ${name}`); }
  catch (err) { failures++; results.push(`FAIL ${name}\n     ${String(err.message).split('\n').join('\n     ')}`); }
}

async function openPage(path, { lang = 'es', scheme = 'dark', width = 1300, height = 900 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, locale: lang === 'es' ? 'es-ES' : 'en-US' });
  // The app is dark by default; the light theme is a stored preference.
  if (scheme === 'light') await context.addInitScript(() => { try { localStorage.setItem('linear-lab-theme', 'light'); } catch { /* ignore */ } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/WebGL|swiftshader|GPU stall|GroupMarkerNotSet/i.test(t)) return;
    errors.push(`console: ${t}`);
  });
  page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
  const sep = path.includes('?') ? '&' : '?';
  await page.goto(`${BASE}${path}${sep}lang=${lang}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-loading'));
  await page.waitForTimeout(250);
  return { page, context, errors };
}

// 1. Every page, both languages, both themes.
for (const lang of ['es', 'en']) {
  for (const scheme of ['dark', 'light']) {
    for (const path of ['index.html', ...MODULES.map((m) => m.file)]) {
      await check(`${path} [${lang}, ${scheme}] loads cleanly`, async () => {
        const { page, context, errors } = await openPage(path, { lang, scheme });
        assert.equal(await page.evaluate(() => document.documentElement.lang), lang);
        assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), scheme);
        if (path !== 'index.html') {
          const count = await page.locator('#tab-challenges').innerText();
          const m = MODULES.find((x) => x.file === path);
          assert.match(count, new RegExp(`0/${m.challenges}`), `challenge count for ${m.id}`);
          assert.ok(await page.locator('.katex').count() > 0, 'math is rendered');
        }
        assert.deepEqual(errors, []);
        await context.close();
      });
    }
  }
}

// 2. Exact results appear on screen.
await check('2D: default determinant and exact eigenvalues', async () => {
  const { page, context, errors } = await openPage('transformaciones_2D.html');
  const tex = (await page.locator('.panel annotation').allTextContents()).join(' | ');
  assert.match(tex, /\\frac\{3 \+ \\sqrt\{5\}\}\{2\}/, 'λ₁ = (3 + √5)/2');
  assert.match(tex, /\\frac\{1 \+ \\sqrt\{5\}\}\{2\}/, 'eigenvector with the golden ratio');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('3D: exact inverse of [[2,1,0],[1,2,0],[0,0,1]] (former NaN/NaN bug)', async () => {
  const { page, context, errors } = await openPage('transformaciones_3D.html?A=2,1,0;1,2,0;0,0,1');
  const html = await page.locator('.panel').innerHTML();
  assert.ok(!/NaN/.test(html), 'no NaN');
  const tex = (await page.locator('.panel annotation').allTextContents()).join(' | ');
  assert.match(tex, /\\frac\{2\}\{3\}/, 'contains 2/3');
  assert.match(tex, /-\\frac\{1\}\{3\}/, 'contains -1/3');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('systems: next step keeps the solution (2, 1)', async () => {
  const { page, context, errors } = await openPage('sistemas_lineales.html');
  await page.getByRole('button', { name: /Paso siguiente/ }).click();
  await page.getByRole('button', { name: /Hasta el final/ }).click();
  const text = await page.locator('.panel').innerText();
  assert.match(text, /Escalonada reducida ✓/);
  const tex = (await page.locator('.panel annotation').allTextContents()).join(' | ');
  assert.match(tex, /\\begin\{array\}\{cc\|c\} \\htmlClass\{c-accent\}\{\\boxed\{1\}\} & 0 & 2 \\\\ 0 & \\htmlClass\{c-accent\}\{\\boxed\{1\}\} & 1/, 'RREF [I | (2, 1)]');
  await page.waitForTimeout(400);
  assert.ok(new URL(page.url()).searchParams.get('ops'), 'operations are stored in the URL');
  assert.deepEqual(errors, []);
  await context.close();
});

// 3. Interactions: typing, dragging, language switch, sharing, presentation, PNG.
await check('typing an exact value updates the analysis and the URL', async () => {
  const { page, context, errors } = await openPage('transformaciones_2D.html');
  const cell = page.locator('.matrix input').first();
  await cell.fill('1/3');
  await page.waitForTimeout(400);
  assert.match(new URL(page.url()).searchParams.get('A') || '', /1\/3/);
  await cell.fill('abc');
  assert.equal(await cell.getAttribute('aria-invalid'), 'true');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('dragging a handle changes the matrix', async () => {
  const { page, context, errors } = await openPage('transformaciones_2D.html');
  const before = await page.locator('.matrix input').first().inputValue();
  const box = await page.locator('.view canvas').boundingBox();
  // î = (2, 1) by default; the view is centred at the origin.
  const scale = await page.evaluate(() => {
    const r = document.querySelector('.view').getBoundingClientRect();
    return Math.min(r.height, r.width * 0.75) / (2 * 4.2);
  });
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx + 2 * scale, cy - 1 * scale);
  await page.mouse.down();
  await page.mouse.move(cx + 3 * scale, cy - 2 * scale, { steps: 8 });
  await page.mouse.up();
  const after = await page.locator('.matrix input').first().inputValue();
  assert.notEqual(before, after);
  assert.equal(after, '3');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('language switch updates the page without reloading', async () => {
  const { page, context, errors } = await openPage('valores_propios.html');
  await page.evaluate(() => { window.__marker = 1; });
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__marker), 1);
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
  assert.match(await page.locator('h1').innerText(), /Eigenvalues/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('share, presentation mode and PNG export', async () => {
  const { page, context, errors } = await openPage('composiciones.html');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: /Compartir/ }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(copied, /composiciones\.html\?.*lang=es/);
  await page.keyboard.press('p');
  assert.ok(await page.evaluate(() => document.body.classList.contains('presenting')));
  await page.keyboard.press('Escape');
  assert.ok(!(await page.evaluate(() => document.body.classList.contains('presenting'))));
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /^PNG/ }).click()]);
  assert.match(download.suggestedFilename(), /^algebra-lineal-comp-.*\.png$/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('challenges: activating and solving one', async () => {
  const { page, context, errors } = await openPage('transformaciones_2D.html');
  await page.getByRole('tab', { name: /Retos/ }).click();
  await page.locator('.challenge').nth(2).getByRole('button').click(); // rank 1
  const inputs = page.locator('.matrix input');
  await inputs.nth(0).fill('1'); await inputs.nth(1).fill('2'); await inputs.nth(2).fill('2'); await inputs.nth(3).fill('4');
  await page.waitForTimeout(300);
  assert.match(await page.locator('#tab-challenges').innerText(), /1\/5/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('switching dimensions in non-square matrices frees old views', async () => {
  const { page, context, errors } = await openPage('matrices_no_cuadradas.html');
  for (const d of ['2x3', '1x2', '3x1', '2x1', '3x2', '1x3', '3x2', '2x3']) {
    await page.locator('.panel select').first().selectOption(d);
    await page.waitForTimeout(80);
  }
  const canvases = await page.locator('.stage canvas').count();
  assert.ok(canvases <= 2, `expected at most 2 canvases, found ${canvases}`);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('systems: floating-point elimination with √3 reaches the RREF', async () => {
  const { page, context, errors } = await openPage('sistemas_lineales.html?A=sqrt(3),1;1,sqrt(3)&b=1,2');
  await page.getByRole('button', { name: /Paso siguiente/ }).click();
  await page.getByRole('button', { name: /Hasta el final/ }).click();
  assert.match(await page.locator('.panel').innerText(), /Escalonada reducida ✓/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('animation stage labels show one active stage', async () => {
  for (const [path, count] of [['valores_propios.html?mode=diag', 3], ['svd.html', 3], ['composiciones.html', 2]]) {
    const { page, context, errors } = await openPage(path);
    const stages = page.locator('.anim__stages:visible .anim__stage');
    assert.equal(await stages.count(), count, `${path}: number of stages`);
    assert.equal(await page.locator('.anim__stages:visible .anim__stage[data-active="true"]').count(), 1, `${path}: one active stage`);
    assert.ok(!(await page.locator('.anim__stages:visible').innerText()).includes('.;'), `${path}: TeX spacing is not printed literally`);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

await check('PNG export with several views (2D + 3D)', async () => {
  for (const [path, id] of [['matrices_no_cuadradas.html', 'nsq'], ['ortogonalidad.html', 'orth']]) {
    const { page, context, errors } = await openPage(path);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /^PNG/ }).click()]);
    assert.match(download.suggestedFilename(), new RegExp(`^algebra-lineal-${id}-.*\\.png$`));
    assert.deepEqual(errors, []);
    await context.close();
  }
});

await check('KaTeX accents such as \\vec are drawn (non-zero SVG width)', async () => {
  const { page, context, errors } = await openPage('combinaciones_lineales.html');
  const widths = await page.$$eval('.katex svg', (els) => els.filter((e) => e.getClientRects().length && e.closest('[hidden]') === null).map((e) => e.getBoundingClientRect().width));
  assert.ok(widths.length > 0, 'there are accent SVGs');
  assert.ok(widths.every((w) => w > 0), `zero-width accents: ${widths.filter((w) => w <= 0).length}`);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('span: dependency relation and target coefficients are exact', async () => {
  const { page, context, errors } = await openPage('combinaciones_lineales.html?k=3&show=path.span.w');
  const tex = (await page.locator('.panel annotation').allTextContents()).join(' | ');
  assert.match(tex, /\\vec\{v\}_\{3\}\} = \\mathbf\{0\}/, 'a relation ending in = 0');
  assert.match(tex, /\\vec\{w\} = 2\\,/, 'w = 2 v₁ + …');
  await page.getByRole('button', { name: /Usar estos coeficientes/ }).click();
  await page.waitForTimeout(150);
  assert.match(await page.locator('.panel').innerText(), /¡u ya es w!/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('span: 3D view and dragging the tip of u changes the coefficients', async () => {
  const { page, context, errors } = await openPage('combinaciones_lineales.html');
  const before = await page.locator('.panel .matrix input').nth(4).inputValue();
  const box = await page.locator('.view canvas').boundingBox();
  const scale = await page.evaluate(() => { const r = document.querySelector('.view').getBoundingClientRect(); return Math.min(r.height, r.width * 0.75) / (2 * 4.2); });
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  // u = v₁ + v₂ = (1, 2) by default.
  await page.mouse.move(cx + 1 * scale, cy - 2 * scale);
  await page.mouse.down();
  await page.mouse.move(cx + 3 * scale, cy - 3 * scale, { steps: 8 });
  await page.mouse.up();
  const after = await page.locator('.panel .matrix input').nth(4).inputValue();
  assert.notEqual(before, after, 'c₁ changed');
  await page.locator('.panel .seg').first().locator('button').nth(1).click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.stage canvas').count(), 1);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('determinants: a shear keeps det, applying it updates A; Cramer and cofactors are exact', async () => {
  const { page, context, errors } = await openPage('determinantes.html');
  await page.getByRole('button', { name: /Aplicar a A/ }).click();
  await page.waitForTimeout(150);
  const vals = await page.locator('.panel .matrix input').evaluateAll((els) => els.slice(0, 4).map((e) => e.value));
  assert.deepEqual(vals, ['3', '4', '1', '3'], 'â₂ ← â₂ + â₁');
  let tex = (await page.locator('.panel annotation').allTextContents()).join(' | ');
  assert.match(tex, /= 5/);
  await page.getByRole('button', { name: 'Cramer', exact: true }).click();
  await page.waitForTimeout(150);
  tex = (await page.locator('.panel annotation').allTextContents()).join(' | ');
  assert.match(tex, /x_1 = \\frac\{\\det/);
  await page.getByRole('button', { name: /Volumen 3D/ }).click();
  await page.waitForTimeout(300);
  tex = (await page.locator('.panel annotation').allTextContents()).join(' | ');
  assert.match(tex, /= 3/, 'det of the default 3 × 3 matrix');
  assert.match(tex, /\\begin\{vmatrix\}/, 'cofactor expansion');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('quadratic forms: editing b mirrors it and the classification changes', async () => {
  const { page, context, errors } = await openPage('formas_cuadraticas.html');
  const cells = page.locator('.panel .matrix input');
  await cells.nth(1).fill('3');
  await page.waitForTimeout(200);
  assert.equal(await cells.nth(2).inputValue(), '3', 'symmetric');
  assert.match(await page.locator('.panel').innerText(), /Indefinida/);
  const tex = (await page.locator('.panel annotation').allTextContents()).join(' | ');
  assert.match(tex, /\\lambda_1 = 5/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('polynomials: interpolation through four points is exact', async () => {
  const { page, context, errors } = await openPage('polinomios.html?mode=interp&deg=3');
  const tex = (await page.locator('.panel annotation').allTextContents()).join(' | ');
  assert.match(tex, /= 12/, 'Vandermonde determinant');
  assert.match(tex, /-\\frac\{1\}\{3\}x\^\{3\}/, 'leading coefficient −1/3');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('systems: [A | I] reaches the exact inverse and shows LU', async () => {
  const { page, context, errors } = await openPage('sistemas_lineales.html?aug=I');
  await page.getByRole('button', { name: /Hasta el final/ }).click();
  await page.waitForTimeout(150);
  const tex = (await page.locator('.panel annotation').allTextContents()).join(' | ');
  assert.match(tex, /A\^\{-1\} = /);
  assert.match(tex, /\\frac\{1\}\{7\}/, 'inverse of [[1,2],[3,−1]] has sevenths');
  assert.match(tex, /A = \\begin\{bmatrix\} 1 & 0 \\\\ 3 & 1 \\end\{bmatrix\}/, 'L of A = LU');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('eigen: continuous flow classifies a stable spiral', async () => {
  const { page, context, errors } = await openPage('valores_propios.html?mode=dyn&flow=cont&A=-1,-2;2,-1');
  assert.match(await page.locator('.panel').innerText(), /Espiral estable/);
  assert.equal(await page.locator('.panel svg[role="img"]').count(), 1, 'trace–determinant diagram');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('non-square: the four subspaces are orthogonal pairs', async () => {
  const { page, context, errors } = await openPage('matrices_no_cuadradas.html?dims=2x3&show=img.ker.row.lnull');
  assert.match(await page.locator('.panel').innerText(), /Comprobado con aritmética exacta/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('3D views: keyboard selects a point and moves it; brackets return to the camera', async () => {
  const { page, context, errors } = await openPage('transformaciones_3D.html?A=2,0,0;0,1,0;0,0,1');
  const view = page.locator('.view--3d').first();
  await view.focus();
  await page.keyboard.press(']');
  assert.match(await view.locator('.view__hint').innerText(), /Punto 1 de 3/);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('PageUp');
  await page.waitForTimeout(150);
  const inputs = page.locator('.panel .matrix input');
  assert.equal(await inputs.nth(0).inputValue(), '3.1', 'a₁₁: 2 + 0.1 + 1');
  assert.equal(await inputs.nth(6).inputValue(), '0.1', 'a₃₁: PageUp moves z');
  await page.keyboard.press('[');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(150);
  assert.equal(await inputs.nth(0).inputValue(), '3.1', 'the camera turns without editing A');
  assert.match(await view.getAttribute('aria-label'), /corchetes/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('3D labels keep their offset (CSS2DRenderer owns transform)', async () => {
  const { page, context, errors } = await openPage('transformaciones_3D.html');
  const translate = await page.locator('.label3d').first().evaluate((el) => el.style.translate);
  assert.match(translate, /px/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('3D: Jordan form with a single 3×3 block is exact', async () => {
  const { page, context, errors } = await openPage('transformaciones_3D.html?A=1,1,1;-1,3,0;0,0,2');
  const tex = (await page.locator('.panel annotation').allTextContents()).join(' | ');
  assert.match(tex, /J = \\begin\{bmatrix\} 2 & 1 & 0 \\\\ 0 & 2 & 1 \\\\ 0 & 0 & 2 \\end\{bmatrix\}/);
  assert.match(await page.locator('.panel').innerText(), /un bloque de Jordan de tamaño 3/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('SVD 3×3: exact singular values, 3D view and |det A| = σ₁σ₂σ₃', async () => {
  const { page, context, errors } = await openPage('svd.html?n=3');
  const tex = (await page.locator('.panel annotation').allTextContents()).join(' | ');
  assert.match(tex, /\\sigma_\{1\} = \\sqrt\{9\} = 3,\\qquad \\sigma_\{2\} = \\sqrt\{4\} = 2,\\qquad \\sigma_\{3\} = \\sqrt\{1\} = 1/);
  assert.match(tex, /\|\\det A\| = 6/);
  assert.equal(await page.locator('.stage .view--3d').count(), 1);
  await page.locator('.panel .seg').first().locator('button').first().click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.stage .view--3d').count(), 0, 'back to 2×2 frees the 3D view');
  assert.equal(await page.locator('.stage canvas').count(), 1);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('orthogonality: cross product, area and signed triple product are exact', async () => {
  const { page, context, errors } = await openPage('ortogonalidad.html?mode=cross&cu=2,1,0&cv=0,3,0&cw=1,1,-1');
  const tex = (await page.locator('.panel annotation').allTextContents()).join(' | ');
  assert.match(tex, /\\htmlClass\{c-v\}\{\\begin\{bmatrix\} 0 \\\\ 0 \\\\ 6 \\end\{bmatrix\}\}/, 'u × v = (0, 0, 6)');
  assert.match(tex, /\(\\mathbf\{u\}\\times\\mathbf\{v\}\)\\cdot\\mathbf\{u\} = 0,/);
  assert.match(tex, /\\sqrt\{36\} = 6/);
  assert.match(tex, /\\det\[\\,\\mathbf\{u\}\\;\\mathbf\{v\}\\;\\mathbf\{w\}\\,\] = -6/);
  assert.match(await page.locator('.panel').innerText(), /negativo/);
  assert.equal(await page.locator('.stage .view--3d').count(), 1);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('app shell: sidebar lists every app, collapses and remembers it', async () => {
  const { page, context, errors } = await openPage('determinantes.html');
  assert.equal(await page.locator('.sidebar .navitem').count(), MODULES.length);
  assert.equal(await page.locator('.navitem[aria-current="page"]').getAttribute('href'), 'determinantes.html');
  await page.keyboard.press('b');
  assert.ok(await page.evaluate(() => document.body.classList.contains('sidebar-collapsed')));
  await page.reload({ waitUntil: 'networkidle' });
  assert.ok(await page.evaluate(() => document.body.classList.contains('sidebar-collapsed')), 'remembered after reload');
  await page.locator('.sidebar__collapse').click();
  assert.ok(!(await page.evaluate(() => document.body.classList.contains('sidebar-collapsed'))));
  // The page itself never scrolls on desktop: stage and inspector fill the window.
  assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1));
  assert.deepEqual(errors, []);
  await context.close();
});

await check('inspector tabs: theory and challenges live next to the controls', async () => {
  const { page, context, errors } = await openPage('formas_cuadraticas.html', { lang: 'en' });
  await page.getByRole('tab', { name: /Theory/ }).click();
  assert.match(await page.locator('#pane-theory').innerText(), /Spectral theorem/);
  assert.ok(await page.locator('#pane-controls').isHidden());
  await page.getByRole('tab', { name: /Challenges/ }).click();
  await page.locator('.challenge').first().getByRole('button').click();
  assert.ok(await page.locator('#pane-controls').isVisible(), 'activating a challenge shows the controls');
  assert.ok(await page.locator('.active-challenge').isVisible());
  await page.locator('.card__toggle').first().click();
  assert.ok(await page.locator('.card').first().evaluate((e) => e.classList.contains('card--collapsed')));
  assert.deepEqual(errors, []);
  await context.close();
});

await check('launcher: one tile per app and a way back to the last app', async () => {
  const { page, context, errors } = await openPage('index.html');
  assert.equal(await page.locator('.tile').count(), MODULES.length);
  assert.equal(await page.locator('.chapter-block').count(), 5);
  await page.locator('.tile', { hasText: 'Ortogonalidad' }).click();
  await page.waitForLoadState('networkidle');
  assert.match(page.url(), /ortogonalidad\.html/);
  await page.locator('.sidebar__brand').click();
  await page.waitForLoadState('networkidle');
  assert.match(await page.locator('.launcher__resume').innerText(), /Ortogonalidad/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('dark is the default theme even when the system prefers light', async () => {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 }, colorScheme: 'light' });
  const page = await context.newPage();
  await page.goto(`${BASE}transformaciones_2D.html`, { waitUntil: 'networkidle' });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await context.close();
});

await check('mobile: the menu button opens the app list as a drawer', async () => {
  const { page, context, errors } = await openPage('svd.html', { width: 390, height: 844 });
  assert.ok(!(await page.locator('.sidebar').evaluate((e) => e.getBoundingClientRect().right > 0)), 'hidden at first');
  await page.getByRole('button', { name: 'Menú' }).click();
  await page.waitForTimeout(300);
  assert.ok(await page.locator('.sidebar').evaluate((e) => e.getBoundingClientRect().left >= 0));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  assert.ok(!(await page.evaluate(() => document.body.classList.contains('sidebar-open'))));
  assert.deepEqual(errors, []);
  await context.close();
});

await check('mobile layout has no horizontal overflow', async () => {
  for (const path of ['index.html', 'transformaciones_2D.html', 'sistemas_lineales.html', 'ortogonalidad.html', 'combinaciones_lineales.html', 'determinantes.html', 'formas_cuadraticas.html', 'polinomios.html']) {
    const { page, context, errors } = await openPage(path, { width: 390, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `${path}: horizontal overflow of ${overflow}px`);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

await browser.close();
server.close();
console.log(results.join('\n'));
console.log(`\n${results.length - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
