import { useState } from 'react';
import {
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
  useGetCategoriesQuery,
} from '../../store/api';

export default function CategoriesPage() {
  const { data, isLoading } = useGetCategoriesQuery();
  const [createCategory, { isLoading: isCreating }] = useCreateCategoryMutation();
  const [deleteCategory] = useDeleteCategoryMutation();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (trimmed === '') return;
    try {
      await createCategory({ name: trimmed }).unwrap();
      setName('');
    } catch (err) {
      const code = (err as { data?: { error?: string } }).data?.error;
      if (code === 'duplicate_name') setError('Already exists.');
      else if (code === 'too_many_categories') setError('Limit reached (max 20).');
      else setError('Could not add. Try again.');
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          Settings
        </div>
        <h1 className="pretty mb-1 font-serif text-[28px] leading-tight text-ink">Categories</h1>
        <p className="font-mono text-[10.5px] text-mute2">
          User-curated tags. The LLM picks from your list during article analysis.
        </p>
      </header>

      <form onSubmit={onAdd} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New category name"
          className="flex-1 border border-border bg-paper px-2.5 py-2 text-[13px] text-ink placeholder-mute2 focus:border-ink focus:outline-none"
        />
        <button
          type="submit"
          disabled={isCreating || name.trim() === ''}
          className="border border-ink bg-ink px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-paper disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {error ? <p className="font-mono text-[10.5px] text-critical">{error}</p> : null}

      {isLoading ? (
        <p className="font-mono text-[10.5px] text-muted">Loading…</p>
      ) : data?.categories.length === 0 ? (
        <p className="font-mono text-[10.5px] text-mute2">
          No categories yet. Add one above to start tagging articles.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {data?.categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2.5">
              <span className="text-[13px] text-ink">{c.name}</span>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete category "${c.name}"?`)) deleteCategory(c.id);
                }}
                className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted hover:text-critical"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
