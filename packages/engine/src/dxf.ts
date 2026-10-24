import type { ExplodedPanel, ExplodedSheet } from './exploded.js';

/**
 * DXF export — plain 2-D outlines, in millimetres, at 1:1.
 *
 * What this file is
 * -----------------
 * A real ASCII DXF R12 file (`AC1009`). R12 is chosen deliberately: it is the
 * last format every CAM/CAD package on the market still reads, including the
 * old Windows machines found in small workshops, and it needs no binary
 * libraries to write.
 *
 * What it contains
 * ----------------
 * For every module of a project, one block of panel rectangles. Each rectangle
 * is the panel's true face — `length` along +X, `width` along +Y, at 1:1 in
 * millimetres — because that is exactly what the workbook calculates. The
 * orientation is therefore preserved, and a 768 × 550 mm shelf comes out as a
 * 768 × 550 mm rectangle, not an approximation.
 *
 * What it deliberately does NOT contain
 * -------------------------------------
 * • No drilled holes, no grooves, no pockets, no toolpaths. The workbook has no
 *   machining data, so inventing it would be dangerous.
 * • No claim of compatibility with any CNC controller. The DXF is a drawing
 *   exchange file, verified by re-parsing it; controller compatibility is
 *   untested and out of scope.
 * • No hidden-line 3-D geometry. This is a 2-D outline export.
 */

/** Layers written by the exporter. */
export const DXF_LAYERS = {
  OUTLINE: 'OUTLINE',
  /** Reserved: machining entities are a documented future feature. */
  MACHINING: 'MACHINING',
  DIM: 'DIM',
  LABEL: 'LABEL',
  FRAME: 'FRAME',
} as const;

export interface DxfOptions {
  /** Horizontal gap between panel blocks, mm. */
  gapX?: number;
  /** Vertical gap between module rows, mm. */
  gapY?: number;
  /** Label each panel with its number and size. */
  includeLabels?: boolean;
  /** Draw the overall cabinet extent as a frame on the FRAME layer. */
  includeFrames?: boolean;
}

