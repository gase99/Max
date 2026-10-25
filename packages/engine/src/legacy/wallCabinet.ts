import {
  WALL_BACK_LENGTH_SUB,
  WALL_BACK_WIDTH_ADD,
  WALL_SHELF_WIDTH_ALLOWANCE,
  WALL_TOP_WIDTH_ALLOWANCE,
  WALL_WIDTH_ALLOWANCE,
} from './constants.js';
import { doorTier, doorTierAudit } from './doorRule.js';
import type {
  FormulaAuditEntry,
  PanelPart,
  PartSource,
  ValidationIssue,
  WallCabinetInput,
  WallCabinetResult,
} from '../types.js';
import { checkDerived, checkTiny, validateDimensions } from '../validation.js';

const LABELS: Record<string, string> = {
  width: 'عرض کابینت',
  bodyWidth: 'عرض بدنه',
  bodyLength: 'طول بدنه',
  baseWidth: 'عرض کف',
  railWidth: 'عرض قید',
};

/**
 * Wall cabinet (کابینت هوایی) — sheet `کابینت هوایی`.
 *
 * Verified against all 20 workbook slots (Excel cached values).
 *
 *   بدنه  (body)  : w = bodyWidth (input),  l = bodyLength (input)
 *   کف    (base)  : w = baseWidth (input),  l = B − 3.2
 *   تاق   (top)   : w = bodyWidth − 2,      l = B − 3.2
 *   طبقه  (shelf) : w = baseWidth − 3,      l = B − 3.2
 *   قید   (rail)  : w = railWidth (input),  l = B − 3.2
 *   فیبر  (back)  : w = (B − 3.2) + 1.6,    l = bodyLength − 0.8
 *   درب   (door)  : tier rule on B,         h = doorHeight (input)
 *
 * NOTE: the wall back-panel length uses `− 0.8` while the ground cabinet uses
 * `+ 1.6 − 0.8`. This asymmetry is intentional in the workbook and is
 * preserved. See docs/02-formula-specification.md §3.2.
 */
