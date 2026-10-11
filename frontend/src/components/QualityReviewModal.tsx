import React, { useState } from 'react';
import { ShieldCheck, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import type { MachineProgressItem } from '../types';
import { translations, type Language } from '../services/i18n';
import { errorMessage } from '../services/format';
import { Modal } from './Modal';
import { Notice } from './Notice';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  seatbeltQr: string;
  machine: MachineProgressItem;
  currentLang: Language;
  onConfirmReview: (decision: 'APPROVED' | 'REJECTED', comments: string) => Promise<void>;
}

const Form: React.FC<Props> = ({ onClose, seatbeltQr, machine, currentLang, onConfirmReview }) => {
  const t = translations[currentLang];
  const run = machine.current_run;
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState<null | 'APPROVED' | 'REJECTED'>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: 'APPROVED' | 'REJECTED') => {
    if (comments.trim().length < 3) { setError('Enter your verification comments (min. 3 characters).'); return; }
    setBusy(decision);
    setError(null);
    try {
      await onConfirmReview(decision, comments.trim());
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  };

  return (
    <div className="p-4 sm:p-5 space-y-4">
      {run && (
        <div className="p-3 rounded-lg bg-slate-900/60 border border-[var(--border-subtle)] text-xs space-y-1">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span><span className="text-slate-500 font-mono">Run:</span> #{run.run_number}</span>
            <span><span className="text-slate-500 font-mono">Type:</span> {run.run_type}</span>
            <span><span className="text-slate-500 font-mono">Operator:</span> {run.operator_name}</span>
          </div>
          <div className="font-mono text-cyan-400 break-all">{JSON.stringify(run.machine_data)}</div>
          {run.reason && <div className="text-amber-300 break-words">Reason: {run.reason}</div>}
        </div>
      )}
      {error && <Notice kind="error" message={error} />}
      <div>
        <label htmlFor="qa_comments" className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Electronic signature comments *</label>
        <textarea id="qa_comments" className="field" rows={3} maxLength={2000} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="e.g. Verified against calibrated gauge CG-408" />
        <p className="text-[11px] text-[var(--text-dim)] mt-1">Signing as {seatbeltQr} / {machine.machine_code}. Your decision is audited and cannot be changed.</p>
      </div>
      <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={!!busy}>{t.cancel}</button>
        <button type="button" className="btn btn-danger" disabled={!!busy} onClick={() => decide('REJECTED')}>
          {busy === 'REJECTED' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <XCircle className="w-4 h-4" aria-hidden="true" />}REJECT
        </button>
        <button type="button" className="btn btn-success" disabled={!!busy} onClick={() => decide('APPROVED')}>
          {busy === 'APPROVED' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="w-4 h-4" aria-hidden="true" />}APPROVE
        </button>
      </div>
    </div>
  );
};

export const QualityReviewModal: React.FC<Props> = (props) => (
  <Modal isOpen={props.isOpen} onClose={props.onClose} accent="purple" icon={<ShieldCheck className="w-5 h-5" />}
    title={`${translations[props.currentLang].quality_review} — ${props.machine.machine_code}`} subtitle={props.seatbeltQr} closeLabel={translations[props.currentLang].cancel}>
    <Form {...props} />
  </Modal>
);
