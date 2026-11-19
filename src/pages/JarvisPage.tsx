import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Ear,
  EarOff,
  Globe2,
  Info,
  Presentation,
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
import { ENERGIAS_VOZ, useConfigVoz } from '../features/asistente/useConfigVoz'
import { useVoz } from '../features/asistente/useVoz'
import { useReconocimientoVoz } from '../features/asistente/useReconocimientoVoz'
import { useManosLibres } from '../features/asistente/useManosLibres'
import { Onda, type EstadoNucleo } from '../features/asistente/Nucleo'
import { RedNeural, type NodoRed } from '../features/asistente/RedNeural'
import { HudTele } from '../features/asistente/HudTele'
import { ListaAgentes, PanelMision, RegistroMision, ResultadoMision } from '../features/asistente/PanelMision'
import { useMisiones } from '../features/asistente/useMisiones'
import { useDemo } from '../features/asistente/useDemo'
import { EscenaDemo } from '../features/asistente/EscenaDemo'
import { useInformesRecientes } from '../features/agentes/useAgentes'
import { DESCRIPCION } from '../features/agentes/catalogo'
import { ESTADO_DEMO, METRICAS_DEMO, pideDemo, type TipoDemo } from '../features/asistente/demo'
import { PanelPantalla, type DestinoPantalla } from '../features/asistente/PanelPantalla'
import { ETAPAS_ABIERTAS, type AvisoMapa } from '../types/db'
import { MapaForm } from '../features/mapa/MapaForm'
import { useClaveMapa } from '../features/mapa/useMapa'
// El mapa (MapLibre) pesa: se carga recién cuando se abre
const MapaJarvis = lazy(() => import('../features/mapa/MapaJarvis'))
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
  { label: 'Demo explicada', pregunta: 'Jarvis, modo demo' },
  { label: 'Demo en acción', pregunta: 'Jarvis, modo show' },
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
  const informes = useInformesRecientes(4)
  const personalidad = usePersonalidad()
  const [editandoPersonalidad, setEditandoPersonalidad] = useState(false)
  const configVoz = useConfigVoz()
  const [editandoVoz, setEditandoVoz] = useState(false)
  // Modo mapa: abierto con un aviso de Jarvis (búsqueda o lugar). version cambia en cada aviso para reaccionar aunque sea el mismo.
  const [mapa, setMapa] = useState<(AvisoMapa & { version: number }) | null>(null)
  const [configurandoMapa, setConfigurandoMapa] = useState(false)
  const claveMapa = useClaveMapa()
  const [params, setParams] = useSearchParams()
  const abrirMapa = useCallback((aviso: AvisoMapa = {}) => setMapa((m) => ({ ...aviso, version: (m?.version ?? 0) + 1 })), [])
  // Desde otra pantalla, el asistente manda a /jarvis?mapa=<búsqueda> (o =1)
  useEffect(() => {
    const p = params.get('mapa')
    if (!p) return
    abrirMapa(p === '1' ? {} : { busqueda_id: p })
    params.delete('mapa')
    setParams(params, { replace: true })
  }, [params, setParams, abrirMapa])

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
  const alSalirTele = useRef<() => void>(() => {})
  const salirTele = useCallback(() => {
    alSalirTele.current() // si estaba el demo, termina
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
  const agentesMision = misiones.mision && misiones.mision.estado !== 'error' && misiones.mision.estado !== 'cancelada' ? misiones.agentes : []

  // Pendientes primero; después las últimas resueltas en esta sesión
  const accionesVisibles = [...acciones.filter((a) => a.estado === 'pendiente'), ...acciones.filter((a) => a.estado !== 'pendiente').slice(-3).reverse()]
  const resolver = async (id: string, que: 'confirmar' | 'cancelar') => {
    const a = await resolverAccion(id, que)
    if (a?.resultado && vozActiva) voz.decir(a.resultado)
    if (a?.estado === 'hecha') recargarReuniones()
  }

  const [activado, setActivado] = useState(false)
  const [eligiendoDemo, setEligiendoDemo] = useState(false)
  const [texto, setTexto] = useState('')
  const [ahora, setAhora] = useState(new Date())
  const [vozActiva, setVozActiva] = useState(() => {
    try {
      return localStorage.getItem(CLAVE_VOZ) !== 'no'
    } catch {
      return true
    }
  })

  // Modo demo ("Jarvis, modo demo"): recorrido con datos inventados que va abriendo las pantallas del hub
  const demo = useDemo(voz, vozActiva && voz.disponible, setPantalla)
  alSalirTele.current = demo.salir
  const demoActivo = useRef(demo.activo)
  demoActivo.current = demo.activo
  const agentesRed = demo.activo && demo.agentes.length ? demo.agentes : demo.activo ? [] : agentesMision

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

  const iniciarDemo = (tipo: TipoDemo) => {
    setEligiendoDemo(false)
    voz.destrabar()
    setActivado(true)
    setTexto('')
    if (!modoTeleRef.current) entrarTele()
    demo.iniciar(tipo)
  }

  const enviar = async (pregunta: string) => {
    const tipoDemo = pideDemo(pregunta)
    if (tipoDemo) return iniciarDemo(tipoDemo)
    if (!pregunta.trim() || pensando) return
    if (demo.activo) demo.salir()
    setTexto('')
    voz.callar()
    // La voz arranca con la primera oración, mientras sigue llegando el resto
    const vivo = vozActiva ? voz.enVivo() : null
    await preguntar(pregunta, { alTexto: (d) => vivo?.agregar(d), alReiniciar: () => vivo?.reiniciar(), alMostrar: mostrarPantalla, alMision: misiones.seguir, alMapa: abrirMapa })
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
    // En el demo: "Jarvis, siguiente" / "anterior"; cualquier otra cosa lo termina
    if (demoActivo.current) {
      if (/^(siguiente|segu[ií]|dale|pas[aá])\b/i.test(p)) return demo.siguiente()
      if (/^(anterior|volv[eé]|atr[aá]s)\b/i.test(p)) return demo.anterior()
      demo.salir()
    }
    // "Jarvis" solo, o "Jarvis, pará": se calla y escucha
    if (!p || /^(par[aá]|basta|silencio|call[aá]te|stop|ya est[aá]|cort[aá])\b/i.test(p)) return voz.callar()
    enviar(p)
  }
  const manos = useManosLibres(alOirManosLibres, pensando || ptt.escuchando, voz.hablando || demo.activo)
  // Al terminar de hablar: unos segundos para seguir la charla sin repetir "Jarvis"
  const hablabaAntes = useRef(false)
  const manosRef = useRef(manos)
  manosRef.current = manos
  useEffect(() => {
    const terminoDeHablar = hablabaAntes.current && !voz.hablando
    hablabaAntes.current = voz.hablando
    if (!terminoDeHablar || !manosRef.current.activo || demoActivo.current) return
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
    if (demo.activo) demo.salir() // hablarle corta el demo
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


  // Próxima reunión (para el cartel de tiempo del mapa)
  const proximaReunion = useMemo(() => {
    const desde = ahora.getTime() - 15 * 60_000
    const r = reuniones
      .map((x) => ({ titulo: x.titulo, inicio: new Date(x.inicio) }))
      .filter((x) => x.inicio.getTime() >= desde)
      .sort((a, b) => a.inicio.getTime() - b.inicio.getTime())[0]
    return r ?? null
    // Se recalcula cada minuto, no cada segundo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reuniones, Math.floor(ahora.getTime() / 60_000)])

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
    <div className="relative min-h-full overflow-hidden bg-fondo px-4 pt-4 pb-28 md:px-8 md:pt-5 md:pb-8 [@media(max-height:520px)]:pb-6">
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
        <header className="mb-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-1 md:mb-5 [@media(max-height:520px)]:mb-2">
          <div>
            <div className="hidden text-xs font-semibold tracking-[0.3em] text-acento-claro uppercase sm:block [@media(max-height:520px)]:hidden">Centro de comando</div>
            <h1 className="text-[22px] leading-tight font-bold sm:text-[28px] [@media(max-height:520px)]:text-[20px]">
              {saludo}, {miembro?.nombre.split(' ')[0]}
            </h1>
          </div>
          <div className="flex items-baseline gap-2 sm:block sm:text-right [@media(max-height:520px)]:flex">
            <div className="text-xs text-tenue sm:text-sm">
              {ahora
                .toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                .replace(/^./, (c) => c.toUpperCase())}
            </div>
            <div className="tabular font-display text-[17px] leading-none font-bold tracking-wide sm:text-[32px] [@media(max-height:520px)]:text-[17px]">
              {ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
            </div>
          </div>
        </header>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
          {/* Izquierda: estado */}
          <div className="order-2 flex min-w-0 flex-col gap-4 lg:order-1">
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
                modoTele ? 'fixed inset-0 z-[70] h-dvh w-screen' : 'relative h-[clamp(300px,calc(100svh-330px),520px)] rounded-2xl border border-acento/25 sm:h-[480px] lg:h-[min(70vh,760px)] [@media(max-height:520px)]:h-[calc(100svh-70px)] [@media(max-height:520px)]:min-h-[220px]',
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
                  <div className="absolute top-3 right-3 z-10 flex gap-2">
                    <button
                      onClick={() => abrirMapa()}
                      className="inline-flex min-h-10 min-w-10 cursor-pointer items-center justify-center gap-2 rounded-[11px] border border-acento/30 bg-fondo/60 px-2.5 text-sm font-semibold text-acento-claro backdrop-blur hover:text-white sm:px-3"
                      title="Mapa: Tucumán en 3D y los negocios que Jarvis busque"
                      aria-label="Mapa"
                    >
                      <Globe2 className="size-4" /> <span className="hidden sm:inline">Mapa</span>
                    </button>
                    <div className="relative">
                      <button
                        onClick={() => setEligiendoDemo((v) => !v)}
                        className="inline-flex min-h-10 min-w-10 cursor-pointer items-center justify-center gap-2 rounded-[11px] border border-acento/30 bg-fondo/60 px-2.5 text-sm font-semibold text-acento-claro backdrop-blur hover:text-white sm:px-3"
                        title="Modo demo: el hub con datos inventados, para mostrarlo o aprender a usarlo"
                        aria-expanded={eligiendoDemo}
                        aria-label="Demo"
                      >
                        <Presentation className="size-4" /> <span className="hidden sm:inline">Demo</span>
                      </button>
                      {eligiendoDemo && (
                        <div className="absolute top-12 right-0 flex w-64 flex-col gap-1 rounded-xl border border-acento/30 bg-superficie/95 p-1.5 shadow-[0_0_40px_-12px_var(--color-acento)] backdrop-blur animate-aparecer">
                          {[
                            { tipo: 'actuada' as const, titulo: 'En acción', detalle: 'Jarvis te cuenta su día: qué hizo, qué hay hoy y qué preparó.' },
                            { tipo: 'tutorial' as const, titulo: 'Explicada', detalle: 'Recorre cada pantalla y explica cómo usarla.' },
                          ].map((o) => (
                            <button key={o.tipo} onClick={() => iniciarDemo(o.tipo)} className="cursor-pointer rounded-lg px-3 py-2 text-left hover:bg-elevada">
                              <span className="block text-sm font-semibold">{o.titulo}</span>
                              <span className="block text-xs text-tenue">{o.detalle}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={entrarTele}
                      className="inline-flex min-h-10 min-w-10 cursor-pointer items-center justify-center gap-2 rounded-[11px] border border-acento/30 bg-fondo/60 px-2.5 text-sm font-semibold text-acento-claro backdrop-blur hover:text-white sm:px-3"
                      title="Modo tele: la red a pantalla completa con los paneles encima"
                      aria-label="Modo tele"
                    >
                      <Maximize2 className="size-4" /> <span className="hidden sm:inline">Modo tele</span>
                    </button>
                  </div>
                )}

                {modoTele && (
                  <HudTele
                    hora={ahora.toLocaleTimeString('es-AR', { hour12: false })}
                    fecha={ahora.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, (c) => c.toUpperCase())}
                    saludo={demo.activo ? 'Modo demo · datos inventados' : `${saludo}, ${miembro?.nombre.split(' ')[0] ?? ''}`}
                    metricas={demo.activo ? METRICAS_DEMO : [
                      { label: 'Cobrado', valor: formatUSD(d.cobrado ?? 0) },
                      {
                        label: 'Clientes nuevos',
                        valor: d.metasMes ? `${d.metasMes.clientes.actual}${d.metasMes.clientes.objetivo != null ? ` / ${d.metasMes.clientes.objetivo}` : ''}` : '—',
                      },
                      { label: 'Recurrente', valor: formatUSD(d.mrr ?? 0) },
                      { label: 'Por cobrar', valor: formatUSD(d.porCobrar ?? 0) },
                    ]}
                    filas={demo.activo ? [
                      { label: 'Reuniones hoy', valor: String(ESTADO_DEMO.reuniones), tono: 'acento' },
                      { label: 'Acciones de hoy', valor: String(ESTADO_DEMO.acciones), tono: 'acento' },
                      { label: 'Pendientes', valor: String(ESTADO_DEMO.pendientes), tono: 'aviso' },
                      { label: 'Pipeline abierto', valor: String(ESTADO_DEMO.pipeline), tono: 'neutro' },
                      { label: 'Memoria', valor: `${ESTADO_DEMO.memoria} notas`, tono: 'neutro' },
                      { label: 'Voz', valor: !vozActiva ? 'Silenciada' : voz.premium && voz.fuente !== 'dispositivo' ? 'Premium' : 'Dispositivo', tono: vozActiva ? 'ok' : 'aviso' },
                    ] : [
                      { label: 'Reuniones hoy', valor: String(agendaHoy.filter((a) => a.tipo === 'reunion').length), tono: 'acento' },
                      { label: 'Acciones de hoy', valor: String(agendaHoy.filter((a) => a.tipo === 'accion').length), tono: 'acento' },
                      { label: 'Pendientes', valor: String(pendientesGrab), tono: pendientesGrab ? 'aviso' : 'ok' },
                      { label: 'Para confirmar', valor: String(acciones.filter((a) => a.estado === 'pendiente').length), tono: acciones.some((a) => a.estado === 'pendiente') ? 'aviso' : 'ok' },
                      { label: 'Pipeline abierto', valor: String(d.abiertos ?? 0), tono: 'neutro' },
                      { label: 'Memoria', valor: `${memoria.notas.length} notas`, tono: 'neutro' },
                      { label: 'Voz', valor: voz.premium && voz.fuente !== 'dispositivo' ? 'Premium' : 'Dispositivo', tono: 'ok' },
                      { label: 'Escucha', valor: manos.activo ? 'Manos libres' : 'Tocar', tono: manos.activo ? 'ok' : 'neutro' },
                    ]}
                    subtitulo={demo.activo ? (voz.hablando && voz.frase ? voz.frase : !vozActiva ? (demo.paso?.decir ?? '') : '') : !activado ? '' : voz.hablando && voz.frase ? voz.frase : pensando || ptt.escuchando || manos.estado === 'escuchando_pregunta' ? leyenda : ''}
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
                      demo.activo ? (
                        demo.agentes.length ? (
                          <div className="flex flex-col gap-2">
                            <p className="text-sm leading-snug font-semibold">Análisis de mercado y competencia</p>
                            <ListaAgentes agentes={demo.agentes} />
                          </div>
                        ) : undefined
                      ) : misiones.mision ? (
                        <div className="flex flex-col gap-2">
                          <p className="text-sm leading-snug font-semibold">{misiones.mision.titulo ?? misiones.mision.pedido}</p>
                          <ListaAgentes agentes={misiones.agentes} />
                        </div>
                      ) : undefined
                    }
                    derecha={demo.activo ? (demo.agentes.length ? <RegistroMision agentes={demo.agentes} /> : undefined) : misiones.activa ? <RegistroMision agentes={misiones.agentes} /> : undefined}
                    conPanel={Boolean(pantalla) || Boolean(demo.paso?.escena) || (!demo.activo && misiones.mision?.estado === 'lista')}
                    controles={
                      demo.activo ? (
                        <>
                          <div className="flex min-h-12 flex-col justify-center rounded-full border border-acento/40 bg-fondo/60 px-4 leading-tight backdrop-blur">
                            <span className="text-[10px] font-semibold tracking-[0.2em] text-acento-claro uppercase">
                              Demo {demo.numero}/{demo.total}
                            </span>
                            <span className="max-w-[9rem] truncate text-sm font-semibold sm:max-w-none">{demo.paso?.titulo}</span>
                          </div>
                          <button
                            onClick={demo.anterior}
                            disabled={demo.numero <= 1}
                            className="grid size-12 cursor-pointer place-items-center rounded-full border border-acento/40 bg-fondo/60 text-acento-claro backdrop-blur hover:text-white disabled:opacity-40"
                            aria-label="Paso anterior"
                          >
                            <ChevronLeft className="size-5" />
                          </button>
                          <button
                            onClick={demo.siguiente}
                            className="grid size-12 cursor-pointer place-items-center rounded-full border border-acento/40 bg-fondo/60 text-acento-claro backdrop-blur hover:text-white"
                            aria-label="Paso siguiente"
                          >
                            <ChevronRight className="size-5" />
                          </button>
                          <button
                            onClick={demo.salir}
                            className="grid size-12 cursor-pointer place-items-center rounded-full border border-acento/40 bg-fondo/60 text-acento-claro backdrop-blur hover:text-white"
                            aria-label="Terminar el demo"
                            title="Terminar el demo"
                          >
                            <X className="size-5" />
                          </button>
                        </>
                      ) : (
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
                      )
                    }
                  />
                )}

                {/* Resultado de la misión, como panel sobre la red (modo tele) */}
                {modoTele && !pantalla && !demo.activo && misiones.mision?.estado === 'lista' && (
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

                {demo.activo && demo.paso?.escena && !pantalla && <EscenaDemo escena={demo.paso.escena} />}

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
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
          <div className="order-3 flex min-w-0 flex-col gap-4">
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

            <Panel titulo="Agentes" extra={<Link to="/agentes" className="text-xs font-semibold text-acento-texto hover:underline">Ver todos</Link>}>
              {informes.length ? (
                <ul className="flex flex-col gap-1.5">
                  {informes.map((i) => {
                    const I = DESCRIPCION[i.agente]?.icono ?? Info
                    return (
                      <li key={i.id}>
                        <Link to={`/agentes?informe=${i.id}`} className="flex items-start gap-2.5 rounded-lg bg-elevada/70 px-3 py-2 hover:bg-hover">
                          <I className={cn('mt-0.5 size-4 shrink-0', i.leido ? 'text-tenue' : 'text-acento-texto')} />
                          <span className="min-w-0">
                            <span className={cn('block truncate text-sm', i.leido ? 'font-medium' : 'font-semibold')}>{i.titulo}</span>
                            {i.resumen && <span className="block truncate text-xs text-tenue">{i.resumen}</span>}
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-sm text-tenue">Todavía no hay informes. Los agentes preparan reuniones, cobros, postventa y revisan tus sistemas solos.</p>
              )}
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
                {configVoz.vozId === 'KuCuu213C5LmCbAvbEb8' ? 'Luis (español neutro)' : configVoz.vozId ? `Voz elegida (${configVoz.vozId.slice(0, 6)}…)` : 'Daniel, la de ElevenLabs por defecto (acento británico)'}
                {' · '}
                {configVoz.modelo === 'eleven_multilingual_v2' ? 'más natural' : 'rápida'}
                {' · '}
                {ENERGIAS_VOZ.find((e) => e.valor === configVoz.energia)?.label.toLowerCase()}
              </p>
            </Panel>

            <Panel
              titulo="Mapa"
              extra={
                claveMapa.disponible ? (
                  <button onClick={() => setConfigurandoMapa(true)} className="cursor-pointer text-xs font-semibold text-acento-texto hover:underline">
                    Configurar
                  </button>
                ) : null
              }
            >
              <p className="text-sm text-suave">
                {claveMapa.clave ? 'Satélite, relieve y edificios en 3D (MapTiler).' : 'Sin imagen satelital: calles y edificios en 3D.'}
              </p>
              <p className="mt-1 text-xs text-tenue">Pedile "buscame hamburgueserías en Yerba Buena" y te los marca con su contacto.</p>
              <button
                onClick={() => abrirMapa()}
                className="mt-3 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-[11px] border border-acento/40 px-3 text-sm font-semibold text-acento-claro hover:bg-acento-tenue"
              >
                <Globe2 className="size-4" /> Abrir el mapa
              </button>
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
        <section className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 px-3 md:static md:mt-4 md:px-0 [@media(max-height:520px)]:static [@media(max-height:520px)]:mt-3 [@media(max-height:520px)]:px-0">
          <div className="mx-auto max-w-[1400px] rounded-2xl border border-acento/40 bg-superficie/95 p-3 shadow-[0_0_40px_-12px_var(--color-acento)] backdrop-blur md:p-4">
            <div className="mb-2 flex min-h-6 items-start gap-2 text-sm" aria-live="polite">
              <span className="shrink-0 text-[10px] font-bold tracking-[0.2em] text-acento-claro uppercase">Hablá con Jarvis</span>
              <span className={cn('min-w-0 flex-1 md:whitespace-normal', !pensando && ultima?.error ? 'whitespace-normal text-peligro' : 'truncate text-suave')}>
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
      {mapa && (
        <Suspense fallback={<div className="fixed inset-0 z-[75] grid place-items-center bg-fondo text-sm text-acento-claro">Cargando el mapa…</div>}>
          <MapaJarvis
            aviso={mapa}
            clave={claveMapa.clave}
            agenda={agendaHoy}
            proxima={proximaReunion}
            metricas={[
              { label: 'Cobrado', valor: formatUSD(d.cobrado ?? 0) },
              {
                label: 'Clientes nuevos',
                valor: d.metasMes ? `${d.metasMes.clientes.actual}${d.metasMes.clientes.objetivo != null ? `/${d.metasMes.clientes.objetivo}` : ''}` : '—',
                avance: d.metasMes?.clientes.objetivo ? d.metasMes.clientes.actual / d.metasMes.clientes.objetivo : null,
              },
              {
                label: 'Recurrente',
                valor: formatUSD(d.mrr ?? 0),
                avance: d.metasMes?.ingreso.objetivo ? d.metasMes.ingreso.actual / d.metasMes.ingreso.objetivo : null,
              },
              { label: 'Por cobrar', valor: formatUSD(d.porCobrar ?? 0) },
            ]}
            frase={voz.hablando && voz.frase ? voz.frase : ptt.escuchando || manos.estado === 'escuchando_pregunta' ? leyenda : ''}
            respuesta={ultima && !ultima.enCurso ? { texto: ultima.texto, error: ultima.error } : null}
            consultando={consultando}
            errorVoz={manos.error ?? ptt.error ?? null}
            onEnviar={(t) => {
              voz.destrabar()
              if (!activado) setActivado(true)
              enviar(t)
            }}
            escuchando={ptt.escuchando || manos.estado === 'escuchando_pregunta'}
            pensando={pensando}
            onMicrofono={tocarMicrofono}
            onCerrar={() => setMapa(null)}
            onConfigurar={() => setConfigurandoMapa(true)}
          />
        </Suspense>
      )}
      <MapaForm abierto={configurandoMapa} clave={claveMapa.clave} onCerrar={() => setConfigurandoMapa(false)} onGuardar={claveMapa.guardar} />
      <VozForm
        abierto={editandoVoz}
        vozId={configVoz.vozId}
        modelo={configVoz.modelo}
        energia={configVoz.energia}
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
