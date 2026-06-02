import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Brand, Logo } from '../brand/Brand';

type SidebarProps = {
  // Mobile drawer wiring (ignored by the desktop in-flow sidebar). Below `md`
  // the sidebar renders as a slide-in overlay controlled by these.
  open: boolean;
  onClose: () => void;
};

// Icon set from docs/IntelligenceHub_design/App Shell.html — keep currentColor + thin strokes
// for the editorial-mono look.
const ICONS = {
  articles: (cls = 'h-3.5 w-3.5') => (
    <svg viewBox="0 0 14 14" className={cls}>
      <rect x="2.5" y="2" width="9" height="10" stroke="currentColor" strokeWidth="1" fill="none" />
      <path d="M4 5h6M4 7h6M4 9h4" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" />
    </svg>
  ),
  graph: (cls = 'h-3.5 w-3.5') => (
    <svg viewBox="0 0 14 14" className={cls}>
      <circle cx="3" cy="4" r="1.5" fill="currentColor" />
      <circle cx="11" cy="3" r="1.3" fill="currentColor" />
      <circle cx="7" cy="11" r="1.4" fill="currentColor" />
      <path
        d="M3 4 L7 11 M11 3 L7 11 M3 4 L11 3"
        stroke="currentColor"
        strokeWidth="0.7"
        opacity="0.55"
      />
    </svg>
  ),
  digests: (cls = 'h-3.5 w-3.5') => (
    <svg viewBox="0 0 14 14" className={cls}>
      <rect x="2" y="3" width="10" height="8" stroke="currentColor" strokeWidth="1" fill="none" />
      <path
        d="M2.3 3.3 L7 7.5 L11.7 3.3"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
        strokeLinejoin="round"
      />
    </svg>
  ),
  rss: (cls = 'h-3.5 w-3.5') => (
    <svg viewBox="0 0 14 14" className={cls}>
      <circle cx="3.4" cy="10.6" r="1.2" fill="currentColor" />
      <path
        d="M2.6 6.4a5 5 0 0 1 5 5"
        stroke="currentColor"
        strokeWidth="1.1"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M2.6 3.2a8.2 8.2 0 0 1 8.2 8.2"
        stroke="currentColor"
        strokeWidth="1.1"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  ),
  entities: (cls = 'h-3.5 w-3.5') => (
    <svg viewBox="0 0 14 14" className={cls}>
      <rect x="2" y="2.5" width="6" height="2.6" fill="currentColor" opacity="0.85" />
      <rect x="2" y="5.7" width="9" height="2.6" fill="currentColor" opacity="0.55" />
      <rect x="2" y="8.9" width="7.5" height="2.6" fill="currentColor" opacity="0.75" />
    </svg>
  ),
  tag: (cls = 'h-3.5 w-3.5') => (
    <svg viewBox="0 0 14 14" className={cls}>
      <path
        d="M7 1.5 H12 V6.5 L6.5 12 L1.5 7 Z"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="4" r="0.9" fill="currentColor" />
    </svg>
  ),
  sliders: (cls = 'h-3.5 w-3.5') => (
    <svg viewBox="0 0 14 14" className={cls}>
      <path
        d="M2 4.5h10M2 9.5h10"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.5"
      />
      <circle cx="5" cy="4.5" r="1.7" fill="currentColor" />
      <circle cx="9.5" cy="9.5" r="1.7" fill="currentColor" />
    </svg>
  ),
  activity: (cls = 'h-3.5 w-3.5') => (
    <svg viewBox="0 0 14 14" className={cls}>
      <path
        d="M1.5 7H4l1.4-3.6L8 10.6 9.3 7H12.5"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  queue: (cls = 'h-3.5 w-3.5') => (
    <svg viewBox="0 0 14 14" className={cls}>
      <rect
        x="2.5"
        y="2.2"
        width="9"
        height="2.3"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
      />
      <rect
        x="2.5"
        y="5.85"
        width="9"
        height="2.3"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
      />
      <rect
        x="2.5"
        y="9.5"
        width="9"
        height="2.3"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
      />
    </svg>
  ),
  dashboard: (cls = 'h-3.5 w-3.5') => (
    <svg viewBox="0 0 14 14" className={cls}>
      <rect x="2" y="2" width="4.2" height="5" stroke="currentColor" strokeWidth="1" fill="none" />
      <rect x="2" y="8" width="4.2" height="4" stroke="currentColor" strokeWidth="1" fill="none" />
      <rect
        x="7.8"
        y="2"
        width="4.2"
        height="4"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
      />
      <rect
        x="7.8"
        y="7"
        width="4.2"
        height="5"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
      />
    </svg>
  ),
} as const;

type IconKey = keyof typeof ICONS;
type Item = { to: string; label: string; icon: IconKey };

const NAV: Item[] = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/articles', label: 'Articles', icon: 'articles' },
  { to: '/graph', label: 'Graph', icon: 'graph' },
  { to: '/digests', label: 'Digests', icon: 'digests' },
  { to: '/feeds', label: 'Feeds', icon: 'rss' },
];

