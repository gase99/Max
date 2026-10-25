/**
 * Optional local helper: rasterise a generated drawing sheet to PNG so a human
 * can look at it without a browser.
 *
 * Not part of the product and not needed by the test suite. It needs one
 * dev-only package, deliberately not added to package.json:
 *
 *   mkdir -p tools/.render && cd tools/.render
 *   printf '{"private":true}' > package.json
 *   npm install @resvg/resvg-js vazirmatn
 *   cd ../.. && node tools/render-svg.mjs sheet.svg sheet.png 1300
 *
 * Usage: node tools/render-svg.mjs <in.svg> <out.png> [width]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [input, output, widthArg] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node tools/render-svg.mjs <in.svg> <out.png> [width]');
  process.exit(1);
}

const { Resvg } = await import('./.render/node_modules/@resvg/resvg-js/index.js').catch(() => {
  console.error('Install the dev-only rasteriser first — see the header of this file.');
  process.exit(1);
});

const svg = readFileSync(input, 'utf8');
const renderer = new Resvg(svg, {
  fitTo: { mode: 'width', value: Number(widthArg ?? 1300) },
  // The sandbox has no system fonts; load Vazirmatn from the dev-only install so
  // Persian labels render instead of showing as empty boxes.
  font: { loadSystemFonts: true, fontDirs: ['./tools/.render/node_modules/vazirmatn/fonts/ttf'] },
});
writeFileSync(output, renderer.render().asPng());
console.log(`wrote ${output}`);
