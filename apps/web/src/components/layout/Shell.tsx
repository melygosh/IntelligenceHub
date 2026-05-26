import { Outlet } from 'react-router-dom';
import RegenBanner from '../regeneration/RegenBanner';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

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