export interface DxfResult {
  dxf: string;
  /** Everything a caller (or a test) needs to describe the export. */
  summary: {
    units: 'mm';
    format: 'DXF R12 (AC1009)';
    panels: number;
    modules: number;
    layers: string[];
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

const DEFAULT_GAP = 40;

function d2(v: number): string {
  // DXF is line based; fixed 4 decimals keeps files small and predictable.
  return (Math.round(v * 10000) / 10000).toFixed(4);
}

interface LineEntity {
  layer: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface TextEntity {
  layer: string;
  x: number;
  y: number;
  height: number;
  text: string;
}

interface CircleEntity {
  layer: string;
  x: number;
  y: number;
  r: number;
}

/**
 * Build the DXF for a project.
 *
 * Panels are laid out in reading order: one row per module, parts left to
 * right, each panel drawn to its real size so a scale check in any CAD program
 * gives the workbook dimensions directly.
 */
export function buildDxf(sheet: ExplodedSheet, options: DxfOptions = {}): DxfResult {
  const gapX = options.gapX ?? DEFAULT_GAP;
  const gapY = options.gapY ?? DEFAULT_GAP;
  const includeLabels = options.includeLabels ?? true;
  const includeFrames = options.includeFrames ?? true;

  const lines: LineEntity[] = [];
  const texts: TextEntity[] = [];
  const circles: CircleEntity[] = [];

  let cursorY = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let panelCount = 0;

  const touch = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  // Draw the sheet top-down: the first module occupies the highest row.
  const ordered = [...sheet.drawings].reverse();
  for (const drawing of ordered) {
    const components = uniqueComponents(drawing.panels);
    let cursorX = 0;
    let rowHeight = 0;

    if (includeFrames && drawing.envelope.widthCm > 0 && drawing.envelope.heightCm > 0) {
      const w = drawing.envelope.widthCm * 10;
      const h = drawing.envelope.heightCm * 10;
      const fx = cursorX;
      const fy = cursorY;
      lines.push(
        { layer: DXF_LAYERS.FRAME, x1: fx, y1: fy, x2: fx + w, y2: fy },
        { layer: DXF_LAYERS.FRAME, x1: fx + w, y1: fy, x2: fx + w, y2: fy + h },
        { layer: DXF_LAYERS.FRAME, x1: fx + w, y1: fy + h, x2: fx, y2: fy + h },
        { layer: DXF_LAYERS.FRAME, x1: fx, y1: fy + h, x2: fx, y2: fy },
      );
      texts.push({
        layer: DXF_LAYERS.LABEL,
        x: fx,
        y: fy + h + 6,
        height: 5,
        text: `M${drawing.moduleNo} ${ascii(drawing.moduleLabel)} (${drawing.quantity}x)`,
      });
      rowHeight = Math.max(rowHeight, h + 14);
      touch(fx, fy);
      touch(fx + w, fy + h);
    }

    for (const panel of components) {
      const w = panel.length * 10; // length → X
      const h = panel.width * 10; // width  → Y
      const x = cursorX;
      const y = cursorY;
      lines.push(
        { layer: DXF_LAYERS.OUTLINE, x1: x, y1: y, x2: x + w, y2: y },
        { layer: DXF_LAYERS.OUTLINE, x1: x + w, y1: y, x2: x + w, y2: y + h },
        { layer: DXF_LAYERS.OUTLINE, x1: x + w, y1: y + h, x2: x, y2: y + h },
        { layer: DXF_LAYERS.OUTLINE, x1: x, y1: y + h, x2: x, y2: y },
      );
      // Dimension ticks on the length and width edges, on the DIM layer.
      const tick = 6;
      lines.push(
        { layer: DXF_LAYERS.DIM, x1: x, y1: y - tick, x2: x + w, y2: y - tick },
        { layer: DXF_LAYERS.DIM, x1: x, y1: y - tick, x2: x, y2: y - tick - 2 },
        { layer: DXF_LAYERS.DIM, x1: x + w, y1: y - tick, x2: x + w, y2: y - tick - 2 },
        { layer: DXF_LAYERS.DIM, x1: x - 2, y1: y, x2: x - tick, y2: y },
        { layer: DXF_LAYERS.DIM, x1: x - tick, y1: y, x2: x - tick, y2: y + h },
        { layer: DXF_LAYERS.DIM, x1: x - tick, y1: y + h, x2: x - 2, y2: y + h },
      );
      if (includeLabels) {
        // Component number inside the panel, dimensions under it.
        const cx = x + w / 2;
        const cy = y + h / 2;
        circles.push({ layer: DXF_LAYERS.LABEL, x: cx, y: cy, r: Math.min(8, Math.max(3, Math.min(w, h) / 8)) });
        texts.push({ layer: DXF_LAYERS.LABEL, x: cx - 2.2, y: cy - 1.5, height: 4, text: String(panel.componentNo) });
        texts.push({
          layer: DXF_LAYERS.LABEL,
          x: x + 2,
          y: y + h - 6,
          height: 3.2,
          text: `${panel.componentId} ${ascii(panel.nameEn)}`,
        });
        texts.push({
          layer: DXF_LAYERS.DIM,
          x: x + w / 2 - 10,
          y: y - tick - 6,
          height: 3.2,
          text: `${mm(panel.length)} x ${mm(panel.width)} mm`,
        });
        if (panel.count > 1) {
          texts.push({
            layer: DXF_LAYERS.LABEL,
            x: x + 2,
            y: y + 3,
            height: 3.2,
            text: `qty ${panel.totalPieces}`,
          });
        }
      }
      touch(x - tick, y - tick - 10);
      touch(x + w, y + h);
      panelCount++;
      cursorX += w + gapX;
      rowHeight = Math.max(rowHeight, h + 10);
    }

    cursorY += rowHeight + gapY;
  }

  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 1;
    maxY = 1;
  }

  const layers = [DXF_LAYERS.OUTLINE, DXF_LAYERS.DIM, DXF_LAYERS.LABEL, DXF_LAYERS.FRAME, DXF_LAYERS.MACHINING];

  const out: string[] = [];
  const g = (code: number, value: string | number) => {
    out.push(String(code));
    out.push(String(value));
  };

  /* HEADER ------------------------------------------------------------ */
  g(0, 'SECTION');
  g(2, 'HEADER');
  g(9, '$ACADVER');
  g(1, 'AC1009');
  g(9, '$INSUNITS');
  g(70, 4); // 4 = millimetres
  g(9, '$MEASUREMENT');
  g(70, 1); // metric
  g(9, '$EXTMIN');
  g(10, d2(minX));
  g(20, d2(minY));
  g(30, d2(0));
  g(9, '$EXTMAX');
  g(10, d2(maxX));
  g(20, d2(maxY));
  g(30, d2(0));
  g(9, '$LIMMIN');
  g(10, d2(minX));
  g(20, d2(minY));
  g(9, '$LIMMAX');
  g(10, d2(maxX));
  g(20, d2(maxY));
  g(0, 'ENDSEC');

  /* TABLES ------------------------------------------------------------ */
  g(0, 'SECTION');
  g(2, 'TABLES');
  g(0, 'TABLE');
  g(2, 'LTYPE');
  g(70, 1);
  g(0, 'LTYPE');
  g(2, 'CONTINUOUS');
  g(70, 0);
  g(3, 'Solid line');
  g(72, 65);
  g(73, 0);
  g(40, d2(0));
  g(0, 'ENDTAB');
  g(0, 'TABLE');
  g(2, 'LAYER');
  g(70, layers.length);
  for (const name of layers) {
    g(0, 'LAYER');
    g(2, name);
    // 0 = frozen? no: 70 is flags (0 = normal, not frozen/locked)
    g(70, 0);
    g(62, name === DXF_LAYERS.MACHINING ? 8 : 7); // 7 = white/black, 8 = grey
    g(6, 'CONTINUOUS');
  }
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');

  /* ENTITIES ---------------------------------------------------------- */
  g(0, 'SECTION');
  g(2, 'ENTITIES');

  for (const line of lines) {
    g(0, 'LINE');
    g(8, line.layer);
    g(10, d2(line.x1));
    g(20, d2(line.y1));
    g(30, d2(0));
    g(11, d2(line.x2));
    g(21, d2(line.y2));
    g(31, d2(0));
  }
  for (const c of circles) {
    g(0, 'CIRCLE');
    g(8, c.layer);
    g(10, d2(c.x));
    g(20, d2(c.y));
    g(30, d2(0));
    g(40, d2(c.r));
  }
  for (const t of texts) {
    g(0, 'TEXT');
    g(8, t.layer);
    g(10, d2(t.x));
    g(20, d2(t.y));
    g(30, d2(0));
    g(40, d2(t.height));
    g(1, t.text);
    g(7, 'STANDARD');
  }
  g(0, 'ENDSEC');
  g(0, 'EOF');

  return {
    dxf: out.join('\r\n') + '\r\n',
    summary: {
      units: 'mm',
      format: 'DXF R12 (AC1009)',
      panels: panelCount,
      modules: sheet.drawings.length,
      layers,
      minX,
      minY,
      maxX,
      maxY,
    },
  };
}

/** One entry per component number: repeated copies must not double the outline. */
function uniqueComponents(panels: ExplodedPanel[]): ExplodedPanel[] {
  const seen = new Map<number, ExplodedPanel>();
  for (const p of panels) if (!seen.has(p.componentNo)) seen.set(p.componentNo, p);
  return [...seen.values()].sort((a, b) => a.componentNo - b.componentNo);
}

function mm(cm: number): string {
  const v = Math.round(cm * 100) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/**
 * DXF R12 predates Unicode text, so names are transliterated to ASCII.
 * Persian names stay in the UI, the SVG sheet and the cutting list.
 */
function ascii(s: string): string {
  return s
    .replace(/[×]/g, 'x')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ------------------------------------------------------------------ */
/*  Verification: re-parse what we wrote                               */
/* ------------------------------------------------------------------ */

export interface ParsedDxf {
  version: string;
  units: number;
  measurement: number;
  layers: string[];
  lines: { layer: string; x1: number; y1: number; x2: number; y2: number }[];
  texts: { layer: string; x: number; y: number; height: number; text: string }[];
  circles: { layer: string; x: number; y: number; r: number }[];
  extMin: { x: number; y: number };
  extMax: { x: number; y: number };
  complete: boolean;
}

/**
 * A small, strict DXF reader used to verify the exporter.
 *
 * It is intentionally independent of the writer: it walks group code/value
 * pairs, then interprets them per entity type. If the writer ever emitted a
 * malformed pair, this would fail rather than silently accept the file.
 */
export function parseDxf(text: string): ParsedDxf {
  const raw = text.replace(/\r\n/g, '\n').split('\n');
  // A DXF is strictly alternating code/value lines. Anything else is not a DXF
  // and must be rejected instead of silently parsed into an empty drawing.
  const lastNonEmpty = raw.reduce((acc, line, i) => (line.trim() !== '' ? i : acc), -1);
  if (lastNonEmpty % 2 === 0 && raw.length <= 2) throw new Error('not a DXF: no group code pairs');
  if (raw.filter((l, i) => i <= lastNonEmpty).length < 2) throw new Error('not a DXF: too few lines');
  const pairs: { code: number; value: string }[] = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const code = Number(raw[i].trim());
    if (!Number.isFinite(code)) throw new Error(`invalid group code at line ${i + 1}`);
    pairs.push({ code, value: raw[i + 1] });
  }

  const result: ParsedDxf = {
    version: '',
    units: 0,
    measurement: 0,
    layers: [],
    lines: [],
    texts: [],
    circles: [],
    extMin: { x: 0, y: 0 },
    extMax: { x: 0, y: 0 },
    complete: false,
  };

  let section = '';
  let i = 0;
  let pending: 'LINE' | 'TEXT' | 'CIRCLE' | 'LAYER' | null = null;
  let buf: { layer: string; nums: Record<number, number>; text: string; name: string } = blank();

  function blank() {
    return { layer: '', nums: {} as Record<number, number>, text: '', name: '' };
  }
  function flush() {
    if (!pending) return;
    const n = buf.nums;
    if (pending === 'LINE') {
      result.lines.push({ layer: buf.layer, x1: n[10] ?? 0, y1: n[20] ?? 0, x2: n[11] ?? 0, y2: n[21] ?? 0 });
    } else if (pending === 'TEXT') {
      result.texts.push({ layer: buf.layer, x: n[10] ?? 0, y: n[20] ?? 0, height: n[40] ?? 0, text: buf.text });
    } else if (pending === 'CIRCLE') {
      result.circles.push({ layer: buf.layer, x: n[10] ?? 0, y: n[20] ?? 0, r: n[40] ?? 0 });
    } else if (pending === 'LAYER') {
      result.layers.push(buf.name);
    }
    pending = null;
    buf = blank();
  }

  while (i < pairs.length) {
    const { code, value } = pairs[i];
    if (code === 0) {
      flush();
      const v = value.trim();
      if (v === 'SECTION') {
        section = (pairs[i + 1]?.value ?? '').trim();
        i += 2;
        continue;
      }
      if (v === 'ENDSEC') {
        section = '';
        i += 1;
        continue;
      }
      if (v === 'EOF') {
        result.complete = true;
        i += 1;
        continue;
      }
      if (v === 'LINE' || v === 'TEXT' || v === 'CIRCLE') {
        pending = v;
        i += 1;
        continue;
      }
      if (v === 'LAYER') {
        pending = 'LAYER';
        i += 1;
        continue;
      }
      i += 1;
      continue;
    }

    if (section === 'HEADER') {
      if (code === 9) {
        const name = value.trim();
        if (name === '$ACADVER') result.version = (pairs[i + 1]?.value ?? '').trim();
        if (name === '$INSUNITS') result.units = Number(pairs[i + 1]?.value ?? 0);
        if (name === '$MEASUREMENT') result.measurement = Number(pairs[i + 1]?.value ?? 0);
        if (name === '$EXTMIN') {
          result.extMin = { x: Number(pairs[i + 1]?.value ?? 0), y: Number(pairs[i + 2]?.value ?? 0) };
        }
        if (name === '$EXTMAX') {
          result.extMax = { x: Number(pairs[i + 1]?.value ?? 0), y: Number(pairs[i + 2]?.value ?? 0) };
        }
      }
      i += 1;
      continue;
    }

    if (pending === 'LAYER') {
      if (code === 2) buf.name = value;
      i += 1;
      continue;
    }

    if (pending) {
      if (code === 8) buf.layer = value;
      else if (code === 1) buf.text = value;
      else buf.nums[code] = Number(value);
    }
    i += 1;
  }
  flush();
  if (!pairs.length) throw new Error('not a DXF: no group code pairs');
  if (!result.complete) throw new Error('not a DXF: missing EOF marker');
  return result;
}

/** Group parsed outline lines into closed rectangles and report their sizes. */
export function dxfRectangles(parsed: ParsedDxf): { width: number; height: number; x: number; y: number }[] {
  const byLayer = parsed.lines.filter((l) => l.layer === DXF_LAYERS.OUTLINE);
  const rects: { width: number; height: number; x: number; y: number }[] = [];
  const key = (v: number) => v.toFixed(3);
  // A rectangle is four axis-aligned lines: two horizontal, two vertical, sharing corners.
  const horizontals = byLayer.filter((l) => Math.abs(l.y1 - l.y2) < 1e-6);
  const verticals = byLayer.filter((l) => Math.abs(l.x1 - l.x2) < 1e-6);
  const span = (l: { x1: number; x2: number }) => [Math.min(l.x1, l.x2), Math.max(l.x1, l.x2)] as const;
  for (const a of horizontals) {
    for (const b of horizontals) {
      if (key(a.y1) === key(b.y1)) continue;
      const [ax1, ax2] = span(a);
      const [bx1, bx2] = span(b);
      if (key(ax1) !== key(bx1) || key(ax2) !== key(bx2)) continue;
      const yLo = Math.min(a.y1, b.y1);
      const build = (x: number, horiz: typeof a) =>
        verticals.find(
          (v) =>
            key(v.x1) === key(x) &&
            key(Math.min(v.y1, v.y2)) === key(yLo) &&
            key(Math.max(v.y1, v.y2)) === key(Math.max(a.y1, b.y1)),
        );
      const left = build(ax1, a);
      const right = build(ax2, a);
      if (!left || !right) continue;
      const rect = { width: ax2 - ax1, height: Math.abs(a.y1 - b.y1), x: ax1, y: yLo };
      if (!rects.some((r) => key(r.x) === key(rect.x) && key(r.y) === key(rect.y) && key(r.width) === key(rect.width))) {
        rects.push(rect);
      }
    }
  }
  return rects;
}
