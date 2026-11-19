import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { LngLatBounds, Map as MapaGL, Marker, setWorkerUrl, type ErrorEvent } from 'maplibre-gl'
// MapLibre 6 lee las teselas en un worker aparte: Vite lo publica como archivo y acá se le dice dónde está
import urlWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { Link } from 'react-router-dom'
import { AtSign, Check, Crosshair, Globe2, Loader2, MessageCircle, Mic, Phone, Plus, Send, Settings, X } from 'lucide-react'
import type { AvisoMapa, LugarBusqueda } from '../../types/db'
import { cn } from '../../components/ui/cn'
import { CENTRO_BASE, linkInstagram, useBusqueda, whatsapp } from './useMapa'
import { estiloMapa } from './estilo'
import './mapa.css'

setWorkerUrl(urlWorker)

export interface MetricaMapa {
  label: string
  valor: string
  /** 0 a 1, para el anillo (si no hay, el anillo es decorativo) */
  avance?: number | null
}

export interface ItemAgenda {
  hora: string
  texto: string
  tipo: 'reunion' | 'accion'
}

interface Props {
  aviso: AvisoMapa & { version: number }
  clave: string | null
  agenda: ItemAgenda[]
  proxima: { titulo: string; inicio: Date } | null
  metricas: MetricaMapa[]
  /** Lo que está diciendo Jarvis (subtítulos) o lo que se escucha */
  frase: string
  /** La última respuesta de Jarvis (para leerla cuando no habla) */
  respuesta: { texto: string; error?: boolean } | null
  /** Qué está consultando ahora ("mapa · OpenStreetMap", "búsqueda web"…) */
  consultando: string | null
  /** Error del micrófono (permiso, sin internet…) */
  errorVoz: string | null
  escuchando: boolean
  pensando: boolean
  onMicrofono: () => void
  onEnviar: (texto: string) => void
  onCerrar: () => void
  onConfigurar: () => void
}

const ARRANQUE = ['Enlace satelital… OK', 'Sector: Tucumán · AR', 'Relieve y edificios 3D… OK', 'Jarvis en línea']

const fmtCoord = (n: number, pos: string, neg: string) => `${Math.abs(n).toFixed(4)}° ${n >= 0 ? pos : neg}`
const codigo = (i: number) => `OBJ-${String(i + 1).padStart(2, '0')}`

function minutosHasta(d: Date, ahora: Date): string {
  const min = Math.round((d.getTime() - ahora.getTime()) / 60000)
  if (min <= 0) return 'ahora'
  if (min < 60) return `en ${min} min`
  const h = Math.floor(min / 60)
  return `en ${h} h ${String(min % 60).padStart(2, '0')}`
}

/** Altura aproximada de la cámara, para la telemetría */
function altura(zoom: number, lat: number, alto: number): string {
  const metrosPorPixel = (40075016 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom)
  const m = (metrosPorPixel * alto) / 2 / Math.tan((36.87 / 2) * (Math.PI / 180))
  return m > 10000 ? `${Math.round(m / 1000).toLocaleString('es-AR')} km` : `${Math.round(m).toLocaleString('es-AR')} m`
}

/** Panel con esquinas marcadas, como una pantalla de vigilancia. Va siempre con una posición (absolute o relative) en className. */
function PanelHud({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('panel-hud border border-acento/35 bg-fondo/80 shadow-[0_0_40px_-14px_var(--color-acento)] backdrop-blur-md', className)}>
      <i className="esquina tl" />
      <i className="esquina tr" />
      <i className="esquina bl" />
      <i className="esquina br" />
      {children}
    </div>
  )
}

/** Anillo con un número adentro (abajo a la izquierda) */
function Anillo({ m, i }: { m: MetricaMapa; i: number }) {
  const r = 30
  const c = 2 * Math.PI * r
  const avance = m.avance == null ? 0.18 + ((i * 0.23) % 0.6) : Math.max(0.02, Math.min(1, m.avance))
  return (
    <div className="flex w-[88px] flex-col items-center gap-1">
      <div className="relative size-[72px]">
        <svg viewBox="0 0 76 76" className="size-full -rotate-90">
          <circle cx="38" cy="38" r={r} fill="none" stroke="var(--color-acento-tenue)" strokeWidth="4" />
          <circle cx="38" cy="38" r={r + 5} fill="none" stroke="var(--color-acento)" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="2 4" />
          <circle
            cx="38"
            cy="38"
            r={r}
            fill="none"
            stroke={m.avance == null ? 'var(--color-turquesa)' : 'var(--color-acento-claro)'}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - avance)}
            className="transition-[stroke-dashoffset] duration-1000"
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center px-1 text-center font-mono text-[12px] leading-tight font-bold">{m.valor}</div>
      </div>
      <span className="text-center font-mono text-[9px] font-semibold tracking-[0.14em] text-acento-claro uppercase">{m.label}</span>
    </div>
  )
}

