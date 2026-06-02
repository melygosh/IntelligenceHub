import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ToastContext } from './toast-context';

export type ToastSeverity = 'success' | 'info' | 'warn' | 'error';

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type ToastProgress = {
  current: number;
  total: number;
  /** Right-aligned secondary meta (e.g. "3,840 tok · $0.011" or "ETA 4s"). */
  meta?: string;
};

export type Toast = {
  id: string;
  severity: ToastSeverity;
  title: string;
  subtitle?: string;
  body?: string;
  /** When present: spinner replaces severity icon, progress bar renders,
   * top-right shows minimize (−) instead of close (×), and the toast does
   * not auto-dismiss. Set to undefined via `update()` to morph to a regular
   * severity toast on completion. */
  progress?: ToastProgress;
  /** Inline action buttons rendered below the body line. */
  actions?: ToastAction[];
  /** Auto-set from severity + progress on push; overridable. */
  persistent?: boolean;
};

const DEFAULT_TTL_MS = 6_000;

let counter = 0;
const nextId = () => `t-${Date.now()}-${++counter}`;

/** A toast persists (no auto-dismiss) when warn/error, or when it shows
 * progress, or when it surfaces action buttons. Otherwise success/info
 * with no actions auto-dismiss after DEFAULT_TTL_MS. */
