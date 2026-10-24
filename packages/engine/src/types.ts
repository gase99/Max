/**
 * Types for Cabinet Analysis Pro.
 * All lengths are CENTIMETRES (workbook-native) unless the name says otherwise.
 */

export type CabinetKind = 'ground' | 'wall';

export type UnitSystem = 'mm' | 'cm';

/* ------------------------------------------------------------------ */
/*  Legacy (workbook) inputs and outputs                              */
/* ------------------------------------------------------------------ */

/** Door-width tiers used by the workbook's IF() chain. */
export interface DoorTierResult {
  width: number | '';
  count: number | '';
}

export interface EdgeFlags {
  /** Edge banding on the two width edges ("نوار عرض"). */
  widthEdge: boolean;
  /** Edge banding on the two length edges ("نوار طول"). */
  lengthEdge: boolean;
}

/** One produced panel/part of a cabinet. */
export interface PanelPart {
  /** Stable id, e.g. `G3-body`. */
  id: string;
  /** Persian display name. */
  nameFa: string;
  /** English display name. */
  nameEn: string;
  /** Part role used for grouping / drawing. */
  role: PartRole;
  /** Dimension along the grain-free axis ("عرض"). */
  width: number;
  /** Dimension along the long axis ("طول"). */
  length: number;
  /** Quantity of this panel in the unit. */
  count: number;
  /** Which edges get banding. */
  edges: EdgeFlags;
  /** Board thickness (cm), from the material profile. */
  thickness: number;
  /** Material / decor id. */
  materialId: string;
  /** Where the dimension came from — an audit trail. */
  source: PartSource;
}

export type PartRole =
  | 'base' // کف
  | 'body' // بدنه
  | 'top' // تاق
  | 'shelf' // طبقه
  | 'rail' // قید
  | 'back' // فیبر ۳ میل
  | 'door' // درب
  | 'drawer-body' // بدنه کشو
  | 'drawer-front' // جلو کشو
  | 'drawer-back'; // پشت کشو

/** Provenance of a computed dimension. */
export interface PartSource {
  /** Which rule produced it. */
  rule: 'legacy' | 'custom';
  /** Human readable formula, Persian. */
  formulaFa: string;
  /** Numeric substitutions for the formula, Persian. */
  detailFa: string;
}

/* ------------------------------------------------------------------ */
/*  Ground cabinet (کابینت زمینی)                                      */
/* ------------------------------------------------------------------ */

export interface GroundCabinetInput {
  /** B — unit width ("عرض کابینت"), drives every derived length. */
  width: number;
  /** کف: عرض (input), count. */
  baseWidth: number;
  baseCount: number;
  baseEdges: EdgeFlags;
  /** بدنه: عرض + طول (both inputs). */
  bodyWidth: number;
  bodyLength: number;
  bodyCount: number;
  bodyEdges: EdgeFlags;
  /** طبقه: عرض (input). */
  shelfWidth: number;
  shelfCount: number;
  shelfEdges: EdgeFlags;
  /** قید: عرض (input). */
  railWidth: number;
  railCount: number;
  railEdges: EdgeFlags;
  /** درب: ارتفاع (input). */
  doorHeight: number;
  /** فیبر ۳ میل: تعداد (input). */
  backCount: number;
  /** Material + thickness used for this unit. */
  materialId: string;
  thickness: number;
  /** Optional label, e.g. "کابینت زیر سینک". */
  label?: string;
}

export interface GroundCabinetResult {
  kind: 'ground';
  input: GroundCabinetInput;
  /** Derived lengths, exactly as the workbook computes them. */
  derived: {
    baseLength: number; // = width
    shelfLength: number; // = width - 3.2
    railLength: number; // = width - 3.2
    backWidth: number; // = baseLength - 1.6
    backLength: number; // = bodyLength + 1.6 - 0.8
    doorWidth: number | '';
    doorCount: number | '';
  };
  /** Ordered panel parts with counts already expanded. */
  parts: PanelPart[];
  /** Formula audit trail, Persian. */
  audit: FormulaAuditEntry[];
  warnings: ValidationIssue[];
}

/* ------------------------------------------------------------------ */
/*  Wall cabinet (کابینت هوایی)                                        */
/* ------------------------------------------------------------------ */

