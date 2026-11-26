import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FolderOpen, Plus, Search, Sparkles } from 'lucide-react'
import { ETAPAS_ABIERTAS, ETAPAS_GANADAS, type Prospecto } from '../types/db'
import { useAuth } from '../auth/AuthProvider'
import { useMiembros, useProspectos } from '../features/pipeline/useProspectos'
import { ProspectoForm } from '../features/pipeline/ProspectoForm'
import { useDemosParaSelector } from '../features/fichas/useFichas'
import { ESTILO_ETAPA } from '../features/pipeline/etapas'
import { useGrabaciones } from '../features/grabaciones/useGrabaciones'
import { IntervencionForm } from '../features/grabaciones/IntervencionForm'
import { lineaDeAnalisis } from '../features/grabaciones/estados'
import { useHistoriaClientes, type ItemHistoria } from '../features/clientes/useClientes'
import { LinksCliente } from '../features/clientes/LinksCliente'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/Button'
import { Chip } from '../components/ui/Badge'
import { Input } from '../components/ui/Field'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorBox } from '../components/ui/ErrorBox'
import { PantallaCarga } from '../components/ui/Spinner'
import { ETAPA_LABEL } from '../lib/format'

type Filtro = 'todos' | 'potenciales' | 'clientes' | 'perdidos'

const FILTROS: { valor: Filtro; label: string; incluye: (p: Prospecto) => boolean }[] = [
  { valor: 'todos', label: 'Todos', incluye: () => true },
  { valor: 'potenciales', label: 'Potenciales', incluye: (p) => ETAPAS_ABIERTAS.includes(p.etapa) },
  { valor: 'clientes', label: 'Clientes', incluye: (p) => ETAPAS_GANADAS.includes(p.etapa) },
  { valor: 'perdidos', label: 'Perdidos', incluye: (p) => p.etapa === 'perdido' },
]

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function TarjetaCliente({ p, historia }: { p: Prospecto; historia: ItemHistoria[] }) {
  const estilo = ESTILO_ETAPA[p.etapa]
  const ultima = historia[0]
  const objetivo = p.sintesis?.objetivos?.[0] ?? (ultima ? lineaDeAnalisis(ultima.analisis) : null)
  const datos = [p.rubro, p.industria].filter(Boolean).join(' · ')
  return (
    <article className="relative flex flex-col rounded-2xl border border-borde bg-superficie p-4 transition-colors hover:border-borde-fuerte">
      <div className="flex items-start gap-3">
        <FolderOpen className="mt-0.5 size-5 shrink-0 text-tenue" />
        <div className="min-w-0 flex-1">
          <Link to={`/clientes/${p.id}`} className="block truncate text-[17px] font-semibold after:absolute after:inset-0 after:rounded-2xl">
            {p.empresa || p.nombre}
          </Link>
          <p className="truncate text-[13px] text-tenue">{[p.empresa ? p.nombre : null, datos].filter(Boolean).join(' · ') || 'Sin rubro cargado'}</p>
        </div>
        <span className={`shrink-0 rounded-md px-[9px] py-[3px] text-xs font-semibold ${estilo.fondo} ${estilo.texto}`}>{ETAPA_LABEL[p.etapa]}</span>
      </div>

      <p className={`mt-3 line-clamp-2 min-h-10 text-sm ${objetivo ? 'text-suave' : 'text-tenue'}`}>
        {objetivo ?? 'Todavía sin intervenciones: cargá un audio o un chat para armar su carpeta.'}
      </p>

      <div className="mt-3 flex items-center gap-2 border-t border-borde pt-2.5">
        <span className="min-w-0 flex-1 truncate text-[13px] text-tenue">
          {historia.length
            ? `${historia.length} ${historia.length === 1 ? 'intervención' : 'intervenciones'} · última ${new Date(ultima.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}`
            : 'Sin intervenciones'}
        </span>
        <LinksCliente p={p} compacto />
      </div>
    </article>
  )
}

