import { useMemo } from 'react';
import {
  buildCuttingList,
  buildCostBreakdown,
  calculateDrawer,
  calculateGroundCabinet,
  calculateWallCabinet,
  nest,
  summarise,
} from '@cabinet/engine';
import type {
  CuttingListRow,
  CuttingListSummary,
  DrawerInput,
  DrawerResult,
  GroundCabinetInput,
  GroundCabinetResult,
  NestResult,
  WallCabinetInput,
  WallCabinetResult,
} from '@cabinet/engine';
import type { AppSettings, ModuleEntry, Project } from './store.js';

export type ModuleResult = GroundCabinetResult | WallCabinetResult | DrawerResult;

export function computeModule(m: ModuleEntry): ModuleResult {
  switch (m.kind) {
    case 'ground':
      return calculateGroundCabinet(m.input as GroundCabinetInput);
    case 'wall':
      return calculateWallCabinet(m.input as WallCabinetInput);
    case 'drawer':
      return calculateDrawer(m.input as DrawerInput);
  }
}

export interface ProjectComputation {
  results: { module: ModuleEntry; result: ModuleResult }[];
  rows: CuttingListRow[];
  summary: CuttingListSummary;
  warnings: { moduleLabel: string; code: string; messageFa: string; severity: string }[];
  cabinetCount: number;
  moduleCount: number;
}

export function computeProject(
  project: Project | null,
  merge: boolean,
): ProjectComputation {
  if (!project) {
    return {
      results: [],
      rows: [],
      summary: { totalPieces: 0, totalAreaM2: 0, totalEdgeBandM: 0, byMaterial: [] },
      warnings: [],
      cabinetCount: 0,
      moduleCount: 0,
    };
  }

  const results = project.modules.map((module) => ({ module, result: computeModule(module) }));
  const rows = buildCuttingList(
    results.map(({ module, result }) => ({
      id: module.id,
      label: module.label,
      kind: module.kind,
      quantity: module.quantity,
      parts: result.parts,
    })),
    { mergeAcrossModules: merge },
  );
  const summary = summarise(rows);
  const warnings = results.flatMap(({ module, result }) =>
    result.warnings
      .filter((w) => w.severity !== 'info')
      .map((w) => ({
        moduleLabel: module.label,
        code: w.code,
        messageFa: w.messageFa,
        severity: w.severity,
      })),
  );
  const cabinetCount = project.modules.reduce((s, m) => s + (m.quantity || 0), 0);

  return { results, rows, summary, warnings, cabinetCount, moduleCount: project.modules.length };
}

export function useProjectComputation(project: Project | null, merge: boolean) {
  return useMemo(() => computeProject(project, merge), [project, merge]);
}

/** Run nesting for every material/thickness group. */
export function runOptimisation(
  rows: CuttingListRow[],
  settings: AppSettings,
): { byGroup: { key: string; materialId: string; thickness: number; result: NestResult }[]; sheetCounts: Map<string, number> } {
  const groups = new Map<string, CuttingListRow[]>();
  for (const r of rows) {
    const k = `${r.materialId}@${r.thickness}`;
    const arr = groups.get(k);
    if (arr) arr.push(r);
    else groups.set(k, [r]);
  }

  const sheetCounts = new Map<string, number>();
  const byGroup: { key: string; materialId: string; thickness: number; result: NestResult }[] = [];

  for (const [key, list] of groups) {
    const first = list[0];
    const material = settings.materials.find((m) => m.id === first.materialId);
    // Sheet size comes from the material profile when defined, else the workshop default.
    const sheet = material
      ? { length: material.sheetHeight, width: material.sheetWidth }
      : { length: settings.sheet.height, width: settings.sheet.width };

    const result = nest(
      list.map((r) => ({
        id: r.key,
        label: `${r.nameFa} ${r.moduleLabel}`,
        length: r.length,
        width: r.width,
        qty: r.qty,
        grain: material?.grain ?? false,
      })),
      sheet,
      {
        kerf: settings.sheet.kerf,
        trim: settings.sheet.trim,
        allowRotation: settings.sheet.allowRotation,
      },
    );
    sheetCounts.set(key, result.sheetCount);
    byGroup.push({ key, materialId: first.materialId, thickness: first.thickness, result });
  }

  return { byGroup, sheetCounts };
}

export function computeCosting(
  computation: ProjectComputation,
  settings: AppSettings,
  sheetCounts?: Map<string, number>,
) {
  const edgeBandPrice =
    settings.edgeBands.length > 0
      ? settings.edgeBands.reduce((s, b) => s + b.pricePerMeter, 0) / settings.edgeBands.length
      : 0;

  return buildCostBreakdown({
    rows: computation.rows,
    summary: computation.summary,
    materials: settings.materials,
    settings: settings.pricing,
    hardware: [],
    cabinetCount: computation.cabinetCount,
    edgeBandPricePerMeter: edgeBandPrice,
    optimisedSheetCounts: sheetCounts,
  });
}
