import { describe, it, expect } from 'vitest';
import {
  applyRounding,
  excelRound,
  cmToMm,
  mmToCm,
  formatLength,
  calculateGroundCabinet,
  emptyGroundCabinet,
  hasErrors,
  buildCuttingList,
  summarise,
  buildCostBreakdown,
  defaultMaterials,
  defaultPricingSettings,
} from '../src/index.js';

describe('units', () => {
  it('converts cm <-> mm exactly', () => {
    expect(cmToMm(73.4)).toBeCloseTo(734, 9);
    expect(mmToCm(734)).toBeCloseTo(73.4, 9);
  });

  it('formats without trailing zeros', () => {
    expect(formatLength(73.4, 'mm')).toBe('734');
    expect(formatLength(58, 'mm')).toBe('580');
    expect(formatLength(1.234, 'mm')).toBe('12.3');
  });

  it('formats cm when requested', () => {
    expect(formatLength(73.4, 'cm')).toBe('73.4');
  });

  it('returns a dash for non-finite values', () => {
    expect(formatLength(NaN)).toBe('—');
    expect(formatLength(Infinity)).toBe('—');
  });
});

describe('rounding', () => {
  it('mode none never changes the value (legacy behaviour)', () => {
    expect(applyRounding(12.666666666666668, { mode: 'none' })).toBe(12.666666666666668);
  });

  it('rounds to the nearest step', () => {
    expect(applyRounding(12.666666666666668, { mode: 'nearest', step: 0.1 })).toBeCloseTo(12.7, 9);
  });

  it('rounds down and up', () => {
    expect(applyRounding(12.66, { mode: 'down', step: 0.1 })).toBeCloseTo(12.6, 9);
    expect(applyRounding(12.61, { mode: 'up', step: 0.1 })).toBeCloseTo(12.7, 9);
  });

  it('ignores a non-positive step instead of producing NaN', () => {
    expect(applyRounding(5, { mode: 'nearest', step: 0 })).toBe(5);
    expect(applyRounding(5, { mode: 'nearest', step: -1 })).toBe(5);
  });

  it('excelRound is half-away-from-zero', () => {
    expect(excelRound(2.5, 0)).toBe(3);
    expect(excelRound(-2.5, 0)).toBe(-3);
    expect(excelRound(1.005, 2)).toBeCloseTo(1.0, 9);
  });
});

describe('validation', () => {
  it('rejects a zero width', () => {
    const r = calculateGroundCabinet({ ...emptyGroundCabinet(), width: 0 });
    expect(hasErrors(r.warnings)).toBe(true);
    expect(r.warnings.some((w) => w.code === 'WIDTH_NOT_POSITIVE')).toBe(true);
  });

  it('rejects a negative body width', () => {
    const r = calculateGroundCabinet({ ...emptyGroundCabinet(), bodyWidth: -5 });
    expect(hasErrors(r.warnings)).toBe(true);
  });

  it('warns when width is outside the door tier range', () => {
    const r = calculateGroundCabinet({ ...emptyGroundCabinet(), width: 200 });
    expect(r.derived.doorWidth).toBe('');
    expect(r.warnings.some((w) => w.code === 'DOOR_TIER_OUT_OF_RANGE')).toBe(true);
  });

  it('warns when a depth exceeds the cabinet width', () => {
    const r = calculateGroundCabinet({ ...emptyGroundCabinet(), width: 40, baseWidth: 58 });
    expect(r.warnings.some((w) => w.code === 'BASEWIDTH_EXCEEDS_WIDTH')).toBe(true);
  });

  it('flags a derived dimension that collapses to zero or below', () => {
    // shelf length = width - 3.2, so width 3.2 gives exactly 0
    const r = calculateGroundCabinet({ ...emptyGroundCabinet(), width: 3.2 });
    expect(r.warnings.some((w) => w.code === 'SHELFLENGTH_NOT_POSITIVE')).toBe(true);
  });

  it('produces no errors for the workbook default unit', () => {
    const r = calculateGroundCabinet(emptyGroundCabinet());
    expect(hasErrors(r.warnings)).toBe(false);
  });

  it('every warning carries a Persian and an English message', () => {
    const r = calculateGroundCabinet({ ...emptyGroundCabinet(), width: 0, bodyWidth: -1 });
    for (const w of r.warnings) {
      expect(w.messageFa.length).toBeGreaterThan(0);
      expect(w.messageEn.length).toBeGreaterThan(0);
    }
  });
});

