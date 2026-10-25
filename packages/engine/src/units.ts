/**
 * Units.
 *
 * IMPORTANT — the workbook `analiz pro.2.xlsx` works in **centimetres**.
 * Every literal in the original formulas (3.2, 1.6, 0.8, 0.2, 3, 2, 4, 5, 9.1)
 * is a centimetre value: 1.6 cm = 16 mm board thickness, 0.2 cm = 2 mm door gap,
 * 3.2 cm = two 16 mm panels. See docs/01-technical-audit.md.
 *
 * The calculation engine therefore computes in centimetres, reproducing Excel's
 * arithmetic exactly (same operations, same order). Conversion happens only at
 * the UI / export boundary.
 */

/** Workbook-native unit is the centimetre. */
export type Length = number;

export const CM_PER_MM = 0.1;
export const MM_PER_CM = 10;

export function cmToMm(cm: Length): number {
  return cm * MM_PER_CM;
}

export function mmToCm(mm: number): Length {
  return mm * CM_PER_MM;
}

/** A part area in cm² -> m². */
export function cm2ToM2(areaCm2: number): number {
  return areaCm2 / 10000;
}

export type DisplayUnit = 'mm' | 'cm';

export function convertForDisplay(cm: Length, unit: DisplayUnit): number {
  return unit === 'mm' ? cmToMm(cm) : cm;
}

export function convertFromDisplay(value: number, unit: DisplayUnit): Length {
  return unit === 'mm' ? mmToCm(value) : value;
}

/**
 * Format a length for display. Keeps up to `decimals` places, trims trailing
 * zeros, and never applies production rounding (see rounding.ts for that).
 */
export function formatLength(
  cm: Length,
  unit: DisplayUnit = 'mm',
  decimals = 1,
): string {
  if (!Number.isFinite(cm)) return '—';
  const v = convertForDisplay(cm, unit);
  const fixed = v.toFixed(decimals);
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}
