import { cn } from '../../components/ui/cn'

export type EstadoNucleo = 'inactivo' | 'reposo' | 'escuchando' | 'pensando' | 'hablando'

/** El "núcleo" de Jarvis: anillos animados que cambian con el estado. */
export function Nucleo({ estado, className }: { estado: EstadoNucleo; className?: string }) {
  const rapido = estado === 'pensando'
  const vivo = estado === 'escuchando' || estado === 'hablando'
  return (
    <div className={cn('relative aspect-square w-full max-w-[340px]', className)} aria-hidden>
      {/* Halo */}
      <div
        className={cn(
          'absolute inset-[18%] rounded-full bg-acento/25 blur-3xl transition-opacity duration-700',
          estado === 'inactivo' ? 'opacity-30' : vivo ? 'opacity-100' : 'opacity-60',
        )}
      />
      {/* Anillos */}
      <svg viewBox="0 0 200 200" className="absolute inset-0 size-full">
        <g className={cn('origin-center', rapido ? '[animation-duration:3s]' : '', 'animate-giro')} style={{ transformBox: 'fill-box' }}>
          <circle cx="100" cy="100" r="96" fill="none" stroke="var(--color-acento)" strokeOpacity="0.35" strokeWidth="0.6" strokeDasharray="2 6" />
          <path d="M100 4 A96 96 0 0 1 196 100" fill="none" stroke="var(--color-acento-claro)" strokeOpacity="0.8" strokeWidth="1.2" />
        </g>
        <g className={cn('origin-center animate-giro-inverso', rapido ? '[animation-duration:4s]' : '')} style={{ transformBox: 'fill-box' }}>
          <circle cx="100" cy="100" r="82" fill="none" stroke="var(--color-acento)" strokeOpacity="0.5" strokeWidth="0.8" strokeDasharray="30 12" />
        </g>
        <g className={cn('origin-center animate-giro', rapido ? '[animation-duration:2s]' : '[animation-duration:16s]')} style={{ transformBox: 'fill-box' }}>
          <circle cx="100" cy="100" r="68" fill="none" stroke="var(--color-acento-claro)" strokeOpacity="0.4" strokeWidth="0.6" strokeDasharray="1 3" />
          <path d="M100 32 A68 68 0 0 1 168 100" fill="none" stroke="var(--color-acento)" strokeWidth="2" strokeLinecap="round" />
        </g>
      </svg>
      {/* Esfera central */}
      <div
        className={cn(
          'absolute inset-[27%] grid place-items-center rounded-full border border-acento/50 bg-[radial-gradient(circle_at_35%_30%,var(--color-acento-claro)_0%,var(--color-acento)_35%,var(--color-fondo)_80%)] transition-all duration-500',
          vivo && 'animate-latido',
          estado === 'inactivo' && 'opacity-50 saturate-50',
        )}
        style={{ boxShadow: '0 0 60px -10px var(--color-acento), inset 0 0 40px -10px var(--color-acento-claro)' }}
      >
        <div className="text-center">
          <div className="pl-[0.18em] font-display text-[clamp(18px,2.6vw,24px)] font-bold tracking-[0.18em] text-white">JARVIS</div>
          <div className="mt-0.5 pl-[0.25em] text-[9px] font-semibold tracking-[0.25em] text-acento-claro uppercase">brixx · hub</div>
        </div>
      </div>
    </div>
  )
}

/** Barras de onda de voz (decorativas, se mueven al escuchar o hablar). */
export function Onda({ activa }: { activa: boolean }) {
  return (
    <div className="flex h-6 items-center gap-[3px]" aria-hidden>
      {[0.1, 0.35, 0.2, 0.5, 0.15, 0.4, 0.25, 0.05, 0.3].map((d, i) => (
        <span
          key={i}
          className={cn('block h-full w-[3px] rounded-full bg-acento-claro', activa ? 'animate-onda' : 'scale-y-[0.25] opacity-50')}
          style={{ animationDelay: `${d}s` }}
        />
      ))}
    </div>
  )
}
