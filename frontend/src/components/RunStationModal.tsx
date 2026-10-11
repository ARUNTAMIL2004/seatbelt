import React, { useState } from 'react';
import { Play, Loader2, Cpu } from 'lucide-react';
import type { MachineProgressItem, Machine } from '../types';
import { translations, type Language } from '../services/i18n';
import { errorMessage } from '../services/format';
import { Modal } from './Modal';
import { Notice } from './Notice';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  mode: 'run' | 'rerun';
  seatbeltQr: string;
  machine: MachineProgressItem;
  machineDef?: Machine;
  currentLang: Language;
  onExecute: (simulateFailure: boolean) => Promise<void>;
}

const Form: React.FC<Props> = ({ onClose, mode, seatbeltQr, machineDef, currentLang, onExecute }) => {
  const t = translations[currentLang];
  const isSimulator = machineDef?.adapter_type === 'SIMULATOR';
  const [outcome, setOutcome] = useState<'PASS' | 'FAIL'>('PASS');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onExecute(isSimulator && outcome === 'FAIL');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="p-4 sm:p-5 space-y-4">
      <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-xs text-cyan-100 flex items-start gap-2">
        <Cpu className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          {mode === 'rerun'
            ? 'The rework re-run is recorded as the CURRENT run; the archived run stays in history. A PASS unlocks the next station.'
            : 'The station cycle is executed through the configured machine adapter and recorded with its measured parameters.'}
          {' '}Adapter: <b className="font-mono">{machineDef?.adapter_type ?? '—'}</b>
        </span>
      </div>
      {error && <Notice kind="error" message={error} />}

      {isSimulator ? (
        <fieldset>
          <legend className="block text-xs font-semibold text-[var(--text-muted)] mb-2">Simulated cycle outcome (software simulator only)</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(['PASS', 'FAIL'] as const).map((o) => (
              <label key={o} className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer text-sm font-semibold ${
                outcome === o ? (o === 'PASS' ? 'border-emerald-400 bg-emerald-500/10 text-emerald-300' : 'border-red-400 bg-red-500/10 text-red-300') : 'border-[var(--border-subtle)] text-[var(--text-muted)]'}`}>
                <input type="radio" name="outcome" value={o} checked={outcome === o} onChange={() => setOutcome(o)} className="accent-cyan-400" />
                {o === 'PASS' ? 'Normal cycle (in tolerance)' : 'Out-of-tolerance cycle'}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="text-xs text-[var(--text-muted)]">Results come from the connected machine. If no data arrives, use “{t.enter_missing_data}”.</p>
      )}

      <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>{t.cancel}</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Play className="w-4 h-4" aria-hidden="true" />}
          {mode === 'rerun' ? t.run_again : t.run_station}
        </button>
      </div>
      <span className="sr-only">{seatbeltQr}</span>
    </form>
  );
};

export const RunStationModal: React.FC<Props> = (props) => {
  const t = translations[props.currentLang];
  return (
    <Modal isOpen={props.isOpen} onClose={props.onClose} icon={<Play className="w-5 h-5" />} widthClass="max-w-lg"
      title={`${props.mode === 'rerun' ? t.run_again : t.run_station} — ${props.machine.machine_code}`} subtitle={props.seatbeltQr} closeLabel={t.cancel}>
      <Form {...props} />
    </Modal>
  );
};
