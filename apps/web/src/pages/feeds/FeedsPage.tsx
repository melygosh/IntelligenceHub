import { useState } from 'react';
import {
  useCreateFeedMutation,
  useDeleteFeedMutation,
  useGetFeedsQuery,
  usePullFeedMutation,
} from '../../store/api';

export default function FeedsPage() {
  const { data, isLoading } = useGetFeedsQuery();
  const [createFeed, { isLoading: isCreating }] = useCreateFeedMutation();
  const [deleteFeed] = useDeleteFeedMutation();
  const [pullFeed] = usePullFeedMutation();
  const [url, setUrl] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!url) return;
    try {
      await createFeed({ url }).unwrap();
      setUrl('');
      showToast('Feed added');
    } catch {
      showToast('Failed to add feed (check URL)');
    }
  }

  async function onPull(id: string) {
    try {
      await pullFeed(id).unwrap();
      showToast('Queued — check Queues');
    } catch {
      showToast('Failed to enqueue');
    }
  }

  async function onDelete(id: string) {
    try {
      await deleteFeed(id).unwrap();
      showToast('Feed deleted');
    } catch {
      showToast('Failed to delete');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Feeds</h1>
        {toast ? <span className="text-sm text-gray-600">{toast}</span> : null}
      </div>

      <form onSubmit={onAdd} className="flex gap-2">
        <input
          type="url"
          required
          placeholder="https://example.com/feed.xml"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={isCreating || !url}
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {isCreating ? 'Adding…' : 'Add feed'}
        </button>
      </form>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : !data || data.feeds.length === 0 ? (
        <div className="rounded border border-dashed border-gray-300 p-8 text-center">
          <p className="text-sm text-gray-600">No feeds yet — add one above to get started.</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-200 rounded border border-gray-200">
          {data.feeds.map((feed) => (
            <li key={feed.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="truncate text-gray-800">{feed.url}</span>
              <span className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onPull(feed.id)}
                  className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50"
                >
                  Pull now
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(feed.id)}
                  className="rounded border border-red-200 px-3 py-1 text-xs text-red-700 hover:bg-red-50"
                >
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
