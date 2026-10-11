import React, { useState } from 'react';
import { Flame, Loader2 } from 'lucide-react';
import type { MachineProgressItem } from '../types';
import { translations, type Language, type TranslationKey } from '../services/i18n';
import { errorMessage } from '../services/format';
import { Modal } from './Modal';
import { Notice } from './Notice';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  seatbeltQr: string;
  machine: MachineProgressItem;
  currentLang: Language;
  onConfirm: (reason: string, notes?: string) => Promise<void>;
}

// value = exact string accepted by the API
const REASONS: { value: string; key: TranslationKey }[] = [
  { value: 'Part not run', key: 'rework_reason_part_not_run' },
  { value: 'Machine error', key: 'rework_reason_machine_error' },
  { value: 'Sensor error', key: 'rework_reason_sensor_error' },
  { value: 'Parameter error', key: 'rework_reason_param_error' },
  { value: 'Assembly issue', key: 'rework_reason_assembly_issue' },
  { value: 'Quality issue', key: 'rework_reason_quality_issue' },
  { value: 'Other', key: 'rework_reason_other' },
];

const Form: React.FC<Props> = ({ onClose, seatbeltQr, machine, currentLang, onConfirm }) => {
  const t = translations[currentLang];
  const [reason, setReason] = useState(REASONS[1].value);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason === 'Other' && !notes.trim()) { setError('Please describe the reason in the notes field.'); return; }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason, notes.trim() || undefined);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="p-4 sm:p-5 space-y-4">
      <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-200">
        The current run of <b className="font-mono">{machine.machine_code}</b> on <b className="font-mono">{seatbeltQr}</b> will be archived to history
        (never deleted). The station becomes <b>READY FOR RE-RUN</b> and all downstream stations stay locked until it passes.
      </div>
      {error && <Notice kind="error" message={error} />}
      <div>
        <label htmlFor="rw_reason" className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Rework reason *</label>
        <select id="rw_reason" className="field" value={reason} onChange={(e) => setReason(e.target.value)}>
          {REASONS.map((r) => <option key={r.value} value={r.value}>{t[r.key]}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="rw_notes" className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Notes {reason === 'Other' ? '*' : '(optional)'}</label>
        <textarea id="rw_notes" className="field" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Describe what was found / repaired" />
      </div>
      <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>{t.cancel}</button>
        <button type="submit" className="btn btn-danger" disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Flame className="w-4 h-4" aria-hidden="true" />}{t.confirm_rework}
        </button>
      </div>
    </form>
  );
};

export const ReworkModal: React.FC<Props> = (props) => (
  <Modal isOpen={props.isOpen} onClose={props.onClose} accent="red" icon={<Flame className="w-5 h-5" />}
    title={`${translations[props.currentLang].rework} — ${props.machine.machine_code}`} subtitle={props.seatbeltQr} closeLabel={translations[props.currentLang].cancel}>
    <Form {...props} />
  </Modal>
);
