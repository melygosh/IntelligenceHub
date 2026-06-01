import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, useGetMeQuery, useLogoutMutation } from '../../store/api';
import { usePageTitle } from './usePageTitle';

type Crumb = { label: string; path: string };

// Cumulative paths that are real navigable routes — only these get linkified
// as breadcrumbs. (`/settings` has no page of its own, so "Settings / Axes"
// keeps "Settings" as plain text rather than a dead link.)
const LINKABLE_PATHS = new Set([
  '/articles',
  '/entities',
  '/digests',
  '/graph',
  '/feeds',
  '/categories',
  '/telemetry',
  '/settings/axes',
]);

function breadcrumbsFor(pathname: string): Crumb[] {
  if (pathname === '/' || pathname === '') return [{ label: 'Articles', path: '/articles' }];
  const segments = pathname.split('/').filter(Boolean);
  let acc = '';
  return segments.map((seg) => {
    acc += `/${seg}`;
    const label = seg === 'auth' ? 'Auth' : seg.charAt(0).toUpperCase() + seg.slice(1);
    return { label, path: acc };
  });
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

const Chevron = () => (
  <svg viewBox="0 0 10 10" className="h-2 w-2">
    <path d="M2 4 L5 7 L8 4" stroke="currentColor" strokeWidth="1.4" fill="none" />
  </svg>
);

export default function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const { data: me } = useGetMeQuery();
  const [logout, { isLoading }] = useLogoutMutation();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function handleLogout() {
    await logout();
    // Wipe cached query data so the Login page doesn't see stale `me` and bounce us
    // back to /articles (which would 401 and bounce again — an infinite redirect loop).
    dispatch(api.util.resetApiState());
    navigate('/auth/login', { replace: true });
  }

  const pageTitle = usePageTitle();
  const rawCrumbs = breadcrumbsFor(location.pathname);
  const lastRaw = rawCrumbs[rawCrumbs.length - 1];
  const crumbs: Crumb[] =
    pageTitle && rawCrumbs.length > 1
      ? [...rawCrumbs.slice(0, -1), { ...lastRaw, label: truncate(pageTitle, 72) }]
      : rawCrumbs;
  const userInitial = me?.email.charAt(0).toUpperCase() ?? '?';

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-paper px-3">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open navigation"
        aria-controls="mobile-nav"
        className="-ml-1 p-1 text-mute2 hover:text-ink md:hidden"
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4">
          <path
            d="M2 4h12M2 8h12M2 12h12"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <div className="flex min-w-0 items-center gap-1.5 font-mono text-[13px] text-muted">
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1;
          const linkable = !isLast && LINKABLE_PATHS.has(c.path);
          return (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 ? <span className="text-border2">/</span> : null}
              {linkable ? (
                <Link to={c.path} className="underline-offset-2 hover:text-ink hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span className={isLast ? 'text-ink' : ''}>{c.label}</span>
              )}
            </span>
          );
        })}
      </div>

      <div className="flex-1" />

      <div className="relative flex items-center gap-1.5" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          disabled={isLoading}
          className="flex items-center gap-1.5 py-1 pl-1 pr-2 hover:bg-paper2 disabled:opacity-50"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <span className="flex h-6 w-6 items-center justify-center bg-accent font-mono text-[12px] text-paper">
            {userInitial}
          </span>
          <span className="hidden text-[14px] md:inline">{me?.email ?? '…'}</span>
          <span className="text-mute2">
            <Chevron />
          </span>
        </button>
        {menuOpen ? (
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] border border-border bg-surface py-1 shadow-sm">
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoading}
              className="block w-full px-3 py-1.5 text-left text-[14.5px] text-ink hover:bg-paper disabled:opacity-50"
            >
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
