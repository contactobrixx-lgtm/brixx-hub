import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bot, Play } from 'lucide-react'
import type { AgenteConfig, IdAgente, InformeAgente } from '../types/db'
import { AGENTES, DESCRIPCION, type DescripcionAgente } from '../features/agentes/catalogo'
import { useAgentes } from '../features/agentes/useAgentes'
import { InformeDetalle } from '../features/agentes/InformeDetalle'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/Button'
import { Badge, Chip } from '../components/ui/Badge'
import { Select } from '../components/ui/Field'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorBox } from '../components/ui/ErrorBox'
import { PantallaCarga, Spinner } from '../components/ui/Spinner'
import { cn } from '../components/ui/cn'

function hace(iso: string | null) {
  if (!iso) return 'nunca'
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return d === 1 ? 'ayer' : `hace ${d} días`
}

function Interruptor({ activo, onCambiar, etiqueta }: { activo: boolean; onCambiar: (v: boolean) => void; etiqueta: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      onClick={() => onCambiar(!activo)}
      className={cn(
        'relative h-7 w-12 shrink-0 cursor-pointer rounded-full border transition-colors',
        activo ? 'border-acento bg-acento' : 'border-borde-fuerte bg-elevada',
      )}
    >
      <span className={cn('absolute top-0.5 size-[22px] rounded-full bg-white shadow transition-all', activo ? 'left-[22px]' : 'left-0.5')} />
    </button>
  )
}

