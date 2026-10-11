import type { ParameterDefinition } from '../types';

export type ParamValues = Record<string, string>;

export interface Evaluation {
  /** Parameters not yet filled in */
  missing: string[];
  /** Human readable out-of-tolerance messages */
  outOfRange: string[];
  /** Fields that are not valid numbers */
  invalid: string[];
  payload: Record<string, string | number>;
  allFilled: boolean;
  allInTolerance: boolean;
}

const FAIL_TOKENS = ['FAIL', 'FAILED', 'NG', 'REJECT', 'REJECTED', 'ERROR'];

export function evaluateParams(schema: ParameterDefinition[], values: ParamValues): Evaluation {
  const missing: string[] = [];
  const outOfRange: string[] = [];
  const invalid: string[] = [];
  const payload: Record<string, string | number> = {};

  for (const p of schema) {
    const raw = (values[p.name] ?? '').trim();
    if (raw === '') {
      if (p.required !== false) missing.push(p.label);
      continue;
    }
    if (p.type === 'number') {
      const n = Number(raw);
      if (!Number.isFinite(n)) { invalid.push(p.label); continue; }
      payload[p.name] = n;
      if (p.min_value !== undefined && n < p.min_value) outOfRange.push(`${p.label}: ${n} < ${p.min_value}${p.unit ? ' ' + p.unit : ''}`);
      if (p.max_value !== undefined && n > p.max_value) outOfRange.push(`${p.label}: ${n} > ${p.max_value}${p.unit ? ' ' + p.unit : ''}`);
    } else {
      payload[p.name] = raw;
      if (FAIL_TOKENS.includes(raw.toUpperCase())) outOfRange.push(`${p.label}: ${raw}`);
    }
  }
  return {
    missing, outOfRange, invalid, payload,
    allFilled: missing.length === 0 && invalid.length === 0,
    allInTolerance: outOfRange.length === 0,
  };
}

export function isFutureInstant(iso: string, toleranceMs = 60_000): boolean {
  return new Date(iso).getTime() > Date.now() + toleranceMs;
}

export function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function nowLocalTime(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
