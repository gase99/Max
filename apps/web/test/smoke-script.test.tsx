/**
 * Cross-check of the Electron smoke test.
 *
 * `apps/desktop/smoke-test.cjs` asserts a list of things about the running
 * application (RTL, 12 nav items, sample project, the 76.8 cm -> 768 mm
 * dimension, localStorage persistence, English LTR). Those assertions are only
 * meaningful if they actually match the real DOM.
 *
 * This test extracts the very same in-page script from the desktop smoke test
 * and executes it against the real React application in jsdom, so a wrong
 * selector or a changed label breaks the build here — not silently on Windows.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import App from '../src/App.js';

// jsdom rewrites import.meta.url to an http(s) URL, so resolve from cwd instead.
const SMOKE_FILE = resolve(process.cwd(), 'apps', 'desktop', 'smoke-test.cjs');

function extractPageScript(): string {
  const src = readFileSync(SMOKE_FILE, 'utf8');
  const start = src.indexOf('String.raw`');
  expect(start, 'smoke-test.cjs must define RENDERER_SCRIPT with String.raw').toBeGreaterThan(-1);
  const bodyStart = start + 'String.raw`'.length;
  const end = src.indexOf('`;', bodyStart);
  expect(end).toBeGreaterThan(bodyStart);
  return src.slice(bodyStart, end);
}

type Check = { name: string; ok: boolean; detail: string | null };

describe('electron smoke script (executed against the real app)', () => {
  let objectUrlSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    objectUrlSpy = vi.fn(() => 'blob:mock');
    // jsdom has no createObjectURL implementation
    Object.defineProperty(URL, 'createObjectURL', { value: objectUrlSpy, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('all smoke assertions pass against the real application', async () => {
    render(<App />);

    const script = extractPageScript();
    // The script is an async IIFE expression; evaluate it and await the result.
    // It is wrapped in parentheses because a bare `return` followed by a newline
    // is subject to automatic semicolon insertion and would return undefined.
    // eslint-disable-next-line no-new-func
    const run = new Function(`return (${script.trim()})`) as () => Promise<Check[]>;
    const checks = await run();

    expect(Array.isArray(checks)).toBe(true);
    expect(checks.length).toBeGreaterThan(10);

    const failed = checks.filter((c) => !c.ok);
    // Report precisely which assertion failed instead of a bare boolean.
    expect(
      failed.map((c) => `${c.name} (got: ${c.detail})`),
      'smoke assertions that do not hold against the real app',
    ).toEqual([]);
  }, 30000);

  it('the extracted script is the one used by the desktop smoke test', () => {
    const script = extractPageScript();
    expect(script).toContain('بارگذاری نمونهٔ پروژه');
    expect(script).toContain('لیست برش');
    expect(script).toContain('768');
  });
});
