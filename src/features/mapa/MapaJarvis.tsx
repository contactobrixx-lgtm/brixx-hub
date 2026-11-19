import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { LngLatBounds, Map as MapaGL, Marker, setWorkerUrl, type ErrorEvent, type MapLayerMouseEvent, type PaddingOptions } from 'maplibre-gl'
// MapLibre 6 lee las teselas en un worker aparte: Vite lo publica como archivo y acá se le dice dónde está
import urlWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { Link } from 'react-router-dom'
import { AtSign, Check, ChevronDown, ChevronUp, Crosshair, Globe2, Loader2, MapPin, MessageCircle, Mic, Phone, Plus, Send, Settings, Star, X } from 'lucide-react'
import type { AvisoMapa, LugarBusqueda } from '../../types/db'
import { cn } from '../../components/ui/cn'
import { CENTRO_BASE, linkInstagram, useBusqueda, whatsapp } from './useMapa'
import { estiloMapa, INTENSIDAD, token } from './estilo'
import './mapa.css'

setWorkerUrl(urlWorker)

export interface MetricaMapa {
  label: string
  valor: string
  /** 0 a 1 (se usa en otras vistas) */
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
  /** Que Jarvis diga en voz alta algo que pasó en el mapa ("Sumé Ruddy's al pipeline") */
  onDecir?: (texto: string) => void
  onCerrar: () => void
  onConfigurar: () => void
}

const ARRANQUE = ['Enlace satelital… OK', 'Sector: Tucumán · AR', 'Relieve y edificios 3D… OK', 'Jarvis en línea']
const FUENTE = 'lugares'
const CAPA_PUNTOS = 'lugares-puntos'
const CAPA_TOQUE = 'lugares-toque'
/** Capa invisible de grupos: solo sirve para preguntarle al motor qué grupos está dibujando ahora */
const CAPA_GRUPOS = 'lugares-grupos'
/** Más cerca que esto, el motor ya no agrupa (si siguen juntos, el grupo se abre en el panel) */
const ZOOM_SIN_GRUPOS = 17

const fmtCoord = (n: number, pos: string, neg: string) => `${Math.abs(n).toFixed(4)}° ${n >= 0 ? pos : neg}`
const codigo = (i: number) => `OBJ-${String(i + 1).padStart(2, '0')}`
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

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

/** Un reloj que se actualiza solo (no redibuja todo el mapa cada segundo) */
function useAhora(cada: number) {
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), cada)
    return () => clearInterval(t)
  }, [cada])
  return ahora
}

/** Panel con esquinas marcadas, como una pantalla de vigilancia. Va siempre con una posición (absolute o relative) en className. */
function PanelHud({ children, className, refPanel }: { children: ReactNode; className?: string; refPanel?: React.Ref<HTMLDivElement> }) {
  // Sin desenfoque de fondo: encima de un mapa que se mueve, el blur se recalcula en cada cuadro y pesa
  return (
    <div ref={refPanel} className={cn('panel-hud border border-acento/35 bg-fondo/90 shadow-[0_0_30px_-16px_var(--color-acento)]', className)}>
      <i className="esquina tl" />
      <i className="esquina tr" />
      <i className="esquina bl" />
      <i className="esquina br" />
      {children}
    </div>
  )
}

/** Telemetría: se actualiza mientras se mueve la cámara (a lo sumo 4 veces por segundo) y se queda quieta si nadie la mueve. */
function Telemetria({ mapa, listo }: { mapa: React.RefObject<MapaGL | null>; listo: boolean }) {
  const [t, setT] = useState({ lat: CENTRO_BASE.lat, lng: CENTRO_BASE.lng, zoom: 12, rumbo: 0, incl: 0, alto: 800 })
  const ahora = useAhora(1000)
  useEffect(() => {
    const m = mapa.current
    if (!m || !listo) return
    let ultima = 0
    const leer = () => {
      const c = m.getCenter()
      setT({ lat: c.lat, lng: c.lng, zoom: m.getZoom(), rumbo: ((m.getBearing() % 360) + 360) % 360, incl: m.getPitch(), alto: m.getCanvas().clientHeight || 800 })
    }
    const alMover = () => {
      const ya = performance.now()
      if (ya - ultima > 250) {
        ultima = ya
        leer()
      }
    }
    leer()
    m.on('move', alMover)
    m.on('moveend', leer)
    return () => {
      m.off('move', alMover)
      m.off('moveend', leer)
    }
  }, [mapa, listo])
  return (
    <div className="tabular mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 font-mono text-[10px] whitespace-nowrap text-suave md:mt-1.5 md:grid-cols-3 md:gap-x-4 md:text-[11px]">
      <span>LAT {fmtCoord(t.lat, 'N', 'S')}</span>
      <span>LON {fmtCoord(t.lng, 'E', 'O')}</span>
      <span className="hidden md:inline">ALT {altura(t.zoom, t.lat, t.alto)}</span>
      <span className="hidden md:inline">RUMBO {Math.round(t.rumbo)}°</span>
      <span className="hidden md:inline">INCL {Math.round(t.incl)}°</span>
      <span className="hidden text-acento-texto md:inline">{ahora.toLocaleTimeString('es-AR', { hour12: false })}</span>
    </div>
  )
}

