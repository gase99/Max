import { useMemo, useState } from 'react';
import { convertForDisplay } from '@cabinet/engine';
import { fmt, Card, Hint, PageHead, useToast } from '../ui.js';
import type { Store } from '../store.js';
import { useProjectComputation } from '../selectors.js';
import { downloadFile, toCsv } from '../exporters.js';

export default function CuttingListScreen({ store, t }: { store: Store; t: (k: string) => string }) {
  const { push } = useToast();
  const [merge, setMerge] = useState(false);
  const [material, setMaterial] = useState('all');
  const [moduleId, setModuleId] = useState('all');
  const [role, setRole] = useState('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const comp = useProjectComputation(store.current, merge);
  const unit = store.settings.unit;
  const u = (cm: number) => convertForDisplay(cm, unit);

  const rows = useMemo(() => {
    return comp.rows.filter((r) => {
      if (material !== 'all' && r.materialId !== material) return false;
      if (moduleId !== 'all' && r.moduleId !== moduleId) return false;
      if (role !== 'all' && r.role !== role) return false;
      if (query.trim()) {
        const q = query.trim();
        if (!`${r.nameFa} ${r.nameEn} ${r.moduleLabel}`.includes(q)) return false;
      }
      return true;
    });
  }, [comp.rows, material, moduleId, role, query]);

  const materialName = (id: string) =>
    store.settings.materials.find((m) => m.id === id)?.nameFa ?? id;

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.pieces += r.qty;
        acc.area += r.areaM2;
        acc.band += r.edgeBandLengthM + r.edgeBandWidthM;
        return acc;
      },
      { pieces: 0, area: 0, band: 0 },
    );
  }, [rows]);

  const exportCsv = () => {
    if (rows.length === 0) {
      push(t('cut.empty'), true);
      return;
    }
    const header = [
      'unit', 'part', 'qty', 'length_' + unit, 'width_' + unit,
      'thickness_cm', 'material', 'edge_width', 'edge_length',
      'area_m2', 'edge_band_m', 'formula',
    ];
    const data = rows.map((r) => [
      r.moduleLabel,
      r.nameFa,
      r.qty,
      fmt(u(r.length), 2),
      fmt(u(r.width), 2),
      fmt(r.thickness, 2),
      materialName(r.materialId),
      r.edgeWidthEdge ? 'yes' : 'no',
      r.edgeLengthEdge ? 'yes' : 'no',
      fmt(r.areaM2, 4),
      fmt(r.edgeBandLengthM + r.edgeBandWidthM, 3),
      r.formulaFa,
    ]);
    downloadFile(
      `cutting-list-${store.current?.name ?? 'project'}.csv`,
      toCsv([header, ...data]),
      'text/csv;charset=utf-8',
    );
    push(t('common.export'));
  };

  const roles = [...new Set(comp.rows.map((r) => r.role))];
  const roleLabel: Record<string, string> = {
    base: 'کف', body: 'بدنه', top: 'تاق', shelf: 'طبقه', rail: 'قید',
    back: 'فیبر', door: 'درب', 'drawer-body': 'بدنه کشو',
    'drawer-front': 'جلو کشو', 'drawer-back': 'پشت کشو',
  };

  return (
    <>
      <PageHead title={t('cut.title')} sub={store.current?.name ?? t('toast.noProject')} />

      {comp.rows.length === 0 ? (
        <Hint kind="warn">{t('cut.empty')}</Hint>
      ) : null}

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">{t('dash.parts')}</div>
          <div className="stat-value">{totals.pieces}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('dash.area')}</div>
          <div className="stat-value">
            {fmt(totals.area, 2)}
            <span className="stat-unit">m²</span>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('cut.edge')}</div>
          <div className="stat-value">
            {fmt(totals.band, 1)}
            <span className="stat-unit">m</span>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('cut.module')}</div>
          <div className="stat-value">{new Set(rows.map((r) => r.moduleId)).size}</div>
        </div>
      </div>

      <section className="card">
        <div className="toolbar">
          <input
            type="search"
            placeholder={t('common.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
            <option value="all">{t('cut.filterModule')}: {t('cut.all')}</option>
            {[...new Map(comp.rows.map((r) => [r.moduleId, r.moduleLabel])).entries()].map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <select value={material} onChange={(e) => setMaterial(e.target.value)}>
            <option value="all">{t('cut.filterMaterial')}: {t('cut.all')}</option>
            {[...new Set(comp.rows.map((r) => r.materialId))].map((id) => (
              <option key={id} value={id}>
                {materialName(id)}
              </option>
            ))}
          </select>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="all">{t('cut.filterRole')}: {t('cut.all')}</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {roleLabel[r] ?? r}
              </option>
            ))}
          </select>
          <label className="check">
            <input type="checkbox" checked={merge} onChange={(e) => setMerge(e.target.checked)} />
            {t('cut.merge')}
          </label>
          <div className="row-end" />
          <button className="btn btn-sm" onClick={exportCsv}>
            ⭳ CSV
          </button>
        </div>

        <div className="table-wrap">
          {rows.length === 0 ? (
            <div className="empty">{t('cut.empty')}</div>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>{t('cut.part')}</th>
                  <th>{t('cut.module')}</th>
                  <th>{t('cut.length')} ({unit})</th>
                  <th>{t('cut.width')} ({unit})</th>
                  <th>{t('common.quantity')}</th>
                  <th>{t('cut.material')}</th>
                  <th>{t('cut.edge')}</th>
                  <th>{t('cut.area')} (m²)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td>{r.nameFa}</td>
                    <td className="muted small">{r.moduleLabel}</td>
                    <td className="n">{fmt(u(r.length))}</td>
                    <td className="n">{fmt(u(r.width))}</td>
                    <td className="n">{r.qty}</td>
                    <td className="small">{materialName(r.materialId)}</td>
                    <td className="small muted">
                      {r.edgeWidthEdge ? 'عرض ' : ''}
                      {r.edgeLengthEdge ? 'طول' : ''}
                      {!r.edgeWidthEdge && !r.edgeLengthEdge ? '—' : ''}
                    </td>
                    <td className="n">{fmt(r.areaM2, 3)}</td>
                    <td className="actions">
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => setExpanded(expanded === r.key ? null : r.key)}
                        title={t('cut.source')}
                      >
                        ⓘ
                      </button>
                    </td>
                  </tr>
                ))}
                {expanded ? (
                  <tr>
                    <td colSpan={9} className="small muted" style={{ background: 'var(--bg-2)' }}>
                      <strong>{t('cut.source')}:</strong> {rows.find((x) => x.key === expanded)?.formulaFa}{' '}
                      — {rows.find((x) => x.key === expanded)?.detailFa}
                    </td>
                  </tr>
                ) : null}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>{t('common.total')}</td>
                  <td className="n">{totals.pieces}</td>
                  <td colSpan={2} />
                  <td className="n">{fmt(totals.area, 3)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </section>

      <Card title={t('cut.merge')} sub={t('set.formulaAuditNote')}>
        <p className="small muted" style={{ margin: 0 }}>
          برخلاف شیت‌های «آنالیز» فایل اکسل که دستی تکمیل می‌شدند و ردیف‌های تکراری داشتند، لیست برش این برنامه
          به‌صورت خودکار از قطعات هر واحد ساخته می‌شود. هر ردیف به واحد سازندهٔ خود قابل ردیابی است و ردیف‌های تکراری
          تنها در صورت فعال‌سازی «ادغام قطعات یکسان» و فقط وقتی همهٔ مشخصات تولیدی یکسان باشند با هم جمع می‌شوند.
        </p>
      </Card>
    </>
  );
}
