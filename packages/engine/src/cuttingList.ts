import type { PanelPart, PartRole } from './types.js';

/**
 * Cutting list generation.
 *
 * The workbook's `آنالیز زمینی` / `آنالیز هوایی` sheets are a hand-maintained
 * flat transcription of every unit's panels. That sheet contains duplicated
 * rows (e.g. `آنالیز زمینی!O7` repeats `O6`) because it was copied by hand.
 * The software replaces it with a deterministic, deduplicated aggregation.
 */

export interface CuttingListRow {
  /** Stable key used for dedupe + grouping. */
  key: string;
  /** Module (cabinet) identifier this row belongs to. */
  moduleId: string;
  moduleLabel: string;
  moduleKind: 'ground' | 'wall' | 'drawer';
  /** Slot inside the module. */
  partId: string;
  nameFa: string;
  nameEn: string;
  role: PartRole;
  materialId: string;
  thickness: number;
  /** Finished length (cm) — the longer dimension after nesting decision. */
  length: number;
  /** Finished width (cm). */
  width: number;
  /** Total pieces: part count × module quantity. */
  qty: number;
  /** Total linear metres of edge banding on the long edges (2 per panel). */
  edgeBandLengthM: number;
  /** Total linear metres of edge banding on the short edges. */
  edgeBandWidthM: number;
  /** Total area in m². */
  areaM2: number;
  edgeWidthEdge: boolean;
  edgeLengthEdge: boolean;
  /** Human-readable provenance shown in the UI. */
  formulaFa: string;
  detailFa: string;
}

export interface ModuleLike {
  id: string;
  label: string;
  kind: 'ground' | 'wall' | 'drawer';
  quantity: number;
  parts: PanelPart[];
}

export interface CuttingListOptions {
  /**
   * Merge rows that are identical in every production-relevant field
   * (module-independent). Default false: rows stay per-module so the workshop
   * can trace each piece back to its cabinet.
   */
  mergeAcrossModules?: boolean;
}

/** Edge banding is consumed on the perimeter of the listed edges. */
export function edgeBandRunM(
  part: { width: number; length: number; qty: number },
  edges: { widthEdge: boolean; lengthEdge: boolean },
): { widthM: number; lengthM: number } {
  const widthM = edges.widthEdge ? (part.width * 2 * part.qty) / 100 : 0;
  const lengthM = edges.lengthEdge ? (part.length * 2 * part.qty) / 100 : 0;
  return { widthM, lengthM };
}

export function areaM2(width: number, length: number, qty: number): number {
  return (width * length * qty) / 10000;
}

export function buildCuttingList(
  modules: ModuleLike[],
  options: CuttingListOptions = {},
): CuttingListRow[] {
  const rows: CuttingListRow[] = [];

  for (const m of modules) {
    const qty = Number.isFinite(m.quantity) && m.quantity > 0 ? m.quantity : 0;
    if (qty === 0) continue;
    for (const p of m.parts) {
      const pieces = p.count * qty;
      if (!(pieces > 0)) continue;
      const band = edgeBandRunM({ width: p.width, length: p.length, qty: pieces }, p.edges);
      rows.push({
        key: `${m.id}::${p.id}`,
        moduleId: m.id,
        moduleLabel: m.label,
        moduleKind: m.kind,
        partId: p.id,
        nameFa: p.nameFa,
        nameEn: p.nameEn,
        role: p.role,
        materialId: p.materialId,
        thickness: p.thickness,
        length: p.length,
        width: p.width,
        qty: pieces,
        edgeBandLengthM: band.lengthM,
        edgeBandWidthM: band.widthM,
        areaM2: areaM2(p.width, p.length, pieces),
        edgeWidthEdge: p.edges.widthEdge,
        edgeLengthEdge: p.edges.lengthEdge,
        formulaFa: p.source.formulaFa,
        detailFa: p.source.detailFa,
      });
    }
  }

  return options.mergeAcrossModules ? mergeIdentical(rows) : rows;
}

/**
 * Merge rows that would produce literally the same physical part.
 * The `key` of the merged row is a canonical serialisation of every field that
 * affects production, so two rows are only merged when they are truly
 * interchangeable. This is the anti-double-counting rule.
 */
export function mergeIdentical(rows: CuttingListRow[]): CuttingListRow[] {
  const map = new Map<string, CuttingListRow>();
  for (const r of rows) {
    const sig = [
      r.nameFa,
      r.role,
      r.materialId,
      r.thickness,
      r.length,
      r.width,
      r.edgeWidthEdge ? '1' : '0',
      r.edgeLengthEdge ? '1' : '0',
    ].join('|');
    const existing = map.get(sig);
    if (!existing) {
      map.set(sig, { ...r, key: sig, moduleId: r.moduleId, moduleLabel: r.moduleLabel });
    } else {
      existing.qty += r.qty;
      existing.edgeBandLengthM += r.edgeBandLengthM;
      existing.edgeBandWidthM += r.edgeBandWidthM;
      existing.areaM2 += r.areaM2;
      existing.moduleLabel = `${existing.moduleLabel} + ${r.moduleLabel}`;
    }
  }
  return [...map.values()];
}

/** Group by material + thickness, which is the unit of sheet optimisation. */
export function groupByMaterial(rows: CuttingListRow[]): Map<string, CuttingListRow[]> {
  const out = new Map<string, CuttingListRow[]>();
  for (const r of rows) {
    const k = `${r.materialId}@${r.thickness}`;
    const arr = out.get(k);
    if (arr) arr.push(r);
    else out.set(k, [r]);
  }
  return out;
}

export interface CuttingListSummary {
  totalPieces: number;
  totalAreaM2: number;
  totalEdgeBandM: number;
  byMaterial: {
    materialId: string;
    thickness: number;
    pieces: number;
    areaM2: number;
    edgeBandM: number;
  }[];
}

export function summarise(rows: CuttingListRow[]): CuttingListSummary {
  const byMat = new Map<string, CuttingListSummary['byMaterial'][number]>();
  let totalPieces = 0;
  let totalAreaM2 = 0;
  let totalEdgeBandM = 0;

  for (const r of rows) {
    totalPieces += r.qty;
    totalAreaM2 += r.areaM2;
    totalEdgeBandM += r.edgeBandLengthM + r.edgeBandWidthM;
    const k = `${r.materialId}@${r.thickness}`;
    const cur = byMat.get(k);
    if (cur) {
      cur.pieces += r.qty;
      cur.areaM2 += r.areaM2;
      cur.edgeBandM += r.edgeBandLengthM + r.edgeBandWidthM;
    } else {
      byMat.set(k, {
        materialId: r.materialId,
        thickness: r.thickness,
        pieces: r.qty,
        areaM2: r.areaM2,
        edgeBandM: r.edgeBandLengthM + r.edgeBandWidthM,
      });
    }
  }

  return { totalPieces, totalAreaM2, totalEdgeBandM, byMaterial: [...byMat.values()] };
}
