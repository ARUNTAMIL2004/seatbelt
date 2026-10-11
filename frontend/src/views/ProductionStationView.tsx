import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { SeatbeltDetailed, Machine, User, Operator } from '../types';
import { translations, type Language } from '../services/i18n';
import { ApiService } from '../services/api';
import { errorMessage } from '../services/format';
import { PRODUCTION_ROLES } from '../config';
import { MachineSequenceBar } from '../components/MachineSequenceBar';
import { MachineDetailPanel } from '../components/MachineDetailPanel';
import { ReworkModal } from '../components/ReworkModal';
import { MissingDataModal, type ManualDataPayload } from '../components/MissingDataModal';
import { RunStationModal } from '../components/RunStationModal';
import { QualityReviewModal } from '../components/QualityReviewModal';
import { QRScannerModal } from '../components/QRScannerModal';
import { QRLabelGeneratorModal } from '../components/QRLabelGeneratorModal';
import { CertificateModal } from '../components/CertificateModal';
import { Notice, type NoticeKind } from '../components/Notice';
import { QrCode, Search, Sparkles, Award, Loader2, ScanLine } from 'lucide-react';
import { soundEffects } from '../services/audio';

interface Props {
  currentUser: User;
  currentLang: Language;
  initialQr?: string;
}

type Flash = { message: string; kind: NoticeKind };

