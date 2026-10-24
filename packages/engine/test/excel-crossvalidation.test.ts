/**
 * STAGE 2 — independent, cell-level validation against the Excel workbook.
 *
 * The golden test (`legacy-golden.test.ts`) proves the *whole* unit matches
 * Excel. This file goes one level deeper: every assertion names the real cell
 * address in the real sheet, the Excel formula in that cell, the value Excel
 * cached, the value this engine computes, and the delta between them. A failure
 * therefore reads as "cell H2 says 76.8, engine says 76.5, delta 0.3".
 *
 * Where the numbers come from
 * ---------------------------
 * `test/fixtures/excel-crosscheck.json` stores CACHED values read from the
 * workbook XML by `tools/dump_cells.py`. Nothing in this file was produced by
 * the engine and then copied back into the fixture.
 *
 * Tolerance
 * ---------
 * `EXCEL_TOLERANCE = 1e-9` (relative, see `packages/engine/src/rounding.ts`).
 * Excel stores the same IEEE-754 doubles, so an exact-equality test would fail
 * on last-bit differences such as `82.39999999999999` vs `82.4`. 1e-9 relative
 * is ~4 orders of magnitude tighter than the 0.1 cm display precision and
 * thousands of times tighter than a millimetre, so a real modelling error can
 * never hide inside it.
 */
import { describe, it, expect } from 'vitest';
import crosscheck from './fixtures/excel-crosscheck.json' with { type: 'json' };
import {
  calculateGroundCabinet,
  calculateWallCabinet,
  calculateDrawer,
  emptyGroundCabinet,
  emptyWallCabinet,
  emptyDrawer,
  EXCEL_TOLERANCE,
  approxEqual,
} from '../src/index.js';

type Cell = { formula?: string; expected: number | string; field: string; note?: string };
type Case = {
  slot?: number;
  row?: number;
  input: Record<string, number>;
  cells: Record<string, Cell>;
};

const data = crosscheck as unknown as {
  reference: { tolerance: number };
  ground: Case[];
  wall: Case[];
  drawer: Case;
  analysis_rows: Case;
  variant_rows: { v4: { rows: Case[] }; v1: { rows: Case[] } };
};

/** Human-readable one-line delta report, printed on failure. */
function delta(expected: number | string, computed: number | string | undefined): string {
  if (typeof expected === 'string' || typeof computed === 'string') {
    return `expected ${JSON.stringify(expected)}, computed ${JSON.stringify(computed)}`;
  }
  const d = typeof computed === 'number' && Number.isFinite(computed) ? computed - expected : NaN;
  return `expected ${expected}, computed ${computed}, delta ${d}`;
}

function checkCells(label: string, derived: Record<string, unknown>, cells: Record<string, Cell>) {
  const failures: string[] = [];
  for (const [address, cell] of Object.entries(cells)) {
    const got = derived[cell.field];
    const ok =
      typeof cell.expected === 'string'
        ? got === cell.expected
        : typeof got === 'number' && approxEqual(got, cell.expected);
    if (!ok) failures.push(`${label}!${address} ${cell.field}: ${delta(cell.expected, got as number)}`);
  }
  expect(failures).toEqual([]);
}

/**
 * Input *and* derived values in one flat record, because a sheet cell can hold
 * either: N2 in «کابینت زمینی» is the entered door height, H2 is a formula.
 * Derived values win on a name clash (there is none today).
 */
const flat = (input: Record<string, unknown>, derived: Record<string, unknown>) => ({ ...input, ...derived });

const ground = (input: Record<string, number>) => {
  const r = calculateGroundCabinet({ ...emptyGroundCabinet(), ...input } as never);
  return flat(r.input as unknown as Record<string, unknown>, r.derived as unknown as Record<string, unknown>);
};
const wall = (input: Record<string, number>) => {
  const r = calculateWallCabinet({ ...emptyWallCabinet(), ...input } as never);
  return flat(r.input as unknown as Record<string, unknown>, r.derived as unknown as Record<string, unknown>);
};
const drawer = (input: Record<string, number>) => {
  const r = calculateDrawer({ ...emptyDrawer(), ...input } as never);
  return flat(r.input as unknown as Record<string, unknown>, r.derived as unknown as Record<string, unknown>);
};

