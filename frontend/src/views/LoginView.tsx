import React, { useState } from 'react';
import { ShieldCheck, LogIn, Loader2, Globe } from 'lucide-react';
import { ApiService } from '../services/api';
import { errorMessage } from '../services/format';
import { translations, type Language } from '../services/i18n';
import type { User } from '../types';
import { Notice } from '../components/Notice';
import { DEMO_MODE } from '../config';

interface Props {
  lang: Language;
  onToggleLang: () => void;
  onLoggedIn: (user: User) => void;
  banner?: string | null;
}

const DEMO_ACCOUNTS = [
  { id: 'OP101', label: 'Production' },
  { id: 'QA201', label: 'Quality' },
  { id: 'SUP301', label: 'Supervisor' },
  { id: 'ADM001', label: 'Admin' },
];

export const LoginView: React.FC<Props> = ({ lang, onToggleLang, onLoggedIn, banner }) => {
  const t = translations[lang];
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const user = await ApiService.login(employeeId.trim(), password);
      onLoggedIn(user);
    } catch (err) {
      setError(errorMessage(err, 'Sign in failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen min-h-dvh flex items-center justify-center p-4 safe-x relative z-[1]">
      <div className="w-full max-w-md glass-panel p-6 sm:p-8 animate-enter">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <ShieldCheck className="w-6 h-6 text-black stroke-[2.5]" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-extrabold leading-tight">{t.app_title}</h1>
              <p className="text-[11px] text-[var(--text-dim)] font-mono">AUTOSAFE-TRACE 4.0</p>
            </div>
          </div>
          <button type="button" onClick={onToggleLang} className="btn btn-outline btn-sm shrink-0" aria-label={t.change_language}>
            <Globe className="w-4 h-4" aria-hidden="true" /> {lang === 'en' ? 'தமிழ்' : 'English'}
          </button>
        </div>

        <h2 className="text-xl mb-1">{t.login_title}</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5">{t.login_subtitle}</p>

        {banner && <Notice kind="info" message={banner} className="mb-4" />}
        {error && <Notice kind="error" message={error} className="mb-4" />}

        <form onSubmit={submit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="employee_id" className="block text-xs font-semibold text-[var(--text-muted)] mb-1">{t.employee_id}</label>
            <input id="employee_id" className="field" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}
              autoComplete="username" autoCapitalize="characters" spellCheck={false} required maxLength={50} />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-[var(--text-muted)] mb-1">{t.password}</label>
            <input id="password" type="password" className="field" value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password" required maxLength={128} />
          </div>
          <button type="submit" className="btn btn-primary btn-lg w-full" disabled={busy || !employeeId.trim() || !password}>
            {busy ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : <LogIn className="w-5 h-5" aria-hidden="true" />}
            {busy ? t.signing_in : t.sign_in}
          </button>
        </form>

        {DEMO_MODE && (
          <div className="mt-6 pt-4 border-t border-[var(--border-subtle)]">
            <p className="text-[11px] text-[var(--text-dim)] font-mono mb-2">DEMO ACCOUNTS (password set by DEMO_PASSWORD)</p>
            <div className="flex flex-wrap gap-2">
              {DEMO_ACCOUNTS.map((a) => (
                <button key={a.id} type="button" className="btn btn-secondary btn-sm" onClick={() => setEmployeeId(a.id)}>
                  {a.id} · {a.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
