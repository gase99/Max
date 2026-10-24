import { useMemo } from 'react';
import { fmt, Card, Hint, NumField, PageHead, TextField } from '../ui.js';
import type { Store } from '../store.js';
import { computeCosting, runOptimisation, useProjectComputation } from '../selectors.js';

export default function PricingScreen({ store, t }: { store: Store; t: (k: string) => string }) {
  const comp = useProjectComputation(store.current, false);
  const settings = store.settings;

  const opt = useMemo(() => (comp.rows.length ? runOptimisation(comp.rows, settings) : null), [comp.rows, settings]);
  const cost = useMemo(
    () => computeCosting(comp, settings, opt?.sheetCounts),
    [comp, settings, opt],
  );

  const setPricing = (p: Record<string, unknown>) =>
    store.setSettings((s) => ({ ...s, pricing: { ...s.pricing, ...p } }));

  const c = cost.currency;

  const line = (label: string, value: number) => (
    <tr>
      <td>{label}</td>
      <td className="n">{Math.round(value).toLocaleString('en-US')}</td>
      <td className="small muted">{c}</td>
    </tr>
  );

  return (
    <>
      <PageHead title={t('price.title')} sub={store.current?.name} />

      <Hint>{t('mat.placeholderPrices')}</Hint>

      <Card title={t('set.title')}>
        <div className="form-grid">
          <TextField label={t('price.currency')} value={settings.pricing.currency} onChange={(v) => setPricing({ currency: v })} />
          <NumField
            label={t('price.waste')}
            value={Math.round(settings.pricing.wasteFactor * 1000) / 10}
            step={1}
            min={0}
            unit="%"
            onChange={(v) => setPricing({ wasteFactor: v / 100 })}
          />
          <NumField
            label={`${t('cut.edge')} — ${t('price.waste')}`}
            value={Math.round(settings.pricing.edgeBandWasteFactor * 1000) / 10}
            step={1}
            min={0}
            unit="%"
            onChange={(v) => setPricing({ edgeBandWasteFactor: v / 100 })}
          />
          <NumField
            label={t('price.markup')}
            value={Math.round(settings.pricing.markup * 1000) / 10}
            step={5}
            min={0}
            unit="%"
            onChange={(v) => setPricing({ markup: v / 100 })}
          />
          <NumField
            label={t('price.tax')}
            value={Math.round(settings.pricing.taxRate * 1000) / 10}
            step={1}
            min={0}
            unit="%"
            onChange={(v) => setPricing({ taxRate: v / 100 })}
          />
          <NumField
            label={t('price.transport')}
            value={settings.pricing.transport}
            step={1000}
            min={0}
            onChange={(v) => setPricing({ transport: v })}
          />
          <NumField
            label={t('price.installation')}
            value={settings.pricing.installation}
            step={1000}
            min={0}
            onChange={(v) => setPricing({ installation: v })}
          />
        </div>
      </Card>

      <div className="split-2">
        <Card title={t('price.board')} tight>
          <table className="data">
            <thead>
              <tr>
                <th>{t('cut.material')}</th>
                <th>{t('opt.sheets')}</th>
                <th>{t('mat.pricePerSheet')}</th>
                <th>{t('common.total')}</th>
              </tr>
            </thead>
            <tbody>
              {cost.boards.length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty">
                    {t('cut.empty')}
                  </td>
                </tr>
              ) : (
                cost.boards.map((b) => {
                  const name = settings.materials.find((m) => m.id === b.materialId)?.nameFa ?? b.materialId;
                  return (
                    <tr key={b.materialId + b.thickness}>
                      <td>
                        {name}
                        <div className="dim small">
                          {fmt(b.thickness)} cm · {b.method === 'optimiser' ? 'بهینه‌سازی' : 'تخمین مساحت'}
                        </div>
                      </td>
                      <td className="n">{b.sheetsUsed}</td>
                      <td className="n">{Math.round(b.pricePerSheet).toLocaleString('en-US')}</td>
                      <td className="n">{Math.round(b.cost).toLocaleString('en-US')}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </Card>

        <Card title={t('price.quote')} tight>
          <table className="data">
            <tbody>
              {line(t('price.board'), cost.boardCost)}
              {line(`${t('price.edge')} (${fmt(cost.edgeBand.grossMeters, 1)} m)`, cost.edgeBand.cost)}
              {line(t('price.hardware'), cost.hardwareCost)}
              {line(t('price.labor'), cost.laborCost)}
              {line(t('price.transport'), cost.transport)}
              {line(t('price.installation'), cost.installation)}
            </tbody>
            <tfoot>
              {line(t('price.subtotal'), cost.subtotal)}
              {line(`${t('price.markup')} ${fmt(cost.markup * 100, 0)}%`, cost.profit)}
              {line(t('price.tax'), cost.tax)}
              {line(t('price.quote'), cost.quotePrice)}
            </tfoot>
          </table>
        </Card>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">{t('price.margin')}</div>
          <div className="stat-value">{fmt(cost.marginPercent, 1)}<span className="stat-unit">%</span></div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('price.profit')}</div>
          <div className="stat-value">{Math.round(cost.profit).toLocaleString('en-US')}<span className="stat-unit">{c}</span></div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('price.waste')}</div>
          <div className="stat-value">{Math.round(cost.wasteCostIncluded).toLocaleString('en-US')}<span className="stat-unit">{c}</span></div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('cut.edge')}</div>
          <div className="stat-value">{fmt(cost.edgeBand.grossMeters, 1)}<span className="stat-unit">m</span></div>
        </div>
      </div>

      {cost.notesFa.length > 0 ? (
        <Card title={t('common.notes')}>
          <ul style={{ margin: 0, paddingInlineStart: 18 }}>
            {cost.notesFa.map((n, i) => (
              <li key={i} className="small muted">
                {n}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
