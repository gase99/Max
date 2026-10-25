import { fmt, PageHead, Stat, Card, Hint } from '../ui.js';
import type { Store } from '../store.js';
import { sampleProject } from '../store.js';
import type { ProjectComputation } from '../selectors.js';
import type { RouteKey } from '../App.js';

export default function Dashboard({
  store,
  t,
  computation,
  go,
}: {
  store: Store;
  t: (k: string) => string;
  computation: ProjectComputation;
  go: (r: RouteKey) => void;
}) {
  const statusLabel = (s: string) => t(`status.${s}`);

  const loadSample = () => {
    const p = sampleProject();
    store.replaceAllProjects([p, ...store.projects]);
    store.selectProject(p.id);
    go('ground');
  };

  return (
    <>
      <PageHead title={t('dash.title')} sub={t('app.subtitle')} />

      <div className="stat-grid">
        <Stat label={t('dash.projects')} value={store.projects.length} />
        <Stat label={t('dash.modules')} value={computation.moduleCount} />
        <Stat label={t('dash.parts')} value={computation.summary.totalPieces} />
        <Stat label={t('dash.area')} value={fmt(computation.summary.totalAreaM2, 2)} unit="m²" />
      </div>

      {!store.current ? (
        <Hint>
          {t('dash.empty')}{' '}
          <button className="btn btn-sm btn-primary" style={{ marginInlineStart: 8 }} onClick={loadSample}>
            {t('dash.loadSample')}
          </button>
        </Hint>
      ) : null}

      {computation.warnings.length > 0 ? (
        <Card title={t('common.warning')} sub={`${computation.warnings.length}`}>
          <ul style={{ margin: 0, paddingInlineStart: 18 }}>
            {computation.warnings.slice(0, 8).map((w, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                <span className={w.severity === 'error' ? 'chip err' : 'chip warn'}>
                  {w.severity === 'error' ? t('common.error') : t('common.warning')}
                </span>{' '}
                <strong>{w.moduleLabel}</strong> — {w.messageFa}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card
        title={t('dash.recent')}
        actions={
          <>
            <button className="btn btn-sm" onClick={() => go('projects')}>
              {t('nav.projects')}
            </button>
            <button className="btn btn-sm btn-primary" onClick={() => go('newAnalysis')}>
              {t('nav.newAnalysis')}
            </button>
          </>
        }
        tight
      >
        {store.projects.length === 0 ? (
          <div className="empty">{t('proj.empty')}</div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('project.customer')}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.quantity')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {store.projects.slice(0, 6).map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className="muted">{p.customer || '—'}</td>
                  <td>
                    <span className="chip">{statusLabel(p.status)}</span>
                  </td>
                  <td className="n">{p.modules.length}</td>
                  <td className="actions">
                    <button
                      className="btn btn-sm"
                      onClick={() => {
                        store.selectProject(p.id);
                        go('ground');
                      }}
                    >
                      {t('common.open')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title={t('dash.quickStart')}>
        <div className="row">
          <button className="btn" onClick={() => go('ground')}>
            {t('nav.ground')}
          </button>
          <button className="btn" onClick={() => go('wall')}>
            {t('nav.wall')}
          </button>
          <button className="btn" onClick={() => go('drawers')}>
            {t('nav.drawers')}
          </button>
          <span className="dim">|</span>
          <button className="btn" onClick={() => go('cuttingList')}>
            {t('nav.cuttingList')}
          </button>
          <button className="btn" onClick={() => go('optimization')}>
            {t('nav.optimization')}
          </button>
          <button className="btn" onClick={() => go('reports')}>
            {t('nav.reports')}
          </button>
        </div>
      </Card>
    </>
  );
}
