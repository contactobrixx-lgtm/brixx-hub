import type { EscenaDemo as Escena } from './demo'

/**
 * Panel de la demo "en acción": muestra lo que Jarvis va contando (agenda, análisis, propuesta…)
 * con los mismos datos inventados que dice, así lo que se ve coincide con lo que se oye.
 * Va en el mismo lugar que las pantallas que abre Jarvis en modo tele.
 */
export function EscenaDemo({ escena }: { escena: Escena }) {
  return (
    <div className="absolute inset-x-2 top-24 bottom-44 z-20 flex flex-col overflow-hidden rounded-2xl border border-acento/40 bg-fondo/90 shadow-[0_0_60px_-15px_var(--color-acento)] backdrop-blur animate-aparecer md:inset-x-auto md:top-[12%] md:right-6 md:bottom-[16%] md:w-[min(46%,760px)]">
      <div className="flex items-center gap-2 border-b border-acento/25 px-4 py-3">
        <span className="size-1.5 rounded-full bg-acento shadow-[0_0_8px_var(--color-acento)]" />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold tracking-[0.15em] text-acento-claro uppercase">{escena.titulo}</span>
        <span className="rounded bg-acento-tenue px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-acento-texto uppercase">Demo</span>
      </div>
      <ul className="flex min-h-0 flex-1 flex-col justify-center gap-2.5 overflow-y-auto p-4 md:gap-3 md:p-6">
        {escena.filas.map((f, i) => (
          <li
            key={`${escena.titulo}-${i}`}
            className="flex items-center gap-4 rounded-xl border border-acento/20 bg-elevada/70 px-4 py-3 animate-aparecer md:py-4"
            style={{ animationDelay: `${0.35 + i * 0.45}s` }}
          >
            <span className="tabular min-w-[4.5rem] shrink-0 font-display text-lg leading-tight font-bold whitespace-nowrap text-acento-texto md:min-w-28 md:text-2xl">{f.etiqueta}</span>
            <span className="min-w-0">
              <span className="block font-semibold leading-snug md:text-lg">{f.texto}</span>
              {f.detalle && <span className="block text-sm leading-snug text-tenue">{f.detalle}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
