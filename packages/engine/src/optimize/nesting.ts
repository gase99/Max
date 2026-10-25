/**
 * Sheet layout optimisation (2D bin packing) — guillotine variant.
 *
 * WHAT THIS IS
 *   A deterministic *guillotine* packer: every sheet is progressively split by
 *   straight cuts that run edge-to-edge, which is what a panel saw does.
 *   Algorithm: first-fit-decreasing on the longest edge, then best-area-fit into
 *   the current free-rectangle list, splitting each used rectangle into a right
 *   and a top remainder (guillotine split).
 *
 * WHAT THIS IS NOT
 *   - It does **not** guarantee an optimal layout. Bin packing is NP-hard.
 *   - It is not a CNC nesting post-processor. A "machine-ready" plan additionally
 *     needs tool-radius compensation, lead-in/out, hold-down tabs, offcut
 *     labelling and machine-specific post-processing. Those are explicitly out of
 *     scope for this module and the UI labels the result "theoretical".
 *
 * KERF MODEL
 *   Every separation between a placed part and remaining material consumes
 *   `kerf` (saw blade width). The packer is conservative: it reserves kerf on
 *   each guillotine split, including where the cut lands on the sheet edge.
 *   This can only under-utilise, never over-commit, a sheet.
 */

export interface NestPart {
  /** Unique id of the cutting-list row. */
  id: string;
  label: string;
  /** Length (cm) — long edge. */
  length: number;
  /** Width (cm). */
  width: number;
  qty: number;
  /** Grain direction required by the material. */
  grain: boolean;
}

export interface NestSheetSpec {
  /** Sheet length along the Y axis (cm). */
  length: number;
  /** Sheet width along the X axis (cm). */
  width: number;
}

export interface NestOptions {
  /** Saw blade width (cm). 0.4 = 4 mm. */
  kerf: number;
  /** Trimming allowance removed from every sheet edge (cm). */
  trim: number;
  /** Allow rotating a part 90° (ignored when the part has grain). */
  allowRotation: boolean;
}

export interface Placement {
  partId: string;
  label: string;
  /** Origin, top-left, in cm from the sheet's top-left. */
  x: number;
  y: number;
  /** Placed size in cm. */
  w: number;
  h: number;
  rotated: boolean;
}

export interface SheetLayout {
  index: number;
  /** Usable area after trimming (cm²). */
  usableArea: number;
  /** Area covered by parts (cm²). */
  usedArea: number;
  /** usedArea / usableArea. */
  utilisation: number;
  placements: Placement[];
}

export interface NestResult {
  sheets: SheetLayout[];
  sheetCount: number;
  totalPartArea: number;
  totalSheetArea: number;
  utilisation: number;
  wasteArea: number;
  wastePercent: number;
  /** Parts that could not be placed on any sheet (too big for the stock). */
  unplaced: { partId: string; label: string; reasonFa: string }[];
  /** True when the layout is a theoretical optimisation, not machine-ready. */
  theoretical: true;
  notesFa: string[];
}

interface FreeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Bin {
  layout: SheetLayout;
  free: FreeRect[];
}

const EPS = 1e-9;

function fits(rect: FreeRect, w: number, h: number): boolean {
  return w <= rect.w + EPS && h <= rect.h + EPS;
}

/**
 * Guillotine split of `rect` after placing a `w × h` part at its origin.
 * Returns at most two remainders, each already kerf-adjusted.
 *
 * CRITICAL: the two remainders must never overlap. There are only two valid
 * guillotine splits, and the choice between them decides how much usable area
 * survives:
 *
 *   A) right remainder keeps FULL height, top remainder covers only the
 *      part's width  -> `right = [x+w+k, x+W] × [y, y+H]`, `top = [x, x+w] × [y+h+k, y+H]`
 *   B) top remainder keeps FULL width, right remainder covers only the
 *      part's height -> `right = [x+w+k, x+W] × [y, y+h]`, `top = [x, x+W] × [y+h+k, y+H]`
 *
 * Emitting "right with full height" *and* "top with full width" (the naive
 * version) double-counts the top-right corner and produces overlapping parts.
 *
 * Heuristic: keep the remainder that is larger in the direction that still has
 * room, which measurably reduces sheet count on real cutting lists.
 */
