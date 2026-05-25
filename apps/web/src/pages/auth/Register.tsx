import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { RegisterRequest } from '@intelligencehub/shared';
import { useGetMeQuery, useRegisterMutation } from '../../store/api';
import { errorMessage, isMutationErrorMessage } from '../../lib/auth';

const fieldClass =
  'w-full border border-border bg-paper px-2.5 py-2 text-[13px] text-ink placeholder-mute2 focus:border-ink focus:outline-none';
const labelClass =
  'mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.1em] text-muted';
const errorClass = 'mt-1 font-mono text-[10.5px] text-critical';
const hintClass = 'mt-1 font-mono text-[10.5px] text-mute2';

export default function Register() {
  const { data: me } = useGetMeQuery();
  const navigate = useNavigate();
  const [registerUser, { isLoading, error }] = useRegisterMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<typeof RegisterRequest._type>({
    resolver: zodResolver(RegisterRequest),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    if (me) navigate('/articles', { replace: true });
  }, [me, navigate]);

  async function onSubmit(values: typeof RegisterRequest._type) {
    try {
      await registerUser(values).unwrap();
      navigate('/articles', { replace: true });
    } catch {
      // shown via `error` state below
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-4">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-[360px] border border-border bg-surface p-6"
        noValidate
      >
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          Create account
        </div>
        <h1 className="pretty mb-5 font-serif text-[22px] leading-tight text-ink">
          Make your hub.
        </h1>

        <label className="mb-3 block" htmlFor="email">
          <span className={labelClass}>Email</span>
          <input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            className={fieldClass}
            {...register('email')}
          />
          {errorMessage(errors.email) ? (
            <span className={errorClass}>{errorMessage(errors.email)}</span>
          ) : null}
        </label>

        <label className="mb-4 block" htmlFor="password">
          <span className={labelClass}>Password</span>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            className={fieldClass}
            {...register('password')}
          />
          {errorMessage(errors.password) ? (
            <span className={errorClass}>{errorMessage(errors.password)}</span>
          ) : (
            <span className={hintClass}>Minimum 8 characters.</span>
          )}
        </label>

        {error ? (
          <div className="mb-3 border border-critical/30 bg-critical-bg px-2.5 py-1.5 font-mono text-[11px] text-critical">
            {isMutationErrorMessage(error)}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex w-full items-center justify-center gap-2 bg-accent px-3 py-2 font-mono text-[13px] text-paper transition-colors hover:bg-accent-deep disabled:cursor-not-allowed disabled:bg-paper2 disabled:text-mute2"
        >
          {isLoading ? (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-paper/40 border-t-paper" />
              <span>creating…</span>
            </>
          ) : (
            <>
              <span>create account</span>
              <span>→</span>
            </>
          )}
        </button>

        <div className="mt-5 border-t border-border pt-4 text-center font-mono text-[11px] text-muted">
          Have an account?{' '}
          <Link to="/auth/login" className="ml-1.5 text-accent hover:text-accent-deep">
            Sign in →
          </Link>
        </div>
      </form>
    </div>
  );
}