export const ProductionStationView: React.FC<Props> = ({ currentUser, currentLang, initialQr = '' }) => {
  const t = translations[currentLang];
  const canProduce = (PRODUCTION_ROLES as readonly string[]).includes(currentUser.role);

  const [activeQr, setActiveQr] = useState(initialQr);
  const [searchInput, setSearchInput] = useState(initialQr);
  const [seatbelt, setSeatbelt] = useState<SeatbeltDetailed | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);

  const [isScannerOpen, setScanner] = useState(false);
  const [isGeneratorOpen, setGenerator] = useState(false);
  const [isReworkOpen, setRework] = useState(false);
  const [isMissingOpen, setMissing] = useState(false);
  const [runMode, setRunMode] = useState<'run' | 'rerun' | null>(null);
  const [isQualityOpen, setQuality] = useState(false);
  const [isCertOpen, setCert] = useState(false);

  const requestId = useRef(0);

  const show = useCallback((message: string, kind: NoticeKind = 'success') => setFlash({ message, kind }), []);
  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(id);
  }, [flash]);

  useEffect(() => {
    ApiService.getMachines().then(setMachines).catch((e) => show(errorMessage(e), 'error'));
    if (canProduce) ApiService.getOperators().then(setOperators).catch(() => setOperators([]));
  }, [canProduce, show]);

  const loadSeatbelt = useCallback(async (qr: string, keepSelection = false) => {
    const id = ++requestId.current;
    setIsLoading(true);
    try {
      const data = await ApiService.scanQR(qr);
      if (id !== requestId.current) return; // a newer lookup superseded this one
      setSeatbelt(data);
      setSearchInput(data.qr_code);
      setSelectedMachineId((prev) => {
        if (keepSelection && prev && data.machines_progress.some((m) => m.machine_id === prev)) return prev;
        return data.current_machine_id ?? data.machines_progress[0]?.machine_id ?? null;
      });
    } catch (err) {
      if (id !== requestId.current) return;
      setSeatbelt(null);
      show(errorMessage(err, 'Seatbelt not found in production registry'), 'error');
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, [show]);

  useEffect(() => {
    if (initialQr) { setActiveQr(initialQr); setSearchInput(initialQr); }
  }, [initialQr]);

  useEffect(() => {
    if (activeQr) void loadSeatbelt(activeQr);
  }, [activeQr, loadSeatbelt]);

  const lookup = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchInput.trim();
    if (!q) return;
    if (q === activeQr) void loadSeatbelt(q); else setActiveQr(q);
  };

  const onScan = (qr: string) => {
    show(`${t.scan_success}: ${qr}`, 'success');
    if (qr === activeQr) void loadSeatbelt(qr); else setActiveQr(qr);
  };

  const selected = seatbelt?.machines_progress.find((m) => m.machine_id === selectedMachineId);
  const selectedDef = machines.find((m) => m.id === selectedMachineId);
  const hasDownstreamRuns = !!seatbelt && !!selected && seatbelt.machines_progress.some(
    (m) => m.sequence_number > selected.sequence_number && !!m.current_run);

  const refresh = async () => { if (seatbelt) await loadSeatbelt(seatbelt.qr_code, true); };

  // ---- workflow handlers (errors propagate to the modal that called them)
  const doRework = async (reason: string, notes?: string) => {
    if (!seatbelt || !selected) return;
    await ApiService.initiateRework(seatbelt.id, selected.machine_id, reason, notes);
    show(t.rework_initiated, 'info');
    await refresh();
  };
  const doManual = async (p: ManualDataPayload) => {
    if (!seatbelt || !selected) return;
    await ApiService.submitManualData({ seatbelt_id: seatbelt.id, machine_id: selected.machine_id, ...p });
    show(p.result === 'PASS' ? t.missing_data_saved : 'Manual entry saved as FAIL - rework is required before the next station unlocks.', p.result === 'PASS' ? 'success' : 'error');
    await refresh();
  };
  const doRun = async (simulateFailure: boolean) => {
    if (!seatbelt || !selected || !runMode) return;
    const res = runMode === 'rerun'
      ? await ApiService.rerunStation(seatbelt.id, selected.machine_id, simulateFailure)
      : await ApiService.runStation(seatbelt.id, selected.machine_id, simulateFailure);
    if (res.result === 'PASS') { soundEffects.playPassChime(); show(runMode === 'rerun' ? t.rerun_success : res.message, 'success'); }
    else show(`${res.message} - rework is required.`, 'error');
    await refresh();
  };
  const doQuality = async (decision: 'APPROVED' | 'REJECTED', comments: string) => {
    if (!seatbelt || !selected?.current_run) return;
    await ApiService.submitQualityReview({ seatbelt_id: seatbelt.id, machine_id: selected.machine_id, run_id: selected.current_run.id, decision, comments });
    show(decision === 'APPROVED' ? t.quality_approved_msg : t.quality_rejected_msg, decision === 'APPROVED' ? 'success' : 'info');
    await refresh();
  };
  const doFlag = async () => {
    if (!seatbelt || !selected) return;
    try {
      await ApiService.flagMissing(seatbelt.id, selected.machine_id);
      show(`${selected.machine_code}: ${t.DATA_MISSING}`, 'info');
      await refresh();
    } catch (err) { show(errorMessage(err), 'error'); }
  };
  const doGenerate = async (model: string, batch: string) => {
    const sb = await ApiService.generateQR(model, batch);
    setSeatbelt(sb);
    setActiveQr(sb.qr_code);
    setSearchInput(sb.qr_code);
    setSelectedMachineId(sb.current_machine_id ?? sb.machines_progress[0]?.machine_id ?? null);
    show(`New seatbelt ${sb.qr_code} generated and registered!`, 'success');
    return sb;
  };

  return (
    <div className="max-w-7xl mx-auto safe-x py-4 space-y-4">
      {flash && <Notice kind={flash.kind} message={flash.message} onDismiss={() => setFlash(null)} className="animate-enter" />}

      <div className="glass-panel p-3 sm:p-4 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1 min-w-0">
          <button type="button" onClick={() => setScanner(true)} className="btn btn-primary btn-lg shadow-lg shadow-cyan-500/25 font-extrabold text-sm">
            <QrCode className="w-5 h-5 stroke-[2.5]" aria-hidden="true" /><span>{t.scan_qr}</span>
          </button>
          <form onSubmit={lookup} className="flex items-center gap-1.5 flex-1 min-w-0 sm:max-w-md" role="search">
            <div className="relative w-full min-w-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} maxLength={200} aria-label="Seatbelt QR"
                placeholder="Scan / enter seatbelt QR" autoComplete="off" spellCheck={false} className="field !pl-9 font-mono font-bold text-cyan-300" />
            </div>
            <button type="submit" className="btn btn-secondary shrink-0" disabled={!searchInput.trim() || isLoading}>LOOKUP</button>
          </form>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canProduce && (
            <button type="button" onClick={() => setGenerator(true)} className="btn btn-secondary text-cyan-300 border-cyan-500/30 flex-1 sm:flex-none">
              <Sparkles className="w-4 h-4 text-cyan-400" aria-hidden="true" /><span>{t.generate_qr}</span>
            </button>
          )}
          {seatbelt && (
            <button type="button" onClick={() => setCert(true)} className="btn btn-secondary text-purple-300 border-purple-500/30 flex-1 sm:flex-none">
              <Award className="w-4 h-4 text-purple-400" aria-hidden="true" /><span>{t.print_certificate}</span>
            </button>
          )}
        </div>
      </div>

      {isLoading && !seatbelt && (
        <div className="py-16 flex justify-center text-cyan-400" role="status" aria-label={t.loading}><Loader2 className="w-8 h-8 animate-spin" aria-hidden="true" /></div>
      )}

      {!seatbelt && !isLoading && (
        <div className="glass-panel py-14 px-4 text-center">
          <ScanLine className="w-12 h-12 mx-auto text-cyan-400/70 mb-3" aria-hidden="true" />
          <h2 className="text-lg font-bold mb-1">{t.scan_qr}</h2>
          <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto">Scan or type a seatbelt QR code to see its station progress and record production.</p>
        </div>
      )}

      {seatbelt && (
        <div className={`glass-panel p-3 sm:p-4 border-cyan-500/20 transition-opacity ${isLoading ? 'opacity-70' : ''}`} aria-busy={isLoading}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono font-black text-lg shrink-0">QR</div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-black text-base sm:text-lg text-cyan-400 tracking-wider break-all">{seatbelt.qr_code}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">LOT: {seatbelt.batch_number}</span>
                </div>
                <p className="text-xs text-[var(--text-main)] font-semibold mt-0.5 break-words">{seatbelt.model}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs font-mono md:flex md:items-center md:gap-3">
              <div className="px-2 sm:px-3 py-1.5 rounded-lg bg-slate-900 border border-[var(--border-subtle)] text-center">
                <span className="text-[10px] text-slate-500 block">STATION</span><span className="font-bold text-cyan-400">{seatbelt.current_machine_code || '—'}</span>
              </div>
              <div className="px-2 sm:px-3 py-1.5 rounded-lg bg-slate-900 border border-[var(--border-subtle)] text-center min-w-0">
                <span className="text-[10px] text-slate-500 block">STATUS</span>
                <span className={`font-bold break-words text-[11px] sm:text-xs ${seatbelt.current_status === 'COMPLETED' ? 'text-emerald-400' : seatbelt.current_status.includes('REWORK') || seatbelt.current_status.includes('REJECT') ? 'text-red-400' : seatbelt.current_status === 'DATA_MISSING' ? 'text-amber-400' : 'text-cyan-300'}`}>{t[seatbelt.current_status] ?? seatbelt.current_status}</span>
              </div>
              <div className="px-2 sm:px-3 py-1.5 rounded-lg bg-slate-900 border border-[var(--border-subtle)] text-center">
                <span className="text-[10px] text-slate-500 block">RUNS / RW</span>
                <span className="font-bold text-purple-400">{seatbelt.total_runs}{seatbelt.rework_count > 0 ? ` / ${seatbelt.rework_count}` : ''}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {seatbelt && (
        <div className="glass-panel p-3 sm:p-4">
          <MachineSequenceBar progressItems={seatbelt.machines_progress} selectedMachineId={selectedMachineId} onSelectMachine={setSelectedMachineId} currentLang={currentLang} />
        </div>
      )}

      {seatbelt && selected && (
        <MachineDetailPanel
          key={`${seatbelt.id}-${selected.machine_id}`}
          machineProgress={selected} machineDef={selectedDef} currentUser={currentUser} currentLang={currentLang}
          hasDownstreamRuns={hasDownstreamRuns}
          onOpenReworkModal={() => setRework(true)} onOpenMissingDataModal={() => setMissing(true)}
          onOpenRunModal={setRunMode} onOpenQualityModal={() => setQuality(true)} onFlagMissing={doFlag}
        />
      )}

      <QRScannerModal isOpen={isScannerOpen} onClose={() => setScanner(false)} onScanResult={onScan} currentLang={currentLang} />
      <QRLabelGeneratorModal isOpen={isGeneratorOpen} onClose={() => setGenerator(false)} onGenerateNew={doGenerate} />

      {seatbelt && selected && (
        <>
          <ReworkModal isOpen={isReworkOpen} onClose={() => setRework(false)} seatbeltQr={seatbelt.qr_code} machine={selected} currentLang={currentLang} onConfirm={doRework} />
          <MissingDataModal isOpen={isMissingOpen} onClose={() => setMissing(false)} seatbeltQr={seatbelt.qr_code} machine={selected} machineDef={selectedDef}
            currentUser={currentUser} operators={operators} currentLang={currentLang} onSave={doManual} />
          <RunStationModal isOpen={runMode !== null} onClose={() => setRunMode(null)} mode={runMode ?? 'run'} seatbeltQr={seatbelt.qr_code} machine={selected}
            machineDef={selectedDef} currentLang={currentLang} onExecute={doRun} />
          <QualityReviewModal isOpen={isQualityOpen} onClose={() => setQuality(false)} seatbeltQr={seatbelt.qr_code} machine={selected} currentLang={currentLang} onConfirmReview={doQuality} />
          <CertificateModal isOpen={isCertOpen} onClose={() => setCert(false)} seatbelt={seatbelt} currentLang={currentLang} />
        </>
      )}
    </div>
  );
};
