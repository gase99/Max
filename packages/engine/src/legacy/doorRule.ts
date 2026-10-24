import {
  DOOR_GAP,
  DOOR_TIER_1_MAX,
  DOOR_TIER_1_MIN,
  DOOR_TIER_2_MAX,
  DOOR_TIER_3_MAX,
} from './constants.js';
import type { DoorTierResult } from '../types.js';
import type { FormulaAuditEntry } from '../types.js';

/** The workbook formula, verbatim, for the audit screen. */
export const DOOR_WIDTH_FORMULA =
  '=IF(AND(B2>=10,B2<=50), B2-0.2, IF(AND(B2>50,B2<=100),B2/2-0.2, IF(AND(B2>100,B2<=150),B2/3-0.2, "")))';

export const DOOR_COUNT_FORMULA =
  '=IF(AND(B2>=10,B2<=50),1,IF(AND(B2>50,B2<=100),2,IF(AND(B2>100,B2<=150),3,"")))';

/**
 * Door width / leaf-count tier rule.
 *
 * | width (cm) | leaves | leaf width      |
 * |------------|--------|-----------------|
 * | 10 … 50    | 1      | W − 0.2         |
 * | 50 … 100   | 2      | W/2 − 0.2       |
 * | 100 … 150  | 3      | W/3 − 0.2       |
 * | otherwise  | ""     | ""              |
 *
 * Note the boundaries are inclusive-exclusive exactly as in Excel:
 * 50 belongs to tier 1, 100 belongs to tier 2, 150 belongs to tier 3.
 * Out-of-range widths yield `''` — the workbook shows an empty cell, not an error.
 */
export function doorTier(width: number): DoorTierResult {
  if (!Number.isFinite(width)) return { width: '', count: '' };
  if (width >= DOOR_TIER_1_MIN && width <= DOOR_TIER_1_MAX) {
    return { width: width - DOOR_GAP, count: 1 };
  }
  if (width > DOOR_TIER_1_MAX && width <= DOOR_TIER_2_MAX) {
    return { width: width / 2 - DOOR_GAP, count: 2 };
  }
  if (width > DOOR_TIER_2_MAX && width <= DOOR_TIER_3_MAX) {
    return { width: width / 3 - DOOR_GAP, count: 3 };
  }
  return { width: '', count: '' };
}

export function doorTierAudit(width: number): FormulaAuditEntry[] {
  const r = doorTier(width);
  const tierText =
    r.count === ''
      ? 'خارج از بازهٔ ۱۰ تا ۱۵۰ سانتی‌متر → خالی'
      : `ردیف ${r.count} لنگه`;
  return [
    {
      field: 'doorWidth',
      labelFa: 'عرض درب',
      excelFormula: DOOR_WIDTH_FORMULA,
      substitutedFa: `عرض ${width} → ${tierText} → ${r.width === '' ? 'خالی' : r.width}`,
      value: r.width,
    },
    {
      field: 'doorCount',
      labelFa: 'تعداد درب',
      excelFormula: DOOR_COUNT_FORMULA,
      substitutedFa: `عرض ${width} → ${tierText}`,
      value: r.count,
    },
  ];
}
