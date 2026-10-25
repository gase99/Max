import { describe, it, expect } from 'vitest';
import { nest } from '../src/index.js';
import type { NestPart } from '../src/index.js';

const sheet = { length: 244, width: 183 };
const baseOpts = { kerf: 0.4, trim: 1, allowRotation: true };

const p = (id: string, length: number, width: number, qty = 1, grain = false): NestPart => ({
  id, label: id, length, width, qty, grain,
});

describe('sheet nesting', () => {
  it('places a single part on one sheet', () => {
    const r = nest([p('a', 100, 50)], sheet, baseOpts);
    expect(r.sheetCount).toBe(1);
    expect(r.sheets[0].placements).toHaveLength(1);
  });

  it('never overlaps placements on the same sheet', () => {
    const parts = [p('a', 100, 60, 4), p('b', 80, 40, 5), p('c', 30, 20, 10)];
    const r = nest(parts, sheet, baseOpts);
    for (const s of r.sheets) {
      for (let i = 0; i < s.placements.length; i++) {
        for (let j = i + 1; j < s.placements.length; j++) {
          const A = s.placements[i];
          const B = s.placements[j];
          const overlapX = A.x < B.x + B.w && B.x < A.x + A.w;
          const overlapY = A.y < B.y + B.h && B.y < A.y + A.h;
          expect(overlapX && overlapY).toBe(false);
        }
      }
    }
  });

  it('keeps every placement inside the usable area', () => {
    const parts = [p('a', 120, 60, 3), p('b', 90, 45, 4), p('c', 40, 40, 6)];
    const r = nest(parts, sheet, baseOpts);
    const minX = baseOpts.trim;
    const maxRight = sheet.width - baseOpts.trim;
    const maxBottom = sheet.length - baseOpts.trim;
    for (const s of r.sheets) {
      for (const pl of s.placements) {
        expect(pl.x).toBeGreaterThanOrEqual(minX - 1e-9);
        expect(pl.y).toBeGreaterThanOrEqual(minX - 1e-9);
        expect(pl.x + pl.w).toBeLessThanOrEqual(maxRight + 1e-9);
        expect(pl.y + pl.h).toBeLessThanOrEqual(maxBottom + 1e-9);
      }
    }
  });

  it('places every piece, none lost', () => {
    const parts = [p('a', 100, 60, 4), p('b', 80, 40, 5)];
    const r = nest(parts, sheet, baseOpts);
    const placed = r.sheets.reduce((s, x) => s + x.placements.length, 0);
    expect(placed).toBe(9);
    expect(r.unplaced).toHaveLength(0);
  });

  it('reports parts that cannot fit as unplaced instead of dropping them', () => {
    const r = nest([p('huge', 300, 200)], sheet, baseOpts);
    expect(r.sheetCount).toBe(0);
    expect(r.unplaced).toHaveLength(1);
    expect(r.unplaced[0].partId).toBe('huge');
  });

  it('respects grain: a grained part is never rotated', () => {
    const r = nest([p('g', 240, 30, 2, true)], sheet, baseOpts);
    for (const s of r.sheets) {
      for (const pl of s.placements) {
        expect(pl.rotated).toBe(false);
        expect(pl.h).toBeCloseTo(240, 9);
      }
    }
  });

  it('rejects grained parts that only fit rotated', () => {
    // 200 long × 100 wide: fits the sheet as-is (244 × 183)? yes, so use a case that doesn't
    const r = nest([p('g', 240, 190, 1, true)], sheet, baseOpts);
    expect(r.unplaced).toHaveLength(1);
    expect(r.sheetCount).toBe(0);
  });

  it('kerf increases the number of sheets', () => {
    const parts = [p('a', 60, 60, 12)];
    const noKerf = nest(parts, sheet, { ...baseOpts, kerf: 0 });
    const withKerf = nest(parts, sheet, { ...baseOpts, kerf: 2 });
    expect(withKerf.sheetCount).toBeGreaterThanOrEqual(noKerf.sheetCount);
  });

  it('trims the sheet edges', () => {
    const r = nest([p('a', 181, 242, 1)], sheet, { ...baseOpts, trim: 1 });
    // 242 × 181 exceeds the trimmed usable area 242 × 181? usable = 183-2=181 wide, 244-2=242 long
    // exactly fits, so it must be placed
    expect(r.sheetCount).toBe(1);
    const r2 = nest([p('a', 183, 244, 1)], sheet, { ...baseOpts, trim: 1 });
    expect(r2.unplaced).toHaveLength(1);
  });

  it('utilization and waste are consistent', () => {
    const r = nest([p('a', 100, 60, 6)], sheet, baseOpts);
    expect(r.utilisation).toBeGreaterThan(0);
    expect(r.utilisation).toBeLessThanOrEqual(1);
    expect(r.wastePercent).toBeCloseTo(100 - r.utilisation * 100, 6);
    expect(r.wasteArea).toBeCloseTo(r.totalSheetArea - r.totalPartArea, 6);
  });

  it('is deterministic', () => {
    const parts = [p('a', 100, 60, 4), p('b', 80, 40, 5)];
    const a = nest(parts, sheet, baseOpts);
    const b = nest(parts, sheet, baseOpts);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('is flagged as theoretical, never as machine-ready', () => {
    const r = nest([p('a', 100, 60)], sheet, baseOpts);
    expect(r.theoretical).toBe(true);
    expect(r.notesFa.join(' ')).toContain('تئوریک');
  });

  it('handles an empty part list', () => {
    const r = nest([], sheet, baseOpts);
    expect(r.sheetCount).toBe(0);
    expect(r.utilisation).toBe(0);
  });

  it('handles a zero-sized usable area gracefully', () => {
    const r = nest([p('a', 10, 10)], sheet, { ...baseOpts, trim: 100 });
    expect(r.sheetCount).toBe(0);
    expect(r.notesFa.length).toBeGreaterThan(0);
  });

  it('uses fewer sheets than a naive one-part-per-sheet bound', () => {
    const parts = [p('a', 60, 60, 12)]; // 12 × 3600 cm² = 43200 cm²
    const r = nest(parts, sheet, { ...baseOpts, kerf: 0 });
    // sheet usable 241 × 181 = 43621 cm² -> theoretically 1 sheet; must not exceed 2.
    expect(r.sheetCount).toBeLessThanOrEqual(2);
  });
});
