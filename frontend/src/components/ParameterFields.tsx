import React from 'react';
import type { ParameterDefinition } from '../types';
import type { Language } from '../services/i18n';

import { type ParamValues } from '../services/paramEval';

interface Props {
  schema: ParameterDefinition[];
  values: ParamValues;
  onChange: (name: string, value: string) => void;
  lang: Language;
  idPrefix?: string;
  disabled?: boolean;
}

export const ParameterFields: React.FC<Props> = ({ schema, values, onChange, lang, idPrefix = 'param', disabled }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    {schema.map((p) => {
      const raw = values[p.name] ?? '';
      const n = Number(raw);
      const out = p.type === 'number' && raw.trim() !== '' && Number.isFinite(n)
        && ((p.min_value !== undefined && n < p.min_value) || (p.max_value !== undefined && n > p.max_value));
      const label = lang === 'ta' && p.label_ta ? p.label_ta : p.label;
      const id = `${idPrefix}_${p.name}`;
      const hint = p.min_value !== undefined && p.max_value !== undefined ? `${p.min_value} ~ ${p.max_value}${p.unit ? ' ' + p.unit : ''}` : '';
      return (
        <div key={p.name} className="min-w-0">
          <label htmlFor={id} className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs font-semibold text-[var(--text-muted)] mb-1">
            <span className="break-words">{label}{p.required !== false && <span className="text-red-400"> *</span>}</span>
            {hint && <span className="font-mono text-[10px] text-[var(--text-dim)]">{hint}</span>}
          </label>
          {p.type === 'number' ? (
            <input id={id} type="number" inputMode="decimal" step="any" className="field font-mono" value={raw} disabled={disabled}
              aria-invalid={out} onChange={(e) => onChange(p.name, e.target.value)} placeholder={p.nominal !== undefined ? String(p.nominal) : ''} />
          ) : (
            <select id={id} className="field font-mono" value={raw} disabled={disabled} onChange={(e) => onChange(p.name, e.target.value)}>
              <option value="">—</option>
              <option value={String(p.nominal ?? 'PASS')}>{String(p.nominal ?? 'PASS')}</option>
              <option value="FAIL">FAIL</option>
            </select>
          )}
          {out && <p className="text-[11px] text-red-400 mt-1">Outside tolerance ({hint})</p>}
        </div>
      );
    })}
  </div>
);
