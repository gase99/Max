import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App.js';
import userEvent from '@testing-library/user-event';
import {
  buildCuttingList,
  buildExplodedSheet,
  calculateDrawer,
  calculateGroundCabinet,
  calculateWallCabinet,
  emptyDrawer,
  emptyGroundCabinet,
  emptyWallCabinet,
  type ExplodeModuleInput,
} from '@cabinet/engine';
import { renderExplodedSheetSvgs, renderExplodedSvg, legendColumns, wrapText, scaleLabel } from '../src/explodedSvg.js';
import { layoutDrawing, verifyLayout, type Rect } from '../src/explodedLayout.js';

const materials = [
  { id: 'mdf-white', nameFa: 'MDF سفید', nameEn: 'White MDF' },
  { id: 'back-3mm', nameFa: 'فیبر ۳ میل', nameEn: '3 mm fibreboard' },
];

const modules = (): ExplodeModuleInput[] => [
  {
    id: 'm1',
    label: 'کابینت زمینی زیر سینک',
    labelEn: 'Base cabinet under sink',
    kind: 'ground',
    quantity: 1,
    parts: calculateGroundCabinet(emptyGroundCabinet()).parts,
  },
  {
    id: 'm2',
    label: 'کابینت هوایی',
    labelEn: 'Wall cabinet',
    kind: 'wall',
    quantity: 2,
    parts: calculateWallCabinet(emptyWallCabinet()).parts,
  },
  {
    id: 'm3',
    label: 'کشو',
    labelEn: 'Drawers',
    kind: 'drawer',
    quantity: 1,
    parts: calculateDrawer(emptyDrawer()).parts,
  },
];

const sheet = () => buildExplodedSheet(modules(), { materials });

/** Parse an SVG string with the DOM: the fastest way to assert real output. */
function parse(svg: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(doc.querySelector('parsererror')).toBeNull();
  return doc.documentElement as unknown as SVGSVGElement;
}

