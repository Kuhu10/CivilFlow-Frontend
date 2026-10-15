import { AlertCircle, CheckCircle2, Info, LoaderCircle, X } from 'lucide-react';
import type { ReactNode } from 'react';

export function Alert({ kind = 'info', children, onClose }: { kind?: 'info' | 'success' | 'error' | 'warning'; children: ReactNode; onClose?: () => void }) {
  const Icon = kind === 'success' ? CheckCircle2 : kind === 'error' || kind === 'warning' ? AlertCircle : Info;
  return <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}><Icon size={18} /><div>{children}</div>{onClose && <button className="icon-button alert-close" onClick={onClose} aria-label="Dismiss message"><X size={16} /></button>}</div>;
}

export function Loading({ label = 'Loading your workspace…' }: { label?: string }) {
  return <div className="loading-state"><LoaderCircle size={24} className="spin" /><span>{label}</span></div>;
}

export function EmptyState({ icon, title, message, action }: { icon: ReactNode; title: string; message: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><h3>{title}</h3><p>{message}</p>{action}</div>;
}
