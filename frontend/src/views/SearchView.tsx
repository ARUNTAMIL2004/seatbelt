import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Machine, Paged, SeatbeltSummary } from '../types';
import { translations, type Language } from '../services/i18n';
import { ApiService } from '../services/api';
import { errorMessage, formatDateTime } from '../services/format';
import { Notice } from '../components/Notice';
import { Search, ArrowRight, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  currentLang: Language;
  onSelectSeatbelt: (qr: string) => void;
}

const PAGE_SIZE = 20;
const STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'DATA_MISSING', 'REWORK_REQUIRED', 'READY_FOR_RERUN', 'QUALITY_PENDING', 'QUALITY_REJECTED'] as const;

const badgeFor = (s: string) =>
  s === 'COMPLETED' ? 'badge-completed' : s === 'DATA_MISSING' ? 'badge-missing' : s === 'REWORK_REQUIRED' || s === 'QUALITY_REJECTED' ? 'badge-rework'
  : s === 'QUALITY_PENDING' ? 'badge-quality' : s === 'NOT_STARTED' ? 'badge-blocked' : 'badge-progress';

export const SearchView: React.FC<Props> = ({ currentLang, onSelectSeatbelt }) => {
  const t = translations[currentLang];
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('');
  const [machineId, setMachineId] = useState('');
  const [machines, setMachines] = useState<Machine[]>([]);
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<Paged<SeatbeltSummary> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => { ApiService.getMachines().then(setMachines).catch(() => setMachines([])); }, []);
  useEffect(() => {
    const id = setTimeout(() => { setDebounced(term.trim()); setPage(0); }, 300);
    return () => clearTimeout(id);
  }, [term]);

  const run = useCallback(async () => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setLoading(true);
    try {
      const data = await ApiService.searchSeatbelts({ q: debounced, status, machine_id: machineId ? Number(machineId) : undefined, limit: PAGE_SIZE, offset: page * PAGE_SIZE }, c.signal);
      if (c.signal.aborted) return;
      setResult(data);
      setError(null);
    } catch (err) {
      if (c.signal.aborted) return;
      setError(errorMessage(err, 'Search failed'));
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
  }, [debounced, status, machineId, page]);

  useEffect(() => { void run(); return () => ctrl.current?.abort(); }, [run]);

  const total = result?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-7xl mx-auto safe-x py-4 space-y-4">
      <div className="pb-2 border-b border-[var(--border-subtle)]">
        <h2 className="text-lg sm:text-xl font-extrabold flex items-center gap-2"><Search className="w-6 h-6 text-cyan-400 shrink-0" aria-hidden="true" /><span>Traceability Genealogy &amp; Part Registry Explorer</span></h2>
        <p className="text-xs text-[var(--text-dim)] font-mono">Search by QR code, serial, model, batch, station or production status</p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); setDebounced(term.trim()); setPage(0); }} role="search" className="glass-panel p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_14rem_14rem] gap-3">
        <div className="relative min-w-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input type="search" className="field !pl-9" placeholder={t.search_placeholder} aria-label={t.search_placeholder} value={term} maxLength={100} onChange={(e) => setTerm(e.target.value)} />
        </div>
        <select className="field" aria-label={t.all_statuses} value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
          <option value="">{t.all_statuses}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{t[s]}</option>)}
        </select>
        <select className="field" aria-label={t.all_stations} value={machineId} onChange={(e) => { setMachineId(e.target.value); setPage(0); }}>
          <option value="">{t.all_stations}</option>
          {machines.map((m) => <option key={m.id} value={m.id}>{m.machine_code} — {m.machine_name}</option>)}
        </select>
      </form>

      {error && <Notice kind="error" message={error} />}

      <div className="glass-panel overflow-hidden" aria-busy={loading}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-xs">
            <thead className="bg-slate-900/80 text-slate-400 font-mono uppercase text-[10px] border-b border-[var(--border-subtle)]">
              <tr><th className="p-3">QR / Serial</th><th className="p-3">Model</th><th className="p-3">Batch</th><th className="p-3">Station</th><th className="p-3">Status</th><th className="p-3">Runs</th><th className="p-3">Updated</th><th className="p-3"><span className="sr-only">Open</span></th></tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {(result?.items ?? []).map((s) => (
                <tr key={s.id} className="hover:bg-slate-800/40">
                  <td className="p-3 font-mono font-bold text-cyan-400 whitespace-nowrap">{s.qr_code}</td>
                  <td className="p-3 max-w-[16rem] truncate" title={s.model}>{s.model}</td>
                  <td className="p-3 font-mono text-slate-400 whitespace-nowrap">{s.batch_number}</td>
                  <td className="p-3 font-mono">{s.current_machine_code ?? '—'}</td>
                  <td className="p-3"><span className={`badge ${badgeFor(s.current_status)}`}>{t[s.current_status] ?? s.current_status}</span></td>
                  <td className="p-3 font-mono">{s.total_runs}{s.rework_count > 0 && <span className="text-red-400"> ({s.rework_count} RW)</span>}</td>
                  <td className="p-3 font-mono text-slate-400 whitespace-nowrap">{formatDateTime(s.updated_at, currentLang)}</td>
                  <td className="p-3 text-right"><button type="button" className="btn btn-outline btn-sm" onClick={() => onSelectSeatbelt(s.qr_code)} aria-label={`Open ${s.qr_code}`}><ArrowRight className="w-4 h-4" aria-hidden="true" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && !result && <div className="py-10 text-center text-cyan-400" role="status"><Loader2 className="w-6 h-6 animate-spin mx-auto" aria-hidden="true" /></div>}
        {result && result.items.length === 0 && <p className="py-10 text-center text-xs text-slate-500 font-mono">{t.no_data}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-t border-[var(--border-subtle)] text-xs font-mono text-slate-400">
          <span>{total} result{total === 1 ? '' : 's'}{loading && ' · loading…'}</span>
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-outline btn-sm" disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}><ChevronLeft className="w-4 h-4" aria-hidden="true" />{t.previous}</button>
            <span>{page + 1} / {pages}</span>
            <button type="button" className="btn btn-outline btn-sm" disabled={page + 1 >= pages || loading} onClick={() => setPage((p) => p + 1)}>{t.next}<ChevronRight className="w-4 h-4" aria-hidden="true" /></button>
          </div>
        </div>
      </div>
    </div>
  );
};
