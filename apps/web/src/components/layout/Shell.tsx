import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useRegenerationStatusEvents } from '../../events/useRegenerationStatusEvents';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

export default function Shell() {
  useRegenerationStatusEvents();
  // Below `md` the sidebar collapses into a top hamburger that opens this
  // drawer; at `md`+ the drawer is inert (hidden by breakpoint utilities).
  const [navOpen, setNavOpen] = useState(false);
  return (
    <div className="flex h-screen w-screen bg-paper text-ink">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <TopBar onMenuClick={() => setNavOpen(true)} />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
