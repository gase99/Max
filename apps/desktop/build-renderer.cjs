/*
 * Builds the renderer bundle for the desktop shell.
 *
 * The desktop app is a *self-contained* electron-builder root: it must be able
 * to build without relying on npm workspaces, because `dist:win` is executed
 * from inside `apps/desktop` where workspace flags are unavailable.
 *
 * Steps:
 *   1. build the web app (apps/web) using its own toolchain,
 *   2. copy apps/web/dist -> apps/desktop/app.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const webDir = path.resolve(__dirname, '..', 'web');
const distDir = path.join(webDir, 'dist');
const destDir = path.join(__dirname, 'app');

function log(msg) {
  console.log(`[build-renderer] ${msg}`);
}

/** Run a command, preferring a local binary, and show its output live. */
function run(cmd, args, cwd) {
  log(`> ${cmd} ${args.join(' ')}   (cwd: ${path.relative(repoRoot, cwd) || '.'})`);
  execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
}

function exists(p) {
  return fs.existsSync(p);
}

if (!exists(path.join(repoRoot, 'node_modules'))) {
  console.error('[build-renderer] dependencies are not installed. Run "npm install" at the repository root first.');
  process.exit(1);
}

// 1. Build the web bundle.
//    `vite build` resolves @cabinet/engine from source (see apps/web/vite.config.ts),
//    so no separate engine build step is required.
const viteBin = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const tscBin = path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');

if (!exists(viteBin)) {
  console.error('[build-renderer] vite not found — run "npm install" at the repository root.');
  process.exit(1);
}

if (exists(tscBin)) {
  try {
    run(process.execPath, [tscBin, '-b'], webDir);
    log('TypeScript typecheck passed');
  } catch {
    console.error('[build-renderer] TypeScript typecheck failed — aborting packaging.');
    process.exit(1);
  }
}

run(process.execPath, [viteBin, 'build'], webDir);

if (!exists(path.join(distDir, 'index.html'))) {
  console.error('[build-renderer] web build produced no index.html at', distDir);
  process.exit(1);
}

// 2. Copy into the desktop root.
fs.rmSync(destDir, { recursive: true, force: true });
fs.cpSync(distDir, destDir, { recursive: true });

const size = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .reduce((sum, e) => sum + fs.statSync(path.join(e.parentPath ?? dir, e.name)).size, 0);

log(`copied web build -> ${path.relative(repoRoot, destDir)} (${(size(destDir) / 1024).toFixed(1)} KiB)`);
log('renderer ready. Packaging can proceed.');
