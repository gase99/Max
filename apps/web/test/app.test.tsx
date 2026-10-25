/**
 * UI smoke / behaviour tests rendered into a real DOM (jsdom).
 *
 * These assert that the screens are wired to the calculation engine — not that
 * a component merely exists. Changing an input must change the computed output.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, within, act, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App.js';


/** Find a sidebar nav button by its visible label (badges may be appended). */
function navBtn(label: string): HTMLElement {
  const nav = document.querySelector('.nav') as HTMLElement;
  const btn = [...nav.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(label));
  if (!btn) throw new Error(`nav button not found: ${label}`);
  return btn as HTMLElement;
}

async function loadSample(user: ReturnType<typeof userEvent.setup>) {
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'بارگذاری نمونهٔ پروژه' }));
  return user;
}

describe('application shell', () => {
  it('renders the brand and Persian RTL layout by default', () => {
    render(<App />);
    expect(screen.getByText('Cabinet Analysis Pro')).toBeInTheDocument();
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('fa');
  });

  it('shows all thirteen navigation destinations', () => {
    render(<App />);
    const expected = [
      'داشبورد', 'تحلیل جدید', 'کابینت زمینی', 'کابینت هوایی', 'کشو',
      'لیست برش', 'بهینه‌سازی ورق', 'نقشهٔ انفجاری', 'متریال و یراق',
      'قیمت و بهای تمام‌شده', 'پروژه‌ها و مشتریان', 'گزارش‌ها و خروجی', 'تنظیمات و ممیزی فرمول',
    ];
    const nav = document.querySelector('.nav') as HTMLElement;
    for (const label of expected) {
      expect(within(nav).getByText(label)).toBeInTheDocument();
    }
  });

  it('switches to LTR English on the language toggle', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'EN' }));
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
  });
});

describe('dashboard + sample project', () => {
  it('reports zero state before any project exists', () => {
    render(<App />);
    expect(screen.getByText(/هنوز پروژه‌ای ندارید/)).toBeInTheDocument();
  });

  it('loads the sample project and shows non-zero statistics', async () => {
    const user = userEvent.setup();
    await loadSample(user);
    await user.click(navBtn('داشبورد'));
    const stats = document.querySelectorAll('.stat-value');
    expect(stats.length).toBeGreaterThanOrEqual(4);
    // parts count must be > 0
    expect(Number(stats[2].textContent)).toBeGreaterThan(0);
    // board area m² must be > 0
    expect(parseFloat(stats[3].textContent!)).toBeGreaterThan(0);
  });
});

describe('ground cabinet screen', () => {
  it('lists the sample units and shows computed parts', async () => {
    const user = userEvent.setup();
    await loadSample(user);
    await user.click(navBtn('کابینت زمینی'));
    expect(screen.getAllByText(/کابینت زمینی ۸۰/).length).toBeGreaterThan(0);
    // parts table must contain a shelf row
    expect(screen.getAllByText('طبقه').length).toBeGreaterThan(0);
  });

  it('recalculates the shelf length when the cabinet width changes', async () => {
    const user = userEvent.setup();
    await loadSample(user);
    await user.click(navBtn('کابینت زمینی'));

    const widthInput = screen.getByLabelText(/عرض کابینت \(B\)/) as HTMLInputElement;
    expect(widthInput.value).toBe('80');

    // shelf length must be 80 - 3.2 = 76.8 cm before the edit
    const before = screen.getAllByText('76.8');
    expect(before.length).toBeGreaterThan(0);

    await user.clear(widthInput);
    await user.type(widthInput, '90');

    // 90 - 3.2 = 86.8
    expect(screen.getAllByText('86.8').length).toBeGreaterThan(0);
  });

  it('shows the original Excel formula in the audit table', async () => {
    const user = userEvent.setup();
    await loadSample(user);
    await user.click(navBtn('کابینت زمینی'));
    expect(screen.getAllByText('=B2-3.2').length).toBeGreaterThan(0);
  });

  it('rejects an impossible width with a visible error', async () => {
    const user = userEvent.setup();
    await loadSample(user);
    await user.click(navBtn('کابینت زمینی'));
    const widthInput = screen.getByLabelText(/عرض کابینت \(B\)/) as HTMLInputElement;
    await user.clear(widthInput);
    await user.type(widthInput, '0');
    expect(screen.getAllByText(/عرض کابینت باید بزرگ‌تر از صفر باشد/).length).toBeGreaterThan(0);
  });
});

