// Buscar negocios por zona ("buscame hamburgueserías en Yerba Buena") y mover el mapa de Jarvis.
// Fuentes: OpenStreetMap (Nominatim para ubicar la zona, Overpass para los locales con sus datos de
// contacto) y, del lado de Claude, la búsqueda web para completar lo que falte (completar_busqueda).
// Lo encontrado se guarda en jarvis_busquedas para dibujarlo en el mapa y sumarlo al pipeline.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

/** Centro por defecto del mapa: San Miguel de Tucumán (con Yerba Buena al oeste) */
export const CENTRO_BASE = { lat: -26.8241, lng: -65.2226, titulo: 'San Miguel de Tucumán' }
// Para que "Yerba Buena" o "el centro" se busquen primero en Tucumán
const VIEWBOX_TUCUMAN = '-65.75,-26.40,-64.80,-27.20'
const AGENTE = 'brixx-hub/1.0 (asistente interno)'
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
const MAX_LUGARES = 40

export interface Lugar {
  nombre: string
  lat: number | null
  lng: number | null
  direccion?: string | null
  telefono?: string | null
  web?: string | null
  instagram?: string | null
  horario?: string | null
  nota?: string | null
  fuente: 'google' | 'osm' | 'web'
  /** De Google Maps */
  rating?: number | null
  resenas?: number | null
  maps?: string | null
  osm?: string
  prospecto_id?: string | null
}

export interface Zona {
  lat: number
  lng: number
  /** [sur, oeste, norte, este] */
  bbox: [number, number, number, number]
  nombre: string
}

export type AvisoMapa = { busqueda_id?: string; centro?: { lat: number; lng: number; zoom?: number }; titulo?: string }

const comparable = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Zonas de Tucumán ya ubicadas: no dependen de Nominatim (que a veces no responde desde los servidores de Supabase).
 * [nombre para mostrar, nombres que la nombran, lat, lng, radio en grados]
 */
const ZONAS_TUCUMAN: [string, string[], number, number, number][] = [
  ['Yerba Buena', ['yerba buena', 'yb'], -26.8167, -65.3167, 0.04],
  ['Barrio Norte', ['barrio norte'], -26.815, -65.21, 0.012],
  ['Barrio Sur', ['barrio sur'], -26.842, -65.208, 0.012],
  ['Centro de San Miguel de Tucumán', ['centro', 'microcentro', 'plaza independencia'], -26.8306, -65.2038, 0.012],
  ['Tafí Viejo', ['tafi viejo'], -26.7322, -65.2592, 0.025],
  ['Banda del Río Salí', ['banda del rio sali', 'banda'], -26.84, -65.17, 0.025],
  ['Las Talitas', ['las talitas'], -26.77, -65.2, 0.02],
  ['Alderetes', ['alderetes'], -26.8166, -65.1333, 0.02],
  ['El Manantial', ['el manantial', 'manantial'], -26.85, -65.2833, 0.02],
  ['San Pablo', ['san pablo'], -26.873, -65.308, 0.015],
  ['Lules', ['lules'], -26.9244, -65.3375, 0.02],
  ['Tafí del Valle', ['tafi del valle'], -26.8525, -65.7097, 0.03],
  ['Famaillá', ['famailla'], -27.0544, -65.4017, 0.02],
  ['Monteros', ['monteros'], -27.1667, -65.5, 0.02],
  ['Concepción', ['concepcion'], -27.3433, -65.5928, 0.025],
  ['Aguilares', ['aguilares'], -27.4333, -65.6167, 0.02],
  ['San Miguel de Tucumán', ['san miguel de tucuman', 'san miguel', 'tucuman', 'la capital', 'capital'], -26.8241, -65.2226, 0.05],
]

const sinTildes = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

/** Una zona conocida de Tucumán por su nombre ("Yerba Buena", "el centro", "Tafí Viejo"). */
export function zonaConocida(texto: string): Zona | null {
  const t = ` ${sinTildes(texto).replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ')} `
  for (const [nombre, nombres, lat, lng, r] of ZONAS_TUCUMAN) {
    const n = nombres.find((x) => t.includes(` ${x} `))
    if (n) return { lat, lng, bbox: [lat - r, lng - r, lat + r, lng + r], nombre: /tucum/i.test(nombre) ? nombre : `${nombre}, Tucumán` }
  }
  return null
}