/** Retícula del centro de la pantalla */
function Reticula({ buscando }: { buscando: boolean }) {
  return (
    <svg viewBox="0 0 200 200" className={cn('reticula pointer-events-none absolute top-1/2 left-1/2 size-[180px] -translate-x-1/2 -translate-y-1/2 md:size-[240px]', buscando && 'buscando')} aria-hidden>
      <g className="anillo-giro">
        <circle cx="100" cy="100" r="88" fill="none" stroke="var(--color-acento-claro)" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="4 10" />
        {Array.from({ length: 24 }, (_, i) => (
          <line key={i} x1="100" y1="8" x2="100" y2={i % 6 === 0 ? 20 : 14} stroke="var(--color-acento-claro)" strokeOpacity="0.6" strokeWidth="1.2" transform={`rotate(${i * 15} 100 100)`} />
        ))}
      </g>
      <circle cx="100" cy="100" r="46" fill="none" stroke="var(--color-turquesa)" strokeOpacity="0.55" strokeWidth="1" />
      <path d="M100 40v34M100 126v34M40 100h34M126 100h34" stroke="var(--color-turquesa)" strokeOpacity="0.8" strokeWidth="1.2" />
      <circle cx="100" cy="100" r="2.5" fill="var(--color-naranja)" />
    </svg>
  )
}