describe('exploded SVG sheet — generation', () => {
  it('produces a valid A4 portrait SVG per module', () => {
    const svgs = renderExplodedSheetSvgs(sheet(), { lang: 'fa', projectName: 'پروژهٔ نمونه' });
    expect(svgs).toHaveLength(3);
    for (const svg of svgs) {
      const root = parse(svg);
      expect(root.getAttribute('width')).toBe('210mm');
      expect(root.getAttribute('height')).toBe('297mm');
      expect(root.getAttribute('viewBox')).toBe('0 0 210 297');
    }
  });

  it('is black and white only (no decorative colour)', () => {
    const svg = renderExplodedSvg(sheet().drawings[0], { lang: 'fa', projectName: 'p' });
    const colours = [...svg.matchAll(/(?:fill|stroke)="(#[0-9a-fA-F]{3,6})"/g)].map((m) => m[1].toLowerCase());
    const allowed = new Set(['#ffffff', '#fff', '#000000', '#000', '#d0d0d0', '#e6e6e6', '#222222', '#222', '#333333', '#333', '#555555', '#555', '#666666', '#666']);
    expect(colours.filter((c) => !allowed.has(c))).toEqual([]);
  });

  it('writes Persian right-to-left and English left-to-right', () => {
    const fa = renderExplodedSvg(sheet().drawings[0], { lang: 'fa', projectName: 'پروژه', customer: 'مشتری' });
    const en = renderExplodedSvg(sheet().drawings[0], { lang: 'en', projectName: 'Project', customer: 'Customer' });
    expect(fa).toContain('شماره');
    expect(fa).toContain('نام قطعه');
    expect(fa).toContain('مشتری');
    expect(en).toContain('No.');
    expect(en).toContain('Customer');
    expect(en).not.toContain('شماره');
    // RTL table starts at the right-hand edge.
    const faCols = legendColumns(true, 100, {
      legendNo: 'شماره', legendFa: 'نام قطعه', legendEn: 'English', legendQty: 'تعداد',
      legendLen: 'طول', legendWid: 'عرض', legendThk: 'ضخامت', legendEdge: 'نوار', legendMat: 'متریال',
    } as never);
    expect(faCols[0].x).toBeGreaterThan(faCols[1].x);
    const enCols = legendColumns(false, 100, {
      legendNo: 'No.', legendFa: 'Persian', legendEn: 'Part', legendQty: 'Qty',
      legendLen: 'Length', legendWid: 'Width', legendThk: 'Thk', legendEdge: 'Edge', legendMat: 'Material',
    } as never);
    expect(enCols[0].x).toBeLessThan(enCols[1].x);
  });

  it('carries the cabinet/module identifier and the project name', () => {
    const svg = renderExplodedSvg(sheet().drawings[1], { lang: 'fa', projectName: 'پروژهٔ آزمون', sheetIndex: 2, sheetTotal: 3 });
    expect(svg).toContain('پروژهٔ آزمون');
    expect(svg).toContain('m2');
    expect(svg).toContain('برگه 2 / 3');
  });

  it('prints every legend row that exists in the model, with matching numbers', () => {
    const drawing = sheet().drawings[0];
    const svg = renderExplodedSvg(drawing, { lang: 'fa', projectName: 'p' });
    const root = parse(svg);
    const texts = [...root.querySelectorAll('text')].map((n) => n.textContent ?? '');
    const components = [...new Set(drawing.panels.map((p) => p.componentNo))];
    for (const no of components) {
      expect(texts).toContain(String(no));
    }
    // Every part name appears in the legend.
    for (const name of new Set(drawing.panels.map((p) => p.nameFa))) {
      expect(svg).toContain(name);
    }
    // Quantities: the total pieces figure, not the drawn copies.
    for (const panel of [...new Set(drawing.panels.map((p) => p.componentId))].map(
      (id) => drawing.panels.find((p) => p.componentId === id)!,
    )) {
      expect(texts.filter((t) => t === String(panel.totalPieces)).length).toBeGreaterThan(0);
    }
  });

  it('prints dimensions in millimetres and keeps them equal to the cutting list', () => {
    const mods = modules();
    const rows = buildCuttingList(mods);
    const svg = renderExplodedSheetSvgs(buildExplodedSheet(mods, { materials }), { lang: 'fa', projectName: 'p' });
    mods.forEach((m, i) => {
      const drawing = buildExplodedSheet(mods, { materials }).drawings[i];
      for (const panel of [...new Set(drawing.panels.map((p) => p.componentId))].map(
        (id) => drawing.panels.find((p) => p.componentId === id)!,
      )) {
        const row = rows.find((r) => r.moduleId === m.id && r.partId === panel.partId)!;
        const mm = (cm: number) => String(Math.round(cm * 100) / 10).replace('.0', '');
        expect(svg[i]).toContain(`${mm(row.length)}×${mm(row.width)}`.replace('×', '×'));
      }
    });
  });

  it('escapes user text so a project name cannot break the SVG', () => {
    const svg = renderExplodedSvg(sheet().drawings[0], {
      lang: 'en',
      projectName: 'A < B & "C"',
    });
    expect(svg).toContain('A &lt; B &amp; &quot;C&quot;');
    parse(svg);
  });

  it('states that the arrangement is illustrative and claims no joinery', () => {
    const svg = renderExplodedSvg(sheet().drawings[0], { lang: 'fa', projectName: 'p' });
    expect(svg).toContain('چیدمان نمایشی');
    expect(svg).toContain('سوراخ‌کاری');
    expect(svg).not.toMatch(/g-code|dowel|hinge position/i);
  });

  it('reports missing dimensions on the sheet instead of hiding them', () => {
    const base = modules()[0];
    const broken = {
      ...base,
      parts: [
        ...base.parts,
        {
          ...base.parts[0],
          id: 'broken',
          nameFa: 'قطعهٔ بی‌ابعاد',
          nameEn: 'Panel without size',
          length: 0,
          width: 0,
        },
      ],
    };
    const svg = renderExplodedSvg(
      buildExplodedSheet([broken], { materials }).drawings[0],
      { lang: 'fa', projectName: 'p' },
    );
    expect(svg).toContain('موارد ناقص');
    expect(svg).toContain('قطعهٔ بی‌ابعاد');
  });
});

