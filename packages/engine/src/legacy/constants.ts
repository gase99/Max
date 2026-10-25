/**
 * Every numeric literal that appears in the original workbook formulas.
 *
 * Source: `analiz pro.2.xlsx`, sheets کابینت زمینی / کابینت هوایی / کشو.
 * Unit: centimetres.
 *
 * These values are NOT tuning knobs for the legacy engine — they are the
 * workbook's hard-coded allowances. Changing them changes the calc result, so
 * they are kept in one place and displayed in the "ممیزی فرمول" screen.
 */

/** Deducted from cabinet width to get an internal (between-panels) length. 3.2 = 2 × 16 mm. */
export const GROUND_WIDTH_ALLOWANCE = 3.2;

/** Deducted from the base-panel length to get the back-panel width. */
export const GROUND_BACK_WIDTH_ALLOWANCE = 1.6;

/** Added to the body length before subtracting the back length allowance. */
export const GROUND_BACK_LENGTH_ADD = 1.6;

/** Subtracted at the end of the ground back-panel length chain. */
export const GROUND_BACK_LENGTH_SUB = 0.8;

export const WALL_WIDTH_ALLOWANCE = 3.2;

/** Deducted from body width for the top ("تاق") panel width. */
export const WALL_TOP_WIDTH_ALLOWANCE = 2;

/** Deducted from base width for the shelf width. */
export const WALL_SHELF_WIDTH_ALLOWANCE = 3;

/** Added to the internal length for the wall back-panel width. */
export const WALL_BACK_WIDTH_ADD = 1.6;

/** Deducted from body length for the wall back-panel length. */
export const WALL_BACK_LENGTH_SUB = 0.8;

/** Door gap per leaf. 0.2 cm = 2 mm. */
export const DOOR_GAP = 0.2;

/** Door-tier thresholds (cm) — exactly the IF() boundaries in the workbook. */
export const DOOR_TIER_1_MIN = 10;
export const DOOR_TIER_1_MAX = 50;
export const DOOR_TIER_2_MAX = 100;
export const DOOR_TIER_3_MAX = 150;

export const DRAWER_DEPTH_ALLOWANCE = 5;
export const DRAWER_HEIGHT_DIVISOR = 3;
export const DRAWER_HEIGHT_ALLOWANCE = 4;
export const DRAWER_FRONT_ALLOWANCE = 9.1;
export const DRAWER_BACK_ALLOWANCE = 2;

/** Default material name found in the workbook's analysis sheets. */
export const LEGACY_MATERIAL_NAME = 'safid366';
export const LEGACY_BACK_MATERIAL_NAME = '3mil';
