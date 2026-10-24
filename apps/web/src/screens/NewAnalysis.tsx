import { useState } from 'react';
import { Card, Hint, PageHead, TextField, useToast } from '../ui.js';
import type { Store } from '../store.js';
import { emptyDrawer, emptyGroundCabinet, emptyWallCabinet } from '@cabinet/engine';
import { uid } from '../store.js';
import type { RouteKey } from '../App.js';

export default function NewAnalysis({
  store,
  t,
  go,
}: {
  store: Store;
  t: (k: string) => string;
  go: (r: RouteKey, moduleId?: string) => void;
}) {
  const { push } = useToast();
  const [name, setName] = useState('');
  const [customer, setCustomer] = useState('');

  const create = (then?: RouteKey) => {
    const p = store.createProject(name.trim() || 'پروژهٔ بدون نام');
    if (customer.trim()) store.updateProject(p.id, { customer: customer.trim() });
    push(t('toast.saved'));
    if (then) go(then);
  };

  /** Create a project (if none is selected) and immediately add one unit. */
  const quickAdd = (kind: 'ground' | 'wall' | 'drawer') => {
    let project = store.current;
    if (!project) {
      project = store.createProject(name.trim() || 'پروژهٔ بدون نام');
      if (customer.trim()) store.updateProject(project.id, { customer: customer.trim() });
    }
    const thickness = 1.6;
    const materialId = 'mdf-white';
    const moduleId = uid('mod');
    const base = { id: moduleId, quantity: 1 };
    if (kind === 'ground') {
      store.addModule({ ...base, kind, label: 'کابینت زمینی', input: emptyGroundCabinet(thickness, materialId) });
      go('ground', moduleId);
    } else if (kind === 'wall') {
      store.addModule({ ...base, kind, label: 'کابینت هوایی', input: emptyWallCabinet(thickness, materialId) });
      go('wall', moduleId);
    } else {
      store.addModule({ ...base, kind, label: 'کشو', input: emptyDrawer(thickness, materialId) });
      go('drawers', moduleId);
    }
  };

  return (
    <>
      <PageHead title={t('nav.newAnalysis')} sub={t('project.newTitle')} />

      <Card title={t('project.newTitle')}>
        <div className="form-grid">
          <TextField label={t('project.name')} value={name} onChange={setName} placeholder="آشپزخانهٔ واحد ۳" />
          <TextField label={t('project.customer')} value={customer} onChange={setCustomer} />
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn btn-primary" onClick={() => create()}>
            {t('common.new')}
          </button>
          <button className="btn" onClick={() => create('ground')}>
            {t('common.new')} + {t('nav.ground')}
          </button>
        </div>
      </Card>

      <Card title={t('common.add')} sub={t('dash.quickStart')}>
        <Hint>{t('set.offline')}</Hint>
        <div className="row">
          <button className="btn" onClick={() => quickAdd('ground')}>
            ＋ {t('nav.ground')}
          </button>
          <button className="btn" onClick={() => quickAdd('wall')}>
            ＋ {t('nav.wall')}
          </button>
          <button className="btn" onClick={() => quickAdd('drawer')}>
            ＋ {t('nav.drawers')}
          </button>
        </div>
        {!store.current ? (
          <p className="dim small" style={{ marginTop: 10 }}>
            {t('toast.noProject')}
          </p>
        ) : (
          <p className="dim small" style={{ marginTop: 10 }}>
            {store.current.name} — {store.current.modules.length} {t('dash.modules')}
          </p>
        )}
      </Card>
    </>
  );
}
