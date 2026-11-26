import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { LngLatBounds, Map as MapaGL, Marker, setWorkerUrl, type ErrorEvent, type PaddingOptions } from 'maplibre-gl'
// MapLibre 6 lee las teselas en un worker aparte: Vite lo publica como archivo y acá se le dice dónde está
import urlWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { Link } from 'react-router-dom'
import { ArrowLeft, AtSign, Check, ChevronDown, ChevronRight, ChevronUp, Crosshair, Globe2, Keyboard, Loader2, MapPin, MessageCircle, Phone, Plus, Send, Settings, Star, X } from 'lucide-react'
import type { AvisoMapa, LugarBusqueda } from '../../types/db'
import { cn } from '../../components/ui/cn'
import { CENTRO_BASE, linkInstagram, useBusqueda, whatsapp } from './useMapa'
import { CAPA_EDIFICIOS_3D, estiloMapa, INTENSIDAD, texturaGlobo } from './estilo'
import { EsferaJarvis, GloboApertura, type EstadoEsfera } from './Apertura'
import './mapa.css'

setWorkerUrl(urlWorker)

export interface MetricaMapa {
  label: string
  valor: string
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
  /** Jarvis está hablando (para la esfera) */
  hablando?: boolean
  onMicrofono: () => void
  onEnviar: (texto: string) => void
  /** Que Jarvis diga en voz alta algo que pasó en el mapa ("Sumé Ruddy's al pipeline") */
  onDecir?: (texto: string) => void
  onCerrar: () => void
  onConfigurar: () => void
}

const FUENTE = 'lugares'
/** Capas invisibles: solo sirven para preguntarle al motor qué puntos y grupos está dibujando ahora */
const CAPA_PUNTOS = 'lugares-puntos'
const CAPA_GRUPOS = 'lugares-grupos'
/** Más cerca que esto, el motor ya no agrupa (si siguen juntos, el grupo se abre en el panel) */
const ZOOM_SIN_GRUPOS = 17
/** Vista aérea inclinada (liviana para equipos modestos) */
const INCLINACION = 60
const CLAVE_LIVIANO = 'brixx-mapa-liviano'

const numero = (i: number) => String(i + 1).padStart(2, '0')
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const sinProvincia = (z: string) => z.replace(/, Tucumán$/, '')

type FuenteLugares = {
  setData: (d: Coleccion) => void
  getClusterExpansionZoom: (id: number) => Promise<number>
  getClusterLeaves: (id: number, limite: number, desde: number) => Promise<{ properties?: Record<string, unknown> | null }[]>
}
type Punto = { type: 'Feature'; id: number; geometry: { type: 'Point'; coordinates: [number, number] }; properties: { i: number; en: boolean } }
type Coleccion = { type: 'FeatureCollection'; features: Punto[] }

/** Los comercios con ubicación como puntos del motor de mapa (el motor los agrupa) */
function comoGeojson(lugares: LugarBusqueda[]): Coleccion {
  return {
    type: 'FeatureCollection',
    features: lugares.flatMap((l, i) =>
      l.lat != null && l.lng != null ? [{ type: 'Feature' as const, id: i, geometry: { type: 'Point' as const, coordinates: [l.lng, l.lat] as [number, number] }, properties: { i, en: !!l.prospecto_id } }] : [],
    ),
  }
}

/** ¿Equipo modesto? (pocos núcleos o poca memoria, o ya se vio que andaba lento): sin terreno ni edificios 3D */
function equipoModesto(): boolean {
  try {
    if (localStorage.getItem(CLAVE_LIVIANO) === '1') return true
  } catch {
    // sin almacenamiento
  }
  const nav = navigator as Navigator & { deviceMemory?: number }
  return (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4
}

/** Contacto y acción de un comercio (en la ficha del elegido) */
function Contacto({ l, sumando, onSumar }: { l: LugarBusqueda; sumando: boolean; onSumar: () => void }) {
  const wa = l.telefono ? whatsapp(l.telefono) : null
  const chip = 'inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs'
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
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
      </div>
      {l.prospecto_id ? (
        <Link to={`/clientes/${l.prospecto_id}`} className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-[11px] border border-ok/50 bg-ok-tenue text-sm font-semibold text-ok">
          <Check className="size-4" /> En el pipeline
        </Link>
      ) : (
        <button
          onClick={onSumar}
          disabled={sumando}
          className="mt-3 flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[11px] border border-acento-claro/60 text-sm font-semibold text-acento-claro hover:bg-acento-tenue disabled:opacity-50"
        >
          {sumando ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} {sumando ? 'Sumando…' : 'Sumar al pipeline'}
        </button>
      )}
    </>
  )
}

