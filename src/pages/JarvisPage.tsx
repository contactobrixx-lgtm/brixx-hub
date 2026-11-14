import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarClock,
  Ear,
  EarOff,
  Info,
  Mic,
  OctagonAlert,
  Send,
  Square,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useAsistente } from '../features/asistente/useAsistente'
import { useVoz } from '../features/asistente/useVoz'
import { useReconocimientoVoz } from '../features/asistente/useReconocimientoVoz'
import { useManosLibres } from '../features/asistente/useManosLibres'
import { Nucleo, Onda, type EstadoNucleo } from '../features/asistente/Nucleo'
import { useDashboard } from '../features/inicio/useDashboard'
import { useReuniones } from '../features/calendario/useReuniones'
import { useConfigGrabaciones } from '../features/grabaciones/useGrabaciones'
import { Input } from '../components/ui/Field'
import { cn } from '../components/ui/cn'
import { formatHora, formatUSD, hoyISO, isoLocal } from '../lib/format'

const COMANDOS = [
  { label: 'Briefing del día', pregunta: 'Dame el briefing de hoy: qué tengo que hacer y qué es lo más importante.' },
  { label: 'Última reunión', pregunta: '¿Qué se sabe de la última reunión que grabé?' },
  { label: 'Pendientes', pregunta: '¿Qué tengo pendiente?' },
  { label: 'Meta del mes', pregunta: '¿Cómo vamos con la meta del mes?' },
]

const CLAVE_VOZ = 'brixx-asistente-voz'

function Panel({ titulo, children, className, extra }: { titulo: string; children: ReactNode; className?: string; extra?: ReactNode }) {
  return (
    <section className={cn('relative rounded-2xl border border-acento/25 bg-superficie/80 p-4 shadow-[inset_0_1px_0_0_var(--color-acento-tenue)] backdrop-blur', className)}>
      <div className="mb-3 flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-acento shadow-[0_0_8px_var(--color-acento)]" />
        <h2 className="mr-auto font-sans text-xs font-semibold tracking-[0.18em] text-acento-claro uppercase">{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  )
}

function FilaEstado({ label, valor, ok }: { label: string; valor: string; ok: boolean | null }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-elevada/70 px-3 py-2 text-sm">
      <span className="text-suave">{label}</span>
      <span className={cn('flex items-center gap-1.5 font-medium', ok === true ? 'text-ok' : ok === false ? 'text-aviso' : 'text-tenue')}>
        <span className={cn('size-1.5 rounded-full', ok === true ? 'bg-ok' : ok === false ? 'bg-aviso' : 'bg-tenue')} />
        {valor}
      </span>
    </div>
  )
}

const ICONO = { peligro: OctagonAlert, aviso: AlertTriangle, info: Info }
const TONO = { peligro: 'text-peligro', aviso: 'text-aviso', info: 'text-acento-texto' }