/** Ubica una zona o dirección con Nominatim (OpenStreetMap). Prioriza Tucumán. */
export async function ubicar(texto: string): Promise<Zona | null> {
  const q = texto.trim()
  if (!q) return null
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.search = new URLSearchParams({ q, format: 'jsonv2', countrycodes: 'ar', limit: '1', viewbox: VIEWBOX_TUCUMAN, 'accept-language': 'es' }).toString()
  const res = await fetch(url, { headers: { 'user-agent': AGENTE }, signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`No pude ubicar "${q}" (OpenStreetMap respondió ${res.status}).`)
  const [r] = (await res.json()) as { lat: string; lon: string; boundingbox: string[]; display_name: string }[]
  if (!r) return null
  const [s, n, o, e] = r.boundingbox.map(Number)
  return { lat: Number(r.lat), lng: Number(r.lon), bbox: [s, o, n, e], nombre: r.display_name.split(',').slice(0, 2).join(',').trim() }
}

/** Recorta o agranda el área: ni un punto ni media provincia. */
function area(z: Zona): [number, number, number, number] {
  let [s, o, n, e] = z.bbox
  const max = 0.16 // ~17 km
  const min = 0.025
  const ajustar = (a: number, b: number, c: number): [number, number] => {
    const lado = Math.min(max, Math.max(min, b - a))
    return [c - lado / 2, c + lado / 2]
  }
  ;[s, n] = ajustar(s, n, z.lat)
  ;[o, e] = ajustar(o, e, z.lng)
  return [s, o, n, e]
}

/** Arma la expresión regular de Overpass con las palabras del rubro (hamburgues|burger). */
export function patron(palabras: string[]): string {
  const limpias = palabras
    .map((p) => p.toLowerCase().replace(/[^a-záéíóúñü0-9 ]/g, '').trim())
    .filter((p) => p.length >= 3)
    .slice(0, 8)
  if (!limpias.length) throw new Error('Faltan palabras para buscar el rubro.')
  // Sin tildes también: OpenStreetMap a veces las tiene y a veces no
  const variantes = new Set<string>()
  for (const p of limpias) {
    variantes.add(p)
    variantes.add(p.normalize('NFD').replace(/[̀-ͯ]/g, ''))
  }
  return [...variantes].join('|')
}

/** Los locales del rubro dentro del área, con lo que OpenStreetMap tenga de contacto. */
export async function locales(palabras: string[], z: Zona): Promise<Lugar[]> {
  const kw = patron(palabras)
  const [s, o, n, e] = area(z)
  const caja = `(${s},${o},${n},${e})`
  const claves = ['name', 'cuisine', 'shop', 'amenity', 'craft', 'office', 'healthcare', 'leisure', 'tourism', 'brand']
  const consulta = `[out:json][timeout:20];(${claves.map((k) => `nwr["${k}"~"${kw}",i]${caja};`).join('')});out center tags ${MAX_LUGARES * 2};`
  let datos: { elements?: { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] } | null = null
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'user-agent': AGENTE, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: consulta }),
        signal: AbortSignal.timeout(12000),
      })
      if (res.ok) {
        datos = await res.json()
        break
      }
    } catch {
      // probamos con el otro servidor
    }
  }
  if (!datos) throw new Error('OpenStreetMap no respondió. Probá de nuevo en un rato.')
  const vistos = new Set<string>()
  const lista: Lugar[] = []
  for (const el of datos.elements ?? []) {
    const t = el.tags ?? {}
    if (!t.name) continue
    const clave = comparable(t.name)
    if (vistos.has(clave)) continue
    vistos.add(clave)
    const lat = el.lat ?? el.center?.lat ?? null
    const lng = el.lon ?? el.center?.lon ?? null
    const calle = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ')
    lista.push({
      nombre: t.name,
      lat,
      lng,
      direccion: [calle, t['addr:city'] ?? t['addr:suburb']].filter(Boolean).join(', ') || null,
      telefono: t.phone ?? t['contact:phone'] ?? t['contact:whatsapp'] ?? t.mobile ?? null,
      web: t.website ?? t['contact:website'] ?? null,
      instagram: t['contact:instagram'] ?? null,
      horario: t.opening_hours ?? null,
      fuente: 'osm',
      osm: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    })
    if (lista.length >= MAX_LUGARES) break
  }
  // Primero los que tienen más datos de contacto
  const puntos = (l: Lugar) => Number(!!l.telefono) + Number(!!l.web) + Number(!!l.instagram) + Number(!!l.direccion)
  return lista.sort((a, b) => puntos(b) - puntos(a))
}

