import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
  Maximize2,
  Minimize2,
  X,
} from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useAsistente } from '../features/asistente/useAsistente'
import { useMemoria } from '../features/asistente/useMemoria'
import { usePersonalidad } from '../features/asistente/usePersonalidad'
import { TarjetaAccion } from '../features/asistente/TarjetaAccion'
import { PersonalidadForm } from '../features/asistente/PersonalidadForm'
import { VozForm } from '../features/asistente/VozForm'
import { useConfigVoz } from '../features/asistente/useConfigVoz'
import { useVoz } from '../features/asistente/useVoz'
import { useReconocimientoVoz } from '../features/asistente/useReconocimientoVoz'
import { useManosLibres } from '../features/asistente/useManosLibres'
import { Onda, type EstadoNucleo } from '../features/asistente/Nucleo'
import { RedNeural, type NodoRed } from '../features/asistente/RedNeural'
import { HudTele } from '../features/asistente/HudTele'
import { ListaAgentes, PanelMision, RegistroMision, ResultadoMision } from '../features/asistente/PanelMision'
import { useMisiones } from '../features/asistente/useMisiones'
import { PanelPantalla, type DestinoPantalla } from '../features/asistente/PanelPantalla'
import { ETAPAS_ABIERTAS } from '../types/db'
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
  const { filas: reuniones, recargar: recargarReuniones } = useReuniones()
  const config = useConfigGrabaciones()
  const voz = useVoz()
  const { mensajes, pensando, consultando, acciones, tiempos, preguntar, resolverAccion } = useAsistente()
  const memoria = useMemoria()
  const personalidad = usePersonalidad()
  const [editandoPersonalidad, setEditandoPersonalidad] = useState(false)
  const configVoz = useConfigVoz()
  const [editandoVoz, setEditandoVoz] = useState(false)

  // Modo tele: la red ocupa toda la pantalla con los paneles flotando encima (para una tele o un monitor).
  // Si el navegador deja, además pide pantalla completa (en iPhone no existe: queda como pantalla fija igual).
  const hud = useRef<HTMLElement>(null)
  const [modoTele, setModoTele] = useState(false)
  const pidioPantallaCompleta = useRef(false)
  const entrarTele = useCallback(() => {
    setModoTele(true)
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void }
    pidioPantallaCompleta.current = true
    if (el.requestFullscreen) el.requestFullscreen().catch(() => (pidioPantallaCompleta.current = false))
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen()
    else pidioPantallaCompleta.current = false
  }, [])
  const salirTele = useCallback(() => {
    setModoTele(false)
    pidioPantallaCompleta.current = false
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  }, [])
  useEffect(() => {
    // Si sale de pantalla completa (Esc del navegador), sale también del modo tele
    const alCambiar = () => {
      const enPantallaCompleta = Boolean(document.fullscreenElement ?? (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement)
      if (!enPantallaCompleta && pidioPantallaCompleta.current) salirTele()
    }
    const alTecla = (e: KeyboardEvent) => e.key === 'Escape' && salirTele()
    document.addEventListener('fullscreenchange', alCambiar)
    document.addEventListener('webkitfullscreenchange', alCambiar)
    window.addEventListener('keydown', alTecla)
    return () => {
      document.removeEventListener('fullscreenchange', alCambiar)
      document.removeEventListener('webkitfullscreenchange', alCambiar)
      window.removeEventListener('keydown', alTecla)
    }
  }, [salirTele])

  // Pantallas que abre Jarvis ("mostrame la carpeta de Nova"): panel sobre la red en compu o modo tele; en el celular navega
  const navigate = useNavigate()
  const [pantalla, setPantalla] = useState<DestinoPantalla | null>(null)
  const modoTeleRef = useRef(modoTele)
  modoTeleRef.current = modoTele
  const mostrarPantalla = useCallback(
    (d: DestinoPantalla) => {
      if (modoTeleRef.current || window.matchMedia('(min-width: 1024px)').matches) setPantalla(d)
      else navigate(d.ruta)
    },
    [navigate],
  )

  // Misiones de agentes: al terminar, Jarvis lo dice
  const avisarMision = useRef<(texto: string) => void>(() => {})
  const misiones = useMisiones((m) => avisarMision.current(`Terminé la misión ${m.titulo ?? ''}. ${m.resumen ?? ''}`))
  const agentesRed = misiones.mision && misiones.mision.estado !== 'error' && misiones.mision.estado !== 'cancelada' ? misiones.agentes : []

  // Pendientes primero; después las últimas resueltas en esta sesión
  const accionesVisibles = [...acciones.filter((a) => a.estado === 'pendiente'), ...acciones.filter((a) => a.estado !== 'pendiente').slice(-3).reverse()]
  const resolver = async (id: string, que: 'confirmar' | 'cancelar') => {
    const a = await resolverAccion(id, que)
    if (a?.resultado && vozActiva) voz.decir(a.resultado)
    if (a?.estado === 'hecha') recargarReuniones()
  }

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

  // Cuando una misión termina: Jarvis lo dice (si está activo y con voz)
  avisarMision.current = (t: string) => {
    if (activado && vozActiva && !pensando) voz.decir(t)
  }

  const enviar = async (pregunta: string) => {
    if (!pregunta.trim() || pensando) return
    setTexto('')
    voz.callar()
    // La voz arranca con la primera oración, mientras sigue llegando el resto
    const vivo = vozActiva ? voz.enVivo() : null
    await preguntar(pregunta, { alTexto: (d) => vivo?.agregar(d), alReiniciar: () => vivo?.reiniciar(), alMostrar: mostrarPantalla, alMision: misiones.seguir })
    vivo?.terminar()
    memoria.recargar() // por si guardó algo nuevo
    recargarReuniones() // por si confirmó una reunión por voz
  }

  // Tocar para hablar (en el núcleo o el botón de micrófono)
  const ptt = useReconocimientoVoz((dicho) => enviar(dicho))
  // Manos libres: se pausa mientras piensa, habla o se usa "tocar para hablar"
  // Manos libres: mientras Jarvis habla sigue escuchando, pero solo "Jarvis…" (para interrumpirlo)
  const alOirManosLibres = (pregunta: string) => {
    const p = pregunta.trim()
    // "Jarvis" solo, o "Jarvis, pará": se calla y escucha
    if (!p || /^(par[aá]|basta|silencio|call[aá]te|stop|ya est[aá]|cort[aá])\b/i.test(p)) return voz.callar()
    enviar(p)
  }
  const manos = useManosLibres(alOirManosLibres, pensando || ptt.escuchando, voz.hablando)
  // Al terminar de hablar: unos segundos para seguir la charla sin repetir "Jarvis"
  const hablabaAntes = useRef(false)
  const manosRef = useRef(manos)
  manosRef.current = manos
  useEffect(() => {
    const terminoDeHablar = hablabaAntes.current && !voz.hablando
    hablabaAntes.current = voz.hablando
    if (!terminoDeHablar || !manosRef.current.activo) return
    const t = window.setTimeout(() => manosRef.current.esperarSeguimiento(), 350)
    return () => window.clearTimeout(t)
  }, [voz.hablando])

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
      ? consultando
        ? `Consultando ${consultando}…`
        : 'Pensando…'
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

  // Datos del hub que orbitan en la red
  const nodosRed = useMemo<NodoRed[]>(() => {
    const abiertos = (d.prospectos ?? []).filter((p) => ETAPAS_ABIERTAS.includes(p.etapa)).length
    return [
      { etiqueta: 'Hoy', valor: `${agendaHoy.length} ${agendaHoy.length === 1 ? 'tarea' : 'tareas'}` },
      { etiqueta: 'Clientes activos', valor: String(d.activos ?? 0) },
      { etiqueta: 'Pipeline', valor: `${abiertos} abiertos` },
      { etiqueta: 'Recurrente', valor: formatUSD(d.mrr ?? 0) },
      { etiqueta: 'Pendientes', valor: String(pendientesGrab) },
      { etiqueta: 'Memoria', valor: `${memoria.notas.length} notas` },
    ]
  }, [agendaHoy.length, d.prospectos, d.activos, d.mrr, pendientesGrab, memoria.notas.length])
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

        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
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
                <FilaEstado
                  label="Voz"
                  valor={!voz.disponible ? 'No disponible' : !vozActiva ? 'Silenciada' : voz.premium && voz.fuente !== 'dispositivo' ? 'Premium' : 'Del dispositivo'}
                  ok={voz.disponible ? vozActiva : false}
                />
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
            <section
              ref={hud}
              className={cn(
                'overflow-hidden bg-fondo',
                modoTele ? 'fixed inset-0 z-[70] h-dvh w-screen' : 'relative h-[420px] rounded-2xl border border-acento/25 sm:h-[480px] lg:h-[min(70vh,760px)]',
              )}
            >
              <RedNeural
                estado={estadoNucleo}
                nodos={modoTele || agentesRed.length ? [] : nodosRed}
                agentes={agentesRed}
                nivel={voz.nivel}
                intenso={modoTele}
                className="size-full"
              >
                {/* El núcleo se toca para activar o para hablar */}
                <button
                  onClick={activado ? tocarMicrofono : activar}
                  disabled={pensando}
                  className="absolute top-[47%] left-1/2 grid aspect-square w-[min(44vw,230px)] -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-acento-claro disabled:cursor-wait"
                  aria-label={activado ? (ptt.escuchando ? 'Terminar y preguntar' : 'Hablar con Jarvis') : 'Activar Jarvis'}
                >
                  <span className="pointer-events-none text-center drop-shadow-[0_0_12px_var(--color-acento)]">
                    <span className="block pl-[0.3em] font-display text-[clamp(16px,2.4vw,24px)] font-bold tracking-[0.3em] text-white">JARVIS</span>
                    <span className="mt-0.5 block pl-[0.25em] text-[9px] font-semibold tracking-[0.25em] text-acento-claro uppercase">brixx · hub</span>
                  </span>
                </button>

                {/* Modo tele (para una tele o un monitor) */}
                {!modoTele && (
                  <button
                    onClick={entrarTele}
                    className="absolute top-3 right-3 z-10 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-[11px] border border-acento/30 bg-fondo/60 px-3 text-sm font-semibold text-acento-claro backdrop-blur hover:text-white"
                    title="Modo tele: la red a pantalla completa con los paneles encima"
                  >
                    <Maximize2 className="size-4" /> Modo tele
                  </button>
                )}

                {modoTele && (
                  <HudTele
                    hora={ahora.toLocaleTimeString('es-AR', { hour12: false })}
                    fecha={ahora.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, (c) => c.toUpperCase())}
                    saludo={`${saludo}, ${miembro?.nombre.split(' ')[0] ?? ''}`}
                    metricas={[
                      { label: 'Cobrado', valor: formatUSD(d.cobrado ?? 0) },
                      {
                        label: 'Clientes nuevos',
                        valor: d.metasMes ? `${d.metasMes.clientes.actual}${d.metasMes.clientes.objetivo != null ? ` / ${d.metasMes.clientes.objetivo}` : ''}` : '—',
                      },
                      { label: 'Recurrente', valor: formatUSD(d.mrr ?? 0) },
                      { label: 'Por cobrar', valor: formatUSD(d.porCobrar ?? 0) },
                    ]}
                    filas={[
                      { label: 'Reuniones hoy', valor: String(agendaHoy.filter((a) => a.tipo === 'reunion').length), tono: 'acento' },
                      { label: 'Acciones de hoy', valor: String(agendaHoy.filter((a) => a.tipo === 'accion').length), tono: 'acento' },
                      { label: 'Pendientes', valor: String(pendientesGrab), tono: pendientesGrab ? 'aviso' : 'ok' },
                      { label: 'Para confirmar', valor: String(acciones.filter((a) => a.estado === 'pendiente').length), tono: acciones.some((a) => a.estado === 'pendiente') ? 'aviso' : 'ok' },
                      { label: 'Pipeline abierto', valor: String(d.abiertos ?? 0), tono: 'neutro' },
                      { label: 'Memoria', valor: `${memoria.notas.length} notas`, tono: 'neutro' },
                      { label: 'Voz', valor: voz.premium && voz.fuente !== 'dispositivo' ? 'Premium' : 'Dispositivo', tono: 'ok' },
                      { label: 'Escucha', valor: manos.activo ? 'Manos libres' : 'Tocar', tono: manos.activo ? 'ok' : 'neutro' },
                    ]}
                    subtitulo={!activado ? '' : voz.hablando && voz.frase ? voz.frase : pensando || ptt.escuchando || manos.estado === 'escuchando_pregunta' ? leyenda : ''}
                    confirmar={
                      accionesVisibles.some((a) => a.estado === 'pendiente') ? (
                        <div className="flex flex-col gap-2">
                          {accionesVisibles
                            .filter((a) => a.estado === 'pendiente')
                            .slice(0, 2)
                            .map((a) => (
                              <TarjetaAccion key={a.id} accion={a} onResolver={resolver} compacta />
                            ))}
                        </div>
                      ) : null
                    }
                    izquierda={
                      misiones.mision ? (
                        <div className="flex flex-col gap-2">
                          <p className="text-sm leading-snug font-semibold">{misiones.mision.titulo ?? misiones.mision.pedido}</p>
                          <ListaAgentes agentes={misiones.agentes} />
                        </div>
                      ) : undefined
                    }
                    derecha={misiones.activa ? <RegistroMision agentes={misiones.agentes} /> : undefined}
                    controles={
                      <>
                        {activado && ptt.disponible && (
                          <button
                            onClick={tocarMicrofono}
                            disabled={pensando}
                            className={cn(
                              'grid size-12 cursor-pointer place-items-center rounded-full border backdrop-blur disabled:opacity-50',
                              ptt.escuchando ? 'border-peligro bg-peligro/80 text-white' : 'border-acento/40 bg-fondo/60 text-acento-claro',
                            )}
                            aria-label={ptt.escuchando ? 'Terminar y preguntar' : 'Hablar'}
                          >
                            {ptt.escuchando ? <Square className="size-4" /> : <Mic className="size-5" />}
                          </button>
                        )}
                        {activado && manos.disponible && (
                          <button
                            onClick={() => (manos.activo ? manos.desactivar() : manos.activar())}
                            className={cn(
                              'grid size-12 cursor-pointer place-items-center rounded-full border backdrop-blur',
                              manos.activo ? 'border-ok/60 bg-ok-tenue text-ok' : 'border-acento/40 bg-fondo/60 text-acento-claro',
                            )}
                            aria-label={manos.activo ? 'Apagar manos libres' : 'Prender manos libres'}
                          >
                            {manos.activo ? <Ear className="size-5" /> : <EarOff className="size-5" />}
                          </button>
                        )}
                        <button
                          onClick={salirTele}
                          className="grid size-12 cursor-pointer place-items-center rounded-full border border-acento/40 bg-fondo/60 text-acento-claro backdrop-blur hover:text-white"
                          aria-label="Salir del modo tele"
                          title="Salir del modo tele"
                        >
                          <Minimize2 className="size-5" />
                        </button>
                      </>
                    }
                  />
                )}

                {/* Resultado de la misión, como panel sobre la red (modo tele) */}
                {modoTele && !pantalla && misiones.mision?.estado === 'lista' && (
                  <div className="absolute inset-x-2 top-24 bottom-32 z-20 flex flex-col overflow-hidden rounded-2xl border border-turquesa/40 bg-fondo/95 p-4 shadow-[0_0_60px_-15px_var(--color-turquesa)] backdrop-blur animate-aparecer md:inset-x-auto md:top-[12%] md:right-6 md:bottom-[16%] md:w-[min(46%,820px)]">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold tracking-[0.15em] text-turquesa uppercase">Misión lista · {misiones.mision.titulo}</span>
                      <button onClick={misiones.ocultar} className="grid size-8 cursor-pointer place-items-center rounded-lg text-suave hover:bg-elevada" aria-label="Cerrar resultado">
                        <X className="size-4" />
                      </button>
                    </div>
                    <ResultadoMision mision={misiones.mision} onEscuchar={(t) => voz.decir(t)} />
                  </div>
                )}

                {pantalla && (
                  <PanelPantalla
                    destino={pantalla}
                    tele={modoTele}
                    onCerrar={() => setPantalla(null)}
                    onAbrir={() => {
                      salirTele()
                      navigate(pantalla.ruta)
                    }}
                  />
                )}

                {/* Estado / activar */}
                <div className="absolute inset-x-0 bottom-4 flex flex-col items-center px-4">
                  {!activado ? (
                    <>
                      <button
                        onClick={activar}
                        className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full bg-acento px-6 font-semibold text-white shadow-[0_0_30px_-6px_var(--color-acento)] hover:bg-acento-fuerte"
                      >
                        <Zap className="size-5" /> Activar Jarvis
                      </button>
                      <p className="mt-2 max-w-sm text-center text-xs text-tenue">
                        Te saluda con el briefing del día{manos.disponible ? ' y queda escuchando: decí "Jarvis" y tu pregunta.' : '. Después tocá el núcleo para hablar.'}
                      </p>
                    </>
                  ) : (
                    <div className={cn('items-center gap-3 rounded-full bg-fondo/50 px-3 py-1 backdrop-blur', modoTele ? 'hidden md:flex' : 'flex')}>
                      <Onda activa={estadoNucleo === 'escuchando' || estadoNucleo === 'hablando'} />
                      <span className="text-sm font-semibold tracking-[0.15em] text-acento-claro uppercase">
                        {estadoNucleo === 'reposo' ? (manos.activo ? 'Escuchando "Jarvis"' : 'Listo') : estadoNucleo}
                      </span>
                      <Onda activa={estadoNucleo === 'escuchando' || estadoNucleo === 'hablando'} />
                    </div>
                  )}
                </div>
              </RedNeural>
            </section>

            {accionesVisibles.length > 0 && (
              <Panel titulo="Para confirmar">
                <div className="flex flex-col gap-2">
                  {accionesVisibles.map((a) => (
                    <TarjetaAccion key={a.id} accion={a} onResolver={resolver} />
                  ))}
                </div>
                {accionesVisibles.some((a) => a.estado === 'pendiente') && (
                  <p className="mt-2 text-xs text-tenue">También podés decirle "Jarvis, sí, dale" o "Jarvis, cancelalo".</p>
                )}
              </Panel>
            )}

            <Panel titulo="Misión">
              <PanelMision
                mision={misiones.mision}
                agentes={misiones.agentes}
                activa={misiones.activa}
                onCrear={misiones.crear}
                onCancelar={misiones.cancelar}
                onOcultar={misiones.ocultar}
                onEscuchar={(t) => voz.decir(t)}
              />
            </Panel>

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

            <Panel
              titulo="Personalidad"
              extra={
                personalidad.disponible ? (
                  <button onClick={() => setEditandoPersonalidad(true)} className="cursor-pointer text-xs font-semibold text-acento-texto hover:underline">
                    Editar
                  </button>
                ) : null
              }
            >
              <p className={cn('line-clamp-4 text-sm whitespace-pre-line', personalidad.texto ? 'text-suave' : 'text-tenue')}>
                {personalidad.texto || 'Escribí cómo querés que sea Jarvis: su tono, qué priorizar, qué evitar.'}
              </p>
            </Panel>

            <Panel
              titulo="Voz"
              extra={
                configVoz.disponible ? (
                  <button onClick={() => setEditandoVoz(true)} className="cursor-pointer text-xs font-semibold text-acento-texto hover:underline">
                    Cambiar
                  </button>
                ) : null
              }
            >
              <p className="text-sm text-suave">
                {configVoz.vozId ? `Voz elegida (${configVoz.vozId.slice(0, 6)}…)` : 'Daniel, la de ElevenLabs por defecto (acento británico)'}
                {' · '}
                {configVoz.modelo === 'eleven_multilingual_v2' ? 'más natural' : 'rápida'}
              </p>
            </Panel>

            <Panel titulo="Memoria">
              {memoria.notas.length ? (
                <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1">
                  {memoria.notas.map((n) => (
                    <li key={n.id} className="group flex items-start gap-2 text-sm text-suave">
                      <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-acento-texto" aria-hidden />
                      <span className="min-w-0 flex-1">{n.contenido}</span>
                      <button
                        onClick={() => memoria.borrar(n.id)}
                        className="cursor-pointer text-tenue opacity-60 hover:text-peligro hover:opacity-100"
                        aria-label={`Olvidar: ${n.contenido}`}
                        title="Olvidar"
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-tenue">Decile "Jarvis, recordá que…" y lo va a tener presente siempre.</p>
              )}
            </Panel>

            <Panel titulo="Conversación">
              {mensajes.length ? (
                <div className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
                  {mensajes.filter((m) => !(m.enCurso && !m.texto)).slice(-8).map((m) => (
                    <div key={m.id} className={cn('text-sm', m.rol === 'usuario' ? 'text-acento-claro' : m.error ? 'text-peligro' : 'text-suave')}>
                      <span className="mr-1.5 text-[10px] font-bold tracking-wider uppercase opacity-70">{m.rol === 'usuario' ? 'Vos' : 'Jarvis'}</span>
                      {m.texto}
                      {m.rol === 'asistente' && !m.error && !m.enCurso && voz.disponible && (
                        <button onClick={() => voz.decir(m.voz ?? m.texto)} className="ml-1.5 cursor-pointer align-middle text-tenue hover:text-texto" aria-label="Escuchar de nuevo">
                          <Volume2 className="inline size-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-tenue">Todavía no hablaron.</p>
              )}
              {tiempos && (
                <p className="mt-2 border-t border-borde pt-2 text-[11px] text-tenue" title={tiempos.servidor ? JSON.stringify(tiempos.servidor) : undefined}>
                  Última respuesta: {tiempos.primeraPalabra != null ? `empezó a los ${(tiempos.primeraPalabra / 1000).toFixed(1)} s · ` : ''}
                  completa a los {(tiempos.total / 1000).toFixed(1)} s
                  {tiempos.modelo ? ` · ${tiempos.modelo.includes('haiku') ? 'modelo rápido' : 'modelo de análisis'}` : ''}
                </p>
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
      <VozForm
        abierto={editandoVoz}
        vozId={configVoz.vozId}
        modelo={configVoz.modelo}
        onCerrar={() => setEditandoVoz(false)}
        onGuardar={configVoz.guardar}
        onProbar={configVoz.probar}
      />
      <PersonalidadForm
        abierto={editandoPersonalidad}
        texto={personalidad.texto}
        onCerrar={() => setEditandoPersonalidad(false)}
        onGuardar={personalidad.guardar}
      />
    </div>
  )
}