describe('cutting list', () => {
  it('shows aggregated parts and a totals row', async () => {
    const user = userEvent.setup();
    await loadSample(user);
    await user.click(navBtn('لیست برش'));
    const table = document.querySelector('table.data') as HTMLTableElement;
    expect(table).toBeTruthy();
    const bodyRows = table.querySelectorAll('tbody tr');
    expect(bodyRows.length).toBeGreaterThan(0);
    expect(table.querySelector('tfoot')).toBeTruthy();
  });

  it('filters by part type', async () => {
    const user = userEvent.setup();
    await loadSample(user);
    await user.click(navBtn('لیست برش'));
    const selects = document.querySelectorAll('.toolbar select');
    const roleSelect = selects[2] as HTMLSelectElement;
    await user.selectOptions(roleSelect, 'door');
    const table = document.querySelector('table.data') as HTMLTableElement;
    const cells = [...table.querySelectorAll('tbody tr td:first-child')].map((c) => c.textContent);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((c) => c === 'درب')).toBe(true);
  });

  it('merges identical parts when the toggle is on and keeps the piece total', async () => {
    const user = userEvent.setup();
    await loadSample(user);
    await user.click(navBtn('لیست برش'));

    const table = () => document.querySelector('table.data') as HTMLTableElement;
    const rowsBefore = table().querySelectorAll('tbody tr').length;
    const totalBefore = table().querySelector('tfoot td.n')!.textContent;

    await user.click(screen.getByLabelText('ادغام قطعات یکسان'));
    const rowsAfter = table().querySelectorAll('tbody tr').length;
    const totalAfter = table().querySelector('tfoot td.n')!.textContent;

    expect(rowsAfter).toBeLessThan(rowsBefore);
    expect(totalAfter).toBe(totalBefore);
  });
});

describe('sheet optimisation', () => {
  it('produces sheets and a utilisation figure', async () => {
    const user = userEvent.setup();
    await loadSample(user);
    await user.click(navBtn('بهینه‌سازی ورق'));
    await user.click(screen.getByRole('button', { name: /اجرای بهینه‌سازی/ }));

    const sheetSvg = document.querySelectorAll('.sheet-svg');
    expect(sheetSvg.length).toBeGreaterThan(0);

    const stats = [...document.querySelectorAll('.stat-value')].map((s) => s.textContent ?? '');
    const sheets = Number(stats[0]);
    expect(sheets).toBeGreaterThan(0);
    const util = parseFloat(stats[1]);
    expect(util).toBeGreaterThan(0);
    expect(util).toBeLessThanOrEqual(100);
  });

  it('labels the result as theoretical', async () => {
    const user = userEvent.setup();
    await loadSample(user);
    await user.click(navBtn('بهینه‌سازی ورق'));
    expect(screen.getAllByText(/تئوریک/).length).toBeGreaterThan(0);
  });
});

describe('persistence', () => {
  it('writes projects to localStorage so data survives a reload', async () => {
    const user = userEvent.setup();
    await loadSample(user);
    const raw = localStorage.getItem('cap.projects.v1');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].modules.length).toBeGreaterThan(0);
  });

  it('restores projects into the UI from localStorage on mount', async () => {
    const user = userEvent.setup();
    await loadSample(user);
    const raw = localStorage.getItem('cap.projects.v1')!;
    await act(async () => {});
    cleanup();
    localStorage.clear();
    localStorage.setItem('cap.projects.v1', raw);
    render(<App />);
    const stats = document.querySelectorAll('.stat-value');
    expect(stats.length).toBeGreaterThanOrEqual(1);
    expect(Number(stats[0].textContent)).toBeGreaterThan(0); // projects count
  });
});

describe('new project workflow (regression: first module was dropped)', () => {
  /**
   * Quick-add on a fresh installation created the project but lost the cabinet:
   * `addModule` read the stale `selectedId`. This test fails on that bug.
   */
  it('creates a project *and* its first cabinet in one click', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(navBtn('تحلیل جدید'));

    const nameField = [...document.querySelectorAll('.field label')].find((l) =>
      (l.textContent ?? '').includes('نام پروژه'),
    )!.parentElement!.querySelector('input')!;
    await user.type(nameField, 'کارگاه آزمون');
    await user.click(screen.getByRole('button', { name: '＋ کابینت زمینی' }));

    const saved = JSON.parse(localStorage.getItem('cap.projects.v1') || '[]');
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe('کارگاه آزمون');
    expect(saved[0].modules).toHaveLength(1);
    expect(saved[0].modules[0].kind).toBe('ground');

    // The editor must immediately show the cabinet's fields, not an empty state.
    const labels = [...document.querySelectorAll('.field label')].map((l) => l.textContent ?? '');
    expect(labels.some((l) => l.includes('عرض کابینت'))).toBe(true);
    cleanup();
  });

  it('adds further cabinets to the same project', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(navBtn('تحلیل جدید'));
    await user.click(screen.getByRole('button', { name: '＋ کابینت زمینی' }));
    await user.click(navBtn('کابینت هوایی'));
    await user.click(screen.getByRole('button', { name: '＋ افزودن' }));
    const saved = JSON.parse(localStorage.getItem('cap.projects.v1') || '[]');
    expect(saved[0].modules).toHaveLength(2);
    expect(saved[0].modules.map((m: { kind: string }) => m.kind)).toEqual(['ground', 'wall']);
    cleanup();
  });
});

describe('settings & formula audit', () => {
  it('shows the legacy formulas with a verified badge', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(navBtn('تنظیمات و ممیزی فرمول'));
    expect(screen.getAllByText('=B2-3.2').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/صحت‌سنجی‌شده با اکسل/).length).toBeGreaterThan(0);
  });

  it('switches display unit between mm and cm', async () => {
    const user = userEvent.setup();
    await loadSample(user);
    await user.click(navBtn('لیست برش'));
    // default display unit is mm, so a 76.8 cm shelf length renders as 768
    expect(screen.getAllByText('768').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'mm' }));
    expect(screen.getAllByText('76.8').length).toBeGreaterThan(0);
  });
});