export function JarvisPage() {
  const { miembro } = useAuth()
  const d = useDashboard('mes')
  const { filas: reuniones } = useReuniones()
  const config = useConfigGrabaciones()
  const voz = useVoz()
  const { mensajes, pensando, preguntar } = useAsistente()

  const [activado, setActivado] = useState(false)
  const [texto, setTexto] = useState('')
  const [ahora, setAhora] = useState(new Date())
  const [vozActiva, setVozActiva] = useState(() => {
    try {
      return localStorage.getItem(CLAVE_VOZ) !== 'no'
    } catch {
      return true
    }
  })

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_VOZ, vozActiva ? 'si' : 'no')
    } catch {
      /* sin almacenamiento */
    }
  }, [vozActiva])

  const enviar = async (pregunta: string) => {
    if (!pregunta.trim() || pensando) return
    setTexto('')
    voz.callar()
    const respuesta = await preguntar(pregunta)
    if (respuesta && vozActiva) voz.decir(respuesta)
  }

  // Tocar para hablar (en el núcleo o el botón de micrófono)
  const ptt = useReconocimientoVoz((dicho) => enviar(dicho))
  // Manos libres: se pausa mientras piensa, habla o se usa "tocar para hablar"
  const manos = useManosLibres((pregunta) => enviar(pregunta), pensando || voz.hablando || ptt.escuchando)

  const activar = () => {
    voz.destrabar()
    setActivado(true)
    enviar('Hola Jarvis, dame el briefing de hoy.')
    if (manos.disponible) manos.activar()
  }

  const tocarMicrofono = () => {
    voz.destrabar()
    voz.callar()
    if (!activado) setActivado(true)
    if (ptt.escuchando) ptt.terminar()
    else ptt.escuchar()
  }

  const enviarTexto = (e: FormEvent) => {
    e.preventDefault()
    voz.destrabar()
    if (!activado) setActivado(true)
    enviar(texto)
  }

  const estadoNucleo: EstadoNucleo = !activado
    ? 'inactivo'
    : pensando
      ? 'pensando'
      : voz.hablando
        ? 'hablando'
        : ptt.escuchando || manos.estado === 'escuchando_pregunta'
          ? 'escuchando'
          : 'reposo'

  const leyenda = !activado
    ? 'Tocá "Activar Jarvis" para empezar.'
    : pensando
      ? 'Pensando…'
      : voz.hablando
        ? 'Hablando…'
        : ptt.escuchando
          ? ptt.parcial || 'Te escucho… tocá de nuevo para mandar.'
          : manos.estado === 'escuchando_pregunta'
            ? manos.parcial || 'Te escucho…'
            : manos.activo
              ? 'Decí "Jarvis" y tu pregunta.'
              : 'Tocá el micrófono para hablar.'

  // Agenda de hoy: reuniones + próximas acciones
  const hoy = hoyISO()
  const agendaHoy = useMemo(() => {
    const r = reuniones
      .filter((x) => isoLocal(new Date(x.inicio)) === hoy)
      .map((x) => ({ hora: formatHora(new Date(x.inicio)), texto: x.titulo, tipo: 'reunion' as const }))
    const a = d.prospectos
      .filter((p) => p.etapa !== 'perdido' && p.fecha_proxima_accion === hoy && p.proxima_accion)
      .map((p) => ({ hora: 'Hoy', texto: `${p.empresa || p.nombre}: ${p.proxima_accion}`, tipo: 'accion' as const }))
    return [...r, ...a]
  }, [reuniones, d.prospectos, hoy])

  const ultima = [...mensajes].reverse().find((m) => m.rol === 'asistente')
  const ultimaPregunta = [...mensajes].reverse().find((m) => m.rol === 'usuario')
  const pendientesGrab = (d.pendientes ?? []).length
  const saludo = ahora.getHours() < 12 ? 'Buen día' : ahora.getHours() < 20 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div className="relative min-h-full overflow-hidden bg-fondo px-4 pt-5 pb-28 md:px-8 md:pb-8">
      {/* Fondo de grilla tenue */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(var(--color-acento) 1px, transparent 1px), linear-gradient(90deg, var(--color-acento) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      <div className="pointer-events-none absolute top-[-20%] left-1/2 size-[700px] -translate-x-1/2 rounded-full bg-acento/10 blur-[140px]" />

      <div className="relative mx-auto max-w-[1400px]">
        {/* Encabezado */}
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs font-semibold tracking-[0.3em] text-acento-claro uppercase">Centro de comando</div>
            <h1 className="text-[28px] leading-tight font-bold">
              {saludo}, {miembro?.nombre.split(' ')[0]}
            </h1>
          </div>
          <div className="sm:text-right">
            <div className="text-sm text-tenue">
              {ahora
                .toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                .replace(/^./, (c) => c.toUpperCase())}
            </div>
            <div className="tabular font-display text-[32px] leading-none font-bold tracking-wide">
              {ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
            </div>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
          {/* Izquierda: estado */}
          <div className="order-2 flex flex-col gap-4 lg:order-1">
            <Panel titulo="Estado del sistema">
              <div className="flex flex-col gap-1.5">
                <FilaEstado label="Jarvis" valor={activado ? 'Activo' : 'En espera'} ok={activado ? true : null} />
                <FilaEstado
                  label="Escucha"
                  valor={manos.activo ? 'Manos libres' : ptt.disponible ? 'Tocar para hablar' : 'Solo teclado'}
                  ok={manos.activo ? true : ptt.disponible ? null : false}
                />
                <FilaEstado label="Voz" valor={voz.disponible ? (vozActiva ? 'Activada' : 'Silenciada') : 'No disponible'} ok={voz.disponible ? vozActiva : false} />
                <FilaEstado
                  label="Claude"
                  valor={config == null ? '…' : config.funcion && config.anthropic ? 'Conectado' : 'Sin clave'}
                  ok={config == null ? null : config.funcion && config.anthropic}
                />
                <FilaEstado
                  label="Transcripción"
                  valor={config == null ? '…' : config.funcion && config.assemblyai ? 'Conectada' : 'Sin clave'}
                  ok={config == null ? null : config.funcion && config.assemblyai}
                />
              </div>
            </Panel>
            <Panel titulo="Resumen">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Clientes activos', valor: String(d.activos ?? 0) },
                  { label: 'Ingreso recurrente', valor: formatUSD(d.mrr ?? 0) },
                  {
                    label: 'Clientes del mes',
                    valor: d.metasMes ? `${d.metasMes.clientes.actual}${d.metasMes.clientes.objetivo != null ? ` / ${d.metasMes.clientes.objetivo}` : ''}` : '—',
                  },
                  { label: 'Pendientes', valor: String(pendientesGrab) },
                ].map((k) => (
                  <div key={k.label} className="rounded-lg bg-elevada/70 px-3 py-2.5">
                    <div className="text-[11px] text-tenue">{k.label}</div>
                    <div className="tabular font-display text-xl font-bold">{k.valor}</div>
                  </div>
                ))}
              </div>
              {d.metasMes && (
                <p className="mt-3 text-xs text-tenue">
                  Faltan {d.metasMes.diasRestantes} días para cerrar {d.metasMes.periodo.etiqueta.toLowerCase()}.
                </p>
              )}
            </Panel>
          </div>

          {/* Centro: núcleo, comandos y agenda */}
          <div className="order-1 flex min-w-0 flex-col gap-4 lg:order-2">
            <section className="relative flex flex-col items-center rounded-2xl border border-acento/25 bg-superficie/60 px-4 pt-6 pb-5 backdrop-blur">
              <button
                onClick={activado ? tocarMicrofono : activar}
                disabled={pensando}
                className="w-full max-w-[300px] cursor-pointer rounded-full disabled:cursor-wait"
                aria-label={activado ? (ptt.escuchando ? 'Terminar y preguntar' : 'Hablar con Jarvis') : 'Activar Jarvis'}
              >
                <Nucleo estado={estadoNucleo} />
              </button>

              {!activado ? (
                <button
                  onClick={activar}
                  className="mt-4 inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full bg-acento px-6 font-semibold text-white shadow-[0_0_30px_-6px_var(--color-acento)] hover:bg-acento-fuerte"
                >
                  <Zap className="size-5" /> Activar Jarvis
                </button>
              ) : (
                <div className="mt-3 flex items-center gap-3">
                  <Onda activa={estadoNucleo === 'escuchando' || estadoNucleo === 'hablando'} />
                  <span className="text-sm font-semibold tracking-[0.15em] text-acento-claro uppercase">
                    {estadoNucleo === 'reposo' ? (manos.activo ? 'Escuchando "Jarvis"' : 'Listo') : estadoNucleo}
                  </span>
                  <Onda activa={estadoNucleo === 'escuchando' || estadoNucleo === 'hablando'} />
                </div>
              )}
              {!activado && (
                <p className="mt-3 max-w-sm text-center text-sm text-tenue">
                  Te saluda con el briefing del día y queda escuchando: decí "Jarvis" y tu pregunta.
                  {!manos.disponible && ' En este dispositivo, tocá el núcleo para hablar.'}
                </p>
              )}
            </section>

            <Panel titulo="Comandos rápidos">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {COMANDOS.map((c) => (
                  <button
                    key={c.label}
                    onClick={() => {
                      voz.destrabar()
                      if (!activado) setActivado(true)
                      enviar(c.pregunta)
                    }}
                    disabled={pensando}
                    className="min-h-11 cursor-pointer rounded-xl border border-acento/30 bg-acento-tenue/60 px-3 py-2 text-sm font-semibold text-acento-claro transition-colors hover:border-acento hover:bg-acento-tenue disabled:opacity-50"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </Panel>

            <Panel titulo="Agenda de hoy" extra={<Link to="/calendario" className="text-xs font-semibold text-acento-texto hover:underline">Calendario</Link>}>
              {agendaHoy.length ? (
                <ol className="relative ml-2 border-l border-acento/30">
                  {agendaHoy.map((a, i) => (
                    <li key={i} className="relative mb-3 ml-4 last:mb-0">
                      <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-fondo bg-acento" />
                      <span className="tabular mr-2 text-sm font-semibold text-acento-texto">{a.hora}</span>
                      <span className="text-sm">{a.texto}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-tenue">Nada agendado para hoy.</p>
              )}
            </Panel>
          </div>

          {/* Derecha: feed y conversación */}
          <div className="order-3 flex flex-col gap-4">
            <Panel titulo="Feed del día" extra={<span className="rounded bg-ok-tenue px-1.5 py-0.5 text-[10px] font-bold text-ok">EN VIVO</span>}>
              {d.pendientes?.length ? (
                <ul className="flex flex-col gap-1.5">
                  {d.pendientes.slice(0, 7).map((p, i) => {
                    const I = ICONO[p.tono]
                    return (
                      <li key={i}>
                        <Link to={p.ir} className="flex items-start gap-2.5 rounded-lg bg-elevada/70 px-3 py-2 hover:bg-hover">
                          <I className={cn('mt-0.5 size-4 shrink-0', TONO[p.tono])} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">{p.titulo}</span>
                            <span className="block truncate text-xs text-tenue">{p.detalle}</span>
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-sm text-tenue">Todo al día.</p>
              )}
              {d.proximas?.length ? (
                <div className="mt-3 flex items-center gap-2 border-t border-borde pt-3 text-xs text-tenue">
                  <CalendarClock className="size-3.5" /> Próxima reunión: {d.proximas[0].titulo},{' '}
                  {new Date(d.proximas[0].inicio).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' })} {formatHora(new Date(d.proximas[0].inicio))}
                </div>
              ) : null}
            </Panel>

            <Panel titulo="Conversación">
              {mensajes.length ? (
                <div className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
                  {mensajes.slice(-8).map((m) => (
                    <div key={m.id} className={cn('text-sm', m.rol === 'usuario' ? 'text-acento-claro' : m.error ? 'text-peligro' : 'text-suave')}>
                      <span className="mr-1.5 text-[10px] font-bold tracking-wider uppercase opacity-70">{m.rol === 'usuario' ? 'Vos' : 'Jarvis'}</span>
                      {m.texto}
                      {m.rol === 'asistente' && !m.error && voz.disponible && (
                        <button onClick={() => voz.decir(m.texto)} className="ml-1.5 cursor-pointer align-middle text-tenue hover:text-texto" aria-label="Escuchar de nuevo">
                          <Volume2 className="inline size-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-tenue">Todavía no hablaron.</p>
              )}
            </Panel>
          </div>
        </div>

        {/* Barra "Hablá con Jarvis" */}
        <section className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 px-3 md:static md:mt-4 md:px-0">
          <div className="mx-auto max-w-[1400px] rounded-2xl border border-acento/40 bg-superficie/95 p-3 shadow-[0_0_40px_-12px_var(--color-acento)] backdrop-blur md:p-4">
            <div className="mb-2 flex min-h-6 items-start gap-2 text-sm" aria-live="polite">
              <span className="shrink-0 text-[10px] font-bold tracking-[0.2em] text-acento-claro uppercase">Hablá con Jarvis</span>
              <span className="min-w-0 flex-1 truncate text-suave md:whitespace-normal">
                {pensando || ptt.escuchando || manos.estado === 'escuchando_pregunta' || !ultima
                  ? leyenda
                  : `${ultimaPregunta ? `«${ultimaPregunta.texto}» — ` : ''}${ultima.texto}`}
              </span>
            </div>
            {(manos.error || ptt.error) && <p className="mb-2 text-xs text-aviso">{manos.error ?? ptt.error}</p>}
            <form onSubmit={enviarTexto} className="flex items-center gap-2">
              {ptt.disponible && (
                <button
                  type="button"
                  onClick={tocarMicrofono}
                  disabled={pensando}
                  className={cn(
                    'grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-white transition-transform active:scale-95 disabled:opacity-50',
                    ptt.escuchando ? 'animate-pulse bg-peligro' : 'bg-acento hover:bg-acento-fuerte',
                  )}
                  aria-label={ptt.escuchando ? 'Terminar y preguntar' : 'Hablar'}
                >
                  {ptt.escuchando ? <Square className="size-4 fill-current" /> : <Mic className="size-5" />}
                </button>
              )}
              {manos.disponible && (
                <button
                  type="button"
                  onClick={() => (manos.activo ? manos.desactivar() : (voz.destrabar(), setActivado(true), manos.activar()))}
                  className={cn(
                    'grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border transition-colors',
                    manos.activo ? 'border-ok/50 bg-ok-tenue text-ok' : 'border-borde-fuerte text-tenue hover:text-texto',
                  )}
                  aria-label={manos.activo ? 'Apagar manos libres' : 'Prender manos libres'}
                  aria-pressed={manos.activo}
                  title={manos.activo ? 'Manos libres: prendido' : 'Manos libres: apagado'}
                >
                  {manos.activo ? <Ear className="size-5" /> : <EarOff className="size-5" />}
                </button>
              )}
              <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="O escribí tu pregunta…" aria-label="Pregunta" />
              {voz.hablando ? (
                <button
                  type="button"
                  onClick={voz.callar}
                  className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border border-peligro/40 bg-peligro-tenue text-peligro"
                  aria-label="Frenar lectura"
                >
                  <Square className="size-4 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setVozActiva((v) => !v)}
                  className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border border-borde-fuerte text-tenue hover:text-texto"
                  aria-label={vozActiva ? 'Silenciar la voz' : 'Activar la voz'}
                  aria-pressed={vozActiva}
                >
                  {vozActiva ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
                </button>
              )}
              <button
                type="submit"
                disabled={!texto.trim() || pensando}
                className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full bg-acento text-white disabled:opacity-40"
                aria-label="Enviar"
              >
                <Send className="size-4" />
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  )
}
