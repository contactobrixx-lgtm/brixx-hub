import { useState } from 'react'
import { Pencil, Target } from 'lucide-react'
import { Segmentado } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { cn } from '../../components/ui/cn'
import { formatUSD } from '../../lib/format'
import type { EstadoMeta, ProgresoMeta } from './metas'

const ESTADO: Record<EstadoMeta, { label: string; barra: string; texto: string }> = {
  cumplida: { label: '¡Meta cumplida!', barra: 'bg-ok', texto: 'text-ok' },
  en_camino: { label: 'En camino', barra: 'bg-acento', texto: 'text-acento-texto' },
  justo: { label: 'Justo', barra: 'bg-aviso', texto: 'text-aviso' },
  atrasado: { label: 'Atrasados', barra: 'bg-peligro', texto: 'text-peligro' },
  empezando: { label: 'Recién empieza', barra: 'bg-acento', texto: 'text-tenue' },
  sin_meta: { label: 'Sin meta', barra: 'bg-borde-fuerte', texto: 'text-tenue' },
}

function Barra({ valor, objetivo, estado }: { valor: number; objetivo: number | null; estado: EstadoMeta }) {
  const pct = objetivo ? Math.min(100, (valor / objetivo) * 100) : 0
  return (
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-elevada" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-[width] duration-500', ESTADO[estado].barra)} style={{ width: `${pct}%` }} />
    </div>
  )
}

function Contador({ hechas, necesarias, label }: { hechas: number; necesarias: number; label: string }) {
  const ok = hechas >= necesarias
  return (
    <div className="flex-1 rounded-xl bg-elevada px-3 py-2.5">
      <div className="text-[13px] text-tenue">{label}</div>
      <div className="tabular mt-0.5 text-lg font-bold">
        <span className={ok ? 'text-ok' : ''}>{hechas}</span>
        <span className="text-tenue"> / {necesarias}</span>
      </div>
    </div>
  )
}

interface Props {
  mes: ProgresoMeta
  trimestre: ProgresoMeta
  onEditar: () => void
}

export function MetasPanel({ mes, trimestre, onEditar }: Props) {
  const [vista, setVista] = useState<'mes' | 'trimestre'>('mes')
  const p = vista === 'mes' ? mes : trimestre
  const { clientes: c, ingreso: i, plan } = p
  const sinMetas = c.objetivo == null && i.objetivo == null

  return (
    <section className="rounded-2xl border border-borde bg-superficie p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Target className="size-5 text-acento-texto" />
        <h2 className="mr-auto text-[19px] font-bold">Metas</h2>
        <div className="order-last w-full sm:order-none sm:w-auto">
          <Segmentado
            valor={vista}
            onChange={setVista}
            opciones={[
              { valor: 'mes', label: 'Este mes' },
              { valor: 'trimestre', label: 'Este trimestre' },
            ]}
          />
        </div>
        <Button variant="fantasma" size="icono" onClick={onEditar} aria-label="Editar metas" title="Editar metas">
          <Pencil className="size-4" />
        </Button>
      </div>

      {/* Cuenta regresiva */}
      <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-[13px] text-tenue">{p.periodo.etiqueta}</div>
          <div className="font-display text-[32px] leading-tight font-bold">
            {p.diasRestantes === 1 ? 'Último día' : <>Faltan <span className="tabular">{p.diasRestantes}</span> días</>}
          </div>
        </div>
        <span className="tabular text-sm text-tenue">{Math.round(p.avanceTiempo * 100)}% del período</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-elevada">
        <div className="h-full rounded-full bg-borde-fuerte" style={{ width: `${p.avanceTiempo * 100}%` }} />
      </div>

      {sinMetas ? (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-borde-fuerte p-4">
          <p className="min-w-0 flex-1 text-sm text-tenue">No hay meta cargada para este período.</p>
          <Button size="sm" onClick={onEditar}>
            Cargar meta
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {/* Clientes */}
            <div className="rounded-xl border border-borde p-4">
              <div className="flex items-baseline justify-between gap-2">
                <small className="text-[13px] font-medium text-tenue">Clientes nuevos</small>
                <span className={cn('text-xs font-semibold', ESTADO[c.estado].texto)}>{ESTADO[c.estado].label}</span>
              </div>
              <div className="tabular mt-1 font-display text-[30px] leading-none font-bold">
                {c.actual}
                {c.objetivo != null && <span className="text-tenue"> / {c.objetivo}</span>}
              </div>
              <Barra valor={c.actual} objetivo={c.objetivo} estado={c.estado} />
              <p className="mt-2 text-[13px] text-tenue">
                {c.objetivo == null
                  ? 'Sin meta de clientes.'
                  : c.estado === 'cumplida'
                    ? 'Ya llegaron. Todo lo que sigue suma.'
                    : c.actual === 0
                      ? 'Todavía sin cierres en el período.'
                      : `A este ritmo cierran con ${Math.floor(c.proyeccion * 10) / 10 === Math.floor(c.proyeccion) ? Math.floor(c.proyeccion) : c.proyeccion.toFixed(1).replace('.', ',')}.`}
                {c.nombres.length > 0 && ` · ${c.nombres.join(', ')}`}
              </p>
            </div>

            {/* Ingreso recurrente */}
            <div className="rounded-xl border border-borde p-4">
              <div className="flex items-baseline justify-between gap-2">
                <small className="text-[13px] font-medium text-tenue">Ingreso recurrente</small>
                <span className={cn('text-xs font-semibold', ESTADO[i.estado].texto)}>{ESTADO[i.estado].label}</span>
              </div>
              <div className="tabular mt-1 font-display text-[30px] leading-none font-bold">
                {formatUSD(i.actual)}
                {i.objetivo != null && <span className="text-tenue text-xl"> / {formatUSD(i.objetivo)}</span>}
              </div>
              <Barra valor={i.actual} objetivo={i.objetivo} estado={i.estado} />
              <p className="mt-2 text-[13px] text-tenue">
                {i.objetivo == null
                  ? 'Sin meta de ingreso.'
                  : i.faltante > 0
                    ? `Faltan ${formatUSD(i.faltante)}/mes ≈ ${i.clientesEquivalentes} ${i.clientesEquivalentes === 1 ? 'cliente' : 'clientes'} con abono.`
                    : 'Ya llegaron al ingreso de la meta.'}
              </p>
            </div>
          </div>

          {/* Embudo al revés */}
          {plan.faltanClientes > 0 && (
            <div className="mt-4">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-sans text-sm font-semibold">Para llegar, esta semana</h3>
                <span className="text-xs text-tenue">
                  Faltan {plan.faltanClientes} {plan.faltanClientes === 1 ? 'cliente' : 'clientes'}: {plan.propuestas} propuestas y {plan.reuniones} reuniones en{' '}
                  {plan.semanas} {plan.semanas === 1 ? 'semana' : 'semanas'}
                </span>
              </div>
              <div className="flex gap-3">
                <Contador hechas={plan.estaSemana.reuniones} necesarias={plan.porSemana.reuniones} label="Reuniones" />
                <Contador hechas={plan.estaSemana.propuestas} necesarias={plan.porSemana.propuestas} label="Propuestas enviadas" />
              </div>
              <p className="mt-2 text-xs text-tenue">
                Con {plan.tasas.reales ? 'sus tasas reales' : 'tasas iniciales (editables)'}:{' '}
                {Math.round(plan.tasas.reunionPropuesta * 100)}% de las reuniones llega a propuesta y {Math.round(plan.tasas.propuestaCierre * 100)}% de
                las propuestas se cierra.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  )
}
