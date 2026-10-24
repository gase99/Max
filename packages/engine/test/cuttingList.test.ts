import { describe, it, expect } from 'vitest';
import {
  buildCuttingList,
  groupByMaterial,
  mergeIdentical,
  summarise,
  calculateGroundCabinet,
  emptyGroundCabinet,
  emptyWallCabinet,
  calculateWallCabinet,
} from '../src/index.js';

const moduleOf = (id: string, label: string, input = emptyGroundCabinet(), qty = 1) => ({
  id,
  label,
  kind: 'ground' as const,
  quantity: qty,
  parts: calculateGroundCabinet(input).parts,
});

describe('cutting list', () => {
  it('expands part counts by module quantity', () => {
    const rows = buildCuttingList([moduleOf('m1', 'کابینت ۱', emptyGroundCabinet(), 3)]);
    const body = rows.find((r) => r.partId === 'body')!;
    expect(body.qty).toBe(2 * 3);
  });

  it('drops modules with zero quantity', () => {
    const rows = buildCuttingList([moduleOf('m1', 'zero', emptyGroundCabinet(), 0)]);
    expect(rows).toHaveLength(0);
  });

  it('drops parts with zero count', () => {
    const input = emptyGroundCabinet();
    input.shelfCount = 0;
    const rows = buildCuttingList([moduleOf('m1', 'm', input)]);
    expect(rows.find((r) => r.partId === 'shelf')).toBeUndefined();
  });

  it('computes edge-banding metres for the selected edges', () => {
    const rows = buildCuttingList([
      {
        id: 'm1',
        label: 'x',
        kind: 'ground',
        quantity: 1,
        parts: [
          {
            id: 'p',
            nameFa: 'تست',
            nameEn: 'test',
            role: 'shelf',
            width: 50,
            length: 100,
            count: 2,
            edges: { widthEdge: true, lengthEdge: true },
            thickness: 1.6,
            materialId: 'mdf-white',
            source: { rule: 'legacy', formulaFa: '', detailFa: '' },
          },
        ],
      },
    ]);
    // width edges: 0.50 m × 2 edges × 2 pieces = 2 m
    // length edges: 1.00 m × 2 edges × 2 pieces = 4 m
    expect(rows[0].edgeBandWidthM).toBeCloseTo(2, 9);
    expect(rows[0].edgeBandLengthM).toBeCloseTo(4, 9);
  });

  it('computes area in m²', () => {
    const rows = buildCuttingList([
      {
        id: 'm1', label: 'x', kind: 'ground', quantity: 1,
        parts: [{
          id: 'p', nameFa: 'a', nameEn: 'a', role: 'shelf',
          width: 100, length: 100, count: 2,
          edges: { widthEdge: false, lengthEdge: false },
          thickness: 1.6, materialId: 'mdf-white',
          source: { rule: 'legacy', formulaFa: '', detailFa: '' },
        }],
      },
    ]);
    expect(rows[0].areaM2).toBeCloseTo(2, 9);
  });

  it('keeps per-module rows by default and does not silently merge', () => {
    const rows = buildCuttingList([
      moduleOf('m1', 'A'),
      moduleOf('m2', 'B'),
    ]);
    // two modules × six part types (base, body, shelf, rail, back, door)
    expect(rows).toHaveLength(12);
    expect(new Set(rows.map((r) => r.moduleId)).size).toBe(2);
  });

  it('merges only truly identical parts when asked', () => {
    const merged = buildCuttingList([moduleOf('m1', 'A'), moduleOf('m2', 'B')], {
      mergeAcrossModules: true,
    });
    // Both modules have identical parts, so 4 merged rows remain.
    expect(merged).toHaveLength(6);
    const body = merged.find((r) => r.partId === 'body')!;
    expect(body.qty).toBe(4); // 2 per module × 2 modules
  });

  it('merged total piece count equals unmerged total (no double counting)', () => {
    const modules = [moduleOf('m1', 'A'), moduleOf('m2', 'B')];
    const plain = buildCuttingList(modules);
    const merged = buildCuttingList(modules, { mergeAcrossModules: true });
    const sum = (rs: typeof plain) => rs.reduce((s, r) => s + r.qty, 0);
    expect(sum(merged)).toBe(sum(plain));
  });

  it('does not merge parts that differ in thickness', () => {
    const a = buildCuttingList([moduleOf('m1', 'A')])[0];
    const b = { ...a, thickness: 1.8, key: 'other' };
    const merged = mergeIdentical([a, b]);
    expect(merged).toHaveLength(2);
  });

  it('does not merge parts that differ in edge banding', () => {
    const a = buildCuttingList([moduleOf('m1', 'A')])[0];
    const b = { ...a, edgeWidthEdge: !a.edgeWidthEdge, key: 'other' };
    expect(mergeIdentical([a, b])).toHaveLength(2);
  });

  it('groups by material and thickness', () => {
    const rows = buildCuttingList([moduleOf('m1', 'A'), moduleOf('m2', 'B')]);
    const groups = groupByMaterial(rows);
    // mdf-white@1.6 plus back-3mm@0.3
    expect(groups.size).toBe(2);
  });

  it('summarises totals consistently', () => {
    const rows = buildCuttingList([moduleOf('m1', 'A', emptyGroundCabinet(), 2)]);
    const s = summarise(rows);
    expect(s.totalPieces).toBe(rows.reduce((a, r) => a + r.qty, 0));
    expect(s.totalAreaM2).toBeCloseTo(rows.reduce((a, r) => a + r.areaM2, 0), 9);
  });

  it('wall cabinet produces its five wooden panels plus back and door', () => {
    const r = calculateWallCabinet(emptyWallCabinet());
    const ids = r.parts.map((p) => p.id);
    expect(ids).toEqual(['body', 'base', 'top', 'shelf', 'rail', 'back', 'door']);
  });
});
