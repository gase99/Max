/**
 * GOLDEN TEST — formula equivalence with the original workbook.
 *
 * The expected values in `fixtures/legacy-golden.json` are **Excel's own cached
 * results**, extracted from `analiz pro.2.xlsx` (sheet XML + calcChain), not
 * values computed by this engine and not hand arithmetic.
 *
 * Every slot in the workbook is covered: 11 ground-cabinet slots, 20
 * wall-cabinet slots and the single drawer slot.
 */
import { describe, it, expect } from 'vitest';
import golden from './fixtures/legacy-golden.json' with { type: 'json' };
import {
  calculateGroundCabinet,
  calculateWallCabinet,
  calculateDrawer,
  doorTier,
  approxEqual,
} from '../src/index.js';
import type { EdgeFlags, GroundCabinetInput, WallCabinetInput } from '../src/index.js';

const edges = (f: [number | null, number | null] | undefined): EdgeFlags => ({
  widthEdge: f?.[0] === 1,
  lengthEdge: f?.[1] === 1,
});

const g = golden as unknown as {
  ground: {
    slot: number;
    input: {
      width: number; baseWidth: number; bodyWidth: number; bodyLength: number;
      shelfWidth: number; railWidth: number; doorHeight: number;
      counts: Record<string, number>;
      bandFlags: Record<string, [number | null, number | null]>;
      backCount: number | null;
    };
    expected: Record<string, number | string>;
  }[];
  wall: {
    slot: number;
    input: {
      width: number; bodyWidth: number; bodyLength: number; baseWidth: number;
      railWidth: number; doorHeight: number;
      counts: Record<string, number>;
      bandFlags: Record<string, [number | null, number | null]>;
      backCount: number | null;
    };
    expected: Record<string, number | string>;
  }[];
  drawer: {
    input: { count: number; depth: number; width: number; height: number };
    expected: Record<string, number>;
  };
};

function toGroundInput(s: (typeof g)['ground'][number]): GroundCabinetInput {
  const i = s.input;
  return {
    width: i.width,
    baseWidth: i.baseWidth,
    baseCount: i.counts.base ?? 0,
    baseEdges: edges(i.bandFlags.base),
    bodyWidth: i.bodyWidth,
    bodyLength: i.bodyLength,
    bodyCount: i.counts.body ?? 0,
    bodyEdges: edges(i.bandFlags.body),
    shelfWidth: i.shelfWidth,
    shelfCount: i.counts.shelf ?? 0,
    shelfEdges: edges(i.bandFlags.shelf),
    railWidth: i.railWidth,
    railCount: i.counts.rail ?? 0,
    railEdges: edges(i.bandFlags.rail),
    doorHeight: i.doorHeight,
    backCount: i.backCount ?? 0,
    materialId: 'mdf-white',
    thickness: 1.6,
  };
}

function toWallInput(s: (typeof g)['wall'][number]): WallCabinetInput {
  const i = s.input;
  return {
    width: i.width,
    bodyWidth: i.bodyWidth,
    bodyLength: i.bodyLength,
    bodyCount: i.counts.body ?? 0,
    bodyEdges: edges(i.bandFlags.body),
    baseWidth: i.baseWidth,
    baseCount: i.counts.base ?? 0,
    baseEdges: edges(i.bandFlags.base),
    topCount: i.counts.top ?? 0,
    topEdges: edges(i.bandFlags.top),
    shelfCount: i.counts.shelf ?? 0,
    shelfEdges: edges(i.bandFlags.shelf),
    railWidth: i.railWidth,
    railCount: i.counts.rail ?? 0,
    railEdges: edges(i.bandFlags.rail),
    doorHeight: i.doorHeight,
    backCount: i.backCount ?? 0,
    materialId: 'mdf-white',
    thickness: 1.6,
  };
}

