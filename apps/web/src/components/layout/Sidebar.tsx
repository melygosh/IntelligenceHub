import { NavLink } from 'react-router-dom';

type Item = { to: string; label: string };

const NAV: Item[] = [
  { to: '/articles', label: 'Articles' },
  { to: '/graph', label: 'Graph' },
  { to: '/digests', label: 'Digests' },
  { to: '/feeds', label: 'Feeds' },
];

const SETTINGS: Item[] = [
  { to: '/categories', label: 'Categories' },
  { to: '/settings/axes', label: 'Axes' },
];

const itemClass = ({ isActive }: { isActive: boolean }) =>
  [
    'group flex items-center gap-2.5 px-3 py-1.5 text-[12.5px] transition-colors border-l-2',
    isActive
      ? 'bg-paper text-ink border-accent font-medium'
      : 'text-muted border-transparent hover:bg-paper hover:text-ink',
  ].join(' ');

const eyebrowClass =
  'px-3 pt-3 pb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-mute2';

const Brand = () => (
  <div className="flex items-center gap-2 text-ink">
    <svg viewBox="0 0 16 16" className="h-4 w-4">
      <circle cx="3" cy="3.5" r="2" fill="currentColor" />
      <circle cx="13" cy="3.5" r="1.3" fill="currentColor" />
      <circle cx="8" cy="12.5" r="1.5" fill="currentColor" />
      <path
        d="M3 3.5 L8 12.5 M13 3.5 L8 12.5 M3 3.5 L13 3.5"
        stroke="currentColor"
        strokeWidth="0.7"
        fill="none"
        opacity="0.6"
      />
    </svg>
    <span className="font-mono text-[12px] tracking-[0.02em]">news intelligence</span>
  </div>
);

export default function Sidebar() {
  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-border bg-paper2/40">
      <div className="flex h-11 items-center border-b border-border px-3">
        <Brand />
      </div>

      <nav>
        <div className={eyebrowClass}>Navigate</div>
        <div className="flex flex-col gap-px">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={itemClass}>
              <span className="flex-1 text-left">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="border-t border-border">
        <div className={eyebrowClass}>Settings</div>
        <div className="flex flex-col gap-px">
          {SETTINGS.map((item) => (
            <NavLink key={item.to} to={item.to} className={itemClass}>
              <span className="flex-1 text-left">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </div>

      <div className="mt-auto border-t border-border py-2">
        <a
          href="/admin/queues"
          target="_blank"
          rel="noreferrer"
          className="group flex items-center gap-2 px-3 py-1.5 text-[12px] text-mute2 hover:bg-paper hover:text-ink"
        >
          <span className="flex-1">Bull Board</span>
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5">
            <path
              d="M4 2 H10 V8 M10 2 L3 9"
              stroke="currentColor"
              strokeWidth="1.1"
              fill="none"
            />
          </svg>
        </a>
      </div>
    </aside>
  );
}