/** Ficha del comercio elegido */
function Ficha({ l, i, sumando, onSumar, onVolver }: { l: LugarBusqueda; i: number; sumando: boolean; onSumar: () => void; onVolver?: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      {onVolver && (
        <button onClick={onVolver} className="-mt-1 mb-1 inline-flex w-fit cursor-pointer items-center gap-1 text-xs font-semibold text-acento-texto">
          <ArrowLeft className="size-3.5" /> Resultados
        </button>
      )}
      <div className="flex items-start gap-3">
        <span className="rombo-numero mt-1 shrink-0">{numero(i)}</span>
        <div className="min-w-0">
          <h3 className="text-xl leading-tight font-bold">{l.nombre}</h3>
          {l.direccion && (
            <p className="mt-1 flex items-start gap-1.5 text-sm text-suave">
              <MapPin className="mt-0.5 size-4 shrink-0" /> {l.direccion}
            </p>
          )}
          {l.rating != null && (
            <p className="mt-1 flex items-center gap-1.5 text-lg font-semibold">
              <Star className="size-4 fill-current text-aviso" /> {l.rating.toFixed(1).replace('.', ',')}
              <span className="text-xs font-normal text-tenue">· {l.resenas ?? 0} reseñas</span>
            </p>
          )}
        </div>
      </div>
      {l.horario && <p className="text-xs leading-relaxed whitespace-pre-line text-tenue">{l.horario.replaceAll(' · ', '\n')}</p>}
      {l.nota && <p className="text-xs text-aviso">{l.nota}</p>}
      {l.lat == null && <p className="text-xs text-tenue">Sin ubicación en el mapa.</p>}
      <Contacto l={l} sumando={sumando} onSumar={onSumar} />
    </div>
  )
}

/**
 * Modo mapa de Jarvis. Tres escenas: (1) globo liviano girando hasta Tucumán mientras se prepara el mapa real,
 * (2) vista aérea inclinada en azul noche con los resultados en rombos numerados, (3) el elegido de cerca con su ficha.
 * Pensado para equipos modestos: nada se anima solo, edificios 3D y relieve solo si el equipo y la zona lo permiten.
 */
