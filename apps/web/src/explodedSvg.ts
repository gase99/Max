import { project } from '@cabinet/engine';
import type { ExplodedDrawing, ExplodedSheet } from '@cabinet/engine';
import { layoutDrawing, type Rect } from './explodedLayout.js';

/**
 * A4 portrait SVG sheets for the exploded drawings.
 *
 * The output is a *print artefact*: page geometry in millimetres (210 × 297),
 * type sizes in millimetres, pure black on white, one module per page. The
 * drawing is fitted into a frame that grows or shrinks depending on how many
 * legend rows the module needs, so a 3-part drawer box and a 7-part wall unit
 * both fill their page sensibly.
 *
 * Only the model from `@cabinet/engine` is consumed. No dimension is computed
 * here; every number printed comes from the engine.
 */

export interface SheetOptions {
  lang: 'fa' | 'en';
  projectName: string;
  customer?: string;
  /** Pre-formatted date string (injected so the output stays testable). */
  date?: string;
  sheetIndex?: number;
  sheetTotal?: number;
}

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 8;
const INNER = { x: 12, y: 12, w: PAGE_W - 24, h: PAGE_H - 24 };

const ROW_H = 4.6;
const FONT_LEGEND = 2.6;
const FONT_TITLE = 4.6;
const FONT_SUB = 3.2;
const FONT_SMALL = 2.2;
const DIM_FONT = 2.8;
const NOTE_LINE = 3.3;

const FA = {
  sheetTitle: 'نقشهٔ انفجاری — برگهٔ فنی',
  legendNo: 'شماره',
  legendFa: 'نام قطعه',
  legendEn: 'نام انگلیسی',
  legendQty: 'تعداد',
  legendLen: 'طول (mm)',
  legendWid: 'عرض (mm)',
  legendThk: 'ضخامت (mm)',
  legendMat: 'متریال',
  legendEdge: 'نوار',
  edgeBoth: 'ع+ط',
  edgeW: 'ع',
  edgeL: 'ط',
  none: '—',
  module: 'ماژول',
  scale: 'مقیاس',
  sheet: 'برگه',
  disclaimer:
    'همهٔ اعداد جدول و اندازه‌های روی نقشه مستقیماً از محاسبات فایل اکسل گرفته شده‌اند. چیدمان قطعات نمایشی است و ادعایی دربارهٔ اتصالات، سوراخ‌کاری یا عملیات CNC ندارد.',
  illustrative: 'چیدمان نمایشی — ابعاد دقیق',
  missing: 'موارد ناقص:',
  customer: 'مشتری',
  units: 'همهٔ ابعاد به میلی‌متر',
  unitOne: 'واحد',
};

const EN = {
  sheetTitle: 'Exploded drawing — technical sheet',
  legendNo: 'No.',
  legendFa: 'Persian name',
  legendEn: 'Part',
  legendQty: 'Qty',
  legendLen: 'Length (mm)',
  legendWid: 'Width (mm)',
  legendThk: 'Thk (mm)',
  legendMat: 'Material',
  legendEdge: 'Edge',
  edgeBoth: 'W+L',
  edgeW: 'W',
  edgeL: 'L',
  none: '—',
  module: 'Module',
  scale: 'Scale',
  sheet: 'Sheet',
  disclaimer:
    'Every number in the table and on the drawing comes straight from the workbook calculation. The arrangement is illustrative and makes no claim about joinery, drilling or CNC operations.',
  illustrative: 'Illustrative arrangement — exact dimensions',
  missing: 'Incomplete items:',
  customer: 'Customer',
  units: 'All dimensions in millimetres',
  unitOne: 'unit(s)',
};

type Strings = typeof FA;

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const n = (v: number): string => String(Math.round(v * 1000) / 1000);