function ProximaReunion({ proxima }: { proxima: { titulo: string; inicio: Date } }) {
  const ahora = useAhora(30_000)
  const falta = proxima.inicio.getTime() - ahora.getTime()
  if (falta > 12 * 3600_000 || falta < -15 * 60_000) return null
  return (
    <PanelHud className="absolute top-6 left-1/2 hidden -translate-x-1/2 px-5 py-2.5 xl:block">
      <div className="flex items-baseline gap-3">
        <span className="tabular font-mono text-xl font-bold text-acento-claro">{minutosHasta(proxima.inicio, ahora)}</span>
        <span className="text-sm text-suave">{proxima.titulo}</span>
      </div>
    </PanelHud>
  )
}

/** Retícula del centro de la pantalla (quieta: nada gira solo) */
function Reticula() {
  return (
    <svg viewBox="0 0 200 200" className="reticula pointer-events-none absolute top-1/2 left-1/2 size-[160px] -translate-x-1/2 -translate-y-1/2 md:size-[200px]" aria-hidden>
      <circle cx="100" cy="100" r="88" fill="none" stroke="var(--color-acento-claro)" strokeOpacity="0.3" strokeWidth="1" strokeDasharray="4 10" />
      <circle cx="100" cy="100" r="46" fill="none" stroke="var(--color-turquesa)" strokeOpacity="0.35" strokeWidth="1" />
      <path d="M100 40v34M100 126v34M40 100h34M126 100h34" stroke="var(--color-turquesa)" strokeOpacity="0.5" strokeWidth="1.2" />
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
  refItem,
}: {
  l: LugarBusqueda
  i: number
  activo: boolean
  sumando: boolean
  onElegir: () => void
  onSumar: () => void
  refItem: (el: HTMLLIElement | null) => void
}) {
  const wa = l.telefono ? whatsapp(l.telefono) : null
  const chip = 'inline-flex min-h-8 items-center gap-1 rounded-md px-2 font-mono text-[11px]'
  return (
    <li ref={refItem} className={cn('scroll-my-2 border-l-2 px-3 py-2.5', activo ? 'border-naranja bg-naranja-tenue/40' : 'border-transparent hover:bg-elevada/50')}>
      <button onClick={onElegir} aria-pressed={activo} className="flex w-full cursor-pointer items-start gap-2.5 text-left">
        <span className={cn('mt-0.5 shrink-0 font-mono text-[11px] font-bold', l.prospecto_id ? 'text-ok' : activo ? 'text-naranja' : 'text-acento-claro')}>{codigo(i)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{l.nombre}</span>
          <span className="block truncate font-mono text-[11px] text-tenue">
            {l.direccion || (l.lat == null ? 'SIN UBICACIÓN' : 'SIN DIRECCIÓN')}
            {l.fuente === 'web' ? ' · WEB' : l.fuente === 'osm' ? ' · OSM' : ''}
          </span>
          {l.rating != null && (
            <span className="mt-0.5 flex items-center gap-1 font-mono text-[11px] text-aviso">
              <Star className="size-3 fill-current" /> {l.rating.toFixed(1)} <span className="text-tenue">· {l.resenas ?? 0} reseñas</span>
            </span>
          )}
        </span>
      </button>
      {activo && (
        <div className="mt-2 grid gap-1 pl-[3.25rem] font-mono text-[11px] text-suave">
          {l.horario && <span className="whitespace-pre-line">HORARIO · {l.horario.replaceAll(' · ', '\n')}</span>}
          {l.lat == null && <span className="text-tenue">Sin ubicación en el mapa</span>}
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
        {l.maps && (
          <a href={l.maps} target="_blank" rel="noreferrer" className={cn(chip, 'bg-elevada text-acento-texto hover:text-white')}>
            <MapPin className="size-3.5" /> Google Maps
          </a>
        )}
        {l.web && !l.instagram && (
          <a href={/^https?:/i.test(l.web) ? l.web : `https://${l.web}`} target="_blank" rel="noreferrer" className={cn(chip, 'bg-elevada text-acento-texto hover:text-white')}>
            <Globe2 className="size-3.5" /> Web
          </a>
        )}
        {!l.telefono && !l.instagram && !l.web && !l.maps && <span className="font-mono text-[11px] text-tenue">SIN CONTACTO · pedile a Jarvis "buscá más en internet"</span>}
        {l.prospecto_id ? (
          <Link to={`/clientes/${l.prospecto_id}`} className={cn(chip, 'ml-auto font-semibold text-ok hover:underline')}>
            <Check className="size-3.5" /> En el pipeline
          </Link>
        ) : (
          <button onClick={onSumar} disabled={sumando} className={cn(chip, 'ml-auto cursor-pointer border border-acento/50 font-semibold text-acento-claro hover:bg-acento-tenue disabled:opacity-50')}>
            {sumando ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} {sumando ? 'Sumando…' : 'Sumar al pipeline'}
          </button>
        )}
      </div>
    </li>
  )
}

// Tipos mínimos de GeoJSON (los que usamos)
type Punto = { type: 'Feature'; id: number; geometry: { type: 'Point'; coordinates: [number, number] }; properties: { i: number; en: boolean } }
type Coleccion = { type: 'FeatureCollection'; features: Punto[] }
type Hoja = { properties?: Record<string, unknown> | null }

type FuenteLugares = {
  setData: (d: Coleccion) => void
  getClusterExpansionZoom: (id: number) => Promise<number>
  getClusterLeaves: (id: number, limite: number, desde: number) => Promise<Hoja[]>
}

/** Los comercios con ubicación como puntos del motor de mapa (el motor los agrupa) */
function comoGeojson(lugares: LugarBusqueda[]): Coleccion {
  return {
    type: 'FeatureCollection',
    features: lugares.flatMap((l, i) =>
      l.lat != null && l.lng != null ? [{ type: 'Feature' as const, id: i, geometry: { type: 'Point' as const, coordinates: [l.lng, l.lat] as [number, number] }, properties: { i, en: !!l.prospecto_id } }] : [],
    ),
  }
}

/**
 * Modo mapa de Jarvis (estilo centro de vigilancia): satelital en 3D sobre Tucumán. Muestra la agenda y, si Jarvis buscó
 * comercios, los marca (agrupados si están muy juntos) con su ficha y "Sumar al pipeline".
 * Pensado para compus modestas: nada se anima solo; la cámara se mueve una vez por acción.
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
  onDecir,
  onCerrar,
  onConfigurar,
}: Props) {
  const contenedor = useRef<HTMLDivElement>(null)
  const mapa = useRef<MapaGL | null>(null)
  const grupos = useRef(new Map<number, Marker>())
  const seleccion = useRef<Marker | null>(null)
  const destino = useRef<Marker | null>(null)
  const cabeceraRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const barraRef = useRef<HTMLDivElement>(null)
  const itemsRef = useRef(new Map<number, HTMLLIElement>())
  const encuadrada = useRef('')
  // Si se abrió para mostrar algo (búsqueda o lugar), no hay vuelo desde el espacio
  const conDestino = useRef(!!(aviso.busqueda_id || aviso.centro))
  const [listo, setListo] = useState(false)
  const [titulo, setTitulo] = useState<{ principal: string; lugar?: string }>({ principal: aviso.titulo ?? CENTRO_BASE.titulo })
  const [activo, setActivo] = useState<number | null>(null)
  /** Índices de un grupo que no se separa al acercar (comercios en la misma esquina): se listan en el panel */
  const [grupo, setGrupo] = useState<number[] | null>(null)
  const [sumando, setSumando] = useState<number | null>(null)
  const [errorSumar, setErrorSumar] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [errorMapa, setErrorMapa] = useState<string | null>(null)
  const [lineasArranque, setLineasArranque] = useState(conDestino.current ? ARRANQUE.length + 1 : 0)
  const [texto, setTexto] = useState('')
  // En el celular la lista se puede plegar para ver el mapa
  const [listaAbierta, setListaAbierta] = useState(true)
  const { busqueda, sumarAlPipeline } = useBusqueda(aviso.busqueda_id, aviso.version)
  const lugares = useMemo(() => busqueda?.lugares ?? [], [busqueda])
  const lugaresRef = useRef(lugares)
  lugaresRef.current = lugares
  const buscando = pensando && !!consultando && /mapa|web/i.test(consultando)

  // Texto de arranque, una línea por vez (solo al abrir el mapa a mano)
  useEffect(() => {
    if (lineasArranque >= ARRANQUE.length + 1) return
    const t = setTimeout(() => setLineasArranque((n) => n + 1), lineasArranque === 0 ? 300 : 650)
    return () => clearTimeout(t)
  }, [lineasArranque])

  // Una pregunta nueva limpia el aviso del mapa ("Sumé…")
  useEffect(() => {
    if (pensando) setMensaje(null)
  }, [pensando])

  /** El espacio libre del mapa: descuenta la cabecera, el panel de comercios y la barra de abajo */
  const margenes = useCallback((): PaddingOptions => {
    const W = window.innerWidth
    const H = window.innerHeight
    const angosto = W < 768
    const cab = cabeceraRef.current?.getBoundingClientRect()
    const pan = panelRef.current?.getBoundingClientRect()
    const bar = barraRef.current?.getBoundingClientRect()
    let top = (cab?.bottom ?? 90) + 28
    let bottom = H - (angosto ? Math.min(pan?.top ?? H, bar?.top ?? H) : (bar?.top ?? H)) + 28
    const right = angosto ? 72 : W - (pan?.left ?? W) + 36
    const left = angosto ? 28 : 48
    // Si no queda lugar (pantalla chica), se reparte lo que hay
    const libre = H - top - bottom
    if (libre < 120) {
      const sobra = (120 - libre) / 2
      top = Math.max(16, top - sobra)
      bottom = Math.max(16, bottom - sobra)
    }
    return { top: Math.round(top), bottom: Math.round(bottom), left, right: Math.round(Math.min(right, W * 0.6)) }
  }, [])

  // Crear el mapa (una vez por clave)
  useEffect(() => {
    if (!contenedor.current) return
    const reducir = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const inicio = aviso.centro ?? (aviso.busqueda_id ? { lat: CENTRO_BASE.lat, lng: CENTRO_BASE.lng, zoom: 12.4 } : null)
    const m = new MapaGL({
      container: contenedor.current,
      style: estiloMapa(clave),
      center: inicio ? [inicio.lng, inicio.lat] : [-58, -18],
      zoom: inicio ? (inicio.zoom ?? 13) : 1.4,
      pitch: inicio ? 50 : 0,
      attributionControl: { compact: true },
      maxPitch: 70,
      // Menos trabajo para la placa de video: sin antialias y sin dibujar de más en pantallas muy densas
      canvasContextAttributes: { antialias: false },
      pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
      fadeDuration: 150,
    })
    mapa.current = m
    // Para las pruebas automáticas (ubicar un comercio en pantalla); en el uso normal no se activa
    try {
      if (localStorage.getItem('brixx-pruebas-mapa') === '1') (window as unknown as { __mapaJarvis?: MapaGL }).__mapaJarvis = m
    } catch {
      // sin almacenamiento
    }
    m.on('error', (e: ErrorEvent) => {
      // Solo el rechazo de MapTiler (401/403) es un problema de la clave; lo demás (sin conexión, una tesela) se ignora
      const estado = (e.error as { status?: number } | undefined)?.status
      const url = String((e.error as { url?: string } | undefined)?.url ?? '')
      if (clave && (estado === 401 || estado === 403) && (!url || url.includes('maptiler'))) setErrorMapa('MapTiler rechazó la clave. Revisala en Configurar.')
    })
    m.on('load', () => {
      if (clave && m.getSource('relieve')) {
        try {
          m.setTerrain({ source: 'relieve', exaggeration: 1.3 })
        } catch {
          // sin relieve si el navegador no puede
        }
      }
      // Comercios: una capa del motor con agrupación nativa (mucho más liviano que un elemento por comercio)
      m.addSource(FUENTE, { type: 'geojson', data: comoGeojson([]), cluster: true, clusterRadius: 40, clusterMaxZoom: ZOOM_SIN_GRUPOS - 1 })
      const sinGrupo = ['!', ['has', 'point_count']] as never
      m.addLayer({
        id: CAPA_PUNTOS,
        type: 'circle',
        source: FUENTE,
        filter: sinGrupo,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 5, 16, 7.5] as never,
          'circle-color': ['case', ['get', 'en'], token('ok', '#5bc48d'), token('acento-claro', '#c4cffe')] as never,
          'circle-stroke-width': 2,
          'circle-stroke-color': token('fondo', '#121316'),
          'circle-opacity': 0.95,
        },
      })
      m.addLayer({ id: CAPA_GRUPOS, type: 'circle', source: FUENTE, filter: ['has', 'point_count'] as never, paint: { 'circle-radius': 1, 'circle-opacity': 0 } })
      // Área de toque grande e invisible (para el dedo)
      m.addLayer({ id: CAPA_TOQUE, type: 'circle', source: FUENTE, filter: sinGrupo, paint: { 'circle-radius': 20, 'circle-opacity': 0 } })
      m.on('click', CAPA_TOQUE, (e: MapLayerMouseEvent) => {
        const i = Number(e.features?.[0]?.properties?.i)
        if (!Number.isNaN(i)) elegirRef.current(i, 'mapa')
      })
      m.on('mouseenter', CAPA_TOQUE, () => (m.getCanvas().style.cursor = 'pointer'))
      m.on('mouseleave', CAPA_TOQUE, () => (m.getCanvas().style.cursor = ''))
      // Los grupos (con su cantidad): mientras el motor dibuja, como mucho cada 300 ms; y una vez más al terminar ("idle").
      // Con el mapa quieto no se dibuja nada, así que no hay trabajo extra.
      let ultimaVez = 0
      m.on('render', () => {
        const ya = performance.now()
        if (ya - ultimaVez > 300) {
          ultimaVez = ya
          actualizarGruposRef.current()
        }
      })
      m.on('idle', () => actualizarGruposRef.current())
      setListo(true)
      if (!conDestino.current) {
        const vuelo = { center: [CENTRO_BASE.lng, CENTRO_BASE.lat] as [number, number], zoom: CENTRO_BASE.zoom, pitch: 55, bearing: -20 }
        if (reducir) m.jumpTo(vuelo)
        else setTimeout(() => m.flyTo({ ...vuelo, duration: 4500, curve: 1.5, essential: true }), 1400)
      }
    })
    const marcasGrupo = grupos.current
    return () => {
      marcasGrupo.forEach((mk) => mk.remove())
      marcasGrupo.clear()
      m.remove()
      mapa.current = null
    }
    // El mapa se crea una vez por clave; los avisos se atienden abajo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])

  /** Marcadores de grupo: los que el motor juntó, con la cantidad; tocarlos acerca o abre el grupo en el panel */
  const actualizarGrupos = () => {
    const m = mapa.current
    if (!m || !m.getLayer(CAPA_GRUPOS)) return
    const vistos = new Set<number>()
    // Solo los grupos que se dibujan ahora (las teselas de otro zoom guardadas en memoria no cuentan)
    for (const f of m.queryRenderedFeatures({ layers: [CAPA_GRUPOS] })) {
      const id = Number(f.properties?.cluster_id)
      if (vistos.has(id) || f.geometry.type !== 'Point') continue
      vistos.add(id)
      const [lng, lat] = f.geometry.coordinates as [number, number]
      const n = Number(f.properties?.point_count)
      let mk = grupos.current.get(id)
      if (!mk) {
        const el = document.createElement('button')
        el.type = 'button'
        el.className = 'grupo-lugares'
        el.addEventListener('click', (ev) => {
          ev.stopPropagation()
          abrirGrupoRef.current(id, [lng, lat])
        })
        mk = new Marker({ element: el }).setLngLat([lng, lat]).addTo(m)
        grupos.current.set(id, mk)
      }
      const el = mk.getElement()
      el.textContent = String(n)
      el.setAttribute('aria-label', `${n} comercios juntos: tocá para verlos`)
      mk.setLngLat([lng, lat])
    }
    grupos.current.forEach((mk, id) => {
      if (!vistos.has(id)) {
        mk.remove()
        grupos.current.delete(id)
      }
    })
  }
  const actualizarGruposRef = useRef(actualizarGrupos)
  actualizarGruposRef.current = actualizarGrupos

  /** Tocar un grupo: acerca la vista lo justo para separarlos; si no se separan (misma esquina), los lista en el panel */
  const abrirGrupo = async (id: number, centro: [number, number]) => {
    const m = mapa.current
    const fuente = m?.getSource(FUENTE) as unknown as FuenteLugares | undefined
    if (!m || !fuente) return
    const zoom = await fuente.getClusterExpansionZoom(id).catch(() => ZOOM_SIN_GRUPOS)
    if (zoom < ZOOM_SIN_GRUPOS) {
      m.easeTo({ center: centro, zoom: zoom + 0.4, padding: margenes(), duration: 600, essential: true })
      return
    }
    const hojas = await fuente.getClusterLeaves(id, 50, 0).catch(() => [])
    const indices = hojas.map((h) => Number(h.properties?.i)).filter((i) => !Number.isNaN(i))
    setGrupo(indices)
    setActivo(null)
    setListaAbierta(true)
    m.easeTo({ center: centro, zoom: Math.max(m.getZoom(), 16.5), padding: margenes(), duration: 600, essential: true })
  }
  const abrirGrupoRef = useRef(abrirGrupo)
  abrirGrupoRef.current = abrirGrupo

  /** Elegir un comercio desde la lista o desde el mapa */
  const elegir = (i: number, desde: 'lista' | 'mapa') => {
    setActivo(i)
    if (desde === 'mapa') {
      setListaAbierta(true) // su ficha se abre en la lista (también en el celular con el panel plegado)
      if (grupo && !grupo.includes(i)) setGrupo(null)
    }
  }
  const elegirRef = useRef(elegir)
  elegirRef.current = elegir

  // Con resultados, el fondo baja (propiedades del motor: es instantáneo y no agrega trabajo por cuadro)
  const hayResultados = !!busqueda
  useEffect(() => {
    const m = mapa.current
    if (!m || !listo) return
    const nivel = hayResultados ? INTENSIDAD.atenuado : INTENSIDAD.normal
    if (m.getLayer('satelite')) m.setPaintProperty('satelite', 'raster-opacity', nivel.satelite)
    if (m.getLayer('edificios')) m.setPaintProperty('edificios', 'fill-extrusion-opacity', clave ? nivel.edificios : nivel.edificios + 0.3)
  }, [hayResultados, listo, clave])

  // Cargar los comercios en el motor cuando cambian (sumar uno al pipeline lo pinta de verde)
  useEffect(() => {
    const m = mapa.current
    if (!m || !listo) return
    ;(m.getSource(FUENTE) as unknown as FuenteLugares | undefined)?.setData(comoGeojson(lugares))
  }, [lugares, listo])

  // Resultados nuevos: título, panel y un único movimiento corto para encuadrarlos en la parte visible
  useEffect(() => {
    const m = mapa.current
    if (!m || !listo || !busqueda) return
    const clave = `${busqueda.id}:${aviso.version}`
    if (encuadrada.current === clave) return
    encuadrada.current = clave
    setTitulo({ principal: mayuscula(busqueda.rubro), lugar: busqueda.zona })
    setActivo(null)
    setGrupo(null)
    // En el celular el panel arranca plegado para ver el mapa; en la compu, abierto
    setListaAbierta(window.innerWidth >= 768)
    destino.current?.remove()
    destino.current = null
    // Esperar a que el panel tome su tamaño antes de medir el espacio libre
    requestAnimationFrame(() => {
      const pts = busqueda.lugares.filter((l) => l.lat != null && l.lng != null)
      const padding = margenes()
      if (pts.length === 0) {
        if (busqueda.centro) m.easeTo({ center: [busqueda.centro.lng, busqueda.centro.lat], zoom: 13.2, padding, duration: 900, essential: true })
      } else if (pts.length === 1) {
        // Uno solo: se elige directo (la selección hace el único movimiento y muestra su nombre)
        setActivo(busqueda.lugares.indexOf(pts[0]))
      } else {
        const b = new LngLatBounds()
        pts.forEach((l) => b.extend([l.lng!, l.lat!]))
        m.fitBounds(b, { padding, maxZoom: 16, pitch: 50, bearing: m.getBearing(), linear: true, duration: 900, essential: true })
      }
    })
  }, [busqueda, aviso.version, listo, margenes])

  // Avisos de Jarvis que no son una búsqueda: volar a un lugar ("llevame a…") o el aviso previo de una búsqueda
  useEffect(() => {
    const m = mapa.current
    if (!m || !listo || !aviso.centro) return
    const { lat, lng, zoom } = aviso.centro
    if (aviso.previo) {
      // Mientras busca no se mueve la cámara (el único movimiento es al llegar los resultados); solo si está lejos, salta sin animar
      setTitulo({ principal: aviso.titulo ?? 'Buscando…' })
      const c = m.getCenter()
      if (Math.abs(c.lat - lat) + Math.abs(c.lng - lng) > 0.2 || m.getZoom() < 9) m.jumpTo({ center: [lng, lat], zoom: 12.6, pitch: 50 })
      return
    }
    setTitulo({ principal: aviso.titulo ?? '' })
    m.easeTo({ center: [lng, lat], zoom: zoom ?? 15, pitch: 55, padding: margenes(), duration: 1400, essential: true })
    destino.current?.remove()
    const el = document.createElement('div')
    el.className = 'pin-destino'
    destino.current = new Marker({ element: el }).setLngLat([lng, lat]).addTo(m)
  }, [aviso.centro, aviso.titulo, aviso.previo, aviso.version, listo, margenes])

  // El elegido: marcador naranja con su nombre y un pulso breve; los demás quedan discretos. La cámara lo deja a la vista junto al panel.
  useEffect(() => {
    const m = mapa.current
    if (!m || !listo) return
    seleccion.current?.remove()
    seleccion.current = null
    if (m.getLayer(CAPA_PUNTOS)) m.setFilter(CAPA_PUNTOS, ['all', ['!', ['has', 'point_count']], ['!=', ['get', 'i'], activo ?? -1]] as never)
    const l = activo != null ? lugares[activo] : null
    if (activo == null || !l) return
    // Esperar a que el panel se abra (en el celular) para medir y para mostrar su ficha
    const raf = requestAnimationFrame(() => {
      itemsRef.current.get(activo)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      if (l.lat == null || l.lng == null) return
      const el = document.createElement('div')
      el.className = cn('seleccion-lugar', l.prospecto_id && 'en-pipeline')
      el.innerHTML = '<span class="punto"></span><span class="nombre"></span>'
      ;(el.querySelector('.nombre') as HTMLElement).textContent = l.nombre
      seleccion.current = new Marker({ element: el }).setLngLat([l.lng, l.lat]).addTo(m)
      m.easeTo({ center: [l.lng, l.lat], zoom: Math.max(m.getZoom(), 15.8), padding: margenes(), duration: 650, essential: true })
    })
    return () => cancelAnimationFrame(raf)
    // lugares cambia al sumar uno al pipeline: no hace falta volver a mover la cámara por eso
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, listo, margenes])

  // Esc cierra
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onCerrar])

  const recentrar = () => {
    setActivo(null)
    setGrupo(null)
    if (!busqueda) setTitulo({ principal: CENTRO_BASE.titulo })
    mapa.current?.easeTo({ center: [CENTRO_BASE.lng, CENTRO_BASE.lat], zoom: CENTRO_BASE.zoom, pitch: 55, bearing: -20, padding: margenes(), duration: 1200, essential: true })
  }

  const sumar = async (i: number) => {
    const l = lugares[i]
    if (!l || sumando != null) return
    setSumando(i)
    setErrorSumar(null)
    try {
      const r = await sumarAlPipeline(i)
      // Solo después de guardarlo: lo que pasó de verdad
      const texto = r.yaEstaba ? `${l.nombre} ya estaba en el pipeline: lo marqué.` : `Sumé ${l.nombre} al pipeline.`
      setMensaje(texto)
      onDecir?.(texto)
    } catch (e) {
      setErrorSumar(e instanceof Error ? `No pude sumar ${l.nombre}: ${e.message}` : 'No se pudo sumar.')
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

  // Lo que se lee abajo: error, lo que dice ahora o lo que escucha, lo que está haciendo, lo último que pasó en el mapa o la última respuesta
  const linea = errorVoz
    ? { texto: errorVoz, error: true }
    : errorSumar
      ? { texto: errorSumar, error: true }
      : frase
        ? { texto: frase, error: false }
        : pensando
          ? { texto: consultando ? `Consultando ${consultando}…` : 'Pensando…', error: false }
          : mensaje
            ? { texto: mensaje, error: false }
            : respuesta
  const conUbicacion = lugares.filter((l) => l.lat != null).length
  const visibles = grupo ? lugares.map((l, i) => ({ l, i })).filter(({ i }) => grupo.includes(i)) : lugares.map((l, i) => ({ l, i }))

  return (
    <div className={cn('mapa-jarvis fixed inset-0 z-[75] overflow-hidden text-texto', busqueda && 'con-resultados')} role="dialog" aria-label="Mapa de Jarvis">
      <div className="estrellas pointer-events-none absolute inset-0" />
      {/* MapLibre le pone position: relative a su contenedor: va adentro de uno que ocupa toda la pantalla */}
      <div className="absolute inset-0">
        <div ref={contenedor} className="size-full" />
      </div>
      <div className="barrido pointer-events-none absolute inset-0" />
      <div className="vineta pointer-events-none absolute inset-0" />
      {!busqueda && <Reticula />}

      {/* Arranque: el enlace satelital */}
      {lineasArranque <= ARRANQUE.length && (
        <div className="pointer-events-none absolute top-1/2 left-1/2 w-[min(320px,80vw)] -translate-x-1/2 translate-y-[110px] font-mono text-xs text-acento-claro md:translate-y-[130px]">
          {ARRANQUE.slice(0, lineasArranque).map((l) => (
            <div key={l} className="animate-aparecer">
              <span className="text-turquesa">›</span> {l}
            </div>
          ))}
        </div>
      )}

      {/* Mientras Jarvis busca (sin capas animadas a pantalla completa: una barrita y listo) */}
      {buscando && (
        <PanelHud className="absolute top-[8.5rem] left-1/2 -translate-x-1/2 px-4 py-2 md:top-6">
          <div className="flex items-center gap-2 font-mono text-[11px] font-bold tracking-[0.2em] text-naranja uppercase">Escaneando sector · {consultando}</div>
          <div className="barra-busqueda mt-1.5 h-0.5 overflow-hidden rounded bg-naranja-tenue">
            <i />
          </div>
        </PanelHud>
      )}

      {/* Arriba a la izquierda: qué y dónde (en dos líneas, para leer la localidad) y telemetría */}
      <PanelHud refPanel={cabeceraRef} className="absolute top-3 left-3 max-w-[calc(100%-5rem)] px-3 py-2.5 md:top-5 md:left-5 md:max-w-[min(560px,calc(100%-30rem))] md:px-4 md:py-3">
        <div className="flex items-center gap-2 font-mono text-[10px] font-bold tracking-[0.25em] text-acento-claro uppercase">
          <span className="size-1.5 rounded-full bg-ok" /> Rastreo<span className="hidden sm:inline"> · enlace activo</span>
        </div>
        <div className="mt-0.5 truncate font-display text-base leading-tight font-bold md:mt-1 md:text-2xl">{titulo.principal || CENTRO_BASE.titulo}</div>
        {titulo.lugar && <div className="text-[13px] leading-snug text-suave md:text-sm">en {titulo.lugar}</div>}
        <Telemetria mapa={mapa} listo={listo} />
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
      <div className="absolute top-3 right-3 flex flex-col gap-2 md:top-5 md:right-5 md:flex-row">
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
            className="grid size-11 cursor-pointer place-items-center rounded-md border border-acento/40 bg-fondo/90 text-acento-claro hover:text-white"
          >
            <Icono className="size-5" />
          </button>
        ))}
      </div>

      {proxima && !busqueda && !buscando && <ProximaReunion proxima={proxima} />}

      {/* Derecha (abajo en el celular): comercios de la búsqueda o la agenda de hoy */}
      <PanelHud
        refPanel={panelRef}
        className={cn(
          'absolute inset-x-3 bottom-[10.5rem] flex flex-col overflow-hidden md:inset-x-auto md:top-28 md:right-5 md:bottom-36 md:max-h-none md:w-[410px]',
          listaAbierta ? 'max-h-[40vh]' : 'max-h-[3.6rem]',
        )}
      >
        {busqueda ? (
          <>
            <button
              onClick={() => setListaAbierta((v) => !v)}
              className="relative shrink-0 cursor-pointer border-b border-acento/25 px-4 py-2.5 text-left md:cursor-default md:py-3"
              aria-expanded={listaAbierta}
              aria-label={listaAbierta ? 'Plegar la lista' : 'Ver la lista de comercios'}
            >
              <span className="absolute top-3 right-3 text-acento-claro md:hidden">{listaAbierta ? <ChevronDown className="size-5" /> : <ChevronUp className="size-5" />}</span>
              <div className="flex items-baseline gap-2 pr-6">
                <span className="font-mono text-xl font-bold text-naranja md:text-2xl">{lugares.length}</span>
                <span className="truncate text-sm font-semibold">{lugares.length === 1 ? 'resultado' : lugares.length === 0 ? 'resultados' : busqueda.rubro}</span>
              </div>
              <div className="truncate text-xs text-suave">
                en {busqueda.zona}
                <span className="hidden text-tenue sm:inline">
                  {' '}
                  · {conUbicacion} en el mapa · {lugares.some((l) => l.fuente === 'google') ? 'Google Maps' : 'OpenStreetMap + web'}
                </span>
              </div>
            </button>
            {grupo && (
              <div className="flex items-center justify-between gap-2 border-b border-acento/25 px-4 py-2 font-mono text-[11px] text-acento-claro">
                <span>{grupo.length} comercios en el mismo punto</span>
                <button onClick={() => setGrupo(null)} className="cursor-pointer font-semibold hover:underline">
                  Ver todos
                </button>
              </div>
            )}
            <ul className="flex-1 overflow-y-auto py-1">
              {visibles.map(({ l, i }) => (
                <Expediente
                  key={`${l.nombre}-${i}`}
                  l={l}
                  i={i}
                  activo={activo === i}
                  sumando={sumando === i}
                  onElegir={() => elegir(i, 'lista')}
                  onSumar={() => sumar(i)}
                  refItem={(el) => {
                    if (el) itemsRef.current.set(i, el)
                    else itemsRef.current.delete(i)
                  }}
                />
              ))}
              {!lugares.length && (
                <li className="px-4 py-6 text-center text-sm text-tenue">
                  No encontré {busqueda.rubro} en {busqueda.zona}. Probá con otra zona o pedile a Jarvis "buscá en internet".
                </li>
              )}
            </ul>
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

      {/* Abajo a la izquierda (solo compu): los números del mes, discretos y ocultos mientras se mira una búsqueda */}
      {!busqueda && metricas.length > 0 && (
        <div className="absolute bottom-6 left-5 hidden gap-4 rounded-md border border-acento/20 bg-fondo/80 px-3 py-2 font-mono text-[10px] text-tenue opacity-70 transition-opacity hover:opacity-100 xl:flex">
          {metricas.slice(0, 4).map((m) => (
            <span key={m.label} className="whitespace-nowrap">
              {m.label.toUpperCase()} <b className="text-suave">{m.valor}</b>
            </span>
          ))}
        </div>
      )}

      {/* Abajo: lo que dice Jarvis, micrófono y para escribir */}
      <div
        ref={barraRef}
        className="absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-col gap-2 md:inset-x-auto md:bottom-6 md:left-1/2 md:w-[min(760px,calc(100%-3rem))] md:-translate-x-1/2"
      >
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
              'grid size-12 shrink-0 cursor-pointer place-items-center rounded-full text-white disabled:opacity-60',
              escuchando ? 'bg-peligro' : 'bg-acento hover:bg-acento-fuerte',
            )}
          >
            {pensando ? <Loader2 className="size-5 animate-spin" /> : <Mic className="size-5" />}
          </button>
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="O escribí qué buscar…"
            aria-label="Escribile a Jarvis"
            className="h-12 min-w-0 flex-1 rounded-[10px] border border-acento/40 bg-fondo/90 px-4 text-[15px] placeholder:text-tenue focus:border-acento focus:outline-none"
          />
          <button
            type="submit"
            disabled={pensando || !texto.trim()}
            aria-label="Mandar"
            className="grid size-12 shrink-0 cursor-pointer place-items-center rounded-full border border-acento/50 bg-fondo/90 text-acento-claro disabled:opacity-40"
          >
            <Send className="size-5" />
          </button>
        </form>
      </div>
    </div>
  )
}
