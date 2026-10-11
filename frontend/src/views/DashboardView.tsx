import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { DashboardData } from '../types';
import { translations, type Language } from '../services/i18n';
import { ApiService } from '../services/api';
import { errorMessage, formatTime } from '../services/format';
import { Notice } from '../components/Notice';
import { BarChart3, Flame, FileEdit, Cpu, Activity, RefreshCw } from 'lucide-react';

interface Props {
  currentLang: Language;
  onSelectSeatbelt: (qr: string) => void;
}

const POLL_MS = 10000;

const KPI_STYLE = {
  slate: ['', 'text-slate-400', 'text-slate-200', 'text-slate-500'],
  cyan: ['border-cyan-500/30 bg-cyan-950/10', 'text-cyan-300', 'text-cyan-300', 'text-cyan-500'],
  emerald: ['border-emerald-500/30 bg-emerald-950/10', 'text-emerald-400', 'text-emerald-400', 'text-emerald-500'],
  blue: ['border-blue-500/30 bg-blue-950/10', 'text-blue-400', 'text-blue-400', 'text-blue-500'],
  red: ['border-red-500/40 bg-red-950/15', 'text-red-400', 'text-red-400', 'text-red-500'],
  amber: ['border-amber-500/40 bg-amber-950/15', 'text-amber-400', 'text-amber-400', 'text-amber-500'],
  purple: ['border-purple-500/30 bg-purple-950/10', 'text-purple-400', 'text-purple-400', 'text-purple-500'],
} as const;

const Kpi: React.FC<{ tone: keyof typeof KPI_STYLE; label: string; value: string | number; hint: string }> = ({ tone, label, value, hint }) => {
  const [box, lab, val, h] = KPI_STYLE[tone];
  return (
    <div className={`glass-panel p-3.5 flex flex-col justify-between min-w-0 ${box}`}>
      <span className={`text-[11px] font-mono truncate ${lab}`} title={label}>{label}</span>
      <div className={`text-2xl font-black font-mono mt-1 ${val}`}>{value}</div>
      <span className={`text-[10px] font-mono mt-1 truncate ${h}`}>{hint}</span>
    </div>
  );
};