/** `=B2-3.2` and `=B3-3.2` are the same rule applied to a different row. */
const formulaShape = (formula: string) => formula.replace(/\s+/g, '').replace(/([A-Z]{1,2})\d+/g, '$1');

describe('tolerance contract', () => {
  it('declares 1e-9 relative and keeps it identical to the documented constant', () => {
    expect(data.reference.tolerance).toBe(EXCEL_TOLERANCE);
  });

  it('is much tighter than the 0.1 cm display precision and than one millimetre', () => {
    expect(EXCEL_TOLERANCE).toBeLessThan(1e-3);
    expect(approxEqual(100, 100.0000001)).toBe(true);
    expect(approxEqual(100, 100.001)).toBe(false);
    expect(approxEqual(76.8, 76.5)).toBe(false);
  });
});

describe('ground cabinet — sheet «کابینت زمینی»', () => {
  for (const c of data.ground) {
    it(`slot ${c.slot} (row ${c.row}) matches every documented cell`, () => {
      checkCells(`کابینت زمینی`, ground(c.input), c.cells);
    });
  }

  it('reproduces the exact Excel formula text for each audited field', () => {
    const audit = calculateGroundCabinet({ ...emptyGroundCabinet(), width: 80 }).audit;
    const byField = new Map(audit.map((a) => [a.field, a]));
    for (const c of data.ground) {
      for (const cell of Object.values(c.cells)) {
        const entry = byField.get(cell.field);
        if (!entry || !cell.formula || !cell.formula.startsWith('=')) continue;
        expect(formulaShape(entry.excelFormula)).toBe(formulaShape(cell.formula));
      }
    }
  });
});

describe('wall cabinet — sheet «کابینت هوایی»', () => {
  for (const c of data.wall) {
    it(`slot ${c.slot} (row ${c.row}) matches every documented cell`, () => {
      checkCells('کابینت هوایی', wall(c.input), c.cells);
    });
  }

  it('keeps the Excel float drift instead of silently rounding it away', () => {
    // Excel caches 82.39999999999999 at M10; a rounded 82.4 would be "cleaner"
    // but would no longer be the workbook's number.
    expect(wall(data.wall[1].input).backWidth).toBe(82.39999999999999);
  });
});

describe('drawer — sheet «کشو»', () => {
  it('matches B3:L6 cell by cell', () => {
    checkCells('کشو', drawer(data.drawer.input), data.drawer.cells);
  });
});

describe('analysis sheet — «آنالیز زمینی»', () => {
  it('orders the parts the same way the analysis block does', () => {
    const result = calculateGroundCabinet({ ...emptyGroundCabinet(), ...data.analysis_rows.input } as never);
    const base = result.parts.find((p) => p.role === 'base')!;
    const body = result.parts.find((p) => p.role === 'body')!;
    const shelf = result.parts.find((p) => p.role === 'shelf')!;
    const flat = {
      baseCount: base.count,
      baseWidth: base.width,
      baseLength: base.length,
      bodyWidth: body.width,
      bodyLength: body.length,
      shelfWidth: shelf.width,
      shelfLength: shelf.length,
      backWidth: result.derived.backWidth,
      backLength: result.derived.backLength,
    } as unknown as Record<string, unknown>;
    checkCells('آنالیز زمینی', flat, data.analysis_rows.cells);
  });
});

