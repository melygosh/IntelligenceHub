import { useNavigate } from 'react-router-dom';
import { useGetMeQuery, useLogoutMutation } from '../../store/api';

export default function TopBar() {
  const { data: me } = useGetMeQuery();
  const [logout, { isLoading }] = useLogoutMutation();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/auth/login', { replace: true });
  }

  return (
    <header className="flex h-12 items-center justify-between border-b border-gray-200 bg-white px-4">
      <div className="text-sm text-gray-500">News Intelligence Hub</div>
      <div className="flex items-center gap-3 text-sm">
        {me ? <span className="text-gray-700">{me.email}</span> : null}
        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoading}
          className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
