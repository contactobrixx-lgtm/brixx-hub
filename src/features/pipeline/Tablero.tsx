import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { Plus } from 'lucide-react'
import { ETAPAS, type Etapa, type Miembro, type Moneda, type Prospecto } from '../../types/db'
import { ETAPA_LABEL, formatMonto } from '../../lib/format'
import { cn } from '../../components/ui/cn'
import { ProspectoCard } from './ProspectoCard'
import { ESTILO_ETAPA } from './etapas'


const COL = 'col:'
const CARD = 'card:'

interface Props {
  prospectos: Prospecto[]
  miembros: Miembro[]
  onMover: (id: string, etapa: Etapa, orden: number) => void
  onAbrir: (p: Prospecto) => void
  onNuevo: (etapa: Etapa) => void
}

// Primero lo que está bajo el puntero; si no hay nada, por superposición.
const colisiones: CollisionDetection = (args) => {
  const bajoPuntero = pointerWithin(args)
  return bajoPuntero.length > 0 ? bajoPuntero : rectIntersection(args)
}

export function Tablero({ prospectos, miembros, onMover, onAbrir, onNuevo }: Props) {
  const [activo, setActivo] = useState<Prospecto | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  )

  const porEtapa = (etapa: Etapa) => prospectos.filter((p) => p.etapa === etapa)

  const onDragStart = (e: DragStartEvent) => {
    setActivo(prospectos.find((p) => p.id === e.active.id) ?? null)
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActivo(null)
    if (!over) return
    const id = String(active.id)
    const overId = String(over.id)
    const actual = prospectos.find((p) => p.id === id)
    if (!actual) return

    let etapa: Etapa
    let orden: number

    if (overId.startsWith(COL)) {
      // Soltó sobre el espacio libre de una columna → al final
      etapa = overId.slice(COL.length) as Etapa
      if (etapa === actual.etapa) return
      const resto = porEtapa(etapa)
      orden = (resto.at(-1)?.orden ?? 0) + 1
    } else {
      const destinoId = overId.slice(CARD.length)
      if (destinoId === id) return
      const destino = prospectos.find((p) => p.id === destinoId)
      if (!destino) return
      etapa = destino.etapa
      const resto = porEtapa(etapa).filter((p) => p.id !== id)
      const i = resto.findIndex((p) => p.id === destinoId)
      // ¿Quedó por debajo de la mitad de la tarjeta destino? → va después
      const centroActivo = active.rect.current.translated
        ? active.rect.current.translated.top + active.rect.current.translated.height / 2
        : 0
      const despues = centroActivo > over.rect.top + over.rect.height / 2
      const antes = despues ? resto[i] : resto[i - 1]
      const siguiente = despues ? resto[i + 1] : resto[i]
      if (antes && siguiente) orden = (antes.orden + siguiente.orden) / 2
      else if (antes) orden = antes.orden + 1
      else orden = (siguiente?.orden ?? 1) - 1
    }

    onMover(id, etapa, orden)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={colisiones}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActivo(null)}
    >
      <div className="flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-6 md:snap-none md:px-10">
        {ETAPAS.map((etapa) => (
          <Columna
            key={etapa}
            etapa={etapa}
            items={porEtapa(etapa)}
            miembros={miembros}
            onAbrir={onAbrir}
            onNuevo={() => onNuevo(etapa)}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'ease-out' }}>
        {activo && (
          <ProspectoCard prospecto={activo} miembros={miembros} tieneDemo={!!activo.ficha_demo_id} overlay />
        )}
      </DragOverlay>
    </DndContext>
  )
}

function totales(items: Prospecto[]) {
  const suma: Partial<Record<Moneda, number>> = {}
  for (const p of items) if (p.valor_estimado != null) suma[p.moneda] = (suma[p.moneda] ?? 0) + Number(p.valor_estimado)
  return Object.entries(suma).map(([m, v]) => formatMonto(v, m as Moneda))
}

interface ColumnaProps {
  etapa: Etapa
  items: Prospecto[]
  miembros: Miembro[]
  onAbrir: (p: Prospecto) => void
  onNuevo: () => void
}

function Columna({ etapa, items, miembros, onAbrir, onNuevo }: ColumnaProps) {
  const { setNodeRef, isOver } = useDroppable({ id: COL + etapa })
  const montos = totales(items)

  return (
    <section
      className={cn(
        'flex w-[85vw] max-w-[300px] shrink-0 snap-center flex-col rounded-2xl border bg-superficie transition-colors sm:w-[280px]',
        isOver ? 'border-acento' : 'border-borde',
      )}
    >
      <header className="flex items-center gap-2 px-4 pt-4 pb-1">
        <span className={cn('size-2 rounded-full', ESTILO_ETAPA[etapa].punto)} />
        <h2 className="text-base font-bold">{ETAPA_LABEL[etapa]}</h2>
        <span className="tabular text-sm text-tenue">{items.length}</span>
        <button
          onClick={onNuevo}
          className="ml-auto grid size-8 cursor-pointer place-items-center rounded-lg text-tenue hover:bg-elevada hover:text-texto"
          aria-label={`Agregar prospecto en ${ETAPA_LABEL[etapa]}`}
        >
          <Plus className="size-4" />
        </button>
      </header>
      <div className="tabular min-h-5 px-4 pb-3 text-[13px] text-tenue">{montos.join(' · ')}</div>
      <div ref={setNodeRef} className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3">
        {items.map((p) => (
          <TarjetaArrastrable
            key={p.id}
            prospecto={p}
            miembros={miembros}
            tieneDemo={!!p.ficha_demo_id}
            onAbrir={() => onAbrir(p)}
          />
        ))}
      </div>
    </section>
  )
}

function TarjetaArrastrable({
  prospecto,
  miembros,
  tieneDemo,
  onAbrir,
}: {
  prospecto: Prospecto
  miembros: Miembro[]
  tieneDemo: boolean
  onAbrir: () => void
}) {
  const drag = useDraggable({ id: prospecto.id })
  const drop = useDroppable({ id: CARD + prospecto.id })

  return (
    <div
      ref={(el) => {
        drag.setNodeRef(el)
        drop.setNodeRef(el)
      }}
      {...drag.attributes}
      {...drag.listeners}
      onClick={onAbrir}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onAbrir()
        else drag.listeners?.onKeyDown?.(e)
      }}
      className={cn(
        'cursor-grab touch-manipulation rounded-xl outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-acento',
        drop.isOver && !drag.isDragging && 'ring-1 ring-acento',
      )}
    >
      <ProspectoCard prospecto={prospecto} miembros={miembros} tieneDemo={tieneDemo} arrastrando={drag.isDragging} />
    </div>
  )
}
