import { useState } from 'react';
import {
  useCreateAxisMutation,
  useDeleteAxisMutation,
  useGetAxesQuery,
  useUpdateAxisMutation,
} from '../../store/api';
import type { Axis } from '@intelligencehub/shared';
import { SettingsScaffold } from '../../components/settings/SettingsScaffold';
import { DeleteIconButton } from '../../components/settings/DeleteIconButton';
import { useConfirm } from '../../components/confirm/useConfirm';
import { LoadingHint } from '../../components/ui/LoadingHint';

export default function AxesPage() {
  const { data, isLoading } = useGetAxesQuery();
  const [createAxis, { isLoading: isCreating }] = useCreateAxisMutation();
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newError, setNewError] = useState<string | null>(null);

  async function onAddAxis(e: React.FormEvent) {
    e.preventDefault();
    setNewError(null);
    const name = newName.trim();
    const value = newValue.trim();
    if (name === '' || value === '') return;
    try {
      await createAxis({ name, values: [value] }).unwrap();
      setNewName('');
      setNewValue('');
    } catch (err) {
      const code = (err as { data?: { error?: string } }).data?.error;
      if (code === 'duplicate_name') setNewError('Axis name already exists.');
      else if (code === 'too_many_axes') setNewError('Limit reached (max 10 axes).');
      else setNewError('Could not add axis. Try again.');
    }
  }

  return (
    <SettingsScaffold
      title="Categorization axes"
      description="The LLM picks one value per axis per article, or omits the axis if none fit."
    >
      <form onSubmit={onAddAxis} className="space-y-2 border border-border bg-surface p-3">
        <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">Add axis</div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Axis name"
            className="w-full border border-border bg-paper px-2.5 py-2 text-[15px] text-ink placeholder-mute2 focus:border-ink focus:outline-none sm:flex-1"
          />
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="First value"
            className="w-full border border-border bg-paper px-2.5 py-2 text-[15px] text-ink placeholder-mute2 focus:border-ink focus:outline-none sm:flex-1"
          />
          <button
            type="submit"
            disabled={isCreating || newName.trim() === '' || newValue.trim() === ''}
            className="w-full border border-ink bg-ink px-3 py-2 font-mono text-[13px] uppercase tracking-[0.1em] text-paper disabled:opacity-50 sm:w-auto sm:py-1.5"
          >
            Add
          </button>
        </div>
        {newError ? <p className="font-mono text-[12.5px] text-critical">{newError}</p> : null}
      </form>

      {isLoading ? (
        <LoadingHint />
      ) : (
        <ul className="space-y-3">
          {data?.axes.map((a) => (
            <AxisRow key={a.id} axis={a} />
          ))}
        </ul>
      )}
    </SettingsScaffold>
  );
}

function AxisRow({ axis }: { axis: Axis }) {
  const confirm = useConfirm();
  const [updateAxis] = useUpdateAxisMutation();
  const [deleteAxis] = useDeleteAxisMutation();
  const [addValue, setAddValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onAddValue() {
    setError(null);
    const v = addValue.trim();
    if (v === '') return;
    const newValues = [...axis.values.map((x) => x.value), v];
    try {
      await updateAxis({ id: axis.id, patch: { values: newValues } }).unwrap();
      setAddValue('');
    } catch (err) {
      const code = (err as { data?: { error?: string } }).data?.error;
      if (code === 'too_many_values') setError('Limit reached (max 20 values).');
      else setError('Could not add value.');
    }
  }

  async function onRemoveValue(value: string) {
    setError(null);
    const newValues = axis.values.filter((x) => x.value !== value).map((x) => x.value);
    if (newValues.length === 0) {
      setError('Axis must keep at least one value. Delete the axis instead.');
      return;
    }
    const ok = await confirm({
      title: 'Remove value',
      message: `Remove "${value}" from "${axis.name}"? Article assignments to it will be cleared on the next regeneration.`,
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await updateAxis({ id: axis.id, patch: { values: newValues } }).unwrap();
    } catch {
      setError('Could not remove value.');
    }
  }

  return (
    <li className="border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-serif text-[18px] text-ink">{axis.name}</span>
        <DeleteIconButton
          label="Delete axis"
          onClick={async () => {
            const ok = await confirm({
              title: 'Delete axis',
              message: `"${axis.name}" and all its assignments will be permanently removed.`,
              confirmLabel: 'Delete',
              tone: 'danger',
            });
            if (ok) {
              try {
                await deleteAxis(axis.id).unwrap();
              } catch {
                setError('Could not delete axis. Try again.');
              }
            }
          }}
        />
      </div>
      <ul className="mb-2 flex flex-wrap gap-1.5">
        {axis.values.map((v) => (
          <li
            key={v.id}
            className="inline-flex items-center gap-1.5 border border-border bg-paper px-1.5 py-0.5 font-mono text-[12.5px] text-ink"
          >
            <span>{v.value}</span>
            <button
              type="button"
              onClick={() => onRemoveValue(v.value)}
              className="text-mute2 hover:text-critical"
              aria-label={`Remove ${v.value}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-1.5">
        <input
          value={addValue}
          onChange={(e) => setAddValue(e.target.value)}
          placeholder="Add value"
          className="flex-1 border border-border bg-paper px-2.5 py-1.5 text-[14px] text-ink placeholder-mute2 focus:border-ink focus:outline-none"
        />
        <button
          type="button"
          onClick={onAddValue}
          disabled={addValue.trim() === ''}
          className="border border-border bg-paper px-3 py-1.5 font-mono text-[12.5px] uppercase tracking-[0.1em] text-muted hover:text-ink disabled:opacity-50"
        >
          Add value
        </button>
      </div>
      {error ? <p className="mt-1.5 font-mono text-[12.5px] text-critical">{error}</p> : null}
    </li>
  );
}
