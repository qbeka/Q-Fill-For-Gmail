/**
 * Renders scripts/icon.svg to the PNG sizes the manifest lists.
 * Run with: npm run icons
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const svg = await readFile(`${root}scripts/icon.svg`, 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.locator('svg').screenshot({ path: `${root}extension/icons/icon-${size}.png`, omitBackground: true });
  console.log(`extension/icons/icon-${size}.png`);
}

await browser.close();
