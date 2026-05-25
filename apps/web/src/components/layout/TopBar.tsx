import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, useGetMeQuery, useLogoutMutation } from '../../store/api';

function breadcrumbsFor(pathname: string): string[] {
  if (pathname === '/' || pathname === '') return ['Articles'];
  const segments = pathname.split('/').filter(Boolean);
  return segments.map((seg) => {
    if (seg === 'auth') return 'Auth';
    return seg.charAt(0).toUpperCase() + seg.slice(1);
  });
}

const Chevron = () => (
  <svg viewBox="0 0 10 10" className="h-2 w-2">
    <path d="M2 4 L5 7 L8 4" stroke="currentColor" strokeWidth="1.4" fill="none" />
  </svg>
);

export default function TopBar() {
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

  const crumbs = breadcrumbsFor(location.pathname);
  const userInitial = me?.email.charAt(0).toUpperCase() ?? '?';

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-paper px-3">
      <div className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-muted">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 ? <span className="text-border2">/</span> : null}
            <span className={i === crumbs.length - 1 ? 'text-ink' : ''}>{c}</span>
          </span>
        ))}
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
          <span className="flex h-6 w-6 items-center justify-center bg-accent font-mono text-[10px] text-paper">
            {userInitial}
          </span>
          <span className="hidden text-[12px] md:inline">{me?.email ?? '…'}</span>
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
              className="block w-full px-3 py-1.5 text-left text-[12.5px] text-ink hover:bg-paper disabled:opacity-50"
            >
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