describe('pricing', () => {
  const modules = [
    { id: 'm1', label: 'A', kind: 'ground' as const, quantity: 2, parts: calculateGroundCabinet(emptyGroundCabinet()).parts },
  ];
  const rows = buildCuttingList(modules);
  const summary = summarise(rows);

  it('charges zero when prices are zero, and says so', () => {
    const materials = defaultMaterials();
    const cost = buildCostBreakdown({
      rows, summary, materials, settings: defaultPricingSettings(),
      hardware: [], cabinetCount: 2, edgeBandPricePerMeter: 0,
    });
    expect(cost.boardCost).toBe(0);
    expect(cost.quotePrice).toBe(0);
    expect(cost.notesFa.some((n) => n.includes('قیمت ورق'))).toBe(true);
  });

  it('computes board cost from sheets × price', () => {
    const materials = defaultMaterials().map((m) =>
      m.id === 'mdf-white' ? { ...m, pricePerSheet: 1000 } : m,
    );
    const cost = buildCostBreakdown({
      rows, summary, materials, settings: { ...defaultPricingSettings(), wasteFactor: 0, markup: 0, taxRate: 0 },
      hardware: [], cabinetCount: 2, edgeBandPricePerMeter: 0,
    });
    const board = cost.boards.find((b) => b.materialId === 'mdf-white')!;
    expect(board.sheetsUsed).toBeGreaterThan(0);
    expect(board.cost).toBeCloseTo(board.sheetsUsed * 1000, 6);
    expect(cost.boardCost).toBeCloseTo(cost.boards.reduce((s, b) => s + b.cost, 0), 6);
  });

  it('uses optimiser sheet counts when supplied', () => {
    const materials = defaultMaterials();
    const opt = new Map<string, number>([['mdf-white@1.6', 7]]);
    const cost = buildCostBreakdown({
      rows, summary, materials, settings: defaultPricingSettings(),
      hardware: [], cabinetCount: 2, edgeBandPricePerMeter: 0,
      optimisedSheetCounts: opt,
    });
    const b = cost.boards.find((x) => x.materialId === 'mdf-white')!;
    expect(b.method).toBe('optimiser');
    expect(b.sheetsUsed).toBe(7);
  });

  it('applies markup, tax and reports margin', () => {
    const materials = defaultMaterials().map((m) => ({ ...m, pricePerSheet: 1000 }));
    const cost = buildCostBreakdown({
      rows, summary, materials,
      settings: { ...defaultPricingSettings(), markup: 0.5, taxRate: 0.1, wasteFactor: 0 },
      hardware: [], cabinetCount: 2, edgeBandPricePerMeter: 10,
    });
    expect(cost.priceBeforeTax).toBeCloseTo(cost.subtotal * 1.5, 6);
    expect(cost.tax).toBeCloseTo(cost.priceBeforeTax * 0.1, 6);
    expect(cost.quotePrice).toBeCloseTo(cost.priceBeforeTax * 1.1, 6);
    expect(cost.marginPercent).toBeCloseTo((1 - 1 / 1.5) * 100, 4);
  });

  it('adds hardware and labour costs', () => {
    const materials = defaultMaterials();
    const settings = {
      ...defaultPricingSettings(),
      labor: [{ id: 'x', nameFa: 'مونتاژ', basis: 'per-cabinet' as const, rate: 100 }],
    };
    const cost = buildCostBreakdown({
      rows, summary, materials, settings, hardware: [{ itemId: 'h', qty: 4, unitPrice: 25, cost: 100 }],
      cabinetCount: 2, edgeBandPricePerMeter: 0,
    });
    expect(cost.hardwareCost).toBe(100);
    expect(cost.laborCost).toBe(200);
  });
});