function TarjetaAgente({
  desc,
  cfg,
  onCambiar,
  onCorrer,
}: {
  desc: DescripcionAgente
  cfg: AgenteConfig | undefined
  onCambiar: (c: Partial<Pick<AgenteConfig, 'activo' | 'hora'>>) => Promise<void>
  onCorrer: () => Promise<string | null>
}) {
  const Icono = desc.icono
  const [corriendo, setCorriendo] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const activo = cfg?.activo ?? true

  const correr = async () => {
    setCorriendo(true)
    setAviso(null)
    try {
      const r = await onCorrer()
      setAviso({
        ok: true,
        texto: r ?? 'Listo: el informe aparece abajo cuando termina.',
      })
    } catch (e) {
      setAviso({
        ok: false,
        texto: e instanceof Error ? e.message : 'No se pudo correr.',
      })
    } finally {
      setCorriendo(false)
    }
  }

  return (
    <article className={cn('flex flex-col rounded-2xl border bg-superficie p-4 transition-colors', activo ? 'border-borde' : 'border-borde opacity-70')}>
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-acento-tenue text-acento-texto">
          <Icono className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-sans text-[17px] font-semibold">{desc.nombre}</h3>
          <p className="text-[13px] text-tenue">
            {desc.cuando}
            {desc.conHora && cfg ? `, desde las ${String(cfg.hora).padStart(2, '0')}:00` : ''}
          </p>
        </div>
        <Interruptor activo={activo} etiqueta={`${activo ? 'Apagar' : 'Prender'} ${desc.nombre}`} onCambiar={(v) => onCambiar({ activo: v })} />
      </div>
      <p className="mt-3 mb-4 text-sm text-suave">{desc.queHace}</p>
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-borde pt-3">
        <Button size="sm" variant="secundario" onClick={correr} disabled={corriendo}>
          {corriendo ? <Spinner className="size-4" /> : <Play className="size-4" />} {desc.correrAhora}
        </Button>
        {desc.conHora && cfg && (
          <div className="w-[6.5rem]">
            <Select aria-label="Hora" value={cfg.hora} onChange={(e) => onCambiar({ hora: Number(e.target.value) })} className="!min-h-[38px] py-0 text-sm">
              {Array.from({ length: 16 }, (_, i) => i + 6).map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </Select>
          </div>
        )}
        <span className="ml-auto text-xs text-tenue" title={cfg?.ultimo_estado ?? undefined}>
          Última: {hace(cfg?.ultima_corrida ?? null)}
        </span>
      </div>
      {cfg?.ultimo_estado && !aviso && <p className="mt-2 line-clamp-2 text-xs text-tenue">{cfg.ultimo_estado}</p>}
      {aviso && <p className={cn('mt-2 text-sm', aviso.ok ? 'text-ok' : 'text-peligro')}>{aviso.texto}</p>}
    </article>
  )
}

function FilaInforme({ i, onAbrir }: { i: InformeAgente; onAbrir: () => void }) {
  const desc = DESCRIPCION[i.agente]
  const Icono = desc?.icono ?? Bot
  return (
    <li>
      <button
        onClick={onAbrir}
        className={cn(
          'flex w-full cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors hover:border-borde-fuerte',
          i.leido ? 'border-borde bg-superficie/60' : 'border-acento/30 bg-superficie',
        )}
      >
        <Icono className={cn('mt-0.5 size-5 shrink-0', i.leido ? 'text-tenue' : 'text-acento-texto')} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className={cn('min-w-0 truncate', i.leido ? 'font-medium' : 'font-semibold')}>
              {i.estado === 'trabajando' ? `${desc?.nombre}: trabajando…` : i.titulo}
            </span>
            {i.estado === 'trabajando' && <Spinner className="size-3.5" />}
            {i.estado === 'error' && <Badge tono="peligro">Error</Badge>}
            {!i.leido && i.estado === 'lista' && <Badge tono="acento">Nuevo</Badge>}
          </span>
          {i.resumen && <span className="mt-0.5 line-clamp-2 block text-sm text-tenue">{i.resumen}</span>}
        </span>
        <span className="shrink-0 text-xs text-tenue">{hace(i.created_at)}</span>
      </button>
    </li>
  )
}

type Filtro = 'todos' | 'nuevos' | IdAgente

export function AgentesPage() {
  const a = useAgentes()
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [params, setParams] = useSearchParams()
  const abiertoId = params.get('informe')
  const abierto = a.informes.find((i) => i.id === abiertoId) ?? null

  // Al abrir uno, queda leído
  const { marcarLeido } = a
  const pendienteDeLeer = abierto && !abierto.leido && abierto.estado !== 'trabajando' ? abierto.id : null
  useEffect(() => {
    if (pendienteDeLeer) marcarLeido(pendienteDeLeer)
  }, [pendienteDeLeer, marcarLeido])

  const abrir = (id: string | null) => {
    const p = new URLSearchParams(params)
    if (id) p.set('informe', id)
    else p.delete('informe')
    setParams(p, { replace: true })
  }

  const visibles = useMemo(
    () => a.informes.filter((i) => (filtro === 'todos' ? true : filtro === 'nuevos' ? !i.leido : i.agente === filtro)),
    [a.informes, filtro],
  )
  const nuevos = a.informes.filter((i) => !i.leido && i.estado === 'lista').length

  if (a.cargando) return <PantallaCarga />

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pt-6 pb-16 md:px-10 md:pt-8">
      <PageHeader titulo="Agentes" subtitulo="Trabajan solos y te dejan informes. Solo leen el hub: nunca le mandan nada a un cliente ni cambian datos." />
      {a.error && (
        <div className="mb-5">
          <ErrorBox mensaje={`No se pudieron leer los agentes: ${a.error}`} />
        </div>
      )}

      <p className="mb-4 flex items-center gap-2 text-sm text-tenue">
        <span className={cn('size-2 shrink-0 rounded-full', a.programados ? 'bg-ok' : 'bg-aviso')} />
        {a.programados == null
          ? 'Revisando el programador…'
          : a.programados
            ? 'Programados: corren solos cada 15 minutos, aunque nadie tenga el hub abierto.'
            : 'Corren cuando alguien abre el hub (el programador automático de la base no está activo en este proyecto).'}
      </p>

      <section className="grid gap-3 md:grid-cols-2">
        {AGENTES.map((d) => (
          <TarjetaAgente
            key={d.id}
            desc={d}
            cfg={a.config.find((c) => c.agente === d.id)}
            onCambiar={(c) => a.cambiar(d.id, c)}
            onCorrer={async () => {
              const r = await a.correr(d.id)
              if (r.id) abrir(r.id)
              return r.resumen ?? null
            }}
          />
        ))}
      </section>

      <section className="mt-9">
        <h2 className="mb-3 text-[22px] font-bold">Informes</h2>
        <div className="mb-4 flex flex-wrap gap-2">
          <Chip activo={filtro === 'todos'} onClick={() => setFiltro('todos')} cantidad={a.informes.length}>
            Todos
          </Chip>
          <Chip activo={filtro === 'nuevos'} onClick={() => setFiltro('nuevos')} cantidad={nuevos}>
            Nuevos
          </Chip>
          {AGENTES.map((d) => (
            <Chip key={d.id} activo={filtro === d.id} onClick={() => setFiltro(d.id)}>
              {d.nombre.split(' ')[0]}
            </Chip>
          ))}
        </div>
        {visibles.length ? (
          <ul className="flex flex-col gap-2">
            {visibles.map((i) => (
              <FilaInforme key={i.id} i={i} onAbrir={() => abrir(i.id)} />
            ))}
          </ul>
        ) : (
          <EmptyState
            icono={<Bot className="size-8" />}
            titulo="Todavía no hay informes"
            texto="Cuando los agentes trabajen (solos o con “Correr ahora”) sus informes aparecen acá, y Jarvis te los cuenta en el briefing."
          />
        )}
      </section>

      <InformeDetalle informe={abierto} onCerrar={() => abrir(null)} onBorrar={a.borrar} />
    </div>
  )
}
