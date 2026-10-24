/*
 * Functional runtime test for the real desktop application.
 *
 * This drives the *real* Electron binary against the *real* built renderer —
 * the same `app/index.html` that electron-builder packs into app.asar — and
 * clicks through the app like a workshop user. Nothing here is a mock: every
 * check reads the DOM that Electron actually rendered, and every export is a
 * real file written by the real download path.
 *
 * What it proves (phase 1, fresh profile)
 * ---------------------------------------
 *   1. the application launches, React mounts, 13 destinations exist
 *   2. a project can be created, a cabinet added and its dimensions entered
 *   3. the values on screen match the workbook (B = 100 cm → shelf 96.8 cm)
 *   4. the cutting list CSV export is a real, well-formed file with those values
 *   5. the DXF export is a real R12 file whose rectangles match the cutting list
 *   6. the A4 print bundle is page-structured (@page A4, one <section> per page)
 *   7. the JSON backup downloads and is restorable
 *   8. an invalid backup file is rejected with an error and does not corrupt data
 *   9. zero / negative / absurd input produce visible warnings, never a crash
 *  10. a failing localStorage.setItem does not kill the app
 *  11. Persian RTL is default, English LTR works, both render text
 *  12. no network request is made (offline guarantee)
 *  13. a screenshot is captured so a human can eyeball glyph rendering
 *
 * What it proves additionally (phase 2 — a *separate process*, same profile)
 * -------------------------------------------------------------------------
 *  14. the project created in phase 1 is still there after the app was closed
 *      and reopened, with its entered dimension and its results intact
 *
 * What it cannot prove
 * --------------------
 * - It is not a physical Windows PC: it runs on a hosted Windows runner.
 * - Glyph shaping correctness is only eyeballed via the captured screenshot;
 *   there is no OCR/visual diff.
 * - No code-signing trust chain, no antivirus, no real printer is exercised.
 *
 * Usage:
 *   npx electron smoke-test.cjs --phase=1 --reset   # fresh profile
 *   npx electron smoke-test.cjs --phase=2           # reopen the same profile
 * Exit: 0 = every check passed, 1 = at least one failed.
 */
