import type { ReactNode } from 'react'
import { cn } from './cn'

type Tono = 'neutro' | 'acento' | 'ok' | 'aviso' | 'peligro' | 'violeta'

const TONOS: Record<Tono, string> = {
  neutro: 'bg-elevada text-suave',
  acento: 'bg-acento-tenue text-acento-texto',
  ok: 'bg-ok-tenue text-ok',
  aviso: 'bg-aviso-tenue text-aviso',
  peligro: 'bg-peligro-tenue text-peligro',
  violeta: 'bg-violeta-tenue text-violeta',
}

export function Badge({ tono = 'neutro', children, className }: { tono?: Tono; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-[9px] py-[3px] text-xs font-semibold',
        TONOS[tono],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Filtro tipo pastilla (activo = invertido). */
export function Chip({
  activo,
  onClick,
  children,
  cantidad,
}: {
  activo: boolean
  onClick: () => void
  children: ReactNode
  cantidad?: number
}) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-[13px] text-sm font-medium transition-colors',
        activo ? 'border-texto bg-texto text-fondo' : 'border-borde-fuerte text-suave hover:border-tenue',
      )}
    >
      {children}
      {cantidad != null && <span className="tabular opacity-70">{cantidad}</span>}
    </button>
  )
}

/** Control segmentado (activo = invertido). */
export function Segmentado<T extends string>({
  opciones,
  valor,
  onChange,
}: {
  opciones: { valor: T; label: string }[]
  valor: T
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex gap-0.5 rounded-[11px] border border-borde-fuerte bg-superficie p-[3px]">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={valor === o.valor}
          onClick={() => onChange(o.valor)}
          className={cn(
            'min-h-9 flex-1 cursor-pointer whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors',
            valor === o.valor ? 'bg-texto text-fondo' : 'text-suave hover:text-texto',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
