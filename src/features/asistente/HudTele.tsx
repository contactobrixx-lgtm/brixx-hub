import type { ReactNode } from 'react'
import { cn } from '../../components/ui/cn'

export interface MetricaTele {
  label: string
  valor: string
}
export interface FilaTele {
  label: string
  valor: string
  tono: 'ok' | 'aviso' | 'peligro' | 'acento' | 'neutro'
}

const PUNTO: Record<FilaTele['tono'], string> = {
  ok: 'bg-ok shadow-[0_0_8px_var(--color-ok)]',
  aviso: 'bg-aviso shadow-[0_0_8px_var(--color-aviso)]',
  peligro: 'bg-peligro shadow-[0_0_8px_var(--color-peligro)]',
  acento: 'bg-acento-claro shadow-[0_0_8px_var(--color-acento)]',
  neutro: 'bg-tenue',
}

function Caja({ titulo, children, className }: { titulo: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-acento/30 bg-fondo/45 p-3 backdrop-blur-sm', className)}>
      <div className="mb-2 text-[10px] font-semibold tracking-[0.25em] text-acento-claro uppercase">{titulo}</div>
      {children}
    </div>
  )
}

interface Props {
  hora: string
  fecha: string
  saludo: string
  metricas: MetricaTele[]
  filas: FilaTele[]
  /** Lo que dice Jarvis ahora (o lo que está escuchando) */
  subtitulo: string
  /** Botones de abajo a la derecha (micrófono, manos libres, salir) */
  controles: ReactNode
  /** Acciones para confirmar */
  confirmar?: ReactNode
  /** Misión en marcha: reemplaza los números del mes (izquierda) y el estado (derecha) */
  izquierda?: ReactNode
  derecha?: ReactNode
  /** Hay un panel abierto a la derecha (pantalla o resultado): los subtítulos van al costado libre */
  conPanel?: boolean
}

/**
 * Los paneles del modo tele, flotando sobre la red (como un HUD): números del mes a la izquierda,
 * estado del estudio a la derecha, reloj arriba y subtítulos abajo. En el celular se compactan.
 */
export function HudTele({ hora, fecha, saludo, metricas, filas, subtitulo, controles, confirmar, izquierda, derecha, conPanel = false }: Props) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 p-3 md:p-6">
      {/* Arriba izquierda: título y números del mes */}
      <div className="flex max-w-[min(100%,300px)] flex-col gap-3">
        <div>
          <div className="text-[10px] font-semibold tracking-[0.35em] text-acento-claro uppercase md:text-xs">
            Brixx<span className="hidden sm:inline"> · centro de comando</span>
          </div>
          <div className="text-sm text-tenue">{saludo}</div>
        </div>
        {izquierda && <Caja titulo="Misión" className="pointer-events-auto max-h-[55vh] overflow-y-auto">{izquierda}</Caja>}
        <Caja titulo="Este mes" className={cn('hidden', izquierda ? '' : 'sm:block')}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {metricas.map((m) => (
              <div key={m.label}>
                <div className="text-[10px] tracking-wider text-tenue uppercase">{m.label}</div>
                <div className="tabular font-display text-lg leading-tight font-bold">{m.valor}</div>
              </div>
            ))}
          </div>
        </Caja>
      </div>

      {/* Arriba derecha: reloj */}
      <div className="absolute top-3 right-3 text-right md:top-6 md:right-6">
        <div className="tabular font-display text-2xl leading-none font-bold md:text-4xl">{hora}</div>
        <div className="mt-1 text-xs text-tenue">{fecha}</div>
      </div>

      {/* Derecha: estado del estudio */}
      {derecha && (
        <Caja titulo="Registro" className="absolute top-24 right-3 hidden w-72 md:top-28 md:right-6 lg:block">
          {derecha}
        </Caja>
      )}
      <Caja titulo="Estado" className={cn('absolute top-24 right-3 hidden w-60 md:top-28 md:right-6', derecha ? '' : 'lg:block')}>
        <ul className="flex flex-col gap-1.5">
          {filas.map((f) => (
            <li key={f.label} className="flex items-center gap-2 text-sm">
              <span className={cn('size-1.5 shrink-0 rounded-full', PUNTO[f.tono])} />
              <span className="min-w-0 flex-1 truncate text-suave">{f.label}</span>
              <span className="tabular font-semibold">{f.valor}</span>
            </li>
          ))}
        </ul>
      </Caja>

      {/* Celular: números del mes en una fila */}
      <div className={cn('mt-3 grid grid-cols-2 gap-2 sm:hidden', izquierda ? 'hidden' : '')}>
        {metricas.map((m) => (
          <div key={m.label} className="rounded-lg border border-acento/25 bg-fondo/45 px-2.5 py-1.5 backdrop-blur-sm">
            <div className="text-[9px] tracking-wider text-tenue uppercase">{m.label}</div>
            <div className="tabular text-sm font-bold">{m.valor}</div>
          </div>
        ))}
      </div>

      {/* Abajo izquierda: para confirmar */}
      {confirmar && <div className="pointer-events-auto absolute bottom-24 left-3 w-[min(92%,360px)] md:bottom-6 md:left-6">{confirmar}</div>}

      {/* Abajo: subtítulos */}
      <div className={cn('absolute inset-x-3 bottom-14 flex justify-center md:bottom-16', conPanel && 'md:right-[calc(min(52%,920px)+2.5rem)] md:left-6 md:bottom-24')}>
        {subtitulo && (
          <p
            className={cn(
              'max-w-3xl rounded-xl bg-fondo/55 px-4 py-2 text-center leading-snug text-texto backdrop-blur-sm',
              conPanel ? 'text-sm md:text-lg' : 'text-base md:text-xl',
            )}
          >
            <span className={cn('block', conPanel && 'line-clamp-4 md:line-clamp-none')}>{subtitulo}</span>
          </p>
        )}
      </div>

      {/* Abajo derecha: controles */}
      <div className="pointer-events-auto absolute right-3 bottom-3 flex gap-2 md:right-6 md:bottom-6">{controles}</div>
    </div>
  )
}
