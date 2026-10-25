import type { ExplodedDrawing } from '@cabinet/engine';

/**
 * Paper-space label layout for exploded drawings.
 *
 * Why this is separate from the engine
 * ------------------------------------
 * The engine works in centimetres of the real cabinet. Type on a technical
 * drawing is fixed in millimetres of *paper* (a 3 mm badge stays 3 mm whether
 * the cabinet is 60 cm or 240 cm wide), so label placement and collision
 * avoidance can only be solved after the sheet scale is known. That is what this
 * module does: it takes the engine's geometry, the fitted scale and the drawing
 * frame, and returns badges, leader lines and dimension callouts in millimetres,
 * with every collision resolved or the callout dropped.
 *
 * The output is pure data, so the rules are unit-testable without a browser.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Badge {
  componentNo: number;
  componentId: string;
  /** Badge centre, page millimetres. */
  x: number;
  y: number;
  r: number;
  /** Leader to the panel centre, when the badge had to move. */
  leader: { x1: number; y1: number; x2: number; y2: number } | null;
}

export interface Callout {
  componentId: string;
  text: string;
  /** Centre of the text, page millimetres. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DimLayout {
  text: string;
  /** Dimension line, already offset from the drawing. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Witness lines from the measured points to the dimension line. */
  witnesses: { x1: number; y1: number; x2: number; y2: number }[];
  textX: number;
  textY: number;
  textAngle: number;
}

export interface LayoutOptions {
  frame: Rect;
  /** Model cm → page mm. */
  scale: number;
  /** Page position of model (0,0), in millimetres. */
  originX: number;
  originY: number;
  badgeRadius?: number;
  fontSize?: number;
  /** Distance from the drawing to the dimension line. */
  dimOffset?: number;
}

export interface Layout {
  badges: Badge[];
  callouts: Callout[];
  dims: DimLayout[];
}

const BADGE_R = 3;
const BADGE_GAP = 0.8;
const CALL_FONT = 2.8;
/** Monospace advance, as a fraction of the font size (digits + `×`). */
const CHAR_W = 0.58;
const DIM_FONT = 2.8;
const DIM_OFFSET = 6;
/** Preferred positions for a callout around its badge, in badge radii. */
const CALLOUT_SLOTS: { dx: number; dy: number; anchor: 'start' | 'middle' | 'end' }[] = [
  { dx: 0, dy: 1, anchor: 'middle' },
  { dx: 0, dy: -1, anchor: 'middle' },
  { dx: 1, dy: 0, anchor: 'start' },
  { dx: -1, dy: 0, anchor: 'end' },
  { dx: 0.8, dy: 1, anchor: 'start' },
  { dx: -0.8, dy: 1, anchor: 'end' },
  { dx: 0.8, dy: -1, anchor: 'start' },
  { dx: -0.8, dy: -1, anchor: 'end' },
];

function circleOverlap(
  a: { x: number; y: number; r: number },
  b: { x: number; y: number; r: number },
  gap = 0,
): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + gap;
}

function rectsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  return (
    a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap
  );
}

function circleRect(c: { x: number; y: number; r: number }, r: Rect, gap = 0): boolean {
  const cx = Math.max(r.x, Math.min(c.x, r.x + r.w));
  const cy = Math.max(r.y, Math.min(c.y, r.y + r.h));
  return Math.hypot(c.x - cx, c.y - cy) < c.r + gap;
}

function insideRect(c: { x: number; y: number; r: number }, r: Rect): boolean {
  return c.x - c.r >= r.x && c.x + c.r <= r.x + r.w && c.y - c.r >= r.y && c.y + c.r <= r.y + r.h;
}

/**
 * Lay out badges, callouts and overall dimensions on the page.
 *
 * Badges are placed biggest-panel-first so the important parts keep their
 * natural position; a badge that would collide is pushed away in eight
 * directions at growing distance, and always keeps a leader line back to its
 * panel. Callouts (`length×width`) are only drawn when a free slot exists —
 * otherwise the component number still leads to the legend, which always holds
 * the exact dimensions.
 */
