import { useEffect, useMemo, useState } from 'react';
import { isRtl, makeT } from './i18n.js';
import { useStore } from './store.js';
import { ToastProvider } from './ui.js';
import { useProjectComputation } from './selectors.js';

import Dashboard from './screens/Dashboard.js';
import NewAnalysis from './screens/NewAnalysis.js';
import CabinetEditor from './screens/CabinetEditor.js';
import CuttingListScreen from './screens/CuttingListScreen.js';
import OptimizationScreen from './screens/OptimizationScreen.js';
import MaterialsScreen from './screens/MaterialsScreen.js';
import PricingScreen from './screens/PricingScreen.js';
import ProjectsScreen from './screens/ProjectsScreen.js';
import ReportsScreen from './screens/ReportsScreen.js';
import ExplodedScreen from './screens/ExplodedScreen.js';
import SettingsScreen from './screens/SettingsScreen.js';

export type RouteKey =
  | 'dashboard'
  | 'newAnalysis'
  | 'ground'
  | 'wall'
  | 'drawers'
  | 'cuttingList'
  | 'optimization'
  | 'materials'
  | 'pricing'
  | 'projects'
  | 'reports'
  | 'exploded'
  | 'settings';

const NAV: { group: string; items: { key: RouteKey; icon: string }[] }[] = [
  { group: 'section.analysis', items: [
    { key: 'dashboard', icon: '▤' },
    { key: 'newAnalysis', icon: '＋' },
    { key: 'ground', icon: '▭' },
    { key: 'wall', icon: '▯' },
    { key: 'drawers', icon: '▤' },
  ] },
  { group: 'section.production', items: [
    { key: 'cuttingList', icon: '☰' },
    { key: 'optimization', icon: '▦' },
    { key: 'exploded', icon: '⧉' },
  ] },
  { group: 'section.commercial', items: [
    { key: 'materials', icon: '◈' },
    { key: 'pricing', icon: '₮' },
    { key: 'projects', icon: '❐' },
    { key: 'reports', icon: '⎙' },
  ] },
  { group: 'section.system', items: [
    { key: 'settings', icon: '⚙' },
  ] },
];

export default function App() {
  const store = useStore();
  const { settings } = store;
  const t = useMemo(() => makeT(settings.lang), [settings.lang]);
  const [route, setRoute] = useState<RouteKey>('dashboard');
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const computation = useProjectComputation(store.current, false);

  useEffect(() => {
    document.documentElement.lang = settings.lang;
    document.documentElement.dir = isRtl(settings.lang) ? 'rtl' : 'ltr';
  }, [settings.lang]);

  const go = (r: RouteKey, moduleId?: string) => {
    setActiveModuleId(moduleId ?? null);
    setRoute(r);
  };

  const screen = () => {
    switch (route) {
      case 'dashboard':
        return <Dashboard store={store} t={t} computation={computation} go={go} />;
      case 'newAnalysis':
        return <NewAnalysis store={store} t={t} go={go} />;
      case 'ground':
      case 'wall':
      case 'drawers':
        return (
          <CabinetEditor
            store={store}
            t={t}
            kind={route === 'ground' ? 'ground' : route === 'wall' ? 'wall' : 'drawer'}
            activeModuleId={activeModuleId}
            setActiveModuleId={setActiveModuleId}
          />
        );
      case 'cuttingList':
        return <CuttingListScreen store={store} t={t} />;
      case 'optimization':
        return <OptimizationScreen store={store} t={t} />;
      case 'materials':
        return <MaterialsScreen store={store} t={t} />;
      case 'pricing':
        return <PricingScreen store={store} t={t} />;
      case 'projects':
        return <ProjectsScreen store={store} t={t} go={go} />;
      case 'reports':
        return <ReportsScreen store={store} t={t} />;
      case 'exploded':
        return <ExplodedScreen store={store} t={t} />;
      case 'settings':
        return <SettingsScreen store={store} t={t} />;
    }
  };

  const navLabel = (k: RouteKey) => t(`nav.${k}`);

  return (
    <ToastProvider>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-row">
              <div className="brand-mark">CA</div>
              <div>
                <div className="brand-title">{t('app.title')}</div>
                <div className="brand-sub">{t('app.subtitle')}</div>
              </div>
            </div>
          </div>
          <nav className="nav">
            {NAV.map((g) => (
              <div key={g.group}>
                <div className="nav-group-label">{t(g.group)}</div>
                {g.items.map((it) => (
                  <button
                    key={it.key}
                    className={route === it.key ? 'nav-item active' : 'nav-item'}
                    onClick={() => go(it.key)}
                  >
                    <span className="nav-icon">{it.icon}</span>
                    <span>{navLabel(it.key)}</span>
                    {it.key === 'cuttingList' && computation.rows.length > 0 ? (
                      <span className="nav-badge">{computation.summary.totalPieces}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        <div className="main">
          <header className="topbar">
            <div className="topbar-title">{navLabel(route)}</div>
            <div className="topbar-spacer" />
            <div className="project-pick">
              <span className="label">{t('common.name')}</span>
              <select
                value={store.current?.id ?? ''}
                onChange={(e) => store.selectProject(e.target.value || null)}
              >
                <option value="">{t('common.none')}</option>
                {store.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="btn btn-sm"
              onClick={() => store.setSettings((s) => ({ ...s, lang: s.lang === 'fa' ? 'en' : 'fa' }))}
              title="Language / زبان"
            >
              {settings.lang === 'fa' ? 'EN' : 'فا'}
            </button>
            <button
              className="btn btn-sm"
              onClick={() =>
                store.setSettings((s) => ({ ...s, unit: s.unit === 'mm' ? 'cm' : 'mm' }))
              }
              title={t('set.unit')}
            >
              {settings.unit === 'mm' ? 'mm' : 'cm'}
            </button>
          </header>

          <main className="content">
            <div className="content-narrow">{screen()}</div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
