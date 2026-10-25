import { describe, it, expect } from 'vitest';
import {
  buildCuttingList,
  buildExplodedDrawing,
  buildExplodedSheet,
  calculateDrawer,
  calculateGroundCabinet,
  calculateWallCabinet,
  emptyDrawer,
  emptyGroundCabinet,
  emptyWallCabinet,
  mmLabel,
  toMm,
  verifyDrawingAgainstRows,
  type ExplodeModuleInput,
  type PanelPart,
} from '../src/index.js';

const ground = (input = emptyGroundCabinet()): ExplodeModuleInput => ({
  id: 'm1',
  label: 'کابینت زمینی زیر سینک',
  labelEn: 'Base cabinet under sink',
  kind: 'ground',
  quantity: 1,
  parts: calculateGroundCabinet(input).parts,
});

const modules = (): ExplodeModuleInput[] => [
  ground(),
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

const materials = [
  { id: 'mdf-white', nameFa: 'MDF سفید', nameEn: 'White MDF' },
  { id: 'back-3mm', nameFa: 'فیبر ۳ میل', nameEn: '3 mm fibreboard' },
];

describe('exploded drawings — numbering', () => {
  it('numbers components 1..n without gaps or duplicates', () => {
    const sheet = buildExplodedSheet(modules(), { materials });
    for (const d of sheet.drawings) {
      const nos = [...new Set(d.panels.map((p) => p.componentNo))].sort((a, b) => a - b);
      expect(nos).toEqual(nos.map((_, i) => i + 1));
    }
  });

  it('uses sheet-unique component ids that encode the module', () => {
    const sheet = buildExplodedSheet(modules(), { materials });
    const ids = new Set(sheet.drawings.flatMap((d) => d.panels.map((p) => p.componentId)));
    // ids are unique per *component*: several drawn copies of the same part
    // share one number, which is how a parts legend has to work.
    expect(ids.size).toBe(sheet.componentCount);
    for (const d of sheet.drawings) {
      for (const p of d.panels) {
        expect(p.componentId).toBe(`M${d.moduleNo}-${String(p.componentNo).padStart(2, '0')}`);
      }
      // every instance of one component carries the same dimensions
      const byNo = new Map<number, typeof d.panels>();
      for (const p of d.panels) byNo.set(p.componentNo, [...(byNo.get(p.componentNo) ?? []), p]);
      for (const [, group] of byNo) {
        for (const p of group) {
          expect(p.length).toBe(group[0].length);
          expect(p.width).toBe(group[0].width);
          expect(p.componentId).toBe(group[0].componentId);
        }
      }
    }
  });

  it('produces byte-identical numbering when regenerated (stable)', () => {
    const a = buildExplodedSheet(modules(), { materials });
    const b = buildExplodedSheet(modules(), { materials });
    expect(a.drawings.map((d) => d.panels.map((p) => p.componentId))).toEqual(
      b.drawings.map((d) => d.panels.map((p) => p.componentId)),
    );
    // and the geometry is deterministic too
    expect(a.drawings[0].panels.map((p) => p.face)).toEqual(b.drawings[0].panels.map((p) => p.face));
  });

  it('carries a module identifier on every drawing', () => {
    const sheet = buildExplodedSheet(modules(), { materials });
    for (const d of sheet.drawings) {
      expect(d.moduleId).toBeTruthy();
      expect(d.moduleLabel).toBeTruthy();
      expect(d.moduleNo).toBeGreaterThan(0);
    }
  });
});

describe('exploded drawings — legend mapping', () => {
  it('gives every component a Persian and an English name', () => {
    const sheet = buildExplodedSheet(modules(), { materials });
    for (const d of sheet.drawings) {
      for (const p of d.panels) {
        expect(p.nameFa.trim().length).toBeGreaterThan(0);
        expect(p.nameEn.trim().length).toBeGreaterThan(0);
        expect(p.nameFa).not.toBe(p.nameEn);
      }
    }
  });

  it('resolves material names for the legend and falls back to the id', () => {
    const d = buildExplodedDrawing(ground(), 1, { materials });
    for (const p of d.panels) {
      if (p.materialId === 'mdf-white') {
        expect(p.materialNameFa).toBe('MDF سفید');
        expect(p.materialNameEn).toBe('White MDF');
      }
    }
    const bare = buildExplodedDrawing(ground(), 1);
    expect(bare.panels.every((p) => p.materialNameFa === p.materialId)).toBe(true);
  });

  it('keeps the legend quantity equal to count × module quantity', () => {
    const d = buildExplodedDrawing({ ...ground(), quantity: 3 }, 1, { materials });
    const body = d.panels.find((p) => p.partId === 'body')!;
    expect(body.count).toBe(2);
    expect(body.totalPieces).toBe(6);
  });
});

describe('exploded drawings — dimension consistency', () => {
  it('matches the cutting list exactly for every component', () => {
    const mods = modules();
    const rows = buildCuttingList(mods);
    const sheet = buildExplodedSheet(mods, { materials });
    for (const d of sheet.drawings) {
      expect(verifyDrawingAgainstRows(d, rows)).toEqual([]);
    }
  });

  it('prints millimetres, not raw centimetres', () => {
    const d = buildExplodedDrawing(ground(), 1, { materials });
    const shelf = d.panels.find((p) => p.partId === 'shelf')!;
    // workbook: shelfLength = B - 3.2 = 76.8 cm for the default B = 80
    expect(shelf.length).toBeCloseTo(76.8, 10);
    expect(mmLabel(shelf.length)).toBe('768');
    expect(toMm(shelf.width)).toBeCloseTo(shelf.width * 10, 6);
  });

  it('reports the cabinet envelope derived from panel data', () => {
    const input = emptyGroundCabinet();
    const d = buildExplodedDrawing(ground(input), 1);
    expect(d.envelope.widthCm).toBeCloseTo(input.baseWidth > 0 ? d.envelope.widthCm : 0);
    expect(d.envelope.widthCm).toBeCloseTo(calculateGroundCabinet(input).derived.baseLength, 6);
    // The inset 3 mm back is slightly taller than the carcass (workbook rule)
    // and must not inflate the cabinet envelope.
    const res = calculateGroundCabinet(input);
    expect(res.derived.backLength).toBeGreaterThan(input.bodyLength);
    expect(d.envelope.heightCm).toBeCloseTo(Math.max(input.bodyLength, input.doorHeight), 6);
    expect(d.envelope.depthCm).toBeCloseTo(input.bodyWidth, 6);

    const widthDim = d.dimensions.find((x) => x.axis === 'width')!;
    expect(widthDim.valueCm).toBeCloseTo(d.envelope.widthCm, 6);
    expect(widthDim.text).toBe(mmLabel(d.envelope.widthCm));
    // The projection is isometric, so a pure X extent of W projects to a line
    // of exactly W: the dimension line is the measured extent, not an offset.
    const extent = Math.hypot(widthDim.to.x - widthDim.from.x, widthDim.to.y - widthDim.from.y);
    expect(extent).toBeCloseTo(d.envelope.widthCm, 6);
    const depthExtent = Math.hypot(
      d.dimensions.find((x) => x.axis === 'depth')!.to.x - d.dimensions.find((x) => x.axis === 'depth')!.from.x,
      d.dimensions.find((x) => x.axis === 'depth')!.to.y - d.dimensions.find((x) => x.axis === 'depth')!.from.y,
    );
    expect(depthExtent).toBeCloseTo(d.envelope.depthCm, 6);
    const heightDim = d.dimensions.find((x) => x.axis === 'height')!;
    expect(heightDim.text).toBe(mmLabel(d.envelope.heightCm));
    const depthDim = d.dimensions.find((x) => x.axis === 'depth')!;
    expect(depthDim.text).toBe(mmLabel(d.envelope.depthCm));
  });

  it('keeps the drawing in sync when an input dimension changes', () => {
    const before = buildExplodedDrawing(ground(), 1);
    const input = emptyGroundCabinet();
    input.width = 90;
    const after = buildExplodedDrawing(ground(input), 1);
    const b = before.panels.find((p) => p.partId === 'shelf')!;
    const a = after.panels.find((p) => p.partId === 'shelf')!;
    expect(a.dimensionText).not.toBe(b.dimensionText);
    expect(a.length).toBeCloseTo(calculateGroundCabinet(input).derived.shelfLength, 10);
    expect(after.envelope.widthCm).toBeGreaterThan(before.envelope.widthCm);
  });

  it('has positive bounds that contain every drawn point', () => {
    const sheet = buildExplodedSheet(modules(), { materials });
    for (const d of sheet.drawings) {
      expect(d.bounds.width).toBeGreaterThan(0);
      expect(d.bounds.height).toBeGreaterThan(0);
      for (const p of d.panels) {
        for (const pt of [...p.face, ...p.sides.flat(), p.anchor]) {
          expect(pt.x).toBeGreaterThanOrEqual(d.bounds.minX);
          expect(pt.x).toBeLessThanOrEqual(d.bounds.maxX);
          expect(pt.y).toBeGreaterThanOrEqual(d.bounds.minY);
          expect(pt.y).toBeLessThanOrEqual(d.bounds.maxY);
        }
      }
    }
  });
});

describe('exploded drawings — separated panels', () => {
  const bbox = (pts: { x: number; y: number }[]) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return { minX, minY, maxX, maxY };
  };

  it('never stacks two panels on top of each other', () => {
    const sheet = buildExplodedSheet(modules(), { materials });
    for (const d of sheet.drawings) {
      const boxes = d.panels.map((p) => bbox([...p.face, ...p.sides.flat()]));
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
          const overlapY = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
          // Panels may share an edge, never an area.
          expect(overlapX <= 0 || overlapY <= 0).toBe(true);
        }
      }
    }
  });

  it('records the presentation shift without touching dimensions', () => {
    const d = buildExplodedDrawing(ground(), 1, { materials });
    const rows = buildCuttingList([ground()]);
    expect(verifyDrawingAgainstRows(d, rows)).toEqual([]);
    for (const p of d.panels) {
      expect(Number.isFinite(p.displayShift.x)).toBe(true);
      expect(Number.isFinite(p.displayShift.y)).toBe(true);
    }
  });

  it('anchors every badge inside its own panel face', () => {
    const d = buildExplodedDrawing(ground(), 1, { materials });
    for (const p of d.panels) {
      const b = bbox(p.face);
      expect(p.anchor.x).toBeGreaterThanOrEqual(b.minX - 1e-6);
      expect(p.anchor.x).toBeLessThanOrEqual(b.maxX + 1e-6);
      expect(p.anchor.y).toBeGreaterThanOrEqual(b.minY - 1e-6);
      expect(p.anchor.y).toBeLessThanOrEqual(b.maxY + 1e-6);
    }
  });

  it('keeps the sheet bounds large enough for every panel and dimension', () => {
    const sheet = buildExplodedSheet(modules(), { materials });
    for (const d of sheet.drawings) {
      for (const p of d.panels) {
        for (const q of [...p.face, ...p.sides.flat(), p.anchor]) {
          expect(q.x).toBeGreaterThanOrEqual(d.bounds.minX);
          expect(q.x).toBeLessThanOrEqual(d.bounds.maxX);
          expect(q.y).toBeGreaterThanOrEqual(d.bounds.minY);
          expect(q.y).toBeLessThanOrEqual(d.bounds.maxY);
        }
      }
      for (const dim of d.dimensions) {
        for (const q of [dim.from, dim.to]) {
          expect(q.x).toBeGreaterThanOrEqual(d.bounds.minX);
          expect(q.x).toBeLessThanOrEqual(d.bounds.maxX);
        }
      }
    }
  });
});

