import {
  DRAWER_BACK_ALLOWANCE,
  DRAWER_DEPTH_ALLOWANCE,
  DRAWER_FRONT_ALLOWANCE,
  DRAWER_HEIGHT_ALLOWANCE,
  DRAWER_HEIGHT_DIVISOR,
} from './constants.js';
import type {
  DrawerInput,
  DrawerResult,
  FormulaAuditEntry,
  PanelPart,
  ValidationIssue,
} from '../types.js';
import { checkDerived, issue, isPositive } from '../validation.js';

/**
 * Drawer (کشو) — sheet `کشو`, single block at B3:L6.
 *
 * Verified against the single workbook slot.
 *
 *   بدنه کشو (body)  : length = depth − 5,      width = height / 3 − 4, count = n × 2
 *   جلو کشو  (front) : length = width − 9.1,    width = body width,     count = n
 *   پشت کشو  (back)  : length = front length,   width = front width − 2, count = n
 *
 * NOTE: `height / 3 − 4` divides the *drawer height* by three. This is the
 * workbook's actual rule and is preserved exactly, even though a three-way
 * drawer stack would normally be modelled as three separate drawers.
 */
export function calculateDrawer(input: DrawerInput): DrawerResult {
  const warnings: ValidationIssue[] = [];

  for (const [field, labelFa, value] of [
    ['count', 'تعداد کشو', input.count],
    ['depth', 'عمق', input.depth],
    ['width', 'عرض', input.width],
    ['height', 'ارتفاع', input.height],
  ] as const) {
    if (!isPositive(value)) {
      warnings.push(
        issue('error', `${field.toUpperCase()}_NOT_POSITIVE`, `${labelFa} باید بزرگ‌تر از صفر باشد.`, `${field} must be greater than zero.`, field),
      );
    }
  }

  const bodyLength = input.depth - DRAWER_DEPTH_ALLOWANCE; // H4 = C4-5
  const bodyWidth = input.height / DRAWER_HEIGHT_DIVISOR - DRAWER_HEIGHT_ALLOWANCE; // H5 = E4/3-4
  const bodyCount = input.count * 2; // H6 = B4*2

  const frontLength = input.width - DRAWER_FRONT_ALLOWANCE; // J4 = D4-9.1
  const frontWidth = bodyWidth; // J5 = H5
  const frontCount = input.count; // J6 = B4

  const backLength = frontLength; // L4 = J4
  const backWidth = frontWidth - DRAWER_BACK_ALLOWANCE; // L5 = J5-2
  const backCount = frontCount; // L6 = J6

  for (const [field, label, value] of [
    ['bodyLength', 'طول بدنه کشو', bodyLength],
    ['bodyWidth', 'عرض بدنه کشو', bodyWidth],
    ['frontLength', 'طول جلو کشو', frontLength],
    ['frontWidth', 'عرض جلو کشو', frontWidth],
    ['backLength', 'طول پشت کشو', backLength],
    ['backWidth', 'عرض پشت کشو', backWidth],
  ] as const) {
    const e = checkDerived(field, label, value);
    if (e) warnings.push(e);
  }

  const mk = (id: string, nameFa: string, nameEn: string, role: PanelPart['role'], w: number, l: number, count: number, f: string, d: string): PanelPart => ({
    id,
    nameFa,
    nameEn,
    role,
    width: w,
    length: l,
    count,
    edges: { widthEdge: false, lengthEdge: true },
    thickness: input.thickness,
    materialId: input.materialId,
    source: { rule: 'legacy', formulaFa: f, detailFa: d },
  });

  const parts: PanelPart[] = [
    mk('drawer-body', 'بدنه کشو', 'Drawer box side', 'drawer-body', bodyWidth, bodyLength, bodyCount,
      'طول = عمق − ۵ / عرض = ارتفاع ÷ ۳ − ۴ / تعداد = تعداد × ۲',
      `= ${input.depth} − 5 = ${bodyLength} ؛ = ${input.height} ÷ 3 − 4 = ${bodyWidth} ؛ = ${input.count} × 2 = ${bodyCount}`),
    mk('drawer-front', 'جلو کشو', 'Drawer front', 'drawer-front', frontWidth, frontLength, frontCount,
      'طول = عرض − ۹٫۱ / عرض = عرض بدنه کشو / تعداد = تعداد',
      `= ${input.width} − 9.1 = ${frontLength} ؛ = ${frontWidth}`),
    mk('drawer-back', 'پشت کشو', 'Drawer back', 'drawer-back', backWidth, backLength, backCount,
      'طول = طول جلو / عرض = عرض جلو − ۲ / تعداد = تعداد',
      `= ${frontLength} ؛ = ${frontWidth} − 2 = ${backWidth}`),
  ];

  const audit: FormulaAuditEntry[] = [
    { field: 'bodyLength', labelFa: 'طول بدنه کشو', excelFormula: '=C4-5', substitutedFa: `= ${input.depth} − 5`, value: bodyLength },
    { field: 'bodyWidth', labelFa: 'عرض بدنه کشو', excelFormula: '=E4/3-4', substitutedFa: `= ${input.height} ÷ 3 − 4`, value: bodyWidth },
    { field: 'bodyCount', labelFa: 'تعداد بدنه کشو', excelFormula: '=B4*2', substitutedFa: `= ${input.count} × 2`, value: bodyCount },
    { field: 'frontLength', labelFa: 'طول جلو کشو', excelFormula: '=D4-9.1', substitutedFa: `= ${input.width} − 9.1`, value: frontLength },
    { field: 'frontWidth', labelFa: 'عرض جلو کشو', excelFormula: '=H5', substitutedFa: `= ${bodyWidth}`, value: frontWidth },
    { field: 'frontCount', labelFa: 'تعداد جلو کشو', excelFormula: '=B4', substitutedFa: `= ${input.count}`, value: frontCount },
    { field: 'backLength', labelFa: 'طول پشت کشو', excelFormula: '=J4', substitutedFa: `= ${frontLength}`, value: backLength },
    { field: 'backWidth', labelFa: 'عرض پشت کشو', excelFormula: '=J5-2', substitutedFa: `= ${frontWidth} − 2`, value: backWidth },
    { field: 'backCount', labelFa: 'تعداد پشت کشو', excelFormula: '=J6', substitutedFa: `= ${frontCount}`, value: backCount },
  ];

  return { kind: 'drawer', input, derived: { bodyLength, bodyWidth, bodyCount, frontLength, frontWidth, frontCount, backLength, backWidth, backCount }, parts, audit, warnings };
}

export function emptyDrawer(thickness = 1.6, materialId = 'mdf-white'): DrawerInput {
  return { count: 1, depth: 50, width: 90, height: 50, materialId, thickness };
}