export function ClientesPage() {
  const { prospectos, cargando, error, guardar, eliminar, ordenAlFinal } = useProspectos()
  const { porCliente, cargando: cargandoHistoria } = useHistoriaClientes()
  const { crearIntervencion } = useGrabaciones()
  const { miembro } = useAuth()
  const miembros = useMiembros()
  const demos = useDemosParaSelector()
  const navigate = useNavigate()

  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [nuevoCliente, setNuevoCliente] = useState(false)
  const [nuevaIntervencion, setNuevaIntervencion] = useState(false)

  // Más reciente primero: por la última intervención o el último cambio
  const ordenados = useMemo(() => {
    const actividad = (p: Prospecto) => {
      const u = porCliente.get(p.id)?.[0]?.created_at
      return Math.max(new Date(p.updated_at).getTime(), u ? new Date(u).getTime() : 0)
    }
    return [...prospectos].sort((a, b) => actividad(b) - actividad(a))
  }, [prospectos, porCliente])

  const q = sinTildes(busqueda.trim())
  const visibles = ordenados.filter(
    (p) =>
      FILTROS.find((f) => f.valor === filtro)!.incluye(p) &&
      (!q || sinTildes([p.nombre, p.empresa, p.rubro, p.industria, p.email, p.instagram].filter(Boolean).join(' ')).includes(q)),
  )

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pt-6 pb-16 md:px-10 md:pt-8">
      <PageHeader
        titulo="Clientes"
        subtitulo="Una carpeta por cliente y cliente potencial: sus datos, objetivos y lo que le proponemos."
        acciones={
          <div className="flex flex-wrap gap-2">
            <Button variant="secundario" onClick={() => setNuevoCliente(true)}>
              <Plus className="size-[18px]" /> Nuevo cliente
            </Button>
            <Button onClick={() => setNuevaIntervencion(true)}>
              <Sparkles className="size-[18px]" /> Nueva intervención
            </Button>
          </div>
        }
      />
      {error && <ErrorBox mensaje={error} />}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <Chip key={f.valor} activo={filtro === f.valor} onClick={() => setFiltro(f.valor)} cantidad={prospectos.filter(f.incluye).length}>
            {f.label}
          </Chip>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tenue" />
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar cliente…" className="pl-9" aria-label="Buscar cliente" />
        </div>
      </div>

      {cargando || cargandoHistoria ? (
        <PantallaCarga />
      ) : prospectos.length === 0 ? (
        <EmptyState
          titulo="Todavía no hay clientes"
          texto="Cargá una intervención (un audio o un chat de un cliente) y su carpeta se crea sola."
          accion={
            <Button onClick={() => setNuevaIntervencion(true)}>
              <Sparkles className="size-[18px]" /> Nueva intervención
            </Button>
          }
        />
      ) : visibles.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-borde-fuerte px-6 py-10 text-center text-tenue">No hay clientes con ese filtro.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibles.map((p) => (
            <TarjetaCliente key={p.id} p={p} historia={porCliente.get(p.id) ?? []} />
          ))}
        </div>
      )}

      <ProspectoForm
        abierto={nuevoCliente}
        prospecto={null}
        etapaInicial="contacto"
        miembros={miembros}
        demos={demos}
        emailActual={miembro?.email ?? ''}
        ordenAlFinal={ordenAlFinal}
        onCerrar={() => setNuevoCliente(false)}
        onGuardar={guardar}
        onEliminar={eliminar}
      />
      <IntervencionForm
        abierto={nuevaIntervencion}
        prospectos={prospectos}
        onCerrar={() => setNuevaIntervencion(false)}
        onGuardar={async (d) => {
          const id = await crearIntervencion({ ...d, grabado_por: miembro?.email ?? null })
          setNuevaIntervencion(false)
          navigate(`/grabaciones/${id}`)
        }}
      />
    </div>
  )
}
