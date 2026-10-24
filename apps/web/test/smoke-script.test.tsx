/**
 * Cross-check of the Electron functional smoke test.
 *
 * `apps/desktop/smoke-test.cjs` drives the real Electron app. Every selector in
 * it is a promise about this React application, so the same scripts are
 * executed here against the real app in jsdom: a renamed label or a changed CSS
 * class breaks the build here instead of failing silently on the Windows runner.
 *
 * The scripts live in `String.raw` templates and are composed from a shared
 * `PRELUDE`; this test rebuilds each script exactly the way the desktop test
 * does, so the code under test is the code that ships.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { render } from '@testing-library/react';
import App from '../src/App.js';

// jsdom rewrites import.meta.url to an http(s) URL, so resolve from cwd instead.
const SMOKE_FILE = resolve(process.cwd(), 'apps', 'desktop', 'smoke-test.cjs');
const SOURCE = readFileSync(SMOKE_FILE, 'utf8');

/** Body of `const <name> = String.raw` … `;` (raw text, backticks excluded). */
function rawBlock(name: string): string {
  const marker = `const ${name} = String.raw\``;
  const start = SOURCE.indexOf(marker);
  expect(start, `smoke-test.cjs must define ${name} as a String.raw template`).toBeGreaterThan(-1);
  const bodyStart = start + marker.length;
  const end = SOURCE.indexOf('`;', bodyStart);
  expect(end).toBeGreaterThan(bodyStart);
  return SOURCE.slice(bodyStart, end);
}

/**
 * Rebuild a script with `PRELUDE` interpolated, keeping raw backslashes (the
 * scripts contain regexes such as /\u0600-\u06FF/ and /$INSUNITS/ style
 * patterns that a plain template literal would mangle).
 */
function materialise(name: string, prelude: string): string {
  const body = rawBlock(name);
  // eslint-disable-next-line no-new-func
  const build = new Function('PRELUDE', `return String.raw\`${body}\`;`) as (p: string) => string;
  return build(prelude);
}

type Check = { name: string; ok: boolean; detail: string | null };

/** The shared helpers, as real JavaScript the scripts can be prepended with. */
function preludeSource(): string {
  return materialise('PRELUDE', '');
}

/**
 * Reproduce `wrapScript()` from `smoke-test.cjs`: the prelude and the script body
 * share one async function scope, and a throw becomes a failed check with its
 * real message (Electron only reports "Script failed to execute").
 */
function wrapScript(body: string): string {
  return `(async () => {
${preludeSource()}
try {
  return await (${body});
} catch (e) {
  return [{ name: 'in-page error', ok: false, detail: String((e && e.stack) || e) }];
}
})()`;
}

async function runScripts(names: string[]): Promise<Check[]> {
  const out: Check[] = [];
  for (const name of names) {
    const source = wrapScript(materialise(name, '').trim());
    // eslint-disable-next-line no-new-func
    const run = new Function(`return ${source}`) as () => Promise<Check[]>;
    const checks = await run();
    expect(Array.isArray(checks), `${name} must resolve to a list of checks`).toBe(true);
    out.push(...checks);
  }
  return out;
}

describe('electron smoke scripts (executed against the real app)', () => {
  /**
   * A syntax error in the desktop script does not fail loudly on Windows: the
   * Electron main process shows a blocking error dialog, so CI hangs until the
   * job times out. This check turns that into an instant, local failure.
   */
  it('the desktop smoke script parses as JavaScript', () => {
    expect(() => execFileSync(process.execPath, ['--check', SMOKE_FILE], { stdio: 'pipe' })).not.toThrow();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('basics script passes against the real application', async () => {
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:mock'), configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
    render(<App />);

    const checks = await runScripts(['SCRIPT_BASICS']);
    expect(checks.length).toBeGreaterThan(8);
    const failed = checks.filter((c) => !c.ok).map((c) => `${c.name} (got: ${c.detail})`);
    expect(failed, 'smoke assertions that do not hold against the real app').toEqual([]);
  }, 40000);

  it('project-creation script creates, edits and saves a project', async () => {
    render(<App />);
    const checks = await runScripts(['SCRIPT_CREATE']);
    const failed = checks.filter((c) => !c.ok).map((c) => `${c.name} (got: ${c.detail})`);
    expect(failed, 'project-creation assertions that do not hold against the real app').toEqual([]);
    // The saved project must carry the typed dimension, not the default one.
    const saved = JSON.parse(localStorage.getItem('cap.projects.v1') || '[]');
    expect(saved).toHaveLength(1);
    expect(saved[0].modules[0].input.width).toBe(100);
  }, 40000);

  it('drawing script finds a real A4 sheet in the gallery', async () => {
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:mock'), configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
    render(<App />);
    // Two units: a ground cabinet (11 parts) and a wall cabinet (20 parts, so
    // its parts table has to continue on a second A4 page).
    const checks = await runScripts(['SCRIPT_CREATE', 'SCRIPT_ADD_WALL', 'SCRIPT_DRAWINGS']);
    const failed = checks.filter((c) => !c.ok).map((c) => `${c.name} (got: ${c.detail})`);
    expect(failed).toEqual([]);
  }, 40000);

  it('every script is wired to the real UI text, not to placeholders', () => {
    const names = ['SCRIPT_BASICS', 'SCRIPT_CREATE', 'SCRIPT_ADD_WALL', 'SCRIPT_CLICK_CSV', 'SCRIPT_DRAWINGS', 'SCRIPT_CLICK_DXF', 'SCRIPT_CLICK_PDF', 'SCRIPT_CLICK_BACKUP', 'SCRIPT_RESTORE', 'SCRIPT_ROBUSTNESS', 'SCRIPT_REOPEN'];
    const all = names.map((n) => wrapScript(materialise(n, '').trim())).join('\n');
    for (const literal of ['بارگذاری نمونهٔ پروژه', 'لیست برش', 'نقشهٔ انفجاری', 'پشتیبان‌گیری', 'DXF', '768', 'پروژهٔ آزمایشی']) {
      expect(all, `the smoke scripts must reference «${literal}»`).toContain(literal);
    }
    // Only the restore script may carry the backup placeholder, and it is
    // substituted with real file text before it is ever evaluated.
    const placeholders = all.split('__BACKUP_TEXT__').length - 1;
    expect(placeholders).toBe(1);
    expect(materialise('SCRIPT_RESTORE', preludeSource())).toContain('__BACKUP_TEXT__');
  });
});
