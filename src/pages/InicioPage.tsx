import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Info, OctagonAlert } from 'lucide-react'
import { useDashboard, type Pendiente, type Periodo } from '../features/inicio/useDashboard'
import { GraficoMensual } from '../features/inicio/GraficoMensual'
import { MetasPanel } from '../features/inicio/MetasPanel'
import { MetasForm } from '../features/inicio/MetasForm'
import { armarEventos } from '../features/calendario/eventos'
import { Agenda } from '../features/calendario/Agenda'
import { useAuth } from '../auth/AuthProvider'
import { PageHeader } from '../components/layout/PageHeader'
import { Segmentado } from '../components/ui/Badge'
import { PantallaCarga } from '../components/ui/Spinner'
import { cn } from '../components/ui/cn'
import { MESES, formatUSD } from '../lib/format'

const PERIODOS: { valor: Periodo; label: string }[] = [
  { valor: 'mes', label: 'Este mes' },
  { valor: '6m', label: '6 meses' },
  { valor: 'anio', label: 'Este año' },
]

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('min-w-0 rounded-2xl border border-borde bg-superficie p-5', className)}>{children}</section>
}

function Fila({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-suave">{label}</span>
      <b className="tabular font-semibold">{valor}</b>
    </div>
  )
}

const ICONO_PENDIENTE = { peligro: OctagonAlert, aviso: AlertTriangle, info: Info }
const TONO_PENDIENTE = { peligro: 'text-peligro', aviso: 'text-aviso', info: 'text-acento-texto' }

function ItemPendiente({ p }: { p: Pendiente }) {
  const Icono = ICONO_PENDIENTE[p.tono]
  return (
    <Link to={p.ir} className="flex items-start gap-3 rounded-[10px] bg-elevada px-3 py-2.5 transition-colors hover:bg-hover">
      <Icono className={cn('mt-0.5 size-4 shrink-0', TONO_PENDIENTE[p.tono])} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{p.titulo}</span>
        <span className="block truncate text-[13px] text-tenue">{p.detalle}</span>
      </span>
    </Link>
  )
}

