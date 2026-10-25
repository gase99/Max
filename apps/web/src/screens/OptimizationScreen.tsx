import { useMemo, useState } from 'react';
import { fmt, Card, Hint, NumField, PageHead, useToast } from '../ui.js';
import type { Store } from '../store.js';
import { runOptimisation, useProjectComputation } from '../selectors.js';
import type { SheetLayout } from '@cabinet/engine';
import { downloadFile, toCsv } from '../exporters.js';

export default function OptimizationScreen({ store, t }: { store: Store; t: (k: string) => string }) {
  const { push } = useToast();
  const comp = useProjectComputation(store.current, false);
  const [ran, setRan] = useState(false);
  const settings = store.settings;

  const opt = useMemo(
    () => (ran ? runOptimisation(comp.rows, settings) : null),
    [ran, comp.rows, settings],
  );

  const setSheet = (p: Partial<typeof settings.sheet>) =>
    store.setSettings((s) => ({ ...s, sheet: { ...s.sheet, ...p } }));

  const totalSheets = opt ? [...opt.sheetCounts.values()].reduce((a, b) => a + b, 0) : 0;
  const totalPartArea = opt ? opt.byGroup.reduce((s, g) => s + g.result.totalPartArea, 0) : 0;
  const totalSheetArea = opt ? opt.byGroup.reduce((s, g) => s + g.result.totalSheetArea, 0) : 0;
  const util = totalSheetArea > 0 ? (totalPartArea / totalSheetArea) * 100 : 0;

  const exportCsv = () => {
    if (!opt) return;
    const rows: (string | number)[][] = [
      ['material', 'thickness_cm', 'sheet', 'part', 'x', 'y', 'w', 'h', 'rotated'],
    ];
    for (const g of opt.byGroup) {
      g.result.sheets.forEach((sh) => {
        sh.placements.forEach((p) => {
          rows.push([g.materialId, g.thickness, sh.index + 1, p.label, fmt(p.x, 2), fmt(p.y, 2), fmt(p.w, 2), fmt(p.h, 2), p.rotated ? 'yes' : 'no']);
        });
      });
    }
    downloadFile(`sheet-layout-${store.current?.name ?? 'project'}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
    push(t('common.export'));
  };

  return (
    <>
      <PageHead title={t('opt.title')} sub={t('opt.theoretical')} />

      {comp.rows.length === 0 ? <Hint kind="warn">{t('opt.empty')}</Hint> : null}

      <Card title={t('opt.title')}>
        <div className="form-grid">
          <NumField label={t('opt.sheetW')} value={settings.sheet.width} onChange={(v) => setSheet({ width: v })} unit="cm" />
          <NumField label={t('opt.sheetH')} value={settings.sheet.height} onChange={(v) => setSheet({ height: v })} unit="cm" />
          <NumField label={t('opt.kerf')} value={settings.sheet.kerf} step={0.1} min={0} onChange={(v) => setSheet({ kerf: v })} unit="cm" />
          <NumField label={t('opt.trim')} value={settings.sheet.trim} step={0.5} min={0} onChange={(v) => setSheet({ trim: v })} unit="cm" />
          <div className="field">
            <label>{t('opt.rotate')}</label>
            <label className="check">
              <input
                type="checkbox"
                checked={settings.sheet.allowRotation}
                onChange={(e) => setSheet({ allowRotation: e.target.checked })}
              />
              {settings.sheet.allowRotation ? t('common.yes') : t('common.no')}
            </label>
          </div>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn btn-primary" onClick={() => setRan(true)} disabled={comp.rows.length === 0}>
            ▶ {t('opt.run')}
          </button>
          {opt ? (
            <button className="btn btn-sm" onClick={exportCsv}>
              ⭳ {t('rep.csvOpt')}
            </button>
          ) : null}
        </div>
      </Card>

      {opt ? (
        <>
          <div className="stat-grid">
            <div className="stat">
              <div className="stat-label">{t('opt.sheets')}</div>
              <div className="stat-value">{totalSheets}</div>
            </div>
            <div className="stat">
              <div className="stat-label">{t('opt.util')}</div>
              <div className="stat-value">{fmt(util, 1)}<span className="stat-unit">%</span></div>
            </div>
            <div className="stat">
              <div className="stat-label">{t('opt.waste')}</div>
              <div className="stat-value">{fmt(100 - util, 1)}<span className="stat-unit">%</span></div>
            </div>
            <div className="stat">
              <div className="stat-label">{t('dash.area')}</div>
              <div className="stat-value">{fmt(totalPartArea / 10000, 2)}<span className="stat-unit">m²</span></div>
            </div>
          </div>

          {opt.byGroup.map((g) => {
            const mat = settings.materials.find((m) => m.id === g.materialId);
            return (
              <Card
                key={g.key}
                title={`${mat?.nameFa ?? g.materialId} — ${fmt(g.thickness)} cm`}
                sub={`${g.result.sheetCount} ${t('opt.sheets')} · ${fmt(g.result.utilisation * 100, 1)}% ${t('opt.util')}`}
              >
                {g.result.unplaced.length > 0 ? (
                  <Hint kind="err">
                    <strong>{t('opt.unplaced')}:</strong>
                    <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
                      {g.result.unplaced.map((u, i) => (
                        <li key={i}>
                          {u.label} — {u.reasonFa}
                        </li>
                      ))}
                    </ul>
                  </Hint>
                ) : null}
                {g.result.sheets.length === 0 ? (
                  <div className="empty">{t('opt.empty')}</div>
                ) : (
                  <div className="sheet-grid">
                    {g.result.sheets.map((s) => (
                      <SheetView key={s.index} sheet={s} spec={{ w: settings.sheet.width, h: settings.sheet.height }} color={mat?.color} />
                    ))}
                  </div>
                )}
                <p className="dim small" style={{ marginBottom: 0 }}>
                  {g.result.notesFa.join(' · ')}
                </p>
              </Card>
            );
          })}
        </>
      ) : null}
    </>
  );
}

function SheetView({
  sheet,
  spec,
  color,
}: {
  sheet: SheetLayout;
  spec: { w: number; h: number };
  color?: string;
}) {
  const pad = 2;
  const vbW = spec.w + pad * 2;
  const vbH = spec.h + pad * 2;
  return (
    <div className="sheet-card">
      <div className="sheet-card-head">
        <span>
          ورق #{sheet.index + 1} — {sheet.placements.length} قطعه
        </span>
        <span>{fmt(sheet.utilisation * 100, 1)}%</span>
      </div>
      <svg className="sheet-svg" viewBox={`0 0 ${vbW} ${vbH}`} preserveAspectRatio="xMidYMid meet">
        <rect className="sheet-border" x={0} y={0} width={spec.w} height={spec.h} />
        {sheet.placements.map((p, i) => (
          <g key={i}>
            <rect
              className="part-rect"
              x={p.x}
              y={p.y}
              width={p.w}
              height={p.h}
              style={color ? { fill: color, fillOpacity: 0.32, stroke: color } : undefined}
            >
              <title>{`${p.label} — ${fmt(p.w)}×${fmt(p.h)}`}</title>
            </rect>
            {p.w > 12 && p.h > 6 ? (
              <text className="part-label" x={p.x + p.w / 2} y={p.y + p.h / 2} textAnchor="middle" dominantBaseline="middle">
                {fmt(p.w, 0)}×{fmt(p.h, 0)}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  );
}
