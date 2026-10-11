import React from 'react';
import type { MachineProgressItem, MachineStatus } from '../types';
import { translations, type Language } from '../services/i18n';
import {
  CheckCircle2, AlertTriangle, Flame, RotateCcw, Clock, Lock, ShieldAlert, PlayCircle, FileEdit, Sparkles,
} from 'lucide-react';

interface MachineSequenceBarProps {
  progressItems: MachineProgressItem[];
  selectedMachineId: number | null;
  onSelectMachine: (machineId: number) => void;
  currentLang: Language;
}

const ICON = 'w-5 h-5';

function StatusIcon({ status, unlocked, runType }: { status: MachineStatus; unlocked: boolean; runType?: string }) {
  if (!unlocked && status === 'NOT_STARTED') return <Lock className={`${ICON} text-slate-500`} aria-hidden="true" />;
  switch (status) {
    case 'COMPLETED':
    case 'QUALITY_APPROVED':
      if (runType === 'MANUAL_DATA_ENTRY') return <FileEdit className={`${ICON} text-amber-400`} aria-hidden="true" />;
      if (runType === 'REWORK_RUN') return <Sparkles className={`${ICON} text-emerald-400`} aria-hidden="true" />;
      return <CheckCircle2 className={`${ICON} text-emerald-400`} aria-hidden="true" />;
    case 'DATA_MISSING': return <AlertTriangle className={`${ICON} text-amber-400`} aria-hidden="true" />;
    case 'REWORK_REQUIRED': return <Flame className={`${ICON} text-red-400`} aria-hidden="true" />;
    case 'READY_FOR_RERUN': return <RotateCcw className={`${ICON} text-blue-400`} aria-hidden="true" />;
    case 'QUALITY_PENDING': return <ShieldAlert className={`${ICON} text-purple-400`} aria-hidden="true" />;
    case 'QUALITY_REJECTED': return <Flame className={`${ICON} text-red-500`} aria-hidden="true" />;
    case 'IN_PROGRESS': return <PlayCircle className={`${ICON} text-cyan-400`} aria-hidden="true" />;
    default: return <Clock className={`${ICON} text-slate-400`} aria-hidden="true" />;
  }
}

const BADGE: Partial<Record<MachineStatus, string>> = {
  COMPLETED: 'badge-completed', QUALITY_APPROVED: 'badge-completed', DATA_MISSING: 'badge-missing',
  REWORK_REQUIRED: 'badge-rework', QUALITY_REJECTED: 'badge-rework', READY_FOR_RERUN: 'badge-progress',
  QUALITY_PENDING: 'badge-quality', IN_PROGRESS: 'badge-progress',
};

function cardBorder(status: MachineStatus, selected: boolean, unlocked: boolean): string {
  if (selected) return 'border-cyan-400 ring-2 ring-cyan-400/30 shadow-lg shadow-cyan-500/20';
  if (!unlocked && status === 'NOT_STARTED') return 'border-slate-800 opacity-60 bg-slate-900/40';
  switch (status) {
    case 'COMPLETED':
    case 'QUALITY_APPROVED': return 'border-emerald-500/40 hover:border-emerald-400 bg-emerald-950/10';
    case 'DATA_MISSING': return 'border-amber-500/60 hover:border-amber-400 bg-amber-950/20 ring-1 ring-amber-500/30';
    case 'REWORK_REQUIRED':
    case 'QUALITY_REJECTED': return 'border-red-500/70 hover:border-red-400 bg-red-950/25 ring-1 ring-red-500/40';
    case 'READY_FOR_RERUN': return 'border-blue-500/60 hover:border-blue-400 bg-blue-950/20';
    case 'QUALITY_PENDING': return 'border-purple-500/60 hover:border-purple-400 bg-purple-950/20';
    case 'IN_PROGRESS': return 'border-cyan-500/60 hover:border-cyan-400 bg-cyan-950/20';
    default: return 'border-[var(--border-subtle)] hover:border-slate-600';
  }
}

export const MachineSequenceBar: React.FC<MachineSequenceBarProps> = ({ progressItems, selectedMachineId, onSelectMachine, currentLang }) => {
  const t = translations[currentLang];

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-1 mb-2">
        <h3 className="text-xs font-mono uppercase tracking-wider text-[var(--text-dim)] flex items-center gap-1.5">
          <span>MACHINE SEQUENCE PIPELINE</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">{progressItems.length} STATIONS</span>
        </h3>
        <span className="text-[11px] text-slate-400">Select a station to view runs, enter missing data, or trigger rework</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5">
        {progressItems.map((item, index) => {
          const isSelected = selectedMachineId === item.machine_id;
          const runType = item.current_run?.run_type;
          const locked = !item.is_unlocked && item.status === 'NOT_STARTED';
          const label = locked ? t.BLOCKED
            : (item.status === 'COMPLETED' || item.status === 'QUALITY_APPROVED') && runType === 'MANUAL_DATA_ENTRY' ? 'MANUAL PASS'
            : t[item.status] ?? item.status;
          const cls = locked ? 'badge-blocked' : BADGE[item.status] ?? 'badge-blocked';

          return (
            <button key={item.machine_id} type="button" onClick={() => onSelectMachine(item.machine_id)}
              aria-pressed={isSelected} aria-label={`${item.machine_code} ${item.machine_name}: ${label}`}
              className={`relative flex flex-col justify-between text-left p-3 sm:p-3.5 rounded-xl border transition-all duration-200 min-w-0 ${cardBorder(item.status, isSelected, item.is_unlocked)}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-black text-sm px-2 py-0.5 rounded bg-slate-800 text-cyan-400 border border-slate-700">{item.machine_code}</span>
                  <span className="text-[10px] text-slate-500 font-mono">#{index + 1}</span>
                </div>
                <StatusIcon status={item.status} unlocked={item.is_unlocked} runType={runType} />
              </div>
              <div className="my-1.5 min-w-0">
                <div className="font-bold text-xs text-[var(--text-main)] line-clamp-2 leading-tight break-words">{item.machine_name}</div>
                {item.run_count > 0 && (
                  <div className="text-[10px] text-slate-400 font-mono mt-1">
                    Runs: <span className="text-cyan-300 font-bold">{item.run_count}</span>
                    {item.rework_history.length > 0 && <span className="text-red-400 ml-1.5 font-bold">({item.rework_history.length} RW)</span>}
                  </div>
                )}
              </div>
              <div className="mt-2 pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between gap-1">
                <span className={`badge ${cls} !text-[10px] !px-2`}>{label}</span>
                {item.awaiting_qa && <span className="badge badge-quality !text-[10px] !px-1.5" title="Awaiting QA verification">QA</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