export const DashboardView: React.FC<Props> = ({ currentLang, onSelectSeatbelt }) => {
  const t = translations[currentLang];
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const ctrl = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    try {
      const d = await ApiService.getDashboard(c.signal);
      if (c.signal.aborted) return;
      setData(d);
      setError(null);
    } catch (err) {
      if (c.signal.aborted) return;
      setError(errorMessage(err, 'Could not load dashboard data'));
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const tick = () => { if (!document.hidden) void load(); };
    const id = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); ctrl.current?.abort(); };
  }, [load]);

  if (!data) {
    return (
      <div className="max-w-3xl mx-auto safe-x py-12 text-center text-slate-400">
        {error ? (
          <div className="space-y-3">
            <Notice kind="error" message={error} />
            <button type="button" className="btn btn-primary" onClick={() => { setLoading(true); void load(); }}><RefreshCw className="w-4 h-4" aria-hidden="true" />{t.retry}</button>
          </div>
        ) : (
          <div role="status">
            <RefreshCw className={`w-8 h-8 mx-auto text-cyan-400 mb-2 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <p className="font-mono text-xs">{t.loading}</p>
          </div>
        )}
      </div>
    );
  }

  const { kpi_summary: k, machine_throughput, rework_pareto, missing_data_stats, recent_activities } = data;
  const pct = (n: number, total: number) => (total > 0 ? Math.min(100, (n / total) * 100) : 0);

  return (
    <div className="max-w-7xl mx-auto safe-x py-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-[var(--border-subtle)]">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-extrabold flex items-center gap-2"><BarChart3 className="w-6 h-6 text-cyan-400 shrink-0" aria-hidden="true" /><span>Industrial Production &amp; Quality Dashboard</span></h2>
          <p className="text-xs text-[var(--text-dim)] font-mono">{t.plant_name} • Live telemetry • refreshes every {POLL_MS / 1000}s</p>
        </div>
        <button type="button" onClick={() => void load()} className="btn btn-secondary btn-sm font-mono"><RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /><span>REFRESH NOW</span></button>
      </div>

      {error && <Notice kind="error" message={`Showing last known data. ${error}`} />}

      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2.5">
        <Kpi tone="slate" label={t.total_production} value={k.total_production} hint="Registered units" />
        <Kpi tone="emerald" label={t.completed_units} value={k.completed} hint="All stations passed" />
        <Kpi tone="blue" label={t.in_progress_units} value={k.in_progress} hint="On assembly line" />
        <Kpi tone="red" label={t.rework_units} value={k.rework_required} hint="Active rework" />
        <Kpi tone="amber" label={t.missing_data_units} value={k.data_missing} hint="Manual entries" />
        <Kpi tone="purple" label={t.quality_pending_units} value={k.quality_pending} hint="QA queue" />
        <Kpi tone="cyan" label={t.first_pass_yield} value={k.first_pass_yield === null ? '—' : `${k.first_pass_yield}%`} hint="Target > 95%" />
        <Kpi tone="slate" label="Active Operators" value={k.active_operators_count} hint="Last 24 hours" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="glass-panel p-4 min-w-0" aria-labelledby="thr">
          <div className="flex flex-wrap items-center justify-between gap-1 mb-3">
            <h3 id="thr" className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2"><Cpu className="w-4 h-4 text-cyan-400" aria-hidden="true" /><span>{t.throughput_title}</span></h3>
            <span className="text-[10px] font-mono text-slate-500">M1 → M6</span>
          </div>
          <div className="space-y-3">
            {machine_throughput.map((m) => (
              <div key={m.machine_id} className="space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-x-3 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono font-bold text-cyan-400 px-1.5 py-0.5 rounded bg-slate-800 text-[11px]">{m.machine_code}</span>
                    <span className="font-semibold text-slate-200 truncate">{m.machine_name}</span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-400">
                    <span className="text-emerald-400 font-bold">{m.total_processed} runs</span>
                    {m.rework_count > 0 && <span className="text-red-400 ml-1.5">({m.rework_count} RW)</span>}
                    {m.missing_data_count > 0 && <span className="text-amber-400 ml-1.5">({m.missing_data_count} manual)</span>}
                    {m.avg_cycle_time_sec !== null && <span className="ml-1.5">· {m.avg_cycle_time_sec}s</span>}
                  </div>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden flex" role="img" aria-label={`${m.machine_code}: ${m.pass_count} pass, ${m.rework_count} rework, ${m.missing_data_count} manual`}>
                  <div className="h-full bg-emerald-500" style={{ width: `${pct(m.pass_count, m.total_processed)}%` }} />
                  <div className="h-full bg-red-500" style={{ width: `${pct(m.rework_count, m.total_processed)}%` }} />
                  <div className="h-full bg-amber-500" style={{ width: `${pct(m.missing_data_count, m.total_processed)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="glass-panel p-4 min-w-0" aria-labelledby="par">
          <div className="flex flex-wrap items-center justify-between gap-1 mb-3">
            <h3 id="par" className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2"><Flame className="w-4 h-4 text-red-400" aria-hidden="true" /><span>{t.pareto_title}</span></h3>
            <span className="text-[10px] font-mono text-slate-500">Root cause Pareto</span>
          </div>
          <div className="space-y-3">
            {rework_pareto.map((item) => (
              <div key={item.reason} className="space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-x-3 text-xs">
                  <span className="font-semibold text-slate-200">{item.reason}</span>
                  <span className="font-mono text-red-400 font-bold">{item.count} ({item.percentage}%)</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-gradient-to-r from-red-600 to-amber-500 rounded-full" style={{ width: `${item.percentage}%` }} /></div>
              </div>
            ))}
            {rework_pareto.length === 0 && <p className="text-xs text-slate-500 py-6 text-center font-mono">No rework recorded. Line running smoothly.</p>}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="glass-panel p-4 min-w-0" aria-labelledby="mis">
          <h3 id="mis" className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-2"><FileEdit className="w-4 h-4 text-amber-400" aria-hidden="true" /><span>{t.missing_stats_title}</span></h3>
          <div className="grid grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2">
            {missing_data_stats.map((m) => (
              <div key={m.machine_code} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-center min-w-0">
                <span className="font-mono text-xs font-bold text-slate-400">{m.machine_code}</span>
                <div className="font-mono font-black text-xl text-amber-400 my-0.5">{m.count}</div>
                <span className="text-[10px] text-slate-500 block truncate" title={m.machine_name}>{m.machine_name}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="glass-panel p-4 lg:col-span-2 min-w-0" aria-labelledby="act">
          <div className="flex flex-wrap items-center justify-between gap-1 mb-3">
            <h3 id="act" className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2"><Activity className="w-4 h-4 text-cyan-400" aria-hidden="true" /><span>{t.recent_activity_title}</span></h3>
            <span className="text-[10px] font-mono text-emerald-400">● LIVE</span>
          </div>
          <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {recent_activities.map((act) => (
              <li key={act.id}>
                <button type="button" onClick={() => onSelectSeatbelt(act.seatbelt_qr)}
                  className="w-full text-left p-2.5 rounded-lg bg-slate-900/50 border border-slate-800 hover:border-cyan-500/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 text-xs transition-all hover:bg-slate-800/40">
                  <span className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="font-mono font-bold text-cyan-400 px-1.5 py-0.5 rounded bg-slate-800 text-[10px]">{act.seatbelt_qr}</span>
                    <span className="font-mono text-slate-400 text-[11px]">{act.machine_code}</span>
                    <span className="font-semibold text-slate-200 break-all">{act.action}</span>
                  </span>
                  <span className="flex items-center gap-2 font-mono text-[10px] text-slate-400 shrink-0"><span>{act.user_name}</span><span aria-hidden="true">•</span><span>{formatTime(act.timestamp, currentLang)}</span></span>
                </button>
              </li>
            ))}
            {recent_activities.length === 0 && <li className="text-xs text-slate-500 py-6 text-center font-mono">No activity yet.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
};
