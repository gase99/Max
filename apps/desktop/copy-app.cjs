/* Copies the built web bundle next to the Electron entry point. */
const fs = require('node:fs');
const path = require('node:path');

const src = path.join(__dirname, '..', 'web', 'dist');
const dest = path.join(__dirname, 'app');

if (!fs.existsSync(src)) {
  console.error('[desktop] web build not found at', src, '— run "npm run build:web" first.');
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log('[desktop] copied web build ->', dest);
