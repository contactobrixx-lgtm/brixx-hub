import { CalendarPlus, FileText, ListChecks, Quote } from 'lucide-react'
import type { Analisis, Servicio, TipoPuntoClave } from '../../types/db'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { formatDuracion, formatFecha, formatUSD } from '../../lib/format'

const TIPO: Record<TipoPuntoClave, { label: string; tono: 'neutro' | 'acento' | 'violeta' | 'ok' | 'aviso' | 'peligro' }> = {
  necesidad: { label: 'Necesidad', tono: 'acento' },
  dolor: { label: 'Dolor', tono: 'peligro' },
  presupuesto: { label: 'Presupuesto', tono: 'ok' },
  plazo: { label: 'Plazo', tono: 'aviso' },
  objecion: { label: 'Objeción', tono: 'peligro' },
  oportunidad: { label: 'Oportunidad', tono: 'violeta' },
  decision: { label: 'Decisión', tono: 'ok' },
  otro: { label: 'Otro', tono: 'neutro' },
}

const ETAPA = { 1: 'Arrancar ya', 2: 'Con las primeras ventas', 3: 'Con ingresos estables' } as const

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-borde bg-superficie p-4 sm:p-5">
      <h2 className="mb-3 text-[19px] font-bold">{titulo}</h2>
      {children}
    </section>
  )
}

interface Props {
  analisis: Analisis
  servicios: Servicio[]
  tieneProspecto: boolean
  ocupado: boolean
  onIrA: (segundo: number) => void
  onCrearCotizacion: () => void
  onProximaAccion: (paso: Analisis['proximos_pasos'][number]) => void
  onAgendar: (paso: Analisis['proximos_pasos'][number]) => void
}

export function VistaAnalisis({ analisis: a, servicios, tieneProspecto, ocupado, onIrA, onCrearCotizacion, onProximaAccion, onAgendar }: Props) {
  const porId = new Map(servicios.map((s) => [s.id, s]))
  const sugeridos = a.propuesta.servicios
  const etapa1 = sugeridos.filter((s) => s.etapa === 1)
  const totalImpl = etapa1.reduce((t, s) => t + Number((s.servicio_id && porId.get(s.servicio_id)?.precio_implementacion) || 0), 0)
  const totalMes = etapa1.reduce((t, s) => t + Number((s.servicio_id && porId.get(s.servicio_id)?.precio_mensual) || 0), 0)

  return (
    <div className="flex flex-col gap-4">
      <Bloque titulo="Resumen">
        <p className="leading-relaxed text-suave">{a.resumen}</p>
      </Bloque>

      <Bloque titulo="Lo más importante">
        <ol className="flex flex-col gap-3">
          {a.puntos_clave.map((p, i) => (
            <li key={i} className="rounded-xl bg-elevada p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tono={TIPO[p.tipo]?.tono ?? 'neutro'}>{TIPO[p.tipo]?.label ?? p.tipo}</Badge>
                <span className="font-semibold">{p.titulo}</span>
              </div>
              <p className="mt-1.5 text-sm text-suave">{p.detalle}</p>
              {p.cita && (
                <button
                  onClick={() => p.segundo != null && onIrA(p.segundo)}
                  disabled={p.segundo == null}
                  className="mt-2 flex w-full cursor-pointer items-start gap-2 rounded-lg border-l-2 border-acento bg-superficie px-3 py-2 text-left text-sm text-acento-claro hover:bg-hover disabled:cursor-default"
                >
                  <Quote className="mt-0.5 size-3.5 shrink-0 opacity-70" />
                  <span className="flex-1 italic">{p.cita}</span>
                  {p.segundo != null && <span className="tabular shrink-0 text-xs text-acento-texto">{formatDuracion(p.segundo)}</span>}
                </button>
              )}
            </li>
          ))}
        </ol>
      </Bloque>

      {(a.decisiones.length > 0 || a.proximos_pasos.length > 0) && (
        <Bloque titulo="Decisiones y próximos pasos">
          {a.decisiones.length > 0 && (
            <ul className="mb-4 flex flex-col gap-1.5">
              {a.decisiones.map((d, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <ListChecks className="mt-0.5 size-4 shrink-0 text-ok" /> {d}
                </li>
              ))}
            </ul>
          )}
          <ul className="flex flex-col gap-2">
            {a.proximos_pasos.map((p, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-elevada p-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{p.accion}</span>
                  <span className="block text-[13px] text-tenue">
                    {[p.responsable, p.fecha && formatFecha(p.fecha)].filter(Boolean).join(' · ') || 'Sin responsable ni fecha'}
                  </span>
                </span>
                <span className="flex gap-1.5">
                  {tieneProspecto && (
                    <Button size="sm" variant="secundario" onClick={() => onProximaAccion(p)} disabled={ocupado}>
                      Próxima acción
                    </Button>
                  )}
                  <Button size="sm" variant="secundario" onClick={() => onAgendar(p)} aria-label="Agendar">
                    <CalendarPlus className="size-4" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </Bloque>
      )}

      <Bloque titulo="Propuesta de trabajo">
        <p className="leading-relaxed text-suave">{a.propuesta.enfoque}</p>
        {sugeridos.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2">
            {sugeridos.map((s, i) => {
              const cat = s.servicio_id ? porId.get(s.servicio_id) : undefined
              return (
                <li key={i} className="rounded-xl bg-elevada p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{cat?.nombre ?? s.nombre}</span>
                    <Badge tono={s.etapa === 1 ? 'acento' : 'neutro'}>{ETAPA[s.etapa] ?? `Etapa ${s.etapa}`}</Badge>
                    {!cat && <Badge tono="aviso">No está en el catálogo</Badge>}
                    {cat && (
                      <span className="tabular ml-auto text-sm text-suave">
                        {formatUSD(Number(cat.precio_implementacion))}
                        {Number(cat.precio_mensual) > 0 && ` + ${formatUSD(Number(cat.precio_mensual))}/mes`}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-tenue">{s.motivo}</p>
                </li>
              )
            })}
          </ul>
        )}
        {etapa1.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-borde p-3">
            <span className="min-w-0 flex-1 text-sm">
              <span className="block text-tenue">Para arrancar (etapa 1, precios del catálogo)</span>
              <b className="tabular text-lg">
                {formatUSD(totalImpl)}
                {totalMes > 0 && <span className="text-sm font-medium text-suave"> + {formatUSD(totalMes)}/mes</span>}
              </b>
            </span>
            <Button onClick={onCrearCotizacion} disabled={!tieneProspecto || ocupado} title={tieneProspecto ? undefined : 'Vinculá la grabación a un cliente o prospecto'}>
              <FileText className="size-4" /> Crear cotización borrador
            </Button>
          </div>
        )}
        {!tieneProspecto && etapa1.length > 0 && (
          <p className="mt-2 text-[13px] text-tenue">Para crear la cotización, vinculá la grabación a un cliente o prospecto (arriba).</p>
        )}
        {a.propuesta.riesgos.length > 0 && (
          <>
            <h3 className="mt-5 mb-2 font-sans text-sm font-semibold text-tenue">Riesgos</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-suave">
              {a.propuesta.riesgos.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </>
        )}
      </Bloque>

      {a.preguntas_pendientes.length > 0 && (
        <Bloque titulo="Para preguntar en el próximo contacto">
          <ul className="list-disc space-y-1 pl-5 text-suave">
            {a.preguntas_pendientes.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </Bloque>
      )}
    </div>
  )
}
