import { useMemo, useState } from 'react'
import { LayoutGrid, Plus, Search, Sparkles } from 'lucide-react'
import type { Ficha, Seccion } from '../types/db'
import { useFichas } from '../features/fichas/useFichas'
import { FichaCard } from '../features/fichas/FichaCard'
import { FichaForm } from '../features/fichas/FichaForm'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorBox } from '../components/ui/ErrorBox'
import { PantallaCarga } from '../components/ui/Spinner'
import { cn } from '../components/ui/cn'

type Filtro = 'vigentes' | 'archivados' | 'todos'

const TEXTOS: Record<Seccion, { titulo: string; subtitulo: string; nuevo: string; vacio: string }> = {
  sistema: {
    titulo: 'Sistemas de gestión',
    subtitulo: 'ERPs, POS y paneles entregados a clientes.',
    nuevo: 'Nuevo sistema',
    vacio: 'Agregá el primer sistema con su URL y una captura.',
  },
  demo: {
    titulo: 'Demos web',
    subtitulo: 'Menús digitales, cotizadores y landings para mostrar.',
    nuevo: 'Nueva demo',
    vacio: 'Agregá la primera demo para tenerla a mano en las reuniones.',
  },
}

export function FichasPage({ seccion }: { seccion: Seccion }) {
  // key: al cambiar de sección se reinicia todo el estado
  return <Contenido key={seccion} seccion={seccion} />
}

function Contenido({ seccion }: { seccion: Seccion }) {
  const { fichas, imagenes, cargando, error, guardar, eliminar, siguienteOrden } = useFichas(seccion)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('vigentes')
  const [categoria, setCategoria] = useState<string | null>(null)
  const [editando, setEditando] = useState<Ficha | null>(null)
  const [formAbierto, setFormAbierto] = useState(false)
  const t = TEXTOS[seccion]

  const categorias = useMemo(
    () => Array.from(new Set(fichas.map((f) => f.categoria).filter((c): c is string => !!c))).sort(),
    [fichas],
  )

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return fichas.filter((f) => {
      if (filtro === 'vigentes' && f.estado === 'archivado') return false
      if (filtro === 'archivados' && f.estado !== 'archivado') return false
      if (categoria && f.categoria !== categoria) return false
      if (!q) return true
      return [f.nombre, f.cliente, f.categoria, f.descripcion, ...f.etiquetas]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q))
    })
  }, [fichas, busqueda, filtro, categoria])

  const abrirNueva = () => {
    setEditando(null)
    setFormAbierto(true)
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">
      <PageHeader
        titulo={t.titulo}
        subtitulo={t.subtitulo}
        acciones={
          <Button onClick={abrirNueva}>
            <Plus className="size-4" /> {t.nuevo}
          </Button>
        }
      />

      {fichas.length > 0 && (
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tenue" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre, cliente, etiqueta…"
              className="pl-9"
            />
          </div>
          <div className="flex rounded-lg border border-borde bg-superficie p-0.5">
            {(['vigentes', 'archivados', 'todos'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={cn(
                  'flex-1 cursor-pointer rounded-md px-3 py-1.5 text-xs capitalize transition-colors',
                  filtro === f ? 'bg-elevada text-texto' : 'text-tenue hover:text-suave',
                )}
              >
                {f}
              </button>
            ))}
          </div>
          {categorias.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {categorias.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategoria(categoria === c ? null : c)}
                  className={cn(
                    'cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors',
                    categoria === c ? 'border-acento/50 bg-acento-tenue text-acento' : 'border-borde text-suave hover:border-borde-fuerte',
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <ErrorBox mensaje={error} />}

      {cargando ? (
        <PantallaCarga />
      ) : fichas.length === 0 ? (
        <EmptyState
          icono={seccion === 'sistema' ? <LayoutGrid className="size-5" /> : <Sparkles className="size-5" />}
          titulo="Todavía no hay nada acá"
          texto={t.vacio}
          accion={
            <Button onClick={abrirNueva}>
              <Plus className="size-4" /> {t.nuevo}
            </Button>
          }
        />
      ) : visibles.length === 0 ? (
        <p className="py-16 text-center text-sm text-tenue">Ninguna ficha coincide con los filtros.</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {visibles.map((f) => (
            <FichaCard
              key={f.id}
              ficha={f}
              imagenUrl={f.imagen_path ? imagenes[f.imagen_path] : undefined}
              onEditar={() => {
                setEditando(f)
                setFormAbierto(true)
              }}
            />
          ))}
        </div>
      )}

      <FichaForm
        abierto={formAbierto}
        seccion={seccion}
        ficha={editando}
        imagenUrl={editando?.imagen_path ? imagenes[editando.imagen_path] : undefined}
        siguienteOrden={siguienteOrden}
        categoriasExistentes={categorias}
        onCerrar={() => setFormAbierto(false)}
        onGuardar={guardar}
        onEliminar={eliminar}
      />
    </div>
  )
}
