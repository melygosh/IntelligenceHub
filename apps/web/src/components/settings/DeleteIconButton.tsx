/** Small × icon button (critical on hover) used for destructive row actions on
 * the settings pages. The caller owns any confirm() dialog. `label` drives both
 * the tooltip and the accessible name (e.g. "Delete category"). */
export function DeleteIconButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="inline-flex h-6 w-6 items-center justify-center text-mute2 hover:text-critical"
    >
      <svg viewBox="0 0 12 12" className="h-3.5 w-3.5">
        <path
          d="M2.5 2.5 L9.5 9.5 M9.5 2.5 L2.5 9.5"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
