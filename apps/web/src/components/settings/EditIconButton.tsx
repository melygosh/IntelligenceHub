/** Small pencil icon button used to start an inline edit (e.g. rename) on the
 * settings pages. Mirrors DeleteIconButton's sizing/hover convention. `label`
 * drives both the tooltip and the accessible name (e.g. "Rename category"). */
export function EditIconButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="inline-flex h-6 w-6 items-center justify-center text-mute2 hover:text-ink"
    >
      <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" fill="none">
        <path
          d="M8.2 1.6 L10.4 3.8 L4.3 9.9 L1.6 10.4 L2.1 7.7 Z"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
        <path d="M7.1 2.7 L9.3 4.9" stroke="currentColor" strokeWidth="1.1" />
      </svg>
    </button>
  );
}