const SETTINGS: Item[] = [
  { to: '/entities', label: 'Entities', icon: 'entities' },
  { to: '/categories', label: 'Categories', icon: 'tag' },
  { to: '/settings/axes', label: 'Axes', icon: 'sliders' },
  { to: '/telemetry', label: 'Telemetry', icon: 'activity' },
];

const STORAGE_KEY = 'ih.sidebar.compact';

const itemClass = ({ isActive }: { isActive: boolean }) =>
  [
    'group flex items-center gap-2.5 px-3 py-2 text-[14.5px] transition-colors border-l-2',
    isActive
      ? 'bg-paper text-ink border-accent font-medium'
      : 'text-muted border-transparent hover:bg-paper hover:text-ink',
  ].join(' ');

const eyebrowClass =
  'px-3 pt-3 pb-1.5 font-mono text-[12px] uppercase tracking-[0.12em] text-mute2';

function CompactNavItem({ item }: { item: Item }) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        [
          'group relative mx-auto flex h-9 w-10 items-center justify-center border-l-2',
          isActive
            ? 'border-accent bg-paper text-ink'
            : 'border-transparent text-mute2 hover:bg-paper hover:text-ink',
        ].join(' ')
      }
    >
      <span>{ICONS[item.icon]()}</span>
      <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap bg-ink px-1.5 py-0.5 font-mono text-[10.5px] text-paper opacity-0 transition-opacity group-hover:opacity-100">
        {item.label}
      </span>
    </NavLink>
  );
}

