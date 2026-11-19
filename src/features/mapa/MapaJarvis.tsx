import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { LngLatBounds, Map as MapaGL, Marker, setWorkerUrl, type ErrorEvent, type StyleSpecification } from 'maplibre-gl'
// MapLibre 6 lee las teselas en un worker aparte: Vite lo publica como archivo y acá se le dice dónde está
import urlWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { Link } from 'react-router-dom'
import { AtSign, Check, Crosshair, Globe2, Loader2, MessageCircle, Mic, Phone, Plus, Settings, X } from 'lucide-react'
import type { AvisoMapa } from '../../types/db'
import { cn } from '../../components/ui/cn'
import { CENTRO_BASE, linkInstagram, useBusqueda, whatsapp } from './useMapa'
import './mapa.css'

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
  /** Lo que está diciendo Jarvis (subtítulos) */
  frase: string
  escuchando: boolean
  pensando: boolean
  onMicrofono: () => void
  onCerrar: () => void
  onConfigurar: () => void
}

setWorkerUrl(urlWorker)

const URL_OPENFREEMAP = 'https://tiles.openfreemap.org/planet'

/** Lee un color de los tokens de index.css (el mapa no entiende variables CSS). */
function token(nombre: string, respaldo: string): string {
  if (typeof window === 'undefined') return respaldo
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--color-${nombre}`).trim()
  return v || respaldo
}

/** Estilo del mapa: con clave de MapTiler, satélite + relieve + edificios; sin clave, calles y edificios de OpenFreeMap. */
export function estiloMapa(clave: string | null): StyleSpecification {
  const acento = token('acento', '#2d61fe')
  const claro = token('acento-claro', '#c4cffe')
  const turquesa = token('turquesa', '#4fc9a6')
  const fondo = token('fondo', '#121316')
  const edificios = {
    id: 'edificios',
    type: 'fill-extrusion' as const,
    source: 'calles',
    'source-layer': 'building',
    minzoom: 13,
    paint: {
      'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], ['get', 'height'], 8], 0, acento, 40, claro] as never,
      'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 8] as never,
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0] as never,
      'fill-extrusion-opacity': clave ? 0.55 : 0.85,
    },
  }
  const calles = {
    id: 'calles-luz',
    type: 'line' as const,
    source: 'calles',
    'source-layer': 'transportation',
    filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]] as never,
    paint: {
      'line-color': turquesa,
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 16, 2.5] as never,
      'line-opacity': clave ? 0.55 : 0.9,
      'line-blur': 0.6,
    },
  }
  const base = {
    version: 8 as const,
    projection: { type: 'globe' },
    sky: { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 8, 0] as never },
  }
  if (clave) {
    const k = encodeURIComponent(clave)
    return {
      ...base,
      sources: {
        satelite: { type: 'raster', url: `https://api.maptiler.com/tiles/satellite-v2/tiles.json?key=${k}`, tileSize: 512 },
        relieve: { type: 'raster-dem', url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${k}`, tileSize: 256 },
        calles: { type: 'vector', url: `https://api.maptiler.com/tiles/v3/tiles.json?key=${k}` },
      },
      layers: [
        { id: 'fondo', type: 'background', paint: { 'background-color': fondo } },
        { id: 'satelite', type: 'raster', source: 'satelite', paint: { 'raster-contrast': 0.25, 'raster-brightness-max': 0.95 } },
        calles,
        edificios,
      ],
    } as unknown as StyleSpecification
  }
  return {
    ...base,
    sources: { calles: { type: 'vector', url: URL_OPENFREEMAP } },
    layers: [
      { id: 'fondo', type: 'background', paint: { 'background-color': fondo } },
      { id: 'tierra', type: 'fill', source: 'calles', 'source-layer': 'landcover', paint: { 'fill-color': acento, 'fill-opacity': 0.12 } },
      { id: 'agua', type: 'fill', source: 'calles', 'source-layer': 'water', paint: { 'fill-color': acento, 'fill-opacity': 0.45 } },
      {
        id: 'calles-todas',
        type: 'line',
        source: 'calles',
        'source-layer': 'transportation',
        paint: { 'line-color': claro, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.2, 17, 1.2], 'line-opacity': 0.35 },
      },
      calles,
      edificios,
    ],
  } as unknown as StyleSpecification
}

const fmtCoord = (n: number, pos: string, neg: string) => `${Math.abs(n).toFixed(4)}° ${n >= 0 ? pos : neg}`

