import { useMemo, useState } from 'react';
import { convertForDisplay } from '@cabinet/engine';
import { fmt, Card, Hint, PageHead, useToast } from '../ui.js';
import type { Store } from '../store.js';
import { computeCosting, computeModule, runOptimisation, useProjectComputation } from '../selectors.js';
import { CabinetDrawing } from '../CabinetDrawing.js';
import { downloadFile, safeFilename, toCsv } from '../exporters.js';

export default function ReportsScreen({ store, t }: { store: Store; t: (k: string) => string }) {
  const { push } = useToast();
  const comp = useProjectComputation(store.current, false);
  const settings = store.settings;
  const unit = settings.unit;
  const u = (cm: number) => convertForDisplay(cm, unit);
  const [showDrawings, setShowDrawings] = useState(true);

  const opt = useMemo(() => (comp.rows.length ? runOptimisation(comp.rows, settings) : null), [comp.rows, settings]);
  const cost = useMemo(() => computeCosting(comp, settings, opt?.sheetCounts), [comp, settings, opt]);

  const exportCutCsv = () => {
    const data = comp.rows.map((r) => [
      r.moduleLabel, r.nameFa, r.qty, fmt(u(r.length), 2), fmt(u(r.width), 2),
      fmt(r.thickness, 2),
      settings.materials.find((m) => m.id === r.materialId)?.nameFa ?? r.materialId,
      r.edgeWidthEdge ? '1' : '0', r.edgeLengthEdge ? '1' : '0',
      fmt(r.areaM2, 4), fmt(r.edgeBandLengthM + r.edgeBandWidthM, 3),
    ]);
    downloadFile(
      `cutting-list-${safeFilename(store.current?.name ?? 'project')}.csv`,
      toCsv([
        ['unit', 'part', 'qty', `length_${unit}`, `width_${unit}`, 'thickness_cm', 'material', 'edge_w', 'edge_l', 'area_m2', 'band_m'],
        ...data,
      ]),
      'text/csv;charset=utf-8',
    );
    push(t('common.export'));
  };

  const exportJson = () => {
    if (!store.current) return;
    downloadFile(
      `project-${safeFilename(store.current.name)}.json`,
      JSON.stringify(store.current, null, 2),
      'application/json',
    );
    push(t('common.export'));
  };

  if (!store.current) {
    return (
      <>
        <PageHead title={t('rep.title')} />
        <Hint kind="warn">{t('toast.noProject')}</Hint>
      </>
    );
  }

  return (
    <>
      <PageHead title={t('rep.title')} sub={store.current.name} />

      <div className="report-actions no-print">
        <button className="btn btn-primary" onClick={() => window.print()}>
          ⎙ {t('rep.printSheet')}
        </button>
        <button className="btn" onClick={exportCutCsv}>
          ⭳ {t('rep.csvCut')}
        </button>
        <button className="btn" onClick={exportJson}>
          ⭳ {t('rep.jsonProject')}
        </button>
        <label className="check">
          <input type="checkbox" checked={showDrawings} onChange={(e) => setShowDrawings(e.target.checked)} />
          {t('rep.drawings')}
        </label>
      </div>

      <div className="print-sheet">
        <h1>{store.current.name}</h1>
        <div className="muted">
          {t('project.customer')}: {store.current.customer || '—'} · {t('common.status')}:{' '}
          {t(`status.${store.current.status}`)} · {new Date().toLocaleDateString('fa-IR')}
        </div>
        <div className="muted small">
          واحد ابعاد: {unit} · {comp.moduleCount} {t('dash.modules')} · {comp.summary.totalPieces} {t('cut.part')} ·{' '}
          {fmt(comp.summary.totalAreaM2, 2)} m²
        </div>

        <h2>{t('cut.title')}</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>{t('cut.module')}</th>
              <th>{t('cut.part')}</th>
              <th>{t('common.quantity')}</th>
              <th>{t('cut.length')} ({unit})</th>
              <th>{t('cut.width')} ({unit})</th>
              <th>{t('cut.material')}</th>
              <th>{t('cut.edge')}</th>
            </tr>
          </thead>
          <tbody>
            {comp.rows.map((r, i) => (
              <tr key={r.key}>
                <td>{i + 1}</td>
                <td>{r.moduleLabel}</td>
                <td>{r.nameFa}</td>
                <td>{r.qty}</td>
                <td>{fmt(u(r.length), 1)}</td>
                <td>{fmt(u(r.width), 1)}</td>
                <td>{settings.materials.find((m) => m.id === r.materialId)?.nameFa ?? r.materialId}</td>
                <td>
                  {r.edgeWidthEdge ? 'ع' : ''}
                  {r.edgeLengthEdge ? 'ط' : ''}
                  {!r.edgeWidthEdge && !r.edgeLengthEdge ? '—' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>{t('price.title')}</h2>
        <table>
          <tbody>
            <tr><th>{t('price.board')}</th><td>{Math.round(cost.boardCost).toLocaleString('en-US')} {cost.currency}</td></tr>
            <tr><th>{t('price.edge')}</th><td>{Math.round(cost.edgeBand.cost).toLocaleString('en-US')} {cost.currency}</td></tr>
            <tr><th>{t('price.subtotal')}</th><td>{Math.round(cost.subtotal).toLocaleString('en-US')} {cost.currency}</td></tr>
            <tr><th>{t('price.quote')}</th><td><strong>{Math.round(cost.quotePrice).toLocaleString('en-US')} {cost.currency}</strong></td></tr>
          </tbody>
        </table>
        {store.current.notes ? (
          <>
            <h2>{t('project.notes')}</h2>
            <div className="muted">{store.current.notes}</div>
          </>
        ) : null}
      </div>

      {showDrawings ? (
        <div className="no-print" style={{ marginTop: 16 }}>
          <Card title={t('rep.drawings')} sub="نماهای دوبعدی از دادهٔ محاسبه‌شده">
            <div className="sheet-grid">
              {store.current.modules.map((m) => {
                const r = computeModule(m);
                return (
                  <div key={m.id} className="sheet-card">
                    <CabinetDrawing result={r} title={m.label} />
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}
