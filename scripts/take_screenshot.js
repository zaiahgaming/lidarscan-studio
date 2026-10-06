import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function main() {
  const outDir = path.resolve('screenshots');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log('Launching headless Chromium browser...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();
  console.log('Navigating to http://localhost:8765 ...');
  await page.goto('http://localhost:8765', { waitUntil: 'networkidle' });

  // Wait for 3D canvas to mount
  await page.waitForTimeout(3000);

  console.log('Capturing full UI screenshot...');
  await page.screenshot({ path: path.join(outDir, 'screenshot_full_ui.png') });

  // Click QR button in navbar
  console.log('Opening Mobile Connect QR modal...');
  const qrButton = page.locator('button[title="Show QR Code"]');
  if (await qrButton.isVisible()) {
    await qrButton.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(outDir, 'screenshot_qr_modal.png') });

    // Close modal
    const closeBtn = page.locator('div.fixed button').first();
    await closeBtn.click();
    await page.waitForTimeout(500);
  }

  // Click 3D Mesh button
  console.log('Switching to 3D Mesh view...');
  const meshBtn = page.locator('button:has-text("3D Mesh")');
  if (await meshBtn.isVisible()) {
    await meshBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(outDir, 'screenshot_mesh_view.png') });
  }

  // Click Gaussian Splat tab
  console.log('Switching to Gaussian Splat tab...');
  const splatTab = page.locator('button:has-text("Gaussian Splats")');
  if (await splatTab.isVisible()) {
    await splatTab.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(outDir, 'screenshot_splat_tab.png') });
  }

  // Click Mesh 3D tab
  console.log('Switching to Mesh 3D reconstruct tab...');
  const meshTab = page.locator('button:has-text("Mesh 3D")');
  if (await meshTab.isVisible()) {
    await meshTab.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(outDir, 'screenshot_reconstruct_tab.png') });
  }

  // Open Jobs Drawer
  console.log('Opening Jobs Drawer...');
  const jobsBtn = page.locator('button:has-text("Jobs")');
  if (await jobsBtn.isVisible()) {
    await jobsBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(outDir, 'screenshot_jobs_drawer.png') });
  }

  console.log('All screenshots captured successfully!');
  await browser.close();
}

main().catch((err) => {
  console.error('Screenshot script failed:', err);
  process.exit(1);
});
