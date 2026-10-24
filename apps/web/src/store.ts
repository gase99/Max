import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  defaultMaterials,
  defaultPricingSettings,
  emptyDrawer,
  emptyGroundCabinet,
  emptyWallCabinet,
} from '@cabinet/engine';
import type {
  DrawerInput,
  EdgeBand,
  GroundCabinetInput,
  HardwareItem,
  Material,
  PricingSettings,
  WallCabinetInput,
} from '@cabinet/engine';
import type { Lang } from './i18n.js';

/* ------------------------------------------------------------------ */
/*  Model                                                             */
/* ------------------------------------------------------------------ */

export type ProjectStatus = 'draft' | 'confirmed' | 'inProduction' | 'done';

export interface ModuleEntry {
  id: string;
  kind: 'ground' | 'wall' | 'drawer';
  label: string;
  quantity: number;
  input: GroundCabinetInput | WallCabinetInput | DrawerInput;
}

export interface Project {
  id: string;
  name: string;
  customer: string;
  status: ProjectStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
  modules: ModuleEntry[];
}

export interface SheetDefaults {
  width: number;
  height: number;
  kerf: number;
  trim: number;
  allowRotation: boolean;
}

export interface AppSettings {
  lang: Lang;
  unit: 'mm' | 'cm';
  materials: Material[];
  edgeBands: EdgeBand[];
  hardware: HardwareItem[];
  pricing: PricingSettings;
  sheet: SheetDefaults;
}

/* ------------------------------------------------------------------ */
/*  Persistence helpers (offline, localStorage)                       */
/* ------------------------------------------------------------------ */

const PROJECTS_KEY = 'cap.projects.v1';
const SETTINGS_KEY = 'cap.settings.v1';
const SELECTED_KEY = 'cap.selected.v1';

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadProjects(): Project[] {
  const list = safeParse<Project[]>(localStorage.getItem(PROJECTS_KEY), []);
  return Array.isArray(list) ? list.filter((p) => p && typeof p.id === 'string') : [];
}

/**
 * Raised when a write to localStorage fails (quota, private mode, a locked
 * profile). The UI listens for it and shows a warning instead of dying: a
 * workshop PC with a full disk must not lose the session silently.
 */
export const STORAGE_ERROR_EVENT = 'cap:storage-error';

/** Write to localStorage without ever throwing. Returns false on failure. */
export function safeWrite(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    try {
      window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT, { detail: String(err) }));
    } catch {
      /* a missing window (SSR/test) is not worth another failure */
    }
    return false;
  }
}

export function saveProjects(projects: Project[]): void {
  safeWrite(PROJECTS_KEY, JSON.stringify(projects));
}

export function loadSettings(): AppSettings {
  const s = safeParse<Partial<AppSettings>>(localStorage.getItem(SETTINGS_KEY), {});
  return {
    lang: s.lang === 'en' ? 'en' : 'fa',
    unit: s.unit === 'cm' ? 'cm' : 'mm',
    materials: Array.isArray(s.materials) && s.materials.length ? s.materials : defaultMaterials(),
    edgeBands: Array.isArray(s.edgeBands) ? s.edgeBands : defaultEdgeBands(),
    hardware: Array.isArray(s.hardware) ? s.hardware : defaultHardware(),
    pricing: { ...defaultPricingSettings(), ...(s.pricing ?? {}) },
    sheet: { ...defaultSheet(), ...(s.sheet ?? {}) },
  };
}

export function saveSettings(s: AppSettings): void {
  safeWrite(SETTINGS_KEY, JSON.stringify(s));
}

export function defaultEdgeBands(): EdgeBand[] {
  return [
    { id: 'band-2mm-white', nameFa: 'نوار PVC سفید ۲ میلی‌متر', thickness: 0.2, pricePerMeter: 0 },
    { id: 'band-04mm', nameFa: 'نوار PVC ۰٫۴ میلی‌متر', thickness: 0.04, pricePerMeter: 0 },
    { id: 'band-2mm-cream', nameFa: 'نوار PVC کرم ۲ میلی‌متر', thickness: 0.2, pricePerMeter: 0 },
  ];
}

