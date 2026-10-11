import React, { useCallback, useEffect, useState } from 'react';
import type { PendingReview, User } from '../types';
import { translations, type Language } from '../services/i18n';
import { ApiService } from '../services/api';
import { errorMessage, formatDateTime } from '../services/format';
import { QUALITY_ROLES } from '../config';
import { Notice, type NoticeKind } from '../components/Notice';
import { ClipboardCheck, ShieldCheck, ShieldAlert, CheckCircle, XCircle, RefreshCw, FileEdit, RotateCcw, Loader2, Eye } from 'lucide-react';
import { soundEffects } from '../services/audio';

interface Props {
  currentUser: User;
  currentLang: Language;
  onInspectSeatbelt: (qr: string) => void;
}

export const QualityHubView: React.FC<Props> = ({ currentUser, currentLang, onInspectSeatbelt }) => {
  const t = translations[currentLang];
  const canReview = (QUALITY_ROLES as readonly string[]).includes(currentUser.role);
  const [items, setItems] = useState<PendingReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PendingReview | null>(null);
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState<null | 'APPROVED' | 'REJECTED'>(null);
  const [flash, setFlash] = useState<{ kind: NoticeKind; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await ApiService.getPendingReviews();
      setItems(list);
      setSelected((cur) => (cur ? list.find((i) => i.run_id === cur.run_id) ?? null : null));
    } catch (err) {
      setFlash({ kind: 'error', message: errorMessage(err, 'Could not load the QA queue') });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const decide = async (decision: 'APPROVED' | 'REJECTED') => {
    if (!selected) return;
    if (comments.trim().length < 3) { setFlash({ kind: 'error', message: 'Enter verification comments (min. 3 characters) before signing.' }); return; }
    setBusy(decision);
    try {
      await ApiService.submitQualityReview({ seatbelt_id: selected.seatbelt_id, machine_id: selected.machine_id, run_id: selected.run_id, decision, comments: comments.trim() });
      if (decision === 'APPROVED') { soundEffects.playPassChime(); setFlash({ kind: 'success', message: `Record for ${selected.seatbelt_qr} approved.` }); }
      else { soundEffects.playAlertBuzz(); setFlash({ kind: 'info', message: `Record for ${selected.seatbelt_qr} rejected. Rework is required.` }); }
      setSelected(null);
      setComments('');
      await load();
    } catch (err) {
      setFlash({ kind: 'error', message: errorMessage(err, 'Failed to submit quality decision') });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto safe-x py-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-[var(--border-subtle)]">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-extrabold flex items-center gap-2"><ClipboardCheck className="w-6 h-6 text-purple-400 shrink-0" aria-hidden="true" /><span>Quality Assurance Hub &amp; Review Queue</span></h2>
          <p className="text-xs text-[var(--text-dim)] font-mono">Review manual data entries and rework runs, and provide digital QA sign-offs</p>
        </div>
        <button type="button" onClick={() => void load()} className="btn btn-secondary btn-sm font-mono" disabled={loading}><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /><span>REFRESH QUEUE</span></button>
      </div>

      {flash && <Notice kind={flash.kind} message={flash.message} onDismiss={() => setFlash(null)} />}
      {!canReview && <Notice kind="info" message="You can view the queue, but only Quality users can sign off records." />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="glass-panel p-3 sm:p-4 lg:col-span-2 space-y-3 min-w-0" aria-labelledby="qa-list">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <h3 id="qa-list" className="text-xs font-mono font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5"><ShieldAlert className="w-4 h-4 text-purple-400" aria-hidden="true" /><span>Pending quality items ({items.length})</span></h3>
            <span className="text-[10px] text-slate-500 font-mono">ISO 9001 / IATF 16949</span>
          </div>

          {loading && items.length === 0 ? (
            <div className="py-12 text-center text-slate-400 font-mono text-xs" role="status"><Loader2 className="w-6 h-6 animate-spin mx-auto text-purple-400 mb-2" aria-hidden="true" />{t.loading}</div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-slate-500 font-mono text-xs border border-dashed border-slate-800 rounded-xl bg-slate-900/20">
              <ShieldCheck className="w-8 h-8 text-emerald-500/60 mx-auto mb-2" aria-hidden="true" />
              <p className="font-bold text-slate-300">All quality reviews are up to date</p>
              <p className="text-[11px] text-slate-500 mt-0.5">No manual entries or rework runs awaiting QA sign-off.</p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {items.map((item) => {
                const isSel = selected?.run_id === item.run_id;
                return (
                  <li key={item.run_id}>
                    <button type="button" onClick={() => { setSelected(item); setComments(''); }} aria-pressed={isSel}
                      className={`w-full text-left p-3 sm:p-3.5 rounded-xl border transition-all ${isSel ? 'border-purple-400 ring-2 ring-purple-400/30 bg-purple-950/20' : 'border-slate-800 bg-slate-900/40 hover:border-slate-600'}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <span className="font-mono font-bold text-sm text-cyan-400 break-all">{item.seatbelt_qr}</span>
                          <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">{item.machine_code}</span>
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border ${item.run_type === 'MANUAL_DATA_ENTRY' ? 'bg-amber-500/15 text-amber-300 border-amber-500/40' : 'bg-purple-500/15 text-purple-300 border-purple-500/40'}`}>
                            {item.run_type === 'MANUAL_DATA_ENTRY' ? <FileEdit className="w-3 h-3" aria-hidden="true" /> : <RotateCcw className="w-3 h-3" aria-hidden="true" />}{t[item.run_type] ?? item.run_type}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono">{formatDateTime(item.created_at, currentLang)}</span>
                      </div>
                      <div className="mt-1.5 text-[11px] text-slate-400 break-words">{item.machine_name} · by {item.operator_name}{item.reason ? ` · ${item.reason}` : ''}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="glass-panel p-3 sm:p-4 space-y-3 h-fit lg:sticky lg:top-40 min-w-0" aria-labelledby="qa-sign">
          <h3 id="qa-sign" className="text-xs font-mono font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" aria-hidden="true" /><span>Electronic QA sign-off</span></h3>
          {!selected ? (
            <p className="text-xs text-slate-500 py-8 text-center font-mono">Select an item from the queue to review it.</p>
          ) : (
            <>
              <div className="p-3 rounded-lg bg-slate-900/60 border border-[var(--border-subtle)] text-xs space-y-1 min-w-0">
                <div className="font-mono font-bold text-cyan-400 break-all">{selected.seatbelt_qr} · {selected.machine_code}</div>
                <div className="text-slate-400">{selected.seatbelt_model}</div>
                <div className="font-mono text-cyan-300 break-all">{JSON.stringify(selected.machine_data)}</div>
                {selected.reason && <div className="text-amber-300 break-words">Reason: {selected.reason}</div>}
              </div>
              <button type="button" className="btn btn-outline btn-sm w-full" onClick={() => onInspectSeatbelt(selected.seatbelt_qr)}><Eye className="w-4 h-4" aria-hidden="true" />Open in station view</button>
              {canReview && (
                <>
                  <div>
                    <label htmlFor="qa_hub_comments" className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Verification comments *</label>
                    <textarea id="qa_hub_comments" className="field" rows={3} maxLength={2000} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="e.g. Verified against calibrated gauge" />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="btn btn-danger flex-1" disabled={!!busy} onClick={() => decide('REJECTED')}>{busy === 'REJECTED' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <XCircle className="w-4 h-4" aria-hidden="true" />}REJECT</button>
                    <button type="button" className="btn btn-success flex-1" disabled={!!busy} onClick={() => decide('APPROVED')}>{busy === 'APPROVED' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <CheckCircle className="w-4 h-4" aria-hidden="true" />}APPROVE</button>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
};
