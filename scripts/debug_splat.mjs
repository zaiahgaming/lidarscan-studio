import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

let errors = 0;
page.on('pageerror', (err) => { errors++; console.log('[pageerror]', String(err).slice(0, 300)); });
page.on('console', (msg) => { if (msg.type() === 'error') { errors++; console.log('[console:error]', msg.text().slice(0, 300)); } });

await page.goto('http://127.0.0.1:8765/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);

// Switch to splat view — this is the path that used to crash with removeChild
await page.locator('.viewer-mode').filter({ hasText: 'Splat' }).click();
await page.waitForTimeout(6000);

const state = await page.evaluate(() => ({
  rootChildren: document.getElementById('root')?.children.length ?? -1,
  hasStage: !!document.querySelector('.viewer-stage'),
  walkButton: !!Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Walk inside')),
}));
console.log('[state]', JSON.stringify(state));
console.log('[errors]', errors);
await page.screenshot({ path: '/tmp/studio-splat.png' });

// Also test Walk mode entry
const walk = page.locator('button:has-text("Walk inside")');
if (await walk.count() && await walk.first().isEnabled()) {
  await walk.first().click().catch(() => {});
  await page.waitForTimeout(1500);
  const walkHud = await page.evaluate(() => !!document.querySelector('.walk-hud'));
  console.log('[walk-hud]', walkHud);
  await page.screenshot({ path: '/tmp/studio-walk.png' });
}

await browser.close();
