import { fmt, Card, Hint, NumField, PageHead, TextField } from '../ui.js';
import type { Store } from '../store.js';
import { defaultEdgeBands, uid } from '../store.js';

export default function MaterialsScreen({ store, t }: { store: Store; t: (k: string) => string }) {
  const { materials, edgeBands, hardware } = store.settings;

  const patchMaterial = (id: string, p: Record<string, unknown>) =>
    store.setSettings((s) => ({
      ...s,
      materials: s.materials.map((m) => (m.id === id ? { ...m, ...p } : m)),
    }));

  const addMaterial = () =>
    store.setSettings((s) => ({
      ...s,
      materials: [
        ...s.materials,
        {
          id: uid('mat'),
          nameFa: 'متریال جدید',
          nameEn: 'New material',
          thickness: 1.6,
          sheetWidth: 183,
          sheetHeight: 244,
          pricePerSheet: 0,
          grain: false,
          color: '#c8c8c8',
        },
      ],
    }));

  const removeMaterial = (id: string) =>
    store.setSettings((s) => ({ ...s, materials: s.materials.filter((m) => m.id !== id) }));

  return (
    <>
      <PageHead title={t('mat.title')} />

      <Hint>{t('mat.placeholderPrices')}</Hint>

      <Card
        title={t('mat.materials')}
        actions={
          <button className="btn btn-sm btn-primary" onClick={addMaterial}>
            ＋ {t('mat.addMaterial')}
          </button>
        }
        tight
      >
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('cut.thickness')} (cm)</th>
                <th>{t('mat.sheetSize')} (cm)</th>
                <th>{t('mat.decor')}</th>
                <th>{t('mat.grain')}</th>
                <th>{t('mat.pricePerSheet')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {materials.map((m) => (
                <tr key={m.id}>
                  <td>
                    <input type="text" value={m.nameFa} onChange={(e) => patchMaterial(m.id, { nameFa: e.target.value })} />
                  </td>
                  <td style={{ width: 90 }}>
                    <input
                      type="text"
                      dir="ltr"
                      className="mono-cell"
                      value={m.thickness}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isFinite(n)) patchMaterial(m.id, { thickness: n });
                      }}
                    />
                  </td>
                  <td>
                    <div className="row" style={{ gap: 5, flexWrap: 'nowrap' }}>
                      <input
                        type="number"
                        style={{ width: 70 }}
                        value={m.sheetWidth}
                        onChange={(e) => patchMaterial(m.id, { sheetWidth: Number(e.target.value) })}
                      />
                      <span className="dim">×</span>
                      <input
                        type="number"
                        style={{ width: 70 }}
                        value={m.sheetHeight}
                        onChange={(e) => patchMaterial(m.id, { sheetHeight: Number(e.target.value) })}
                      />
                    </div>
                  </td>
                  <td style={{ width: 110 }}>
                    <input
                      type="text"
                      value={m.decor ?? ''}
                      onChange={(e) => patchMaterial(m.id, { decor: e.target.value })}
                    />
                  </td>
                  <td>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={m.grain}
                        onChange={(e) => patchMaterial(m.id, { grain: e.target.checked })}
                      />
                    </label>
                  </td>
                  <td style={{ width: 130 }}>
                    <input
                      type="number"
                      value={m.pricePerSheet}
                      onChange={(e) => patchMaterial(m.id, { pricePerSheet: Number(e.target.value) })}
                    />
                  </td>
                  <td className="actions">
                    <button className="btn btn-sm btn-danger" onClick={() => removeMaterial(m.id)}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="split-2">
        <Card
          title={t('mat.edgeBands')}
          actions={
            <button
              className="btn btn-sm"
              onClick={() =>
                store.setSettings((s) => ({
                  ...s,
                  edgeBands: [...s.edgeBands, { id: uid('band'), nameFa: 'نوار جدید', thickness: 0.2, pricePerMeter: 0 }],
                }))
              }
            >
              ＋ {t('common.add')}
            </button>
          }
          tight
        >
          <table className="data">
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('cut.thickness')} (cm)</th>
                <th>{t('mat.pricePerMeter')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {edgeBands.map((b) => (
                <tr key={b.id}>
                  <td>
                    <input
                      type="text"
                      value={b.nameFa}
                      onChange={(e) =>
                        store.setSettings((s) => ({
                          ...s,
                          edgeBands: s.edgeBands.map((x) => (x.id === b.id ? { ...x, nameFa: e.target.value } : x)),
                        }))
                      }
                    />
                  </td>
                  <td style={{ width: 90 }}>
                    <input
                      type="number"
                      step="0.01"
                      value={b.thickness}
                      onChange={(e) =>
                        store.setSettings((s) => ({
                          ...s,
                          edgeBands: s.edgeBands.map((x) => (x.id === b.id ? { ...x, thickness: Number(e.target.value) } : x)),
                        }))
                      }
                    />
                  </td>
                  <td style={{ width: 120 }}>
                    <input
                      type="number"
                      value={b.pricePerMeter}
                      onChange={(e) =>
                        store.setSettings((s) => ({
                          ...s,
                          edgeBands: s.edgeBands.map((x) => (x.id === b.id ? { ...x, pricePerMeter: Number(e.target.value) } : x)),
                        }))
                      }
                    />
                  </td>
                  <td className="actions">
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() =>
                        store.setSettings((s) => ({ ...s, edgeBands: s.edgeBands.filter((x) => x.id !== b.id) }))
                      }
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title={t('mat.hardware')} tight>
          <table className="data">
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('common.unit')}</th>
                <th>{t('mat.pricePerMeter')}</th>
              </tr>
            </thead>
            <tbody>
              {hardware.map((h) => (
                <tr key={h.id}>
                  <td>{h.nameFa}</td>
                  <td className="small muted">{h.unit}</td>
                  <td style={{ width: 120 }}>
                    <input
                      type="number"
                      value={h.unitPrice}
                      onChange={(e) =>
                        store.setSettings((s) => ({
                          ...s,
                          hardware: s.hardware.map((x) => (x.id === h.id ? { ...x, unitPrice: Number(e.target.value) } : x)),
                        }))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <p className="dim small">
        واحد ضخامت در این جدول سانتی‌متر است (۱٫۶ = ۱۶ میلی‌متر). هنگام محاسبهٔ بهینه‌سازی، ابعاد ورق هر متریال از
        همین جدول خوانده می‌شود؛ در نبود متریال، ابعاد پیش‌فرض کارگاه ({fmt(store.settings.sheet.width)}×
        {fmt(store.settings.sheet.height)}) استفاده می‌شود.
      </p>
    </>
  );
}
