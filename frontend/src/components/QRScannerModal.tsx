import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, QrCode, Search, Sparkles } from 'lucide-react';
import { soundEffects } from '../services/audio';
import { translations, type Language } from '../services/i18n';
import { DEMO_MODE } from '../config';
import { Modal } from './Modal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onScanResult: (qr: string) => void;
  currentLang?: Language;
}

const DEMO_PRESETS = [
  { qr: 'SB-2026-000123', label: 'SB-000123 (Missing M5 Data Flow)' },
  { qr: 'SB-2026-000124', label: 'SB-000124 (M5 Rework Required Flow)' },
  { qr: 'SB-2026-000125', label: 'SB-000125 (Completed)' },
  { qr: 'SB-2026-000126', label: 'SB-000126 (In-Progress at Station M3)' },
  { qr: 'SB-2026-000127', label: 'SB-000127 (New Unit at Station M1)' },
  { qr: 'SB-2026-000128', label: 'SB-000128 (QA Missing Data Review)' },
];

type ScannerHandle = { isScanning: boolean; stop: () => Promise<void>; clear: () => void };

const Body: React.FC<Props> = ({ isOpen, onClose, onScanResult, currentLang = 'en' }) => {
  const t = translations[currentLang];
  const [manualCode, setManualCode] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  /**
   * scannerRef  – the live html5-qrcode instance (null when not started).
   * stoppingRef – mutex: prevents concurrent stopCamera() calls from racing.
   *   Both finish() and the cleanup-on-unmount effect call stopCamera(); without
   *   this guard the scanner gets double-stopped, throws internally, and leaves
   *   camera tracks open in the OS.
   * doneRef     – set to true after the first successful scan so that
   *   html5-qrcode per-frame callbacks cannot fire finish() twice.
   *   MUST be reset every time the modal re-opens so subsequent scans work.
   */
  const scannerRef = useRef<ScannerHandle | null>(null);
  const stoppingRef = useRef(false);
  const doneRef = useRef(false);

  // Reset the one-shot guard each time the modal opens so re-use works correctly.
  useEffect(() => {
    if (isOpen) {
      doneRef.current = false;
    }
  }, [isOpen]);

  /**
   * stopCamera – idempotent, race-safe camera teardown.
   * stoppingRef acts as a mutex: only one concurrent call proceeds.
   * scannerRef is nulled before async work so concurrent callers bail early.
   */
  const stopCamera = useCallback(async () => {
    if (stoppingRef.current) return;   // mutex: already being torn down
    const s = scannerRef.current;
    if (!s) return;                    // never started or already stopped

    stoppingRef.current = true;
    scannerRef.current = null;

    try { if (s.isScanning) await s.stop(); } catch { /* already stopped internally */ }
    try { s.clear(); } catch { /* DOM element may be gone during unmount */ }

    setCameraActive(false);
    stoppingRef.current = false;
  }, []);

  // Release the camera when the modal closes or the component unmounts.
  useEffect(() => () => { void stopCamera(); }, [stopCamera]);

  /**
   * finish – called on a successful QR decode (or a demo / manual shortcut).
   *
   * Made async so that onScanResult / onClose are only called AFTER the camera
   * has fully stopped.  This prevents the Modal's null-render (triggered by
   * onClose -> isOpen=false) from firing a second concurrent stopCamera().
   */
  const finish = useCallback(async (code: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    soundEffects.playScanBeep();
    await stopCamera();
    onScanResult(code.trim());
    onClose();
  }, [onClose, onScanResult, stopCamera]);

  const startCamera = async () => {
    setCameraError(null);
    doneRef.current = false;  // allow a fresh scan after manual stop + re-start
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner as unknown as ScannerHandle;

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 12, qrbox: { width: 220, height: 220 } },
        // html5-qrcode does not await the success callback; fire-and-forget is
        // safe because finish() is idempotent via doneRef.
        (decoded) => { void finish(decoded); },
        () => { /* per-frame decode misses are normal – do not stop camera */ },
      );

      setCameraActive(true);
    } catch (err) {
      scannerRef.current = null;
      stoppingRef.current = false;

      const msg = err instanceof Error ? err.message : String(err);
      const isPermission = /permission|denied|notallowed/i.test(msg);
      const isNotFound = /notfound|no.*camera|overconstrained/i.test(msg);

      if (isPermission) {
        setCameraError('Camera permission was denied. Please allow camera access in your browser settings and try again.');
      } else if (isNotFound) {
        setCameraError('No camera was found on this device. Use the manual input below instead.');
      } else {
        setCameraError('Camera could not be started (camera requires HTTPS on most browsers). Use the manual input below instead.');
      }
      setCameraActive(false);
    }
  };

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) void finish(manualCode);
  };

  return (
    <div className="p-4 sm:p-5 space-y-4 text-xs">
      <form onSubmit={submitManual} className="space-y-2">
        <label htmlFor="manual_qr" className="block text-slate-300 font-bold font-mono uppercase text-[11px]">Barcode scanner input / serial code</label>
        <div className="flex flex-col sm:flex-row items-stretch gap-2">
          <input id="manual_qr" type="text" value={manualCode} onChange={(e) => setManualCode(e.target.value)} placeholder="E.g. SB-2026-000123"
            className="field font-mono font-bold text-cyan-300" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={200} />
          <button type="submit" className="btn btn-primary shrink-0" disabled={!manualCode.trim()}><Search className="w-4 h-4" aria-hidden="true" /><span>LOOKUP</span></button>
        </div>
      </form>

      <div className="rounded-xl border border-[var(--border-subtle)] p-3 bg-slate-900/40 text-center">
        <div id="qr-reader" className="w-full rounded-lg overflow-hidden min-h-[96px] flex items-center justify-center bg-slate-950/60 text-slate-500" aria-live="polite">
          {!cameraActive && <span className="px-2">Camera preview</span>}
        </div>
        {!cameraActive ? (
          <button type="button" onClick={startCamera} className="btn btn-secondary mt-3 w-full text-cyan-300 font-mono">
            <Camera className="w-4 h-4 text-cyan-400" aria-hidden="true" /><span>START TERMINAL CAMERA SCANNER</span>
          </button>
        ) : (
          <button type="button" onClick={() => void stopCamera()} className="btn btn-danger mt-3 w-full font-mono">STOP CAMERA SCANNER</button>
        )}
        {cameraError && <p role="alert" className="text-[11px] text-amber-400/90 font-mono mt-2 bg-amber-950/30 p-2 rounded border border-amber-500/30 text-left">{cameraError}</p>}
      </div>

      {DEMO_MODE && (
        <div>
          <p className="text-slate-400 font-mono uppercase text-[11px] mb-1.5 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />Demo seatbelts (one-click scan)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {DEMO_PRESETS.map((p) => (
              <button key={p.qr} type="button" onClick={() => void finish(p.qr)} className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800 hover:border-cyan-400 text-left transition-all min-w-0">
                <div className="font-mono font-bold text-xs text-cyan-300">{p.qr}</div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate">{p.label}</div>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex justify-end"><button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>{t.cancel}</button></div>
    </div>
  );
};

export const QRScannerModal: React.FC<Props> = (props) => (
  <Modal isOpen={props.isOpen} onClose={props.onClose} icon={<QrCode className="w-5 h-5" />} widthClass="max-w-lg"
    title="SCAN SEATBELT BARCODE / QR" closeLabel={translations[props.currentLang ?? 'en'].cancel}>
    <Body {...props} />
  </Modal>
);