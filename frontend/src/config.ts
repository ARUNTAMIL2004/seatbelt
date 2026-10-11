/** Build-time UI configuration (see .env.example). */
export const DEMO_MODE: boolean = import.meta.env.VITE_DEMO_MODE === 'true' || (import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE !== 'false');
export const STATION_NAME: string = import.meta.env.VITE_STATION_NAME || 'Production Floor Station';
export const APP_VERSION = '1.1.0';
export const IDLE_LOGOUT_MS = 30 * 60 * 1000;

/** Which roles may see which top-level views. The API enforces the same rules server-side. */
export const VIEW_ACCESS: Record<string, readonly string[]> = {
  station: ['PRODUCTION', 'QUALITY', 'SUPERVISOR', 'ADMIN'],
  dashboard: ['PRODUCTION', 'QUALITY', 'SUPERVISOR', 'ADMIN'],
  quality: ['QUALITY', 'SUPERVISOR', 'ADMIN'],
  search: ['PRODUCTION', 'QUALITY', 'SUPERVISOR', 'ADMIN'],
  reports: ['QUALITY', 'SUPERVISOR', 'ADMIN'],
  admin: ['SUPERVISOR', 'ADMIN'],
};

export const PRODUCTION_ROLES = ['PRODUCTION', 'SUPERVISOR', 'ADMIN'] as const;
export const QUALITY_ROLES = ['QUALITY', 'ADMIN'] as const;
