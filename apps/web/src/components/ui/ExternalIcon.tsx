/** Small "↗" glyph appended to external links (e.g. open-in-new-tab). 12×12 viewBox,
 * thin stroke, inherits `currentColor`. */
export function ExternalIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5">
      <path d="M4 2 H10 V8 M10 2 L3 9" stroke="currentColor" strokeWidth="1.1" fill="none" />
    </svg>
  );
}
