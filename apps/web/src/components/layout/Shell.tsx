import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

/**
 * Reserved slot for a chrome-level regeneration progress banner (spec US-6).
 * Wired in Phase 2 Day 8 when regen lands; renders nothing on Day 2.
 */
function RegenBanner() {
  return null;
}

export default function Shell() {
  return (
    <div className="flex h-screen w-screen bg-paper text-ink">
      <Sidebar />
      <div className="flex h-full flex-1 flex-col">
        <TopBar />
        <RegenBanner />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
