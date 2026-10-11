import React, { useState } from 'react';
import { FileSpreadsheet, Download, Loader2, Flame, FileEdit, Factory } from 'lucide-react';
import { translations, type Language } from '../services/i18n';
import { ApiService } from '../services/api';
import { errorMessage } from '../services/format';
import { Notice, type NoticeKind } from '../components/Notice';

type Kind = 'production' | 'rework' | 'missing-data';

const REPORTS: { kind: Kind; title: string; text: string; Icon: typeof Factory; tone: string }[] = [
  { kind: 'production', title: 'Production & Machine Run Report', text: 'Every machine run with parameters, operator, result, data source and run type for full traceability.', Icon: Factory, tone: 'text-cyan-400' },
  { kind: 'rework', title: 'Rework & Root-Cause Report', text: 'All rework tickets with reason, notes, initiator, resolution status and linked runs.', Icon: Flame, tone: 'text-red-400' },
  { kind: 'missing-data', title: 'Missing Data Recovery Report', text: 'All manual data entries with the reason given, operator and timestamps for audit review.', Icon: FileEdit, tone: 'text-amber-400' },
];

export const ReportsView: React.FC<{ currentLang: Language }> = ({ currentLang }) => {
  const t = translations[currentLang];
  const [busy, setBusy] = useState<Kind | null>(null);
  const [flash, setFlash] = useState<{ kind: NoticeKind; message: string } | null>(null);

  const download = async (kind: Kind) => {
    setBusy(kind);
    setFlash(null);
    try {
      await ApiService.downloadReport(kind);
      setFlash({ kind: 'success', message: 'Report downloaded.' });
    } catch (err) {
      setFlash({ kind: 'error', message: errorMessage(err, 'Download failed') });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto safe-x py-4 space-y-4">
      <div className="pb-2 border-b border-[var(--border-subtle)]">
        <h2 className="text-lg sm:text-xl font-extrabold flex items-center gap-2"><FileSpreadsheet className="w-6 h-6 text-cyan-400 shrink-0" aria-hidden="true" /><span>Reports &amp; Data Export</span></h2>
        <p className="text-xs text-[var(--text-dim)] font-mono">Download audit-ready CSV exports (open directly in Excel)</p>
      </div>
      {flash && <Notice kind={flash.kind} message={flash.message} onDismiss={() => setFlash(null)} />}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {REPORTS.map(({ kind, title, text, Icon, tone }) => (
          <section key={kind} className="glass-panel p-4 flex flex-col gap-3">
            <Icon className={`w-8 h-8 ${tone}`} aria-hidden="true" />
            <h3 className="text-base font-bold">{title}</h3>
            <p className="text-xs text-[var(--text-muted)] flex-1">{text}</p>
            <button type="button" className="btn btn-primary w-full" disabled={busy !== null} onClick={() => download(kind)}>
              {busy === kind ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Download className="w-4 h-4" aria-hidden="true" />}{t.export_csv}
            </button>
          </section>
        ))}
      </div>
    </div>
  );
};