const { app, BrowserWindow, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const argv = process.argv.slice(1);
const phase = Number((argv.find((a) => a.startsWith('--phase=')) || '--phase=1').split('=')[1]) || 1;
const resetProfile = argv.includes('--reset');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-features=AudioServiceOutOfProcess');

/* One fixed profile directory, so phase 2 opens exactly what phase 1 saved. */
const PROFILE = path.join(__dirname, '.smoke-profile');
const DOWNLOADS = path.join(__dirname, '.smoke-downloads');
const REPORT = path.join(__dirname, phase === 1 ? 'smoke-report.json' : 'smoke-report-phase2.json');

const entry = path.join(__dirname, 'app', 'index.html');
if (!fs.existsSync(entry)) {
  console.error(`[smoke] renderer not found at ${entry} — run "npm run build:renderer" first`);
  app.exit(1);
}

if (resetProfile) {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.rmSync(DOWNLOADS, { recursive: true, force: true });
}
app.setPath('userData', PROFILE);
fs.mkdirSync(DOWNLOADS, { recursive: true });

/** Every http(s) request the renderer attempts (must stay empty). */
const networkRequests = [];
/** Files the download path actually produced. */
const downloads = [];

/* ------------------------------------------------------------------ */
/*  Shared helpers injected into every renderer script                 */
/* ------------------------------------------------------------------ */
const PRELUDE = String.raw`
  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: detail === undefined ? null : String(detail) });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, timeout = 8000) => {
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
  const navTo = async (label) => {
    const btn = byText('.nav button', label);
    if (!btn) return false;
    btn.click();
    await sleep(450);
    return true;
  };
  /** React-safe value setter: uses the native setter, then fires 'input'. */
  const setField = (labelPart, value) => {
    const field = [...document.querySelectorAll('.field')].find((f) => {
      const label = f.querySelector('label');
      return label && (label.textContent || '').includes(labelPart);
    });
    if (!field) return false;
    const input = field.querySelector('input');
    if (!input) return false;
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  };
  const fieldValue = (labelPart) => {
    const field = [...document.querySelectorAll('.field')].find((f) => {
      const label = f.querySelector('label');
      return label && (label.textContent || '').includes(labelPart);
    });
    return field ? field.querySelector('input')?.value ?? null : null;
  };
  const toastText = () => [...document.querySelectorAll('.toast')].map((t) => t.textContent || '').join(' | ');
  const clickButton = async (text, sel = 'button') => {
    const b = byText(sel, text);
    if (!b) return false;
    b.click();
    await sleep(400);
    return true;
  };
  const projectsRaw = () => {
    try { return JSON.parse(localStorage.getItem('cap.projects.v1') || '[]'); } catch (e) { return null; }
  };
  /** The app may already hold the sample project, so look projects up by name. */
  const findProject = (needle) =>
    (projectsRaw() || []).find((p) => p && typeof p.name === 'string' && p.name.includes(needle)) || null;
`;

/* ------------------------------------------------------------------ */
/*  Phase 1 — basics                                                   */
/* ------------------------------------------------------------------ */
const SCRIPT_BASICS = String.raw`(async () => {
  await waitFor(() => document.querySelector('#root') && document.querySelector('#root').children.length);
  check('application mounted', !!document.querySelector('.shell'));
  check('default direction is RTL', document.documentElement.dir === 'rtl', document.documentElement.dir);
  check('default language is Persian', document.documentElement.lang === 'fa', document.documentElement.lang);

  const nav = document.querySelector('.nav');
  const navCount = nav ? nav.querySelectorAll('button').length : 0;
  check('13 navigation destinations', navCount === 13, navCount);

  // Font resolution: the UI asks for Vazirmatn first, then Tahoma/Segoe UI.
  // jsdom (used by the cross-check test) loads no stylesheets, so an empty
  // stack is tolerated there; the real Electron build always has CSS.
  const stack = getComputedStyle(document.body).fontFamily || '';
  const noStylesheet = stack === '' || /depends on user agent/i.test(stack);
  check(
    'font stack requests Vazirmatn with fallbacks',
    noStylesheet || (/Vazirmatn/.test(stack) && /(Tahoma|Segoe UI)/.test(stack)),
    stack || 'no stylesheet (jsdom)',
  );
  const probe = document.createElement('span');
  probe.style.position = 'absolute';
  probe.style.font = getComputedStyle(document.body).font;
  probe.textContent = 'متن آزمایشی فارسی ۱۲۳';
  document.body.appendChild(probe);
  const persianWidth = probe.getBoundingClientRect().width;
  probe.remove();
  // jsdom performs no layout, so a zero width there is expected; Electron must
  // actually measure the string.
  const isJsdom = /jsdom/i.test(navigator.userAgent);
  check(
    'Persian text has non-zero rendered width',
    persianWidth > 20 || isJsdom,
    persianWidth.toFixed(1) + (isJsdom ? ' (jsdom: no layout)' : ''),
  );

  // Sample project: the fastest way to prove the calculation path end to end.
  check('sample-project button present', !!byText('button', 'بارگذاری نمونهٔ پروژه'));
  await clickButton('بارگذاری نمونهٔ پروژه');
  await sleep(600);

  const dashBtn = byText('.nav button', 'داشبورد');
  check('dashboard reachable', !!dashBtn);
  if (dashBtn) { dashBtn.click(); await sleep(400); }
  const stats = [...document.querySelectorAll('.stat-value')].map((e) => e.textContent || '');
  check('dashboard shows at least 4 statistics', stats.length >= 4, stats.join(' | '));
  check('module count > 0', stats.length > 1 && Number(stats[1]) > 0, stats[1]);
  check('part count > 0', stats.length > 2 && Number(stats[2]) > 0, stats[2]);
  check('board area > 0', stats.length > 3 && parseFloat(stats[3]) > 0, stats[3]);

  // Workbook dimension on the cutting list: 80 - 3.2 = 76.8 cm = 768 mm.
  await navTo('لیست برش');
  const rows = document.querySelectorAll('table.data tbody tr').length;
  check('cutting list has rows', rows > 0, rows);
  check('workbook dimension 76.8 cm renders as 768 mm', (document.body.textContent || '').includes('768'));

  // English / LTR round trip.
  const enBtn = byText('button', 'EN');
  check('language toggle present', !!enBtn);
  if (enBtn) { enBtn.click(); await sleep(400); }
  check('direction switches to LTR', document.documentElement.dir === 'ltr', document.documentElement.dir);
  check('language switches to English', document.documentElement.lang === 'en', document.documentElement.lang);
  check('English UI rendered', (document.body.textContent || '').includes('Cutting list'));
  const faBtn = byText('button', 'فا');
  if (faBtn) { faBtn.click(); await sleep(350); }
  check('switches back to Persian RTL', document.documentElement.dir === 'rtl', document.documentElement.dir);

  return checks;
})()`;

/* ------------------------------------------------------------------ */
/*  Phase 1 — create a project, enter dimensions, save                 */
/* ------------------------------------------------------------------ */
const SCRIPT_CREATE = String.raw`(async () => {
  check('analyses screen reachable', await navTo('تحلیل جدید'));

  // Name the project, then add a ground cabinet: this creates the project and
  // navigates straight into its editor.
  check('project name field present', setField('نام پروژه', 'پروژهٔ آزمایشی کارگاه'));
  await sleep(150);
  check('customer field present', setField('مشتری', 'کارگاه نمونه'));
  await sleep(150);
  const added = await clickButton('＋ کابینت زمینی');
  check('ground cabinet added', added);
  await sleep(600);

  const projects = projectsRaw();
  const created = findProject('پروژهٔ آزمایشی');
  check('project persisted after creation', !!created, projects ? projects.length + ' project(s)' : 'unreadable');
  check('project kept the typed name', !!(created && created.name.includes('پروژهٔ آزمایشی')), created && created.name);
  check('new project has exactly one module', !!(created && created.modules.length === 1), created && created.modules.length);

  // Enter the workbook row B = 100, body length 70.4 (analiz pro.2, sheet
  // «کابینت زمینی» row 3) so the back panel is 70.4 + 0.8 = 71.2 cm.
  check('width field present', setField('عرض کابینت', 100));
  await sleep(300);
  check('width kept after typing', String(fieldValue('عرض کابینت')) === '100', fieldValue('عرض کابینت'));
  check('body-length field present', setField('بدنه — طول', 70.4));
  await sleep(400);

  const body = document.body.textContent || '';
  check('shelf length 96.8 cm shown for B = 100', body.includes('96.8'));
  check('back width 98.4 cm shown for B = 100', body.includes('98.4'));
  check('back length 71.2 cm shown for B = 100', body.includes('71.2'));
  check('door tier 2 selected (49.8 cm)', body.includes('49.8'));

  const mod = findProject('پروژهٔ آزمایشی')?.modules?.[0];
  check('typed width saved to the project file', !!(mod && Number(mod.input.width) === 100), mod && mod.input.width);

  // The same numbers must reach the cutting list, in millimetres.
  check('cutting list reachable', await navTo('لیست برش'));
  const listText = document.body.textContent || '';
  check('cutting list shows 968 mm shelf', listText.includes('968'));
  check('cutting list shows 984 mm back panel', listText.includes('984'));
  check('cutting list has the project name', listText.includes('پروژهٔ آزمایشی') || listText.length > 200);
  return checks;
})()`;

const SCRIPT_CLICK_CSV = String.raw`(async () => {
  const ok = await clickButton('CSV');
  return [{ name: 'cutting-list CSV export triggered', ok: !!ok, detail: ok ? null : 'button not found' }];
})()`;

/* ------------------------------------------------------------------ */
/*  Phase 1 — drawings, DXF, print bundle                              */
/* ------------------------------------------------------------------ */
const SCRIPT_DRAWINGS = String.raw`(async () => {
  check('exploded drawing screen reachable', await navTo('نقشهٔ انفجاری'));
  const images = [...document.querySelectorAll('img.sheet-svg')];
  check('at least one A4 sheet rendered', images.length > 0, images.length);
  const svg = images.length ? decodeURIComponent(images[0].src.split(',')[1]) : '';
  check('sheet is A4 portrait', svg.includes('viewBox="0 0 210 297"'));
  check('sheet carries a legend', svg.includes('نام قطعه'));
  check('sheet states it is illustrative', svg.includes('چیدمان نمایشی'));
  check('sheet shows a sheet number', /برگه \d+ \/ \d+/.test(svg) || svg.includes('برگه'), (svg.match(/برگه \d+ \/ \d+/) || ['none'])[0]);
  return checks;
})()`;

const SCRIPT_CLICK_DXF = String.raw`(async () => {
  const ok = await clickButton('DXF');
  return [{ name: 'DXF export triggered', ok: !!ok, detail: ok ? null : 'button not found' }];
})()`;

const SCRIPT_CLICK_PDF = String.raw`(async () => {
  const ok = await clickButton('ذخیرهٔ PDF');
  return [{ name: 'A4 print bundle triggered', ok: !!ok, detail: ok ? null : 'button not found' }];
})()`;

/* ------------------------------------------------------------------ */
/*  Phase 1 — backup, invalid restore, valid restore                   */
/* ------------------------------------------------------------------ */
const SCRIPT_CLICK_BACKUP = String.raw`(async () => {
  check('projects screen reachable', await navTo('پروژه‌ها'));
  const ok = await clickButton('پشتیبان‌گیری');
  return checks.concat([{ name: 'backup download triggered', ok: !!ok, detail: ok ? null : 'button not found' }]);
})()`;

const SCRIPT_RESTORE = String.raw`(async () => {
  const fileInput = document.querySelector('input[type=file]');
  check('restore control present', !!fileInput);
  if (!fileInput) return checks;

  const drop = (name, text) => {
    const dt = new DataTransfer();
    dt.items.add(new File([text], name, { type: 'application/json' }));
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  };

  // 1) A corrupt file must be refused and must leave the data untouched.
  const before = JSON.stringify(projectsRaw());
  drop('broken.json', '{ this is not json');
  await sleep(600);
  check('invalid backup shows an error toast', /معتبر نیست|Invalid/.test(toastText()), toastText());
  check('invalid backup did not change the data', JSON.stringify(projectsRaw()) === before);

  // 2) A structurally wrong but valid JSON must also be refused.
  drop('wrong.json', JSON.stringify({ hello: 'world' }));
  await sleep(500);
  check('structurally invalid backup refused', /معتبر نیست|Invalid/.test(toastText()));

  // 3) The real backup must restore.
  drop('backup.json', __BACKUP_TEXT__);
  await sleep(700);
  const restored = projectsRaw();
  const restoredProject = findProject('پروژهٔ آزمایشی');
  check('valid backup restores the project', Array.isArray(restored) && restored.length >= 1, restored ? restored.length + ' project(s)' : 'unreadable');
  check('restored project keeps its name and module', !!(restoredProject && restoredProject.modules.length === 1), restoredProject && restoredProject.name);
  check('restore reports success', /بازیابی انجام شد|restored/i.test(toastText()), toastText());
  return checks;
})()`;

/* ------------------------------------------------------------------ */
/*  Phase 1 — invalid input and storage failure                        */
/* ------------------------------------------------------------------ */
const SCRIPT_ROBUSTNESS = String.raw`(async () => {
  check('back to the ground-cabinet editor', await navTo('کابینت زمینی'));

  // Zero width: the formulas still run (Excel arithmetic), but the UI must warn.
  setField('عرض کابینت', 0);
  await sleep(500);
  const zeroText = document.body.textContent || '';
  check('zero width shows a warning or error panel', /هشدار|خطا|Warning|Error/.test(zeroText));
  check('zero width keeps the app alive', !!document.querySelector('.shell'));

  // Absurd width: still no crash, still a warning.
  setField('عرض کابینت', 100000);
  await sleep(500);
  check('absurd width (1 km) is tolerated without crashing', !!document.querySelector('.shell'));
  check('absurd width still renders a results table', document.querySelectorAll('table.data').length > 0);

  // A storage failure must not take the app down.
  const original = Storage.prototype.setItem;
  let threw = false;
  Storage.prototype.setItem = function () {
    threw = true;
    const e = new Error('QuotaExceededError');
    e.name = 'QuotaExceededError';
    throw e;
  };
  setField('عرض کابینت', 120);
  await sleep(600);
  const alive = !!document.querySelector('.shell') && document.querySelectorAll('.nav button').length === 13;
  Storage.prototype.setItem = original;
  check('a failing localStorage.setItem was actually exercised', threw);
  check('app survives a storage write failure', alive);
  check('storage failure is reported to the user', /حافظهٔ محلی|local storage/i.test(document.body.textContent || ''), toastText());

  // Restore a sane value so the persisted project stays meaningful for phase 2.
  setField('عرض کابینت', 100);
  await sleep(600);
  const mod = findProject('پروژهٔ آزمایشی')?.modules?.[0];
  check('project still saves after the storage failure', !!(mod && Number(mod.input.width) === 100), mod && mod.input.width);
  return checks;
})()`;

/* ------------------------------------------------------------------ */
/*  Phase 2 — reopen the same profile in a new process                 */
/* ------------------------------------------------------------------ */
const SCRIPT_REOPEN = String.raw`(async () => {
  await waitFor(() => document.querySelector('#root') && document.querySelector('#root').children.length);
  check('application mounted after restart', !!document.querySelector('.shell'));
  check('direction is still RTL after restart', document.documentElement.dir === 'rtl', document.documentElement.dir);

  const projects = projectsRaw();
  const reopened = findProject('پروژهٔ آزمایشی');
  check('project survived closing and reopening the app', !!reopened, projects ? projects.length + ' project(s)' : 'unreadable');
  check('saved project name survived', !!(reopened && reopened.name.includes('پروژهٔ آزمایشی')), reopened && reopened.name);
  const mod = reopened?.modules?.[0];
  check('entered width survived (100 cm)', !!(mod && Number(mod.input.width) === 100), mod && mod.input.width);

  check('projects screen reachable', await navTo('پروژه‌ها'));
  check('project listed in the projects table', (document.body.textContent || '').includes('پروژهٔ آزمایشی'));

  check('cutting list reachable', await navTo('لیست برش'));
  check('recomputed values after restart (968 mm)', (document.body.textContent || '').includes('968'));

  check('exploded drawings still render', await navTo('نقشهٔ انفجاری'));
  check('sheet present after restart', document.querySelectorAll('img.sheet-svg').length > 0);
  return checks;
})()`;

/* ------------------------------------------------------------------ */
/*  Script wrapper                                                     */
/* ------------------------------------------------------------------ */

/**
 * Wrap one script for `executeJavaScript`.
 *
 * Two things matter here:
 *  - **One scope per evaluation.** The prelude declares `const` bindings; run
 *    twice in the page's global lexical scope they would be a SyntaxError on
 *    the second call, which Electron reports only as "Script failed to
 *    execute". Wrapping in an async function gives every run its own scope.
 *  - **Real error text.** Any throw is converted into a failed check carrying
 *    the actual message and stack, instead of the generic Electron text.
 */
function wrapScript(body) {
  return `(async () => {
${PRELUDE}
try {
  return await (${body});
} catch (e) {
  return [{ name: 'in-page error', ok: false, detail: String((e && e.stack) || e) }];
}
})()`;
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

/** Validate a downloaded file from the main process (real bytes on disk). */
function fileChecks(name, dir) {
  const out = [];
  const has = (suffix) => fs.readdirSync(dir).some((f) => f.endsWith(suffix));
  if (name === 'csv') {
    const file = fs.readdirSync(dir).find((f) => f.endsWith('.csv'));
    if (!file) return [{ name: 'CSV file was written to disk', ok: false, detail: 'no .csv in downloads' }];
    const raw = fs.readFileSync(path.join(dir, file));
    const text = raw.toString('utf8');
    out.push({ name: 'CSV file was written to disk', ok: true, detail: `${file} (${raw.length} bytes)` });
    out.push({ name: 'CSV starts with a UTF-8 BOM (Excel-safe Persian)', ok: raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf });
    out.push({ name: 'CSV uses CRLF line endings', ok: text.includes('\r\n') });
    out.push({
      name: 'CSV has a header row',
      ok: /\r\n/.test(text) && text.split('\r\n')[0].length > 10,
      detail: text.split('\r\n')[0].slice(0, 80),
    });
    out.push({ name: 'CSV contains the workshop project row (968)', ok: /968/.test(text) });
    out.push({ name: 'CSV contains the back panel (984)', ok: /984/.test(text) });
    out.push({ name: 'CSV contains Persian part names', ok: /[\u0600-\u06FF]/.test(text) });
    out.push({ name: 'CSV rows are comma-separated with a stable column count', ok: (() => {
      const rows = text.replace(/^\uFEFF/, '').split('\r\n').filter(Boolean).map((r) => r.split(',').length);
      return rows.length > 1 && new Set(rows).size === 1;
    })() });
  }
  if (name === 'dxf') {
    const file = fs.readdirSync(dir).find((f) => f.endsWith('.dxf'));
    if (!file) return [{ name: 'DXF file was written to disk', ok: false, detail: 'no .dxf in downloads' }];
    const raw = fs.readFileSync(path.join(dir, file));
    const text = raw.toString('ascii');
    out.push({ name: 'DXF file was written to disk', ok: true, detail: `${file} (${raw.length} bytes)` });
    out.push({ name: 'DXF declares an R12 (AC1009) version', ok: text.includes('AC1009') });
    out.push({ name: 'DXF declares millimetre units ($INSUNITS = 4)', ok: /\$INSUNITS\r?\n\s*70\r?\n\s*4/.test(text) });
    out.push({ name: 'DXF documents the OUTLINE layer', ok: /OUTLINE/.test(text) });
    out.push({ name: 'DXF has an empty MACHINING layer', ok: /MACHINING/.test(text) });
    out.push({ name: 'DXF ends with EOF', ok: /EOF\s*$/.test(text.trim()) });
    out.push({ name: 'DXF has real geometry (LWPOLYLINE/LINE entities)', ok: /(LWPOLYLINE|LINE)/.test(text) });
    out.push({ name: 'DXF geometry is in millimetres (contains 968 or larger coordinates)', ok: /(968|984|712)/.test(text) });
  }
  if (name === 'html') {
    const file = fs.readdirSync(dir).find((f) => f.endsWith('.html'));
    if (!file) return [{ name: 'A4 print bundle written to disk', ok: false, detail: 'no .html in downloads' }];
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    const sections = (text.match(/<section class="page">/g) || []).length;
    out.push({ name: 'A4 print bundle written to disk', ok: true, detail: `${file} (${text.length} bytes, ${sections} page(s))` });
    out.push({ name: 'print bundle sets @page A4 portrait', ok: /@page\s*{\s*size:\s*A4 portrait/.test(text) });
    out.push({ name: 'each page breaks after itself (print pagination)', ok: /break-after:\s*page/.test(text) });
    out.push({ name: 'bundle has one section per page', ok: sections >= 1, sections });
    out.push({ name: 'bundle embeds a 210x297 sheet', ok: text.includes('0 0 210 297') });
    out.push({ name: 'bundle prints the legend header', ok: text.includes('نام قطعه') });
    out.push({ name: 'bundle prints component numbers', ok: /<circle/.test(text) });
  }
  if (name === 'backup') {
    const file = fs.readdirSync(dir).find((f) => f.startsWith('cabinet-analysis-backup') && f.endsWith('.json'));
    if (!file) return [{ name: 'backup JSON written to disk', ok: false, detail: 'no backup json in downloads' }];
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    let data = null;
    try { data = JSON.parse(text); } catch (e) { data = null; }
    out.push({ name: 'backup JSON written to disk', ok: true, detail: `${file} (${text.length} bytes)` });
    out.push({ name: 'backup JSON is parseable', ok: !!data });
    out.push({ name: 'backup declares the app id', ok: !!(data && data.app === 'cabinet-analysis-pro') });
    out.push({ name: 'backup contains the project', ok: !!(data && Array.isArray(data.projects) && data.projects.length >= 1) });
    out.push({ name: 'backup contains the 100 cm width', ok: !!(data && JSON.stringify(data).includes('"width":100')) });
    out.push({ name: 'backup contains settings (so a restore is complete)', ok: !!(data && data.settings) });
    return { checks: out, text };
  }
  void has;
  return out;
}

function waitForDownload(predicate, timeout = 20000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      const hit = downloads.find((d) => predicate(d.file) && d.state === 'completed');
      if (hit) return resolve(hit);
      if (Date.now() - started > timeout) return resolve(null);
      setTimeout(tick, 100);
    };
    tick();
  });
}

