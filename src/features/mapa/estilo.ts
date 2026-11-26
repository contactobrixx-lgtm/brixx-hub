// Estilo del mapa de Jarvis, armado en código con los colores de los tokens de index.css.
// Tono de la referencia: azul noche, con el detalle de la foto, las calles y el relieve. Lo hace el motor (paint
// properties), no un filtro CSS sobre el lienzo: es más liviano y los marcadores conservan su color.
import type { StyleSpecification } from 'maplibre-gl'

const URL_OPENFREEMAP = 'https://tiles.openfreemap.org/planet'

/** Lee un color de los tokens de index.css (el mapa no entiende variables CSS). */
export function token(nombre: string, respaldo: string): string {
  if (typeof window === 'undefined') return respaldo
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--color-${nombre}`).trim()
  return v || respaldo
}

/** Cuánto se ve el fondo: normal o atenuado (con resultados, para que se distingan los comercios) */
export const INTENSIDAD = { normal: { satelite: 0.92, edificios: 0.6 }, atenuado: { satelite: 0.7, edificios: 0.45 } }

/** Capas que se prenden o apagan según el equipo y la zona (ver `modoRendimiento` en MapaJarvis) */
export const CAPA_EDIFICIOS_3D = 'edificios'
export const CAPA_EDIFICIOS_PLANO = 'edificios-plano'

/** Estilo del mapa: con clave de MapTiler, satélite + relieve + edificios; sin clave, calles y edificios de OpenFreeMap. */
export function estiloMapa(clave: string | null): StyleSpecification {
  const acento = token('acento', '#2d61fe')
  const claro = token('acento-claro', '#c4cffe')
  const turquesa = token('turquesa', '#4fc9a6')
  const fondo = token('fondo', '#121316')
  const marino = token('acento-tenue', '#1a2547')
  const altura = ['coalesce', ['get', 'render_height'], ['get', 'height'], 8] as never
  // Edificios en 3D: arrancan apagados y se prenden solo si hay cobertura en la zona y el equipo lo banca
  const edificios3d = {
    id: CAPA_EDIFICIOS_3D,
    type: 'fill-extrusion' as const,
    source: 'calles',
    'source-layer': 'building',
    minzoom: 14,
    layout: { visibility: 'none' },
    paint: {
      'fill-extrusion-color': ['interpolate', ['linear'], altura, 0, acento, 40, claro] as never,
      'fill-extrusion-height': altura,
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0] as never,
      'fill-extrusion-opacity': INTENSIDAD.normal.edificios,
    },
  }
  // Edificios planos (siempre): la huella de cada edificio, liviana
  const edificiosPlano = {
    id: CAPA_EDIFICIOS_PLANO,
    type: 'fill' as const,
    source: 'calles',
    'source-layer': 'building',
    minzoom: 14,
    paint: { 'fill-color': claro, 'fill-opacity': clave ? 0.12 : 0.22, 'fill-outline-color': acento },
  }
  const avenidas = {
    id: 'calles-luz',
    type: 'line' as const,
    source: 'calles',
    'source-layer': 'transportation',
    filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]] as never,
    paint: {
      'line-color': turquesa,
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 16, 2.2] as never,
      'line-opacity': clave ? 0.45 : 0.85,
      'line-blur': 0.5,
    },
  }
  const callesTodas = {
    id: 'calles-todas',
    type: 'line' as const,
    source: 'calles',
    'source-layer': 'transportation',
    minzoom: 13,
    paint: { 'line-color': claro, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.2, 17, 1] as never, 'line-opacity': clave ? 0.18 : 0.35 },
  }
  if (clave) {
    const k = encodeURIComponent(clave)
    return {
      version: 8,
      sources: {
        satelite: { type: 'raster', url: `https://api.maptiler.com/tiles/satellite-v2/tiles.json?key=${k}`, tileSize: 512 },
        // Dos fuentes del mismo relieve: una para el terreno 3D (si se prende) y otra para el sombreado (siempre, liviano)
        relieve: { type: 'raster-dem', url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${k}`, tileSize: 256 },
        sombra: { type: 'raster-dem', url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${k}`, tileSize: 256 },
        calles: { type: 'vector', url: `https://api.maptiler.com/tiles/v3/tiles.json?key=${k}` },
      },
      layers: [
        { id: 'fondo', type: 'background', paint: { 'background-color': marino } },
        // Azul noche: los verdes giran a turquesa/azul, menos saturado y más oscuro, sin perder el detalle
        {
          id: 'satelite',
          type: 'raster',
          source: 'satelite',
          paint: { 'raster-hue-rotate': 55, 'raster-saturation': -0.35, 'raster-contrast': 0.2, 'raster-brightness-max': 0.72, 'raster-opacity': INTENSIDAD.normal.satelite },
        },
        // Sombra del relieve (cerro San Javier): marca las laderas en azul sin terreno 3D
        {
          id: 'relieve-sombra',
          type: 'hillshade',
          source: 'sombra',
          paint: { 'hillshade-shadow-color': fondo, 'hillshade-highlight-color': claro, 'hillshade-accent-color': marino, 'hillshade-exaggeration': 0.35 },
        },
        callesTodas,
        avenidas,
        edificiosPlano,
        edificios3d,
      ],
    } as unknown as StyleSpecification
  }
  return {
    version: 8,
    sources: { calles: { type: 'vector', url: URL_OPENFREEMAP } },
    layers: [
      { id: 'fondo', type: 'background', paint: { 'background-color': fondo } },
      { id: 'tierra', type: 'fill', source: 'calles', 'source-layer': 'landcover', paint: { 'fill-color': acento, 'fill-opacity': 0.12 } },
      { id: 'agua', type: 'fill', source: 'calles', 'source-layer': 'water', paint: { 'fill-color': acento, 'fill-opacity': 0.45 } },
      callesTodas,
      avenidas,
      edificiosPlano,
      edificios3d,
    ],
  } as unknown as StyleSpecification
}

/** Textura liviana para el globo de apertura: una sola tesela satelital del mundo (con clave de MapTiler). */
export function texturaGlobo(clave: string | null): string | null {
  return clave ? `https://api.maptiler.com/tiles/satellite-v2/0/0/0.jpg?key=${encodeURIComponent(clave)}` : null
}
