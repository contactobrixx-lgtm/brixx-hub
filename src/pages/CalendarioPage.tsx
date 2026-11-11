import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import type { Reunion } from '../types/db'
import { useReuniones } from '../features/calendario/useReuniones'
import { useMiembros, useProspectos } from '../features/pipeline/useProspectos'
import { armarEventos, type Evento } from '../features/calendario/eventos'
import { MesGrid } from '../features/calendario/MesGrid'
import { Agenda } from '../features/calendario/Agenda'
import { ReunionForm, type BorradorReunion } from '../features/calendario/ReunionForm'
import { useAuth } from '../auth/AuthProvider'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/Button'
import { ErrorBox } from '../components/ui/ErrorBox'
import { PantallaCarga } from '../components/ui/Spinner'
import { MESES, hoyISO } from '../lib/format'

export function CalendarioPage() {
  const { miembro } = useAuth()
  const reuniones = useReuniones()
  const { prospectos } = useProspectos()
  const miembros = useMiembros()

  const [mes, setMes] = useState(() => {
    const h = new Date()
    return new Date(h.getFullYear(), h.getMonth(), 1)
  })
  const [formAbierto, setFormAbierto] = useState(false)
  const [editando, setEditando] = useState<Reunion | null>(null)
  const [borrador, setBorrador] = useState<BorradorReunion | null>(null)

  const eventos = useMemo(() => armarEventos(reuniones.filas, prospectos), [reuniones.filas, prospectos])
  const proximos = useMemo(() => {
    const hoy = hoyISO()
    return eventos.filter((e) => e.fecha >= hoy).slice(0, 12)
  }, [eventos])

  const nueva = (b: BorradorReunion) => {
    setEditando(null)
    setBorrador(b)
    setFormAbierto(true)
  }

  const abrirEvento = (e: Evento) => {
    if (e.tipo === 'reunion') {
      setEditando(e.reunion)
      setBorrador(null)
      setFormAbierto(true)
    } else {
      // Una próxima acción del pipeline → agendarla como reunión
      nueva({ fecha: e.fecha, prospecto_id: e.prospecto.id, titulo: e.titulo })
    }
  }

  const moverMes = (delta: number) => setMes((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1))
  const irAHoy = () => {
    const h = new Date()
    setMes(new Date(h.getFullYear(), h.getMonth(), 1))
  }

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pt-6 pb-16 md:px-10 md:pt-8">
      <PageHeader
        titulo="Calendario"
        subtitulo="Reuniones agendadas y las próximas acciones del pipeline."
        acciones={
          <Button onClick={() => nueva({ fecha: hoyISO() })}>
            <Plus className="size-[18px]" /> Nueva reunión
          </Button>
        }
      />
      {reuniones.error && (
        <div className="mb-4">
          <ErrorBox mensaje={reuniones.error} />
        </div>
      )}

      {reuniones.cargando ? (
        <PantallaCarga />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          {/* Mes (escritorio) */}
          <div className="hidden md:block">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="mr-auto text-[22px] font-bold">
                {MESES[mes.getMonth()].replace(/^./, (c) => c.toUpperCase())} {mes.getFullYear()}
              </h2>
              <Button variant="secundario" size="sm" onClick={irAHoy}>
                Hoy
              </Button>
              <Button variant="secundario" size="icono" onClick={() => moverMes(-1)} aria-label="Mes anterior">
                <ChevronLeft className="size-[18px]" />
              </Button>
              <Button variant="secundario" size="icono" onClick={() => moverMes(1)} aria-label="Mes siguiente">
                <ChevronRight className="size-[18px]" />
              </Button>
            </div>
            <MesGrid mes={mes} eventos={eventos} onDia={(fecha) => nueva({ fecha })} onEvento={abrirEvento} />
            <div className="mt-3 flex gap-4 text-[13px] text-tenue">
              <span className="flex items-center gap-1.5">
                <i className="size-2.5 rounded-sm bg-acento" /> Reunión
              </span>
              <span className="flex items-center gap-1.5">
                <i className="size-2.5 rounded-sm bg-borde-fuerte" /> Próxima acción del pipeline (tocala para agendarla)
              </span>
            </div>
          </div>

          {/* Próximos (lateral en escritorio, principal en celular) */}
          <aside className="rounded-2xl border border-borde bg-superficie p-4 md:p-5">
            <h2 className="mb-4 text-[19px] font-bold">Próximos</h2>
            <Agenda eventos={proximos} onEvento={abrirEvento} vacio="No hay reuniones próximas." />
          </aside>
        </div>
      )}

      <ReunionForm
        abierto={formAbierto}
        reunion={editando}
        borrador={borrador}
        prospectos={prospectos}
        miembros={miembros}
        emailActual={miembro?.email ?? ''}
        onCerrar={() => setFormAbierto(false)}
        onGuardar={reuniones.guardar}
        onEliminar={reuniones.eliminar}
      />
    </div>
  )
}
