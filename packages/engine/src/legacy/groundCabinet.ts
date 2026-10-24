import {
  GROUND_BACK_LENGTH_ADD,
  GROUND_BACK_LENGTH_SUB,
  GROUND_BACK_WIDTH_ALLOWANCE,
  GROUND_WIDTH_ALLOWANCE,
} from './constants.js';
import { doorTier, doorTierAudit } from './doorRule.js';
import type {
  FormulaAuditEntry,
  GroundCabinetInput,
  GroundCabinetResult,
  PanelPart,
  PartSource,
  ValidationIssue,
} from '../types.js';
import { checkDerived, checkTiny, isPositive, validateDimensions } from '../validation.js';

const LABELS: Record<string, string> = {
  width: 'عرض کابینت',
  baseWidth: 'عرض کف',
  bodyWidth: 'عرض بدنه',
  bodyLength: 'طول بدنه',
  shelfWidth: 'عرض طبقه',
  railWidth: 'عرض قید',
};

/**
 * Ground / base cabinet (کابینت زمینی) — sheet `کابینت زمینی`.
 *
 * Verified against all 11 workbook slots (Excel cached values).
 *
 *   کف     (base)   : width = baseWidth (input), length = B
 *   بدنه   (body)   : width = bodyWidth (input), length = bodyLength (input)
 *   طبقه   (shelf)  : width = shelfWidth (input), length = B − 3.2
 *   قید    (rail)   : width = railWidth  (input), length = B − 3.2
 *   فیبر   (back)   : width = B − 1.6,        length = bodyLength + 1.6 − 0.8
 *   درب    (door)   : tier rule on B, height = doorHeight (input)
 */
export function calculateGroundCabinet(input: GroundCabinetInput): GroundCabinetResult {
  const B = input.width;
  const warnings: ValidationIssue[] = [];

  warnings.push(...validateDimensions(B, [
    { field: 'baseWidth', value: input.baseWidth },
    { field: 'bodyWidth', value: input.bodyWidth },
    { field: 'bodyLength', value: input.bodyLength },
    { field: 'shelfWidth', value: input.shelfWidth },
    { field: 'railWidth', value: input.railWidth },
  ], LABELS));

  // --- derived dimensions, same operation order as the spreadsheet ---
  const baseLength = B; // D2 = B2
  const shelfLength = B - GROUND_WIDTH_ALLOWANCE; // H2 = B2-3.2
  const railLength = B - GROUND_WIDTH_ALLOWANCE; // J2 = B2-3.2
  const backWidth = baseLength - GROUND_BACK_WIDTH_ALLOWANCE; // K2 = D2-1.6
  const backLength = input.bodyLength + GROUND_BACK_LENGTH_ADD - GROUND_BACK_LENGTH_SUB; // L2 = F2+1.6-0.8
  const door = doorTier(B);

  for (const [field, label, value] of [
    ['baseLength', 'طول کف', baseLength],
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
      source: src('طول کف = عرض کابینت', `= ${B}`),
    },
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
      id: 'shelf',
      nameFa: 'طبقه',
      nameEn: 'Shelf',
      role: 'shelf',
      width: input.shelfWidth,
      length: shelfLength,
      count: input.shelfCount,
      edges: input.shelfEdges,
      thickness: input.thickness,
      materialId: input.materialId,
      source: src('طول طبقه = عرض کابینت − ۳٫۲', `= ${B} − 3.2 = ${shelfLength}`),
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
        'عرض فیبر = طول کف − ۱٫۶ / طول فیبر = طول بدنه + ۱٫۶ − ۰٫۸',
        `= ${baseLength} − 1.6 = ${backWidth} ؛ = ${input.bodyLength} + 1.6 − 0.8 = ${backLength}`,
      ),
    });
  }

  if (door.count !== '' && door.count > 0) {
    const qty = door.count * (isPositive(input.bodyCount) ? 1 : 1);
    parts.push({
      id: 'door',
      nameFa: 'درب',
      nameEn: 'Door',
      role: 'door',
      width: door.width as number,
      length: input.doorHeight,
      count: qty,
      edges: { widthEdge: true, lengthEdge: true },
      thickness: input.thickness,
      materialId: input.materialId,
      source: src(
        'عرض درب = تابع پلهٔ عرض کابینت (۱۰–۵۰ → W−0.2 / ۵۰–۱۰۰ → W/2−0.2 / ۱۰۰–۱۵۰ → W/3−0.2)',
        `عرض ${B} → ${door.count} لنگه × ${door.width}`,
      ),
    });
  } else if (door.count === '') {
    warnings.push({
      severity: 'warning',
      code: 'DOOR_TIER_OUT_OF_RANGE',
      field: 'width',
      messageFa: 'عرض کابینت خارج از بازهٔ ۱۰ تا ۱۵۰ است؛ مطابق فایل اکسل، عرض و تعداد درب خالی می‌شود.',
      messageEn: 'Width outside 10–150 cm: the door width/count evaluate to empty, as in the workbook.',
    });
  }

  const audit: FormulaAuditEntry[] = [
    { field: 'baseLength', labelFa: 'طول کف', excelFormula: '=B2', substitutedFa: `= ${B}`, value: baseLength },
    { field: 'shelfLength', labelFa: 'طول طبقه', excelFormula: '=B2-3.2', substitutedFa: `= ${B} − 3.2`, value: shelfLength },
    { field: 'railLength', labelFa: 'طول قید', excelFormula: '=B2-3.2', substitutedFa: `= ${B} − 3.2`, value: railLength },
    { field: 'backWidth', labelFa: 'عرض فیبر ۳ میل', excelFormula: '=D2-1.6', substitutedFa: `= ${baseLength} − 1.6`, value: backWidth },
    { field: 'backLength', labelFa: 'طول فیبر ۳ میل', excelFormula: '=F2+1.6-0.8', substitutedFa: `= ${input.bodyLength} + 1.6 − 0.8`, value: backLength },
    ...doorTierAudit(B),
  ];

  return { kind: 'ground', input, derived: { baseLength, shelfLength, railLength, backWidth, backLength, doorWidth: door.width, doorCount: door.count }, parts, audit, warnings };
}

export function emptyGroundCabinet(thickness = 1.6, materialId = 'mdf-white'): GroundCabinetInput {
  return {
    width: 80,
    baseWidth: 58,
    baseCount: 1,
    baseEdges: { widthEdge: false, lengthEdge: true },
    bodyWidth: 58,
    bodyLength: 73.4,
    bodyCount: 2,
    bodyEdges: { widthEdge: false, lengthEdge: true },
    shelfWidth: 55,
    shelfCount: 1,
    shelfEdges: { widthEdge: false, lengthEdge: true },
    railWidth: 7,
    railCount: 1,
    railEdges: { widthEdge: false, lengthEdge: false },
    doorHeight: 73.4,
    backCount: 1,
    materialId,
    thickness,
  };
}
