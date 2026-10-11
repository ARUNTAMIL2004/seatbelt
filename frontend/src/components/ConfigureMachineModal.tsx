import React, { useState } from 'react';
import { Sliders, Loader2 } from 'lucide-react';
import type { Machine, ParameterDefinition } from '../types';
import { ApiService } from '../services/api';
import { errorMessage } from '../services/format';
import { Modal } from './Modal';
import { Notice } from './Notice';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  machine: Machine;
  adapterTypes: string[];
  onSaved: (m: Machine) => void;
}

const Form: React.FC<Props> = ({ onClose, machine, adapterTypes, onSaved }) => {
  const [adapterType, setAdapterType] = useState<string>(machine.adapter_type);
  const [configText, setConfigText] = useState(JSON.stringify(machine.adapter_config ?? {}, null, 2));
  const [limits, setLimits] = useState<Record<string, { min: string; max: string }>>(
    Object.fromEntries((machine.parameters_schema ?? []).filter((p) => p.type === 'number').map((p) => [p.name, { min: String(p.min_value ?? ''), max: String(p.max_value ?? '') }])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    let config: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(configText || '{}');
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error();
      config = parsed as Record<string, unknown>;
    } catch { setError('Adapter configuration must be a valid JSON object.'); return; }

    const schema: ParameterDefinition[] = [];
    for (const p of machine.parameters_schema ?? []) {
      if (p.type !== 'number') { schema.push(p); continue; }
      const l = limits[p.name];
      const min = Number(l.min); const max = Number(l.max);
      if (l.min.trim() === '' || l.max.trim() === '' || !Number.isFinite(min) || !Number.isFinite(max)) { setError(`Enter numeric min and max for ${p.label}.`); return; }
      if (min > max) { setError(`${p.label}: min must not exceed max.`); return; }
      schema.push({ ...p, min_value: min, max_value: max });
    }

    setBusy(true);
    try {
      onSaved(await ApiService.updateMachineConfig(machine.id, { adapter_type: adapterType, adapter_config: config, parameters_schema: schema }));
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="p-4 sm:p-5 space-y-4" noValidate>
      {error && <Notice kind="error" message={error} />}
      <div>
        <label htmlFor="cfg_adapter" className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Adapter protocol</label>
        <select id="cfg_adapter" className="field font-mono" value={adapterType} onChange={(e) => setAdapterType(e.target.value)}>
          {adapterTypes.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {adapterType !== 'SIMULATOR' && <p className="text-[11px] text-amber-400 mt-1">Only SIMULATOR is bundled; other protocols need a driver and will refuse to record data until one is installed.</p>}
      </div>
      <div>
        <label htmlFor="cfg_json" className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Adapter configuration (JSON). Secrets show as ********</label>
        <textarea id="cfg_json" className="field font-mono text-xs" rows={5} value={configText} onChange={(e) => setConfigText(e.target.value)} spellCheck={false} />
      </div>
      <div>
        <h4 className="text-xs font-mono uppercase tracking-wider text-[var(--text-dim)] mb-2">Parameter tolerance limits</h4>
        <div className="space-y-2">
          {(machine.parameters_schema ?? []).filter((p) => p.type === 'number').map((p) => (
            <div key={p.name} className="grid grid-cols-[1fr_5.5rem_5.5rem] sm:grid-cols-[1fr_8rem_8rem] items-center gap-2">
              <span className="text-xs min-w-0 break-words">{p.label}{p.unit ? ` (${p.unit})` : ''}</span>
              <input className="field font-mono" type="number" step="any" aria-label={`${p.label} minimum`} value={limits[p.name]?.min ?? ''} onChange={(e) => setLimits((s) => ({ ...s, [p.name]: { ...s[p.name], min: e.target.value } }))} />
              <input className="field font-mono" type="number" step="any" aria-label={`${p.label} maximum`} value={limits[p.name]?.max ?? ''} onChange={(e) => setLimits((s) => ({ ...s, [p.name]: { ...s[p.name], max: e.target.value } }))} />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-[var(--text-dim)] mt-2">Applies to new runs and manual entries only; recorded history is never changed.</p>
      </div>
      <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}Save configuration</button>
      </div>
    </form>
  );
};

export const ConfigureMachineModal: React.FC<Props> = (props) => (
  <Modal isOpen={props.isOpen} onClose={props.onClose} icon={<Sliders className="w-5 h-5" />} accent="emerald" widthClass="max-w-2xl"
    title={`Configure ${props.machine.machine_code}`} subtitle={props.machine.machine_name}>
    <Form {...props} />
  </Modal>
);
