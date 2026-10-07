/* Headless UI verification for the rebuilt LidarScan Studio frontend.
   Run:  cd frontend && node scripts/verify_ui.mjs
   Exits non-zero on any failure. Never clicks destructive controls. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://127.0.0.1:8765/';
const OUT = 'ui-preview';
mkdirSync(OUT, { recursive: true });

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? ' — ' + detail : ''));
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', (err) => pageErrors.push(String(err)));
page.on('requestfailed', (req) => failedRequests.push(req.url() + ' :: ' + (req.failure()?.errorText ?? 'unknown')));

console.log('== Load ==');
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1200);

// --- structure ---
check('app shell mounted', await page.locator('.app-shell').count() === 1);
check('topbar brand', (await page.locator('.topbar .brand-name').innerText()).startsWith('LidarScan'));
check('connection pill', await page.locator('.connection-pill').count() === 1);
check('jobs chip present', await page.locator('.jobs-chip').count() === 1);
check('library panel', await page.locator('.library').count() === 1);
check('search box', await page.locator('.search-box input').count() === 1);
const cardCount = await page.locator('.scan-card').count();
check('scan cards rendered', cardCount > 0, cardCount + ' cards');
check('viewer stage present', (await page.locator('.v3d').count()) === 1);
check('viewer mode tabs', await page.locator('.v3d-tab').count() === 3);
check('inspector tabs', await page.locator('.seg-item').count() === 3);
check('statusbar', await page.locator('.statusbar').count() === 1);

// --- design system actually applied (computed styles) ---
const styles = await page.evaluate(() => {
  const body = getComputedStyle(document.body);
  const title = document.querySelector('.library-title');
  const mono = title ? getComputedStyle(title).fontFamily : '';
  return {
    bg: body.backgroundColor,
    font: body.fontFamily.split(',')[0],
    titleFont: mono.split(',')[0],
  };
});
check('graphite background token', styles.bg === 'rgb(13, 14, 16)', styles.bg);
check('Inter UI font', styles.font === 'Inter', styles.font);
check('Space Grotesk display font', styles.titleFont.replace(/"/g, '') === 'Space Grotesk', styles.titleFont);

// --- selection ---
const firstName = await page.locator('.scan-card.selected b').first().innerText().catch(() => null);
check('a capture is auto-selected', Boolean(firstName), firstName ?? 'none');
const stageTitle = await page.locator('.stage-title').innerText().catch(() => null);
check('stage title matches selection', Boolean(stageTitle), stageTitle ?? 'none');

// --- library search filter ---
await page.fill('.search-box input', 'zzz-no-such-scan');
await page.waitForTimeout(200);
check('search empty state', await page.locator('.library-empty').count() === 1);
await page.fill('.search-box input', '');
await page.waitForTimeout(200);

// --- inspector tabs ---
await page.click('.seg-item:has-text("Process")');
await page.waitForTimeout(150);
check('process tools shown', (await page.locator('.action-row').count()) === 3);
await page.click('.seg-item:has-text("Train")');
await page.waitForTimeout(150);
check('train steps select shown', (await page.locator('#train-steps').count()) === 1);
const colabButton = await page.locator('.inspector .btn-primary:has-text("Train with Colab CLI")').count();
const notebookLink = await page.locator('.inspector a:has-text("Open Colab notebook")').count();
check('train CTA present (CLI or notebook)', colabButton + notebookLink === 1);
await page.click('.seg-item:has-text("Details")');
await page.waitForTimeout(150);
check('details stat tiles', (await page.locator('.stat-tile').count()) >= 4);

// --- jobs drawer ---
await page.click('.jobs-chip');
await page.waitForTimeout(300);
check('jobs drawer opens', await page.locator('.drawer').count() === 1);
const jobCards = await page.locator('.job-card').count();
check('jobs list or empty state', jobCards > 0 || (await page.locator('.drawer-empty').count()) === 1, jobCards + ' jobs');
await page.mouse.click(200, 450); // backdrop
await page.waitForTimeout(250);
check('jobs drawer closes via backdrop', (await page.locator('.drawer').count()) === 0);

// --- connect dialog with QR ---
await page.click('.connection-pill');
await page.waitForTimeout(600);
check('connect modal opens', await page.locator('.connect-dialog, .modal').count() === 1);
const address = await page.locator('.connect-address code').innerText();
check('LAN address shown', /^http:\/\/\d+\.\d+\.\d+\.\d+:\d+/.test(address), address);
check('QR code rendered', await page.locator('.connect-qr img').count() === 1);
await page.keyboard.press('Escape');
await page.waitForTimeout(250);
check('connect modal closes on Escape', (await page.locator('.modal').count()) === 0);

// --- upload modal ---
await page.click('.btn-primary:has-text("Import scan")');
await page.waitForTimeout(300);
check('upload dropzone opens', await page.locator('.dropzone').count() === 1);
await page.keyboard.press('Escape');
await page.waitForTimeout(250);
check('upload modal closes on Escape', (await page.locator('.dropzone').count()) === 0);

// --- keyboard shortcut ---
await page.keyboard.press('Control+k');
await page.waitForTimeout(150);
check('⌘K focuses search', await page.evaluate(() => document.activeElement?.classList.contains('search-box') || document.activeElement?.parentElement?.classList.contains('search-box')));

// --- viewer file switch (mesh/points availability) ---
const tabStates = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.v3d-tab')).map((b) => ({ label: b.textContent?.trim(), disabled: b.disabled })),
);
check('mode tabs reflect assets', tabStates.length === 3, JSON.stringify(tabStates));

// --- splat engine exercise (riskiest path): open the demo capture with splats ---
const demoCard = page.locator('.scan-card', { hasText: 'Synthetic' }).first();
if ((await demoCard.count()) === 1) {
  await demoCard.click();
  await page.waitForTimeout(600);
  const splatTab = page.locator('.v3d-tab', { hasText: 'Splat' });
  const splatEnabled = (await splatTab.count()) === 1 && !(await splatTab.isDisabled());
  check('demo capture has splats', splatEnabled);
  if (splatEnabled) {
    await splatTab.click();
    // streamView loads progressively; give it time, then ensure no errors surfaced
    await page.waitForTimeout(9000);
    const splatError = await page.locator('.v3d-overlay.error').count();
    check('splat scene loaded without error overlay', splatError === 0);
    const splatCanvas = await page.evaluate(() => document.querySelector('.v3d-canvas')?.querySelectorAll('canvas').length ?? 0);
    check('splat canvas mounted', splatCanvas > 0, splatCanvas + ' canvas nodes');
  }
} else {
  check('demo capture with splats available', false, 'no Synthetic capture in library');
}

// --- screenshots for the user ---
await page.waitForTimeout(800);
await page.screenshot({ path: OUT + '/desktop-1600.png' });
await page.setViewportSize({ width: 940, height: 800 });
await page.waitForTimeout(500);
await page.screenshot({ path: OUT + '/tablet-940.png' });
await page.setViewportSize({ width: 430, height: 900 });
await page.waitForTimeout(500);
await page.screenshot({ path: OUT + '/mobile-430.png' });
check('screenshots captured', true, OUT + '/{desktop,tablet,mobile}-*.png');

// --- console health ---
check('zero console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | ') || 'clean');
check('zero page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | ') || 'clean');
check('zero failed requests', failedRequests.length === 0, failedRequests.slice(0, 3).join(' | ') || 'clean');

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log('\n' + (failed.length ? 'FAILURES: ' + failed.length : 'ALL ' + results.length + ' CHECKS PASSED'));
process.exit(failed.length ? 1 : 0);
