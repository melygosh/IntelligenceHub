import type { ReactNode } from 'react';
import type { FieldError, UseFormRegisterReturn } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../lib/auth';
import { Brand } from '../brand/Brand';
import { AuthBackdrop } from './AuthBackdrop';

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
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-paper">
      <AuthBackdrop />
      {/* Vignette: clearest in the centre (behind the card), fading to paper at
          the edges so the constellation reads as a soft backdrop. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(244,239,230,0) 0%, rgba(244,239,230,0.4) 50%, rgba(244,239,230,0.78) 100%)',
        }}
      />

      <div className="relative z-20 flex items-center px-6 py-4">
        <Brand />
      </div>

      <div className="absolute inset-0 z-10 flex items-center justify-center overflow-auto px-6">
        <div className="w-full max-w-[420px] py-12">
          <form
            onSubmit={onSubmit}
            noValidate
            className="border border-border bg-paper p-8"
            style={{ boxShadow: '0 1px 0 #d8cfbd, 0 8px 30px -12px rgba(28,26,22,0.18)' }}
          >
            <div className="mb-1.5 font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
              {eyebrow}
            </div>
            <h1 className="pretty mb-5 font-serif text-[26px] leading-tight text-ink">{title}</h1>
            {children}
          </form>
          <div className="mt-3 text-center font-mono text-[10.5px] text-mute2">
            backdrop · sample week of an actual knowledge graph
          </div>
        </div>
      </div>
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
