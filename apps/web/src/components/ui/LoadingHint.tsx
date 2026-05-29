/**
 * Inline "Loading…" placeholder used by detail pages and side panels while a
 * query is in flight. Mono font, muted color, sized to sit next to body text.
 * Pass a className for container padding when used inside a card or panel.
 */
export function LoadingHint({ className }: { className?: string }) {
  return (
    <p className={'font-mono text-[13px] text-mute2' + (className ? ' ' + className : '')}>
      Loading…
    </p>
  );
}
