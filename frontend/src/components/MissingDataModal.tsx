import React, { useMemo, useState } from 'react';
import { FileEdit, Loader2 } from 'lucide-react';
import type { MachineProgressItem, Machine, User, Operator } from '../types';
import { translations, type Language } from '../services/i18n';
import { errorMessage, localToIso } from '../services/format';
import { Modal } from './Modal';
import { Notice } from './Notice';
import { ParameterFields } from './ParameterFields';
import { evaluateParams, isFutureInstant, todayLocal, nowLocalTime, type ParamValues } from '../services/paramEval';

export interface ManualDataPayload {
  operator_id: number;
  run_at: string;
  machine_parameters: Record<string, string | number>;
  result: 'PASS' | 'FAIL';
  reason: string;
  notes?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  seatbeltQr: string;
  machine: MachineProgressItem;
  machineDef?: Machine;
  currentUser: User;
  operators: Operator[];
  currentLang: Language;
  onSave: (payload: ManualDataPayload) => Promise<void>;
}

const Form: React.FC<Props> = ({ onClose, seatbeltQr, machine, machineDef, currentUser, operators, currentLang, onSave }) => {
  const t = translations[currentLang];
  const schema = useMemo(() => machineDef?.parameters_schema ?? [], [machineDef]);
  const [maxDate] = useState(todayLocal);

  const REASONS = [t.missing_reason_lan_drop, t.missing_reason_sensor_offline, t.missing_reason_manual_line];
  const [operatorId, setOperatorId] = useState<number>(currentUser.id);
  const [date, setDate] = useState(todayLocal);
  const [time, setTime] = useState(nowLocalTime);
  const [values, setValues] = useState<ParamValues>({});
  const [forceFail, setForceFail] = useState(false);
  const [reasonChoice, setReasonChoice] = useState<string>(REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ev = evaluateParams(schema, values);
  const result: 'PASS' | 'FAIL' = forceFail || !ev.allInTolerance ? 'FAIL' : 'PASS';
  const reason = reasonChoice === '__other' ? customReason.trim() : reasonChoice;
  const operatorList = operators.some((o) => o.id === currentUser.id)
    ? operators
    : [{ id: currentUser.id, employee_id: currentUser.employee_id, name: currentUser.name, role: currentUser.role }, ...operators];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!ev.allFilled) {
      setError(`Please fill in valid values for: ${[...ev.missing, ...ev.invalid].join(', ')}`);
      return;
    }
    if (reason.length < 3) { setError('Please give a reason for the manual entry.'); return; }
    if (!date || !time) { setError('Select the date and time the part was processed.'); return; }
    const runAt = localToIso(date, time);
    if (isFutureInstant(runAt)) { setError('Run date/time cannot be in the future.'); return; }

    setBusy(true);
    try {
      await onSave({ operator_id: operatorId, run_at: runAt, machine_parameters: ev.payload, result, reason, notes: notes.trim() || undefined });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="p-4 sm:p-5 space-y-4" noValidate>
      <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
        Record the values measured for <b className="font-mono">{seatbeltQr}</b> at <b className="font-mono">{machine.machine_code}</b>. No physical re-run is needed.
        The entry is stored as <b>MANUAL DATA ENTRY</b>, audited, and flagged for QA verification.
      </div>
      {error && <Notice kind="error" message={error} />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-1">
          <label htmlFor="md_operator" className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Operator *</label>
          <select id="md_operator" className="field" value={operatorId} onChange={(e) => setOperatorId(Number(e.target.value))}>
            {operatorList.map((o) => <option key={o.id} value={o.id}>{o.employee_id} — {o.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="md_date" className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Process date *</label>
          <input id="md_date" type="date" className="field" value={date} max={maxDate} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="md_time" className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Process time *</label>
          <input id="md_time" type="time" className="field" value={time} onChange={(e) => setTime(e.target.value)} required />
        </div>
      </div>

      <div>
        <h4 className="text-xs font-mono uppercase tracking-wider text-[var(--text-dim)] mb-2">{t.parameters_recorded}</h4>
        {schema.length > 0
          ? <ParameterFields schema={schema} values={values} onChange={(n, v) => setValues((p) => ({ ...p, [n]: v }))} lang={currentLang} idPrefix="md" />
          : <Notice kind="error" message="This station has no parameter definition configured. Ask an administrator to configure it." />}
      </div>

      {(!ev.allInTolerance || forceFail) && (
        <Notice kind="error" message={`Result will be recorded as FAIL${ev.outOfRange.length ? ` (${ev.outOfRange.join('; ')})` : ''}. A failed part must be reworked before the next station unlocks.`} />
      )}
      <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <input type="checkbox" className="accent-red-500" checked={forceFail} onChange={(e) => setForceFail(e.target.checked)} />
        The part failed inspection (record as FAIL)
      </label>

      <div>
        <label htmlFor="md_reason" className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Reason for manual entry *</label>
        <select id="md_reason" className="field" value={reasonChoice} onChange={(e) => setReasonChoice(e.target.value)}>
          {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          <option value="__other">{t.rework_reason_other}…</option>
        </select>
        {reasonChoice === '__other' && (
          <input className="field mt-2" value={customReason} maxLength={500} onChange={(e) => setCustomReason(e.target.value)} placeholder="Describe why the data is missing" aria-label="Custom reason" />
        )}
      </div>
      <div>
        <label htmlFor="md_notes" className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Notes (optional)</label>
        <textarea id="md_notes" className="field" rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>{t.cancel}</button>
        <button type="submit" className="btn btn-warning" disabled={busy || schema.length === 0}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <FileEdit className="w-4 h-4" aria-hidden="true" />}{t.save}
        </button>
      </div>
    </form>
  );
};

export const MissingDataModal: React.FC<Props> = (props) => (
  <Modal isOpen={props.isOpen} onClose={props.onClose} accent="amber" icon={<FileEdit className="w-5 h-5" />} widthClass="max-w-2xl"
    title={`${translations[props.currentLang].enter_missing_data} — ${props.machine.machine_code}`} subtitle={props.seatbeltQr} closeLabel={translations[props.currentLang].cancel}>
    <Form {...props} />
  </Modal>
);
