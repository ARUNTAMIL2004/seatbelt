import React from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export type NoticeKind = 'success' | 'error' | 'info';

const STYLE: Record<NoticeKind, string> = {
  success: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300',
  error: 'bg-red-500/10 border-red-500/40 text-red-300',
  info: 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300',
};

export const Notice: React.FC<{ kind: NoticeKind; message: string; onDismiss?: () => void; className?: string }> = ({
  kind, message, onDismiss, className = '',
}) => {
  const Icon = kind === 'success' ? CheckCircle2 : kind === 'error' ? AlertTriangle : Info;
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} aria-live={kind === 'error' ? 'assertive' : 'polite'}
      className={`flex items-start gap-2 px-3 py-2.5 rounded-lg border text-sm break-words ${STYLE[kind]} ${className}`}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
      <span className="flex-1 min-w-0">{message}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100">
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
};