export interface WallCabinetInput {
  width: number;
  bodyWidth: number;
  bodyLength: number;
  bodyCount: number;
  bodyEdges: EdgeFlags;
  baseWidth: number;
  baseCount: number;
  baseEdges: EdgeFlags;
  topCount: number;
  topEdges: EdgeFlags;
  shelfCount: number;
  shelfEdges: EdgeFlags;
  railWidth: number;
  railCount: number;
  railEdges: EdgeFlags;
  doorHeight: number;
  backCount: number;
  materialId: string;
  thickness: number;
  label?: string;
}

export interface WallCabinetResult {
  kind: 'wall';
  input: WallCabinetInput;
  derived: {
    baseLength: number; // = width - 3.2
    topWidth: number; // = bodyWidth - 2
    topLength: number; // = width - 3.2
    shelfWidth: number; // = baseWidth - 3
    shelfLength: number; // = baseLength
    railLength: number; // = width - 3.2
    backWidth: number; // = (width - 3.2) + 1.6
    backLength: number; // = bodyLength - 0.8
    doorWidth: number | '';
    doorCount: number | '';
  };
  parts: PanelPart[];
  audit: FormulaAuditEntry[];
  warnings: ValidationIssue[];
}

/* ------------------------------------------------------------------ */
/*  Drawer (کشو)                                                       */
/* ------------------------------------------------------------------ */

export interface DrawerInput {
  count: number;
  /** عمق — cm */
  depth: number;
  /** عرض — cm */
  width: number;
  /** ارتفاع — cm */
  height: number;
  materialId: string;
  thickness: number;
  label?: string;
}

export interface DrawerResult {
  kind: 'drawer';
  input: DrawerInput;
  derived: {
    bodyLength: number; // = depth - 5
    bodyWidth: number; // = height / 3 - 4
    bodyCount: number; // = count * 2
    frontLength: number; // = width - 9.1
    frontWidth: number; // = bodyWidth
    frontCount: number; // = count
    backLength: number; // = frontLength
    backWidth: number; // = frontWidth - 2
    backCount: number; // = count
  };
  parts: PanelPart[];
  audit: FormulaAuditEntry[];
  warnings: ValidationIssue[];
}

/* ------------------------------------------------------------------ */
/*  Audit trail & validation                                          */
/* ------------------------------------------------------------------ */

export interface FormulaAuditEntry {
  /** Output field name. */
  field: string;
  /** Persian label of the output. */
  labelFa: string;
  /** The original Excel formula, verbatim. */
  excelFormula: string;
  /** Substituted with the actual numbers. */
  substitutedFa: string;
  /** The computed result. */
  value: number | '';
}

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  severity: IssueSeverity;
  /** Machine code for tests. */
  code: string;
  field?: string;
  messageFa: string;
  messageEn: string;
}

/* ------------------------------------------------------------------ */
/*  Materials, hardware, pricing                                      */
/* ------------------------------------------------------------------ */

export interface Material {
  id: string;
  nameFa: string;
  nameEn: string;
  /** Board thickness in cm (1.6 = 16 mm). */
  thickness: number;
  /** Sheet size in cm. */
  sheetWidth: number;
  sheetHeight: number;
  /** Price per sheet, in the configured currency. */
  pricePerSheet: number;
  /** Decor / colour name. */
  decor?: string;
  /** If true, grain direction must be respected during nesting. */
  grain: boolean;
  /** Colour used when drawing the material. */
  color?: string;
}

export interface EdgeBand {
  id: string;
  nameFa: string;
  /** Thickness in cm (0.2 = 2 mm). */
  thickness: number;
  /** Price per metre. */
  pricePerMeter: number;
}

export interface HardwareItem {
  id: string;
  nameFa: string;
  nameEn: string;
  unit: 'pcs' | 'm' | 'set' | 'kg';
  unitPrice: number;
}

export interface LaborOperation {
  id: string;
  nameFa: string;
  /** Charged per produced part, per cabinet, or per m² of board. */
  basis: 'per-part' | 'per-cabinet' | 'per-m2';
  rate: number;
}

export interface PricingSettings {
  currency: string;
  /** Waste allowance applied to board consumption, e.g. 0.1 = 10 %. */
  wasteFactor: number;
  edgeBandWasteFactor: number;
  labor: LaborOperation[];
  transport: number;
  installation: number;
  /** Markup applied to cost to get the quote price. 0.35 = 35 %. */
  markup: number;
  /** Sales tax / VAT. */
  taxRate: number;
}
