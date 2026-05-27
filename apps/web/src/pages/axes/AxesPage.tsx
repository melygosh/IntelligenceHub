import { useState } from 'react';
import {
  useCreateAxisMutation,
  useDeleteAxisMutation,
  useGetAxesQuery,
  useGetCurrentRegenerationQuery,
  useStartRegenerationMutation,
  useUpdateAxisMutation,
} from '../../store/api';
import type { Axis } from '@intelligencehub/shared';

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
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <div className="mb-1.5 font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
          Settings
        </div>
        <h1 className="pretty mb-1 font-serif text-[30px] leading-tight text-ink">
          Categorization axes
        </h1>
        <p className="font-mono text-[12.5px] text-mute2">
          The LLM picks one value per axis per article, or omits the axis if none fit.
        </p>
      </header>

      <form onSubmit={onAddAxis} className="space-y-2 border border-border bg-surface p-3">
        <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
          Add axis
        </div>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Axis name"
            className="flex-1 border border-border bg-paper px-2.5 py-2 text-[15px] text-ink placeholder-mute2 focus:border-ink focus:outline-none"
          />
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="First value"
            className="flex-1 border border-border bg-paper px-2.5 py-2 text-[15px] text-ink placeholder-mute2 focus:border-ink focus:outline-none"
          />
          <button
            type="submit"
            disabled={isCreating || newName.trim() === '' || newValue.trim() === ''}
            className="border border-ink bg-ink px-3 py-1.5 font-mono text-[13px] uppercase tracking-[0.1em] text-paper disabled:opacity-50"
          >
            Add
          </button>
        </div>
        {newError ? <p className="font-mono text-[12.5px] text-critical">{newError}</p> : null}
      </form>

      {isLoading ? (
        <p className="font-mono text-[12.5px] text-muted">Loading…</p>
      ) : (
        <ul className="space-y-3">
          {data?.axes.map((a) => (
            <AxisRow key={a.id} axis={a} />
          ))}
        </ul>
      )}

      <RegenerateButton />
    </div>
  );
}

function AxisRow({ axis }: { axis: Axis }) {
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
        <button
          type="button"
          onClick={() => {
            if (confirm(`Delete axis "${axis.name}" and all its assignments?`))
              deleteAxis(axis.id);
          }}
          className="font-mono text-[12.5px] uppercase tracking-[0.1em] text-muted hover:text-critical"
        >
          Delete axis
        </button>
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