function pathOf(points: { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${n(p.x)},${n(p.y)}`).join(' ') + ' Z';
}

/** Short scale label, e.g. `1:7.2`. */
export function scaleLabel(scale: number): string {
  const ratio = 1 / scale;
  if (Math.abs(ratio - Math.round(ratio)) < 0.06) return `1:${Math.round(ratio)}`;
  return `1:${ratio.toFixed(1)}`;
}

interface Column {
  key: string;
  x: number;
  w: number;
  align: 'start' | 'middle';
  label: string;
}

/** Legend columns, laid out right-to-left for Persian and left-to-right otherwise. */
export function legendColumns(rtl: boolean, width: number, t: Strings): Column[] {
  const spec: { key: string; w: number; label: string; align: Column['align'] }[] = [
    { key: 'no', w: 15, label: t.legendNo, align: 'middle' },
    { key: 'nameFa', w: 38, label: t.legendFa, align: 'start' },
    { key: 'nameEn', w: 37, label: t.legendEn, align: 'start' },
    { key: 'qty', w: 12, label: t.legendQty, align: 'middle' },
    { key: 'length', w: 20, label: t.legendLen, align: 'middle' },
    { key: 'width', w: 19, label: t.legendWid, align: 'middle' },
    { key: 'thk', w: 19, label: t.legendThk, align: 'middle' },
    { key: 'edge', w: 14, label: t.legendEdge, align: 'middle' },
    { key: 'mat', w: 26, label: t.legendMat, align: 'start' },
  ];
  const total = spec.reduce((sum, c) => sum + c.w, 0);
  const cols: Column[] = [];
  let cursor = 0;
  for (const c of spec) {
    const w = (c.w / total) * width;
    cols.push({
      key: c.key,
      // In RTL the first column sits against the right edge, so the Persian
      // table reads in its natural direction.
      x: rtl ? width - cursor - w : cursor,
      w,
      align: c.align,
      label: c.label,
    });
    cursor += w;
  }
  return cols;
}

function cellAnchor(col: Column, rtl: boolean): { x: number; textAnchor: string } {
  if (col.align === 'middle') return { x: col.x + col.w / 2, textAnchor: 'middle' };
  return rtl
    ? { x: col.x + col.w - 1.4, textAnchor: 'end' }
    : { x: col.x + 1.4, textAnchor: 'start' };
}

/** Truncate a name that would overflow its column (Persian has no case). */
function fit(text: string, widthMm: number, fontMm: number, rtl: boolean): string {
  // Average glyph advance ≈ 0.52 em for these fonts; Persians slightly wider.
  const perChar = fontMm * (rtl ? 0.52 : 0.5);
  const maxChars = Math.floor(widthMm / perChar) - 1;
  if (text.length <= maxChars) return text;
  return maxChars <= 1 ? text.slice(0, 1) : text.slice(0, maxChars) + '…';
}

/** Wraps a footer note on word boundaries. */
export function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if (!line) line = w;
    else if ((line + ' ' + w).length <= maxChars) line += ' ' + w;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Render one module as a complete A4 portrait SVG sheet.
 */
export function renderExplodedSvg(drawing: ExplodedDrawing, options: SheetOptions): string {
  const rtl = options.lang === 'fa';
  const t: Strings = rtl ? FA : EN;
  const title = rtl ? drawing.moduleLabel : drawing.moduleLabelEn;
  const p = (v: number) => n(v);

  /* ---- which components get a legend row ---- */
  const seen = new Set<number>();
  const rows = drawing.panels.filter((x) => {
    if (seen.has(x.componentNo)) return false;
    seen.add(x.componentNo);
    return true;
  });

  /* ---- footer notes ---- */
  const notes: string[] = [
    rtl
      ? 'جعبهٔ خط‌چین اندازهٔ بزرگ‌ترین قطعه در هر جهت است؛ چون فایل اکسل فقط ابعاد قطعات را دارد، اندازهٔ اسمی بدنه از آن قابل استخراج نیست.'
      : 'The dashed box is the largest panel extent on each axis. The workbook only stores panel sizes, so the nominal carcass size cannot be derived from it.',
    t.disclaimer,
  ];
  if (rows.some((r) => r.truncated)) {
    notes.push(
      rtl
        ? 'قطعات پرتکرار برای خوانایی کمتر از تعداد واقعی ترسیم شده‌اند؛ ستون «تعداد» دقیق است.'
        : 'Repeated parts are drawn fewer times than their quantity for legibility; the Qty column is exact.',
    );
  }
  const problems = drawing.issues.filter((i) => i.severity === 'warning');
  if (problems.length) {
    notes.push(
      `${t.missing} ` +
        problems
          .slice(0, 3)
          .map((x) => (rtl ? x.messageFa : x.messageEn))
          .join(' | ') +
        (problems.length > 3 ? ` (+${problems.length - 3})` : ''),
    );
  }
  const noteLines = notes.flatMap((note) => wrapText(note, 118));

  /* ---- vertical layout ---- */
  const headerBottom = INNER.y + 24;
  const innerBottom = INNER.y + INNER.h - 2;
  const titleH = 12;
  const titleY = innerBottom - titleH;
  const notesH = noteLines.length * NOTE_LINE;
  const legendH = ROW_H * (rows.length + 1);
  const legendY = titleY - 3 - notesH - legendH;
  const notesY = legendY + legendH + 3;
  const areaH = Math.max(80, legendY - headerBottom - 5);
  // The exploded view gets the left part of the area; a narrow column on the
  // right holds the dimensioned envelope key, so the overall dimensions never
  // have to cross the parts.
  const KEY_W = 46;
  const draw = { x: INNER.x + 2, y: headerBottom, w: INNER.w - 6 - KEY_W, h: areaH };
  const key = { x: draw.x + draw.w + 4, y: headerBottom, w: KEY_W, h: areaH };

  /* ---- fit the model into the drawing frame ---- */
  const b = drawing.bounds;
  const modelW = b.width * 10; // cm → mm of real cabinet
  const modelH = b.height * 10;
  const scale = Math.min(draw.w / modelW, draw.h / modelH);
  const tx = draw.x + (draw.w - modelW * scale) / 2 - b.minX * 10 * scale;
  const ty = draw.y + (draw.h - modelH * scale) / 2 - b.minY * 10 * scale;
  const px = (v: number) => tx + v * 10 * scale; // model cm → page mm
  const py = (v: number) => ty + v * 10 * scale;

  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}mm" height="${PAGE_H}mm" viewBox="0 0 ${PAGE_W} ${PAGE_H}" font-family="${
      rtl
        ? "'Vazirmatn','Tahoma','Iranian Sans','DejaVu Sans',sans-serif"
        : "'Segoe UI','Helvetica Neue','Arial','DejaVu Sans',sans-serif"
    }">`,
  );
  out.push(`<title>${esc(`${title} — ${options.projectName}`)}</title>`);
  out.push(`<rect x="0" y="0" width="${PAGE_W}" height="${PAGE_H}" fill="#ffffff"/>`);
  out.push(
    `<rect x="${INNER.x}" y="${INNER.y}" width="${INNER.w}" height="${INNER.h}" fill="none" stroke="#000" stroke-width="0.5"/>`,
  );

  /* ---- header ---- */
  const headX = rtl ? INNER.x + INNER.w - 3 : INNER.x + 3;
  const headAnchor = rtl ? 'end' : 'start';
  out.push(
    `<text x="${p(headX)}" y="${p(INNER.y + 8)}" font-size="${FONT_TITLE}" font-weight="700" text-anchor="${headAnchor}" fill="#000">${esc(
      fit(options.projectName || t.sheetTitle, INNER.w - 6, FONT_TITLE, rtl),
    )}</text>`,
    `<text x="${p(headX)}" y="${p(INNER.y + 14.5)}" font-size="${FONT_SUB}" text-anchor="${headAnchor}" fill="#000">${esc(
      fit(`${t.module} ${drawing.moduleNo} — ${title}`, INNER.w - 6, FONT_SUB, rtl),
    )}</text>`,
    `<text x="${p(headX)}" y="${p(INNER.y + 19.6)}" font-size="${FONT_SMALL}" text-anchor="${headAnchor}" fill="#333">${esc(
      [
        drawing.moduleId,
        options.customer ? `${t.customer}: ${options.customer}` : null,
        options.date ?? null,
      ]
        .filter(Boolean)
        .join('  ·  '),
    )}</text>`,
  );
  // Sheet counter and scale, on the opposite side.
  const metaX = rtl ? INNER.x + 3 : INNER.x + INNER.w - 3;
  const metaAnchor = rtl ? 'start' : 'end';
  out.push(
    `<text x="${p(metaX)}" y="${p(INNER.y + 8)}" font-size="${FONT_SMALL}" text-anchor="${metaAnchor}" fill="#000">${esc(
      options.sheetIndex != null
        ? `${t.sheet} ${options.sheetIndex} / ${options.sheetTotal ?? '?'}`
        : t.sheetTitle,
    )}</text>`,
    `<text x="${p(metaX)}" y="${p(INNER.y + 12.4)}" font-size="${FONT_SMALL}" text-anchor="${metaAnchor}" fill="#000">${esc(
      `${t.scale} ${scaleLabel(scale)}`,
    )}</text>`,
    `<text x="${p(metaX)}" y="${p(INNER.y + 16.8)}" font-size="${FONT_SMALL}" text-anchor="${metaAnchor}" fill="#555">${esc(
      t.units,
    )}</text>`,
  );

  /* ---- drawing frame ---- */
  out.push(
    `<rect x="${p(draw.x)}" y="${p(draw.y)}" width="${p(draw.w)}" height="${p(draw.h)}" fill="none" stroke="#000" stroke-width="0.25"/>`,
    `<rect x="${p(key.x)}" y="${p(key.y)}" width="${p(key.w)}" height="${p(key.h)}" fill="none" stroke="#000" stroke-width="0.25"/>`,
    `<text x="${p(key.x + key.w / 2)}" y="${p(key.y + 5)}" font-size="${FONT_SMALL}" font-weight="700" text-anchor="middle" fill="#000">${esc(
      rtl ? 'اندازه‌های کلی' : 'Overall sizes',
    )}</text>`,
  );
  out.push(
    `<text x="${p(rtl ? draw.x + draw.w - 2 : draw.x + 2)}" y="${p(draw.y + 4)}" font-size="${FONT_SMALL}" text-anchor="${
      rtl ? 'end' : 'start'
    }" fill="#666">${esc(t.illustrative)}</text>`,
  );

  /* ---- geometry: side faces first, then the panel face ---- */
  out.push('<g stroke="#000" stroke-width="0.3" stroke-linejoin="round">');
  for (const panel of drawing.panels) {
    for (const side of panel.sides) {
      out.push(
        `<path d="${pathOf(side.map((q) => ({ x: px(q.x), y: py(q.y) })))}" fill="#d0d0d0"/>`,
      );
    }
  }
  for (const panel of drawing.panels) {
    out.push(`<path d="${pathOf(panel.face.map((q) => ({ x: px(q.x), y: py(q.y) })))}" fill="#ffffff"/>`);
  }
  out.push('</g>');

  /* ---- paper-space label layout: badges, callouts, dimensions ---- */
  const frame: Rect = { x: draw.x, y: draw.y, w: draw.w, h: draw.h };
  const layout = layoutDrawing(drawing, {
    frame,
    scale,
    originX: tx,
    originY: ty,
  });

  for (const badge of layout.badges) {
    out.push(
      `<circle cx="${p(badge.x)}" cy="${p(badge.y)}" r="${p(badge.r)}" fill="#ffffff" stroke="#000" stroke-width="0.3"/>`,
      `<text x="${p(badge.x)}" y="${p(badge.y + badge.r * 0.42)}" font-size="${p(badge.r * 1.15)}" font-weight="700" text-anchor="middle" fill="#000">${badge.componentNo}</text>`,
    );
    if (badge.leader) {
      out.push(
        `<line x1="${p(badge.x)}" y1="${p(badge.y)}" x2="${p(badge.leader.x2)}" y2="${p(badge.leader.y2)}" stroke="#000" stroke-width="0.2"/>`,
        `<circle cx="${p(badge.leader.x2)}" cy="${p(badge.leader.y2)}" r="0.7" fill="#000"/>`,
      );
    }
  }
  for (const callout of layout.callouts) {
    out.push(
      `<text x="${p(callout.x)}" y="${p(callout.y + callout.h * 0.36)}" font-size="${p(callout.h * 0.8)}" font-family="'Consolas','DejaVu Sans Mono',monospace" text-anchor="middle" fill="#000">${esc(
        callout.text,
      )}</text>`,
    );
  }

  /* ---- dimensioned envelope key (overall sizes, in their own panel) ---- */
  {
    const dimGeom = drawing.dimensions;
    // Fit the envelope extents (model cm) inside the key panel, leaving room for
    // the dimension lines that sit outside the box.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const d of dimGeom) {
      for (const q of [d.from, d.to]) {
        minX = Math.min(minX, q.x);
        minY = Math.min(minY, q.y);
        maxX = Math.max(maxX, q.x);
        maxY = Math.max(maxY, q.y);
      }
    }
    const boxW = Math.max(1, maxX - minX) * 10;
    const boxH = Math.max(1, maxY - minY) * 10;
    const keyFrame = { x: key.x + 10, y: key.y + 16, w: key.w - 20, h: key.h - 26 };
    const keyScale = Math.min(keyFrame.w / boxW, keyFrame.h / boxH);
    const kx = keyFrame.x + (keyFrame.w - boxW * keyScale) / 2 - minX * 10 * keyScale;
    const ky = keyFrame.y + (keyFrame.h - boxH * keyScale) / 2 - minY * 10 * keyScale;
    const kp = (v: number) => kx + v * 10 * keyScale;
    const kq = (v: number) => ky + v * 10 * keyScale;

    const env = drawing.envelope;
    const W = env.widthCm;
    const H = env.heightCm;
    const D = env.depthCm;
    const gp = (x: number, y: number, z: number) => {
      const pt = project(x, y, z);
      return { x: kp(pt.x), y: kq(pt.y) };
    };
    const a = gp(-W / 2, 0, D);
    const bb = gp(W / 2, 0, D);
    const c = gp(W / 2, H, D);
    const d2 = gp(-W / 2, H, D);
    const e = gp(W / 2, 0, 0);
    const f = gp(W / 2, H, 0);
    const g = gp(-W / 2, H, 0);
    const line = (p0: { x: number; y: number }, p1: { x: number; y: number }) =>
      `<line x1="${p(p0.x)}" y1="${p(p0.y)}" x2="${p(p1.x)}" y2="${p(p1.y)}" stroke="#000" stroke-width="0.3"/>`;
    out.push(
      '<g>' + line(a, bb) + line(bb, c) + line(c, d2) + line(d2, a) + line(bb, e) + line(e, f) + line(f, c) + line(f, g) + line(g, d2) + '</g>',
    );

    const keyLayout = layoutDrawing(drawing, {
      frame: keyFrame,
      scale: keyScale,
      originX: kx,
      originY: ky,
      dimOffset: 4,
    });
    out.push(
      `<defs><marker id="ar" markerWidth="5" markerHeight="5" refX="4.6" refY="2.5" orient="auto-start-reverse"><path d="M0,0.5 L4.6,2.5 L0,4.5 z" fill="#000"/></marker></defs>`,
    );
    for (const dim of keyLayout.dims) {
      out.push(
        `<g stroke="#000" stroke-width="0.18"><line x1="${p(dim.witnesses[0].x1)}" y1="${p(dim.witnesses[0].y1)}" x2="${p(dim.witnesses[0].x2)}" y2="${p(dim.witnesses[0].y2)}"/><line x1="${p(dim.witnesses[1].x1)}" y1="${p(dim.witnesses[1].y1)}" x2="${p(dim.witnesses[1].x2)}" y2="${p(dim.witnesses[1].y2)}"/></g>`,
        `<line x1="${p(dim.x1)}" y1="${p(dim.y1)}" x2="${p(dim.x2)}" y2="${p(dim.y2)}" stroke="#000" stroke-width="0.2" marker-start="url(#ar)" marker-end="url(#ar)"/>`,
      );
      const tw = dim.text.length * (DIM_FONT - 0.4) * 0.58;
      out.push(
        `<rect x="${p(dim.textX - tw / 2 - 0.8)}" y="${p(dim.textY - (DIM_FONT - 0.4) * 0.85)}" width="${p(tw + 1.6)}" height="${p((DIM_FONT - 0.4) * 1.3)}" fill="#fff"/>`,
        `<text x="${p(dim.textX)}" y="${p(dim.textY + (DIM_FONT - 0.4) * 0.3)}" font-size="${p(DIM_FONT - 0.4)}" font-family="'Consolas','DejaVu Sans Mono',monospace" text-anchor="middle" fill="#000" transform="rotate(${p(
          dim.textAngle,
        )} ${p(dim.textX)} ${p(dim.textY)})">${esc(dim.text)}</text>`,
      );
    }
    out.push(
      `<text x="${p(key.x + key.w / 2)}" y="${p(key.y + key.h - 3)}" font-size="${FONT_SMALL}" text-anchor="middle" fill="#555">${esc(
        `${t.scale} ${scaleLabel(keyScale)}`,
      )}</text>`,
    );
  }

  /* ---- legend ---- */
  const cols = legendColumns(rtl, INNER.w - 4, t);
  const tableX = INNER.x + 2;
  const tableH = ROW_H * (rows.length + 1);
  out.push(`<rect x="${p(tableX)}" y="${p(legendY)}" width="${p(INNER.w - 4)}" height="${p(tableH)}" fill="none" stroke="#000" stroke-width="0.3"/>`);
  out.push(`<rect x="${p(tableX)}" y="${p(legendY)}" width="${p(INNER.w - 4)}" height="${p(ROW_H)}" fill="#e6e6e6"/>`);
  for (const c of cols) {
    const a = cellAnchor(c, rtl);
    out.push(
      `<text x="${p(tableX + a.x)}" y="${p(legendY + ROW_H * 0.68)}" font-size="${FONT_LEGEND}" font-weight="700" text-anchor="${a.textAnchor}" fill="#000">${esc(
        fit(c.label, c.w - 2, FONT_LEGEND, rtl),
      )}</text>`,
      `<line x1="${p(tableX + c.x)}" y1="${p(legendY)}" x2="${p(tableX + c.x)}" y2="${p(legendY + tableH)}" stroke="#000" stroke-width="0.15"/>`,
    );
  }
  out.push(
    `<line x1="${p(tableX + INNER.w - 4)}" y1="${p(legendY)}" x2="${p(tableX + INNER.w - 4)}" y2="${p(legendY + tableH)}" stroke="#000" stroke-width="0.15"/>`,
    `<line x1="${p(tableX)}" y1="${p(legendY + ROW_H)}" x2="${p(tableX + INNER.w - 4)}" y2="${p(legendY + ROW_H)}" stroke="#000" stroke-width="0.3"/>`,
  );

  const mm = (cm: number): string => {
    const v = Math.round(cm * 100) / 10;
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  };

  rows.forEach((row, i) => {
    const y = legendY + ROW_H * (i + 1);
    if (i > 0) {
      out.push(
        `<line x1="${p(tableX)}" y1="${p(y)}" x2="${p(tableX + INNER.w - 4)}" y2="${p(y)}" stroke="#000" stroke-width="0.1"/>`,
      );
    }
    const edge =
      row.edgeWidthEdge && row.edgeLengthEdge
        ? t.edgeBoth
        : row.edgeWidthEdge
          ? t.edgeW
          : row.edgeLengthEdge
            ? t.edgeL
            : t.none;
    const values: Record<string, string> = {
      no: String(row.componentNo),
      nameFa: row.nameFa,
      nameEn: row.nameEn,
      qty: String(row.totalPieces),
      length: mm(row.length),
      width: mm(row.width),
      thk: mm(row.thickness),
      edge,
      mat: rtl ? row.materialNameFa : row.materialNameEn,
    };
    for (const c of cols) {
      const a = cellAnchor(c, rtl);
      const mono = ['no', 'qty', 'length', 'width', 'thk'].includes(c.key);
      out.push(
        `<text x="${p(tableX + a.x)}" y="${p(y + ROW_H * 0.7)}" font-size="${FONT_LEGEND}" text-anchor="${a.textAnchor}" fill="#000"${
          mono ? ` font-family="'Consolas','DejaVu Sans Mono',monospace"` : ''
        }>${esc(fit(values[c.key] ?? '', c.w - 2.4, FONT_LEGEND, rtl))}</text>`,
      );
    }
  });

  /* ---- footer notes ---- */
  let noteY = notesY;
  for (const line of noteLines) {
    out.push(
      `<text x="${p(rtl ? INNER.x + INNER.w - 2 : INNER.x + 2)}" y="${p(noteY)}" font-size="${FONT_SMALL}" text-anchor="${
        rtl ? 'end' : 'start'
      }" fill="#222">${esc(line)}</text>`,
    );
    noteY += NOTE_LINE;
  }

  /* ---- title block ---- */
  const tbW = INNER.w;
  const tbY = titleY;
  out.push(
    `<rect x="${p(INNER.x)}" y="${p(tbY)}" width="${p(tbW)}" height="${p(titleH)}" fill="none" stroke="#000" stroke-width="0.3"/>`,
    `<line x1="${p(INNER.x)}" y1="${p(tbY + titleH / 2)}" x2="${p(INNER.x + tbW)}" y2="${p(tbY + titleH / 2)}" stroke="#000" stroke-width="0.15"/>`,
  );
  const tb1 = `${t.module}: ${drawing.moduleNo} · ${drawing.quantity} ${t.unitOne} · ${drawing.moduleId}`;
  const env = `${Math.round(drawing.envelope.widthCm * 10)} × ${Math.round(
    drawing.envelope.heightCm * 10,
  )} × ${Math.round(drawing.envelope.depthCm * 10)} mm`;
  const tbText = (text: string, dy: number) =>
    `<text x="${p(rtl ? INNER.x + tbW - 2 : INNER.x + 2)}" y="${p(tbY + dy)}" font-size="${FONT_SMALL}" text-anchor="${
      rtl ? 'end' : 'start'
    }" fill="#000">${esc(text)}</text>`;
  out.push(tbText(tb1, titleH / 2 - 1.6), tbText(env, titleH - 1.6));

  out.push('</svg>');
  return out.join('\n');
}

/** All sheets of a project, each as its own A4 page. */
export function renderExplodedSheetSvgs(sheet: ExplodedSheet, options: SheetOptions): string[] {
  return sheet.drawings.map((d, i) =>
    renderExplodedSvg(d, { ...options, sheetIndex: i + 1, sheetTotal: sheet.drawings.length }),
  );
}
