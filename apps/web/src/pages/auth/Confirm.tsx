import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useConfirmEmailMutation, useGetMeQuery } from '../../store/api';

type State = 'pending' | 'success' | 'error';

export default function Confirm() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [confirmEmail] = useConfirmEmailMutation();
  const navigate = useNavigate();
  const { data: me } = useGetMeQuery();
  const [state, setState] = useState<State>('pending');

  useEffect(() => {
    if (!token) {
      setState('error');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await confirmEmail({ token }).unwrap();
        if (!cancelled) {
          setState('success');
          setTimeout(() => navigate('/articles', { replace: true }), 800);
        }
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [confirmEmail, navigate, token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-4">
      <div className="w-full max-w-[380px] border border-border bg-surface p-6 text-center">
        {state === 'pending' && (
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
            Confirming…
          </p>
        )}
        {state === 'success' && (
          <>
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              Confirmed
            </div>
            <h1 className="pretty mb-3 font-serif text-[20px] leading-tight text-ink">
              Email confirmed.
            </h1>
            <p className="font-mono text-[10.5px] text-mute2">Redirecting…</p>
          </>
        )}
        {state === 'error' && (
          <>
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              Error
            </div>
            <h1 className="pretty mb-3 font-serif text-[20px] leading-tight text-ink">
              Invalid or expired link.
            </h1>
            {me ? (
              <Link to="/auth/check-email" className="underline font-mono text-[11px] text-muted">
                Send a new one →
              </Link>
            ) : (
              <Link to="/auth/login" className="underline font-mono text-[11px] text-muted">
                Sign in →
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}
