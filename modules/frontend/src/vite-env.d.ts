/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __OLD_PORTAL_URL__: string;

interface ImportMetaEnv {
  readonly VITE_DOCS_URL: string;
  readonly VITE_API_DOCS_URL: string;
  readonly VITE_SUPPORT_HREF: string;
  readonly VITE_SUPPORT_TITLE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
