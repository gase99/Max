import { describe, it, expect } from 'vitest';
import {
  buildCuttingList,
  buildDxf,
  buildExplodedSheet,
  calculateDrawer,
  calculateGroundCabinet,
  calculateWallCabinet,
  dxfRectangles,
  emptyDrawer,
  emptyGroundCabinet,
  emptyWallCabinet,
  parseDxf,
  DXF_LAYERS,
  type ExplodeModuleInput,
} from '../src/index.js';

const materials = [
  { id: 'mdf-white', nameFa: 'MDF سفید', nameEn: 'White MDF' },
  { id: 'back-3mm', nameFa: 'فیبر ۳ میل', nameEn: '3 mm fibreboard' },
];

const modules = (): ExplodeModuleInput[] => [
  {
    id: 'm1',
    label: 'کابینت زمینی',
    labelEn: 'Base cabinet',
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

const sheetOf = (mods = modules()) => buildExplodedSheet(mods, { materials });

describe('DXF export — document structure', () => {
  it('writes a complete R12 document with millimetre units', () => {
    const { dxf, summary } = buildDxf(sheetOf());
    const parsed = parseDxf(dxf);
    expect(parsed.complete).toBe(true);
    expect(parsed.version).toBe('AC1009');
    expect(parsed.units).toBe(4); // $INSUNITS 4 = mm
    expect(parsed.measurement).toBe(1); // metric
    expect(summary.units).toBe('mm');
    expect(summary.format).toBe('DXF R12 (AC1009)');
  });

  it('declares exactly the layers it uses, and uses no others', () => {
    const { dxf, summary } = buildDxf(sheetOf());
    const parsed = parseDxf(dxf);
    expect([...parsed.layers].sort()).toEqual([...summary.layers].sort());
    const used = new Set([
      ...parsed.lines.map((l) => l.layer),
      ...parsed.texts.map((t) => t.layer),
      ...parsed.circles.map((c) => c.layer),
    ]);
    for (const layer of used) expect(summary.layers).toContain(layer);
    expect(used.has(DXF_LAYERS.OUTLINE)).toBe(true);
    expect(used.has(DXF_LAYERS.LABEL)).toBe(true);
    expect(used.has(DXF_LAYERS.DIM)).toBe(true);
    // Machining is declared for future work but must stay empty: no invented CNC.
    expect(used.has(DXF_LAYERS.MACHINING)).toBe(false);
  });

  it('declares extents that actually contain every entity', () => {
    const { dxf } = buildDxf(sheetOf());
    const parsed = parseDxf(dxf);
    for (const l of parsed.lines) {
      for (const [x, y] of [
        [l.x1, l.y1],
        [l.x2, l.y2],
      ]) {
        expect(x).toBeGreaterThanOrEqual(parsed.extMin.x - 1e-6);
        expect(x).toBeLessThanOrEqual(parsed.extMax.x + 1e-6);
        expect(y).toBeGreaterThanOrEqual(parsed.extMin.y - 1e-6);
        expect(y).toBeLessThanOrEqual(parsed.extMax.y + 1e-6);
      }
    }
  });

  it('contains no G-code, no tooling and no claims of machining', () => {
    const { dxf } = buildDxf(sheetOf());
    // Case-sensitive, and anchored on entity structure: the module ids are `m1`,
    // `m2`, `m3`, so a case-insensitive search would hit them by accident.
    expect(dxf).not.toMatch(/\bG0[0-9]\b|\bM0[3-9]\b|\bDRILL\b|\bPOCKET\b|TOOLPATH/);
    // MACHINING is declared as a reserved layer only; no entity may live on it.
    const used = new Set([
      ...parseDxf(dxf).lines.map((l) => l.layer),
      ...parseDxf(dxf).texts.map((t) => t.layer),
      ...parseDxf(dxf).circles.map((c) => c.layer),
    ]);
    expect(used.has('MACHINING')).toBe(false);
  });

  it('is parseable byte-for-byte after a round trip through CRLF', () => {
    const { dxf } = buildDxf(sheetOf());
    expect(dxf).toContain('\r\n');
    const a = parseDxf(dxf);
    const b = parseDxf(dxf.replace(/\r\n/g, '\n'));
    expect(b.lines.length).toBe(a.lines.length);
    expect(b.texts.length).toBe(a.texts.length);
  });

  it('rejects a corrupt file rather than pretending to read it', () => {
    expect(() => parseDxf('not a dxf')).toThrow(/not a DXF/);
    expect(() => parseDxf('0\r\nSECTION\r\n2\r\nHEADER\r\n')).toThrow(/not a DXF/);
    // Broken group code on an odd line.
    expect(() => parseDxf('0\r\nSECTION\r\nxx\r\nHEADER\r\n0\r\nEOF\r\n')).toThrow(/invalid group code/);
  });
});

describe('DXF export — geometry fidelity', () => {
  it('draws every component exactly once, at 1:1 in millimetres', () => {
    const mods = modules();
    const sheet = sheetOf(mods);
    const { dxf, summary } = buildDxf(sheet);
    const parsed = parseDxf(dxf);
    const rects = dxfRectangles(parsed);
    // one rectangle per unique component across all modules
    expect(rects).toHaveLength(summary.panels);
    const expected = sheet.drawings.reduce(
      (n, d) => n + new Set(d.panels.map((p) => p.componentNo)).size,
      0,
    );
    expect(rects).toHaveLength(expected);
  });

  it('preserves every panel length and width to 0.1 mm', () => {
    const sheet = sheetOf();
    const { dxf } = buildDxf(sheet);
    const rects = dxfRectangles(parseDxf(dxf));
    const wanted = sheet.drawings
      .flatMap((d) =>
        [...new Set(d.panels.map((p) => p.componentNo))].map((no) =>
          d.panels.find((p) => p.componentNo === no)!,
        ),
      )
      .map((p) => ({ w: p.length * 10, h: p.width * 10 }));

    for (const want of wanted) {
      const hit = rects.find(
        (r) => Math.abs(r.width - want.w) < 0.05 && Math.abs(r.height - want.h) < 0.05,
      );
      expect(hit, `no rectangle ${want.w} × ${want.h} mm`).toBeDefined();
    }
  });

  it('matches the cutting list exactly (no rounded or rescaled dimensions)', () => {
    const mods = modules();
    const rows = buildCuttingList(mods);
    const { dxf } = buildDxf(sheetOf(mods));
    const rects = dxfRectangles(parseDxf(dxf));
    for (const row of rows) {
      const w = row.length * 10;
      const h = row.width * 10;
      const hit = rects.some((r) => Math.abs(r.width - w) < 0.05 && Math.abs(r.height - h) < 0.05);
      expect(hit, `cutting list row ${row.partId} ${w}×${h} missing`).toBe(true);
    }
  });

  it('keeps panels on the OUTLINE layer and never overlaps two of them', () => {
    const { dxf } = buildDxf(sheetOf());
    const rects = dxfRectangles(parseDxf(dxf));
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlap, `rect ${i} overlaps rect ${j}`).toBe(false);
      }
    }
  });

  it('labels each component with its number and size on the label/dim layers', () => {
    const sheet = sheetOf();
    const { dxf } = buildDxf(sheet);
    const parsed = parseDxf(dxf);
    const texts = parsed.texts.map((t) => t.text);
    const first = sheet.drawings[0];
    for (const no of new Set(first.panels.map((p) => p.componentNo))) {
      expect(texts).toContain(String(no));
    }
    // A size callout in mm exists for the base panel of the ground cabinet.
    const base = first.panels.find((p) => p.partId === 'base')!;
    expect(texts.some((t) => t.includes(`${Math.round(base.length * 10)} x ${Math.round(base.width * 10)} mm`))).toBe(true);
  });

  it('is deterministic: the same project always produces the same file', () => {
    const a = buildDxf(sheetOf()).dxf;
    const b = buildDxf(sheetOf()).dxf;
    expect(a).toBe(b);
  });

  it('omits labels and frames on request', () => {
    const plain = buildDxf(sheetOf(), { includeLabels: false, includeFrames: false });
    const parsed = parseDxf(plain.dxf);
    expect(parsed.circles).toHaveLength(0);
    expect(parsed.lines.every((l) => l.layer !== DXF_LAYERS.FRAME)).toBe(true);
    expect(parsed.texts.every((t) => t.layer !== DXF_LAYERS.LABEL)).toBe(true);
  });

  it('writes an empty but valid document for an empty project', () => {
    const empty = buildExplodedSheet([], { materials });
    const parsed = parseDxf(buildDxf(empty).dxf);
    expect(parsed.complete).toBe(true);
    expect(parsed.lines).toHaveLength(0);
    expect(buildDxf(empty).summary.panels).toBe(0);
  });
});