/** Ficha de un lugar, tipo expediente */
function Expediente({
  l,
  i,
  activo,
  sumando,
  onElegir,
  onSumar,
}: {
  l: LugarBusqueda
  i: number
  activo: boolean
  sumando: boolean
  onElegir: () => void
  onSumar: () => void
}) {
  const wa = l.telefono ? whatsapp(l.telefono) : null
  const chip = 'inline-flex min-h-8 items-center gap-1 rounded-md px-2 font-mono text-[11px]'
  return (
    <li className={cn('border-l-2 px-3 py-2.5 transition-colors', activo ? 'border-naranja bg-naranja-tenue/40' : 'border-transparent hover:bg-elevada/50')}>
      <button onClick={onElegir} className="flex w-full cursor-pointer items-start gap-2.5 text-left">
        <span className={cn('mt-0.5 shrink-0 font-mono text-[11px] font-bold', l.prospecto_id ? 'text-ok' : activo ? 'text-naranja' : 'text-acento-claro')}>{codigo(i)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{l.nombre}</span>
          <span className="block truncate font-mono text-[11px] text-tenue">
            {l.direccion || (l.lat == null ? 'SIN UBICACIÓN' : 'SIN DIRECCIÓN')}
            {l.fuente === 'web' ? ' · WEB' : ' · OSM'}
          </span>
        </span>
      </button>
      {activo && (
        <div className="mt-2 grid gap-1 pl-[3.25rem] font-mono text-[11px] text-suave">
          {l.horario && <span>HORARIO · {l.horario}</span>}
          {l.lat != null && l.lng != null && (
            <span className="text-tenue">
              {fmtCoord(l.lat, 'N', 'S')} · {fmtCoord(l.lng, 'E', 'O')}
            </span>
          )}
          {l.nota && <span className="text-tenue">{l.nota}</span>}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[3.25rem]">
        {l.telefono && (
          <a href={`tel:${l.telefono}`} className={cn(chip, 'bg-elevada text-suave hover:text-white')}>
            <Phone className="size-3.5" /> {l.telefono}
          </a>
        )}
        {wa && (
          <a href={wa} target="_blank" rel="noreferrer" className={cn(chip, 'bg-ok-tenue text-ok hover:brightness-125')}>
            <MessageCircle className="size-3.5" /> WhatsApp
          </a>
        )}
        {l.instagram && (
          <a href={linkInstagram(l.instagram)} target="_blank" rel="noreferrer" className={cn(chip, 'bg-violeta-tenue text-violeta hover:brightness-125')}>
            <AtSign className="size-3.5" /> Instagram
          </a>
        )}
        {l.web && (
          <a href={/^https?:/i.test(l.web) ? l.web : `https://${l.web}`} target="_blank" rel="noreferrer" className={cn(chip, 'bg-elevada text-acento-texto hover:text-white')}>
            <Globe2 className="size-3.5" /> Web
          </a>
        )}
        {!l.telefono && !l.instagram && !l.web && <span className="font-mono text-[11px] text-tenue">SIN CONTACTO · pedile a Jarvis "buscá más en internet"</span>}
        {l.prospecto_id ? (
          <Link to={`/clientes/${l.prospecto_id}`} className={cn(chip, 'ml-auto font-semibold text-ok hover:underline')}>
            <Check className="size-3.5" /> En el pipeline
          </Link>
        ) : (
          <button onClick={onSumar} disabled={sumando} className={cn(chip, 'ml-auto cursor-pointer border border-acento/50 font-semibold text-acento-claro hover:bg-acento-tenue disabled:opacity-50')}>
            {sumando ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Sumar al pipeline
          </button>
        )}
      </div>
    </li>
  )
}

/**
 * Modo mapa de Jarvis (estilo centro de vigilancia): arranca con la Tierra, vuela a Tucumán y queda en una vista
 * satelital en 3D. Muestra la agenda, los números del mes y, si Jarvis buscó negocios, los marca como objetivos.
 */
export default function MapaJarvis({
  aviso,
  clave,
  agenda,
  proxima,
  metricas,
  frase,
  respuesta,
  consultando,
  errorVoz,
  escuchando,
  pensando,
  onMicrofono,
  onEnviar,
  onCerrar,
  onConfigurar,
}: Props) {
  const contenedor = useRef<HTMLDivElement>(null)
  const mapa = useRef<MapaGL | null>(null)
  const marcadores = useRef<Marker[]>([])
  const destino = useRef<Marker | null>(null)
  const [listo, setListo] = useState(false)
  const [tele, setTele] = useState({ lat: -18, lng: -58, zoom: 1.4, rumbo: 0, inclinacion: 0, alto: 800 })
  const [titulo, setTitulo] = useState(aviso.titulo ?? CENTRO_BASE.titulo)
  const [activo, setActivo] = useState<number | null>(null)
  const [sumando, setSumando] = useState<number | null>(null)
  const [errorSumar, setErrorSumar] = useState<string | null>(null)
  const [ahora, setAhora] = useState(() => new Date())
  const [errorMapa, setErrorMapa] = useState<string | null>(null)
  const [lineasArranque, setLineasArranque] = useState(0)
  const [texto, setTexto] = useState('')
  const { busqueda, sumarAlPipeline } = useBusqueda(aviso.busqueda_id, aviso.version)
  const quieto = useRef(0) // hasta cuándo no girar solo (el socio está moviendo el mapa)
  const buscando = pensando && !!consultando && /mapa|web/i.test(consultando)

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Texto de arranque, una línea por vez
  useEffect(() => {
    if (lineasArranque >= ARRANQUE.length + 1) return
    const t = setTimeout(() => setLineasArranque((n) => n + 1), lineasArranque === 0 ? 300 : 650)
    return () => clearTimeout(t)
  }, [lineasArranque])

  // Crear el mapa: la Tierra desde el espacio y vuelo a Tucumán
  useEffect(() => {
    if (!contenedor.current) return
    const reducir = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const m = new MapaGL({
      container: contenedor.current,
      style: estiloMapa(clave),
      center: [-58, -18],
      zoom: 1.4,
      pitch: 0,
      attributionControl: { compact: true },
      maxPitch: 75,
      canvasContextAttributes: { antialias: true },
    })
    mapa.current = m
    m.on('error', (e: ErrorEvent) => {
      // Solo el rechazo de MapTiler (401/403) es un problema de la clave; lo demás (sin conexión, una tesela) se ignora
      const estado = (e.error as { status?: number } | undefined)?.status
      const url = String((e.error as { url?: string } | undefined)?.url ?? '')
      if (clave && (estado === 401 || estado === 403) && (!url || url.includes('maptiler'))) setErrorMapa('MapTiler rechazó la clave. Revisala en Configurar.')
    })
    for (const ev of ['dragstart', 'rotatestart', 'pitchstart', 'wheel', 'touchstart'] as const) m.on(ev, () => (quieto.current = Date.now() + 9000))
    m.on('load', () => {
      if (clave && m.getSource('relieve')) {
        try {
          m.setTerrain({ source: 'relieve', exaggeration: 1.4 })
        } catch {
          // sin relieve si el navegador no puede
        }
      }
      setListo(true)
      if (!aviso.busqueda_id && !aviso.centro) {
        const vuelo = { center: [CENTRO_BASE.lng, CENTRO_BASE.lat] as [number, number], zoom: CENTRO_BASE.zoom, pitch: 62, bearing: -28 }
        if (reducir) m.jumpTo(vuelo)
        else setTimeout(() => m.flyTo({ ...vuelo, duration: 7000, curve: 1.6, essential: true }), 1600)
      }
    })
    // Giro lento de cámara cuando nadie lo toca
    let raf = 0
    const girar = () => {
      raf = requestAnimationFrame(girar)
      if (reducir || m.isMoving() || Date.now() < quieto.current || m.getZoom() < 9) return
      m.setBearing(m.getBearing() + 0.025)
    }
    raf = requestAnimationFrame(girar)
    // Telemetría: se lee unas pocas veces por segundo (no en cada cuadro: en el celular pesa)
    const leer = setInterval(() => {
      const c = m.getCenter()
      setTele({ lat: c.lat, lng: c.lng, zoom: m.getZoom(), rumbo: ((m.getBearing() % 360) + 360) % 360, inclinacion: m.getPitch(), alto: m.getCanvas().clientHeight || 800 })
    }, 300)
    return () => {
      cancelAnimationFrame(raf)
      clearInterval(leer)
      m.remove()
      mapa.current = null
    }
    // El mapa se crea una vez por clave; los avisos se atienden abajo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])

  // Volar a un lugar que pidió Jarvis
  useEffect(() => {
    const m = mapa.current
    if (!m || !listo || !aviso.centro) return
    setTitulo(aviso.titulo ?? '')
    m.flyTo({ center: [aviso.centro.lng, aviso.centro.lat], zoom: aviso.centro.zoom ?? 15, pitch: 60, bearing: m.getBearing() - 20, duration: 4500, essential: true })
    destino.current?.remove()
    const el = document.createElement('div')
    el.className = 'pin-destino'
    destino.current = new Marker({ element: el }).setLngLat([aviso.centro.lng, aviso.centro.lat]).addTo(m)
  }, [aviso.centro, aviso.titulo, aviso.version, listo])

  // Marcar los negocios de la búsqueda como objetivos (aparecen de a uno)
  const lugares = useMemo(() => busqueda?.lugares ?? [], [busqueda])
  useEffect(() => {
    const m = mapa.current
    if (!m || !listo) return
    marcadores.current.forEach((x) => x.remove())
    marcadores.current = []
    const conUbicacion = lugares.map((l, i) => ({ l, i })).filter(({ l }) => l.lat != null && l.lng != null)
    conUbicacion.forEach(({ l, i }, orden) => {
      // MapLibre mueve el elemento del marcador con transform: la animación va en el botón de adentro
      const el = document.createElement('div')
      const boton = document.createElement('button')
      boton.type = 'button'
      boton.className = cn('objetivo', l.prospecto_id && 'en-pipeline')
      boton.dataset.indice = String(i)
      boton.style.setProperty('--retardo', `${1800 + orden * 280}ms`)
      boton.setAttribute('aria-label', `${codigo(i)} ${l.nombre}`)
      boton.innerHTML = '<span class="caja"><i></i><i></i><i></i><i></i></span><span class="punto"></span><span class="etiqueta"></span>'
      ;(boton.querySelector('.etiqueta') as HTMLElement).textContent = `${codigo(i)} · ${l.nombre}`
      el.appendChild(boton)
      boton.addEventListener('click', (ev) => {
        ev.stopPropagation()
        setActivo(i)
      })
      marcadores.current.push(new Marker({ element: el }).setLngLat([l.lng!, l.lat!]).addTo(m))
    })
    if (busqueda) setTitulo(`${busqueda.rubro} · ${busqueda.zona}`)
    // Encuadrar todos los resultados (o la zona si no hay ubicaciones)
    if (conUbicacion.length) {
      const b = new LngLatBounds()
      conUbicacion.forEach(({ l }) => b.extend([l.lng!, l.lat!]))
      const angosto = window.innerWidth < 768
      m.fitBounds(b, {
        padding: angosto ? { top: 150, bottom: 380, left: 40, right: 40 } : { top: 160, bottom: 200, left: 160, right: 470 },
        maxZoom: 15.5,
        pitch: 58,
        duration: 5000,
        essential: true,
      })
    } else if (busqueda?.centro) {
      m.flyTo({ center: [busqueda.centro.lng, busqueda.centro.lat], zoom: 13.5, pitch: 58, duration: 5000, essential: true })
    }
  }, [lugares, busqueda, listo])

  // Resaltar el elegido y volar hasta él
  useEffect(() => {
    marcadores.current.forEach((mk) => {
      const boton = mk.getElement().firstElementChild as HTMLElement | null
      boton?.classList.toggle('activo', boton.dataset.indice === String(activo))
    })
    const l = activo != null ? lugares[activo] : null
    if (l?.lat != null && l.lng != null) {
      quieto.current = Date.now() + 9000
      mapa.current?.flyTo({ center: [l.lng, l.lat], zoom: 16.8, pitch: 64, duration: 2500, essential: true })
    }
  }, [activo, lugares])

  // Esc cierra
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onCerrar])

  const recentrar = () => {
    setActivo(null)
    setTitulo(CENTRO_BASE.titulo)
    mapa.current?.flyTo({ center: [CENTRO_BASE.lng, CENTRO_BASE.lat], zoom: CENTRO_BASE.zoom, pitch: 62, bearing: -28, duration: 3500, essential: true })
  }

  const sumar = async (i: number) => {
    setSumando(i)
    setErrorSumar(null)
    try {
      await sumarAlPipeline(i)
    } catch (e) {
      setErrorSumar(e instanceof Error ? e.message : 'No se pudo sumar.')
    } finally {
      setSumando(null)
    }
  }

  const mandar = (e: FormEvent) => {
    e.preventDefault()
    if (!texto.trim() || pensando) return
    onEnviar(texto.trim())
    setTexto('')
  }

  const proximaCercana = proxima && proxima.inicio.getTime() - ahora.getTime() < 12 * 3600_000 && proxima.inicio.getTime() > ahora.getTime() - 15 * 60_000
  // Lo que se lee abajo: lo que dice ahora, lo que escucha o está haciendo, o la última respuesta
  const linea = errorVoz
    ? { texto: errorVoz, error: true }
    : frase
      ? { texto: frase, error: false }
      : pensando
        ? { texto: consultando ? `Consultando ${consultando}…` : 'Pensando…', error: false }
        : respuesta
  const conUbicacion = lugares.filter((l) => l.lat != null).length

  return (
    <div className="mapa-jarvis fixed inset-0 z-[75] overflow-hidden text-texto" role="dialog" aria-label="Mapa de Jarvis">
      <div className="estrellas pointer-events-none absolute inset-0" />
      {/* MapLibre le pone position: relative a su contenedor: va adentro de uno que ocupa toda la pantalla */}
      <div className="absolute inset-0">
        <div ref={contenedor} className="size-full" />
      </div>
      <div className="barrido pointer-events-none absolute inset-0" />
      <div className="vineta pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className={cn('radar', buscando && 'activo')} />
      </div>
      <Reticula buscando={buscando} />

      {/* Arranque: el enlace satelital */}
      {lineasArranque <= ARRANQUE.length && (
        <div className="pointer-events-none absolute top-1/2 left-1/2 w-[min(320px,80vw)] -translate-x-1/2 translate-y-[110px] font-mono text-xs text-acento-claro md:translate-y-[150px]">
          {ARRANQUE.slice(0, lineasArranque).map((l) => (
            <div key={l} className="animate-aparecer">
              <span className="text-turquesa">›</span> {l}
            </div>
          ))}
        </div>
      )}

      {/* Barrido "escaneando" mientras Jarvis busca */}
      {buscando && (
        <PanelHud className="absolute top-[7.5rem] left-1/2 -translate-x-1/2 px-4 py-2 md:top-6">
          <div className="flex items-center gap-2 font-mono text-[11px] font-bold tracking-[0.2em] text-naranja uppercase">
            <span className="size-2 animate-pulse rounded-full bg-naranja" /> Escaneando sector · {consultando}
          </div>
        </PanelHud>
      )}

      {/* Arriba a la izquierda: dónde estamos y telemetría */}
      <PanelHud className="absolute top-3 left-3 max-w-[calc(100%-11.5rem)] px-4 py-3 md:top-5 md:left-5 md:max-w-[min(560px,calc(100%-30rem))]">
        <div className="flex items-center gap-2 font-mono text-[10px] font-bold tracking-[0.25em] text-acento-claro uppercase">
          <span className="size-1.5 animate-pulse rounded-full bg-ok" /> Rastreo · enlace activo
        </div>
        <div className="mt-1 truncate font-display text-lg leading-tight font-bold md:text-2xl">{titulo || CENTRO_BASE.titulo}</div>
        <div className="tabular mt-1.5 grid grid-cols-1 gap-x-4 gap-y-0.5 font-mono text-[10px] whitespace-nowrap text-suave sm:grid-cols-2 md:grid-cols-3 md:text-[11px]">
          <span>LAT {fmtCoord(tele.lat, 'N', 'S')}</span>
          <span>LON {fmtCoord(tele.lng, 'E', 'O')}</span>
          <span className="hidden md:inline">ALT {altura(tele.zoom, tele.lat, tele.alto)}</span>
          <span className="hidden md:inline">RUMBO {Math.round(tele.rumbo)}°</span>
          <span className="hidden md:inline">INCL {Math.round(tele.inclinacion)}°</span>
          <span className="text-acento-texto">{ahora.toLocaleTimeString('es-AR', { hour12: false })}</span>
        </div>
        {errorMapa ? (
          <p className="mt-2 text-xs text-peligro">{errorMapa}</p>
        ) : (
          !clave && (
            <button onClick={onConfigurar} className="mt-2 hidden cursor-pointer text-left text-xs text-aviso hover:underline md:block">
              Sin imagen satelital: cargá la clave de MapTiler en Configurar.
            </button>
          )
        )}
      </PanelHud>

      {/* Arriba a la derecha: controles */}
      <div className="absolute top-3 right-3 flex gap-2 md:top-5 md:right-5">
        {[
          { icono: Crosshair, titulo: 'Volver a Tucumán', accion: recentrar },
          { icono: Settings, titulo: 'Configurar el mapa', accion: onConfigurar },
          { icono: X, titulo: 'Cerrar el mapa (Esc)', accion: onCerrar },
        ].map(({ icono: Icono, titulo: t, accion }) => (
          <button
            key={t}
            onClick={accion}
            title={t}
            aria-label={t}
            className="grid size-11 cursor-pointer place-items-center rounded-md border border-acento/40 bg-fondo/80 text-acento-claro backdrop-blur-md hover:text-white"
          >
            <Icono className="size-5" />
          </button>
        ))}
      </div>

      {/* Próxima reunión */}
      {proximaCercana && !busqueda && !buscando && (
        <PanelHud className="absolute top-6 left-1/2 hidden -translate-x-1/2 px-5 py-2.5 xl:block">
          <div className="flex items-baseline gap-3">
            <span className="tabular font-mono text-xl font-bold text-acento-claro">{minutosHasta(proxima.inicio, ahora)}</span>
            <span className="text-sm text-suave">{proxima.titulo}</span>
          </div>
        </PanelHud>
      )}

      {/* Derecha: objetivos de la búsqueda o la agenda de hoy */}
      <PanelHud className="absolute inset-x-3 bottom-[10.5rem] flex max-h-[38vh] flex-col overflow-hidden md:inset-x-auto md:top-28 md:right-5 md:bottom-36 md:max-h-none md:w-[410px]">
        {busqueda ? (
          <>
            <div className="border-b border-acento/25 px-4 py-3">
              <div className="font-mono text-[10px] font-bold tracking-[0.25em] text-acento-claro uppercase">Objetivos · {busqueda.rubro}</div>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="font-mono text-2xl font-bold text-naranja">{String(lugares.length).padStart(2, '0')}</span>
                <span className="text-sm text-suave">encontrados · {conUbicacion} en el mapa</span>
              </div>
              <div className="font-mono text-[10px] text-tenue uppercase">{busqueda.zona} · OpenStreetMap + web</div>
            </div>
            <ul className="flex-1 overflow-y-auto py-1">
              {lugares.map((l, i) => (
                <Expediente key={`${l.nombre}-${i}`} l={l} i={i} activo={activo === i} sumando={sumando === i} onElegir={() => setActivo(i)} onSumar={() => sumar(i)} />
              ))}
              {!lugares.length && <li className="px-4 py-6 text-center text-sm text-tenue">No encontré lugares de ese rubro en la zona. Pedile a Jarvis "buscá en internet".</li>}
            </ul>
            {errorSumar && <p className="border-t border-acento/25 px-4 py-2 text-xs text-peligro">{errorSumar}</p>}
          </>
        ) : (
          <>
            <div className="border-b border-acento/25 px-4 py-3">
              <div className="font-mono text-[10px] font-bold tracking-[0.25em] text-acento-claro uppercase">Hoy</div>
              <div className="mt-0.5 font-semibold">{agenda.length ? `${agenda.length} ${agenda.length === 1 ? 'cosa' : 'cosas'} en la agenda` : 'Agenda libre'}</div>
            </div>
            <ul className="flex-1 overflow-y-auto p-3 text-sm">
              {agenda.map((a, i) => (
                <li key={i} className="flex gap-3 border-b border-acento/10 py-2 last:border-0">
                  <span className="tabular w-11 shrink-0 font-mono font-semibold text-acento-claro">{a.hora}</span>
                  <span className="min-w-0 flex-1 text-suave">{a.texto}</span>
                </li>
              ))}
              <li className="pt-3 text-xs leading-relaxed text-tenue">
                Pedile a Jarvis: "buscame hamburgueserías en Yerba Buena" o "llevame a la calle Aconquija 1500".
              </li>
            </ul>
          </>
        )}
      </PanelHud>

      {/* Abajo a la izquierda: los números del mes */}
      <PanelHud className="absolute bottom-36 left-5 hidden gap-1 px-3 py-3 lg:flex">
        {metricas.slice(0, 4).map((m, i) => (
          <Anillo key={m.label} m={m} i={i} />
        ))}
      </PanelHud>

      {/* Abajo: lo que dice Jarvis, micrófono y para escribir */}
      <div className="absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-col gap-2 md:inset-x-auto md:bottom-6 md:left-1/2 md:w-[min(760px,calc(100%-3rem))] md:-translate-x-1/2">
        <PanelHud className="relative min-h-12 px-4 py-2.5">
          <p aria-live="polite" className={cn('line-clamp-3 text-sm leading-snug md:text-[15px]', linea?.error ? 'text-peligro' : 'text-suave')}>
            {linea?.texto || 'Tocá el micrófono o escribí: "buscame hamburgueserías en Yerba Buena".'}
          </p>
        </PanelHud>
        <form onSubmit={mandar} className="flex items-center gap-2">
          <button
            type="button"
            onClick={onMicrofono}
            disabled={pensando}
            aria-label={escuchando ? 'Terminar y mandar' : 'Hablar con Jarvis'}
            className={cn(
              'grid size-12 shrink-0 cursor-pointer place-items-center rounded-full text-white shadow-[0_0_30px_-4px_var(--color-acento)] disabled:opacity-60',
              escuchando ? 'animate-pulse bg-peligro' : 'bg-acento hover:bg-acento-fuerte',
            )}
          >
            {pensando ? <Loader2 className="size-5 animate-spin" /> : <Mic className="size-5" />}
          </button>
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="O escribí qué buscar…"
            aria-label="Escribile a Jarvis"
            className="h-12 min-w-0 flex-1 rounded-[10px] border border-acento/40 bg-fondo/80 px-4 text-[15px] backdrop-blur-md placeholder:text-tenue focus:border-acento focus:outline-none"
          />
          <button
            type="submit"
            disabled={pensando || !texto.trim()}
            aria-label="Mandar"
            className="grid size-12 shrink-0 cursor-pointer place-items-center rounded-full border border-acento/50 bg-fondo/80 text-acento-claro backdrop-blur-md disabled:opacity-40"
          >
            <Send className="size-5" />
          </button>
        </form>
      </div>
    </div>
  )
}
