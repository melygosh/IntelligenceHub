import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmContext, type ConfirmOptions } from './confirm-context';

/** App-wide styled replacement for the native `confirm()`. Mirrors the
 * ToastProvider shape: render once near the app root, then call the
 * promise-returning function from useConfirm() anywhere below it. */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    // If a prior dialog is somehow still open, dismiss it as "false" first so
    // its caller's promise never dangles.
    resolverRef.current?.(false);
    setPending(options);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setPending(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending ? (
        <ConfirmDialog
          options={pending}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      ) : null}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({
  options,
  onConfirm,
  onCancel,
}: {
  options: ConfirmOptions;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const {
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    tone = 'default',
  } = options;
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const danger = tone === 'danger';
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-ink/30"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-[min(420px,100%)] border border-border bg-surface p-6 shadow-[0_16px_48px_-16px_rgba(28,26,22,0.4)]"
      >
        <h2 className="font-serif text-[20px] leading-snug text-ink">{title}</h2>
        {message ? (
          <p className="mt-2 font-mono text-[13px] leading-relaxed text-muted">
            {message}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="border border-border px-3 py-1.5 font-mono text-[13px] uppercase tracking-[0.1em] text-muted hover:text-ink"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={
              danger
                ? 'border border-critical bg-critical px-3 py-1.5 font-mono text-[13px] uppercase tracking-[0.1em] text-paper hover:bg-[#5a1e16]'
                : 'border border-ink bg-ink px-3 py-1.5 font-mono text-[13px] uppercase tracking-[0.1em] text-paper'
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
