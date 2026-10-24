/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  cabinetDesktop?: {
    isDesktop: true;
    versions: { electron: string; chrome: string; node: string };
  };
}
