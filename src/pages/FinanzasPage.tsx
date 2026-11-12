import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import type { CategoriaCosto, Cobro, CobroInput, Costo, Moneda } from '../types/db'
import { useAjustes, useCobros, useCostos } from '../features/finanzas/useFinanzas'
import { CobroForm } from '../features/finanzas/CobroForm'
import { CostoForm } from '../features/finanzas/CostoForm'
import { TipoCambio } from '../features/finanzas/TipoCambio'
import { costoDelMes, costoMensualEquivalente, costoVigente, sumarUSD } from '../features/finanzas/calculos'
import { useCotizaciones } from '../features/cotizador/useCotizador'
import { useProspectos } from '../features/pipeline/useProspectos'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/Button'
import { Badge, Segmentado } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorBox } from '../components/ui/ErrorBox'
import { PantallaCarga } from '../components/ui/Spinner'
import {
  CATEGORIA_COSTO_LABEL,
  CONCEPTO_LABEL,
  FRECUENCIA_LABEL,
  MESES,
  aUSD,
  formatFecha,
  formatMonto,
  formatUSD,
  mesISO,
} from '../lib/format'

type Vista = 'cobros' | 'costos'

const TONO_CONCEPTO = { anticipo: 'acento', saldo: 'violeta', abono: 'ok', extra: 'aviso' } as const

function nombreMes(mes: string) {
  const [y, m] = mes.split('-').map(Number)
  const n = MESES[m - 1]
  return `${n.charAt(0).toUpperCase()}${n.slice(1)} ${y}`
}