function isPersistent(t: Pick<Toast, 'severity' | 'progress' | 'actions' | 'persistent'>): boolean {
  if (t.persistent !== undefined) return t.persistent;
  if (t.severity === 'warn' || t.severity === 'error') return true;
  if (t.progress) return true;
  if (t.actions && t.actions.length > 0) return true;
  return false;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const clearTimer = useCallback((id: string) => {
    const handle = timers.current.get(id);
    if (handle) {
      clearTimeout(handle);
      timers.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      setToasts((cur) => cur.filter((t) => t.id !== id));
      clearTimer(id);
    },
    [clearTimer],
  );

  const scheduleAutoDismiss = useCallback(
    (t: Toast) => {
      clearTimer(t.id);
      if (isPersistent(t)) return;
      const handle = setTimeout(() => dismiss(t.id), DEFAULT_TTL_MS);
      timers.current.set(t.id, handle);
    },
    [clearTimer, dismiss],
  );

  const push = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = nextId();
      const toast: Toast = { ...t, id };
      setToasts((cur) => [...cur, toast]);
      scheduleAutoDismiss(toast);
      return id;
    },
    [scheduleAutoDismiss],
  );

  const update = useCallback(
    (id: string, patch: Partial<Omit<Toast, 'id'>>) => {
      setToasts((cur) => {
        const next = cur.map((t) => (t.id === id ? { ...t, ...patch } : t));
        const updated = next.find((t) => t.id === id);
        if (updated) scheduleAutoDismiss(updated);
        return next;
      });
    },
    [scheduleAutoDismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const h of map.values()) clearTimeout(h);
      map.clear();
    };
  }, []);

  const value = useMemo(() => ({ push, update, dismiss }), [push, update, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ── Visuals ─────────────────────────────────────────────────────────────

const SEVERITY_STYLE: Record<
  ToastSeverity,
  { border: string; bg: string; icon: string; titleColor: string; barFill: string }
> = {
  success: {
    border: '#4d6b3e',
    bg: '#e6efd8',
    icon: '#344a2a',
    titleColor: '#2f4a26',
    barFill: '#4d6b3e',
  },
  info: {
    border: '#3a5a8c',
    bg: '#e0e8f2',
    icon: '#2a4470',
    titleColor: '#2a4470',
    barFill: '#3a5a8c',
  },
  warn: {
    border: '#a85a3a',
    bg: '#f1e3d6',
    icon: '#7a4022',
    titleColor: '#7a4022',
    barFill: '#a85a3a',
  },
  error: {
    border: '#7e2b1f',
    bg: '#f5e6df',
    icon: '#5a1e16',
    titleColor: '#5a1e16',
    barFill: '#7e2b1f',
  },
};

function SeverityIcon({ severity }: { severity: ToastSeverity }) {
  if (severity === 'success') {
    return (
      <svg viewBox="0 0 14 14" className="h-3.5 w-3.5">
        <path
          d="M3 7.5 L6 10 L11 4"
          stroke="currentColor"
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (severity === 'error') {
    return (
      <svg viewBox="0 0 14 14" className="h-3.5 w-3.5">
        <rect
          x="2"
          y="2"
          width="10"
          height="10"
          stroke="currentColor"
          strokeWidth="1.2"
          fill="none"
        />
        <path
          d="M5 5 L9 9 M9 5 L5 9"
          stroke="currentColor"
          strokeWidth="1.3"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (severity === 'warn') {
    return (
      <svg viewBox="0 0 14 14" className="h-3.5 w-3.5">
        <path
          d="M7 1.5 L13 12 H1 Z M7 6 V8.5 M7 10 V10.2"
          stroke="currentColor"
          strokeWidth="1.2"
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 14 14" className="h-3.5 w-3.5">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path
        d="M7 6.5 V10"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="7" cy="4.3" r="0.6" fill="currentColor" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg viewBox="0 0 14 14" className="h-3.5 w-3.5 animate-spin">
      <circle
        cx="7"
        cy="7"
        r="5.5"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
        strokeDasharray="9 22"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3">
      <path
        d="M3 3 L9 9 M9 3 L3 9"
        stroke="currentColor"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MinimizeIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3">
      <path d="M3 6 H9" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function ProgressBar({ current, total, fill }: { current: number; total: number; fill: string }) {
  const safeTotal = total > 0 ? total : 1;
  const pct = Math.min(100, Math.max(0, (current / safeTotal) * 100));
  return (
    <div className="h-[3px] w-full bg-paper2">
      <div
        className="h-full transition-[width] duration-200"
        style={{ width: `${pct}%`, background: fill }}
      />
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const s = SEVERITY_STYLE[toast.severity];
  const inProgress = !!toast.progress;
  return (
    <div
      role="status"
      className="pointer-events-auto flex items-start gap-3 border-l-[3px] px-4 py-3 shadow-[0_4px_16px_-4px_rgba(28,26,22,0.15)]"
      style={{ background: s.bg, borderLeftColor: s.border }}
    >
      <span className="mt-0.5 shrink-0" style={{ color: s.icon }}>
        {inProgress ? <SpinnerIcon /> : <SeverityIcon severity={toast.severity} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium leading-snug" style={{ color: s.titleColor }}>
          {toast.title}
          {toast.subtitle ? (
            <span className="font-mono text-[12.5px] font-normal text-muted">
              {' '}
              · {toast.subtitle}
            </span>
          ) : null}
        </div>
        {toast.progress ? (
          <div className="mt-2 space-y-1.5">
            <div className="flex items-baseline justify-between font-mono text-[12.5px] tnum">
              <span style={{ color: s.titleColor }}>
                <span className="font-medium">{toast.progress.current}</span>
                <span className="text-muted"> / {toast.progress.total}</span>
              </span>
              {toast.progress.meta ? (
                <span className="text-muted">{toast.progress.meta}</span>
              ) : null}
            </div>
            <ProgressBar
              current={toast.progress.current}
              total={toast.progress.total}
              fill={s.barFill}
            />
          </div>
        ) : null}
        {toast.body ? (
          <div className="pretty mt-1 font-mono text-[12.5px] leading-relaxed text-muted">
            {toast.body}
          </div>
        ) : null}
        {toast.actions && toast.actions.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-[12.5px]">
            {toast.actions.map((a, i) => (
              <button
                key={`${toast.id}-act-${i}`}
                type="button"
                onClick={a.onClick}
                className="text-ink underline-offset-2 hover:underline"
                style={{ color: s.titleColor }}
              >
                {a.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={inProgress ? 'Minimize' : 'Dismiss'}
        title={inProgress ? 'Minimize' : 'Dismiss'}
        className="shrink-0 p-1 hover:opacity-100"
        style={{ color: s.icon, opacity: 0.7 }}
      >
        {inProgress ? <MinimizeIcon /> : <CloseIcon />}
      </button>
    </div>
  );
}

function ToastHost({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-[min(420px,calc(100vw-3rem))] flex-col gap-2"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}
