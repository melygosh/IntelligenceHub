import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

export default function Shell() {
  return (
    <div className="flex h-screen w-screen">
      <Sidebar />
      <div className="flex h-full flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
