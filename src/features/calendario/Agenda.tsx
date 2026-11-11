import { CalendarClock, MapPin, Video } from 'lucide-react'
import { formatHora, hoyISO } from '../../lib/format'
import { cn } from '../../components/ui/cn'
import { esLink, nombreProspecto, type Evento } from './eventos'

function etiquetaDia(fecha: string) {
  const hoy = hoyISO()
  const manana = new Date()
  manana.setDate(manana.getDate() + 1)
  if (fecha === hoy) return 'Hoy'
  const [y, m, d] = fecha.split('-').map(Number)
  const dia = new Date(y, m - 1, d)
  const txt = dia.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  if (manana.toDateString() === dia.toDateString()) return `Mañana · ${txt}`
  return txt.charAt(0).toUpperCase() + txt.slice(1)
}

interface Props {
  eventos: Evento[]
  onEvento: (e: Evento) => void
  vacio?: string
  compacta?: boolean
}

/** Lista de eventos agrupados por día. */
export function Agenda({ eventos, onEvento, vacio = 'No hay nada agendado.', compacta }: Props) {
  if (eventos.length === 0) return <p className="py-6 text-center text-tenue">{vacio}</p>
  const dias = new Map<string, Evento[]>()
  for (const e of eventos) dias.set(e.fecha, [...(dias.get(e.fecha) ?? []), e])

  return (
    <div className="flex flex-col gap-5">
      {[...dias.entries()].map(([fecha, lista]) => (
        <section key={fecha}>
          <h3 className={cn('mb-2 font-sans text-sm font-semibold', fecha === hoyISO() ? 'text-acento-texto' : 'text-tenue')}>
            {etiquetaDia(fecha)}
          </h3>
          <ul className="flex flex-col gap-1.5">
            {lista.map((e) => (
              <li key={e.id}>
                <button
                  onClick={() => onEvento(e)}
                  className="flex w-full cursor-pointer items-start gap-3 rounded-[10px] bg-elevada px-3 py-2.5 text-left transition-colors hover:bg-hover"
                >
                  {e.tipo === 'reunion' ? (
                    <span className="tabular w-12 shrink-0 pt-px text-sm font-semibold text-acento-texto">{formatHora(e.inicio)}</span>
                  ) : (
                    <CalendarClock className="mt-0.5 size-4 w-12 shrink-0 text-tenue" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{e.titulo}</span>
                    {!compacta && (
                      <span className="block truncate text-[13px] text-tenue">
                        {e.tipo === 'accion'
                          ? `Próxima acción · ${nombreProspecto(e.prospecto)}`
                          : [nombreProspecto(e.prospecto), `${e.reunion.duracion_min} min`].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                  {e.tipo === 'reunion' && e.reunion.lugar_o_link && (
                    esLink(e.reunion.lugar_o_link) ? (
                      <a
                        href={e.reunion.lugar_o_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(ev) => ev.stopPropagation()}
                        className="flex shrink-0 items-center gap-1 rounded-lg bg-acento px-2.5 py-1 text-xs font-semibold text-white hover:bg-acento-fuerte"
                      >
                        <Video className="size-3.5" /> Unirse
                      </a>
                    ) : (
                      <MapPin className="mt-0.5 size-4 shrink-0 text-tenue" aria-label={e.reunion.lugar_o_link} />
                    )
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