export function InicioPage() {
  const { miembro } = useAuth()
  const navigate = useNavigate()
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const d = useDashboard(periodo)
  const [editarMetas, setEditarMetas] = useState(false)

  const etiquetaPeriodo =
    periodo === 'mes' ? `en ${MESES[new Date().getMonth()]}` : periodo === '6m' ? 'en los últimos 6 meses' : 'en lo que va del año'
  const primerNombre = miembro?.nombre.split(' ')[0]

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pt-6 pb-16 md:px-10 md:pt-8">
      <PageHeader
        titulo={primerNombre ? `Hola, ${primerNombre}` : 'Inicio'}
        subtitulo="Cómo va el estudio, en dólares: lo cobrado, lo que cuesta sostenerlo y lo que rinde."
        acciones={<Segmentado valor={periodo} onChange={setPeriodo} opciones={PERIODOS} />}
      />

      {d.cargando ? (
        <PantallaCarga />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-4">
            <MetasPanel mes={d.metasMes} trimestre={d.metasTrimestre} onEditar={() => setEditarMetas(true)} />

            {/* Clientes */}
            <Panel className="grid gap-5 sm:grid-cols-[auto_1fr]">
              <div>
                <small className="text-[13px] font-medium text-tenue">Clientes activos</small>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <strong className="tabular font-display text-[32px] leading-none font-bold">{d.activos}</strong>
                  <span className="rounded-md bg-naranja-tenue px-2 py-1 text-[13px] font-semibold text-naranja">
                    {d.enImplementacion} en implementación
                  </span>
                  <span className="rounded-md bg-ok-tenue px-2 py-1 text-[13px] font-semibold text-ok">{d.enMantenimiento} en mantenimiento</span>
                </div>
              </div>
              <div className="sm:border-l sm:border-borde sm:pl-5">
                <small className="text-[13px] font-medium text-tenue">Ingreso recurrente mensual</small>
                <strong className="tabular mt-1 block font-display text-[32px] leading-none font-bold">{formatUSD(d.mrr)}</strong>
                <span className="text-[13px] text-tenue">Abonos de las cotizaciones aceptadas de clientes activos</span>
              </div>
            </Panel>

            {/* Cobrado y costos */}
            <div className="grid gap-4 sm:grid-cols-2">
              <section className="rounded-2xl bg-texto p-5 text-fondo">
                <small className="text-[13px] font-medium opacity-75">Total cobrado</small>
                <strong className="tabular mt-1 block font-display text-[34px] leading-tight font-bold">{formatUSD(d.cobrado)}</strong>
                <span className="text-sm opacity-75">Cobrado {etiquetaPeriodo}</span>
                <div className="mt-4 flex flex-col gap-1.5 border-t border-fondo/20 pt-3 text-sm">
                  <div className="flex justify-between">
                    <span className="opacity-80">Proyectos</span>
                    <b className="tabular">{formatUSD(d.cobradoProyectos)}</b>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-80">Abonos mensuales</span>
                    <b className="tabular">{formatUSD(d.cobradoAbonos)}</b>
                  </div>
                </div>
              </section>
              <Panel>
                <small className="text-[13px] font-medium text-tenue">Costo total</small>
                <strong className="tabular mt-1 block font-display text-[34px] leading-tight font-bold">{formatUSD(d.costoTotal)}</strong>
                <span className="text-sm text-tenue">Lo que cuesta sostener el estudio {etiquetaPeriodo}</span>
                <div className="mt-4 flex flex-col gap-1.5 border-t border-borde pt-3">
                  <Fila label={`Operación (${d.appsActivas} apps)`} valor={formatUSD(d.costoOperacion)} />
                  <Fila label="Adquisición de clientes" valor={formatUSD(d.costoAdquisicion)} />
                </div>
                <Link to="/finanzas?vista=costos" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-acento-texto hover:underline">
                  Ver costos <ArrowRight className="size-3.5" />
                </Link>
              </Panel>
            </div>

            {/* Margen + gráfico */}
            <Panel>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <small className="text-[13px] font-medium text-tenue">Margen</small>
                  <strong className={cn('tabular block font-display text-[32px] leading-tight font-bold', d.margen < 0 && 'text-peligro')}>
                    {d.margen < 0 ? '−' : ''}
                    {formatUSD(Math.abs(d.margen))}
                  </strong>
                  <span className="text-sm text-tenue">
                    {d.cobrado ? `${Math.round((d.margen / d.cobrado) * 100)}% de lo cobrado ${etiquetaPeriodo}` : `Sin cobros ${etiquetaPeriodo}`}
                  </span>
                </div>
                <div className="flex gap-6 text-sm">
                  <div>
                    <span className="block text-tenue">ROAS (sobre adquisición)</span>
                    <b className="tabular text-lg">{d.roas != null ? `${d.roas.toFixed(1)}x` : '—'}</b>
                  </div>
                  <div>
                    <span className="block text-tenue">Retorno sobre costo total</span>
                    <b className="tabular text-lg">{d.retorno != null ? `${d.retorno.toFixed(1)}x` : '—'}</b>
                  </div>
                </div>
              </div>
              <GraficoMensual datos={d.grafico} />
            </Panel>

            {/* Indicadores */}
            <div className="grid gap-4 sm:grid-cols-3">
              <Panel>
                <small className="text-[13px] font-medium text-tenue">Por cobrar</small>
                <strong className="tabular block font-display text-[26px] leading-tight font-bold">{formatUSD(d.porCobrar)}</strong>
                <span className="text-[13px] text-tenue">Saldos de cotizaciones aceptadas</span>
              </Panel>
              <Panel>
                <small className="text-[13px] font-medium text-tenue">Oportunidades</small>
                <strong className="tabular block font-display text-[26px] leading-tight font-bold">{formatUSD(d.valorPipeline)}</strong>
                <span className="text-[13px] text-tenue">{d.abiertos} prospectos en curso</span>
              </Panel>
              <Panel>
                <small className="text-[13px] font-medium text-tenue">Tasa de cierre</small>
                <strong className="tabular block font-display text-[26px] leading-tight font-bold">
                  {d.tasaCierre != null ? `${d.tasaCierre}%` : '—'}
                </strong>
                <span className="text-[13px] text-tenue">Ganados sobre ganados + perdidos</span>
              </Panel>
            </div>
          </div>

          {/* Columna lateral */}
          <div className="flex min-w-0 flex-col gap-4">
            <Panel>
              <h2 className="mb-1 text-[19px] font-bold">Pendientes</h2>
              <p className="mb-3 text-[13px] text-tenue">Lo que necesita una acción</p>
              {d.pendientes.length ? (
                <div className="flex flex-col gap-1.5">
                  {d.pendientes.map((p, i) => (
                    <ItemPendiente key={i} p={p} />
                  ))}
                </div>
              ) : (
                <p className="py-4 text-center text-tenue">Todo al día.</p>
              )}
            </Panel>
            <Panel>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-[19px] font-bold">Próximas reuniones</h2>
                <Link to="/calendario" className="text-sm font-semibold text-acento-texto hover:underline">
                  Calendario
                </Link>
              </div>
              <Agenda
                eventos={armarEventos(d.proximas, d.prospectos).filter((e) => e.tipo === 'reunion')}
                onEvento={() => navigate('/calendario')}
                vacio="No hay reuniones agendadas."
                compacta
              />
            </Panel>
          </div>
        </div>
      )}

      <MetasForm
        abierto={editarMetas}
        metas={d.metas.filas}
        tasas={d.tasasIniciales}
        onCerrar={() => setEditarMetas(false)}
        onGuardar={async (metas, t) => {
          await d.metas.guardarVarias(metas)
          await d.guardarTasas(t)
        }}
      />
    </div>
  )
}
