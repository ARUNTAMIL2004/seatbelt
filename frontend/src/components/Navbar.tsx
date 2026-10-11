import React, { useState } from 'react';
import {
  ShieldCheck, Cpu, Volume2, VolumeX, Moon, Sun, Globe, UserCircle, QrCode, BarChart3, ClipboardCheck, Search,
  FileSpreadsheet, Settings, Flame, CheckCircle2, AlertTriangle, LogOut, KeyRound,
} from 'lucide-react';
import type { User, UserRole } from '../types';
import { translations, type Language } from '../services/i18n';
import { soundEffects } from '../services/audio';
import { DEMO_MODE, VIEW_ACCESS } from '../config';

interface NavbarProps {
  currentUser: User;
  currentLang: Language;
  onToggleLang: () => void;
  isDarkTheme: boolean;
  onToggleTheme: () => void;
  activeView: string;
  onSelectView: (view: string) => void;
  onQuickScan: (qr: string) => void;
  onSignOut: () => void;
  onChangePassword: () => void;
}

const ROLE_BADGE: Record<UserRole, string> = {
  PRODUCTION: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
  QUALITY: 'bg-purple-500/20 text-purple-400 border-purple-500/40',
  SUPERVISOR: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
  ADMIN: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
};

const ACTIVE_STYLE: Record<string, string> = {
  quality: 'bg-purple-500/20 text-purple-400 border-purple-500/40',
  admin: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
};
const DEFAULT_ACTIVE = 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40';

export const Navbar: React.FC<NavbarProps> = ({
  currentUser, currentLang, onToggleLang, isDarkTheme, onToggleTheme, activeView, onSelectView, onQuickScan, onSignOut, onChangePassword,
}) => {
  const t = translations[currentLang];
  const [isMuted, setIsMuted] = useState(false);

  const tabs = [
    { id: 'station', label: t.scan_qr_nav, Icon: QrCode },
    { id: 'dashboard', label: t.dashboard_nav, Icon: BarChart3 },
    { id: 'quality', label: t.quality_hub_nav, Icon: ClipboardCheck },
    { id: 'search', label: t.search_nav, Icon: Search },
    { id: 'reports', label: t.reports_nav, Icon: FileSpreadsheet },
    { id: 'admin', label: t.admin_nav, Icon: Settings },
  ].filter((tab) => VIEW_ACCESS[tab.id].includes(currentUser.role));

  const iconBtn = 'p-2 rounded-lg hover:bg-slate-800/60 text-slate-400 hover:text-cyan-400';

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]/90 backdrop-blur-md no-print">
      {/* Top banner */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 safe-x py-1.5 border-b border-[var(--border-subtle)]/50 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 font-semibold text-cyan-400 min-w-0">
            <Cpu className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{t.plant_name}</span>
          </div>
          <span className="hidden md:inline px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono whitespace-nowrap">
            ● {t.station_online}
          </span>
        </div>

        {DEMO_MODE && (
          <div className="order-3 lg:order-none w-full lg:w-auto flex items-center gap-1 overflow-x-auto py-1">
            <span className="text-[var(--text-dim)] font-mono text-[11px] mr-1 shrink-0">DEMO FLOWS:</span>
            {[
              { qr: 'SB-2026-000123', label: 'SB-000123 (Missing M5)', cls: 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30', Icon: AlertTriangle },
              { qr: 'SB-2026-000124', label: 'SB-000124 (Rework M5)', cls: 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/30', Icon: Flame },
              { qr: 'SB-2026-000125', label: 'SB-000125 (Completed)', cls: 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30', Icon: CheckCircle2 },
            ].map(({ qr, label, cls, Icon }) => (
              <button key={qr} type="button" onClick={() => onQuickScan(qr)}
                className={`shrink-0 px-2 py-1 rounded border text-[11px] font-mono flex items-center gap-1 ${cls}`}>
                <Icon className="w-3 h-3" aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1 sm:gap-2 ml-auto">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] min-w-0 max-w-[55vw] sm:max-w-none">
            <UserCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
            <span className="font-medium text-[var(--text-main)] truncate">{currentUser.name}</span>
            <span className={`hidden sm:inline px-1.5 py-0.5 rounded text-[10px] font-bold border ${ROLE_BADGE[currentUser.role]}`}>{currentUser.role}</span>
          </div>

          <button type="button" className={iconBtn} aria-label={t.toggle_sound} title={t.toggle_sound}
            onClick={() => setIsMuted(soundEffects.toggleMute())}>
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" aria-hidden="true" /> : <Volume2 className="w-4 h-4" aria-hidden="true" />}
          </button>
          <button type="button" onClick={onToggleLang} aria-label={t.change_language} title={t.change_language}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700 text-cyan-300 border border-slate-700 font-medium text-xs">
            <Globe className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{currentLang === 'en' ? 'தமிழ்' : 'English'}</span>
            <span className="sm:hidden">{currentLang === 'en' ? 'த' : 'EN'}</span>
          </button>
          <button type="button" className={iconBtn} aria-label={t.toggle_theme} title={t.toggle_theme} onClick={onToggleTheme}>
            {isDarkTheme ? <Sun className="w-4 h-4" aria-hidden="true" /> : <Moon className="w-4 h-4" aria-hidden="true" />}
          </button>
          <button type="button" className={iconBtn} aria-label={t.change_password} title={t.change_password} onClick={onChangePassword}>
            <KeyRound className="w-4 h-4" aria-hidden="true" />
          </button>
          <button type="button" className={`${iconBtn} hover:text-red-400`} aria-label={t.sign_out} title={t.sign_out} onClick={onSignOut}>
            <LogOut className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Brand + navigation */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 safe-x py-2">
        <button type="button" className="flex items-center gap-3 text-left min-w-0" onClick={() => onSelectView('station')}>
          <div className="w-9 h-9 shrink-0 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <ShieldCheck className="w-5 h-5 text-black stroke-[2.5]" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <span className="block text-sm sm:text-base font-extrabold text-[var(--text-main)] tracking-tight leading-tight truncate font-heading">{t.app_title}</span>
            <span className="block text-[11px] text-[var(--text-dim)] font-mono">AUTOSAFE-TRACE 4.0 • PRODUCTION GRADE</span>
          </div>
        </button>

        <nav aria-label="Main" className="flex items-center gap-1.5 overflow-x-auto -mx-1 px-1 pb-1 lg:pb-0">
          {tabs.map(({ id, label, Icon }) => (
            <button key={id} type="button" onClick={() => onSelectView(id)} aria-current={activeView === id ? 'page' : undefined}
              className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-all whitespace-nowrap ${
                activeView === id
                  ? `${ACTIVE_STYLE[id] ?? DEFAULT_ACTIVE} shadow-sm`
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-slate-800/40'
              }`}>
              <Icon className="w-4 h-4" aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
};
