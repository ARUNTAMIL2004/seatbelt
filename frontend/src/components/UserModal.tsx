import React, { useState } from 'react';
import { UserPlus, Loader2 } from 'lucide-react';
import type { UserRecord } from '../types';
import { ApiService } from '../services/api';
import { errorMessage } from '../services/format';
import { Modal } from './Modal';
import { Notice } from './Notice';

interface Props { isOpen: boolean; onClose: () => void; user: UserRecord | null; onSaved: () => void }

const ROLES = ['PRODUCTION', 'QUALITY', 'SUPERVISOR', 'ADMIN'] as const;

const Form: React.FC<Props> = ({ onClose, user, onSaved }) => {
  const [employeeId, setEmployeeId] = useState(user?.employee_id ?? '');
  const [name, setName] = useState(user?.name ?? '');
  const [role, setRole] = useState<string>(user?.role ?? 'PRODUCTION');
  const [language, setLanguage] = useState<string>(user?.language ?? 'en');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!user && password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (user && password && password.length < 8) { setError('New password must be at least 8 characters.'); return; }
    setBusy(true);
    try {
      if (user) await ApiService.updateUser(user.id, { name: name.trim(), role, language, ...(password ? { password } : {}) });
      else await ApiService.createUser({ employee_id: employeeId.trim(), name: name.trim(), role, language, password });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="p-4 sm:p-5 space-y-4" noValidate>
      {error && <Notice kind="error" message={error} />}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label htmlFor="u_emp" className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Employee ID *</label>
          <input id="u_emp" className="field font-mono" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} disabled={!!user} maxLength={50} autoCapitalize="characters" required /></div>
        <div><label htmlFor="u_name" className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Full name *</label>
          <input id="u_name" className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required /></div>
        <div><label htmlFor="u_role" className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Role</label>
          <select id="u_role" className="field" value={role} onChange={(e) => setRole(e.target.value)}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></div>
        <div><label htmlFor="u_lang" className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Language</label>
          <select id="u_lang" className="field" value={language} onChange={(e) => setLanguage(e.target.value)}><option value="en">English</option><option value="ta">தமிழ்</option></select></div>
      </div>
      <div><label htmlFor="u_pw" className="block text-xs font-semibold text-[var(--text-muted)] mb-1">{user ? 'Reset password (leave blank to keep)' : 'Initial password *'}</label>
        <input id="u_pw" type="password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" maxLength={72} /></div>
      <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={busy || !name.trim() || (!user && !employeeId.trim())}>{busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}Save</button>
      </div>
    </form>
  );
};

export const UserModal: React.FC<Props> = (props) => (
  <Modal isOpen={props.isOpen} onClose={props.onClose} icon={<UserPlus className="w-5 h-5" />} accent="emerald" widthClass="max-w-lg" title={props.user ? `Edit ${props.user.employee_id}` : 'Add user'}>
    <Form {...props} />
  </Modal>
);
