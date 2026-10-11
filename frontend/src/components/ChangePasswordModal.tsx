import React, { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { Modal } from './Modal';
import { Notice } from './Notice';
import { ApiService } from '../services/api';
import { errorMessage } from '../services/format';
import { translations, type Language } from '../services/i18n';

interface Props { isOpen: boolean; onClose: () => void; lang: Language; onDone: (msg: string) => void }

export const ChangePasswordModal: React.FC<Props> = ({ isOpen, onClose, lang, onDone }) => {
  const t = translations[lang];
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => { setCurrent(''); setNext(''); setError(null); onClose(); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) { setError('New password must be at least 8 characters.'); return; }
    setBusy(true);
    setError(null);
    try {
      await ApiService.changePassword(current, next);
      onDone(t.password_changed);
      close();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title={t.change_password} icon={<KeyRound className="w-5 h-5" />} widthClass="max-w-md" closeLabel={t.cancel}>
      <form onSubmit={submit} className="p-4 sm:p-5 space-y-4">
        {error && <Notice kind="error" message={error} />}
        <div>
          <label htmlFor="cp_current" className="block text-xs font-semibold text-[var(--text-muted)] mb-1">{t.current_password}</label>
          <input id="cp_current" type="password" className="field" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
        </div>
        <div>
          <label htmlFor="cp_new" className="block text-xs font-semibold text-[var(--text-muted)] mb-1">{t.new_password}</label>
          <input id="cp_new" type="password" className="field" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} maxLength={72} required />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={close}>{t.cancel}</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !current || !next}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />} {t.save}
          </button>
        </div>
      </form>
    </Modal>
  );
};