describe('exploded drawings — unsupported and missing data', () => {
  const withPart = (extra: PanelPart): ExplodeModuleInput => {
    const base = ground();
    return { ...base, parts: [...base.parts, extra] };
  };

  const mkPart = (over: Partial<PanelPart>): PanelPart => ({
    id: 'mystery',
    nameFa: 'قطعهٔ نامشخص',
    nameEn: 'Unknown panel',
    role: 'shelf',
    width: 20,
    length: 40,
    count: 1,
    edges: { widthEdge: false, lengthEdge: false },
    thickness: 1.6,
    materialId: 'mdf-white',
    source: { rule: 'custom', formulaFa: '—', detailFa: '—' },
    ...over,
  });

  it('reports a panel with no usable dimension instead of inventing one', () => {
    const d = buildExplodedDrawing(withPart(mkPart({ id: 'bad', width: Number.NaN })), 1, { materials });
    const issue = d.issues.find((i) => i.code === 'MISSING_DIMENSION');
    expect(issue).toBeDefined();
    expect(issue!.partId).toBe('bad');
    expect(d.panels.some((p) => p.partId === 'bad')).toBe(false);
  });

  it('reports a zero dimension as missing', () => {
    const d = buildExplodedDrawing(withPart(mkPart({ id: 'zero', length: 0 })), 1, { materials });
    expect(d.issues.some((i) => i.code === 'MISSING_DIMENSION' && i.partId === 'zero')).toBe(true);
  });

  it('flags an unknown part role as unsupported geometry', () => {
    const d = buildExplodedDrawing(
      withPart(mkPart({ id: 'weird', role: 'hinge-plate' as PanelPart['role'] })),
      1,
      { materials },
    );
    expect(d.issues.some((i) => i.code === 'UNSUPPORTED_GEOMETRY' && i.partId === 'weird')).toBe(true);
  });

  it('notes zero thickness and still draws the panel', () => {
    const d = buildExplodedDrawing(withPart(mkPart({ id: 'thin', thickness: 0 })), 1, { materials });
    expect(d.issues.some((i) => i.code === 'MISSING_THICKNESS' && i.partId === 'thin')).toBe(true);
    expect(d.panels.some((p) => p.partId === 'thin')).toBe(true);
  });

  it('limits drawn copies but keeps the real quantity in the legend', () => {
    const input = emptyGroundCabinet();
    input.shelfCount = 9;
    const d = buildExplodedDrawing(ground(input), 1, { materials, maxInstancesPerPart: 3 });
    const shelfPanels = d.panels.filter((p) => p.partId === 'shelf');
    expect(shelfPanels).toHaveLength(3);
    expect(shelfPanels[0].count).toBe(9);
    expect(shelfPanels[0].truncated).toBe(true);
    expect(d.issues.some((i) => i.code === 'TRUNCATED_INSTANCES')).toBe(true);
  });

  it('warns on an empty module and produces no geometry', () => {
    const d = buildExplodedDrawing({ ...ground(), parts: [] }, 1, { materials });
    expect(d.panels).toHaveLength(0);
    expect(d.issues.some((i) => i.code === 'EMPTY_MODULE')).toBe(true);
    expect(d.bounds.width).toBeGreaterThan(0); // non-degenerate viewport
  });

  it('warns on zero module quantity', () => {
    const d = buildExplodedDrawing({ ...ground(), quantity: 0 }, 1, { materials });
    expect(d.issues.some((i) => i.code === 'ZERO_QUANTITY')).toBe(true);
  });
});

describe('exploded sheet', () => {
  it('summarises components and pieces across modules', () => {
    const mods = modules();
    const sheet = buildExplodedSheet(mods, { materials });
    expect(sheet.drawings).toHaveLength(3);
    expect(sheet.componentCount).toBeGreaterThan(10);
    const expectedPieces = mods.reduce(
      (n, m) => n + m.parts.reduce((k, p) => k + p.count, 0) * m.quantity,
      0,
    );
    expect(sheet.pieceCount).toBe(expectedPieces);
  });

  it('never claims joinery or CNC operations', () => {
    const sheet = buildExplodedSheet(modules(), { materials });
    const json = JSON.stringify(sheet);
    expect(json).not.toMatch(/drill|dowel|hinge|g-code|cnc/i);
  });
});
