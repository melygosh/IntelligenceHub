import { NavLink } from 'react-router-dom';

type Item = { to: string; label: string; external?: boolean };

const items: Item[] = [
  { to: '/articles', label: 'Articles' },
  { to: '/graph', label: 'Graph' },
  { to: '/digests', label: 'Digests' },
  { to: '/feeds', label: 'Feeds' },
  { to: '/categories', label: 'Categories' },
  { to: '/settings/axes', label: 'Axes' },
  { to: '/admin/queues', label: 'Queues' },
];

export default function Sidebar() {
  return (
    <aside className="w-56 border-r border-gray-200 bg-gray-50 p-4">
      <div className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
        IntelligenceHub
      </div>
      <nav className="flex flex-col gap-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              [
                'rounded px-3 py-2 text-sm',
                isActive ? 'bg-gray-200 font-medium text-gray-900' : 'text-gray-700 hover:bg-gray-100',
              ].join(' ')
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
