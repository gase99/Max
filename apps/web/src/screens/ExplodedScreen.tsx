import { useMemo } from 'react';
import { buildDxf, buildExplodedSheet } from '@cabinet/engine';
import type { ExplodeModuleInput } from '@cabinet/engine';
import type { Store } from '../store.js';
import { Card, PageHead, Hint, useToast } from '../ui.js';
import { downloadFile, safeFilename } from '../exporters.js';
import { renderExplodedSheetSvgs } from '../explodedSvg.js';
import { computeModule } from '../selectors.js';

/**
 * Exploded technical drawing screen.
 *
 * Everything shown here is generated from the same engine arrays that feed the
 * cutting list, so a dimension change in the editor appears on the drawing the
 * next time it is rendered — there is no stored copy of a drawing that could go
 * stale.
 */

export function useExplodedSheet(store: Store) {
  const { current, settings } = store;
  return useMemo(() => {
    if (!current) return null;
    const modules: ExplodeModuleInput[] = current.modules.map((m) => {
      const result = computeModule(m);
      return {
        id: m.id,
        label: m.label,
        labelEn: m.label,
        kind: m.kind,
        quantity: m.quantity,
        parts: result.parts,
      };
    });
    const sheet = buildExplodedSheet(modules, {
      materials: settings.materials.map((m) => ({ id: m.id, nameFa: m.nameFa, nameEn: m.nameEn || m.nameFa })),
    });
    return sheet;
  }, [current, settings.materials]);
}

export function ExplodedGallery({
  store,
  t,
}: {
  store: Store;
  t: (k: string) => string;
}) {
  const sheet = useExplodedSheet(store);
  const { push } = useToast();
  const lang = store.settings.lang === 'fa' ? 'fa' : 'en';
  const project = store.current;

  const svgs = useMemo(() => {
    if (!sheet || !project) return [] as string[];
    return renderExplodedSheetSvgs(sheet, {
      lang,
      projectName: project.name,
      customer: project.customer,
      date: new Date().toLocaleDateString(lang === 'fa' ? 'fa-IR' : 'en-GB'),
    });
  }, [sheet, project, lang]);

  if (!project) return <Hint kind="warn">{t('toast.noProject')}</Hint>;
  if (!sheet || !svgs.length) return <Hint kind="warn">{t('exp.none')}</Hint>;

  const downloadSvg = (index: number) => {
    const name = `drawing-${safeFilename(project.name)}-${index + 1}.svg`;
    downloadFile(name, svgs[index], 'image/svg+xml;charset=utf-8');
    push(t('exp.saved'));
  };

  const downloadDxf = () => {
    if (!sheet) return;
    const { dxf, summary } = buildDxf(sheet);
    // ASCII DXF is a text format; bytes are written as-is, no BOM.
    downloadFile(`drawings-${safeFilename(project.name)}.dxf`, dxf, 'application/dxf;charset=ascii');
    push(`${t('exp.dxfSaved')} — ${summary.panels} ${t('cut.part')} · ${summary.units}`);
  };

  const downloadAll = () => {
    // A single self-contained HTML file: open it, then Ctrl+P → "Save as PDF".
    // This is the only route to PDF that works identically in the browser and in
    // the installed Windows app, with no extra dependency.
    const pages = svgs
      .map(
        (svg) =>
          `<section class="page">${svg.replace(
            /^<svg([^>]*)>/,
            (m, attrs) => `<svg${attrs.replace(/width="[^"]*"/, 'width="100%"').replace(/height="[^"]*"/, '')}>`,
          )}</section>`,
      )
      .join('\n');
    const html = `<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8">
<title>${escapeHtml(project.name)} — ${escapeHtml(t('exp.title'))}</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  body { margin: 0; background: #f2f2f2; font-family: Tahoma, sans-serif; }
  section.page { width: 210mm; height: 297mm; margin: 8mm auto; background: #fff;
                 box-shadow: 0 0 4px rgba(0,0,0,.3); page-break-after: always;
                 break-after: page; display: flex; align-items: center; }
  section.page svg { display: block; width: 100%; height: auto; }
  @media print { body { background: #fff; } section.page { margin: 0; box-shadow: none; } }
</style></head>
<body>${pages}</body></html>`;
    downloadFile(`drawings-${safeFilename(project.name)}.html`, html, 'text/html;charset=utf-8');
    push(t('exp.saved'));
  };

  return (
    <>
      <div className="report-actions no-print" style={{ marginBottom: 10 }}>
        <button className="btn btn-primary" onClick={() => window.print()}>
          ⎙ {t('exp.print')}
        </button>
        <button className="btn" onClick={downloadAll}>
          ⭳ {t('exp.pdf')}
        </button>
        <button className="btn" onClick={downloadDxf}>
          ⭳ {t('exp.dxf')}
        </button>
      </div>
      <Hint>{t('exp.hint')}</Hint>
      <div className="sheet-grid print-sheets">
        {sheet.drawings.map((d, i) => (
          <div key={d.moduleId} className="sheet-card sheet-page">
            <div className="sheet-head">
              <strong>
                {t('exp.module')} {d.moduleNo} — {d.moduleLabel}
              </strong>
              <button className="btn btn-sm no-print" onClick={() => downloadSvg(i)}>
                ⭳ SVG
              </button>
            </div>
            <img
              className="sheet-svg"
              alt={`${t('exp.alt')} ${d.moduleLabel}`}
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgs[i])}`}
            />
            {d.issues.filter((x) => x.severity === 'warning').length ? (
              <ul className="sheet-issues no-print">
                {d.issues
                  .filter((x) => x.severity === 'warning')
                  .map((x, k) => (
                    <li key={k}>{lang === 'fa' ? x.messageFa : x.messageEn}</li>
                  ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}

export default function ExplodedScreen({ store, t }: { store: Store; t: (k: string) => string }) {
  return (
    <>
      <PageHead title={t('exp.title')} sub={t('exp.sub')} />
      <Card title={t('exp.title')} sub={t('exp.sub')}>
        <ExplodedGallery store={store} t={t} />
      </Card>
    </>
  );
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