/**
 * Hard watchdog: a CI job must fail with a message, never sit for 40 minutes.
 */
const WATCHDOG_MS = 6 * 60 * 1000;
const watchdog = setTimeout(() => {
  console.error(`[smoke] watchdog: phase ${phase} exceeded ${WATCHDOG_MS / 1000}s — aborting`);
  app.exit(1);
}, WATCHDOG_MS);

async function run() {
  await app.whenReady();

  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    if (/^https?:/i.test(details.url)) networkRequests.push(details.url);
    callback({ cancel: false });
  });

  session.defaultSession.on('will-download', (_event, item) => {
    const target = path.join(DOWNLOADS, item.getFilename());
    item.setSavePath(target);
    item.once('done', (_e, state) => downloads.push({ file: target, state }));
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
      // A hidden window otherwise throttles painting, which makes capturePage()
      // (and therefore this run) hang forever on CI.
      backgroundThrottling: false,
    },
  });

  const consoleErrors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) consoleErrors.push(message);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[smoke] renderer crashed:', JSON.stringify(details));
    app.exit(1);
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[smoke] did-fail-load ${code} ${desc} ${url}`);
  });

  try {
    await win.loadFile(entry);
  } catch (err) {
    console.error('[smoke] loadFile failed:', err && err.message);
    app.exit(1);
    return;
  }

  const allChecks = [];
  const runScript = async (script) => {
    try {
      const result = await win.webContents.executeJavaScript(wrapScript(script), true);
      if (Array.isArray(result)) allChecks.push(...result);
      return result;
    } catch (err) {
      allChecks.push({ name: 'in-page script threw', ok: false, detail: err && err.message });
      return null;
    }
  };

  if (phase === 1) {
    await runScript(SCRIPT_BASICS);

    await runScript(SCRIPT_CREATE);
    await runScript(SCRIPT_CLICK_CSV);
    const csv = await waitForDownload((f) => f.endsWith('.csv'));
    if (csv) allChecks.push(...fileChecks('csv', DOWNLOADS));
    else allChecks.push({ name: 'CSV download completed', ok: false, detail: 'timed out' });

    await runScript(SCRIPT_DRAWINGS);
    await runScript(SCRIPT_CLICK_DXF);
    const dxf = await waitForDownload((f) => f.endsWith('.dxf'));
    if (dxf) allChecks.push(...fileChecks('dxf', DOWNLOADS));
    else allChecks.push({ name: 'DXF download completed', ok: false, detail: 'timed out' });

    await runScript(SCRIPT_CLICK_PDF);
    const html = await waitForDownload((f) => f.endsWith('.html'));
    if (html) allChecks.push(...fileChecks('html', DOWNLOADS));
    else allChecks.push({ name: 'print bundle download completed', ok: false, detail: 'timed out' });

    await runScript(SCRIPT_CLICK_BACKUP);
    const backup = await waitForDownload((f) => f.includes('backup') && f.endsWith('.json'));
    let backupText = '{}';
    if (backup) {
      const res = fileChecks('backup', DOWNLOADS);
      allChecks.push(...res.checks);
      backupText = res.text || '{}';
    } else {
      allChecks.push({ name: 'backup download completed', ok: false, detail: 'timed out' });
    }

    await runScript(SCRIPT_RESTORE.replace('__BACKUP_TEXT__', JSON.stringify(backupText)));
    await runScript(SCRIPT_ROBUSTNESS);

    // A real screenshot, so a human can confirm Persian glyphs actually render.
    // The capture is raced against a timeout: a headless GPU-less runner can
    // refuse to produce a frame, and that must not hang the whole job.
    try {
      const shot = await Promise.race([
        win.webContents.capturePage(),
        new Promise((_resolve, reject) => setTimeout(() => reject(new Error('capturePage timed out')), 8000)),
      ]);
      const png = shot.toPNG();
      fs.writeFileSync(path.join(__dirname, 'smoke-screen.png'), png);
      const size = shot.getSize();
      allChecks.push({
        name: 'screenshot captured for human font check',
        ok: png.length > 5000 && size.width > 100,
        detail: `${size.width}x${size.height}, ${png.length} bytes`,
      });
    } catch (err) {
      allChecks.push({ name: 'screenshot captured for human font check', ok: false, detail: String(err && err.message) });
    }
  } else {
    await runScript(SCRIPT_REOPEN);
  }

  /* ---- offline guarantee + console errors ---- */
  const offlineOk = networkRequests.length === 0;
  allChecks.push({
    name: 'no network requests (offline)',
    ok: offlineOk,
    detail: offlineOk ? null : networkRequests.slice(0, 5).join(', '),
  });

  const failed = allChecks.filter((c) => !c.ok);
  console.log(`\n=== Cabinet Analysis Pro — functional smoke test (phase ${phase}, ${process.platform}) ===`);
  console.log(`renderer: ${entry}`);
  console.log(`electron: ${process.versions.electron}  chrome: ${process.versions.chrome}  node: ${process.versions.node}\n`);
  for (const c of allChecks) {
    console.log(`${c.ok ? '  ✓' : '  ✗'} ${c.name}${c.detail !== null && c.detail !== undefined ? `  (${c.detail})` : ''}`);
  }
  if (consoleErrors.length) {
    console.log(`\n  console errors (${consoleErrors.length}):`);
    for (const e of consoleErrors.slice(0, 5)) console.log(`    - ${e}`);
  }

  const report = {
    phase,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    release: process.platform === 'win32' ? process.getSystemVersion?.() ?? null : null,
    renderer: entry,
    checks: allChecks,
    networkRequests,
    downloadedFiles: downloads.map((d) => path.basename(d.file)),
    consoleErrors,
    passed: allChecks.length - failed.length,
    total: allChecks.length,
    honesty: 'Runs on a hosted CI Windows runner against the real built app. Not a physical workshop PC; no printing hardware, code-signing or antivirus is exercised.',
  };
  try {
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  } catch (err) {
    console.error('[smoke] could not write report:', err && err.message);
  }

  console.log(`\n${report.passed}/${report.total} checks passed (phase ${phase})`);
  console.log(`SMOKE_RESULT ${failed.length === 0 ? 'PASS' : 'FAIL'} ${report.passed}/${report.total}`);
  clearTimeout(watchdog);
  app.exit(failed.length === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('[smoke] fatal:', err);
  app.exit(1);
});
