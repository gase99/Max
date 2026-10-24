import type { CuttingListRow, CuttingListSummary } from './cuttingList.js';
import type { Material, PricingSettings } from './types.js';

/**
 * Costing.
 *
 * Every number here is derived from user-supplied prices. No market price is
 * baked into the code — the defaults in `defaultMaterials()` are examples and
 * are labelled as such in the UI so nobody mistakes them for market data.
 */

export interface BoardConsumption {
  materialId: string;
  thickness: number;
  /** Required part area in m² (no waste). */
  partAreaM2: number;
  /** Area including the waste allowance. */
  grossAreaM2: number;
  sheetAreaM2: number;
  /** Sheets from the optimisation, when available. */
  optimisedSheets?: number;
  /** Sheets from area + waste allowance (fallback / cross-check). */
  estimatedSheets: number;
  sheetsUsed: number;
  /** Which method produced `sheetsUsed`. */
  method: 'optimiser' | 'area';
  pricePerSheet: number;
  cost: number;
}

export interface EdgeBandConsumption {
  totalMeters: number;
  grossMeters: number;
  pricePerMeter: number;
  cost: number;
}

export interface CostBreakdown {
  boards: BoardConsumption[];
  boardCost: number;
  edgeBand: EdgeBandConsumption;
  hardwareCost: number;
  laborCost: number;
  transport: number;
  installation: number;
  subtotal: number;
  wasteCostIncluded: number;
  totalCost: number;
  markup: number;
  priceBeforeTax: number;
  tax: number;
  quotePrice: number;
  profit: number;
  marginPercent: number;
  currency: string;
  notesFa: string[];
}

export interface HardwareRequirement {
  itemId: string;
  qty: number;
  unitPrice: number;
  cost: number;
}

export interface LaborInputs {
  partCount: number;
  cabinetCount: number;
  areaM2: number;
}

export function computeBoardConsumption(
  summary: CuttingListSummary,
  materials: Material[],
  wasteFactor: number,
  optimised?: Map<string, number>,
): BoardConsumption[] {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const out: BoardConsumption[] = [];

  for (const g of summary.byMaterial) {
    const mat = byId.get(g.materialId);
    const sheetAreaM2 = mat ? (mat.sheetWidth * mat.sheetHeight) / 10000 : 2.44 * 1.83;
    const pricePerSheet = mat?.pricePerSheet ?? 0;
    const grossAreaM2 = g.areaM2 * (1 + Math.max(0, wasteFactor));
    const estimatedSheets = Math.ceil(grossAreaM2 / sheetAreaM2 - 1e-9);
    const key = `${g.materialId}@${g.thickness}`;
    const optimisedSheets = optimised?.get(key);
    const sheetsUsed = optimisedSheets !== undefined ? optimisedSheets : estimatedSheets;

    out.push({
      materialId: g.materialId,
      thickness: g.thickness,
      partAreaM2: g.areaM2,
      grossAreaM2,
      sheetAreaM2,
      optimisedSheets,
      estimatedSheets,
      sheetsUsed,
      method: optimisedSheets !== undefined ? 'optimiser' : 'area',
      pricePerSheet,
      cost: sheetsUsed * pricePerSheet,
    });
  }
  return out;
}

export function computeHardwareCost(reqs: HardwareRequirement[]): number {
  return reqs.reduce((s, r) => s + r.qty * r.unitPrice, 0);
}

export function computeLaborCost(
  settings: PricingSettings,
  inputs: LaborInputs,
): number {
  let total = 0;
  for (const op of settings.labor) {
    switch (op.basis) {
      case 'per-part':
        total += op.rate * inputs.partCount;
        break;
      case 'per-cabinet':
        total += op.rate * inputs.cabinetCount;
        break;
      case 'per-m2':
        total += op.rate * inputs.areaM2;
        break;
    }
  }
  return total;
}