// Shared full-width nav body (brand header + Navigate / Settings / Admin
// sections). Reused by the desktop in-flow sidebar and the mobile drawer so the
// nav list lives in exactly one place. `headerButton` is the top-right control
// (collapse on desktop, close on the drawer); `onNavigate` lets the drawer
// close itself when a destination is chosen.
function SidebarBody({
  headerButton,
  onNavigate,
}: {
  headerButton: ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="flex h-11 items-center justify-between border-b border-border px-3">
        <Brand />
        {headerButton}
      </div>

      <nav>
        <div className={eyebrowClass}>Navigate</div>
        <div className="flex flex-col gap-px">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={itemClass} onClick={onNavigate}>
              <span className="text-mute2 group-hover:text-ink">{ICONS[item.icon]()}</span>
              <span className="flex-1 text-left">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="border-t border-border">
        <div className={eyebrowClass}>Settings</div>
        <div className="flex flex-col gap-px">
          {SETTINGS.map((item) => (
            <NavLink key={item.to} to={item.to} className={itemClass} onClick={onNavigate}>
              <span className="text-mute2 group-hover:text-ink">{ICONS[item.icon]()}</span>
              <span className="flex-1 text-left">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </div>

      {/* US-12: admin entry point to Bull Board. Served by the API at
          /admin/queues behind HTTP basic-auth (BULL_BOARD_USER/PASS); the
          Vite dev proxy forwards /admin/queues. Opens in a new tab rather
          than routing inside the SPA — the credentials are the access gate. */}
      <div className="mt-auto border-t border-border">
        <div className={eyebrowClass}>Admin</div>
        <a
          href="/admin/queues"
          target="_blank"
          rel="noopener noreferrer"
          className={itemClass({ isActive: false })}
          onClick={onNavigate}
        >
          <span className="text-mute2 group-hover:text-ink">{ICONS.queue()}</span>
          <span className="flex-1 text-left">Open queues</span>
          <span aria-hidden="true" className="text-mute2">
            ↗
          </span>
        </a>
      </div>
    </>
  );
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const [compact, setCompact] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, compact ? '1' : '0');
    } catch {
      /* private mode etc */
    }
  }, [compact]);

  // Close the mobile drawer on Escape (listener only active while open).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Mobile drawer: full-width nav as a slide-in overlay, shown only below `md`.
  // Rendered alongside the desktop sidebar; visibility is controlled purely by
  // breakpoint utilities (`md:hidden`) and the `open` transform.
  const mobileDrawer = (
    <div className="md:hidden">
      {open ? (
        <div className="fixed inset-0 z-40 bg-ink/40" aria-hidden="true" onClick={onClose} />
      ) : null}
      <aside
        id="mobile-nav"
        className={[
          'fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-border bg-paper2',
          'transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <SidebarBody
          onNavigate={onClose}
          headerButton={
            <button
              type="button"
              onClick={onClose}
              aria-label="Close navigation"
              className="-mr-1 p-1 text-mute2 hover:text-ink"
            >
              <svg viewBox="0 0 12 12" className="h-3 w-3">
                <path d="M3 3 L9 9 M9 3 L3 9" stroke="currentColor" strokeWidth="1.2" fill="none" />
              </svg>
            </button>
          }
        />
      </aside>
    </div>
  );

  if (compact) {
    return (
      <>
        {mobileDrawer}
        <aside className="hidden w-[52px] shrink-0 flex-col border-r border-border bg-paper2/50 transition-[width] duration-150 md:flex">
          <div className="flex h-11 items-center justify-center border-b border-border">
            <Logo size={16} />
          </div>

          <nav className="flex flex-col gap-px py-2">
            {NAV.map((item) => (
              <CompactNavItem key={item.to} item={item} />
            ))}
          </nav>

          <div className="flex flex-col gap-px border-t border-border py-2">
            {SETTINGS.map((item) => (
              <CompactNavItem key={item.to} item={item} />
            ))}
          </div>

          <div className="mt-auto flex flex-col gap-px border-t border-border py-2">
            <a
              href="/admin/queues"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open queues (Bull Board)"
              className="group relative mx-auto flex h-9 w-10 items-center justify-center border-l-2 border-transparent text-mute2 hover:bg-paper hover:text-ink"
            >
              <span>{ICONS.queue()}</span>
              <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap bg-ink px-1.5 py-0.5 font-mono text-[10.5px] text-paper opacity-0 transition-opacity group-hover:opacity-100">
                Open queues
              </span>
            </a>
            <button
              type="button"
              onClick={() => setCompact(false)}
              aria-label="Expand sidebar"
              className="mx-auto flex h-7 w-10 items-center justify-center text-mute2 hover:bg-paper hover:text-ink"
            >
              <svg viewBox="0 0 12 12" className="h-2.5 w-2.5">
                <path d="M3 2 L8 6 L3 10" stroke="currentColor" strokeWidth="1.2" fill="none" />
              </svg>
            </button>
          </div>
        </aside>
      </>
    );
  }

  return (
    <>
      {mobileDrawer}
      <aside className="hidden w-[280px] shrink-0 flex-col border-r border-border bg-paper2/40 transition-[width] duration-150 md:flex">
        <SidebarBody
          headerButton={
            <button
              type="button"
              onClick={() => setCompact(true)}
              aria-label="Collapse sidebar"
              className="-mr-1 p-1 text-mute2 hover:text-ink"
            >
              <svg viewBox="0 0 12 12" className="h-2.5 w-2.5">
                <path d="M9 2 L4 6 L9 10" stroke="currentColor" strokeWidth="1.2" fill="none" />
              </svg>
            </button>
          }
        />
      </aside>
    </>
  );
}
