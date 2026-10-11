import React, { useState } from 'react';
import type { MachineProgressItem, Machine, User, MachineRun } from '../types';
import { translations, type Language } from '../services/i18n';
import { formatDateTime } from '../services/format';
import { PRODUCTION_ROLES, QUALITY_ROLES } from '../config';
import {
  Cpu, RotateCcw, FileEdit, Play, History, CheckCircle, XCircle, User as UserIcon, Clock, Info, ShieldCheck, Flame, Activity, Lock, AlertTriangle, Eye,
} from 'lucide-react';

interface MachineDetailPanelProps {
  machineProgress: MachineProgressItem;
  machineDef?: Machine;
  currentUser: User;
  currentLang: Language;
  /** True when a later station already holds a run for this belt (rework must start from the latest station). */
  hasDownstreamRuns: boolean;
  onOpenReworkModal: () => void;
  onOpenMissingDataModal: () => void;
  onOpenRunModal: (mode: 'run' | 'rerun') => void;
  onOpenQualityModal: () => void;
  onFlagMissing: () => void;
}

function RunTypeBadge({ runType }: { runType: string }) {
  const base = 'px-2.5 py-1 rounded-md text-xs font-bold border flex items-center gap-1.5 whitespace-nowrap';
  if (runType === 'MANUAL_DATA_ENTRY') return <span className={`${base} bg-amber-500/20 text-amber-300 border-amber-500/40`}><FileEdit className="w-3.5 h-3.5" aria-hidden="true" />MANUAL DATA ENTRY</span>;
  if (runType === 'REWORK_RUN') return <span className={`${base} bg-purple-500/20 text-purple-300 border-purple-500/40`}><RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />REWORK RUN</span>;
  return <span className={`${base} bg-blue-500/20 text-blue-300 border-blue-500/40`}><Cpu className="w-3.5 h-3.5" aria-hidden="true" />MACHINE RUN (PLC)</span>;
}

function ResultBadge({ result }: { result: string }) {
  const base = 'px-3 py-1 rounded-md text-xs font-black border flex items-center gap-1 whitespace-nowrap';
  if (result === 'PASS') return <span className={`${base} bg-emerald-500/20 text-emerald-400 border-emerald-500/40`}><CheckCircle className="w-4 h-4" aria-hidden="true" /> PASS</span>;
  if (result === 'REWORK') return <span className={`${base} bg-red-500/20 text-red-400 border-red-500/40`}><Flame className="w-4 h-4" aria-hidden="true" /> REWORK</span>;
  return <span className={`${base} bg-rose-500/20 text-rose-400 border-rose-500/40`}><XCircle className="w-4 h-4" aria-hidden="true" /> FAIL</span>;
}

type Tab = 'current' | 'history' | 'rework';

