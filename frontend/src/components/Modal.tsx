import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

type Accent = 'cyan' | 'amber' | 'red' | 'purple' | 'emerald';

const ACCENT: Record<Accent, string> = {
  cyan: 'text-cyan-400 bg-cyan-500/15 border-cyan-500/40',
  amber: 'text-amber-400 bg-amber-500/15 border-amber-500/40',
  red: 'text-red-400 bg-red-500/15 border-red-500/40',
  purple: 'text-purple-400 bg-purple-500/15 border-purple-500/40',
  emerald: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/40',
};

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  accent?: Accent;
  /** Tailwind max-width class for the dialog, e.g. "max-w-3xl". */
  widthClass?: string;
  closeLabel?: string;
  children: React.ReactNode;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Accessible dialog: role=dialog, Esc to close, focus moved in and restored, background scroll locked. */
export const Modal: React.FC<ModalProps> = ({
  isOpen, onClose, title, subtitle, icon, accent = 'cyan', widthClass = 'max-w-xl', closeLabel = 'Close', children,
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>('input:not([disabled]),select:not([disabled]),textarea:not([disabled])')
      ?? dialog?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current(); return; }
      if (e.key !== 'Tab' || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`modal-content ${widthClass}`}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)] no-print">
          <div className="flex items-center gap-3 min-w-0">
            {icon && <div className={`shrink-0 p-2 rounded-lg border ${ACCENT[accent]}`} aria-hidden="true">{icon}</div>}
            <div className="min-w-0">
              <h3 id={titleId} className="text-base sm:text-lg font-bold text-[var(--text-main)] leading-tight break-words">{title}</h3>
              {subtitle && <p className="text-xs text-[var(--text-dim)] font-mono mt-0.5 break-words">{subtitle}</p>}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={closeLabel}
            className="shrink-0 p-2 -m-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};