function minutosHasta(d: Date, ahora: Date): string {
  const min = Math.round((d.getTime() - ahora.getTime()) / 60000)
  if (min <= 0) return 'ahora'
  if (min < 60) return `en ${min} min`
  const h = Math.floor(min / 60)
  return `en ${h} h ${String(min % 60).padStart(2, '0')}`
}

/** Anillo con un número adentro (los círculos de abajo a la izquierda) */
function Anillo({ m, i }: { m: MetricaMapa; i: number }) {
  const r = 30
  const c = 2 * Math.PI * r
  const avance = m.avance == null ? 0.18 + ((i * 0.23) % 0.6) : Math.max(0.02, Math.min(1, m.avance))
  return (
    <div className="flex w-[92px] flex-col items-center gap-1">
      <div className="relative size-[76px]">
        <svg viewBox="0 0 76 76" className="size-full -rotate-90">
          <circle cx="38" cy="38" r={r} fill="none" stroke="var(--color-acento-tenue)" strokeWidth="5" />
          <circle
            cx="38"
            cy="38"
            r={r}
            fill="none"
            stroke={m.avance == null ? 'var(--color-turquesa)' : 'var(--color-acento-claro)'}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - avance)}
            className="transition-[stroke-dashoffset] duration-1000"
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center px-1 text-center font-display text-[13px] leading-tight font-bold">{m.valor}</div>
      </div>
      <span className="text-center text-[10px] font-semibold tracking-[0.12em] text-acento-claro uppercase">{m.label}</span>
    </div>
  )
}

