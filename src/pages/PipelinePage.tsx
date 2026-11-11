import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { ETAPAS, type Etapa, type Moneda, type Prospecto } from '../types/db'
import { useMiembros, useProspectos } from '../features/pipeline/useProspectos'
import { useDemosParaSelector } from '../features/fichas/useFichas'
import { Tablero } from '../features/pipeline/Tablero'
import { ProspectoForm } from '../features/pipeline/ProspectoForm'
import { useAuth } from '../auth/AuthProvider'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/Button'
import { Segmentado } from '../components/ui/Badge'
import { cn } from '../components/ui/cn'
import { ESTILO_ETAPA } from '../features/pipeline/etapas'
import { ErrorBox } from '../components/ui/ErrorBox'
import { PantallaCarga } from '../components/ui/Spinner'
import { ETAPA_LABEL, formatMonto } from '../lib/format'

const ABIERTAS: Etapa[] = ['contacto', 'reunion', 'demo', 'propuesta']

function sumar(lista: Prospecto[]) {
  const suma: Partial<Record<Moneda, number>> = {}
  for (const p of lista) if (p.valor_estimado != null) suma[p.moneda] = (suma[p.moneda] ?? 0) + Number(p.valor_estimado)
  const partes = Object.entries(suma).map(([m, v]) => formatMonto(v, m as Moneda))
  return partes.join(' · ')
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
  const finalizados = visibles.filter((p) => p.etapa === 'cerrado' || p.etapa === 'perdido').length
  const tasa = finalizados ? Math.round((cerrados.length / finalizados) * 100) : null

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
      <div className="px-4 pt-6 md:px-10 md:pt-8">
        <PageHeader
          titulo="Pipeline"
          subtitulo={`${abiertos.length} prospectos en curso${sumar(abiertos) ? ` · ${sumar(abiertos)}` : ''}${
            tasa != null ? ` · tasa de cierre ${tasa}%` : ''
          }. Arrastrá las tarjetas entre etapas.`}
          acciones={
            <Button onClick={() => nuevo('contacto')}>
              <Plus className="size-[18px]" /> Agregar prospecto
            </Button>
          }
        />

        <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-6 md:overflow-visible md:px-0">
          {ETAPAS.map((etapa) => {
            const items = visibles.filter((p) => p.etapa === etapa)
            const est = ESTILO_ETAPA[etapa]
            return (
              <div key={etapa} className={cn('min-w-[118px] rounded-xl px-3.5 py-3', est.fondo)}>
                <small className={cn('block text-xs font-semibold', est.texto)}>{ETAPA_LABEL[etapa]}</small>
                <strong className={cn('tabular block font-display text-[26px] leading-tight font-bold', est.texto)}>
                  {items.length}
                </strong>
                <span className="tabular block truncate text-xs text-tenue">{sumar(items) || '\u00a0'}</span>
              </div>
            )
          })}
        </div>

        {miembros.length > 1 && (
          <div className="mb-5">
            <Segmentado
              valor={responsable}
              onChange={setResponsable}
              opciones={[{ valor: '', label: 'Todos' }, ...miembros.map((m) => ({ valor: m.email, label: m.nombre }))]}
            />
          </div>
        )}
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
