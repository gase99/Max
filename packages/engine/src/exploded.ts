import type { PanelPart, PartRole } from './types.js';

/**
 * Exploded technical drawings.
 *
 * IMPORTANT HONESTY RULE
 * ----------------------
 * The workbook gives *panel dimensions*, not assembly geometry: it has no
 * joinery, no drilling, no cabinet skeleton and no assembly coordinates.
 * Therefore:
 *
 *   • Every dimension printed on the drawing (panel L×W×t, cabinet W×H×D) is
 *     data-derived and exact — it comes from the same arrays that build the
 *     cutting list, converted to millimetres.
 *   • The *arrangement* of the panels in space is illustrative: it is a
 *     deterministic presentation of the panel list, NOT a claim about how the
 *     cabinet is actually joined. The drawing says so in its own caption and
 *     the UI repeats it.
 *   • Nothing is invented: no drilling, no dados, no hinge positions, no CNC
 *     operations. If the data cannot place a panel, the drawing reports the
 *     problem instead of drawing a guess.
 *
 * Everything here is pure geometry in centimetres. Rendering (SVG, PDF, DXF)
 * consumes this model, so the tests can prove numbering, dimension consistency,
 * legend mapping and label collision avoidance without a browser.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ExplodeModuleInput {
  id: string;
  /** Persian display label. */
  label: string;
  /** Optional English label; falls back to `label`. */
  labelEn?: string;
  kind: 'ground' | 'wall' | 'drawer';
  quantity: number;
  parts: PanelPart[];
}

export interface MaterialName {
  id: string;
  nameFa: string;
  nameEn: string;
}

export interface ExplodeOptions {
  /**
   * Explosion distance multiplier. 1 = the default spacing between panels.
   * Values below 0.2 are clamped so panels never merge into one blob.
   */
  spread?: number;
  /**
   * Maximum drawn copies of a part with count > 1. The legend always shows the
   * real quantity; when fewer copies are drawn an explicit note says so.
   */
  maxInstancesPerPart?: number;
  /** Material display names for the legend. */
  materials?: MaterialName[];
}

export interface Point {
  x: number;
  y: number;
}

export type ExplodeIssueCode =
  | 'MISSING_DIMENSION'
  | 'MISSING_THICKNESS'
  | 'UNSUPPORTED_GEOMETRY'
  | 'ZERO_QUANTITY'
  | 'TRUNCATED_INSTANCES'
  | 'EMPTY_MODULE';

export interface ExplodeIssue {
  code: ExplodeIssueCode;
  severity: 'warning' | 'info';
  moduleId: string;
  moduleNo: number;
  /** Component number this issue is about, when it is panel-specific. */
  componentNo?: number;
  partId?: string;
  messageFa: string;
  messageEn: string;
}

export interface ExplodedPanel {
  /** 1-based, unique and stable within the drawing. */
  componentNo: number;
  /** Sheet-unique id, e.g. `M1-03`. Stable across regenerations. */
  componentId: string;
  partId: string;
  nameFa: string;
  nameEn: string;
  role: PartRole;
  /** Exact panel dimensions in cm, straight from the engine. */
  length: number;
  width: number;
  thickness: number;
  /** Pieces of this part in the module (before module quantity). */
  count: number;
  /** Total pieces = count × module quantity. */
  totalPieces: number;
  materialId: string;
  materialNameFa: string;
  materialNameEn: string;
  edgeWidthEdge: boolean;
  edgeLengthEdge: boolean;
  /** Projected outline of the board's main face. */
  face: Point[];
  /** Projected side faces that carry the thickness illusion. */
  sides: Point[][];
  /**
   * Preferred position for the component number badge: the centroid of the
   * panel face in drawing coordinates. The renderer may move the badge on
   * paper (and draw a leader) if the paper-space layout needs it; that is a
   * presentation decision and stays out of the model.
   */
  anchor: Point;
  /** Exact `length×width` callout in millimetres, e.g. `768×564`. */
  dimensionText: string;
  /** How far the panel was nudged in the drawing plane to keep panels apart. */
  displayShift: Point;
  /** Whether this instance is drawn although more copies exist. */
  truncated: boolean;
}

