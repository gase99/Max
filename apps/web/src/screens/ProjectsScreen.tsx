import { useRef, useState } from 'react';
import { fmt, Card, Hint, PageHead, useToast, Modal, TextField } from '../ui.js';
import type { Project, ProjectStatus, Store } from '../store.js';
import { downloadFile, safeFilename } from '../exporters.js';
import type { RouteKey } from '../App.js';

export default function ProjectsScreen({
  store,
  t,
  go,
}: {
  store: Store;
  t: (k: string) => string;
  go: (r: RouteKey) => void;
}) {
  const { push } = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [customer, setCustomer] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const statuses: ProjectStatus[] = ['draft', 'confirmed', 'inProduction', 'done'];

  const backup = () => {
    downloadFile(
      `cabinet-analysis-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify({ app: 'cabinet-analysis-pro', version: 1, projects: store.projects, settings: store.settings }, null, 2),
      'application/json',
    );
    push(t('proj.backup'));
  };

  const restore = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || !Array.isArray(data.projects)) throw new Error('bad');
      store.replaceAllProjects(data.projects as Project[]);
      if (data.settings) store.setSettings(() => data.settings);
      push(t('toast.imported'));
    } catch {
      push(t('toast.importError'), true);
    }
  };

  const exportOne = (p: Project) => {
    downloadFile(
      `project-${safeFilename(p.name)}.json`,
      JSON.stringify({ app: 'cabinet-analysis-pro', version: 1, projects: [p] }, null, 2),
      'application/json',
    );
  };

  return (
    <>
      <PageHead title={t('proj.title')} />

      <div className="report-actions">
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          ＋ {t('proj.new')}
        </button>
        <button className="btn" onClick={backup}>
          ⭳ {t('proj.backup')}
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          ⭱ {t('proj.restore')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void restore(f);
            e.target.value = '';
          }}
        />
      </div>

      <Hint>{t('set.offline')}</Hint>

      <Card title={t('proj.title')} sub={`${store.projects.length}`} tight>
        {store.projects.length === 0 ? (
          <div className="empty">{t('proj.empty')}</div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('project.customer')}</th>
                <th>{t('common.status')}</th>
                <th>{t('dash.modules')}</th>
                <th>{t('dash.area')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {store.projects.map((p) => (
                <tr key={p.id} style={store.current?.id === p.id ? { background: 'rgba(240,167,42,.06)' } : undefined}>
                  <td>{p.name}</td>
                  <td className="muted">{p.customer || '—'}</td>
                  <td>
                    <select
                      value={p.status}
                      onChange={(e) => store.updateProject(p.id, { status: e.target.value as ProjectStatus })}
                      style={{ width: 130 }}
                    >
                      {statuses.map((s) => (
                        <option key={s} value={s}>
                          {t(`status.${s}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="n">{p.modules.length}</td>
                  <td className="n">
                    {fmt(
                      p.modules.reduce((s, m) => s + m.quantity, 0),
                      0,
                    )}{' '}
                    <span className="dim small">واحد</span>
                  </td>
                  <td className="actions">
                    <button
                      className="btn btn-sm"
                      onClick={() => {
                        store.selectProject(p.id);
                        go('ground');
                      }}
                    >
                      {t('common.open')}
                    </button>{' '}
                    <button className="btn btn-sm" onClick={() => store.duplicateProject(p.id)}>
                      {t('common.duplicate')}
                    </button>{' '}
                    <button className="btn btn-sm" onClick={() => exportOne(p)}>
                      ⭳
                    </button>{' '}
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => {
                        if (confirm(`${t('common.delete')} — ${p.name}?`)) {
                          store.deleteProject(p.id);
                          push(t('toast.deleted'));
                        }
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {creating ? (
        <Modal
          title={t('proj.new')}
          onClose={() => setCreating(false)}
          footer={
            <>
              <button className="btn" onClick={() => setCreating(false)}>
                {t('common.cancel')}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const p = store.createProject(name.trim() || 'پروژهٔ بدون نام');
                  if (customer.trim()) store.updateProject(p.id, { customer: customer.trim() });
                  setCreating(false);
                  setName('');
                  setCustomer('');
                  push(t('toast.saved'));
                }}
              >
                {t('common.save')}
              </button>
            </>
          }
        >
          <TextField label={t('project.name')} value={name} onChange={setName} />
          <TextField label={t('project.customer')} value={customer} onChange={setCustomer} />
        </Modal>
      ) : null}
    </>
  );
}
