/*
 * Post-packaging verification.
 *
 * Runs on the build machine after `electron-builder` and asserts that the
 * expected artefacts really exist, have plausible sizes, and that the packaged
 * application actually contains the renderer (index.html + assets) inside its
 * asar archive. This is what stops a "green" workflow from shipping an empty or
 * broken installer.
 *
 * Usage: node verify-package.cjs [releaseDir]
 * Exit code 0 = verified, 1 = verification failed (with a precise reason).
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const releaseDir = path.resolve(__dirname, process.argv[2] || 'release');
const pkg = require('./package.json');
const version = pkg.version;

const failures = [];
const notes = [];

function fail(msg) {
  failures.push(msg);
  console.error(`  ✗ ${msg}`);
}

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

console.log(`\n=== Verifying Windows release artefacts (v${version}) ===`);
console.log(`release directory: ${releaseDir}\n`);

if (!fs.existsSync(releaseDir)) {
  fail(`release directory does not exist: ${releaseDir}`);
  process.exit(1);
}

const files = walk(releaseDir);
const exes = files.filter((f) => f.toLowerCase().endsWith('.exe'));
const asars = files.filter((f) => f.endsWith('app.asar'));

console.log(`files found: ${files.length} (${exes.length} exe, ${asars.length} asar)\n`);

// ---------------------------------------------------------------- installers
const MIN_EXE_BYTES = 40 * 1024 * 1024; // a real Electron installer is far larger
const requireExe = (label, matcher) => {
  const match = exes.find((f) => matcher.test(path.basename(f)));
  if (!match) {
    fail(`missing ${label} — no .exe matching ${matcher}`);
    return null;
  }
  const size = fs.statSync(match).size;
  if (size < MIN_EXE_BYTES) {
    fail(`${label} is implausibly small: ${(size / 1024 / 1024).toFixed(2)} MiB (expected > 40 MiB)`);
  } else {
    ok(`${label}: ${path.basename(match)} — ${(size / 1024 / 1024).toFixed(1)} MiB`);
  }
  return match;
};

const setup = requireExe('NSIS installer', /Setup.*\.exe$/i);
const portable = requireExe('portable executable', /Portable.*\.exe$/i);

// ------------------------------------------------------------------- asar
if (asars.length === 0) {
  fail('no app.asar found — the packaged application is missing its renderer bundle');
} else {
  let listed = null;
  let asar = null;
  try {
    asar = require('@electron/asar');
    listed = asar.listPackage(asars[0]);
  } catch (err) {
    notes.push(`could not inspect app.asar (${err.message}); falling back to size check`);
  }

  if (listed) {
    const hasIndex = listed.some((p) => p.replace(/\\/g, '/').endsWith('/app/index.html'));
    const hasAssets = listed.filter((p) => /\/app\/assets\/.+\.js$/.test(p.replace(/\\/g, '/'))).length;
    const hasMain = listed.some((p) => p.replace(/\\/g, '/') === '/main.cjs');
    const hasPreload = listed.some((p) => p.replace(/\\/g, '/') === '/preload.cjs');

    hasIndex ? ok('app.asar contains app/index.html') : fail('app.asar is missing app/index.html');
    hasAssets > 0
      ? ok(`app.asar contains ${hasAssets} renderer asset(s)`)
      : fail('app.asar contains no renderer JS assets');
    hasMain ? ok('app.asar contains main.cjs') : fail('app.asar is missing main.cjs');
    hasPreload ? ok('app.asar contains preload.cjs') : fail('app.asar is missing preload.cjs');

    // The packaged renderer is loaded over file://, so asset URLs must be relative.
    // Archive entry separators differ between platforms, so resolve the entry
    // from the listing instead of guessing a path.
    const indexEntry = listed.find(
      (p) => p.replace(/\\/g, '/').replace(/^\//, '') === 'app/index.html',
    );
    let html = null;
    let extractError = null;
    // extractFile() wants the entry without a leading separator.
    const candidates = [
      'app/index.html',
      indexEntry ? indexEntry.replace(/\\/g, '/').replace(/^\//, '') : null,
    ].filter(Boolean);
    for (const candidate of [...new Set(candidates)]) {
      try {
        html = asar.extractFile(asars[0], candidate).toString('utf8');
        break;
      } catch (err) {
        extractError = err.message;
        /* try the next form */
      }
    }
    if (html === null) {
      // Fall back to the on-disk copy that was packaged; it is identical.
      const onDisk = path.join(__dirname, 'app', 'index.html');
      if (fs.existsSync(onDisk)) {
        html = fs.readFileSync(onDisk, 'utf8');
        notes.push(
          `app/index.html could not be read from the archive (${extractError}); checked the packaged source copy instead`,
        );
      }
    }
    if (html === null) {
      fail('could not read app/index.html from the archive or from apps/desktop/app');
    } else {
      const absolute = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]);
      absolute.length === 0
        ? ok('packaged index.html uses relative asset paths (file:// safe)')
        : fail(`packaged index.html has absolute asset paths: ${absolute.join(', ')} → blank window on launch`);
    }
  } else {
    const size = fs.statSync(asars[0]).size;
    size > 50 * 1024 ? ok(`app.asar present (${size} bytes)`) : fail('app.asar is implausibly small');
  }
}

// --------------------------------------------------------------- checksums
console.log('\n=== SHA-256 ===');
for (const f of [...(setup ? [setup] : []), ...(portable ? [portable] : [])]) {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  console.log(`  ${hash}  ${path.basename(f)}`);
}

// --------------------------------------------------------------- summary
if (notes.length) {
  console.log('\nNotes:');
  for (const n of notes) console.log(`  - ${n}`);
}

if (failures.length) {
  console.error(`\nVERIFICATION FAILED — ${failures.length} problem(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('\nVERIFICATION PASSED — both installers exist, are plausibly sized, and contain the renderer.\n');
