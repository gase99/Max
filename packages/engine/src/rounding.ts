/**
 * Rounding.
 *
 * The original workbook applies **no rounding at all** — it keeps full floating
 * point precision (e.g. drawer side width 12.666666666666668 cm). The legacy
 * engine reproduces that faithfully.
 *
 * Workshop / production rounding is therefore a NEW, explicitly opt-in feature.
 * It is never applied to a legacy-calculation result unless the caller asks for
 * it, and results that were rounded are always flagged.
 */

export type RoundingRule =
  /** No rounding — legacy behaviour, full precision. */
  | { mode: 'none' }
  /** Round to the nearest `step` (e.g. 1 mm = 0.1 cm). */
  | { mode: 'nearest'; step: number }
  /** Always round down to `step`. */
  | { mode: 'down'; step: number }
  /** Always round up to `step`. */
  | { mode: 'up'; step: number };

export const NO_ROUNDING: RoundingRule = { mode: 'none' };

export function applyRounding(value: number, rule: RoundingRule): number {
  if (!Number.isFinite(value)) return value;
  if (rule.mode === 'none') return value;
  const step = rule.step;
  if (!Number.isFinite(step) || step <= 0) return value;
  // Work in integer steps to reduce binary floating point drift.
  const eps = 1e-9;
  switch (rule.mode) {
    case 'nearest':
      return Math.round((value + Number.EPSILON) / step) * step;
    case 'down':
      return Math.floor(value / step + eps) * step;
    case 'up':
      return Math.ceil(value / step - eps) * step;
  }
}

/**
 * Excel's ROUND(x, n) — half away from zero. Provided for parity with any
 * spreadsheet comparison, NOT used by the legacy engine.
 */
export function excelRound(value: number, digits = 0): number {
  const f = Math.pow(10, digits);
  const scaled = value * f;
  const rounded =
    scaled >= 0 ? Math.floor(scaled + 0.5) : -Math.floor(-scaled + 0.5);
  return rounded / f;
}

/** Tolerance used when comparing against Excel-computed golden values. */
export const EXCEL_TOLERANCE = 1e-9;

export function approxEqual(a: number, b: number, tol = EXCEL_TOLERANCE): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
}