export interface ExplodedDimension {
  axis: 'width' | 'height' | 'depth';
  labelFa: string;
  labelEn: string;
  valueCm: number;
  /** The measured extent, in drawing coordinates: exactly the two points the
   *  value describes. The renderer offsets the dimension line away from the
   *  drawing by a fixed paper distance. */
  from: Point;
  to: Point;
  /** Value in millimetres, e.g. `800`. */
  text: string;
}

export interface ExplodedBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface ExplodedDrawing {
  moduleNo: number;
  moduleId: string;
  moduleLabel: string;
  moduleLabelEn: string;
  kind: 'ground' | 'wall' | 'drawer';
  quantity: number;
  /** Cabinet envelope W × H × D in cm, data-derived (0 when unknown). */
  envelope: { widthCm: number; heightCm: number; depthCm: number };
  panels: ExplodedPanel[];
  dimensions: ExplodedDimension[];
  bounds: ExplodedBounds;
  issues: ExplodeIssue[];
}

export interface ExplodedSheet {
  drawings: ExplodedDrawing[];
  issues: ExplodeIssue[];
  /** Total component entries across all drawings. */
  componentCount: number;
  /** Total physical pieces represented by the drawings. */
  pieceCount: number;
  bounds: ExplodedBounds;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** cos/sin of the 30° axonometric axes. */
const C30 = Math.cos(Math.PI / 6);
const S30 = 0.5;

/** Minimum gap kept between two projected panels, in drawing units (cm). */
const SEPARATION_GAP = 1.5;

const MIN_SPREAD = 0.2;

/* ------------------------------------------------------------------ */
/*  Projection                                                         */
/* ------------------------------------------------------------------ */

/** World (x right, y up, z toward the viewer) → drawing coordinates. */
export function project(x: number, y: number, z: number): Point {
  return {
    x: (x - z) * C30,
    y: -(y) + (x + z) * S30,
  };
}

function centroid(points: Point[]): Point {
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Millimetres, rounded to 0.1 mm — the unit used on every printed callout. */
export function toMm(cm: number): number {
  return Math.round(cm * 10 * 10) / 10;
}

export function mmLabel(cm: number): string {
  const v = toMm(cm);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/* ------------------------------------------------------------------ */
/*  Panel orientation                                                  */
/* ------------------------------------------------------------------ */

/**
 * How a panel sits in the assembly. `length` and `width` in the workbook are
 * the two face dimensions; which world axis each one maps to depends on the
 * part role. Nothing here is a guess about joinery — it is only which face is
 * horizontal or vertical, which the role names already state.
 */
interface Orientation {
  /** Size along world X, Y, Z for ONE piece. */
  sx: number;
  sy: number;
  sz: number;
}

function orientationOf(part: PanelPart, fallbackThickness: number): Orientation | null {
  const t = part.thickness > 0 ? part.thickness : fallbackThickness;
  const L = part.length;
  const W = part.width;
  if (!(L > 0) || !(W > 0)) return null;

  switch (part.role) {
    // Horizontal panels: length runs along the cabinet width (X), width along the depth (Z).
    case 'base':
    case 'top':
    case 'shelf':
    case 'rail':
      return { sx: L, sy: t, sz: W };
    // Vertical side panels: length up (Y), width along the depth (Z).
    case 'body':
      return { sx: t, sy: L, sz: W };
    // Flat panels in the frontal plane: width across (X), length up (Y).
    case 'back':
    case 'door':
      return { sx: W, sy: L, sz: t };
    // Drawer box side: depth along Z, drawer height along Y.
    case 'drawer-body':
      return { sx: t, sy: W, sz: L };
    // Drawer front / drawer back: width across (X), length up (Y).
    case 'drawer-front':
    case 'drawer-back':
      return { sx: L, sy: W, sz: t };
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Assembly skeleton + explosion vectors                              */
/* ------------------------------------------------------------------ */

interface Frame {
  W: number;
  H: number;
  D: number;
}

/**
 * Cabinet envelope. Deliberately the maximum of the *single piece* extents, not
 * a sum: the door column and the two sides all span the same width, so summing
 * would double-count. Values that cannot be derived stay 0 and are reported.
 */
function frameOf(parts: PanelPart[], orients: (Orientation | null)[]): Frame {
  let W = 0;
  let H = 0;
  let D = 0;
  parts.forEach((p, i) => {
    const o = orients[i];
    if (!o) return;
    switch (p.role) {
      case 'base':
      case 'top':
      case 'shelf':
      case 'rail':
        W = Math.max(W, o.sx);
        D = Math.max(D, o.sz);
        break;
      case 'body':
        H = Math.max(H, o.sy);
        D = Math.max(D, o.sz);
        break;
      case 'back':
        // The 3 mm back is an inset panel: it is slightly *smaller* than the
        // nominal carcass, so it must not define the envelope. Its own size is
        // in the legend.
        break;
      case 'door':
        // Doors cover the front, so they set the visible width/height of a
        // leaf, but a two-leaf front must not double the width: use the leaf.
        W = Math.max(W, o.sx);
        H = Math.max(H, o.sy);
        break;
      case 'drawer-body':
        D = Math.max(D, o.sz);
        H = Math.max(H, o.sy);
        break;
      case 'drawer-front':
      case 'drawer-back':
        W = Math.max(W, o.sx);
        H = Math.max(H, o.sy);
        break;
      default:
        break;
    }
  });
  // A drawer's own width comes from the front, which is the widest piece.
  if (W === 0) W = Math.max(W, ...orients.filter(Boolean).map((o) => (o as Orientation).sx));
  if (H === 0) {
    // Nothing structural set the height: fall back to the widest vertical
    // extent that is actually drawn.
    parts.forEach((p, i) => {
      const o = orients[i];
      if (!o) return;
      if (p.role === 'body' || p.role === 'door' || p.role === 'drawer-front') H = Math.max(H, o.sy);
    });
    if (H === 0) H = Math.max(H, ...orients.filter(Boolean).map((o) => (o as Orientation).sy));
  }
  if (D === 0) D = Math.max(D, ...orients.filter(Boolean).map((o) => (o as Orientation).sz));
  return { W, H, D };
}

/**
 * Assembled centre of one instance, plus the direction it explodes along.
 * `index` distinguishes repeated pieces (two sides, several shelves, …).
 */
function placeInstance(
  role: PartRole,
  o: Orientation,
  frame: Frame,
  index: number,
  ofCount: number,
): { centre: Point3; explode: Point3 } {
  const { W, H, D } = frame;
  const t = Math.max(o.sx, o.sy, o.sz) > 0 ? Math.min(o.sx, o.sy, o.sz) : 1;
  const spreadIndex = ofCount > 1 ? index - (ofCount - 1) / 2 : 0;

  switch (role) {
    case 'base':
      return { centre: { x: 0, y: t / 2, z: D / 2 }, explode: { x: 0, y: -22, z: 0 } };
    case 'top':
      return { centre: { x: 0, y: H - t / 2, z: D / 2 }, explode: { x: 0, y: 22, z: 0 } };
    case 'body':
      return {
        centre: { x: spreadIndex * (W - o.sx), y: H / 2, z: D / 2 },
        explode: { x: index === 0 ? -(W / 2 + 12) : W / 2 + 12, y: 0, z: 0 },
      };
    case 'shelf':
      return {
        centre: {
          x: 0,
          y: H * ((index + 1) / (ofCount + 1)),
          z: D / 2,
        },
        explode: { x: 0, y: 0, z: 16 + index * 11 },
      };
    case 'rail':
      return {
        centre: { x: 0, y: H * 0.55 + spreadIndex * (H * 0.22), z: D - o.sz / 2 },
        explode: { x: 0, y: 0, z: 26 + index * 11 },
      };
    case 'back':
      return { centre: { x: 0, y: H / 2, z: 0 }, explode: { x: 0, y: 0, z: -22 } };
    case 'door':
      return {
        centre: {
          x: spreadIndex * (o.sx > 0 ? o.sx : 0),
          y: H - o.sy / 2,
          z: D + o.sz / 2,
        },
        explode: { x: 0, y: 0, z: 40 + index * 12 },
      };
    case 'drawer-body':
      return {
        centre: {
          x: index % 2 === 0 ? -(W / 2 - o.sx / 2) : W / 2 - o.sx / 2,
          y: H / 2,
          z: D / 2,
        },
        explode: { x: index % 2 === 0 ? -(W / 2 + 12) : W / 2 + 12, y: 0, z: 0 },
      };
    case 'drawer-front':
      return {
        centre: { x: 0, y: H - o.sy / 2, z: D + o.sz / 2 },
        explode: { x: 0, y: 0, z: 40 + index * 14 },
      };
    case 'drawer-back':
      return {
        centre: { x: 0, y: H / 2, z: 0 },
        explode: { x: 0, y: 0, z: -(22 + index * 14) },
      };
    default:
      return { centre: { x: 0, y: H / 2, z: D / 2 }, explode: { x: 0, y: 0, z: 30 } };
  }
}

interface Point3 {
  x: number;
  y: number;
  z: number;
}

/* ------------------------------------------------------------------ */
/*  Box → projected faces                                              */
/* ------------------------------------------------------------------ */

interface Box {
  centre: Point3;
  sx: number;
  sy: number;
  sz: number;
}

/** Eight corners, indexed by bit 0 = +x, bit 1 = +y, bit 2 = +z. */
function corners(b: Box): { x: number; y: number; z: number }[] {
  const hx = b.sx / 2;
  const hy = b.sy / 2;
  const hz = b.sz / 2;
  const out: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < 8; i++) {
    out.push({
      x: b.centre.x + (i & 1 ? hx : -hx),
      y: b.centre.y + (i & 2 ? hy : -hy),
      z: b.centre.z + (i & 4 ? hz : -hz),
    });
  }
  return out;
}

/**
 * Faces whose normal points toward the camera at (+1,+1,+1): +X, +Y and +Z.
 * Only these three can be visible in this axonometric projection, so drawing
 * the other three would be exactly the hidden-line mess we want to avoid.
 */
const VISIBLE_FACES: { axis: 0 | 1 | 2; sign: 1 | -1; idx: [number, number, number, number] }[] = [
  { axis: 0, sign: 1, idx: [1, 3, 7, 5] }, // +X
  { axis: 1, sign: 1, idx: [2, 3, 7, 6] }, // +Y
  { axis: 2, sign: 1, idx: [4, 5, 7, 6] }, // +Z
];

function projectBox(b: Box): { face: Point[]; sides: Point[][] } {
  const c = corners(b);
  const faces = VISIBLE_FACES.map((f) => ({
    pts: f.idx.map((i) => project(c[i].x, c[i].y, c[i].z)),
    // Depth along the view direction, used to pick the main face.
    depth: f.axis === 0 ? b.sx : f.axis === 1 ? b.sy : b.sz,
  }));
  // The "main" face is the largest one: that is the panel face the callout
  // dimension refers to (L × W), never the thin edge.
  const areas = [
    { i: 0, a: b.sy * b.sz }, // X face: L? no — this is the YZ face
    { i: 1, a: b.sx * b.sz }, // Y face
    { i: 2, a: b.sx * b.sy }, // Z face
  ];
  let mainIdx = 1;
  if (areas[0].a >= areas[1].a && areas[0].a >= areas[2].a) mainIdx = 0;
  else if (areas[2].a >= areas[0].a && areas[2].a >= areas[1].a) mainIdx = 2;
  const face = faces[mainIdx].pts;
  const sides = faces.filter((_, i) => i !== mainIdx).map((f) => f.pts);
  void faces[0].depth;
  return { face, sides };
}

/* ------------------------------------------------------------------ */
/*  Dimensions                                                         */
/* ------------------------------------------------------------------ */


/** Offset a segment by `gap` along its normal, choosing the outward side. */


function buildDimensions(frame: Frame): ExplodedDimension[] {
  const { W, H, D } = frame;
  const out: ExplodedDimension[] = [];
  if (W > 0) {
    // Overall width: the front-bottom edge of the assembly envelope.
    out.push({
      axis: 'width',
      labelFa: 'بیشترین عرض قطعه (کف/تاق)',
      labelEn: 'Widest panel (base/top)',
      valueCm: W,
      from: project(-W / 2, 0, D),
      to: project(W / 2, 0, D),
      text: mmLabel(W),
    });
  }
  if (H > 0) {
    // Overall height: the front-left vertical edge.
    out.push({
      axis: 'height',
      labelFa: 'بیشترین ارتفاع قطعه (بدنه/درب)',
      labelEn: 'Tallest panel (side/door)',
      valueCm: H,
      from: project(-W / 2, 0, D),
      to: project(-W / 2, H, D),
      text: mmLabel(H),
    });
  }
  if (D > 0) {
    // Overall depth: the bottom edge running front to back on the right.
    out.push({
      axis: 'depth',
      labelFa: 'عمق قطعه (بدنه/کف)',
      labelEn: 'Panel depth (side/base)',
      valueCm: D,
      from: project(W / 2, 0, D),
      to: project(W / 2, 0, 0),
      text: mmLabel(D),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Label placement (collision free)                                   */
/* ------------------------------------------------------------------ */

/**
 * Push projected panels apart until their bounding boxes stop overlapping.
 *
 * The 3-D explode vectors already separate the roles, but a 2-D projection can
 * still stack two panels on top of each other (a tall door and a side panel, for
 * instance). This relaxation nudges the *presentation* position in the drawing
 * plane only — the panel's shape, its dimensions and the facts in the legend are
 * untouched — until every panel has its own space. It returns the applied shift
 * per panel so the caller can keep faces and anchors consistent.
 */
function separatePanels(boxes: { minX: number; minY: number; maxX: number; maxY: number }[]): Point[] {
  const shifts: Point[] = boxes.map(() => ({ x: 0, y: 0 }));
  if (boxes.length < 2) return shifts;
  const gap = SEPARATION_GAP;

  const bboxOf = (i: number) => {
    const b = boxes[i];
    const s0 = shifts[i];
    return {
      minX: b.minX + s0.x,
      minY: b.minY + s0.y,
      maxX: b.maxX + s0.x,
      maxY: b.maxY + s0.y,
    };
  };

  for (let iter = 0; iter < 40; iter++) {
    let moved = false;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = bboxOf(i);
        const b = bboxOf(j);
        const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) + gap;
        const overlapY = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) + gap;
        if (overlapX <= 0 || overlapY <= 0) continue;
        // Resolve along the axis that needs the smaller move.
        if (overlapX < overlapY) {
          const dir = (a.minX + a.maxX) / 2 >= (b.minX + b.maxX) / 2 ? 1 : -1;
          shifts[i].x += (dir * overlapX) / 2;
          shifts[j].x -= (dir * overlapX) / 2;
        } else {
          const dir = (a.minY + a.maxY) / 2 >= (b.minY + b.maxY) / 2 ? 1 : -1;
          shifts[i].y += (dir * overlapY) / 2;
          shifts[j].y -= (dir * overlapY) / 2;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
  return shifts;
}

function bboxOfPoints(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
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
  return { minX, minY, maxX, maxY };
}

function shiftPoints(points: Point[], d: Point): Point[] {
  return points.map((p) => ({ x: p.x + d.x, y: p.y + d.y }));
}

/* ------------------------------------------------------------------ */
/*  Builder                                                            */
/* ------------------------------------------------------------------ */

export function buildExplodedDrawing(
  module: ExplodeModuleInput,
  moduleNo: number,
  options: ExplodeOptions = {},
): ExplodedDrawing {
  const spread = Math.max(MIN_SPREAD, options.spread ?? 1);
  const maxInstances = Math.max(1, Math.floor(options.maxInstancesPerPart ?? 4));
  const mats = new Map((options.materials ?? []).map((m) => [m.id, m]));
  const issues: ExplodeIssue[] = [];

  const parts = module.parts ?? [];
  if (parts.length === 0) {
    issues.push({
      code: 'EMPTY_MODULE',
      severity: 'warning',
      moduleId: module.id,
      moduleNo,
      messageFa: 'این واحد هیچ قطعه‌ای تولید نمی‌کند؛ نقشه‌ای ترسیم نشد.',
      messageEn: 'This unit produces no panels, so no drawing was produced.',
    });
  }
  if (!(module.quantity > 0)) {
    issues.push({
      code: 'ZERO_QUANTITY',
      severity: 'warning',
      moduleId: module.id,
      moduleNo,
      messageFa: 'تعداد این واحد صفر است؛ قطعات آن در نقشه نمی‌آیند.',
      messageEn: 'Module quantity is zero; its panels are not drawn.',
    });
  }

  const fallbackThickness = parts.find((p) => p.thickness > 0)?.thickness ?? 0;
  const orients = parts.map((p) => orientationOf(p, fallbackThickness));
  const frame = frameOf(parts, orients);

  const panels: ExplodedPanel[] = [];

  parts.forEach((part, partIndex) => {
    const o = orients[partIndex];
    const componentNo = partIndex + 1;
    const material = mats.get(part.materialId);

    if (!o) {
      if (!(part.length > 0) || !(part.width > 0)) {
        issues.push({
          code: 'MISSING_DIMENSION',
          severity: 'warning',
          moduleId: module.id,
          moduleNo,
          componentNo,
          partId: part.id,
          messageFa: `قطعهٔ «${part.nameFa}» ابعاد معتبر ندارد (طول ${part.length}، عرض ${part.width}) و ترسیم نشد.`,
          messageEn: `"${part.nameEn}" has no valid dimensions (length ${part.length}, width ${part.width}) and is not drawn.`,
        });
      } else {
        issues.push({
          code: 'UNSUPPORTED_GEOMETRY',
          severity: 'warning',
          moduleId: module.id,
          moduleNo,
          componentNo,
          partId: part.id,
          messageFa: `نقش «${part.nameFa}» هندسهٔ شناخته‌شده ندارد؛ فقط در جدول راهنما آمده است.`,
          messageEn: `"${part.nameEn}" has no known geometry; it appears in the legend only.`,
        });
      }
      return;
    }
    if (!(part.thickness > 0)) {
      issues.push({
        code: 'MISSING_THICKNESS',
        severity: 'info',
        moduleId: module.id,
        moduleNo,
        componentNo,
        partId: part.id,
        messageFa: `ضخامت «${part.nameFa}» صفر است؛ با ضخامت نمایشی ${fallbackThickness} سانتی‌متر ترسیم شد.`,
        messageEn: `"${part.nameEn}" has zero thickness; drawn with the nominal ${fallbackThickness} cm.`,
      });
    }

    const drawn = Math.min(Math.max(1, Math.round(part.count)), maxInstances);
    const truncated = part.count > drawn;
    if (truncated) {
      issues.push({
        code: 'TRUNCATED_INSTANCES',
        severity: 'info',
        moduleId: module.id,
        moduleNo,
        componentNo,
        partId: part.id,
        messageFa: `برای خوانایی ${drawn} نسخه از ${part.count} قطعهٔ «${part.nameFa}» ترسیم شد؛ تعداد واقعی در راهنما آمده است.`,
        messageEn: `Drew ${drawn} of ${part.count} "${part.nameEn}" for legibility; the real quantity is in the legend.`,
      });
    }

    for (let i = 0; i < drawn; i++) {
      const { centre, explode } = placeInstance(part.role, o, frame, i, drawn);
      const box: Box = {
        centre: {
          x: centre.x + explode.x * spread,
          y: centre.y + explode.y * spread,
          z: centre.z + explode.z * spread,
        },
        sx: o.sx,
        sy: o.sy,
        sz: o.sz,
      };
      const { face, sides } = projectBox(box);
      panels.push({
        componentNo,
        componentId: `M${moduleNo}-${String(componentNo).padStart(2, '0')}`,
        partId: part.id,
        nameFa: part.nameFa,
        nameEn: part.nameEn,
        role: part.role,
        length: part.length,
        width: part.width,
        thickness: part.thickness,
        count: part.count,
        totalPieces: part.count * Math.max(1, module.quantity),
        materialId: part.materialId,
        materialNameFa: material?.nameFa ?? part.materialId,
        materialNameEn: material?.nameEn ?? part.materialId,
        edgeWidthEdge: part.edges.widthEdge,
        edgeLengthEdge: part.edges.lengthEdge,
        face,
        sides,
        anchor: centroid(face),
        dimensionText: `${mmLabel(part.length)}×${mmLabel(part.width)}`,
        displayShift: { x: 0, y: 0 },
        truncated,
      });
    }
  });

  // Panels must not sit on top of each other in the projection. The relaxation
  // only shifts presentation positions; shapes and dimensions are untouched.
  const shifts = separatePanels(
    panels.map((p) => bboxOfPoints([...p.face, ...p.sides.flat()])),
  );
  panels.forEach((p, i) => {
    const d = shifts[i];
    if (!d || (d.x === 0 && d.y === 0)) return;
    p.face = shiftPoints(p.face, d);
    p.sides = p.sides.map((side) => shiftPoints(side, d));
    p.anchor = { x: p.anchor.x + d.x, y: p.anchor.y + d.y };
  });
  // Keep the record of how far each panel moved, so the renderer (and a
  // reviewer) can tell an exploded position from an assembled one.
  panels.forEach((p, i) => {
    p.displayShift = { x: shifts[i]?.x ?? 0, y: shifts[i]?.y ?? 0 };
  });

  const dimensions = buildDimensions(frame);

  // Bounds cover geometry, badges and callouts.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const consider = (p: Point) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };
  for (const p of panels) {
    p.face.forEach(consider);
    p.sides.forEach((s) => s.forEach(consider));
    consider(p.anchor);
  }
  for (const d of dimensions) {
    consider(d.from);
    consider(d.to);
  }
  if (!Number.isFinite(minX)) {
    minX = -1;
    minY = -1;
    maxX = 1;
    maxY = 1;
  }
  const pad = 6;
  const bounds: ExplodedBounds = {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };

  return {
    moduleNo,
    moduleId: module.id,
    moduleLabel: module.label,
    moduleLabelEn: module.labelEn ?? module.label,
    kind: module.kind,
    quantity: module.quantity,
    envelope: { widthCm: frame.W, heightCm: frame.H, depthCm: frame.D },
    panels,
    dimensions,
    bounds,
    issues,
  };
}

/** Build every drawing of a project plus the sheet-wide bounds. */
export function buildExplodedSheet(
  modules: ExplodeModuleInput[],
  options: ExplodeOptions = {},
): ExplodedSheet {
  const drawings = modules.map((m, i) => buildExplodedDrawing(m, i + 1, options));
  const issues = drawings.flatMap((d) => d.issues);
  const componentCount = drawings.reduce(
    (n, d) => n + new Set(d.panels.map((p) => p.componentNo)).size,
    0,
  );
  const pieceCount = modules.reduce(
    (n, m) => n + m.parts.reduce((k, p) => k + p.count, 0) * Math.max(1, m.quantity),
    0,
  );

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const d of drawings) {
    minX = Math.min(minX, d.bounds.minX);
    minY = Math.min(minY, d.bounds.minY);
    maxX = Math.max(maxX, d.bounds.maxX);
    maxY = Math.max(maxY, d.bounds.maxY);
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 1;
    maxY = 1;
  }
  return {
    drawings,
    issues,
    componentCount,
    pieceCount,
    bounds: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY },
  };
}

/**
 * Cross-check the drawing against the cutting list. Every drawn panel must
 * carry exactly the dimensions of its cutting-list row. Used by the tests; also
 * usable as a runtime assertion when app state changes.
 */
export interface DimensionMismatch {
  componentId: string;
  partId: string;
  field: string;
  expected: number;
  actual: number;
}

export function verifyDrawingAgainstRows(
  drawing: ExplodedDrawing,
  rows: { moduleId: string; partId: string; length: number; width: number; thickness: number }[],
): DimensionMismatch[] {
  const out: DimensionMismatch[] = [];
  for (const p of drawing.panels) {
    const row = rows.find((r) => r.moduleId === drawing.moduleId && r.partId === p.partId);
    if (!row) {
      out.push({ componentId: p.componentId, partId: p.partId, field: 'row', expected: 1, actual: 0 });
      continue;
    }
    for (const field of ['length', 'width', 'thickness'] as const) {
      if (row[field] !== p[field]) {
        out.push({ componentId: p.componentId, partId: p.partId, field, expected: row[field], actual: p[field] });
      }
    }
  }
  return out;
}
