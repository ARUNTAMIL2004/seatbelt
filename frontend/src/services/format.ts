import type { Language } from './i18n';

const LOCALE: Record<Language, string> = { en: 'en-IN', ta: 'ta-IN' };

export function formatDateTime(iso: string | null | undefined, lang: Language = 'en'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(LOCALE[lang], { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatTime(iso: string | null | undefined, lang: Language = 'en'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(LOCALE[lang], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** Local date+time inputs -> ISO instant (so the server stores the correct UTC time). */
export function localToIso(date: string, time: string): string {
  return new Date(`${date}T${time}`).toISOString();
}
