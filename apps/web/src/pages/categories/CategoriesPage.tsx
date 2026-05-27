import { useState } from 'react';
import {
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
  useGetCategoriesQuery,
  useGetCurrentRegenerationQuery,
  useStartRegenerationMutation,
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
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <div className="mb-1.5 font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
          Settings
        </div>
        <h1 className="pretty mb-1 font-serif text-[30px] leading-tight text-ink">Categories</h1>
        <p className="font-mono text-[12.5px] text-mute2">
          User-curated tags. The LLM picks from your list during article analysis.
        </p>
      </header>

      <form onSubmit={onAdd} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New category name"
          className="flex-1 border border-border bg-paper px-2.5 py-2 text-[15px] text-ink placeholder-mute2 focus:border-ink focus:outline-none"
        />
        <button
          type="submit"
          disabled={isCreating || name.trim() === ''}
          className="border border-ink bg-ink px-3 py-1.5 font-mono text-[13px] uppercase tracking-[0.1em] text-paper disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {error ? <p className="font-mono text-[12.5px] text-critical">{error}</p> : null}

      {isLoading ? (
        <p className="font-mono text-[12.5px] text-muted">Loading…</p>
      ) : data?.categories.length === 0 ? (
        <p className="font-mono text-[12.5px] text-mute2">
          No categories yet. Add one above to start tagging articles.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {data?.categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2.5">
              <span className="text-[15px] text-ink">{c.name}</span>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete category "${c.name}"?`)) deleteCategory(c.id);
                }}
                className="font-mono text-[12.5px] uppercase tracking-[0.1em] text-muted hover:text-critical"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <hr className="border-border" />
      <RegenerateButton />
    </div>
  );
}

function RegenerateButton() {
  const { data: run } = useGetCurrentRegenerationQuery();
  const [startRegen, { isLoading }] = useStartRegenerationMutation();
  const [message, setMessage] = useState<string | null>(null);

  const isRunning = run?.status === 'running';

  async function onClick() {
    setMessage(null);
    try {
      const result = await startRegen().unwrap();
      if (result.eligibleArticles === 0) {
        setMessage('Nothing to regenerate — all articles already match your current config.');
      } else {
        setMessage(`Regeneration started — ${result.eligibleArticles} articles will be re-tagged.`);
      }
    } catch (err) {
      const code = (err as { data?: { error?: string } }).data?.error;
      if (code === 'already_running') {
        setMessage('A regeneration is already in progress.');
      } else {
        setMessage('Could not start regeneration. Try again in a moment.');
      }
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={isLoading || isRunning}
        className="border border-ink bg-ink px-3 py-1.5 font-mono text-[13px] uppercase tracking-[0.1em] text-paper disabled:opacity-50"
      >
        {isRunning
          ? 'Regeneration in progress…'
          : isLoading
            ? 'Starting…'
            : 'Regenerate articles'}
      </button>
      <p className="font-mono text-[12.5px] text-mute2">
        Re-tags every article processed under your previous config. Uses cached LLM responses where the article markup didn't change.
      </p>
      {message ? (
        <p className="font-mono text-[12.5px] text-muted">{message}</p>
      ) : null}
    </div>
  );
}
