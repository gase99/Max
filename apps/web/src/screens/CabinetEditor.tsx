import { useMemo } from 'react';
import {
  emptyDrawer,
  emptyGroundCabinet,
  emptyWallCabinet,
  cmToMm,
} from '@cabinet/engine';
import type {
  DrawerInput,
  GroundCabinetInput,
  WallCabinetInput,
  PanelPart,
} from '@cabinet/engine';
import { fmt, Hint, NumField, PageHead, useToast } from '../ui.js';
import { uid } from '../store.js';
import type { ModuleEntry, Store } from '../store.js';
import { computeModule } from '../selectors.js';

type Kind = 'ground' | 'wall' | 'drawer';

export default function CabinetEditor({
  store,
  t,
  kind,
  activeModuleId,
  setActiveModuleId,
}: {
  store: Store;
  t: (k: string) => string;
  kind: Kind;
  activeModuleId: string | null;
  setActiveModuleId: (id: string | null) => void;
}) {
  const { push } = useToast();
  const project = store.current;
  const modules = useMemo(
    () => (project ? project.modules.filter((m) => m.kind === kind) : []),
    [project, kind],
  );

  const active = useMemo(() => {
    if (modules.length === 0) return null;
    return modules.find((m) => m.id === activeModuleId) ?? modules[0];
  }, [modules, activeModuleId]);

  const addUnit = () => {
    if (!project) {
      push(t('toast.noProject'), true);
      return;
    }
    const base = { id: uid('mod'), quantity: 1 };
    let entry: ModuleEntry;
    if (kind === 'ground') {
      entry = { ...base, kind, label: 'کابینت زمینی', input: emptyGroundCabinet() };
    } else if (kind === 'wall') {
      entry = { ...base, kind, label: 'کابینت هوایی', input: emptyWallCabinet() };
    } else {
      entry = { ...base, kind, label: 'کشو', input: emptyDrawer() };
    }
    store.addModule(entry);
    setActiveModuleId(entry.id);
    push(t('toast.saved'));
  };

  if (!project) {
    return (
      <>
        <PageHead title={t(`${kind === 'drawer' ? 'drawer' : kind}.title`)} />
        <Hint kind="warn">{t('toast.noProject')}</Hint>
      </>
    );
  }

  return (
    <>
      <PageHead
        title={t(`${kind === 'drawer' ? 'drawer' : kind}.title`)}
        sub={t(`${kind === 'drawer' ? 'drawer' : kind}.hint`)}
      />

      <div className="split-2">
        <section className="card" style={{ marginBottom: 16 }}>
          <header className="card-head">
            <div>
              <div className="card-title">{t('dash.modules')}</div>
              <div className="card-sub">
                {modules.length} · {project.name}
              </div>
            </div>
            <div className="card-actions">
              <button className="btn btn-sm btn-primary" onClick={addUnit}>
                ＋ {t('common.add')}
              </button>
            </div>
          </header>
          <div className="card-body tight">
            {modules.length === 0 ? (
              <div className="empty">{t('cut.empty')}</div>
            ) : (
              modules.map((m) => {
                const r = computeModule(m);
                const bad = r.warnings.some((w) => w.severity === 'error');
                return (
                  <div
                    key={m.id}
                    className="module-item"
                    style={{
                      cursor: 'pointer',
                      background: active?.id === m.id ? 'rgba(240,167,42,.07)' : undefined,
                    }}
                    onClick={() => setActiveModuleId(m.id)}
                  >
                    <div>
                      <div className="module-name">
                        {m.label}
                        {bad ? <span className="chip err" style={{ marginInlineStart: 8 }}>{t('common.error')}</span> : null}
                      </div>
                      <div className="module-meta">
                        {t('common.quantity')}: {m.quantity} · {r.parts.length} {t('cut.part')}
                      </div>
                    </div>
                    <div className="row" onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-sm" onClick={() => store.duplicateModule(m.id)} title={t('common.duplicate')}>
                        ⧉
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => {
                          if (confirm(`${t('common.delete')} — ${m.label}?`)) {
                            store.deleteModule(m.id);
                            push(t('toast.deleted'));
                          }
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {active ? (
          <UnitEditor
            key={active.id}
            module={active}
            kind={kind}
            store={store}
            t={t}
          />
        ) : (
          <div />
        )}
      </div>

      {active ? <UnitResults module={active} kind={kind} t={t} /> : null}
    </>
  );
}

/* ------------------------------------------------------------------ */

function UnitEditor({
  module,
  kind,
  store,
  t,
}: {
  module: ModuleEntry;
  kind: Kind;
  store: Store;
  t: (k: string) => string;
}) {
  const patch = (p: Partial<ModuleEntry>) => store.updateModule(module.id, p);
  const patchInput = (p: Record<string, unknown>) =>
    patch({ input: { ...(module.input as unknown as Record<string, unknown>), ...p } as unknown as ModuleEntry['input'] });

  const unit = (label: string) => `${label}`;

  const materialOptions = store.settings.materials.map((m) => ({ value: m.id, label: m.nameFa }));

  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <header className="card-head">
        <div className="card-title">{t('common.edit')} — {module.label}</div>
      </header>
      <div className="card-body">
        <div className="form-grid">
          <div className="field">
            <label htmlFor={`lbl-${module.id}`}>{t('common.name')}</label>
            <input
              id={`lbl-${module.id}`}
              type="text"
              value={module.label}
              onChange={(e) => patch({ label: e.target.value })}
            />
          </div>
          <NumField
            label={t('common.quantity')}
            value={module.quantity}
            step={1}
            min={0}
            onChange={(v) => patch({ quantity: Math.max(0, Math.round(v)) })}
          />
          <div className="field">
            <label htmlFor={`mat-${module.id}`}>{t('cut.material')}</label>
            <select
              id={`mat-${module.id}`}
              value={(module.input as { materialId: string }).materialId}
              onChange={(e) => {
                const mat = store.settings.materials.find((x) => x.id === e.target.value);
                patchInput({
                  materialId: e.target.value,
                  ...(mat ? { thickness: mat.thickness } : {}),
                });
              }}
            >
              {materialOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <hr className="sep" />

        {kind === 'ground' ? (
          <GroundFields input={module.input as GroundCabinetInput} patchInput={patchInput} t={t} unit={unit} />
        ) : null}
        {kind === 'wall' ? (
          <WallFields input={module.input as WallCabinetInput} patchInput={patchInput} t={t} unit={unit} />
        ) : null}
        {kind === 'drawer' ? (
          <DrawerFields input={module.input as DrawerInput} patchInput={patchInput} t={t} unit={unit} />
        ) : null}
      </div>
    </section>
  );
}

type PatchInput = (p: Record<string, unknown>) => void;

function EdgeRow({
  label,
  flags,
  onEdge,
}: {
  label: string;
  flags: { widthEdge: boolean; lengthEdge: boolean };
  onEdge: (e: { widthEdge: boolean; lengthEdge: boolean }) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="row" style={{ gap: 12 }}>
        <label className="check">
          <input
            type="checkbox"
            checked={flags.widthEdge}
            onChange={(e) => onEdge({ ...flags, widthEdge: e.target.checked })}
          />
          عرض
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={flags.lengthEdge}
            onChange={(e) => onEdge({ ...flags, lengthEdge: e.target.checked })}
          />
          طول
        </label>
      </div>
    </div>
  );
}

function GroundFields({
  input,
  patchInput,
  t,
  unit,
}: {
  input: GroundCabinetInput;
  patchInput: PatchInput;
  t: (k: string) => string;
  unit: (s: string) => string;
}) {
  return (
    <div className="form-grid">
      <NumField label="عرض کابینت (B)" value={input.width} onChange={(v) => patchInput({ width: v })} unit={unit('cm')} />
      <NumField label="کف — عرض" value={input.baseWidth} onChange={(v) => patchInput({ baseWidth: v })} unit={unit('cm')} />
      <NumField label="کف — تعداد" value={input.baseCount} step={1} min={0} onChange={(v) => patchInput({ baseCount: Math.round(v) })} />
      <EdgeRow label="کف — نوار لبه" flags={input.baseEdges} onEdge={(e) => patchInput({ baseEdges: e })} />
      <NumField label="بدنه — عرض" value={input.bodyWidth} onChange={(v) => patchInput({ bodyWidth: v })} unit={unit('cm')} />
      <NumField label="بدنه — طول" value={input.bodyLength} onChange={(v) => patchInput({ bodyLength: v })} unit={unit('cm')} />
      <NumField label="بدنه — تعداد" value={input.bodyCount} step={1} min={0} onChange={(v) => patchInput({ bodyCount: Math.round(v) })} />
      <EdgeRow label="بدنه — نوار لبه" flags={input.bodyEdges} onEdge={(e) => patchInput({ bodyEdges: e })} />
      <NumField label="طبقه — عرض" value={input.shelfWidth} onChange={(v) => patchInput({ shelfWidth: v })} unit={unit('cm')} />
      <NumField label="طبقه — تعداد" value={input.shelfCount} step={1} min={0} onChange={(v) => patchInput({ shelfCount: Math.round(v) })} />
      <EdgeRow label="طبقه — نوار لبه" flags={input.shelfEdges} onEdge={(e) => patchInput({ shelfEdges: e })} />
      <NumField label="قید — عرض" value={input.railWidth} onChange={(v) => patchInput({ railWidth: v })} unit={unit('cm')} />
      <NumField label="قید — تعداد" value={input.railCount} step={1} min={0} onChange={(v) => patchInput({ railCount: Math.round(v) })} />
      <EdgeRow label="قید — نوار لبه" flags={input.railEdges} onEdge={(e) => patchInput({ railEdges: e })} />
      <NumField label="ارتفاع درب" value={input.doorHeight} onChange={(v) => patchInput({ doorHeight: v })} unit={unit('cm')} />
      <NumField label="فیبر ۳ میل — تعداد" value={input.backCount} step={1} min={0} onChange={(v) => patchInput({ backCount: Math.round(v) })} />
    </div>
  );
}

function WallFields({
  input,
  patchInput,
  t,
  unit,
}: {
  input: WallCabinetInput;
  patchInput: PatchInput;
  t: (k: string) => string;
  unit: (s: string) => string;
}) {
  return (
    <div className="form-grid">
      <NumField label="عرض کابینت (B)" value={input.width} onChange={(v) => patchInput({ width: v })} unit={unit('cm')} />
      <NumField label="بدنه — عرض" value={input.bodyWidth} onChange={(v) => patchInput({ bodyWidth: v })} unit={unit('cm')} />
      <NumField label="بدنه — طول" value={input.bodyLength} onChange={(v) => patchInput({ bodyLength: v })} unit={unit('cm')} />
      <NumField label="بدنه — تعداد" value={input.bodyCount} step={1} min={0} onChange={(v) => patchInput({ bodyCount: Math.round(v) })} />
      <EdgeRow label="بدنه — نوار لبه" flags={input.bodyEdges} onEdge={(e) => patchInput({ bodyEdges: e })} />
      <NumField label="کف — عرض" value={input.baseWidth} onChange={(v) => patchInput({ baseWidth: v })} unit={unit('cm')} />
      <NumField label="کف — تعداد" value={input.baseCount} step={1} min={0} onChange={(v) => patchInput({ baseCount: Math.round(v) })} />
      <EdgeRow label="کف — نوار لبه" flags={input.baseEdges} onEdge={(e) => patchInput({ baseEdges: e })} />
      <NumField label="تاق — تعداد" value={input.topCount} step={1} min={0} onChange={(v) => patchInput({ topCount: Math.round(v) })} />
      <EdgeRow label="تاق — نوار لبه" flags={input.topEdges} onEdge={(e) => patchInput({ topEdges: e })} />
      <NumField label="طبقه — تعداد" value={input.shelfCount} step={1} min={0} onChange={(v) => patchInput({ shelfCount: Math.round(v) })} />
      <EdgeRow label="طبقه — نوار لبه" flags={input.shelfEdges} onEdge={(e) => patchInput({ shelfEdges: e })} />
      <NumField label="قید — عرض" value={input.railWidth} onChange={(v) => patchInput({ railWidth: v })} unit={unit('cm')} />
      <NumField label="قید — تعداد" value={input.railCount} step={1} min={0} onChange={(v) => patchInput({ railCount: Math.round(v) })} />
      <EdgeRow label="قید — نوار لبه" flags={input.railEdges} onEdge={(e) => patchInput({ railEdges: e })} />
      <NumField label="ارتفاع درب" value={input.doorHeight} onChange={(v) => patchInput({ doorHeight: v })} unit={unit('cm')} />
      <NumField label="فیبر ۳ میل — تعداد" value={input.backCount} step={1} min={0} onChange={(v) => patchInput({ backCount: Math.round(v) })} />
    </div>
  );
}

function DrawerFields({
  input,
  patchInput,
  unit,
}: {
  input: DrawerInput;
  patchInput: PatchInput;
  t: (k: string) => string;
  unit: (s: string) => string;
}) {
  return (
    <div className="form-grid">
      <NumField label="تعداد" value={input.count} step={1} min={0} onChange={(v) => patchInput({ count: Math.round(v) })} />
      <NumField label="عمق" value={input.depth} onChange={(v) => patchInput({ depth: v })} unit={unit('cm')} />
      <NumField label="عرض" value={input.width} onChange={(v) => patchInput({ width: v })} unit={unit('cm')} />
      <NumField label="ارتفاع" value={input.height} onChange={(v) => patchInput({ height: v })} unit={unit('cm')} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function UnitResults({
  module,
  kind,
  t,
}: {
  module: ModuleEntry;
  kind: Kind;
  t: (k: string) => string;
}) {
  const result = computeModule(module);
  const showCm = true;

  return (
    <>
      {result.warnings.length > 0 ? (
        <section className="card">
          <header className="card-head">
            <div className="card-title">{t('common.warning')}</div>
          </header>
          <div className="card-body">
            {result.warnings.map((w, i) => (
              <div key={i} style={{ marginBottom: 6 }}>
                <span className={w.severity === 'error' ? 'chip err' : 'chip warn'}>
                  {w.severity === 'error' ? t('common.error') : t('common.warning')}
                </span>{' '}
                {w.messageFa}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="card">
        <header className="card-head">
          <div>
            <div className="card-title">قطعات محاسبه‌شده</div>
            <div className="card-sub">
              {t('common.quantity')}: {module.quantity}
            </div>
          </div>
        </header>
        <div className="card-body tight">
          <table className="data">
            <thead>
              <tr>
                <th>{t('cut.part')}</th>
                <th>{t('cut.length')}</th>
                <th>{t('cut.width')}</th>
                <th>{t('common.quantity')}</th>
                <th>{t('cut.edge')}</th>
                <th>{t('common.formula')}</th>
              </tr>
            </thead>
            <tbody>
              {result.parts.map((p: PanelPart) => (
                <tr key={p.id}>
                  <td>{p.nameFa}</td>
                  <td className="n">{fmt(p.length)}</td>
                  <td className="n">{fmt(p.width)}</td>
                  <td className="n">{p.count}</td>
                  <td className="small muted">
                    {p.edges.widthEdge ? 'عرض ' : ''}
                    {p.edges.lengthEdge ? 'طول' : ''}
                    {!p.edges.widthEdge && !p.edges.lengthEdge ? '—' : ''}
                  </td>
                  <td className="small dim" style={{ maxWidth: 320 }}>
                    {p.source.formulaFa}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <header className="card-head">
          <div className="card-title">{t('set.formulaAudit')}</div>
          <div className="card-actions">
            <span className="chip ok">{t('set.verified')}</span>
          </div>
        </header>
        <div className="card-body tight">
          <table className="data formula-audit">
            <thead>
              <tr>
                <th>خروجی</th>
                <th>{t('common.formula')} (Excel)</th>
                <th>جایگذاری مقدار</th>
                <th>نتیجه (cm)</th>
              </tr>
            </thead>
            <tbody>
              {result.audit.map((a, i) => (
                <tr key={i}>
                  <td>{a.labelFa}</td>
                  <td className="formula">{a.excelFormula}</td>
                  <td className="small muted">{a.substitutedFa}</td>
                  <td className="n">{a.value === '' ? '—' : fmt(a.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="dim small">
        همهٔ طول‌ها در این جدول به سانتی‌متر (واحد اصلی فایل اکسل) هستند. برای نمایش در میلی‌متر، واحد برنامه را
        از نوار بالا تغییر دهید ({fmt(cmToMm(1))} → ۱۰).
      </p>
    </>
  );
}
