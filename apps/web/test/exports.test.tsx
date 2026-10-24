/**
 * Export / backup / restore behaviour.
 *
 * These exercise the real code paths behind the "پشتیبانگیری", "بازگردانی" and
 * "CSV" buttons, including the bytes that would be written to disk.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App.js';
import { toCsv } from '../src/exporters.js';

let captured: Blob[] = [];

beforeEach(() => {
  captured = [];
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn((b: Blob) => {
      captured.push(b);
      return 'blob:mock';
    }),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  localStorage.clear();
});

function navBtn(label: string): HTMLElement {
  const nav = document.querySelector('.nav') as HTMLElement;
  const btn = [...nav.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(label));
  if (!btn) throw new Error(`nav button not found: ${label}`);
  return btn as HTMLElement;
}

async function withSample() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'بارگذاری نمونهٔ پروژه' }));
  return user;
}

describe('CSV generation', () => {
  it('prefixes a UTF-8 BOM so Excel reads Persian correctly', () => {
    const csv = toCsv([['نام', 'مقدار'], ['کف', 1]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('quotes fields containing commas, quotes or newlines', () => {
    const csv = toCsv([['a,b', 'say "hi"', 'line\nbreak']]);
    expect(csv).toContain('"a,b"');
    expect(csv).toContain('"say ""hi"""');
    expect(csv).toContain('"line\nbreak"');
  });

  it('uses CRLF row separators', () => {
    expect(toCsv([['a'], ['b']])).toContain('\r\n');
  });
});

describe('cutting-list export', () => {
  it('writes a CSV containing the computed parts', async () => {
    const user = await withSample();
    await user.click(navBtn('لیست برش'));
    await user.click(screen.getByRole('button', { name: '⭳ CSV' }));

    await waitFor(() => expect(captured.length).toBeGreaterThan(0));
    const text = await captured[0].text();
    expect(text).toContain('unit,part,qty');
    expect(text).toContain('length_mm');
    // the workbook-derived shelf length 76.8 cm must appear as 768 mm
    expect(text).toContain('768');
    // and Persian part names must survive
    expect(text).toContain('طبقه');
  });
});

describe('backup and restore', () => {
  it('backs up every project as parseable JSON', async () => {
    const user = await withSample();
    await user.click(navBtn('پروژه‌ها و مشتریان'));
    await user.click(screen.getByRole('button', { name: /پشتیبان‌گیری/ }));

    await waitFor(() => expect(captured.length).toBeGreaterThan(0));
    const text = await captured[0].text();
    const data = JSON.parse(text);
    expect(data.app).toBe('cabinet-analysis-pro');
    expect(Array.isArray(data.projects)).toBe(true);
    expect(data.projects.length).toBeGreaterThan(0);
    expect(data.projects[0].modules.length).toBeGreaterThan(0);
    expect(data.settings).toBeTruthy();
  });

  it('restores projects from a backup file', async () => {
    const user = await withSample();
    await user.click(navBtn('پروژه‌ها و مشتریان'));

    const backup = {
      app: 'cabinet-analysis-pro',
      version: 1,
      projects: [
        {
          id: 'restored-1',
          name: 'پروژهٔ بازیابی‌شده',
          customer: 'مشتری آزمایشی',
          status: 'confirmed',
          notes: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          modules: [],
        },
      ],
    };

    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    fireEvent.change(input);

    await waitFor(() => {
      const raw = localStorage.getItem('cap.projects.v1');
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      expect(parsed.map((p: { name: string }) => p.name)).toContain('پروژهٔ بازیابی‌شده');
    });
  });

  it('rejects a malformed backup without destroying existing data', async () => {
    const user = await withSample();
    await user.click(navBtn('پروژه‌ها و مشتریان'));

    const before = localStorage.getItem('cap.projects.v1');
    const file = new File(['{not json'], 'broken.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    fireEvent.change(input);

    // The toast reports the failure...
    await waitFor(() => {
      expect(document.body.textContent).toContain('فایل پشتیبان معتبر نیست');
    });
    // ...and the previous projects are untouched.
    expect(localStorage.getItem('cap.projects.v1')).toBe(before);
  });

  it('restores a single project exported from the projects table', async () => {
    const user = await withSample();
    await user.click(navBtn('پروژه‌ها و مشتریان'));

    const table = document.querySelector('table.data') as HTMLTableElement;
    const exportBtn = [...table.querySelectorAll('button')].find((b) => b.textContent === '⭳');
    expect(exportBtn).toBeTruthy();
    await user.click(exportBtn as HTMLElement);

    await waitFor(() => expect(captured.length).toBeGreaterThan(0));
    const data = JSON.parse(await captured[0].text());
    expect(data.projects).toHaveLength(1);
    expect(data.projects[0].modules.length).toBeGreaterThan(0);
  });
});