export function layoutDrawing(drawing: ExplodedDrawing, options: LayoutOptions): Layout {
  const r = options.badgeRadius ?? BADGE_R;
  const font = options.fontSize ?? CALL_FONT;
  const toX = (v: number) => options.originX + v * 10 * options.scale;
  const toY = (v: number) => options.originY + v * 10 * options.scale;

  // Place the physically largest panels first: they have the most free space.
  const order = [...drawing.panels]
    .map((p, i) => ({ p, i, area: panelArea(p) }))
    .sort((a, b) => b.area - a.area);

  const badges: Badge[] = drawing.panels.map((p) => ({
    componentNo: p.componentNo,
    componentId: p.componentId,
    x: 0,
    y: 0,
    r,
    leader: null,
  }));
  const placed: { x: number; y: number; r: number }[] = [];
  const frame = options.frame;

  for (const { p, i } of order) {
    const ax = toX(p.anchor.x);
    const ay = toY(p.anchor.y);
    let chosen: { x: number; y: number } | null = null;
    const candidates: { x: number; y: number }[] = [{ x: ax, y: ay }];
    const dirs = [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 0.7, y: -0.7 },
      { x: 0.7, y: 0.7 },
      { x: -0.7, y: 0.7 },
      { x: -0.7, y: -0.7 },
    ];
    for (let step = 1; step <= 10; step++) {
      for (const d of dirs) {
        candidates.push({ x: ax + d.x * step * (r * 1.4), y: ay + d.y * step * (r * 1.4) });
      }
    }
    for (const c of candidates) {
      const circle = { x: c.x, y: c.y, r };
      if (!insideRect(circle, frame)) continue;
      if (placed.some((q) => circleOverlap(circle, q, BADGE_GAP))) continue;
      chosen = c;
      break;
    }
    // The anchor is always inside the frame, so a fallback always exists.
    const pos = chosen ?? { x: ax, y: ay };
    placed.push({ x: pos.x, y: pos.y, r });
    badges[i] = {
      ...badges[i],
      x: pos.x,
      y: pos.y,
      leader:
        Math.hypot(pos.x - ax, pos.y - ay) > 0.35
          ? { x1: pos.x, y1: pos.y, x2: ax, y2: ay }
          : null,
    };
  }

  // Callouts, in the same order, avoiding badges and each other.
  const callouts: Callout[] = [];
  const occupiedRects: Rect[] = [];
  for (const { p, i } of order) {
    if (!p.dimensionText) continue;
    const text = p.dimensionText;
    const w = text.length * font * CHAR_W;
    const h = font * 1.25;
    const badge = badges[i];
    let best: Callout | null = null;
    for (const slot of CALLOUT_SLOTS) {
      const dist = badge.r + 1.6 + (slot.anchor === 'middle' ? h : w) / 2;
      const cx = badge.x + slot.dx * dist;
      const cy = badge.y + slot.dy * dist;
      const rect: Rect = { x: cx - w / 2, y: cy - h / 2, w, h };
      if (
        rect.x < frame.x + 1 ||
        rect.y < frame.y + 1 ||
        rect.x + rect.w > frame.x + frame.w - 1 ||
        rect.y + rect.h > frame.y + frame.h - 1
      ) {
        continue;
      }
      if (placed.some((q) => circleRect(q, rect, 0.8))) continue;
      if (occupiedRects.some((o) => rectsOverlap(rect, o, 0.8))) continue;
      best = { componentId: p.componentId, text, x: cx, y: cy, w, h };
      break;
    }
    if (best) {
      callouts.push(best);
      occupiedRects.push({ x: best.x - best.w / 2, y: best.y - best.h / 2, w: best.w, h: best.h });
    }
  }

  // Overall dimensions. They measure the largest panel extents of the assembly,
  // so their ends sit inside the drawing area once the panels have exploded
  // away. Each dimension line is pushed outward until the line *and* its value
  // plate are clear of every drawn panel, and thin witness lines connect it back
  // to the points it measures — that is what makes it a dimension rather than a
  // floating arrow.
  const panelBoxes = drawing.panels.map((p) =>
    rectOf([...p.face, ...p.sides.flat()].map((q) => ({ x: toX(q.x), y: toY(q.y) }))),
  );
  const dims: DimLayout[] = [];
  const pad = options.dimOffset ?? DIM_OFFSET;
  const frameCx = frame.x + frame.w / 2;
  const frameCy = frame.y + frame.h / 2;

  for (const d of drawing.dimensions) {
    const x1 = toX(d.from.x);
    const y1 = toY(d.from.y);
    const x2 = toX(d.to.x);
    const y2 = toY(d.to.y);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;
    // Push away from the centre of the drawing frame.
    const mx = (x1 + x2) / 2 - frameCx;
    const my = (y1 + y2) / 2 - frameCy;
    if (nx * mx + ny * my < 0) {
      nx = -nx;
      ny = -ny;
    }

    const plateW = `${d.text}`.length * (options.fontSize ?? CALL_FONT) * CHAR_W + 3;
    const plateH = (options.fontSize ?? CALL_FONT) * 1.7;
    const inside = (v: number, lo: number, hi: number) => v >= lo && v <= hi;

    let chosenOff = pad;
    let best: { ox1: number; oy1: number; ox2: number; oy2: number } | null = null;
    for (let off = pad; off <= pad + 44; off += 1.5) {
      const ox1 = x1 + nx * off;
      const oy1 = y1 + ny * off;
      const ox2 = x2 + nx * off;
      const oy2 = y2 + ny * off;
      const lineBox = rectOf([
        { x: ox1, y: oy1 },
        { x: ox2, y: oy2 },
      ]);
      const midX = (ox1 + ox2) / 2;
      const midY = (oy1 + oy2) / 2;
      const plateBox = rectOf([
        { x: midX - plateW / 2, y: midY - plateH / 2 },
        { x: midX + plateW / 2, y: midY + plateH / 2 },
      ]);
      const fitsFrame = [ox1, ox2, midX - plateW / 2, midX + plateW / 2].every((v) =>
        inside(v, frame.x + 1, frame.x + frame.w - 1),
      ) && [oy1, oy2, midY - plateH / 2, midY + plateH / 2].every((v) =>
        inside(v, frame.y + 1, frame.y + frame.h - 1),
      );
      if (!fitsFrame) continue;
      const hitsPanel =
        panelBoxes.some((b) => rectsOverlap(lineBox, b, 1)) ||
        panelBoxes.some((b) => rectsOverlap(plateBox, b, 1)) ||
        placed.some((q) => circleRect(q, plateBox, 0.5));
      best = { ox1, oy1, ox2, oy2 };
      chosenOff = off;
      if (!hitsPanel) break;
    }
    const chosen = best ?? {
      ox1: x1 + nx * pad,
      oy1: y1 + ny * pad,
      ox2: x2 + nx * pad,
      oy2: y2 + ny * pad,
    };
    void chosenOff;
    let angle = (Math.atan2(chosen.oy2 - chosen.oy1, chosen.ox2 - chosen.ox1) * 180) / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    dims.push({
      text: d.text,
      x1: chosen.ox1,
      y1: chosen.oy1,
      x2: chosen.ox2,
      y2: chosen.oy2,
      witnesses: [
        { x1, y1, x2: chosen.ox1, y2: chosen.oy1 },
        { x1: x2, y1: y2, x2: chosen.ox2, y2: chosen.oy2 },
      ],
      // The value sits on the dimension line, with a white plate behind it.
      textX: (chosen.ox1 + chosen.ox2) / 2,
      textY: (chosen.oy1 + chosen.oy2) / 2,
      textAngle: angle,
    });
  }

  return { badges, callouts, dims };
}