export function calculateWallCabinet(input: WallCabinetInput): WallCabinetResult {
  const B = input.width;
  const warnings: ValidationIssue[] = [];

  warnings.push(...validateDimensions(B, [
    { field: 'bodyWidth', value: input.bodyWidth },
    { field: 'bodyLength', value: input.bodyLength },
    { field: 'baseWidth', value: input.baseWidth },
    { field: 'railWidth', value: input.railWidth },
  ], LABELS));

  const baseLength = B - WALL_WIDTH_ALLOWANCE; // F3 = B3-3.2
  const topWidth = input.bodyWidth - WALL_TOP_WIDTH_ALLOWANCE; // G3 = C3-2
  const topLength = B - WALL_WIDTH_ALLOWANCE; // H3 = B3-3.2
  const shelfWidth = input.baseWidth - WALL_SHELF_WIDTH_ALLOWANCE; // I3 = E3-3
  const shelfLength = B - WALL_WIDTH_ALLOWANCE; // J3 = F3 = B3-3.2
  const railLength = B - WALL_WIDTH_ALLOWANCE; // L3 = B3-3.2
  const backWidth = baseLength + WALL_BACK_WIDTH_ADD; // M3 = F3+1.6
  const backLength = input.bodyLength - WALL_BACK_LENGTH_SUB; // N3 = D3-0.8
  const door = doorTier(B);

  for (const [field, label, value] of [
    ['baseLength', 'طول کف', baseLength],
    ['topWidth', 'عرض تاق', topWidth],
    ['topLength', 'طول تاق', topLength],
    ['shelfWidth', 'عرض طبقه', shelfWidth],
    ['shelfLength', 'طول طبقه', shelfLength],
    ['railLength', 'طول قید', railLength],
    ['backWidth', 'عرض فیبر', backWidth],
    ['backLength', 'طول فیبر', backLength],
  ] as const) {
    const e = checkDerived(field, label, value);
    if (e) warnings.push(e);
    const t = checkTiny(field, label, value, 5);
    if (t) warnings.push(t);
  }

  const src = (formulaFa: string, detailFa: string): PartSource => ({
    rule: 'legacy',
    formulaFa,
    detailFa,
  });

  const parts: PanelPart[] = [
    {
      id: 'body',
      nameFa: 'بدنه',
      nameEn: 'Side panel',
      role: 'body',
      width: input.bodyWidth,
      length: input.bodyLength,
      count: input.bodyCount,
      edges: input.bodyEdges,
      thickness: input.thickness,
      materialId: input.materialId,
      source: src('عرض و طول بدنه هر دو ورودی هستند', `= ${input.bodyWidth} × ${input.bodyLength}`),
    },
    {
      id: 'base',
      nameFa: 'کف',
      nameEn: 'Base',
      role: 'base',
      width: input.baseWidth,
      length: baseLength,
      count: input.baseCount,
      edges: input.baseEdges,
      thickness: input.thickness,
      materialId: input.materialId,
      source: src('طول کف = عرض کابینت − ۳٫۲', `= ${B} − 3.2 = ${baseLength}`),
    },
    {
      id: 'top',
      nameFa: 'تاق',
      nameEn: 'Top',
      role: 'top',
      width: topWidth,
      length: topLength,
      count: input.topCount,
      edges: input.topEdges,
      thickness: input.thickness,
      materialId: input.materialId,
      source: src('عرض تاق = عرض بدنه − ۲ / طول تاق = عرض کابینت − ۳٫۲', `= ${input.bodyWidth} − 2 = ${topWidth} ؛ = ${B} − 3.2 = ${topLength}`),
    },
    {
      id: 'shelf',
      nameFa: 'طبقه',
      nameEn: 'Shelf',
      role: 'shelf',
      width: shelfWidth,
      length: shelfLength,
      count: input.shelfCount,
      edges: input.shelfEdges,
      thickness: input.thickness,
      materialId: input.materialId,
      source: src('عرض طبقه = عرض کف − ۳ / طول طبقه = عرض کابینت − ۳٫۲', `= ${input.baseWidth} − 3 = ${shelfWidth} ؛ = ${B} − 3.2 = ${shelfLength}`),
    },
    {
      id: 'rail',
      nameFa: 'قید',
      nameEn: 'Rail',
      role: 'rail',
      width: input.railWidth,
      length: railLength,
      count: input.railCount,
      edges: input.railEdges,
      thickness: input.thickness,
      materialId: input.materialId,
      source: src('طول قید = عرض کابینت − ۳٫۲', `= ${B} − 3.2 = ${railLength}`),
    },
  ];

  if (input.backCount > 0) {
    parts.push({
      id: 'back',
      nameFa: 'فیبر ۳ میل',
      nameEn: 'Back panel (3 mm)',
      role: 'back',
      width: backWidth,
      length: backLength,
      count: input.backCount,
      edges: { widthEdge: false, lengthEdge: false },
      thickness: 0.3,
      materialId: 'back-3mm',
      source: src(
        'عرض فیبر = (عرض کابینت − ۳٫۲) + ۱٫۶ / طول فیبر = طول بدنه − ۰٫۸',
        `= ${baseLength} + 1.6 = ${backWidth} ؛ = ${input.bodyLength} − 0.8 = ${backLength}`,
      ),
    });
  }

  if (door.count !== '' && door.count > 0) {
    parts.push({
      id: 'door',
      nameFa: 'درب',
      nameEn: 'Door',
      role: 'door',
      width: door.width as number,
      length: input.doorHeight,
      count: door.count,
      edges: { widthEdge: true, lengthEdge: true },
      thickness: input.thickness,
      materialId: input.materialId,
      source: src(
        'عرض درب = تابع پلهٔ عرض کابینت؛ ارتفاع درب ورودی است',
        `عرض ${B} → ${door.count} لنگه × ${door.width} × ${input.doorHeight}`,
      ),
    });
  } else if (door.count === '') {
    warnings.push({
      severity: 'warning',
      code: 'DOOR_TIER_OUT_OF_RANGE',
      field: 'width',
      messageFa: 'عرض کابینت خارج از بازهٔ ۱۰ تا ۱۵۰ است؛ مطابق فایل اکسل، عرض و تعداد درب خالی می‌شود.',
      messageEn: 'Width outside 10–150 cm: door width/count evaluate to empty, as in the workbook.',
    });
  }

  const audit: FormulaAuditEntry[] = [
    { field: 'bodyWidth', labelFa: 'عرض بدنه', excelFormula: '=C3', substitutedFa: `= ${input.bodyWidth}`, value: input.bodyWidth },
    { field: 'baseLength', labelFa: 'طول کف', excelFormula: '=B3-3.2', substitutedFa: `= ${B} − 3.2`, value: baseLength },
    { field: 'topWidth', labelFa: 'عرض تاق', excelFormula: '=C3-2', substitutedFa: `= ${input.bodyWidth} − 2`, value: topWidth },
    { field: 'topLength', labelFa: 'طول تاق', excelFormula: '=B3-3.2', substitutedFa: `= ${B} − 3.2`, value: topLength },
    { field: 'shelfWidth', labelFa: 'عرض طبقه', excelFormula: '=E3-3', substitutedFa: `= ${input.baseWidth} − 3`, value: shelfWidth },
    { field: 'shelfLength', labelFa: 'طول طبقه', excelFormula: '=F3', substitutedFa: `= ${baseLength}`, value: shelfLength },
    { field: 'railLength', labelFa: 'طول قید', excelFormula: '=B3-3.2', substitutedFa: `= ${B} − 3.2`, value: railLength },
    { field: 'backWidth', labelFa: 'عرض فیبر ۳ میل', excelFormula: '=F3+1.6', substitutedFa: `= ${baseLength} + 1.6`, value: backWidth },
    { field: 'backLength', labelFa: 'طول فیبر ۳ میل', excelFormula: '=D3-0.8', substitutedFa: `= ${input.bodyLength} − 0.8`, value: backLength },
    ...doorTierAudit(B),
  ];

  return {
    kind: 'wall',
    input,
    derived: { baseLength, topWidth, topLength, shelfWidth, shelfLength, railLength, backWidth, backLength, doorWidth: door.width, doorCount: door.count },
    parts,
    audit,
    warnings,
  };
}

export function emptyWallCabinet(thickness = 1.6, materialId = 'mdf-white'): WallCabinetInput {
  return {
    width: 60,
    bodyWidth: 35,
    bodyLength: 90,
    bodyCount: 2,
    bodyEdges: { widthEdge: true, lengthEdge: true },
    baseWidth: 35,
    baseCount: 1,
    baseEdges: { widthEdge: false, lengthEdge: true },
    topCount: 1,
    topEdges: { widthEdge: false, lengthEdge: true },
    shelfCount: 1,
    shelfEdges: { widthEdge: false, lengthEdge: true },
    railWidth: 7,
    railCount: 1,
    railEdges: { widthEdge: false, lengthEdge: false },
    doorHeight: 92,
    backCount: 1,
    materialId,
    thickness,
  };
}
