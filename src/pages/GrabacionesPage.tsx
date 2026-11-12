import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Mic } from 'lucide-react'
import { useConfigGrabaciones, useGrabaciones } from '../features/grabaciones/useGrabaciones'
import { ESTADO_GRABACION } from '../features/grabaciones/estados'
import { AvisoConfig } from '../features/grabaciones/AvisoConfig'
import { useProspectos } from '../features/pipeline/useProspectos'
import { PageHeader } from '../components/layout/PageHeader'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorBox } from '../components/ui/ErrorBox'
import { PantallaCarga } from '../components/ui/Spinner'
import { formatDuracion, formatHora } from '../lib/format'

function BotonGrabar() {
  return (
    <Link
      to="/grabar"
      className="inline-flex min-h-11 items-center gap-2 rounded-[11px] border border-acento bg-acento px-[18px] text-[15px] font-semibold text-white hover:bg-acento-fuerte"
    >
      <Mic className="size-[18px]" /> Grabar
    </Link>
  )
}

export function GrabacionesPage() {
  const { filas, cargando, error } = useGrabaciones()
  const config = useConfigGrabaciones()
  const { prospectos } = useProspectos()
  const porId = useMemo(() => new Map(prospectos.map((p) => [p.id, p])), [prospectos])

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pt-6 pb-16 md:px-10 md:pt-8">
      <PageHeader
        titulo="Grabaciones"
        subtitulo="Reuniones grabadas con el celular: transcripción, lo más importante y una propuesta de trabajo."
        acciones={<BotonGrabar />}
      />
      <AvisoConfig config={config} />
      {error && <ErrorBox mensaje={error} />}

      {cargando ? (
        <PantallaCarga />
      ) : filas.length === 0 ? (
        <EmptyState
          titulo="Todavía no hay grabaciones"
          texto="En la próxima reunión, tocá Grabar y dejá el celular sobre la mesa con la pantalla prendida."
          accion={<BotonGrabar />}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-borde bg-superficie">
          {filas.map((g, i) => {
            const p = g.prospecto_id ? porId.get(g.prospecto_id) : undefined
            const e = ESTADO_GRABACION[g.estado]
            const fecha = new Date(g.created_at)
            return (
              <Link
                key={g.id}
                to={`/grabaciones/${g.id}`}
                className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3.5 transition-colors hover:bg-elevada md:px-5 ${i ? 'border-t border-borde' : ''}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{g.titulo}</span>
                  <span className="block truncate text-[13px] text-tenue">
                    {fecha.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} {formatHora(fecha)}
                    {g.duracion_seg ? ` · ${formatDuracion(g.duracion_seg)}` : ''}
                    {p ? ` · ${p.empresa || p.nombre}` : ''}
                  </span>
                  {g.analisis?.resumen && <span className="mt-1 line-clamp-2 block text-sm text-suave">{g.analisis.resumen}</span>}
                </span>
                <Badge tono={e.tono}>{e.label}</Badge>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
