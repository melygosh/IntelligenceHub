import { useState } from 'react';
import {
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
  useGetCategoriesQuery,
} from '../../store/api';
import { SettingsScaffold } from '../../components/settings/SettingsScaffold';
import { DeleteIconButton } from '../../components/settings/DeleteIconButton';
import { LoadingHint } from '../../components/ui/LoadingHint';

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
    <SettingsScaffold
      title="Categories"
      description="User-curated tags. The LLM picks from your list during article analysis."
    >
      <form onSubmit={onAdd} className="space-y-2 border border-border bg-surface p-3">
        <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
          Add category
        </div>
        <div className="flex gap-2">
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
        </div>
        {error ? <p className="font-mono text-[12.5px] text-critical">{error}</p> : null}
      </form>

      {isLoading ? (
        <LoadingHint />
      ) : data?.categories.length === 0 ? (
        <p className="font-mono text-[12.5px] text-mute2">
          No categories yet. Add one above to start tagging articles.
        </p>
      ) : (
        <ul className="space-y-3">
          {data?.categories.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between border border-border bg-surface p-3"
            >
              <span className="font-serif text-[18px] text-ink">{c.name}</span>
              <DeleteIconButton
                label="Delete category"
                onClick={() => {
                  if (confirm(`Delete category "${c.name}"?`)) deleteCategory(c.id);
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </SettingsScaffold>
  );
}
