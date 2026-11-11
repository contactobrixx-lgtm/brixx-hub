/** Isotipo de brixx: tres bloques (blanco, azul, lavanda). */
export function LogoMark({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 176 168" className={className} aria-hidden>
      <rect x="97" y="0" width="79" height="74" rx="17" fill="#fff" />
      <rect x="0" y="90" width="79" height="78" rx="17" fill="var(--color-acento)" />
      <rect x="97" y="90" width="79" height="78" rx="17" fill="var(--color-acento-claro)" />
    </svg>
  )
}

export function Logo({ className = '', subtitulo = true }: { className?: string; subtitulo?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="grid size-[34px] shrink-0 place-items-center rounded-[9px] bg-black ring-1 ring-borde">
        <LogoMark className="size-[18px]" />
      </div>
      <div className="leading-tight">
        <b className="block text-lg font-bold tracking-tight">brixx</b>
        {subtitulo && <span className="block text-xs text-tenue">Hub interno</span>}
      </div>
    </div>
  )
}
