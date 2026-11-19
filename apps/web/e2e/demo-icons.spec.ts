import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

// Demo icons must be full-bleed squares: the site rounds them itself (AppIcon, 22.5%).
// An icon saved already rounded, with its corners flattened to black, shows black slivers
// in the corners of every tile and of the install window.
const mediaDir = fileURLToPath(new URL('../../../packages/db/demo/media/', import.meta.url));
const icons = readdirSync(mediaDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

test('demo icons have no black cut-off corners', async ({ page }) => {
  expect(icons.length).toBeGreaterThan(0);
  const sources = icons.map((slug) => ({
    slug,
    src: `data:image/webp;base64,${readFileSync(`${mediaDir}${slug}/icon.webp`).toString('base64')}`,
  }));
  const bad = await page.evaluate(async (list) => {
    const lum = ([r = 0, g = 0, b = 0]: Uint8ClampedArray) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const found: string[] = [];
    for (const { slug, src } of list) {
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.drawImage(img, 0, 0);
      const { width: w, height: h } = canvas;
      // Just inside the 22.5% rounding along the diagonal vs. the point that rounding still shows.
      const edge = Math.round(w * 0.07);
      const inner = Math.round(w * 0.12);
      const corners: [number, number, number, number][] = [
        [edge, edge, inner, inner],
        [w - 1 - edge, edge, w - 1 - inner, inner],
        [edge, h - 1 - edge, inner, h - 1 - inner],
        [w - 1 - edge, h - 1 - edge, w - 1 - inner, h - 1 - inner],
      ];
      for (const [x, y, ix, iy] of corners) {
        const c = lum(ctx.getImageData(x, y, 1, 1).data);
        const i = lum(ctx.getImageData(ix, iy, 1, 1).data);
        if (c < 24 && i > 60) {
          found.push(`${slug} (${x},${y})`);
          break;
        }
      }
    }
    return found;
  }, sources);
  expect(bad).toEqual([]);
});