describe('ground cabinet — Excel equivalence (11 workbook slots)', () => {
  for (const slot of g.ground) {
    it(`slot ${slot.slot} matches Excel cached values`, () => {
      const r = calculateGroundCabinet(toGroundInput(slot));
      const e = slot.expected;

      expect(approxEqual(r.derived.baseLength, e.baseLength as number)).toBe(true);
      expect(approxEqual(r.derived.shelfLength, e.shelfLength as number)).toBe(true);
      expect(approxEqual(r.derived.railLength, e.railLength as number)).toBe(true);
      expect(approxEqual(r.derived.backWidth, e.backWidth as number)).toBe(true);
      expect(approxEqual(r.derived.backLength, e.backLength as number)).toBe(true);

      if (e.doorWidth === '') {
        expect(r.derived.doorWidth).toBe('');
        expect(r.derived.doorCount).toBe('');
      } else {
        expect(approxEqual(r.derived.doorWidth as number, e.doorWidth as number)).toBe(true);
        expect(r.derived.doorCount).toBe(e.doorCount);
      }
    });
  }
});

describe('wall cabinet — Excel equivalence (20 workbook slots)', () => {
  for (const slot of g.wall) {
    it(`slot ${slot.slot} matches Excel cached values`, () => {
      const r = calculateWallCabinet(toWallInput(slot));
      const e = slot.expected;

      expect(approxEqual(r.derived.baseLength, e.baseLength as number)).toBe(true);
      expect(approxEqual(r.derived.topWidth, e.topWidth as number)).toBe(true);
      expect(approxEqual(r.derived.topLength, e.topLength as number)).toBe(true);
      expect(approxEqual(r.derived.shelfWidth, e.shelfWidth as number)).toBe(true);
      expect(approxEqual(r.derived.shelfLength, e.shelfLength as number)).toBe(true);
      expect(approxEqual(r.derived.railLength, e.railLength as number)).toBe(true);
      expect(approxEqual(r.derived.backWidth, e.backWidth as number)).toBe(true);
      expect(approxEqual(r.derived.backLength, e.backLength as number)).toBe(true);

      if (e.doorWidth === '') {
        expect(r.derived.doorWidth).toBe('');
      } else {
        expect(approxEqual(r.derived.doorWidth as number, e.doorWidth as number)).toBe(true);
        expect(r.derived.doorCount).toBe(e.doorCount);
      }
    });
  }
});

describe('drawer — Excel equivalence', () => {
  it('matches the workbook drawer block', () => {
    const r = calculateDrawer({ ...g.drawer.input, materialId: 'mdf-white', thickness: 1.6 });
    const e = g.drawer.expected;
    expect(approxEqual(r.derived.bodyLength, e.bodyL)).toBe(true);
    expect(approxEqual(r.derived.bodyWidth, e.bodyW)).toBe(true);
    expect(r.derived.bodyCount).toBe(e.bodyCount);
    expect(approxEqual(r.derived.frontLength, e.frontL)).toBe(true);
    expect(approxEqual(r.derived.frontWidth, e.frontW)).toBe(true);
    expect(r.derived.frontCount).toBe(e.frontCount);
    expect(approxEqual(r.derived.backLength, e.backL)).toBe(true);
    expect(approxEqual(r.derived.backWidth, e.backW)).toBe(true);
    expect(r.derived.backCount).toBe(e.backCount);
  });

  it('reproduces the workbook full-precision value (no rounding)', () => {
    // Excel cached exactly 12.666666666666668 for the drawer side width.
    const r = calculateDrawer({ ...g.drawer.input, materialId: 'mdf-white', thickness: 1.6 });
    expect(r.derived.bodyWidth).toBe(12.666666666666668);
  });
});

describe('door tier rule boundaries (Excel IF-chain semantics)', () => {
  const cases: [number, number | '', number | ''][] = [
    [9.9, '', ''],
    [10, 9.8, 1],
    [50, 49.8, 1],
    [50.1, 24.85, 2],
    [100, 49.8, 2],
    [100.1, 33.166666666666664, 3],
    [150, 49.8, 3],
    [150.1, '', ''],
    [0, '', ''],
    [-5, '', ''],
  ];
  for (const [w, expectedWidth, expectedCount] of cases) {
    it(`width ${w} → ${expectedCount || 'empty'} leaf/leaves`, () => {
      const r = doorTier(w);
      if (expectedWidth === '') {
        expect(r.width).toBe('');
      } else {
        expect(approxEqual(r.width as number, expectedWidth as number)).toBe(true);
      }
      expect(r.count).toBe(expectedCount);
    });
  }
});