export function FinanzasPage() {
  const [params, setParams] = useSearchParams()
  const vista: Vista = params.get('vista') === 'costos' ? 'costos' : 'cobros'
  const setVista = (v: Vista) => setParams(v === 'costos' ? { vista: v } : {}, { replace: true })

  const cobros = useCobros()
  const costos = useCostos()
  const { tipoCambio, guardarTipoCambio } = useAjustes()
  const { prospectos } = useProspectos()
  const { filas: cotizaciones, cargando: cargandoCot } = useCotizaciones()

  const [cobroAbierto, setCobroAbierto] = useState(false)
  const [cobroEditando, setCobroEditando] = useState<Cobro | null>(null)
  const [cobroInicial, setCobroInicial] = useState<Partial<CobroInput> | null>(null)

  // ?registrar=abono&prospecto=…&monto=…&moneda=…: abrir el formulario prellenado (desde Pendientes)
  useEffect(() => {
    if (params.get('registrar') !== 'abono' || cargandoCot) return
    setCobroEditando(null)
    setCobroInicial({
      concepto: 'abono',
      prospecto_id: params.get('prospecto'),
      monto: Number(params.get('monto')) || undefined,
      moneda: (params.get('moneda') as Moneda) || 'USD',
    })
    setCobroAbierto(true)
    setParams({}, { replace: true })
  }, [params, setParams, cargandoCot])
  const [costoAbierto, setCostoAbierto] = useState(false)
  const [costoEditando, setCostoEditando] = useState<Costo | null>(null)

  const porId = useMemo(() => new Map(prospectos.map((p) => [p.id, p])), [prospectos])
  const mesActual = mesISO(new Date())

  const cobrosPorMes = useMemo(() => {
    const m = new Map<string, Cobro[]>()
    for (const c of cobros.filas) m.set(c.fecha.slice(0, 7), [...(m.get(c.fecha.slice(0, 7)) ?? []), c])
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [cobros.filas])

  const costosPorCategoria = useMemo(() => {
    const m = new Map<CategoriaCosto, Costo[]>()
    for (const c of costos.filas) m.set(c.categoria, [...(m.get(c.categoria) ?? []), c])
    return (Object.keys(CATEGORIA_COSTO_LABEL) as CategoriaCosto[]).filter((k) => m.has(k)).map((k) => [k, m.get(k)!] as const)
  }, [costos.filas])

  const costoEsteMes = (cat?: (c: Costo) => boolean) =>
    costos.filas.filter((c) => !cat || cat(c)).reduce((s, c) => s + (costoDelMes(c, mesActual, tipoCambio) ?? 0), 0)

  const hayArsSinTc = !tipoCambio && [...cobros.filas, ...costos.filas].some((x) => x.moneda === 'ARS')
  const error = cobros.error || costos.error

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pt-6 pb-16 md:px-10 md:pt-8">
      <PageHeader
        titulo="Finanzas"
        subtitulo="Lo que entra (cobros) y lo que cuesta sostener el estudio (costos). Todo se resume en dólares en Inicio."
        acciones={
          vista === 'cobros' ? (
            <Button
              onClick={() => {
                setCobroEditando(null)
                setCobroAbierto(true)
              }}
            >
              <Plus className="size-[18px]" /> Registrar cobro
            </Button>
          ) : (
            <Button
              onClick={() => {
                setCostoEditando(null)
                setCostoAbierto(true)
              }}
            >
              <Plus className="size-[18px]" /> Agregar costo
            </Button>
          )
        }
      />

      <div className="mb-4">
        <TipoCambio valor={tipoCambio} onGuardar={guardarTipoCambio} />
      </div>
      {hayArsSinTc && (
        <p className="mb-4 rounded-[10px] bg-aviso-tenue px-3.5 py-3 text-sm text-aviso">
          Hay montos en pesos y no hay tipo de cambio cargado: no se suman en los totales en dólares.
        </p>
      )}

      <div className="mb-6">
        <Segmentado
          valor={vista}
          onChange={setVista}
          opciones={[
            { valor: 'cobros', label: 'Cobros' },
            { valor: 'costos', label: 'Costos' },
          ]}
        />
      </div>

      {error && (
        <div className="mb-4">
          <ErrorBox mensaje={error} />
        </div>
      )}

      {vista === 'cobros' ? (
        cobros.cargando ? (
          <PantallaCarga />
        ) : cobros.filas.length === 0 ? (
          <EmptyState
            titulo="Todavía no hay cobros"
            texto="Registrá cada pago que entra: anticipos, saldos y abonos. Con eso se arma el dashboard."
            accion={
              <Button
                onClick={() => {
                  setCobroEditando(null)
                  setCobroAbierto(true)
                }}
              >
                Registrar el primero
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-6">
            {cobrosPorMes.map(([mes, lista]) => {
              const { total } = sumarUSD(lista, tipoCambio)
              return (
                <section key={mes}>
                  <div className="mb-2 flex items-baseline justify-between px-1">
                    <h2 className="text-[19px] font-bold">{nombreMes(mes)}</h2>
                    <span className="tabular font-semibold">{formatUSD(total)}</span>
                  </div>
                  <div className="overflow-hidden rounded-2xl border border-borde bg-superficie">
                    {lista.map((c, i) => {
                      const p = c.prospecto_id ? porId.get(c.prospecto_id) : undefined
                      const usd = aUSD(c.monto, c.moneda, tipoCambio)
                      return (
                        <button
                          key={c.id}
                          onClick={() => {
                            setCobroEditando(c)
                            setCobroAbierto(true)
                          }}
                          className={`flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-elevada md:px-5 ${i ? 'border-t border-borde' : ''}`}
                        >
                          <span className="tabular w-14 shrink-0 text-sm text-tenue">{formatFecha(c.fecha)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold">{p ? p.empresa || p.nombre : 'Sin cliente'}</span>
                            {c.notas && <span className="block truncate text-[13px] text-tenue">{c.notas}</span>}
                          </span>
                          <Badge tono={TONO_CONCEPTO[c.concepto]} className="hidden sm:inline-flex">
                            {CONCEPTO_LABEL[c.concepto]}
                          </Badge>
                          <span className="tabular min-w-28 text-right">
                            <span className="block font-semibold">{formatMonto(c.monto, c.moneda)}</span>
                            {c.moneda === 'ARS' && (
                              <span className="block text-[13px] text-tenue">{usd != null ? `≈ ${formatUSD(usd)}` : 'sin TC'}</span>
                            )}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        )
      ) : costos.cargando ? (
        <PantallaCarga />
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            {[
              { titulo: 'Costo de este mes', valor: costoEsteMes(), texto: 'Todo lo que se paga este mes' },
              {
                titulo: 'Operación',
                valor: costoEsteMes((c) => c.categoria !== 'adquisicion'),
                texto: 'Apps, API keys, hosting, dominios y fees que mantienen el sistema andando',
              },
              {
                titulo: 'Adquisición',
                valor: costoEsteMes((c) => c.categoria === 'adquisicion'),
                texto: 'Lo que invertís para conseguir clientes nuevos: anuncios, prospección, referidos',
              },
            ].map((k) => (
              <div key={k.titulo} className="rounded-2xl border border-borde bg-superficie p-4">
                <small className="text-[13px] font-medium text-tenue">{k.titulo}</small>
                <strong className="tabular block font-display text-[28px] leading-tight font-bold">{formatUSD(k.valor)}</strong>
                <span className="text-[13px] text-tenue">{k.texto}</span>
              </div>
            ))}
          </div>

          {costos.filas.length === 0 ? (
            <EmptyState
              titulo="Sin costos cargados"
              texto="Agregá lo que paga el estudio (Supabase, Vercel, Claude, dominios, publicidad…) para ver el costo total y el margen."
              accion={
                <Button
                  onClick={() => {
                    setCostoEditando(null)
                    setCostoAbierto(true)
                  }}
                >
                  Agregar el primero
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-6">
              {costosPorCategoria.map(([cat, lista]) => (
                <section key={cat}>
                  <h2 className="mb-2 px-1 text-[19px] font-bold">{CATEGORIA_COSTO_LABEL[cat]}</h2>
                  <div className="overflow-hidden rounded-2xl border border-borde bg-superficie">
                    {lista.map((c, i) => {
                      const vigente = c.frecuencia === 'unico' ? c.desde.slice(0, 7) === mesActual : costoVigente(c)
                      const eq = costoMensualEquivalente(c, tipoCambio)
                      return (
                        <button
                          key={c.id}
                          onClick={() => {
                            setCostoEditando(c)
                            setCostoAbierto(true)
                          }}
                          className={`flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-elevada md:px-5 ${i ? 'border-t border-borde' : ''} ${vigente ? '' : 'opacity-55'}`}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate font-semibold">{c.nombre}</span>
                              {!vigente && <Badge>{c.frecuencia === 'unico' ? formatFecha(c.desde) : 'Dado de baja'}</Badge>}
                            </span>
                            <span className="block truncate text-[13px] text-tenue">
                              {FRECUENCIA_LABEL[c.frecuencia]} · {formatMonto(c.monto, c.moneda)}
                            </span>
                          </span>
                          {c.frecuencia !== 'unico' && (
                            <span className="tabular text-right">
                              <span className="block font-semibold">{eq != null ? formatUSD(eq) : 'sin TC'}</span>
                              <span className="block text-[13px] text-tenue">por mes</span>
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      <CobroForm
        abierto={cobroAbierto}
        cobro={cobroEditando}
        inicial={cobroInicial}
        prospectos={prospectos}
        cotizaciones={cotizaciones}
        onCerrar={() => {
          setCobroAbierto(false)
          setCobroInicial(null)
        }}
        onGuardar={cobros.guardar}
        onEliminar={cobros.eliminar}
      />
      <CostoForm
        abierto={costoAbierto}
        costo={costoEditando}
        onCerrar={() => setCostoAbierto(false)}
        onGuardar={costos.guardar}
        onEliminar={costos.eliminar}
      />
    </div>
  )
}