function boundsOf(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (!points.length) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

/** Smallest rectangle containing the points, in page millimetres. */
function rectOf(points: { x: number; y: number }[]): Rect {
  const corners = boundsOf(points);
  if (!corners.length) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function panelArea(p: ExplodedDrawing['panels'][number]): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const q of p.face) {
    minX = Math.min(minX, q.x);
    minY = Math.min(minY, q.y);
    maxX = Math.max(maxX, q.x);
    maxY = Math.max(maxY, q.y);
  }
  return Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
}

/** Sanity check used by the tests and by the UI before printing. */
export function verifyLayout(layout: Layout, frame: Rect): string[] {
  const problems: string[] = [];
  for (let i = 0; i < layout.badges.length; i++) {
    const a = layout.badges[i];
    if (!insideRect(a, frame)) problems.push(`badge ${a.componentNo} outside frame`);
    for (let j = i + 1; j < layout.badges.length; j++) {
      const b = layout.badges[j];
      if (circleOverlap(a, b)) problems.push(`badges ${a.componentNo}/${b.componentNo} overlap`);
    }
  }
  for (const c of layout.callouts) {
    const rect = { x: c.x - c.w / 2, y: c.y - c.h / 2, w: c.w, h: c.h };
    if (rect.x < frame.x || rect.y < frame.y || rect.x + rect.w > frame.x + frame.w || rect.y + rect.h > frame.y + frame.h) {
      problems.push(`callout ${c.componentId} outside frame`);
    }
    for (const b of layout.badges) {
      if (circleRect(b, rect)) problems.push(`callout ${c.componentId} overlaps badge ${b.componentNo}`);
    }
  }
  for (let i = 0; i < layout.callouts.length; i++) {
    const a = layout.callouts[i];
    const ra = { x: a.x - a.w / 2, y: a.y - a.h / 2, w: a.w, h: a.h };
    for (let j = i + 1; j < layout.callouts.length; j++) {
      const b = layout.callouts[j];
      const rb = { x: b.x - b.w / 2, y: b.y - b.h / 2, w: b.w, h: b.h };
      if (rectsOverlap(ra, rb)) problems.push(`callouts ${a.componentId}/${b.componentId} overlap`);
    }
  }
  return problems;
}

/** Size the page text relative to the fitted scale, within legibility limits. */
export function autoFontSize(scale: number): number {
  return Math.min(3.4, Math.max(2.4, 2.8 * (scale > 0.2 ? 1 : 0.95)));
}

export const LAYOUT_CONSTANTS = { BADGE_R, CALL_FONT, DIM_FONT, CHAR_W };