export const MachineDetailPanel: React.FC<MachineDetailPanelProps> = ({
  machineProgress: mp, machineDef, currentUser, currentLang, hasDownstreamRuns,
  onOpenReworkModal, onOpenMissingDataModal, onOpenRunModal, onOpenQualityModal, onFlagMissing,
}) => {
  const t = translations[currentLang];
  const [activeTab, setActiveTab] = useState<Tab>('current');

  const currentRun: MachineRun | null | undefined = mp.current_run;
  const paramsSchema = machineDef?.parameters_schema || [];

  const canProduce = (PRODUCTION_ROLES as readonly string[]).includes(currentUser.role);
  const canReview = (QUALITY_ROLES as readonly string[]).includes(currentUser.role);

  // What can be done at this station right now (mirrors the server-side rules)
  const s = mp.status;
  const unlocked = mp.is_unlocked;
  const noRun = !currentRun;
  const canStart = unlocked && noRun && (s === 'NOT_STARTED' || s === 'IN_PROGRESS' || s === 'DATA_MISSING');
  const canRerun = unlocked && s === 'READY_FOR_RERUN';
  const canManual = canStart || canRerun;
  const canFlag = unlocked && noRun && (s === 'NOT_STARTED' || s === 'IN_PROGRESS');
  const canRework = unlocked && !hasDownstreamRuns && s !== 'READY_FOR_RERUN' && (!noRun || s === 'DATA_MISSING');
  const canQa = canReview && mp.awaiting_qa && !!currentRun;

  const tabBtn = (tab: Tab, active: string) =>
    `px-3 sm:px-4 py-2 text-xs font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
      activeTab === tab ? active : 'border-transparent text-slate-400 hover:text-slate-200'}`;

  return (
    <div className="glass-panel p-3 sm:p-5 mt-4 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 shrink-0 rounded-xl bg-slate-800 border border-cyan-500/30 flex items-center justify-center font-mono font-black text-xl text-cyan-400">{mp.machine_code}</div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-extrabold text-[var(--text-main)] break-words">{mp.machine_name}</h2>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">Station #{mp.sequence_number}</span>
            </div>
            <p className="text-xs text-[var(--text-dim)]">{machineDef?.description || 'Automotive precision seatbelt manufacturing machine station'}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {canProduce && canStart && (
            <button type="button" onClick={() => onOpenRunModal('run')} className="btn btn-primary shadow-md flex-1 sm:flex-none"><Play className="w-4 h-4" aria-hidden="true" /><span>{t.run_station}</span></button>
          )}
          {canProduce && canRerun && (
            <button type="button" onClick={() => onOpenRunModal('rerun')} className="btn btn-primary shadow-md flex-1 sm:flex-none"><Play className="w-4 h-4" aria-hidden="true" /><span>{t.run_again}</span></button>
          )}
          {canProduce && canManual && (
            <button type="button" onClick={onOpenMissingDataModal} className="btn btn-warning shadow-md flex-1 sm:flex-none" title="Enter machine parameters manually without physical re-run">
              <FileEdit className="w-4 h-4" aria-hidden="true" /><span>{t.enter_missing_data}</span>
            </button>
          )}
          {canProduce && canFlag && (
            <button type="button" onClick={onFlagMissing} className="btn btn-outline flex-1 sm:flex-none" title="The part ran but no machine data arrived">
              <AlertTriangle className="w-4 h-4 text-amber-400" aria-hidden="true" /><span>{t.flag_missing}</span>
            </button>
          )}
          {canProduce && canRework && (
            <button type="button" onClick={onOpenReworkModal} className="btn btn-danger shadow-md flex-1 sm:flex-none" title="Initiate rework and archive current run to history">
              <Flame className="w-4 h-4" aria-hidden="true" /><span>{t.rework}</span>
            </button>
          )}
          {canQa && (
            <button type="button" onClick={onOpenQualityModal} className="btn btn-secondary text-purple-300 border-purple-500/30 flex-1 sm:flex-none" title="Perform quality assurance sign-off">
              <ShieldCheck className="w-4 h-4" aria-hidden="true" /><span>{t.quality_review}</span>
            </button>
          )}
        </div>
      </div>

      {!canProduce && (
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-400"><Eye className="w-4 h-4 shrink-0" aria-hidden="true" />{t.view_only}</p>
      )}
      {canProduce && !unlocked && (
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-400"><Lock className="w-4 h-4 shrink-0" aria-hidden="true" />{t.locked_msg}</p>
      )}

      <div role="tablist" className="flex items-center gap-1 sm:gap-2 mt-4 border-b border-[var(--border-subtle)] overflow-x-auto">
        <button type="button" role="tab" aria-selected={activeTab === 'current'} onClick={() => setActiveTab('current')} className={tabBtn('current', 'border-cyan-400 text-cyan-400 bg-cyan-950/10')}>
          <Activity className="w-4 h-4" aria-hidden="true" /><span>{t.current_run} {currentRun ? `(#${currentRun.run_number})` : ''}</span>
        </button>
        <button type="button" role="tab" aria-selected={activeTab === 'history'} onClick={() => setActiveTab('history')} className={tabBtn('history', 'border-cyan-400 text-cyan-400 bg-cyan-950/10')}>
          <History className="w-4 h-4" aria-hidden="true" /><span>{t.run_history} ({mp.history.length})</span>
        </button>
        {mp.rework_history.length > 0 && (
          <button type="button" role="tab" aria-selected={activeTab === 'rework'} onClick={() => setActiveTab('rework')} className={tabBtn('rework', 'border-red-400 text-red-400 bg-red-950/10')}>
            <Flame className="w-4 h-4 text-red-400" aria-hidden="true" /><span>REWORK LOG ({mp.rework_history.length})</span>
          </button>
        )}
      </div>

      <div className="mt-4" role="tabpanel">
        {activeTab === 'current' && (currentRun ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-900/60 border border-[var(--border-subtle)] text-xs">
              <div>
                <span className="text-slate-400 font-mono text-[11px] block">{t.run_number}</span>
                <span className="font-extrabold text-sm text-cyan-400 font-mono">Run #{currentRun.run_number}</span>
              </div>
              <div className="min-w-0">
                <span className="text-slate-400 font-mono text-[11px] block">{t.operator}</span>
                <div className="flex items-center gap-1 font-semibold text-[var(--text-main)] min-w-0">
                  <UserIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                  <span className="truncate">{currentRun.operator_name}</span>
                  <span className="text-[10px] text-slate-500 shrink-0">({currentRun.operator_employee_id})</span>
                </div>
              </div>
              <div>
                <span className="text-slate-400 font-mono text-[11px] block">{t.completed_at}</span>
                <div className="flex items-center gap-1 text-[var(--text-main)] font-mono text-[11px]">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" /><span>{formatDateTime(currentRun.completed_at, currentLang)}</span>
                </div>
              </div>
              <div className="col-span-2 lg:col-span-1">
                <span className="text-slate-400 font-mono text-[11px] block">{t.result} / Type</span>
                <div className="flex flex-wrap items-center gap-1.5 mt-0.5"><ResultBadge result={currentRun.result} /><RunTypeBadge runType={currentRun.run_type} /></div>
              </div>
            </div>

            {currentRun.reason && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="min-w-0 break-words"><span className="font-bold">Entry Reason: </span><span>{currentRun.reason}</span></div>
              </div>
            )}

            {mp.qa_reviews.map((rv) => (
              <div key={rv.id} className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${rv.decision === 'APPROVED' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="min-w-0 break-words"><span className="font-bold">QA {rv.decision} by {rv.reviewer_name} ({rv.reviewer_employee_id}): </span>{rv.comments}</div>
              </div>
            ))}
            {mp.awaiting_qa && (
              <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/30 text-xs text-purple-300 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />{t.QUALITY_PENDING}: this entry awaits QA verification.
              </div>
            )}

            <div>
              <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">{t.parameters_recorded}</h4>
              <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
                <table className="w-full min-w-[34rem] text-left text-xs">
                  <thead className="bg-slate-900/80 text-slate-400 font-mono uppercase text-[10px] border-b border-[var(--border-subtle)]">
                    <tr><th className="p-3">Parameter Name</th><th className="p-3">Recorded Value</th><th className="p-3">{t.nominal}</th><th className="p-3">{t.tolerances}</th><th className="p-3">Unit</th><th className="p-3">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)] bg-slate-900/30">
                    {paramsSchema.map((param) => {
                      const val = currentRun.machine_data[param.name];
                      const hasVal = val !== undefined && val !== null;
                      let out = false;
                      if (hasVal && param.type === 'number') {
                        const num = Number(val);
                        if (param.min_value !== undefined && num < param.min_value) out = true;
                        if (param.max_value !== undefined && num > param.max_value) out = true;
                      }
                      return (
                        <tr key={param.name} className="hover:bg-slate-800/40">
                          <td className="p-3 font-medium text-[var(--text-main)]">{currentLang === 'ta' && param.label_ta ? param.label_ta : param.label}<span className="block text-[10px] text-slate-500 font-mono">{param.name}</span></td>
                          <td className="p-3 font-mono font-bold text-sm text-cyan-300">{hasVal ? String(val) : '—'}</td>
                          <td className="p-3 text-slate-400 font-mono">{param.nominal !== undefined ? String(param.nominal) : '—'}</td>
                          <td className="p-3 text-slate-400 font-mono text-[11px]">{param.min_value !== undefined && param.max_value !== undefined ? `${param.min_value} ~ ${param.max_value}` : '—'}</td>
                          <td className="p-3 text-slate-400 font-mono">{param.unit || '—'}</td>
                          <td className="p-3">
                            {out ? <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/40 text-[10px] font-bold whitespace-nowrap">OUT OF RANGE</span>
                              : hasVal ? <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold whitespace-nowrap">IN SPEC</span>
                              : <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-500 text-[10px]">N/A</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {paramsSchema.length === 0 && Object.entries(currentRun.machine_data).map(([key, val]) => (
                      <tr key={key}><td className="p-3 font-mono">{key}</td><td className="p-3 font-mono font-bold text-cyan-300">{String(val)}</td><td className="p-3 text-slate-500">—</td><td className="p-3 text-slate-500">—</td><td className="p-3 text-slate-500">—</td><td className="p-3 text-emerald-400 text-[10px] font-bold">RECORDED</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-8 px-3 text-center border-2 border-dashed border-[var(--border-subtle)] rounded-xl bg-slate-900/20">
            <Clock className="w-8 h-8 text-slate-500 mx-auto mb-2" aria-hidden="true" />
            <h4 className="font-bold text-sm text-slate-300">{s === 'READY_FOR_RERUN' ? t.READY_FOR_RERUN : s === 'DATA_MISSING' ? t.DATA_MISSING : t.no_runs_yet}</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">{unlocked ? t.unlocked_msg : t.locked_msg}</p>
          </div>
        ))}

        {activeTab === 'history' && (mp.history.length > 0 ? (
          <div className="space-y-3">
            <div className="text-xs text-slate-400 font-mono mb-2">Permanent immutable record of previous production runs for this station:</div>
            {mp.history.map((hr) => (
              <div key={hr.id} className="p-3 sm:p-4 rounded-xl bg-slate-900/40 border border-slate-800 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-mono font-bold text-sm px-2 py-0.5 rounded bg-slate-800 text-slate-300">Run #{hr.run_number} (Archived)</span><RunTypeBadge runType={hr.run_type} /></div>
                  <div className="flex items-center gap-2"><ResultBadge result={hr.result} /><span className="text-slate-400 font-mono text-[11px]">{formatDateTime(hr.completed_at, currentLang)}</span></div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-[11px]">
                  <div><span className="text-slate-500 font-mono">Operator:</span><div className="font-semibold text-slate-300">{hr.operator_name}</div></div>
                  <div><span className="text-slate-500 font-mono">Data Source:</span><div className="font-mono text-slate-300 break-all">{hr.data_source}</div></div>
                  <div className="col-span-2"><span className="text-slate-500 font-mono">Parameters Recorded:</span><div className="font-mono text-cyan-400 break-all">{JSON.stringify(hr.machine_data)}</div></div>
                </div>
                {hr.reason && <div className="mt-2 pt-2 border-t border-slate-800/60 text-[11px] text-amber-400/90 font-mono break-words">Note: {hr.reason}</div>}
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-500">No archived previous runs for this station. Current run is the original attempt.</div>
        ))}

        {activeTab === 'rework' && (
          <div className="space-y-3">
            <div className="text-xs text-slate-400 font-mono mb-2">Traceability history of all rework tickets initiated for this station:</div>
            {mp.rework_history.map((rw) => (
              <div key={rw.id} className="p-3.5 rounded-xl bg-red-950/20 border border-red-500/30 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="font-bold text-red-400 flex items-center gap-1.5"><Flame className="w-4 h-4" aria-hidden="true" />Rework Ticket #{rw.id}: {rw.reason}</span>
                  <span className="font-mono text-[11px] text-slate-400">{formatDateTime(rw.created_at, currentLang)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2 text-[11px]">
                  <div><span className="text-slate-500 font-mono">Requested By:</span><div className="font-medium text-slate-300">{rw.rework_by_name} ({rw.rework_by_emp_id})</div></div>
                  <div><span className="text-slate-500 font-mono">Resolution Status:</span><div className="font-bold text-emerald-400 font-mono">{rw.status}</div></div>
                </div>
                {rw.notes && <div className="mt-2 text-slate-400 font-mono text-[11px] bg-slate-900/60 p-2 rounded break-words">Remarks: {rw.notes}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
