import { CalendarClock, Presentation } from 'lucide-react'
import type { Miembro, Prospecto } from '../../types/db'
import { formatFecha, formatMonto, hoyISO, iniciales } from '../../lib/format'
import { cn } from '../../components/ui/cn'

interface Props {
  prospecto: Prospecto
  miembros: Miembro[]
  tieneDemo: boolean
  arrastrando?: boolean
  overlay?: boolean
}

export function ProspectoCard({ prospecto: p, miembros, tieneDemo, arrastrando, overlay }: Props) {
  const responsable = miembros.find((m) => m.email.toLowerCase() === p.responsable?.toLowerCase())
  const abierto = p.etapa !== 'perdido'
  const vencida = abierto && !!p.fecha_proxima_accion && p.fecha_proxima_accion < hoyISO()
  const esHoy = abierto && p.fecha_proxima_accion === hoyISO()

  return (
    <div
      className={cn(
        'rounded-xl border border-transparent bg-elevada p-3 text-left transition-[border-color,opacity]',
        'hover:border-borde-fuerte',
        arrastrando && 'opacity-30',
        overlay && 'rotate-[1.5deg] border-acento shadow-2xl',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">{p.empresa || p.nombre}</div>
          {p.empresa && <div className="truncate text-[13px] text-tenue">{p.nombre}</div>}
        </div>
        {responsable && (
          <div
            className="grid size-7 shrink-0 place-items-center rounded-full bg-acento-tenue text-[11px] font-semibold text-acento-texto"
            title={responsable.nombre}
          >
            {iniciales(responsable.nombre)}
          </div>
        )}
      </div>

      {(p.valor_estimado != null || p.rubro || tieneDemo) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          {p.valor_estimado != null && (
            <span className="tabular font-semibold text-texto">{formatMonto(p.valor_estimado, p.moneda)}</span>
          )}
          {p.rubro && <span className="text-tenue">{p.rubro}</span>}
          {tieneDemo && <Presentation className="size-3.5 text-acento-texto" aria-label="Tiene demo vinculada" />}
        </div>
      )}

      {abierto && p.proxima_accion && (
        <div
          className={cn(
            'mt-2.5 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium',
            vencida ? 'bg-peligro-tenue text-peligro' : esHoy ? 'bg-aviso-tenue text-aviso' : 'bg-superficie text-suave',
          )}
        >
          <CalendarClock className="size-3 shrink-0" />
          <span className="truncate">{p.proxima_accion}</span>
          {p.fecha_proxima_accion && (
            <span className="ml-auto shrink-0">{esHoy ? 'hoy' : formatFecha(p.fecha_proxima_accion)}</span>
          )}
        </div>
      )}

      {p.etapa === 'perdido' && p.motivo_perdida && (
        <div className="mt-2 truncate text-xs text-tenue">✕ {p.motivo_perdida}</div>
      )}
    </div>
  )
}