export function buildCostBreakdown(args: {
  rows: CuttingListRow[];
  summary: CuttingListSummary;
  materials: Material[];
  settings: PricingSettings;
  hardware: HardwareRequirement[];
  cabinetCount: number;
  edgeBandPricePerMeter: number;
  optimisedSheetCounts?: Map<string, number>;
}): CostBreakdown {
  const { summary, materials, settings, hardware, cabinetCount } = args;
  const notesFa: string[] = [];

  const boards = computeBoardConsumption(summary, materials, settings.wasteFactor, args.optimisedSheetCounts);
  const boardCost = boards.reduce((s, b) => s + b.cost, 0);

  const band = summary.totalEdgeBandM * (1 + Math.max(0, settings.edgeBandWasteFactor));
  const edgeBand: EdgeBandConsumption = {
    totalMeters: summary.totalEdgeBandM,
    grossMeters: band,
    pricePerMeter: args.edgeBandPricePerMeter,
    cost: band * args.edgeBandPricePerMeter,
  };

  const hardwareCost = computeHardwareCost(hardware);
  const laborCost = computeLaborCost(settings, {
    partCount: summary.totalPieces,
    cabinetCount,
    areaM2: summary.totalAreaM2,
  });

  const subtotal = boardCost + edgeBand.cost + hardwareCost + laborCost + settings.transport + settings.installation;
  const wasteCostIncluded = boards.reduce(
    (s, b) => s + (b.sheetsUsed * b.sheetAreaM2 - b.partAreaM2) * (b.sheetAreaM2 > 0 ? b.pricePerSheet / b.sheetAreaM2 : 0),
    0,
  );

  const markup = Math.max(0, settings.markup);
  const priceBeforeTax = subtotal * (1 + markup);
  const tax = priceBeforeTax * Math.max(0, settings.taxRate);
  const quotePrice = priceBeforeTax + tax;
  const profit = priceBeforeTax - subtotal;
  const marginPercent = priceBeforeTax > 0 ? (profit / priceBeforeTax) * 100 : 0;

  for (const b of boards) {
    if (b.pricePerSheet <= 0) {
      notesFa.push(`قیمت ورق برای متریال «${b.materialId}» صفر است؛ هزینهٔ تخته در محاسبه لحاظ نشده است.`);
    }
    if (b.method === 'area') {
      notesFa.push(`تعداد ورق متریال «${b.materialId}» از مساحت + ضایعات تخمین زده شده است (بهینه‌سازی ورق اجرا نشده).`);
    }
  }
  notesFa.push('همهٔ قیمت‌ها از تنظیمات کاربر خوانده می‌شوند و «قیمت روز بازار» نیستند.');

  return {
    boards, boardCost, edgeBand, hardwareCost, laborCost,
    transport: settings.transport, installation: settings.installation,
    subtotal, wasteCostIncluded, totalCost: subtotal,
    markup, priceBeforeTax, tax, quotePrice, profit, marginPercent,
    currency: settings.currency, notesFa,
  };
}

/** Example library — clearly marked as placeholder prices in the UI. */
export function defaultMaterials(): Material[] {
  return [
    { id: 'mdf-white', nameFa: 'MDF سفید ۱۶ میلی‌متر', nameEn: 'White MDF 16 mm', thickness: 1.6, sheetWidth: 244, sheetHeight: 183, pricePerSheet: 0, decor: 'سفید ۳۶۶', grain: false, color: '#e8e6e1' },
    { id: 'mdf-cream', nameFa: 'MDF کرم ۱۶ میلی‌متر', nameEn: 'Cream MDF 16 mm', thickness: 1.6, sheetWidth: 244, sheetHeight: 183, pricePerSheet: 0, decor: 'کرم', grain: false, color: '#e6dcc8' },
    { id: 'mdf-18', nameFa: 'MDF سفید ۱۸ میلی‌متر', nameEn: 'White MDF 18 mm', thickness: 1.8, sheetWidth: 244, sheetHeight: 183, pricePerSheet: 0, decor: 'سفید', grain: false, color: '#e8e6e1' },
    { id: 'back-3mm', nameFa: 'فیبر ۳ میلی‌متر', nameEn: 'MDF back 3 mm', thickness: 0.3, sheetWidth: 244, sheetHeight: 183, pricePerSheet: 0, decor: 'فیبر', grain: false, color: '#8a7a5e' },
  ];
}

export function defaultPricingSettings(): PricingSettings {
  return {
    currency: 'تومان',
    wasteFactor: 0.1,
    edgeBandWasteFactor: 0.08,
    labor: [
      { id: 'cut', nameFa: 'برش', basis: 'per-part', rate: 0 },
      { id: 'edge', nameFa: 'نوارچسب', basis: 'per-part', rate: 0 },
      { id: 'assemble', nameFa: 'مونتاژ', basis: 'per-cabinet', rate: 0 },
    ],
    transport: 0,
    installation: 0,
    markup: 0.35,
    taxRate: 0,
  };
}