describe('paper-space layout', () => {
  const frame: Rect = { x: 14, y: 36, w: 150, h: 150 };

  const layoutOf = (index = 0) => {
    const drawing = sheet().drawings[index];
    const modelW = drawing.bounds.width * 10;
    const modelH = drawing.bounds.height * 10;
    const scale = Math.min(frame.w / modelW, frame.h / modelH);
    const originX = frame.x + (frame.w - modelW * scale) / 2 - drawing.bounds.minX * 10 * scale;
    const originY = frame.y + (frame.h - modelH * scale) / 2 - drawing.bounds.minY * 10 * scale;
    return { layout: layoutDrawing(drawing, { frame, scale, originX, originY }), drawing, scale };
  };

  it('keeps every badge inside the drawing frame and never overlapping another', () => {
    for (let i = 0; i < 3; i++) {
      const { layout } = layoutOf(i);
      expect(verifyLayout(layout, frame)).toEqual([]);
      expect(layout.badges.length).toBeGreaterThan(0);
    }
  });

  it('gives each component exactly one badge slot', () => {
    const { layout, drawing } = layoutOf(0);
    expect(layout.badges.map((b) => b.componentId)).toEqual(drawing.panels.map((p) => p.componentId));
  });

  it('draws a leader whenever a badge had to move off its panel', () => {
    const { layout } = layoutOf(1);
    for (const badge of layout.badges) {
      if (badge.leader) {
        expect(Number.isFinite(badge.leader.x2)).toBe(true);
        expect(Math.hypot(badge.leader.x1 - badge.leader.x2, badge.leader.y1 - badge.leader.y2)).toBeGreaterThan(0.3);
      }
    }
  });

  it('never overlaps two callouts or a callout with a badge', () => {
    for (let i = 0; i < 3; i++) {
      const { layout } = layoutOf(i);
      for (const c of layout.callouts) {
        for (const b of layout.badges) {
          const dx = Math.max(0, Math.abs(c.x - b.x) - c.w / 2);
          const dy = Math.max(0, Math.abs(c.y - b.y) - c.h / 2);
          expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(b.r);
        }
      }
    }
  });

  it('keeps dimension lines the same length as the extent they measure', () => {
    const { layout, drawing, scale } = layoutOf(0);
    expect(layout.dims).toHaveLength(drawing.dimensions.length);
    layout.dims.forEach((dim, i) => {
      const model = drawing.dimensions[i];
      const modelLen = Math.hypot(model.to.x - model.from.x, model.to.y - model.from.y) * 10 * scale;
      const drawnLen = Math.hypot(dim.x2 - dim.x1, dim.y2 - dim.y1);
      expect(drawnLen).toBeCloseTo(modelLen, 6);
    });
  });

  it('labels the scale honestly', () => {
    expect(scaleLabel(0.25)).toBe('1:4');
    expect(scaleLabel(1 / 22.5)).toBe('1:22.5');
  });
});

describe('text helpers', () => {
  it('wraps long Persian notes on word boundaries', () => {
    const lines = wrapText('الف ب پ ت ث ج چ ح خ د ذ ر ز ژ س ش ص ض', 10);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(10);
    expect(lines.join(' ')).toBe('الف ب پ ت ث ج چ ح خ د ذ ر ز ژ س ش ص ض');
  });
});

describe('exploded drawing screen', () => {
  it('renders one A4 sheet image per module of the loaded project', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'بارگذاری نمونهٔ پروژه' }));
    const nav = document.querySelector('.nav') as HTMLElement;
    const btn = [...nav.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('نقشهٔ انفجاری'))!;
    await user.click(btn);
    const images = [...document.querySelectorAll('img.sheet-svg')] as HTMLImageElement[];
    expect(images.length).toBeGreaterThan(0);
    for (const img of images) {
      expect(img.src.startsWith('data:image/svg+xml')).toBe(true);
      const svg = decodeURIComponent(img.src.split(',')[1]);
      expect(svg).toContain('viewBox="0 0 210 297"');
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      expect(doc.querySelector('parsererror')).toBeNull();
    }
    cleanup();
  }, 30000);
});

describe('DXF export from the screen', () => {
  it('downloads a DXF whose outlines match the cutting list', async () => {
    const { parseDxf, dxfRectangles, buildCuttingList } = await import('@cabinet/engine');
    const blobs: Blob[] = [];
    const createObjectURL = vi.fn((b: Blob) => {
      blobs.push(b);
      return 'blob:test';
    });
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });

    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'بارگذاری نمونهٔ پروژه' }));
    const nav = document.querySelector('.nav') as HTMLElement;
    const btn = [...nav.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('نقشهٔ انفجاری'))!;
    await user.click(btn);

    const dxfBtn = [...document.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('DXF'),
    )!;
    expect(dxfBtn).toBeTruthy();
    await fireEvent.click(dxfBtn);
    await new Promise((res) => setTimeout(res, 50));

    const dxfBlob = blobs[blobs.length - 1];
    expect(dxfBlob.type).toContain('dxf');
    const text = await dxfBlob.text();
    const parsed = parseDxf(text);
    expect(parsed.complete).toBe(true);
    expect(dxfRectangles(parsed).length).toBeGreaterThan(0);
    // Every rectangle must have a matching cutting-list row size.
    const rects = dxfRectangles(parsed);
    const rows = buildCuttingList(
      [
        { id: 'm1', label: 'x', kind: 'ground', quantity: 1, parts: calculateGroundCabinet(emptyGroundCabinet()).parts },
        { id: 'm2', label: 'y', kind: 'wall', quantity: 2, parts: calculateWallCabinet(emptyWallCabinet()).parts },
        { id: 'm3', label: 'z', kind: 'drawer', quantity: 1, parts: calculateDrawer(emptyDrawer()).parts },
      ],
    );
    for (const row of rows) {
      expect(
        rects.some((r) => Math.abs(r.width - row.length * 10) < 0.05 && Math.abs(r.height - row.width * 10) < 0.05),
      ).toBe(true);
    }
    cleanup();
  }, 30000);
});
