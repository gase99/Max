import { fmt } from './ui.js';
import type { ModuleResult } from './selectors.js';

/**
 * 2D technical views derived from the calculated cabinet data only.
 *
 * FRONT  — overall width × overall height, door leaf divisions, shelf lines.
 * SIDE   — depth × height, with the shelf positions projected.
 * PLAN   — width × depth.
 *
 * Everything is drawn in centimetres with a scale factor; the drawing never
 * invents a dimension that the calculation engine did not produce. When the
 * data needed for a view is missing (e.g. door tier out of range) the view is
 * omitted rather than guessed.
 */
export function CabinetDrawing({ result, title }: { result: ModuleResult; title: string }) {
  const S = 4; // px per cm in the drawing's local coordinate system
  const pad = 16;
  const dimOffset = 9;

  if (result.kind === 'drawer') {
    return <DrawerDrawing result={result} title={title} />;
  }

  const width = result.input.width;
  const height =
    result.kind === 'ground'
      ? result.input.bodyLength
      : result.input.bodyLength;
  const depth = result.kind === 'ground' ? result.input.bodyWidth : result.input.bodyWidth;

  if (!(width > 0) || !(height > 0) || !(depth > 0)) {
    return <div className="empty">برای این واحد ابعاد کافی برای ترسیم وجود ندارد.</div>;
  }

  const doorCount = result.derived.doorCount === '' ? 0 : Number(result.derived.doorCount);
  const shelfCount = result.kind === 'ground' ? result.input.shelfCount : result.input.shelfCount;

  const frontW = width * S;
  const frontH = height * S;
  const sideW = depth * S;
  const planH = depth * S;

  const gap = 26;
  const svgW = pad * 2 + frontW + gap + sideW + dimOffset * 2 + 6;
  const svgH = pad * 2 + Math.max(frontH, planH + 20) + dimOffset * 2 + 22;

  const fx = pad + dimOffset;
  const fy = pad + dimOffset;

  return (
    <svg className="drawing-svg" viewBox={`0 0 ${svgW} ${svgH}`} style={{ maxWidth: svgW, margin: '0 auto' }}>
      <defs>
        <marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 z" fill="#333" />
        </marker>
      </defs>

      <text x={svgW / 2} y={12} textAnchor="middle" fontSize="8" fill="#111" fontWeight="600">
        {title} — نمای جلو
      </text>

      {/* FRONT VIEW */}
      <rect x={fx} y={fy} width={frontW} height={frontH} fill="#fff" stroke="#222" strokeWidth={0.8} />
      {/* door leaves */}
      {doorCount > 0
        ? Array.from({ length: doorCount }).map((_, i) => {
            const leafW = frontW / doorCount;
            return (
              <rect
                key={i}
                x={fx + i * leafW + 1}
                y={fy + 1}
                width={leafW - 2}
                height={frontH - 2}
                fill="none"
                stroke="#888"
                strokeWidth={0.4}
                strokeDasharray="2 1.5"
              />
            );
          })
        : null}
      {/* shelf lines */}
      {Array.from({ length: Math.max(0, shelfCount) }).map((_, i) => {
        const y = fy + ((i + 1) * frontH) / (shelfCount + 1);
        return <line key={i} x1={fx} y1={y} x2={fx + frontW} y2={y} stroke="#bbb" strokeWidth={0.5} strokeDasharray="3 2" />;
      })}

      {/* width dimension */}
      <line x1={fx} y1={fy - 6} x2={fx + frontW} y2={fy - 6} stroke="#333" strokeWidth={0.4} markerStart="url(#arr)" markerEnd="url(#arr)" />
      <text x={fx + frontW / 2} y={fy - 9} textAnchor="middle" fontSize="6.5" fill="#111" fontFamily="monospace">
        {fmt(width)}
      </text>

      {/* height dimension */}
      <line x1={fx - 6} y1={fy} x2={fx - 6} y2={fy + frontH} stroke="#333" strokeWidth={0.4} markerStart="url(#arr)" markerEnd="url(#arr)" />
      <text x={fx - 9} y={fy + frontH / 2} textAnchor="middle" fontSize="6.5" fill="#111" fontFamily="monospace" transform={`rotate(-90 ${fx - 9} ${fy + frontH / 2})`}>
        {fmt(height)}
      </text>

      {/* SIDE VIEW */}
      <text x={fx + frontW + gap + sideW / 2} y={12} textAnchor="middle" fontSize="8" fill="#111" fontWeight="600">
        نمای جانبی
      </text>
      <rect x={fx + frontW + gap} y={fy} width={sideW} height={frontH} fill="#fff" stroke="#222" strokeWidth={0.8} />
      {/* depth dimension */}
      <line
        x1={fx + frontW + gap}
        y1={fy - 6}
        x2={fx + frontW + gap + sideW}
        y2={fy - 6}
        stroke="#333"
        strokeWidth={0.4}
        markerStart="url(#arr)"
        markerEnd="url(#arr)"
      />
      <text x={fx + frontW + gap + sideW / 2} y={fy - 9} textAnchor="middle" fontSize="6.5" fill="#111" fontFamily="monospace">
        {fmt(depth)}
      </text>

      {/* PLAN VIEW (below the front view) */}
      <text x={fx + frontW / 2} y={fy + frontH + 14} textAnchor="middle" fontSize="8" fill="#111" fontWeight="600">
        نمای از بالا
      </text>
      <rect x={fx} y={fy + frontH + 18} width={frontW} height={planH} fill="#fff" stroke="#222" strokeWidth={0.8} />
      <line
        x1={fx}
        y1={fy + frontH + 18 + planH + 5}
        x2={fx + frontW}
        y2={fy + frontH + 18 + planH + 5}
        stroke="#333"
        strokeWidth={0.4}
        markerStart="url(#arr)"
        markerEnd="url(#arr)"
      />
      <text x={fx + frontW / 2} y={fy + frontH + 18 + planH + 14} textAnchor="middle" fontSize="6.5" fill="#111" fontFamily="monospace">
        {fmt(width)} × {fmt(depth)}
      </text>
    </svg>
  );
}

function DrawerDrawing({
  result,
  title,
}: {
  result: Extract<ModuleResult, { kind: 'drawer' }>;
  title: string;
}) {
  const S = 4;
  const pad = 14;
  const { derived, input } = result;
  const W = Math.max(derived.frontLength, 1) * S;
  const H = Math.max(input.height, 1) * S;
  const svgW = W + pad * 2 + 20;
  const svgH = H + pad * 2 + 20;
  const x = pad + 12;
  const y = pad + 8;

  return (
    <svg className="drawing-svg" viewBox={`0 0 ${svgW} ${svgH}`} style={{ maxWidth: svgW, margin: '0 auto' }}>
      <text x={svgW / 2} y={10} textAnchor="middle" fontSize="8" fontWeight="600">
        {title}
      </text>
      <rect x={x} y={y} width={W} height={H} fill="#fff" stroke="#222" strokeWidth={0.8} />
      <text x={W / 2 + x} y={H / 2 + y} textAnchor="middle" fontSize="7" fontFamily="monospace" fill="#111">
        {fmt(derived.frontLength)} × {fmt(input.height)}
      </text>
      <text x={svgW / 2} y={svgH - 5} textAnchor="middle" fontSize="6.5" fill="#555">
        جلو کشو — عرض بدنه کشو {fmt(derived.bodyWidth)} · عمق {fmt(derived.bodyLength)}
      </text>
    </svg>
  );
}