/** Clave de Google Maps (Places API, secret GOOGLE_MAPS_API_KEY). Sin clave se usa OpenStreetMap. */
export const claveGoogle = () => (Deno.env.get('GOOGLE_MAPS_API_KEY') ?? '').trim() || null

const CAMPOS_GOOGLE = [
  'places.displayName',
  'places.formattedAddress',
  'places.shortFormattedAddress',
  'places.location',
  'places.nationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.googleMapsUri',
  'places.regularOpeningHours.weekdayDescriptions',
  'places.businessStatus',
  'nextPageToken',
].join(',')

type LugarGoogle = {
  displayName?: { text?: string }
  formattedAddress?: string
  shortFormattedAddress?: string
  location?: { latitude: number; longitude: number }
  nationalPhoneNumber?: string
  websiteUri?: string
  rating?: number
  userRatingCount?: number
  googleMapsUri?: string
  regularOpeningHours?: { weekdayDescriptions?: string[] }
  businessStatus?: string
}

/** Busca el rubro en Google Maps alrededor de la zona: hasta 3 páginas de 20 (cada página es una consulta paga). */
export async function buscarGoogle(rubro: string, z: Zona, clave: string, paginas = 3): Promise<Lugar[]> {
  const [s, o, n, e] = area(z)
  const radio = Math.round(Math.min(20000, Math.max(2500, (Math.max(n - s, e - o) / 2) * 111000)))
  const lista: Lugar[] = []
  let token: string | undefined
  for (let pagina = 0; pagina < paginas; pagina++) {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': clave, 'X-Goog-FieldMask': CAMPOS_GOOGLE },
      body: JSON.stringify({
        textQuery: `${rubro} en ${z.nombre}`,
        languageCode: 'es',
        regionCode: 'AR',
        pageSize: 20,
        locationBias: { circle: { center: { latitude: z.lat, longitude: z.lng }, radius: radio } },
        ...(token ? { pageToken: token } : {}),
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      const detalle = (await res.text().catch(() => '')).slice(0, 200)
      if (pagina > 0) break // con la primera página ya alcanza
      throw new Error(res.status === 403 ? `Google rechazó la clave (${detalle})` : `Google Maps respondió ${res.status}: ${detalle}`)
    }
    const datos = (await res.json()) as { places?: LugarGoogle[]; nextPageToken?: string }
    for (const p of datos.places ?? []) {
      if (!p.displayName?.text || p.businessStatus === 'CLOSED_PERMANENTLY') continue
      lista.push({
        nombre: p.displayName.text,
        lat: p.location?.latitude ?? null,
        lng: p.location?.longitude ?? null,
        direccion: p.shortFormattedAddress ?? p.formattedAddress ?? null,
        telefono: p.nationalPhoneNumber ?? null,
        web: p.websiteUri ?? null,
        // Google no da Instagram, pero muchos locales lo ponen como su web
        instagram: p.websiteUri && /instagram\.com/i.test(p.websiteUri) ? p.websiteUri : null,
        horario: p.regularOpeningHours?.weekdayDescriptions?.join(' · ') ?? null,
        rating: p.rating ?? null,
        resenas: p.userRatingCount ?? null,
        maps: p.googleMapsUri ?? null,
        nota: p.businessStatus === 'CLOSED_TEMPORARILY' ? 'Cerrado temporalmente' : null,
        fuente: 'google',
      })
    }
    token = datos.nextPageToken
    if (!token || lista.length >= MAX_LUGARES) break
  }
  const vistos = new Set<string>()
  const unicos = lista.filter((l) => {
    const k = comparable(l.nombre + (l.direccion ?? ''))
    if (vistos.has(k)) return false
    vistos.add(k)
    return true
  })
  // Primero los mejor puntuados con más reseñas
  const peso = (l: Lugar) => (l.rating ?? 3) * Math.log10((l.resenas ?? 0) + 10)
  return unicos.sort((a, b) => peso(b) - peso(a)).slice(0, MAX_LUGARES)
}

/** Resumen corto para Claude (los datos completos van al mapa). */
export function resumir(lugares: Lugar[], max = 15): string {
  if (!lugares.length) return 'Sin resultados en OpenStreetMap.'
  return lugares
    .slice(0, max)
    .map((l, i) => {
      const contacto = [l.rating && `★${l.rating} (${l.resenas ?? 0})`, l.telefono && `tel ${l.telefono}`, l.instagram && `IG ${l.instagram}`, l.web && `web ${l.web}`].filter(Boolean).join(' · ')
      return `${i + 1}. ${l.nombre}${l.direccion ? ` — ${l.direccion}` : ''}${contacto ? ` (${contacto})` : ' (sin contacto)'}`
    })
    .join('\n')
}

/** Lo que Jarvis hace con el mapa y las búsquedas (escribe con el cliente de servicio). */
export class Lugares {
  constructor(
    private db: SupabaseClient,
    private usuario: string,
    private avisar: (m: AvisoMapa) => void,
  ) {}

  async buscar(rubro: string, zonaTexto: string, palabras: string[]): Promise<string> {
    const zonaPedida = zonaTexto.trim() || CENTRO_BASE.titulo
    let zona = zonaConocida(zonaPedida)
    if (!zona) {
      try {
        zona = (await ubicar(/tucum/i.test(zonaPedida) ? zonaPedida : `${zonaPedida}, Tucumán`)) ?? (await ubicar(zonaPedida))
      } catch {
        zona = null
      }
    }
    if (!zona) return `No encontré la zona "${zonaPedida}" en el mapa. Preguntale al socio una referencia más clara (barrio y ciudad).`
    // El mapa vuela a la zona mientras busca (se ve el radar)
    this.avisar({ centro: { lat: zona.lat, lng: zona.lng, zoom: 13.5 }, titulo: `Escaneando ${rubro} · ${zona.nombre}` })
    let lugares: Lugar[] = []
    let fallaOsm = ''
    let fuente = 'OpenStreetMap'
    const google = claveGoogle()
    if (google) {
      try {
        lugares = await buscarGoogle(rubro, zona, google)
        fuente = 'Google Maps'
      } catch (e) {
        console.error('Google Places:', e)
      }
    }
    if (!lugares.length) {
      try {
        lugares = await locales(palabras.length ? palabras : [rubro], zona)
        fuente = 'OpenStreetMap'
      } catch (e) {
        fallaOsm = e instanceof Error ? e.message : String(e)
      }
    }
    const { data, error } = await this.db
      .from('jarvis_busquedas')
      .insert({ usuario: this.usuario, rubro: rubro.trim().slice(0, 120), zona: zona.nombre, centro: { lat: zona.lat, lng: zona.lng, bbox: zona.bbox }, lugares })
      .select('id')
      .single()
    if (error) throw new Error(`No pude guardar la búsqueda: ${error.message}`)
    this.avisar({ busqueda_id: data.id as string, titulo: `${rubro} · ${zona.nombre}` })
    const sinContacto = lugares.filter((l) => !l.telefono && !l.instagram && !l.web).length
    if (fallaOsm)
      return `El mapa ya está abierto en ${zona.nombre} (búsqueda id ${data.id}), pero OpenStreetMap no respondió (${fallaOsm}). Buscá ${rubro} en ${zona.nombre} con web_search (Google Maps, Instagram, guías de la zona) y cargalos con completar_busqueda (con dirección para que aparezcan en el mapa). Si no tenés web_search, decile al socio que lo pida como "buscá en internet ${rubro} en ${zona.nombre}".`
    if (fuente === 'Google Maps')
      return [
        `Búsqueda guardada (id ${data.id}) y marcada en el mapa: ${lugares.length} resultados de Google Maps en ${zona.nombre}, ordenados por puntaje y reseñas.`,
        resumir(lugares, 10),
        'Con esto alcanza: NO uses web_search salvo que el socio pida más datos (por ejemplo, Instagram). Contestá en dos o tres oraciones: cuántos encontraste y los dos o tres mejor puntuados.',
      ].join('\n')
    return [
      `Búsqueda guardada (id ${data.id}) y marcada en el mapa: ${lugares.length} resultados de OpenStreetMap en ${zona.nombre}.`,
      resumir(lugares),
      lugares.length < 5 || sinContacto > lugares.length / 2
        ? 'Hay pocos resultados o muchos sin contacto: si tenés web_search, buscá en la web (Google Maps, Instagram, sitios de la zona) y pasá lo que encuentres con completar_busqueda (nombre, dirección, teléfono, Instagram, web).'
        : 'Si tenés web_search y el socio quiere más datos de contacto, podés completar con completar_busqueda.',
    ].join('\n')
  }

  async completar(busquedaId: string, nuevos: Partial<Lugar>[]): Promise<string> {
    const { data, error } = await this.db.from('jarvis_busquedas').select('id, zona, lugares').eq('id', busquedaId).maybeSingle()
    if (error || !data) return 'No encontré esa búsqueda. Primero usá buscar_negocios.'
    const lugares = (data.lugares as Lugar[]) ?? []
    let sumados = 0
    let completados = 0
    let ubicados = 0
    for (const n of nuevos.slice(0, 20)) {
      if (!n.nombre?.trim()) continue
      const existente = lugares.find((l) => comparable(l.nombre) === comparable(n.nombre!))
      const datos = {
        direccion: n.direccion?.trim() || null,
        telefono: n.telefono?.trim() || null,
        web: n.web?.trim() || null,
        instagram: n.instagram?.trim() || null,
        nota: n.nota?.trim() || null,
      }
      if (existente) {
        // Solo completa lo que falta: lo de OpenStreetMap no se pisa
        for (const [k, v] of Object.entries(datos)) if (v && !existente[k as keyof typeof datos]) (existente as unknown as Record<string, unknown>)[k] = v
        completados++
        continue
      }
      let lat: number | null = null
      let lng: number | null = null
      if (datos.direccion && ubicados < 8) {
        // Nominatim pide como máximo un pedido por segundo
        if (ubicados > 0) await espera(1100)
        const z = await ubicar(`${datos.direccion}, ${data.zona}`).catch(() => null)
        ubicados++
        if (z) {
          lat = z.lat
          lng = z.lng
        }
      }
      lugares.push({ nombre: n.nombre.trim(), lat, lng, ...datos, fuente: 'web' })
      sumados++
    }
    const { error: e2 } = await this.db.from('jarvis_busquedas').update({ lugares: lugares.slice(0, MAX_LUGARES + 20) }).eq('id', busquedaId)
    if (e2) throw new Error(`No pude actualizar la búsqueda: ${e2.message}`)
    this.avisar({ busqueda_id: busquedaId })
    return `Listo: ${completados} lugares completados y ${sumados} nuevos (de la web) en la búsqueda; el mapa ya se actualizó. Contale al socio cuántos encontraste y los dos o tres más prometedores.`
  }

  async mostrar(lugar: string | undefined): Promise<string> {
    if (!lugar?.trim()) {
      this.avisar({ centro: { lat: CENTRO_BASE.lat, lng: CENTRO_BASE.lng, zoom: 13 }, titulo: CENTRO_BASE.titulo })
      return `Abrí el mapa sobre ${CENTRO_BASE.titulo}. Decilo en una oración.`
    }
    const z = (/\d/.test(lugar) ? null : zonaConocida(lugar)) ?? (await ubicar(/tucum/i.test(lugar) ? lugar : `${lugar}, Tucumán`).catch(() => null)) ?? (await ubicar(lugar).catch(() => null))
    if (!z) return `No encontré "${lugar}" en el mapa. Pedile una referencia más clara.`
    this.avisar({ centro: { lat: z.lat, lng: z.lng, zoom: 15.5 }, titulo: z.nombre })
    return `Listo: el mapa está volando a ${z.nombre}. Decilo en una oración.`
  }
}
