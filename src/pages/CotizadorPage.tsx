import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import type { Cotizacion, EstadoCotizacion, Servicio } from '../types/db'
import { useCotizaciones, useServicios } from '../features/cotizador/useCotizador'
import { CotizacionForm } from '../features/cotizador/CotizacionForm'
import { ServicioForm } from '../features/cotizador/ServicioForm'
import { totalesCotizacion } from '../features/finanzas/calculos'
import { useAjustes } from '../features/finanzas/useFinanzas'
import { useProspectos } from '../features/pipeline/useProspectos'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/Button'
import { Badge, Chip, Segmentado } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorBox } from '../components/ui/ErrorBox'
import { PantallaCarga } from '../components/ui/Spinner'
import { ESTADO_COTIZACION_LABEL, formatFecha, formatMonto, formatUSD, numeroCotizacion } from '../lib/format'

type Vista = 'cotizaciones' | 'servicios'

const TONO_ESTADO = { borrador: 'neutro', enviada: 'acento', aceptada: 'ok', rechazada: 'peligro' } as const

export function CotizadorPage() {
  const [params, setParams] = useSearchParams()
  const vista: Vista = params.get('vista') === 'servicios' ? 'servicios' : 'cotizaciones'
  const setVista = (v: Vista) => setParams(v === 'servicios' ? { vista: v } : {}, { replace: true })

  const servicios = useServicios()
  const cotizaciones = useCotizaciones()
  const { prospectos } = useProspectos()
  const { tipoCambio } = useAjustes()

  const [filtro, setFiltro] = useState<EstadoCotizacion | null>(null)
  const [cotAbierta, setCotAbierta] = useState(false)
  const [cotEditando, setCotEditando] = useState<Cotizacion | null>(null)
  const [srvAbierto, setSrvAbierto] = useState(false)
  const [srvEditando, setSrvEditando] = useState<Servicio | null>(null)

  const porId = useMemo(() => new Map(prospectos.map((p) => [p.id, p])), [prospectos])

  // ?abrir=<id>: abrir una cotización (por ejemplo, la que se acaba de crear desde una grabación)
  const abrirId = params.get('abrir')
  useEffect(() => {
    if (!abrirId) return
    const c = cotizaciones.filas.find((x) => x.id === abrirId)
    if (!c) return
    setCotEditando(c)
    setCotAbierta(true)
    setParams({}, { replace: true })
  }, [abrirId, cotizaciones.filas, setParams])
  const visibles = cotizaciones.filas.filter((c) => !filtro || c.estado === filtro)
  const sinPrecio = servicios.filas.filter((s) => s.activo && !Number(s.precio_implementacion) && !Number(s.precio_mensual)).length

  const nuevaCot = () => {
    setCotEditando(null)
    setCotAbierta(true)
  }
  const nuevoSrv = () => {
    setSrvEditando(null)
    setSrvAbierto(true)
  }

  const error = cotizaciones.error || servicios.error

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pt-6 pb-16 md:px-10 md:pt-8">
      <PageHeader
        titulo="Cotizador"
        subtitulo="Armá cotizaciones con los servicios del estudio. El precio sale de la suma de lo que elegís."
        acciones={
          vista === 'cotizaciones' ? (
            <Button onClick={nuevaCot}>
              <Plus className="size-[18px]" /> Nueva cotización
            </Button>
          ) : (
            <Button onClick={nuevoSrv}>
              <Plus className="size-[18px]" /> Agregar servicio
            </Button>
          )
        }
      />

      <div className="mb-6">
        <Segmentado
          valor={vista}
          onChange={setVista}
          opciones={[
            { valor: 'cotizaciones', label: `Cotizaciones · ${cotizaciones.filas.length}` },
            { valor: 'servicios', label: `Servicios · ${servicios.filas.length}` },
          ]}
        />
      </div>

      {error && (
        <div className="mb-4">
          <ErrorBox mensaje={error} />
        </div>
      )}

      {vista === 'cotizaciones' ? (
        cotizaciones.cargando ? (
          <PantallaCarga />
        ) : cotizaciones.filas.length === 0 ? (
          <EmptyState
            titulo="Todavía no hay cotizaciones"
            texto={
              sinPrecio
                ? `Primero cargá los precios en Servicios (${sinPrecio} sin precio) y después armá la primera cotización.`
                : 'Elegí un prospecto, tildá los servicios y el hub calcula el total y el abono mensual.'
            }
            accion={<Button onClick={nuevaCot}>Armar la primera</Button>}
          />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              <Chip activo={filtro === null} onClick={() => setFiltro(null)} cantidad={cotizaciones.filas.length}>
                Todas
              </Chip>
              {(Object.keys(ESTADO_COTIZACION_LABEL) as EstadoCotizacion[]).map((e) => (
                <Chip
                  key={e}
                  activo={filtro === e}
                  onClick={() => setFiltro(filtro === e ? null : e)}
                  cantidad={cotizaciones.filas.filter((c) => c.estado === e).length}
                >
                  {ESTADO_COTIZACION_LABEL[e]}
                </Chip>
              ))}
            </div>
            <div className="overflow-hidden rounded-2xl border border-borde bg-superficie">
              {visibles.map((c, i) => {
                const p = c.prospecto_id ? porId.get(c.prospecto_id) : undefined
                const t = totalesCotizacion(c)
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCotEditando(c)
                      setCotAbierta(true)
                    }}
                    className={`flex w-full cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3.5 text-left transition-colors hover:bg-elevada md:px-5 ${i ? 'border-t border-borde' : ''}`}
                  >
                    <span className="tabular w-20 shrink-0 text-sm font-semibold text-tenue">{numeroCotizacion(c.numero)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{p ? p.empresa || p.nombre : 'Sin cliente'}</span>
                      <span className="block truncate text-[13px] text-tenue">
                        {c.titulo || `${c.cotizacion_items.length} ítems`} · {formatFecha(c.fecha)}
                      </span>
                    </span>
                    <Badge tono={TONO_ESTADO[c.estado]}>{ESTADO_COTIZACION_LABEL[c.estado]}</Badge>
                    <span className="tabular w-full text-right sm:w-auto sm:min-w-40">
                      <span className="block font-semibold">{formatMonto(t.implementacion, c.moneda)}</span>
                      {t.mensual > 0 && <span className="block text-[13px] text-tenue">+ {formatMonto(t.mensual, c.moneda)}/mes</span>}
                    </span>
                  </button>
                )
              })}
              {visibles.length === 0 && <p className="py-10 text-center text-tenue">No hay cotizaciones en este estado.</p>}
            </div>
          </>
        )
      ) : servicios.cargando ? (
        <PantallaCarga />
      ) : (
        <>
          {sinPrecio > 0 && (
            <p className="mb-4 rounded-[10px] bg-aviso-tenue px-3.5 py-3 text-sm text-aviso">
              {sinPrecio === 1 ? 'Hay 1 servicio sin precio.' : `Hay ${sinPrecio} servicios sin precio.`} Tocalos para cargar
              cuánto cobran de implementación y de abono.
            </p>
          )}
          <div className="overflow-hidden rounded-2xl border border-borde bg-superficie">
            <div className="hidden grid-cols-[1fr_140px_140px] gap-4 border-b border-borde px-5 py-2.5 text-xs font-semibold text-tenue sm:grid">
              <span>Servicio</span>
              <span className="text-right">Implementación</span>
              <span className="text-right">Abono mensual</span>
            </div>
            {servicios.filas.map((s, i) => {
              const sinP = !Number(s.precio_implementacion) && !Number(s.precio_mensual)
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setSrvEditando(s)
                    setSrvAbierto(true)
                  }}
                  className={`grid w-full cursor-pointer grid-cols-2 gap-x-4 gap-y-1 px-4 py-3.5 text-left transition-colors hover:bg-elevada sm:grid-cols-[1fr_140px_140px] sm:px-5 ${i ? 'border-t border-borde' : ''} ${s.activo ? '' : 'opacity-50'}`}
                >
                  <span className="col-span-2 min-w-0 sm:col-span-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold">{s.nombre}</span>
                      {sinP && <Badge tono="aviso">Sin precio</Badge>}
                      {!s.activo && <Badge>Inactivo</Badge>}
                    </span>
                    {s.descripcion && <span className="block truncate text-[13px] text-tenue">{s.descripcion}</span>}
                  </span>
                  <span className="tabular text-sm sm:text-right sm:text-[15px]">
                    <span className="text-tenue sm:hidden">Impl. </span>
                    {formatUSD(Number(s.precio_implementacion))}
                  </span>
                  <span className="tabular text-right text-sm sm:text-[15px]">
                    {formatUSD(Number(s.precio_mensual))}
                    <span className="text-tenue">/mes</span>
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}

      <CotizacionForm
        abierto={cotAbierta}
        cotizacion={cotEditando}
        prospectos={prospectos}
        servicios={servicios.filas}
        tipoCambio={tipoCambio}
        onCerrar={() => setCotAbierta(false)}
        onGuardar={cotizaciones.guardarConItems}
        onEliminar={cotizaciones.eliminar}
      />
      <ServicioForm
        abierto={srvAbierto}
        servicio={srvEditando}
        siguienteOrden={servicios.filas.reduce((m, s) => Math.max(m, s.orden), 0) + 1}
        onCerrar={() => setSrvAbierto(false)}
        onGuardar={servicios.guardar}
        onEliminar={servicios.eliminar}
      />
    </div>
  )
}