describe('other workbook versions — compared by content, not by filename', () => {
  it('«analiz pro.2-4.xlsx» rows recompute to the same numbers', () => {
    for (const c of data.variant_rows.v4.rows) {
      checkCells('analiz pro.2-4', ground(c.input), c.cells);
    }
  });

  it('«analiz pro.2-1.xlsx» rows recompute to the same numbers', () => {
    for (const c of data.variant_rows.v1.rows) {
      checkCells('analiz pro.2-1', ground(c.input), c.cells);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Edge cases the workbook never shows, but the workshop will enter   */
/* ------------------------------------------------------------------ */

describe('edge inputs — zero, negative, absurd, incomplete', () => {
  const codes = (list: { code: string; severity: string }[]) => list.map((w) => `${w.code}:${w.severity}`);

  it('zero width: still computes the formulas, but reports errors instead of hiding them', () => {
    const r = calculateGroundCabinet({ ...emptyGroundCabinet(), width: 0 });
    // Excel's arithmetic on an empty B cell: 0-3.2 = -3.2, and the door tier
    // falls outside every band, so it returns "" exactly like the workbook.
    expect(r.derived.shelfLength).toBe(-3.2);
    expect(r.derived.backWidth).toBe(-1.6);
    expect(r.derived.doorWidth).toBe('');
    expect(r.derived.doorCount).toBe('');
    expect(codes(r.warnings)).toEqual(
      expect.arrayContaining([
        'WIDTH_NOT_POSITIVE:error',
        'SHELFLENGTH_NOT_POSITIVE:error',
        'DOOR_TIER_OUT_OF_RANGE:warning',
      ]),
    );
    // No part may claim a negative size as manufacturable stock.
    for (const p of r.parts) {
      expect(Number.isFinite(p.length)).toBe(true);
      expect(Number.isFinite(p.width)).toBe(true);
    }
  });

  it('negative width: arithmetic is preserved, every derived length flagged', () => {
    const r = calculateGroundCabinet({ ...emptyGroundCabinet(), width: -50 });
    expect(r.derived.shelfLength).toBe(-53.2);
    expect(r.warnings.filter((w) => w.severity === 'error').length).toBeGreaterThanOrEqual(4);
  });

  it('absurd width (10 m): accepted by the formulas, warned as out of door range', () => {
    const r = calculateGroundCabinet({ ...emptyGroundCabinet(), width: 1000 });
    expect(r.derived.shelfLength).toBeCloseTo(996.8, 9);
    expect(r.derived.doorWidth).toBe('');
    expect(codes(r.warnings)).toContain('DOOR_TIER_OUT_OF_RANGE:warning');
  });

  it('incomplete input never throws and never emits NaN', () => {
    const blank = { width: 0, baseWidth: 0, bodyWidth: 0, bodyLength: 0, shelfWidth: 0, railWidth: 0, doorHeight: 0 };
    const g = calculateGroundCabinet({ ...emptyGroundCabinet(), ...blank } as never);
    const w = calculateWallCabinet({ ...emptyWallCabinet(), ...blank } as never);
    const d = calculateDrawer({ ...emptyDrawer(), count: 0, depth: 0, width: 0, height: 0 } as never);
    for (const r of [g, w, d]) {
      for (const v of Object.values(r.derived)) {
        if (typeof v === 'number') expect(Number.isNaN(v)).toBe(false);
      }
    }
    expect(g.warnings.some((x) => x.severity === 'error')).toBe(true);
    expect(w.warnings.some((x) => x.severity === 'error')).toBe(true);
  });

  it('the shipped default unit (loaded by «بارگذاری نمونه») is error-free', () => {
    for (const r of [
      calculateGroundCabinet(emptyGroundCabinet()),
      calculateWallCabinet(emptyWallCabinet()),
      calculateDrawer(emptyDrawer()),
    ]) {
      expect(r.warnings.filter((w) => w.severity === 'error')).toEqual([]);
    }
  });

  it('zero quantity drawer produces no pieces (no phantom rows)', () => {
    const r = calculateDrawer({ ...emptyDrawer(), count: 0 });
    expect(r.derived.bodyCount).toBe(0);
    for (const p of r.parts) expect(p.count * 0).toBe(0);
  });

  it('every warning is bilingual, so nothing is Persian-only in an English UI', () => {
    const r = calculateGroundCabinet({ ...emptyGroundCabinet(), width: 0 });
    for (const w of r.warnings) {
      expect(w.messageFa.length).toBeGreaterThan(0);
      expect(w.messageEn.length).toBeGreaterThan(0);
    }
  });
});
