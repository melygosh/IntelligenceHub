import type { ReactNode } from 'react';
import type { FieldError, UseFormRegisterReturn } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../lib/auth';

const fieldClass =
  'w-full border border-border bg-paper px-2.5 py-2 text-[15px] text-ink placeholder-mute2 focus:border-ink focus:outline-none';
const labelClass =
  'mb-1 flex items-center justify-between font-mono text-[12px] uppercase tracking-[0.1em] text-muted';
const errorClass = 'mt-1 font-mono text-[12.5px] text-critical';
const hintClass = 'mt-1 font-mono text-[12.5px] text-mute2';

/** Centered card + form shell with the eyebrow/title chrome shared by the
 * Login and Register pages. The page owns the submit handler and field body. */
export function AuthFormShell({
  eyebrow,
  title,
  onSubmit,
  children,
}: {
  eyebrow: string;
  title: string;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-[360px] border border-border bg-surface p-6"
        noValidate
      >
        <div className="mb-1.5 font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
          {eyebrow}
        </div>
        <h1 className="pretty mb-5 font-serif text-[24px] leading-tight text-ink">{title}</h1>
        {children}
      </form>
    </div>
  );
}

/** Labeled text input with react-hook-form registration and an error/hint line
 * (error takes precedence; the hint shows only while there's no error). */
export function AuthField({
  id,
  label,
  type,
  autoComplete,
  registration,
  error,
  hint,
  autoFocus,
  className = 'mb-3 block',
}: {
  id: string;
  label: string;
  type: string;
  autoComplete: string;
  registration: UseFormRegisterReturn;
  error?: FieldError;
  hint?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const msg = errorMessage(error);
  return (
    <label className={className} htmlFor={id}>
      <span className={labelClass}>{label}</span>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        className={fieldClass}
        {...registration}
      />
      {msg ? (
        <span className={errorClass}>{msg}</span>
      ) : hint ? (
        <span className={hintClass}>{hint}</span>
      ) : null}
    </label>
  );
}

/** Server/mutation error banner; renders nothing when there's no message. */
export function AuthErrorBanner({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <div className="mb-3 border border-critical/30 bg-critical-bg px-2.5 py-1.5 font-mono text-[13px] text-critical">
      {message}
    </div>
  );
}

/** Full-width accent submit button with a spinner while loading. */
export function AuthSubmitButton({
  isLoading,
  idle,
  loading,
}: {
  isLoading: boolean;
  idle: string;
  loading: string;
}) {
  return (
    <button
      type="submit"
      disabled={isLoading}
      className="inline-flex w-full items-center justify-center gap-2 bg-accent px-3 py-2 font-mono text-[15px] text-paper transition-colors hover:bg-accent-deep disabled:cursor-not-allowed disabled:bg-paper2 disabled:text-mute2"
    >
      {isLoading ? (
        <>
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-paper/40 border-t-paper" />
          <span>{loading}</span>
        </>
      ) : (
        <>
          <span>{idle}</span>
          <span>→</span>
        </>
      )}
    </button>
  );
}

/** Footer "prompt + link" pointing at the other auth page. */
export function AuthAltAction({ prompt, to, label }: { prompt: string; to: string; label: string }) {
  return (
    <div className="mt-5 border-t border-border pt-4 text-center font-mono text-[13px] text-muted">
      {prompt}{' '}
      <Link to={to} className="ml-1.5 text-accent hover:text-accent-deep">
        {label}
      </Link>
    </div>
  );
}
