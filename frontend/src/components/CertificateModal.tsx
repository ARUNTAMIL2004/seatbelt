import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, Award, Loader2, AlertTriangle } from 'lucide-react';
import type { Certificate, SeatbeltDetailed } from '../types';
import { ApiService } from '../services/api';
import { errorMessage, formatDateTime } from '../services/format';
import { translations, type Language } from '../services/i18n';
import { Modal } from './Modal';
import { Notice } from './Notice';

interface Props { isOpen: boolean; onClose: () => void; seatbelt: SeatbeltDetailed; currentLang?: Language }

const Body: React.FC<Props> = ({ seatbelt, currentLang = 'en' }) => {
  const t = translations[currentLang];
  const [cert, setCert] = useState<Certificate | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ApiService.getCertificate(seatbelt.id)
      .then((c) => { if (!cancelled) setCert(c); })
      .catch((e) => { if (!cancelled) setError(errorMessage(e)); });
    return () => { cancelled = true; };
  }, [seatbelt.id]);

  if (error) return <div className="p-5"><Notice kind="error" message={error} /></div>;
  if (!cert) return <div className="p-10 flex justify-center text-cyan-400" role="status" aria-label={t.loading}><Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" /></div>;

  return (
    <div className="p-3 sm:p-5 space-y-3">
      <div className="flex justify-end no-print">
        <button type="button" onClick={() => window.print()} className="btn btn-primary btn-sm"><Printer className="w-3.5 h-3.5" aria-hidden="true" /><span>PRINT / PDF</span></button>
      </div>

      <div className="print-area paper p-4 sm:p-6 text-xs space-y-4">
        <div className="border-b-2 border-slate-900 pb-3 flex flex-wrap justify-between items-start gap-3">
          <div className="min-w-0">
            <div className="text-base font-black tracking-tight">AEROSAFETY AUTOMOTIVE SYSTEMS LTD.</div>
            <div className="paper-muted text-[11px] font-mono">CERTIFICATE OF CONFORMANCE &amp; GENEALOGY</div>
          </div>
          <div className="bg-white p-1 border paper-border"><QRCodeSVG value={cert.qr_code} size={64} level="M" /></div>
        </div>

        {cert.certified ? (
          <div className="paper-ok font-bold text-sm">✔ CERTIFIED — all stations passed and verified</div>
        ) : (
          <div className="paper-bad border-2 border-red-700 rounded p-2 font-bold">
            <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" aria-hidden="true" />{t.certificate_draft}</div>
            <ul className="font-normal mt-1 list-disc pl-5">{cert.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div><span className="paper-muted">QR / Serial</span><div className="font-mono font-bold break-all">{cert.qr_code}</div></div>
          <div><span className="paper-muted">Lot</span><div className="font-mono font-bold break-all">{cert.batch_number}</div></div>
          <div className="col-span-2"><span className="paper-muted">Model</span><div className="font-bold">{cert.model}</div></div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] text-left border-collapse">
            <thead><tr className="paper-muted border-b-2 paper-border font-mono text-[10px] uppercase">
              <th className="py-1 pr-2">Station</th><th className="pr-2">Run</th><th className="pr-2">Result</th><th className="pr-2">Operator</th><th>Completed</th>
            </tr></thead>
            <tbody>
              {cert.stations.map((s) => (
                <tr key={s.machine_code} className="border-b paper-border align-top">
                  <td className="py-1.5 pr-2"><b className="font-mono">{s.machine_code}</b> {s.machine_name}</td>
                  <td className="pr-2">{s.run_number ? `#${s.run_number}` : '—'}{s.run_type === 'MANUAL_DATA_ENTRY' && <span className="paper-bad"> (manual)</span>}{s.reworks > 0 && <span className="paper-muted"> · {s.reworks} rework</span>}</td>
                  <td className={`pr-2 font-bold ${s.result === 'PASS' ? 'paper-ok' : 'paper-bad'}`}>{s.result ?? s.status}</td>
                  <td className="pr-2">{s.operator ?? '—'}</td>
                  <td className="font-mono">{formatDateTime(s.completed_at, currentLang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <span className="paper-muted">QA sign-off</span>
          {cert.qa_signoffs.length ? cert.qa_signoffs.map((q) => (
            <div key={q.employee_id} className="font-bold">{q.name} ({q.employee_id}) — {formatDateTime(q.reviewed_at, currentLang)}</div>
          )) : <div>No manual/rework entries required QA sign-off.</div>}
        </div>

        <div className="pt-2 border-t paper-border font-mono text-[10px] break-all">
          <div className="paper-muted">Genealogy SHA-256 (tamper evidence)</div>
          <div>{cert.genealogy_sha256}</div>
          <div className="paper-muted mt-1">Generated {formatDateTime(cert.generated_at, currentLang)}</div>
        </div>
      </div>
    </div>
  );
};

export const CertificateModal: React.FC<Props> = (props) => (
  <Modal isOpen={props.isOpen} onClose={props.onClose} icon={<Award className="w-5 h-5" />} widthClass="max-w-3xl" title="CERTIFICATE OF CONFORMANCE & GENEALOGY">
    <Body {...props} />
  </Modal>
);
