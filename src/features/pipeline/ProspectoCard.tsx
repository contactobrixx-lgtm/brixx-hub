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
  const abierto = p.etapa !== 'cerrado' && p.etapa !== 'perdido'
  const vencida = abierto && !!p.fecha_proxima_accion && p.fecha_proxima_accion < hoyISO()
  const esHoy = abierto && p.fecha_proxima_accion === hoyISO()

  return (
    <div
      className={cn(
        'rounded-xl border border-borde bg-elevada p-3 text-left transition-[border-color,opacity,box-shadow]',
        'hover:border-borde-fuerte',
        arrastrando && 'opacity-30',
        overlay && 'rotate-[1.5deg] border-acento/40 shadow-[0_20px_40px_-12px_rgb(0_0_0/0.9)]',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{p.empresa || p.nombre}</div>
          {p.empresa && <div className="truncate text-xs text-tenue">{p.nombre}</div>}
        </div>
        {responsable && (
          <div
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-acento-tenue text-[10px] font-semibold text-acento"
            title={responsable.nombre}
          >
            {iniciales(responsable.nombre)}
          </div>
        )}
      </div>

      {(p.valor_estimado != null || p.rubro || tieneDemo) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {p.valor_estimado != null && (
            <span className="font-medium text-texto">{formatMonto(p.valor_estimado, p.moneda)}</span>
          )}
          {p.rubro && <span className="text-tenue">{p.rubro}</span>}
          {tieneDemo && <Presentation className="size-3.5 text-acento" aria-label="Tiene demo vinculada" />}
        </div>
      )}

      {abierto && p.proxima_accion && (
        <div
          className={cn(
            'mt-2.5 flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px]',
            vencida ? 'bg-peligro/10 text-peligro' : esHoy ? 'bg-aviso/10 text-aviso' : 'bg-fondo text-suave',
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
        <div className="mt-2 truncate text-[11px] text-tenue">✕ {p.motivo_perdida}</div>
      )}
    </div>
  )
}
