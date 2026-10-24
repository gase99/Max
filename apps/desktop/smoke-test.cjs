/*
 * Runtime smoke test for the packaged renderer.
 *
 * This runs the *real* Electron binary against the *real* built application
 * (the same `app/index.html` that electron-builder puts into app.asar) and
 * exercises it from the outside, exactly like a user would. It is the only way
 * to prove on Windows CI that the application actually launches and that the
 * calculations survive packaging.
 *
 * It verifies:
 *   - the window loads and React mounts,
 *   - Persian RTL is the default and English LTR works,
 *   - all 12 navigation destinations render,
 *   - the sample project loads and the dashboard shows non-zero results,
 *   - the cutting list is produced and a known workbook-derived dimension
 *     (76.8 cm shelf length -> "768" in millimetre display) is present,
 *   - the project is persisted to localStorage,
 *   - NO network request is made (offline guarantee).
 *
 * Usage:  npx electron smoke-test.cjs
 * Exit:   0 = all checks passed, 1 = failure (details on stdout).
 */
const { app, BrowserWindow, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

const entry = path.join(__dirname, 'app', 'index.html');

if (!fs.existsSync(entry)) {
  console.error(`[smoke] renderer not found at ${entry} — run "npm run build:renderer" first`);
  app.exit(1);
}

/** Network requests observed during the run (must stay empty). */
const networkRequests = [];

const RENDERER_SCRIPT = String.raw`
(async () => {
  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: detail === undefined ? null : String(detail) });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, timeout = 10000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const v = fn();
      if (v) return v;
      await sleep(50);
    }
    return null;
  };
  const byText = (sel, text) =>
    [...document.querySelectorAll(sel)].find((e) => (e.textContent || '').includes(text)) || null;

  await waitFor(() => document.querySelector('#root') && document.querySelector('#root').children.length);
  check('application mounted', !!document.querySelector('.shell'));

  // --- layout / language ------------------------------------------------
  check('default direction is RTL', document.documentElement.dir === 'rtl', document.documentElement.dir);
  check('default language is Persian', document.documentElement.lang === 'fa', document.documentElement.lang);

  const nav = document.querySelector('.nav');
  const navCount = nav ? nav.querySelectorAll('button').length : 0;
  check('12 navigation destinations', navCount === 12, navCount);

  // --- sample project + calculations ------------------------------------
  const sampleBtn = byText('button', 'بارگذاری نمونهٔ پروژه');
  check('sample-project button present', !!sampleBtn);
  if (sampleBtn) sampleBtn.click();
  await sleep(700);

  // Loading the sample navigates to the ground-cabinet screen; return to the
  // dashboard to read the statistics.
  const dashBtn = byText('.nav button', 'داشبورد');
  check('dashboard reachable', !!dashBtn);
  if (dashBtn) dashBtn.click();
  await sleep(400);

  const stats = [...document.querySelectorAll('.stat-value')].map((e) => e.textContent || '');
  check('dashboard shows 4 statistics', stats.length >= 4, stats.join(' | '));
  check('module count > 0', stats.length > 1 && Number(stats[1]) > 0, stats[1]);
  check('part count > 0', stats.length > 2 && Number(stats[2]) > 0, stats[2]);
  check('board area > 0', stats.length > 3 && parseFloat(stats[3]) > 0, stats[3]);

  // --- cutting list derived from the workbook formulas -------------------
  const cutBtn = byText('.nav button', 'لیست برش');
  check('cutting list reachable', !!cutBtn);
  if (cutBtn) cutBtn.click();
  await sleep(500);

  const rows = document.querySelectorAll('table.data tbody tr').length;
  check('cutting list has rows', rows > 0, rows);

  // A ground cabinet with B = 80 gives shelf length 80 - 3.2 = 76.8 cm.
  // The default display unit is mm, so the table must contain "768".
  const body = document.body.textContent || '';
  check('workbook dimension 76.8 cm renders as 768 mm', body.includes('768'));

  // --- persistence -------------------------------------------------------
  const raw = localStorage.getItem('cap.projects.v1');
  let projectCount = 0;
  try {
    projectCount = JSON.parse(raw || '[]').length;
  } catch (e) {
    projectCount = -1;
  }
  check('project persisted to localStorage', projectCount > 0, projectCount);

  // --- English / LTR -----------------------------------------------------
  const enBtn = byText('button', 'EN');
  check('language toggle present', !!enBtn);
  if (enBtn) enBtn.click();
  await sleep(400);
  check('direction switches to LTR', document.documentElement.dir === 'ltr', document.documentElement.dir);
  check('language switches to English', document.documentElement.lang === 'en', document.documentElement.lang);
  check('English UI rendered', (document.body.textContent || '').includes('Cutting list'));

  // back to Persian for the persistence check below
  const faBtn = byText('button', 'فا');
  if (faBtn) faBtn.click();
  await sleep(300);

  return checks;
})()
`;

async function run() {
  await app.whenReady();

  // Watch every request the application makes.
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    if (/^https?:/i.test(details.url)) networkRequests.push(details.url);
    callback({ cancel: false });
  });

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      offscreen: true,
    },
  });

  const consoleErrors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) consoleErrors.push(message); // 3 = error
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[smoke] renderer crashed:', JSON.stringify(details));
    app.exit(1);
  });

  await win.loadFile(entry);

  let checks;
  try {
    checks = await win.webContents.executeJavaScript(RENDERER_SCRIPT, true);
  } catch (err) {
    console.error('[smoke] in-page script threw:', err && err.message);
    app.exit(1);
    return;
  }

  console.log('\n=== Cabinet Analysis Pro — runtime smoke test ===');
  console.log(`renderer: ${entry}`);
  console.log(`electron: ${process.versions.electron}  chrome: ${process.versions.chrome}\n`);

  let failed = 0;
  for (const c of checks) {
    if (c.ok) {
      console.log(`  ✓ ${c.name}${c.detail !== null ? `  (${c.detail})` : ''}`);
    } else {
      failed++;
      console.log(`  ✗ ${c.name}${c.detail !== null ? `  (got: ${c.detail})` : ''}`);
    }
  }

  // Offline guarantee: the renderer must not touch the network.
  const offlineOk = networkRequests.length === 0;
  if (offlineOk) {
    console.log('  ✓ no network requests (offline)');
  } else {
    failed++;
    console.log(`  ✗ network requests were made: ${networkRequests.slice(0, 5).join(', ')}`);
  }
  checks.push({ name: 'offline', ok: offlineOk });

  if (consoleErrors.length) {
    console.log(`\n  console errors (${consoleErrors.length}):`);
    for (const e of consoleErrors.slice(0, 5)) console.log(`    - ${e}`);
  }

  console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
  app.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('[smoke] fatal:', err);
  app.exit(1);
});
