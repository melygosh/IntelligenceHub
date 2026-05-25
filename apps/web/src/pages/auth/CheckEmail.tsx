import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useGetMeQuery, useResendConfirmationMutation } from '../../store/api';

type LocationState = { devModeConfirmLink?: string } | null;

export default function CheckEmail() {
  const { data: me } = useGetMeQuery();
  const location = useLocation();
  const initialLink =
    (location.state as LocationState)?.devModeConfirmLink ??
    sessionStorage.getItem('devModeConfirmLink') ??
    undefined;
  const [shownLink, setShownLink] = useState<string | undefined>(initialLink ?? undefined);
  const [resend, { isLoading: isResending }] = useResendConfirmationMutation();
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialLink) sessionStorage.setItem('devModeConfirmLink', initialLink);
  }, [initialLink]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function onResend() {
    setError(null);
    try {
      const result = await resend().unwrap();
      if (result.devModeConfirmLink) {
        setShownLink(result.devModeConfirmLink);
        sessionStorage.setItem('devModeConfirmLink', result.devModeConfirmLink);
      }
      setCooldown(60);
    } catch (err) {
      const status = (err as { status?: number }).status;
      const retry = (err as { data?: { retryAfterSeconds?: number } }).data?.retryAfterSeconds;
      if (status === 429 && typeof retry === 'number') {
        setCooldown(retry);
        setError(`Please wait ${retry}s before requesting another link.`);
      } else {
        setError('Could not resend right now. Try again in a moment.');
      }
    }
  }

  async function copyLink() {
    if (!shownLink) return;
    try {
      await navigator.clipboard.writeText(shownLink);
    } catch {
      /* clipboard unavailable; ignore */
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-4">
      <div className="w-full max-w-[420px] border border-border bg-surface p-6">
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          Verify email
        </div>
        <h1 className="pretty mb-4 font-serif text-[22px] leading-tight text-ink">
          Check your email.
        </h1>
        <p className="mb-4 text-[13px] text-ink">
          We sent a confirmation link
          {me?.email ? (
            <>
              {' '}
              to <strong>{me.email}</strong>
            </>
          ) : null}
          . Click it to start using your hub.
        </p>

        {shownLink ? (
          <div className="mb-4 border border-border bg-paper p-3">
            <div className="mb-1.5 inline-block bg-ink px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-paper">
              Dev Mode
            </div>
            <div className="mt-1 break-all font-mono text-[11.5px] text-ink">
              <a className="underline" href={shownLink}>
                {shownLink}
              </a>
            </div>
            <button
              type="button"
              className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted hover:text-ink"
              onClick={copyLink}
            >
              Copy link
            </button>
          </div>
        ) : null}

        <div className="mb-3">
          <button
            type="button"
            disabled={isResending || cooldown > 0}
            onClick={onResend}
            className="border border-ink bg-ink px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-paper disabled:opacity-50"
          >
            {cooldown > 0
              ? `Resent — wait ${cooldown}s`
              : isResending
                ? 'Resending…'
                : 'Resend link'}
          </button>
        </div>

        {error ? <p className="mb-3 font-mono text-[10.5px] text-critical">{error}</p> : null}

        <div className="mt-4 font-mono text-[10.5px] text-mute2">
          Already confirmed?{' '}
          <Link to="/articles" className="underline text-muted">
            Continue →
          </Link>
        </div>
      </div>
    </div>
  );
}
