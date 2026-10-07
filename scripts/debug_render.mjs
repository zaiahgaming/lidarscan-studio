import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') {
    console.log('[console:' + msg.type() + ']', msg.text().slice(0, 400));
  }
});
page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 800)));
page.on('requestfailed', (req) => console.log('[requestfailed]', req.url(), req.failure()?.errorText));
page.on('response', (res) => { if (res.status() >= 400) console.log('[http ' + res.status() + ']', res.url()); });

await page.goto('http://127.0.0.1:8765/', { waitUntil: 'networkidle', timeout: 30000 }).catch((e) => console.log('[goto]', String(e)));
await page.waitForTimeout(4000);

const info = await page.evaluate(() => ({
  rootChildren: document.getElementById('root')?.children.length ?? -1,
  rootHTMLStart: document.getElementById('root')?.innerHTML.slice(0, 200) ?? 'NO ROOT',
  bodyText: document.body.innerText.slice(0, 300),
  bodyBg: getComputedStyle(document.body).backgroundColor,
}));
console.log('[dom]', JSON.stringify(info, null, 2));
await page.screenshot({ path: '/tmp/studio-debug.png' });
console.log('screenshot saved to /tmp/studio-debug.png');
await browser.close();