export default function MapaJarvis({
  aviso,
  clave,
  agenda,
  frase,
  respuesta,
  consultando,
  errorVoz,
  escuchando,
  pensando,
  hablando,
  onMicrofono,
  onEnviar,
  onDecir,
  onCerrar,
  onConfigurar,
}: Props) {
  const contenedor = useRef<HTMLDivElement>(null)
  const mapa = useRef<MapaGL | null>(null)
  const marcas = useRef(new Map<string, Marker>())
  const seleccion = useRef<Marker | null>(null)
  const destino = useRef<Marker | null>(null)
  const cabeceraRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const fichaRef = useRef<HTMLDivElement>(null)
  const barraRef = useRef<HTMLDivElement>(null)
  const encuadrada = useRef('')
  const liviano = useRef(equipoModesto())
  const medido = useRef(false)
  const inicioDestino = aviso.centro ?? CENTRO_BASE

  const [listo, setListo] = useState(false) // el motor cargó el estilo
  const [preparado, setPreparado] = useState(false) // el mapa del destino ya se dibujó
  const [enfocado, setEnfocado] = useState(false) // el globo ya giró hasta el destino
  const [conGlobo, setConGlobo] = useState(true)
  const [titulo, setTitulo] = useState<{ principal: string; lugar?: string }>({ principal: aviso.previo ? (aviso.titulo ?? 'Buscando…') : (aviso.titulo ?? CENTRO_BASE.titulo) })
  const [activo, setActivo] = useState<number | null>(null)
  const [grupo, setGrupo] = useState<number[] | null>(null)
  const [sumando, setSumando] = useState<number | null>(null)
  const [errorSumar, setErrorSumar] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [errorMapa, setErrorMapa] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [teclado, setTeclado] = useState(false)
  const [listaAbierta, setListaAbierta] = useState(true)
  const [altoBarra, setAltoBarra] = useState(150)
  const { busqueda, sumarAlPipeline } = useBusqueda(aviso.busqueda_id, aviso.version)
  const lugares = useMemo(() => busqueda?.lugares ?? [], [busqueda])
  const activoRef = useRef(activo)
  activoRef.current = activo

  // El globo se va cuando giró hasta el destino y el mapa real ya está dibujado (y, si se está buscando, cuando llegan
  // los resultados o pasaron unos segundos)
  const esperandoResultados = !!aviso.previo && !busqueda && pensando
  const [paciencia, setPaciencia] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setPaciencia(true), 9000)
    return () => clearTimeout(t)
  }, [])
  // Si el mapa tarda en dibujarse del todo (conexión lenta), no se espera de más: entra igual a los 2,5 s del giro
  useEffect(() => {
    if (!enfocado) return
    const t = setTimeout(() => setPreparado(true), 2500)
    return () => clearTimeout(t)
  }, [enfocado])
  const saleGlobo = conGlobo && enfocado && preparado && (!esperandoResultados || paciencia)

  useEffect(() => {
    if (pensando) setMensaje(null)
  }, [pensando])

  // En el celular el panel va justo arriba de la barra de abajo (que crece con el teclado o la respuesta)
  useEffect(() => {
    const el = barraRef.current
    if (!el) return
    const medir = () => setAltoBarra(window.innerHeight - el.getBoundingClientRect().top)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /** El espacio libre del mapa: descuenta la cabecera, la ficha, el panel de resultados y la barra de abajo */
  const margenes = useCallback((): PaddingOptions => {
    const W = window.innerWidth
    const H = window.innerHeight
    const angosto = W < 768
    const cab = cabeceraRef.current?.getBoundingClientRect()
    const pan = panelRef.current?.getBoundingClientRect()
    const fic = fichaRef.current?.getBoundingClientRect()
    const bar = barraRef.current?.getBoundingClientRect()
    let top = (cab?.bottom ?? 70) + 28
    let bottom = H - (angosto ? Math.min(pan?.top ?? H, bar?.top ?? H) : (bar?.top ?? H)) + 24
    const right = angosto ? 28 : W - (pan?.left ?? W) + 36
    const left = angosto ? 28 : fic && fic.width ? fic.right + 36 : 48
    const libre = H - top - bottom
    if (libre < 120) {
      const sobra = (120 - libre) / 2
      top = Math.max(16, top - sobra)
      bottom = Math.max(16, bottom - sobra)
    }
    return { top: Math.round(top), bottom: Math.round(bottom), left: Math.round(Math.min(left, W * 0.45)), right: Math.round(Math.min(right, W * 0.45)) }
  }, [])

  /** Edificios 3D solo donde hay cobertura y el equipo lo banca (si no, quedan las huellas planas) */
  const ajustarEdificios = () => {
    const m = mapa.current
    if (!m || !m.getLayer(CAPA_EDIFICIOS_3D)) return
    let hay = false
    if (!liviano.current && m.getZoom() >= 14.5) {
      try {
        hay = m.querySourceFeatures('calles', { sourceLayer: 'building' }).length >= 40
      } catch {
        hay = false
      }
    }
    const visible = m.getLayoutProperty(CAPA_EDIFICIOS_3D, 'visibility') !== 'none'
    if (hay !== visible) m.setLayoutProperty(CAPA_EDIFICIOS_3D, 'visibility', hay ? 'visible' : 'none')
  }
  const ajustarEdificiosRef = useRef(ajustarEdificios)
  ajustarEdificiosRef.current = ajustarEdificios

  /** Si un movimiento de cámara anduvo a menos de ~24 cuadros por segundo, se pasa a modo liviano (y se recuerda) */
  const medirRendimiento = () => {
    const m = mapa.current
    if (!m || medido.current || liviano.current) return
    medido.current = true
    let cuadros = 0
    const t0 = performance.now()
    const contar = () => cuadros++
    m.on('render', contar)
    m.once('moveend', () => {
      m.off('render', contar)
      const ms = performance.now() - t0
      if (ms > 500 && (cuadros * 1000) / ms < 24) {
        liviano.current = true
        try {
          localStorage.setItem(CLAVE_LIVIANO, '1')
        } catch {
          // sin almacenamiento
        }
        if (m.getTerrain()) m.setTerrain(null)
        ajustarEdificiosRef.current()
      }
    })
  }

  // Crear el mapa (una vez por clave) ya en el destino: se prepara mientras gira el globo
  useEffect(() => {
    if (!contenedor.current) return
    const m = new MapaGL({
      container: contenedor.current,
      style: estiloMapa(clave),
      center: [inicioDestino.lng, inicioDestino.lat],
      zoom: aviso.centro?.zoom ?? CENTRO_BASE.zoom,
      pitch: INCLINACION,
      bearing: -15,
      attributionControl: { compact: true },
      maxPitch: 70,
      canvasContextAttributes: { antialias: false },
      pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
      fadeDuration: 150,
    })
    mapa.current = m
    try {
      if (localStorage.getItem('brixx-pruebas-mapa') === '1') (window as unknown as { __mapaJarvis?: MapaGL }).__mapaJarvis = m
    } catch {
      // sin almacenamiento
    }
    m.on('error', (e: ErrorEvent) => {
      const estado = (e.error as { status?: number } | undefined)?.status
      const url = String((e.error as { url?: string } | undefined)?.url ?? '')
      if (clave && (estado === 401 || estado === 403) && (!url || url.includes('maptiler'))) setErrorMapa('MapTiler rechazó la clave. Revisala en Configurar.')
    })
    m.on('load', () => {
      // Relieve 3D solo en equipos que lo bancan; si no, queda el sombreado (liviano) que ya marca el cerro
      if (clave && !liviano.current && m.getSource('relieve')) {
        try {
          m.setTerrain({ source: 'relieve', exaggeration: 1.25 })
        } catch {
          // sin relieve si el navegador no puede
        }
      }
      m.addSource(FUENTE, { type: 'geojson', data: comoGeojson([]), cluster: true, clusterRadius: 44, clusterMaxZoom: ZOOM_SIN_GRUPOS - 1 })
      m.addLayer({ id: CAPA_PUNTOS, type: 'circle', source: FUENTE, filter: ['!', ['has', 'point_count']] as never, paint: { 'circle-radius': 1, 'circle-opacity': 0 } })
      m.addLayer({ id: CAPA_GRUPOS, type: 'circle', source: FUENTE, filter: ['has', 'point_count'] as never, paint: { 'circle-radius': 1, 'circle-opacity': 0 } })
      // Marcadores: mientras el motor dibuja, como mucho cada 300 ms; y una vez más al terminar. Con el mapa quieto, nada.
      let ultimaVez = 0
      m.on('render', () => {
        const ya = performance.now()
        if (ya - ultimaVez > 300) {
          ultimaVez = ya
          sincronizarRef.current()
        }
      })
      m.on('idle', () => {
        sincronizarRef.current()
        ajustarEdificiosRef.current()
      })
      m.once('idle', () => setPreparado(true))
      setListo(true)
    })
    const lista = marcas.current
    return () => {
      lista.forEach((mk) => mk.remove())
      lista.clear()
      m.remove()
      mapa.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])

  /** Rombos numerados (comercios) y círculos con la cantidad (grupos), según lo que el motor dibuja ahora */
  const sincronizar = () => {
    const m = mapa.current
    if (!m || !m.getLayer(CAPA_PUNTOS)) return
    const vistos = new Set<string>()
    const poner = (k: string, lngLat: [number, number], crear: () => HTMLElement, actualizar: (el: HTMLElement) => void) => {
      vistos.add(k)
      let mk = marcas.current.get(k)
      if (!mk) {
        mk = new Marker({ element: crear() }).setLngLat(lngLat).addTo(m)
        marcas.current.set(k, mk)
      } else mk.setLngLat(lngLat)
      actualizar(mk.getElement())
    }
    for (const f of m.queryRenderedFeatures({ layers: [CAPA_PUNTOS, CAPA_GRUPOS] })) {
      if (f.geometry.type !== 'Point') continue
      const lngLat = f.geometry.coordinates as [number, number]
      if (f.properties?.point_count) {
        const id = Number(f.properties.cluster_id)
        const n = Number(f.properties.point_count)
        poner(
          `g${id}`,
          lngLat,
          () => {
            const el = document.createElement('button')
            el.type = 'button'
            el.className = 'grupo-lugares'
            el.addEventListener('click', (ev) => {
              ev.stopPropagation()
              abrirGrupoRef.current(id, lngLat)
            })
            return el
          },
          (el) => {
            el.textContent = String(n)
            el.setAttribute('aria-label', `${n} comercios juntos: tocá para verlos`)
          },
        )
      } else {
        const i = Number(f.properties?.i)
        if (i === activoRef.current) continue // el elegido tiene su retícula
        poner(
          `p${i}`,
          lngLat,
          () => {
            const el = document.createElement('button')
            el.type = 'button'
            el.className = 'rombo-lugar'
            el.innerHTML = '<span></span>'
            el.addEventListener('click', (ev) => {
              ev.stopPropagation()
              elegirRef.current(i, 'mapa')
            })
            return el
          },
          (el) => {
            ;(el.firstElementChild as HTMLElement).textContent = numero(i)
            el.classList.toggle('en-pipeline', !!f.properties?.en)
            el.setAttribute('aria-label', `${numero(i)}: tocá para ver su ficha`)
          },
        )
      }
    }
    marcas.current.forEach((mk, k) => {
      if (!vistos.has(k)) {
        mk.remove()
        marcas.current.delete(k)
      }
    })
  }
  const sincronizarRef = useRef(sincronizar)
  sincronizarRef.current = sincronizar

  /** Tocar un grupo: acerca lo justo para separarlos; si no se separan (misma esquina), los lista en el panel */
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
    setGrupo(hojas.map((h) => Number(h.properties?.i)).filter((i) => !Number.isNaN(i)))
    setActivo(null)
    setListaAbierta(true)
    m.easeTo({ center: centro, zoom: Math.max(m.getZoom(), 16.5), padding: margenes(), duration: 600, essential: true })
  }
  const abrirGrupoRef = useRef(abrirGrupo)
  abrirGrupoRef.current = abrirGrupo

  const elegir = (i: number, desde: 'lista' | 'mapa') => {
    setActivo(i)
    setListaAbierta(true)
    if (desde === 'mapa' && grupo && !grupo.includes(i)) setGrupo(null)
  }
  const elegirRef = useRef(elegir)
  elegirRef.current = elegir

  // Fondo atenuado con resultados (propiedades del motor: instantáneo)
  const hayResultados = !!busqueda
  useEffect(() => {
    const m = mapa.current
    if (!m || !listo) return
    const nivel = hayResultados ? INTENSIDAD.atenuado : INTENSIDAD.normal
    if (m.getLayer('satelite')) m.setPaintProperty('satelite', 'raster-opacity', nivel.satelite)
    if (m.getLayer(CAPA_EDIFICIOS_3D)) m.setPaintProperty(CAPA_EDIFICIOS_3D, 'fill-extrusion-opacity', nivel.edificios)
  }, [hayResultados, listo])

  // Cargar los comercios en el motor cuando cambian (sumar uno al pipeline lo marca)
  useEffect(() => {
    const m = mapa.current
    if (!m || !listo) return
    ;(m.getSource(FUENTE) as unknown as FuenteLugares | undefined)?.setData(comoGeojson(lugares))
  }, [lugares, listo])

  // Resultados nuevos (con el mapa ya a la vista): un único movimiento corto para encuadrarlos en la parte visible
  useEffect(() => {
    const m = mapa.current
    if (!m || !listo || !busqueda || conGlobo) return
    const k = `${busqueda.id}:${aviso.version}`
    if (encuadrada.current === k) return
    encuadrada.current = k
    setTitulo({ principal: mayuscula(busqueda.rubro), lugar: busqueda.zona })
    setActivo(null)
    setGrupo(null)
    setListaAbierta(window.innerWidth >= 768)
    destino.current?.remove()
    destino.current = null
    requestAnimationFrame(() => {
      const pts = busqueda.lugares.filter((l) => l.lat != null && l.lng != null)
      const padding = margenes()
      medirRendimiento()
      if (pts.length === 0) {
        if (busqueda.centro) m.easeTo({ center: [busqueda.centro.lng, busqueda.centro.lat], zoom: 13.4, pitch: INCLINACION, padding, duration: 900, essential: true })
      } else if (pts.length === 1) {
        setActivo(busqueda.lugares.indexOf(pts[0]))
      } else {
        const b = new LngLatBounds()
        pts.forEach((l) => b.extend([l.lng!, l.lat!]))
        m.fitBounds(b, { padding, maxZoom: 16, pitch: INCLINACION, bearing: m.getBearing(), linear: true, duration: 900, essential: true })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, aviso.version, listo, conGlobo, margenes])

  // Avisos que no son una búsqueda: volar a un lugar ("llevame a…") o el aviso previo de una búsqueda
  useEffect(() => {
    const m = mapa.current
    if (!m || !listo || !aviso.centro) return
    const { lat, lng, zoom } = aviso.centro
    if (aviso.previo) {
      // Mientras busca la cámara no se mueve (el único movimiento es al llegar los resultados); si está lejos, salta
      setTitulo({ principal: aviso.titulo ?? 'Buscando…' })
      const c = m.getCenter()
      if (Math.abs(c.lat - lat) + Math.abs(c.lng - lng) > 0.2) m.jumpTo({ center: [lng, lat], zoom: 12.8, pitch: INCLINACION })
      return
    }
    setTitulo({ principal: aviso.titulo ?? '' })
    if (conGlobo) return // el mapa ya arrancó ahí
    m.easeTo({ center: [lng, lat], zoom: zoom ?? 15.5, pitch: INCLINACION, padding: margenes(), duration: 1400, essential: true })
    destino.current?.remove()
    const el = document.createElement('div')
    el.className = 'pin-destino'
    destino.current = new Marker({ element: el }).setLngLat([lng, lat]).addTo(m)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aviso.centro, aviso.titulo, aviso.previo, aviso.version, listo, margenes])

  // El elegido: la cámara se acerca a sus coordenadas (vista aérea, de cerca), retícula encima y su ficha abierta
  useEffect(() => {
    const m = mapa.current
    if (!m || !listo) return
    seleccion.current?.remove()
    seleccion.current = null
    sincronizarRef.current()
    const l = activo != null ? lugares[activo] : null
    if (activo == null || !l) return
    const raf = requestAnimationFrame(() => {
      if (l.lat == null || l.lng == null) return
      const el = document.createElement('div')
      el.className = cn('reticula-lugar', l.prospecto_id && 'en-pipeline')
      el.innerHTML = '<i class="aro"></i><i class="cruz"></i><i class="centro"></i><span class="nombre"></span>'
      ;(el.querySelector('.nombre') as HTMLElement).textContent = l.nombre
      seleccion.current = new Marker({ element: el }).setLngLat([l.lng, l.lat]).addTo(m)
      el.style.zIndex = '3' // por encima de un vecino en la misma esquina
      m.flyTo({ center: [l.lng, l.lat], zoom: 17.3, pitch: 62, padding: margenes(), duration: 1300, curve: 1.2, essential: true })
    })
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, listo, margenes])

  const elegidoEnPipeline = activo != null && !!lugares[activo]?.prospecto_id
  useEffect(() => {
    seleccion.current?.getElement().classList.toggle('en-pipeline', elegidoEnPipeline)
  }, [elegidoEnPipeline])

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && (activoRef.current != null ? setActivo(null) : onCerrar())
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onCerrar])

  const recentrar = () => {
    setActivo(null)
    setGrupo(null)
    if (!busqueda) setTitulo({ principal: CENTRO_BASE.titulo })
    mapa.current?.easeTo({ center: [CENTRO_BASE.lng, CENTRO_BASE.lat], zoom: CENTRO_BASE.zoom, pitch: INCLINACION, bearing: -15, padding: margenes(), duration: 1200, essential: true })
  }

  const sumar = async (i: number) => {
    const l = lugares[i]
    if (!l || sumando != null) return
    setSumando(i)
    setErrorSumar(null)
    try {
      const r = await sumarAlPipeline(i)
      const t = r.yaEstaba ? `${l.nombre} ya estaba en el pipeline: lo marqué.` : `Sumé ${l.nombre} al pipeline.`
      setMensaje(t)
      onDecir?.(t)
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

  // Lo que dice el globo: dónde busca (sale del título del aviso previo, "Buscando hamburgueserías…") o a dónde conecta
  const zonaBuscada = busqueda?.zona ?? aviso.zona ?? null
  const textoGlobo = zonaBuscada ? `Buscando en ${sinProvincia(zonaBuscada)}…` : 'Conectando con Tucumán…'
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
  const estadoEsfera: EstadoEsfera = escuchando ? 'escuchando' : pensando ? 'pensando' : hablando ? 'hablando' : 'reposo'
  const visibles = grupo ? lugares.map((l, i) => ({ l, i })).filter(({ i }) => grupo.includes(i)) : lugares.map((l, i) => ({ l, i }))
  const elegido = activo != null ? lugares[activo] : null

  return (
    <div className={cn('mapa-jarvis fixed inset-0 z-[75] overflow-hidden text-texto', busqueda && 'con-resultados')} role="dialog" aria-label="Mapa de Jarvis">
      {/* El mapa real: se prepara oculto mientras gira el globo y aparece con un fundido corto */}
      <div className={cn('absolute inset-0', conGlobo && 'mapa-real', saleGlobo && 'visible')}>
        <div ref={contenedor} className="size-full" />
      </div>

      {conGlobo && (
        <GloboApertura
          textura={texturaGlobo(clave)}
          destino={inicioDestino}
          texto={textoGlobo}
          salir={saleGlobo}
          onEnfocado={() => setEnfocado(true)}
          onTerminado={() => setConGlobo(false)}
        />
      )}

      {/* Arriba a la izquierda: JARVIS y qué/dónde (en dos líneas) */}
      <div ref={cabeceraRef} className="absolute top-4 left-4 max-w-[calc(100%-5.5rem)] md:top-6 md:left-6 md:max-w-[min(520px,calc(100%-30rem))]">
        <div className="flex items-center gap-2.5 font-mono text-[13px] font-semibold tracking-[0.35em] text-acento-claro">
          <span className="size-4 rounded-full border-2 border-acento-claro" /> JARVIS
        </div>
        {!conGlobo && (
          <div className={cn('mt-2 rounded-lg bg-fondo/70 px-3 py-2', elegido && 'max-md:hidden')}>
            <div className="truncate font-display text-base leading-tight font-bold md:text-xl">{titulo.principal || CENTRO_BASE.titulo}</div>
            {titulo.lugar && <div className="text-[13px] text-suave">en {titulo.lugar}</div>}
            {errorMapa && <p className="mt-1 text-xs text-peligro">{errorMapa}</p>}
            {!clave && !errorMapa && (
              <button onClick={onConfigurar} className="mt-1 hidden cursor-pointer text-left text-xs text-aviso hover:underline md:block">
                Sin imagen satelital: cargá la clave de MapTiler en Configurar.
              </button>
            )}
          </div>
        )}
      </div>

      {/* Arriba a la derecha: controles */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 md:top-6 md:right-6 md:flex-row">
        {[
          { icono: Crosshair, titulo: 'Volver a Tucumán', accion: recentrar, ver: !conGlobo },
          { icono: Settings, titulo: 'Configurar el mapa', accion: onConfigurar, ver: !conGlobo },
          { icono: X, titulo: 'Cerrar el mapa (Esc)', accion: onCerrar, ver: true },
        ]
          .filter((b) => b.ver)
          .map(({ icono: Icono, titulo: t, accion }) => (
            <button
              key={t}
              onClick={accion}
              title={t}
              aria-label={t}
              className="grid size-11 cursor-pointer place-items-center rounded-full border border-acento/40 bg-fondo/80 text-acento-claro hover:text-white"
            >
              <Icono className="size-5" />
            </button>
          ))}
      </div>

      {/* Ficha del elegido (compu: a la izquierda; en el celular va en el panel de abajo) */}
      {!conGlobo && elegido && activo != null && (
        <div ref={fichaRef} className="panel-vidrio absolute top-28 left-6 hidden max-h-[calc(100%-15rem)] w-[300px] overflow-y-auto p-4 md:block">
          <Ficha l={elegido} i={activo} sumando={sumando === activo} onSumar={() => sumar(activo)} />
        </div>
      )}

      {/* Resultados (compu: a la derecha; celular: abajo, plegable) o la agenda */}
      {!conGlobo && (
        <div
          ref={panelRef}
          className={cn(
            'panel-vidrio absolute inset-x-3 bottom-(--abajo) flex flex-col overflow-hidden md:inset-x-auto md:top-24 md:right-6 md:bottom-auto md:max-h-[calc(100%-15rem)] md:w-[330px]',
            listaAbierta ? (elegido ? 'max-h-[56svh]' : 'max-h-[46svh]') : 'max-h-[4.25rem]',
          )}
          style={{ '--abajo': `${altoBarra + 10}px` } as React.CSSProperties}
        >
          {busqueda ? (
            <>
              <button
                onClick={() => setListaAbierta((v) => !v)}
                className="relative shrink-0 cursor-pointer px-4 pt-3 pb-2 text-left md:cursor-default"
                aria-expanded={listaAbierta}
                aria-label={listaAbierta ? 'Plegar la lista' : 'Ver la lista de comercios'}
              >
                <span className="absolute top-3.5 right-3 text-acento-claro md:hidden">{listaAbierta ? <ChevronDown className="size-5" /> : <ChevronUp className="size-5" />}</span>
                <div className="flex items-baseline gap-2 pr-6">
                  <span className="font-display text-3xl font-bold">{lugares.length}</span>
                  <span className="text-[15px] text-suave">{lugares.length === 1 ? 'resultado' : 'resultados'}</span>
                </div>
                <div className="truncate text-xs text-tenue">
                  {busqueda.rubro} · {sinProvincia(busqueda.zona)}
                </div>
              </button>
              {/* En el celular, el elegido se ve acá (con vuelta a la lista) */}
              {elegido && activo != null && (
                <div className="min-h-0 flex-1 overflow-y-auto border-t border-acento/20 px-4 py-3 md:hidden">
                  <Ficha l={elegido} i={activo} sumando={sumando === activo} onSumar={() => sumar(activo)} onVolver={() => setActivo(null)} />
                </div>
              )}
              {grupo && (
                <div className="flex items-center justify-between gap-2 border-t border-acento/20 px-4 py-2 text-xs text-acento-claro">
                  <span>{grupo.length} comercios en el mismo punto</span>
                  <button onClick={() => setGrupo(null)} className="cursor-pointer font-semibold hover:underline">
                    Ver todos
                  </button>
                </div>
              )}
              <ul className={cn('flex-1 overflow-y-auto border-t border-acento/20 px-2 py-1', elegido && 'max-md:hidden')}>
                {visibles.map(({ l, i }) => (
                  <li key={`${l.nombre}-${i}`}>
                    <button
                      onClick={() => elegir(i, 'lista')}
                      aria-pressed={activo === i}
                      className={cn(
                        'my-1 flex w-full cursor-pointer items-center gap-3 rounded-xl border px-2.5 py-2 text-left',
                        activo === i ? 'border-acento-claro/70 bg-acento-tenue/70 shadow-[0_0_20px_-8px_var(--color-acento-claro)]' : 'border-transparent hover:bg-elevada/60',
                      )}
                    >
                      <span className={cn('rombo-numero shrink-0', l.prospecto_id && 'en-pipeline')}>{numero(i)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{l.nombre}</span>
                        <span className="flex items-center gap-1 text-xs text-suave">
                          {l.rating != null ? (
                            <>
                              <Star className="size-3 fill-current text-aviso" /> {l.rating.toFixed(1).replace('.', ',')}
                            </>
                          ) : (
                            <span className="truncate text-tenue">{l.direccion ?? 'Sin dirección'}</span>
                          )}
                          {l.prospecto_id && <span className="ml-1 text-ok">· En el pipeline</span>}
                          {l.lat == null && <span className="ml-1 text-tenue">· sin ubicación</span>}
                        </span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-tenue" />
                    </button>
                  </li>
                ))}
                {!lugares.length && (
                  <li className="px-3 py-5 text-center text-sm text-tenue">
                    No encontré {busqueda.rubro} en {sinProvincia(busqueda.zona)}. Probá con otra zona o pedile a Jarvis "buscá en internet".
                  </li>
                )}
              </ul>
            </>
          ) : (
            <>
              <div className="px-4 pt-3 pb-2">
                <div className="font-mono text-[10px] font-bold tracking-[0.25em] text-acento-claro uppercase">Hoy</div>
                <div className="mt-0.5 font-semibold">{agenda.length ? `${agenda.length} ${agenda.length === 1 ? 'cosa' : 'cosas'} en la agenda` : 'Agenda libre'}</div>
              </div>
              <ul className="flex-1 overflow-y-auto border-t border-acento/20 p-3 text-sm">
                {agenda.map((a, i) => (
                  <li key={i} className="flex gap-3 py-1.5">
                    <span className="tabular w-11 shrink-0 font-mono font-semibold text-acento-claro">{a.hora}</span>
                    <span className="min-w-0 flex-1 text-suave">{a.texto}</span>
                  </li>
                ))}
                <li className="pt-2 text-xs leading-relaxed text-tenue">Tocá la esfera y pedile: "buscame hamburgueserías en Yerba Buena".</li>
              </ul>
            </>
          )}
        </div>
      )}

      {/* Abajo, durante toda la búsqueda: lo que dice Jarvis y su esfera (se toca para hablar) */}
      <div ref={barraRef} className="absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-2 md:bottom-5">
        {!conGlobo && linea?.texto && (
          <p aria-live="polite" className={cn('max-w-[640px] rounded-lg bg-fondo/75 px-3 py-1.5 text-center text-sm leading-snug', linea.error ? 'text-peligro' : 'text-suave')}>
            <span className="line-clamp-2">{linea.texto}</span>
          </p>
        )}
        {teclado && !conGlobo && (
          <form onSubmit={mandar} className="flex w-full max-w-[520px] items-center gap-2">
            <input
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder='Ej.: "buscame hamburgueserías en Yerba Buena"'
              aria-label="Escribile a Jarvis"
              className="h-11 min-w-0 flex-1 rounded-[10px] border border-acento/40 bg-fondo/90 px-4 text-[15px] placeholder:text-tenue focus:border-acento focus:outline-none"
            />
            <button type="submit" disabled={pensando || !texto.trim()} aria-label="Mandar" className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border border-acento/50 bg-fondo/90 text-acento-claro disabled:opacity-40">
              <Send className="size-5" />
            </button>
          </form>
        )}
        <div className="relative flex items-center">
          <EsferaJarvis estado={estadoEsfera} onTocar={onMicrofono} deshabilitada={pensando} etiqueta={escuchando ? 'Terminar y mandar' : 'Hablar con Jarvis'} />
          {!conGlobo && (
            <button
              onClick={() => setTeclado((v) => !v)}
              aria-label={teclado ? 'Ocultar el teclado' : 'Escribir en vez de hablar'}
              aria-pressed={teclado}
              className="absolute left-full ml-3 grid size-10 cursor-pointer place-items-center rounded-full border border-acento/40 bg-fondo/80 text-acento-claro"
            >
              <Keyboard className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
