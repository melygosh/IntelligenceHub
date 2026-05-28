import { useEffect, useRef, useState } from 'react';
import { useSlashToFocus } from './useSlashToFocus';

/** Debounced search box (250ms) with a "/" focus shortcut and kbd hint. The
 * value is parent/URL-driven; local state mirrors it for snappy typing and
 * re-syncs when the prop changes from outside. */
export function SearchInput({
  value,
  onChange,
  placeholder = 'search…',
  widthClass = 'md:w-[300px]',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  widthClass?: string;
}) {
  const [local, setLocal] = useState(value);
  // Adjust state during render when the prop changes from outside (React's
  // documented pattern, not an effect).
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setLocal(value);
  }
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      if (local !== value) onChange(local);
    }, 250);
    return () => clearTimeout(t);
  }, [local, value, onChange]);
  useSlashToFocus(inputRef);

  return (
    <div
      className={`flex w-full items-center gap-2 border border-border bg-paper2 px-2.5 py-1.5 ${widthClass}`}
    >
      <svg viewBox="0 0 12 12" className="h-3.5 w-3.5 shrink-0 text-muted">
        <circle cx="5" cy="5" r="3.2" stroke="currentColor" strokeWidth="1.1" fill="none" />
        <path d="M7.5 7.5 L10 10" stroke="currentColor" strokeWidth="1.1" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent font-mono text-[13.5px] text-ink outline-none placeholder:text-mute2"
      />
      <kbd className="border border-border bg-paper px-1 font-mono text-[11.5px] text-mute2">/</kbd>
    </div>
  );
}
