import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from './types';
import { translations, type Language } from './services/i18n';
import { ApiService } from './services/api';
import { Navbar } from './components/Navbar';
import { Notice } from './components/Notice';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { LoginView } from './views/LoginView';
import { ProductionStationView } from './views/ProductionStationView';
import { DashboardView } from './views/DashboardView';
import { QualityHubView } from './views/QualityHubView';
import { SearchView } from './views/SearchView';
import { ReportsView } from './views/ReportsView';
import { AdminSettingsView } from './views/AdminSettingsView';
import { APP_VERSION, IDLE_LOGOUT_MS, STATION_NAME, VIEW_ACCESS } from './config';
import { Loader2 } from 'lucide-react';

const LANG_KEY = 'seatbelt.lang';
const THEME_KEY = 'seatbelt.theme';

function readPref(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writePref(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(!ApiService.hasToken());
  const [loginBanner, setLoginBanner] = useState<string | null>(null);

  const [currentLang, setCurrentLang] = useState<Language>(() => (readPref(LANG_KEY) === 'ta' ? 'ta' : 'en'));
  const [isDarkTheme, setIsDarkTheme] = useState<boolean>(() => readPref(THEME_KEY) !== 'light');
  const [activeView, setActiveView] = useState<string>('station');
  const [targetQr, setTargetQr] = useState<string>('');
  const [showPassword, setShowPassword] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const t = translations[currentLang];
  const langRef = useRef(currentLang);
  useEffect(() => { langRef.current = currentLang; }, [currentLang]);

  // Reflect preferences on <html>
  useEffect(() => {
    document.documentElement.lang = currentLang;
    writePref(LANG_KEY, currentLang);
  }, [currentLang]);
  useEffect(() => {
    if (isDarkTheme) document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', 'light');
    writePref(THEME_KEY, isDarkTheme ? 'dark' : 'light');
  }, [isDarkTheme]);

  const signOut = useCallback((banner: string | null = null) => {
    ApiService.logout();
    setCurrentUser(null);
    setLoginBanner(banner);
    setActiveView('station');
    setTargetQr('');
  }, []);

  // Any 401 from the API => back to the login screen
  useEffect(() => {
    ApiService.setUnauthorizedHandler(() => {
      setCurrentUser(null);
      setLoginBanner(translations[langRef.current].session_expired);
    });
    return () => ApiService.setUnauthorizedHandler(null);
  }, []);

  // Restore an existing session
  useEffect(() => {
    if (!ApiService.hasToken()) return;
    let cancelled = false;
    ApiService.getMe()
      .then((u) => { if (!cancelled) { setCurrentUser(u); } })
      .catch(() => { ApiService.clearToken(); })
      .finally(() => { if (!cancelled) setAuthChecked(true); });
    return () => { cancelled = true; };
  }, []);

  // Idle auto sign-out (shared shop-floor terminals)
  useEffect(() => {
    if (!currentUser) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => signOut(translations[langRef.current].idle_signed_out), IDLE_LOGOUT_MS);
    };
    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [currentUser, signOut]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const handleLoggedIn = (user: User) => {
    setCurrentUser(user);
    setLoginBanner(null);
    if (user.language === 'ta' || user.language === 'en') setCurrentLang(user.language);
    setActiveView('station');
  };

  const handleQuickScan = (qr: string) => {
    setTargetQr(qr);
    setActiveView('station');
    window.scrollTo({ top: 0 });
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen min-h-dvh flex items-center justify-center text-cyan-400" role="status" aria-label={t.loading}>
        <Loader2 className="w-8 h-8 animate-spin" aria-hidden="true" />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <LoginView lang={currentLang} onToggleLang={() => setCurrentLang((l) => (l === 'en' ? 'ta' : 'en'))}
        onLoggedIn={handleLoggedIn} banner={loginBanner} />
    );
  }

  const view = VIEW_ACCESS[activeView]?.includes(currentUser.role) ? activeView : 'station';

  return (
    <div className="app-container">
      <Navbar
        currentUser={currentUser}
        currentLang={currentLang}
        onToggleLang={() => setCurrentLang((l) => (l === 'en' ? 'ta' : 'en'))}
        isDarkTheme={isDarkTheme}
        onToggleTheme={() => setIsDarkTheme((d) => !d)}
        activeView={view}
        onSelectView={setActiveView}
        onQuickScan={handleQuickScan}
        onSignOut={() => signOut()}
        onChangePassword={() => setShowPassword(true)}
      />

      {toast && (
        <div className="fixed top-24 right-3 left-3 sm:left-auto sm:w-96 z-50">
          <Notice kind="success" message={toast} onDismiss={() => setToast(null)} />
        </div>
      )}

      <main className="flex-1 pb-12 min-w-0">
        {view === 'station' && <ProductionStationView currentUser={currentUser} currentLang={currentLang} initialQr={targetQr} />}
        {view === 'dashboard' && <DashboardView currentLang={currentLang} onSelectSeatbelt={handleQuickScan} />}
        {view === 'quality' && <QualityHubView currentUser={currentUser} currentLang={currentLang} onInspectSeatbelt={handleQuickScan} />}
        {view === 'search' && <SearchView currentLang={currentLang} onSelectSeatbelt={handleQuickScan} />}
        {view === 'reports' && <ReportsView currentLang={currentLang} />}
        {view === 'admin' && <AdminSettingsView currentUser={currentUser} currentLang={currentLang} />}
      </main>

      <footer className="w-full border-t border-[var(--border-subtle)] bg-[var(--bg-secondary)]/80 py-3 safe-x text-center sm:text-left text-slate-500 text-xs font-mono flex flex-wrap items-center justify-center sm:justify-between gap-2 no-print">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" aria-hidden="true" />
          <span>AeroSafety Automotive Systems • {STATION_NAME}</span>
        </div>
        <div>ISO 9001:2015 • IATF 16949 • Automated Traceability Engine v{APP_VERSION}</div>
      </footer>

      <ChangePasswordModal isOpen={showPassword} onClose={() => setShowPassword(false)} lang={currentLang} onDone={setToast} />
    </div>
  );
};

export default App;
