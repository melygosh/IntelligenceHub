import { useState } from 'react';
import {
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
  useGetCategoriesQuery,
} from '../../store/api';
import { SettingsScaffold } from '../../components/settings/SettingsScaffold';
import { DeleteIconButton } from '../../components/settings/DeleteIconButton';
import { EditIconButton } from '../../components/settings/EditIconButton';
import { useConfirm } from '../../components/confirm/useConfirm';
import { LoadingHint } from '../../components/ui/LoadingHint';

export default function CategoriesPage() {
  const { data, isLoading } = useGetCategoriesQuery();
  const [createCategory, { isLoading: isCreating }] = useCreateCategoryMutation();
  const [updateCategory] = useUpdateCategoryMutation();
  const [deleteCategory] = useDeleteCategoryMutation();
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  function startEdit(id: string, current: string) {
    setEditingId(id);
    setDraftName(current);
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraftName('');
    setEditError(null);
  }

  async function onRename(id: string) {
    const trimmed = draftName.trim();
    if (trimmed === '') return;
    try {
      await updateCategory({ id, body: { name: trimmed } }).unwrap();
      cancelEdit();
    } catch (err) {
      const code = (err as { data?: { error?: string } }).data?.error;
      setEditError(code === 'duplicate_name' ? 'Already exists.' : 'Could not rename.');
    }
  }

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
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New category name"
            className="w-full border border-border bg-paper px-2.5 py-2 text-[15px] text-ink placeholder-mute2 focus:border-ink focus:outline-none sm:flex-1"
          />
          <button
            type="submit"
            disabled={isCreating || name.trim() === ''}
            className="w-full border border-ink bg-ink px-3 py-2 font-mono text-[13px] uppercase tracking-[0.1em] text-paper disabled:opacity-50 sm:w-auto sm:py-1.5"
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
          {data?.categories.map((c) =>
            editingId === c.id ? (
              <li key={c.id} className="flex flex-col gap-1 border border-border bg-surface p-3">
                <div className="flex flex-col items-stretch gap-2 sm:flex-row">
                  <input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void onRename(c.id);
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    autoFocus
                    maxLength={64}
                    className="w-full border border-border bg-paper px-2.5 py-2 text-[15px] text-ink focus:border-ink focus:outline-none sm:flex-1"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => void onRename(c.id)}
                      className="flex flex-1 items-center justify-center border border-ink bg-ink px-3 py-2 font-mono text-[13px] uppercase tracking-[0.1em] text-paper sm:flex-none sm:py-0"
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="flex flex-1 items-center justify-center border border-border px-3 py-2 font-mono text-[13px] uppercase tracking-[0.1em] text-muted hover:text-ink sm:flex-none sm:py-0"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
                {editError ? (
                  <p className="font-mono text-[12.5px] text-critical">{editError}</p>
                ) : null}
              </li>
            ) : (
              <li
                key={c.id}
                className="flex items-center justify-between border border-border bg-surface p-3"
              >
                <span className="font-serif text-[18px] text-ink">{c.name}</span>
                <div className="flex items-center gap-3">
                  <EditIconButton label="Rename category" onClick={() => startEdit(c.id, c.name)} />
                  <DeleteIconButton
                    label="Delete category"
                    onClick={async () => {
                      const ok = await confirm({
                        title: 'Delete category',
                        message: `"${c.name}" will be permanently removed from your category list.`,
                        confirmLabel: 'Delete',
                        tone: 'danger',
                      });
                      if (ok) {
                        try {
                          await deleteCategory(c.id).unwrap();
                        } catch {
                          setError('Could not delete category. Try again.');
                        }
                      }
                    }}
                  />
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </SettingsScaffold>
  );
}
