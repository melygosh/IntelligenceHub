/** The product mark — three nodes joined into a triangle (a tiny knowledge
 * graph). Inherits color via currentColor. Same shape as the favicon. */
export function Logo({ size = 16, className = 'text-ink' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={className} aria-hidden="true">
      <circle cx="3" cy="3.5" r="2" fill="currentColor" />
      <circle cx="13" cy="3.5" r="1.3" fill="currentColor" />
      <circle cx="8" cy="12.5" r="1.5" fill="currentColor" />
      <path
        d="M3 3.5 L8 12.5 M13 3.5 L8 12.5 M3 3.5 L13 3.5"
        stroke="currentColor"
        strokeWidth="0.7"
        fill="none"
        opacity="0.6"
      />
    </svg>
  );
}

/** Logo + "news intelligence" wordmark, used in the sidebar and auth pages. */
export function Brand({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const lg = size === 'lg';
  return (
    <div className="flex items-center gap-2.5 text-ink">
      <Logo size={lg ? 22 : 16} />
      <span className={`font-mono tracking-[0.02em] ${lg ? 'text-[14px]' : 'text-[13px]'}`}>
        news intelligence
      </span>
    </div>
  );
}
