import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, Printer, CheckCircle, Sparkles, Loader2 } from 'lucide-react';
import { soundEffects } from '../services/audio';
import { errorMessage } from '../services/format';
import type { SeatbeltDetailed } from '../types';
import { Modal } from './Modal';
import { Notice } from './Notice';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onGenerateNew: (model: string, batch: string) => Promise<SeatbeltDetailed>;
}

const SEATBELT_MODELS = [
  'Sedan Front-Left 3-Point ELR Pretensioner',
  'Sedan Front-Right 3-Point ELR Pretensioner',
  'SUV Rear-Right 3-Point Dual-Retractor',
  'EV Front Passenger Smart Buckle Belt',
  'Commercial Truck Heavy-Duty 3-Point Belt',
  'Luxury Sedan Inflatable Airbag Seatbelt',
];

const Body: React.FC<Props> = ({ onClose, onGenerateNew }) => {
  const [model, setModel] = useState(SEATBELT_MODELS[0]);
  const [batch, setBatch] = useState('BATCH-2026-OCT-A1');
  const [generated, setGenerated] = useState<SeatbeltDetailed | null>(null);
  const [printedOn, setPrintedOn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setGenerated(await onGenerateNew(model, batch.trim()));
      setPrintedOn(new Date().toLocaleDateString());
      soundEffects.playPassChime();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!generated) {
    return (
      <form onSubmit={generate} className="p-4 sm:p-5 space-y-3 text-xs">
        {error && <Notice kind="error" message={error} />}
        <div>
          <label htmlFor="gen_model" className="block text-slate-300 font-bold mb-1 font-mono uppercase text-[11px]">Select seatbelt model *</label>
          <select id="gen_model" value={model} onChange={(e) => setModel(e.target.value)} className="field">
            {SEATBELT_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="gen_batch" className="block text-slate-300 font-bold mb-1 font-mono uppercase text-[11px]">Manufacturing batch / lot number *</label>
          <input id="gen_batch" type="text" value={batch} maxLength={100} onChange={(e) => setBatch(e.target.value)} className="field font-mono" required />
        </div>
        <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button type="submit" disabled={busy || !batch.trim()} className="btn btn-primary">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Sparkles className="w-4 h-4" aria-hidden="true" />}
            <span>{busy ? 'Registering...' : 'GENERATE & REGISTER QR'}</span>
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="p-4 sm:p-5 space-y-4 text-xs">
      <div className="print-area paper p-4 border-2 border-slate-900 shadow-xl flex flex-col items-center justify-center space-y-2 text-center">
        <div className="paper-muted text-[10px] font-mono font-bold tracking-widest uppercase border-b paper-border pb-1 w-full flex justify-between gap-2">
          <span>AeroSafety Automotive Systems</span><span>QR LABEL</span>
        </div>
        <div className="p-2 bg-white rounded border paper-border my-1">
          <QRCodeSVG value={generated.qr_code} size={140} level="H" marginSize={2} />
        </div>
        <div className="font-mono font-black text-base tracking-wider break-all">{generated.qr_code}</div>
        <div className="text-xs font-bold">{generated.model}</div>
        <div className="paper-muted text-[10px] font-mono flex justify-between gap-2 w-full pt-1 border-t paper-border">
          <span>LOT: {generated.batch_number}</span><span>DATE: {printedOn}</span>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-3 border-t border-[var(--border-subtle)] no-print">
        <button type="button" onClick={() => setGenerated(null)} className="btn btn-secondary">Generate Another</button>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => window.print()} className="btn btn-primary flex-1"><Printer className="w-4 h-4" aria-hidden="true" /><span>PRINT LABEL</span></button>
          <button type="button" onClick={onClose} className="btn btn-success flex-1"><CheckCircle className="w-4 h-4" aria-hidden="true" /><span>DONE</span></button>
        </div>
      </div>
    </div>
  );
};

export const QRLabelGeneratorModal: React.FC<Props> = (props) => (
  <Modal isOpen={props.isOpen} onClose={props.onClose} icon={<QrCode className="w-5 h-5" />} widthClass="max-w-lg" title="GENERATE PRODUCTION SEATBELT QR">
    <Body {...props} />
  </Modal>
);