function PanelHud({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-acento/40 bg-fondo/75 shadow-[0_0_40px_-12px_var(--color-acento)] backdrop-blur-md',
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * Modo mapa de Jarvis: arranca con la Tierra, vuela a Tucumán y queda en una vista holográfica en 3D.
 * Muestra la agenda, los números del mes y, si Jarvis buscó negocios, los marca con su contacto.
 */
export default function MapaJarvis({ aviso, clave, agenda, proxima, metricas, frase, escuchando, pensando, onMicrofono, onCerrar, onConfigurar }: Props) {
  const contenedor = useRef<HTMLDivElement>(null)
  const mapa = useRef<MapaGL | null>(null)
  const marcadores = useRef<Marker[]>([])
  const destino = useRef<Marker | null>(null)
  const [listo, setListo] = useState(false)
  const [centro, setCentro] = useState({ lat: CENTRO_BASE.lat, lng: CENTRO_BASE.lng })
  const [titulo, setTitulo] = useState(aviso.titulo ?? CENTRO_BASE.titulo)
  const [activo, setActivo] = useState<number | null>(null)
  const [sumando, setSumando] = useState<number | null>(null)
  const [errorSumar, setErrorSumar] = useState<string | null>(null)
  const [ahora, setAhora] = useState(() => new Date())
  const [errorMapa, setErrorMapa] = useState<string | null>(null)
  const { busqueda, sumarAlPipeline } = useBusqueda(aviso.busqueda_id, aviso.version)
  const quieto = useRef(0) // hasta cuándo no girar solo (el socio está moviendo el mapa)

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

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
    m.on('move', () => {
      const c = m.getCenter()
      setCentro({ lat: c.lat, lng: c.lng })
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
        else setTimeout(() => m.flyTo({ ...vuelo, duration: 7000, curve: 1.6, essential: true }), 900)
      }
    })
    // Giro lento de cámara cuando nadie lo toca
    let raf = 0
    const girar = () => {
      raf = requestAnimationFrame(girar)
      if (reducir || !m.loaded() || m.isMoving() || Date.now() < quieto.current || m.getZoom() < 9) return
      m.setBearing(m.getBearing() + 0.025)
    }
    raf = requestAnimationFrame(girar)
    return () => {
      cancelAnimationFrame(raf)
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

  // Marcar los negocios de la búsqueda
  const lugares = useMemo(() => busqueda?.lugares ?? [], [busqueda])
  useEffect(() => {
    const m = mapa.current
    if (!m || !listo) return
    marcadores.current.forEach((x) => x.remove())
    marcadores.current = []
    const conUbicacion = lugares.map((l, i) => ({ l, i })).filter(({ l }) => l.lat != null && l.lng != null)
    for (const { l, i } of conUbicacion) {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = cn('pin-lugar', l.prospecto_id && 'en-pipeline')
      el.textContent = String(i + 1)
      el.title = l.nombre
      el.setAttribute('aria-label', `${i + 1}. ${l.nombre}`)
      el.addEventListener('click', (ev) => {
        ev.stopPropagation()
        setActivo(i)
      })
      marcadores.current.push(new Marker({ element: el }).setLngLat([l.lng!, l.lat!]).addTo(m))
    }
    if (busqueda) setTitulo(`${busqueda.rubro} · ${busqueda.zona}`)
    // Encuadrar todos los resultados (o la zona si no hay ubicaciones)
    if (conUbicacion.length) {
      const b = new LngLatBounds()
      conUbicacion.forEach(({ l }) => b.extend([l.lng!, l.lat!]))
      const angosto = window.innerWidth < 768
      m.fitBounds(b, {
        padding: angosto ? { top: 120, bottom: 300, left: 40, right: 40 } : { top: 140, bottom: 200, left: 160, right: 460 },
        maxZoom: 15.5,
        pitch: 55,
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
      const el = mk.getElement()
      el.classList.toggle('activo', el.textContent === String((activo ?? -1) + 1))
    })
    const l = activo != null ? lugares[activo] : null
    if (l?.lat != null && l.lng != null) {
      quieto.current = Date.now() + 9000
      mapa.current?.flyTo({ center: [l.lng, l.lat], zoom: 16.5, pitch: 62, duration: 2500, essential: true })
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

  const proximaCercana = proxima && proxima.inicio.getTime() - ahora.getTime() < 12 * 3600_000 && proxima.inicio.getTime() > ahora.getTime() - 15 * 60_000

  return (
    <div className="mapa-jarvis fixed inset-0 z-[75] overflow-hidden text-texto" role="dialog" aria-label="Mapa de Jarvis">
      <div className="estrellas pointer-events-none absolute inset-0" />
      {/* MapLibre le pone position: relative a su contenedor: va adentro de uno que ocupa toda la pantalla */}
      <div className="absolute inset-0">
        <div ref={contenedor} className="size-full" />
      </div>
      <div className="barrido pointer-events-none absolute inset-0" />

      {/* Arriba a la izquierda: dónde estamos */}
      <PanelHud className="absolute top-3 left-3 max-w-[calc(100%-11.5rem)] px-4 py-3 md:top-5 md:left-5 md:max-w-[min(560px,calc(100%-30rem))]">
        <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.25em] text-acento-claro uppercase">
          <Globe2 className="size-3.5" /> Jarvis · mapa
        </div>
        <div className="mt-1 truncate font-display text-lg leading-tight font-bold md:text-2xl">{titulo || CENTRO_BASE.titulo}</div>
        <div className="tabular mt-1 flex flex-wrap gap-x-3 text-[11px] text-suave">
          <span>{fmtCoord(centro.lat, 'N', 'S')}</span>
          <span>{fmtCoord(centro.lng, 'E', 'O')}</span>
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
            className="grid size-11 cursor-pointer place-items-center rounded-full border border-acento/40 bg-fondo/75 text-acento-claro backdrop-blur-md hover:text-white"
          >
            <Icono className="size-5" />
          </button>
        ))}
      </div>

      {/* Próxima reunión, como el cartel de tiempo del video */}
      {proximaCercana && !busqueda && (
        <PanelHud className="absolute top-5 left-1/2 hidden -translate-x-1/2 px-5 py-2.5 xl:block">
          <div className="flex items-baseline gap-3">
            <span className="tabular font-display text-2xl font-bold text-acento-claro">{minutosHasta(proxima.inicio, ahora)}</span>
            <span className="text-sm text-suave">{proxima.titulo}</span>
          </div>
        </PanelHud>
      )}

      {/* Derecha: resultados de la búsqueda o la agenda de hoy */}
      <PanelHud className="absolute inset-x-3 bottom-[8.5rem] flex max-h-[42vh] flex-col overflow-hidden md:inset-x-auto md:top-24 md:right-5 md:bottom-32 md:max-h-none md:w-[400px]">
        {busqueda ? (
          <>
            <div className="border-b border-acento/25 px-4 py-3">
              <div className="text-[10px] font-bold tracking-[0.25em] text-acento-claro uppercase">Búsqueda de Jarvis</div>
              <div className="mt-0.5 font-semibold">
                {lugares.length} {lugares.length === 1 ? 'lugar' : 'lugares'} · {busqueda.rubro}
              </div>
              <div className="text-xs text-tenue">{busqueda.zona} · OpenStreetMap y web</div>
            </div>
            <ul className="flex-1 overflow-y-auto p-2">
              {lugares.map((l, i) => {
                const wa = l.telefono ? whatsapp(l.telefono) : null
                return (
                  <li key={`${l.nombre}-${i}`}>
                    <div
                      className={cn(
                        'rounded-xl border px-3 py-2.5 transition-colors',
                        activo === i ? 'border-naranja/60 bg-naranja-tenue/60' : 'border-transparent hover:bg-elevada/60',
                      )}
                    >
                      <button onClick={() => setActivo(i)} className="flex w-full cursor-pointer items-start gap-2.5 text-left">
                        <span
                          className={cn(
                            'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold',
                            l.prospecto_id ? 'bg-ok text-fondo' : 'bg-acento text-white',
                          )}
                        >
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{l.nombre}</span>
                          <span className="block truncate text-xs text-tenue">
                            {l.direccion || (l.lat == null ? 'Sin ubicación en el mapa' : 'Sin dirección cargada')}
                            {l.fuente === 'web' ? ' · web' : ''}
                          </span>
                        </span>
                      </button>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-8">
                        {l.telefono && (
                          <a href={`tel:${l.telefono}`} className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-elevada px-2 text-xs text-suave hover:text-white">
                            <Phone className="size-3.5" /> {l.telefono}
                          </a>
                        )}
                        {wa && (
                          <a href={wa} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-ok-tenue px-2 text-xs text-ok hover:brightness-125">
                            <MessageCircle className="size-3.5" /> WhatsApp
                          </a>
                        )}
                        {l.instagram && (
                          <a href={linkInstagram(l.instagram)} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-violeta-tenue px-2 text-xs text-violeta hover:brightness-125">
                            <AtSign className="size-3.5" /> Instagram
                          </a>
                        )}
                        {l.web && (
                          <a href={/^https?:/i.test(l.web) ? l.web : `https://${l.web}`} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-elevada px-2 text-xs text-acento-texto hover:text-white">
                            <Globe2 className="size-3.5" /> Web
                          </a>
                        )}
                        {l.prospecto_id ? (
                          <Link to={`/clientes/${l.prospecto_id}`} className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-ok hover:underline">
                            <Check className="size-3.5" /> En el pipeline
                          </Link>
                        ) : (
                          <button
                            onClick={() => sumar(i)}
                            disabled={sumando != null}
                            className="ml-auto inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-lg border border-acento/50 px-2 text-xs font-semibold text-acento-claro hover:bg-acento-tenue disabled:opacity-50"
                          >
                            {sumando === i ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Sumar al pipeline
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
              {!lugares.length && <li className="px-3 py-6 text-center text-sm text-tenue">No encontré lugares de ese rubro en la zona.</li>}
            </ul>
            {errorSumar && <p className="border-t border-acento/25 px-4 py-2 text-xs text-peligro">{errorSumar}</p>}
          </>
        ) : (
          <>
            <div className="border-b border-acento/25 px-4 py-3">
              <div className="text-[10px] font-bold tracking-[0.25em] text-acento-claro uppercase">Hoy</div>
              <div className="mt-0.5 font-semibold">
                {agenda.length ? `${agenda.length} ${agenda.length === 1 ? 'cosa' : 'cosas'} en la agenda` : 'Agenda libre'}
              </div>
            </div>
            <ul className="flex-1 overflow-y-auto p-3 text-sm">
              {agenda.map((a, i) => (
                <li key={i} className="flex gap-3 border-b border-acento/10 py-2 last:border-0">
                  <span className="tabular w-11 shrink-0 font-semibold text-acento-claro">{a.hora}</span>
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
      <PanelHud className="absolute bottom-32 left-5 hidden gap-1 px-3 py-3 lg:flex">
        {metricas.slice(0, 4).map((m, i) => (
          <Anillo key={m.label} m={m} i={i} />
        ))}
      </PanelHud>

      {/* Abajo: subtítulos y micrófono */}
      <div className="absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center gap-3 md:inset-x-auto md:bottom-6 md:left-1/2 md:w-[min(760px,calc(100%-3rem))] md:-translate-x-1/2">
        <button
          onClick={onMicrofono}
          disabled={pensando}
          aria-label={escuchando ? 'Terminar y mandar' : 'Hablar con Jarvis'}
          className={cn(
            'grid size-14 shrink-0 cursor-pointer place-items-center rounded-full text-white shadow-[0_0_30px_-4px_var(--color-acento)] disabled:opacity-60',
            escuchando ? 'animate-pulse bg-peligro' : 'bg-acento hover:bg-acento-fuerte',
          )}
        >
          {pensando ? <Loader2 className="size-6 animate-spin" /> : <Mic className="size-6" />}
        </button>
        <PanelHud className="min-h-14 flex-1 px-4 py-2.5">
          <p className="line-clamp-2 text-sm leading-snug text-suave md:text-base" aria-live="polite">
            {frase || (pensando ? 'Buscando…' : escuchando ? 'Te escucho…' : 'Tocá el micrófono y pedile un lugar o un rubro.')}
          </p>
        </PanelHud>
      </div>

    </div>
  )
}
