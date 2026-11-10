import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import type { Etapa, Moneda, Prospecto } from '../types/db'
import { useMiembros, useProspectos } from '../features/pipeline/useProspectos'
import { useDemosParaSelector } from '../features/fichas/useFichas'
import { Tablero } from '../features/pipeline/Tablero'
import { ProspectoForm } from '../features/pipeline/ProspectoForm'
import { useAuth } from '../auth/AuthProvider'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/Button'
import { Select } from '../components/ui/Field'
import { ErrorBox } from '../components/ui/ErrorBox'
import { PantallaCarga } from '../components/ui/Spinner'
import { formatMonto } from '../lib/format'

const ABIERTAS: Etapa[] = ['contacto', 'reunion', 'demo', 'propuesta']

function sumar(lista: Prospecto[]) {
  const suma: Partial<Record<Moneda, number>> = {}
  for (const p of lista) if (p.valor_estimado != null) suma[p.moneda] = (suma[p.moneda] ?? 0) + Number(p.valor_estimado)
  const partes = Object.entries(suma).map(([m, v]) => formatMonto(v, m as Moneda))
  return partes.length ? partes.join(' · ') : '—'
}

export function PipelinePage() {
  const { miembro } = useAuth()
  const { prospectos, cargando, error, guardar, eliminar, mover, ordenAlFinal } = useProspectos()
  const miembros = useMiembros()
  const demos = useDemosParaSelector()

  const [responsable, setResponsable] = useState('')
  const [formAbierto, setFormAbierto] = useState(false)
  const [editando, setEditando] = useState<Prospecto | null>(null)
  const [etapaNueva, setEtapaNueva] = useState<Etapa>('contacto')

  const visibles = useMemo(
    () =>
      responsable
        ? prospectos.filter((p) => p.responsable?.toLowerCase() === responsable.toLowerCase())
        : prospectos,
    [prospectos, responsable],
  )

  const abiertos = visibles.filter((p) => ABIERTAS.includes(p.etapa))
  const cerrados = visibles.filter((p) => p.etapa === 'cerrado')

  const nuevo = (etapa: Etapa) => {
    setEditando(null)
    setEtapaNueva(etapa)
    setFormAbierto(true)
  }

  const onMover = async (id: string, etapa: Etapa, orden: number) => {
    const p = prospectos.find((x) => x.id === id)
    await mover(id, etapa, orden)
    // Al pasar a "perdido" pedimos el motivo
    if (p && etapa === 'perdido' && p.etapa !== 'perdido' && !p.motivo_perdida) {
      setEditando({ ...p, etapa, orden })
      setFormAbierto(true)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-6 md:px-8 md:pt-10">
        <PageHeader
          titulo="Pipeline"
          subtitulo="Arrastrá las tarjetas entre etapas. En el celular, mantené apretado para arrastrar."
          acciones={
            <>
              <div className="w-40">
                <Select value={responsable} onChange={(e) => setResponsable(e.target.value)} aria-label="Filtrar por responsable">
                  <option value="">Todos</option>
                  {miembros.map((m) => (
                    <option key={m.email} value={m.email}>
                      {m.nombre}
                    </option>
                  ))}
                </Select>
              </div>
              <Button onClick={() => nuevo('contacto')}>
                <Plus className="size-4" /> Prospecto
              </Button>
            </>
          }
        />
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:max-w-2xl">
          <Metrica titulo="En curso" valor={String(abiertos.length)} detalle={sumar(abiertos)} />
          <Metrica titulo="Cerrados" valor={String(cerrados.length)} detalle={sumar(cerrados)} />
          <Metrica
            titulo="Tasa de cierre"
            valor={(() => {
              const fin = visibles.filter((p) => p.etapa === 'cerrado' || p.etapa === 'perdido').length
              return fin ? `${Math.round((cerrados.length / fin) * 100)}%` : '—'
            })()}
            detalle="cerrados / (cerrados + perdidos)"
            className="hidden sm:block"
          />
        </div>
        {error && (
          <div className="mb-4">
            <ErrorBox mensaje={error} />
          </div>
        )}
      </div>

      {cargando ? (
        <PantallaCarga />
      ) : (
        <Tablero
          prospectos={visibles}
          miembros={miembros}
          onMover={onMover}
          onAbrir={(p) => {
            setEditando(p)
            setFormAbierto(true)
          }}
          onNuevo={nuevo}
        />
      )}

      <ProspectoForm
        abierto={formAbierto}
        prospecto={editando}
        etapaInicial={etapaNueva}
        miembros={miembros}
        demos={demos}
        emailActual={miembro?.email ?? ''}
        ordenAlFinal={ordenAlFinal}
        onCerrar={() => setFormAbierto(false)}
        onGuardar={guardar}
        onEliminar={eliminar}
      />
    </div>
  )
}

function Metrica({ titulo, valor, detalle, className = '' }: { titulo: string; valor: string; detalle: string; className?: string }) {
  return (
    <div className={`rounded-xl border border-borde bg-superficie px-4 py-3 ${className}`}>
      <div className="text-xs text-tenue">{titulo}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight">{valor}</div>
      <div className="mt-0.5 truncate text-xs text-suave">{detalle}</div>
    </div>
  )
}