function splitGuillotine(rect: FreeRect, w: number, h: number, kerf: number): FreeRect[] {
  const rightWidth = rect.w - w - kerf;
  const topHeight = rect.h - h - kerf;
  const hasRight = rightWidth > EPS;
  const hasTop = topHeight > EPS;
  const out: FreeRect[] = [];

  if (hasRight && hasTop) {
    if (rightWidth >= topHeight) {
      // A) right keeps full height; top only over the part's width
      out.push({ x: rect.x + w + kerf, y: rect.y, w: rightWidth, h: rect.h });
      out.push({ x: rect.x, y: rect.y + h + kerf, w: w, h: topHeight });
    } else {
      // B) top keeps full width; right only over the part's height
      out.push({ x: rect.x + w + kerf, y: rect.y, w: rightWidth, h: h });
      out.push({ x: rect.x, y: rect.y + h + kerf, w: rect.w, h: topHeight });
    }
  } else if (hasRight) {
    out.push({ x: rect.x + w + kerf, y: rect.y, w: rightWidth, h: rect.h });
  } else if (hasTop) {
    out.push({ x: rect.x, y: rect.y + h + kerf, w: rect.w, h: topHeight });
  }
  return out;
}

export function nest(
  parts: NestPart[],
  sheet: NestSheetSpec,
  options: NestOptions,
): NestResult {
  const kerf = Math.max(0, options.kerf);
  const trim = Math.max(0, options.trim);
  const usableW = sheet.width - trim * 2;
  const usableH = sheet.length - trim * 2;
  const usableArea = usableW * usableH;

  const unplaced: NestResult['unplaced'] = [];
  const notesFa: string[] = [];

  if (!(usableW > 0) || !(usableH > 0)) {
    return {
      sheets: [], sheetCount: 0, totalPartArea: 0, totalSheetArea: 0,
      utilisation: 0, wasteArea: 0, wastePercent: 0, unplaced: [], theoretical: true,
      notesFa: ['ابعاد کاربردی ورق پس از کسر حاشیهٔ برش صفر یا منفی است؛ تنظیمات ورق/حاشیه را اصلاح کنید.'],
    };
  }

  // Expand quantities into individual pieces.
  type Piece = { partId: string; label: string; w: number; h: number; grain: boolean; area: number };
  const pieces: Piece[] = [];
  for (const p of parts) {
    const n = Math.floor(p.qty);
    if (!Number.isFinite(p.length) || !Number.isFinite(p.width) || p.length <= 0 || p.width <= 0) {
      unplaced.push({ partId: p.id, label: p.label, reasonFa: 'ابعاد نامعتبر است (طول یا عرض صفر/منفی).' });
      continue;
    }
    // Normalise so that h is the long edge (matches the sheet's Y axis).
    const long = Math.max(p.length, p.width);
    const short = Math.min(p.length, p.width);

    const fitsAsIs = long <= usableH + EPS && short <= usableW + EPS;
    const fitsRotated = options.allowRotation && !p.grain && long <= usableW + EPS && short <= usableH + EPS;

    if (!fitsAsIs && !fitsRotated) {
      unplaced.push({
        partId: p.id,
        label: p.label,
        reasonFa: `قطعه (${short}×${long} cm) در ورق (${usableW}×${usableH} cm کاربردی) جا نمی‌شود.`,
      });
      continue;
    }
    if (p.grain && !fitsAsIs) {
      unplaced.push({
        partId: p.id,
        label: p.label,
        reasonFa: `قطعه دارای جهت رگه است و تنها در جهت رگهٔ ورق جا می‌شود، اما ابعادش بیشتر از ورق است.`,
      });
      continue;
    }
    for (let i = 0; i < n; i++) {
      pieces.push({ partId: p.id, label: p.label, w: short, h: long, grain: p.grain, area: short * long });
    }
  }

  // Decreasing by longest edge, then by area.
  pieces.sort((a, b) => b.h - a.h || b.area - a.area || a.partId.localeCompare(b.partId));

  const bins: Bin[] = [];
  const newBin = (): Bin => {
    const layout: SheetLayout = {
      index: bins.length,
      usableArea,
      usedArea: 0,
      utilisation: 0,
      placements: [],
    };
    const bin: Bin = { layout, free: [{ x: trim, y: trim, w: usableW, h: usableH }] };
    bins.push(bin);
    return bin;
  };

  for (const piece of pieces) {
    let placed = false;

    for (const bin of bins) {
      // best-area-fit over the free list
      let bestIdx = -1;
      let bestRotated = false;
      let bestScore = Infinity;

      for (let i = 0; i < bin.free.length; i++) {
        const r = bin.free[i];
        const canStraight = fits(r, piece.w, piece.h);
        const canRotate = options.allowRotation && !piece.grain && fits(r, piece.h, piece.w);
        if (canStraight) {
          const score = r.w * r.h - piece.area;
          if (score < bestScore) { bestScore = score; bestIdx = i; bestRotated = false; }
        }
        if (canRotate) {
          const score = r.w * r.h - piece.area;
          // Prefer non-rotated when scores tie.
          if (score < bestScore - EPS) { bestScore = score; bestIdx = i; bestRotated = true; }
        }
      }

      if (bestIdx === -1) continue;

      const rect = bin.free[bestIdx];
      const w = bestRotated ? piece.h : piece.w;
      const h = bestRotated ? piece.w : piece.h;

      bin.free.splice(bestIdx, 1, ...splitGuillotine(rect, w, h, kerf));
      bin.layout.placements.push({
        partId: piece.partId,
        label: piece.label,
        x: rect.x,
        y: rect.y,
        w,
        h,
        rotated: bestRotated,
      });
      bin.layout.usedArea += piece.area;
      placed = true;
      break;
    }

    if (!placed) {
      const bin = newBin();
      const rect = bin.free[0];
      const w = piece.w;
      const h = piece.h;
      bin.free.splice(0, 1, ...splitGuillotine(rect, w, h, kerf));
      bin.layout.placements.push({ partId: piece.partId, label: piece.label, x: rect.x, y: rect.y, w, h, rotated: false });
      bin.layout.usedArea += piece.area;
    }
  }

  for (const bin of bins) {
    bin.layout.utilisation = usableArea > 0 ? bin.layout.usedArea / usableArea : 0;
  }

  const sheetArea = sheet.width * sheet.length;
  const totalPartArea = bins.reduce((s, b) => s + b.layout.usedArea, 0);
  const totalSheetArea = bins.length * sheetArea;
  const utilisation = totalSheetArea > 0 ? totalPartArea / totalSheetArea : 0;
  const wasteArea = Math.max(0, totalSheetArea - totalPartArea);

  if (options.kerf <= 0) {
    notesFa.push('ضخامت تیغه (kerf) صفر تنظیم شده است؛ نتیجه بهینه‌تر از واقعیت به نظر می‌رسد.');
  }
  notesFa.push(
    'این چیدمان «تئوریک» است: الگوریتم حریصانه (guillotine greedy) است و بهینه بودن مطلق را تضمین نمی‌کند.',
  );

  return {
    sheets: bins.map((b) => b.layout),
    sheetCount: bins.length,
    totalPartArea,
    totalSheetArea,
    utilisation,
    wasteArea,
    wastePercent: totalSheetArea > 0 ? (wasteArea / totalSheetArea) * 100 : 0,
    unplaced,
    theoretical: true,
    notesFa,
  };
}