export function defaultHardware(): HardwareItem[] {
  return [
    { id: 'hinge', nameFa: 'لولا', nameEn: 'Hinge', unit: 'pcs', unitPrice: 0 },
    { id: 'slide', nameFa: 'ریل کشو', nameEn: 'Drawer slide', unit: 'pcs', unitPrice: 0 },
    { id: 'handle', nameFa: 'دستگیره', nameEn: 'Handle', unit: 'pcs', unitPrice: 0 },
    { id: 'leg', nameFa: 'پایه', nameEn: 'Leg', unit: 'pcs', unitPrice: 0 },
    { id: 'screw', nameFa: 'پیچ', nameEn: 'Screw', unit: 'pcs', unitPrice: 0 },
  ];
}

export function defaultSheet(): SheetDefaults {
  return { width: 183, height: 244, kerf: 0.4, trim: 1, allowRotation: true };
}

export function uid(prefix = 'id'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function newProject(name = 'پروژهٔ بدون نام'): Project {
  const now = new Date().toISOString();
  return {
    id: uid('prj'),
    name,
    customer: '',
    status: 'draft',
    notes: '',
    createdAt: now,
    updatedAt: now,
    modules: [],
  };
}

/** A small sample project built from the workbook's own default unit values. */
export function sampleProject(): Project {
  const now = new Date().toISOString();
  const ground: ModuleEntry[] = [
    {
      id: uid('mod'),
      kind: 'ground',
      label: 'کابینت زمینی ۸۰',
      quantity: 2,
      input: { ...emptyGroundCabinet() },
    },
    {
      id: uid('mod'),
      kind: 'ground',
      label: 'کابینت زمینی ۱۰۰',
      quantity: 1,
      input: { ...emptyGroundCabinet(), width: 100, baseWidth: 58, doorHeight: 73.4 },
    },
  ];
  const wall: ModuleEntry[] = [
    {
      id: uid('mod'),
      kind: 'wall',
      label: 'کابینت هوایی ۶۰',
      quantity: 3,
      input: { ...emptyWallCabinet() },
    },
    {
      id: uid('mod'),
      kind: 'wall',
      label: 'کابینت هوایی ۸۴',
      quantity: 2,
      input: { ...emptyWallCabinet(), width: 84 },
    },
  ];
  const drawer: ModuleEntry[] = [
    {
      id: uid('mod'),
      kind: 'drawer',
      label: 'کشو ۹۰×۵۰',
      quantity: 3,
      input: { ...emptyDrawer() },
    },
  ];
  return {
    id: uid('prj'),
    name: 'پروژهٔ نمونه — آشپزخانه',
    customer: 'مشتری نمونه',
    status: 'draft',
    notes: 'پروژهٔ نمونه برای آشنایی با برنامه. مقادیر ورودی از پیش‌فرض‌های فایل اکسل گرفته شده است.',
    createdAt: now,
    updatedAt: now,
    modules: [...ground, ...wall, ...drawer],
  };
}

/* ------------------------------------------------------------------ */
/*  React hook                                                        */
/* ------------------------------------------------------------------ */

export interface Store {
  projects: Project[];
  current: Project | null;
  settings: AppSettings;
  setSettings: (updater: (s: AppSettings) => AppSettings) => void;
  selectProject: (id: string | null) => void;
  createProject: (name: string) => Project;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  duplicateProject: (id: string) => void;
  addModule: (p: ModuleEntry, projectId?: string) => void;
  updateModule: (moduleId: string, patch: Partial<ModuleEntry>) => void;
  deleteModule: (moduleId: string) => void;
  duplicateModule: (moduleId: string) => void;
  replaceAllProjects: (projects: Project[]) => void;
}

export function useStore(): Store {
  const [projects, setProjects] = useState<Project[]>(() => loadProjects());
  const [settings, setSettingsState] = useState<AppSettings>(() => loadSettings());
  const [selectedId, setSelectedId] = useState<string | null>(
    () => localStorage.getItem(SELECTED_KEY),
  );

  useEffect(() => saveProjects(projects), [projects]);
  useEffect(() => saveSettings(settings), [settings]);
  useEffect(() => {
    if (selectedId) safeWrite(SELECTED_KEY, selectedId);
    else {
      try {
        localStorage.removeItem(SELECTED_KEY);
      } catch {
        /* nothing to do: the selection is only a convenience */
      }
    }
  }, [selectedId]);

  const current = useMemo(
    () => projects.find((p) => p.id === selectedId) ?? null,
    [projects, selectedId],
  );

  const setSettings = useCallback((updater: (s: AppSettings) => AppSettings) => {
    setSettingsState((s) => updater(s));
  }, []);

  const touch = (p: Project): Project => ({ ...p, updatedAt: new Date().toISOString() });

  const updateProject = useCallback((id: string, patch: Partial<Project>) => {
    setProjects((list) => list.map((p) => (p.id === id ? touch({ ...p, ...patch }) : p)));
  }, []);

  const createProject = useCallback((name: string) => {
    const p = newProject(name);
    setProjects((list) => [p, ...list]);
    setSelectedId(p.id);
    return p;
  }, []);

  const deleteProject = useCallback((id: string) => {
    setProjects((list) => list.filter((p) => p.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  }, []);

  const duplicateProject = useCallback((id: string) => {
    setProjects((list) => {
      const src = list.find((p) => p.id === id);
      if (!src) return list;
      const copy: Project = {
        ...structuredClone(src),
        id: uid('prj'),
        name: `${src.name} (کپی)`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return [copy, ...list];
    });
  }, []);

  /**
   * `projectId` exists for callers that have just created a project: the
   * `selectedId` in their closure is still stale, so relying on it silently
   * dropped the first module of a brand-new project.
   */
  const mutateCurrent = useCallback(
    (fn: (p: Project) => Project, projectId?: string) => {
      const target = projectId ?? selectedId;
      setProjects((list) => list.map((p) => (p.id === target ? touch(fn(p)) : p)));
    },
    [selectedId],
  );

  const addModule = useCallback(
    (m: ModuleEntry, projectId?: string) =>
      mutateCurrent((p) => ({ ...p, modules: [...p.modules, m] }), projectId),
    [mutateCurrent],
  );

  const updateModule = useCallback(
    (moduleId: string, patch: Partial<ModuleEntry>) =>
      mutateCurrent((p) => ({
        ...p,
        modules: p.modules.map((m) => (m.id === moduleId ? { ...m, ...patch } : m)),
      })),
    [mutateCurrent],
  );

  const deleteModule = useCallback(
    (moduleId: string) =>
      mutateCurrent((p) => ({ ...p, modules: p.modules.filter((m) => m.id !== moduleId) })),
    [mutateCurrent],
  );

  const duplicateModule = useCallback(
    (moduleId: string) =>
      mutateCurrent((p) => {
        const src = p.modules.find((m) => m.id === moduleId);
        if (!src) return p;
        const copy: ModuleEntry = {
          ...structuredClone(src),
          id: uid('mod'),
          label: `${src.label} (کپی)`,
        };
        return { ...p, modules: [...p.modules, copy] };
      }),
    [mutateCurrent],
  );

  const replaceAllProjects = useCallback((list: Project[]) => {
    setProjects(list);
    setSelectedId(list[0]?.id ?? null);
  }, []);

  return {
    projects,
    current,
    settings,
    setSettings,
    selectProject: setSelectedId,
    createProject,
    updateProject,
    deleteProject,
    duplicateProject,
    addModule,
    updateModule,
    deleteModule,
    duplicateModule,
    replaceAllProjects,
  };
}
