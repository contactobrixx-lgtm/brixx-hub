import { CalendarClock } from 'lucide-react'
import { formatHora, hoyISO, isoLocal } from '../../lib/format'
import { cn } from '../../components/ui/cn'
import type { Evento } from './eventos'

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MAX_VISIBLES = 3

interface Props {
  mes: Date // primer día del mes
  eventos: Evento[]
  onDia: (fecha: string) => void
  onEvento: (e: Evento) => void
}

export function MesGrid({ mes, eventos, onDia, onEvento }: Props) {
  const primero = new Date(mes.getFullYear(), mes.getMonth(), 1)
  const offset = (primero.getDay() + 6) % 7 // lunes = 0
  const inicio = new Date(primero)
  inicio.setDate(1 - offset)
  const ultimo = new Date(mes.getFullYear(), mes.getMonth() + 1, 0)
  const semanas = Math.ceil((offset + ultimo.getDate()) / 7)
  const hoy = hoyISO()

  const porDia = new Map<string, Evento[]>()
  for (const e of eventos) porDia.set(e.fecha, [...(porDia.get(e.fecha) ?? []), e])

  const celdas = Array.from({ length: semanas * 7 }, (_, i) => {
    const d = new Date(inicio)
    d.setDate(inicio.getDate() + i)
    return d
  })

  return (
    <div className="overflow-hidden rounded-2xl border border-borde bg-superficie">
      <div className="grid grid-cols-7 border-b border-borde">
        {DIAS.map((d) => (
          <div key={d} className="px-3 py-2 text-xs font-semibold text-tenue">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {celdas.map((d, i) => {
          const fecha = isoLocal(d)
          const delMes = d.getMonth() === mes.getMonth()
          const lista = porDia.get(fecha) ?? []
          const ocultos = lista.length - MAX_VISIBLES
          return (
            <div
              key={fecha}
              onClick={() => onDia(fecha)}
              className={cn(
                'group min-h-28 cursor-pointer border-borde p-1.5 transition-colors hover:bg-elevada/60',
                i % 7 !== 6 && 'border-r',
                i < celdas.length - 7 && 'border-b',
                !delMes && 'bg-fondo/40',
              )}
            >
              <div className="mb-1 flex items-center justify-between px-1">
                <span
                  className={cn(
                    'tabular grid size-7 place-items-center rounded-full text-sm',
                    fecha === hoy ? 'bg-acento font-semibold text-white' : delMes ? 'text-texto' : 'text-tenue/60',
                  )}
                >
                  {d.getDate()}
                </span>
                <span className="text-xs text-tenue opacity-0 transition-opacity group-hover:opacity-100">+ agendar</span>
              </div>
              <div className="flex flex-col gap-1">
                {lista.slice(0, MAX_VISIBLES).map((e) => (
                  <button
                    key={e.id}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      onEvento(e)
                    }}
                    title={e.titulo}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-1 truncate rounded-md px-1.5 py-1 text-left text-xs font-medium',
                      e.tipo === 'reunion' ? 'bg-acento-tenue text-acento-claro hover:bg-acento/30' : 'bg-elevada text-suave hover:bg-hover',
                    )}
                  >
                    {e.tipo === 'reunion' ? (
                      <span className="tabular shrink-0 font-semibold">{formatHora(e.inicio)}</span>
                    ) : (
                      <CalendarClock className="size-3 shrink-0" />
                    )}
                    <span className="truncate">{e.titulo}</span>
                  </button>
                ))}
                {ocultos > 0 && <span className="px-1.5 text-xs text-tenue">+{ocultos} más</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
