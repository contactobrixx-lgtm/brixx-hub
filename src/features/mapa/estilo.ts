// Estilo del mapa de Jarvis, armado en código con los colores de los tokens de index.css.
import type { StyleSpecification } from 'maplibre-gl'

const URL_OPENFREEMAP = 'https://tiles.openfreemap.org/planet'

/** Lee un color de los tokens de index.css (el mapa no entiende variables CSS). */
export function token(nombre: string, respaldo: string): string {
  if (typeof window === 'undefined') return respaldo
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--color-${nombre}`).trim()
  return v || respaldo
}

/** Estilo del mapa: con clave de MapTiler, satélite + relieve + edificios; sin clave, calles y edificios de OpenFreeMap. */
/** Cuánto se ve el fondo: normal o atenuado (con resultados, para que se distingan los comercios) */
export const INTENSIDAD = { normal: { satelite: 0.72, edificios: 0.55 }, atenuado: { satelite: 0.4, edificios: 0.3 } }

export function estiloMapa(clave: string | null): StyleSpecification {
  const acento = token('acento', '#2d61fe')
  const claro = token('acento-claro', '#c4cffe')
  const turquesa = token('turquesa', '#4fc9a6')
  const fondo = token('fondo', '#121316')
  const marino = token('acento-tenue', '#1a2547')
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
        // El "holograma": la foto en gris, semitransparente sobre azul marino. Lo hace el motor (no un filtro CSS sobre
        // todo el lienzo), así los puntos de los comercios conservan su color y no hay un filtro a pantalla completa
        { id: 'fondo', type: 'background', paint: { 'background-color': marino } },
        { id: 'satelite', type: 'raster', source: 'satelite', paint: { 'raster-saturation': -1, 'raster-contrast': 0.15, 'raster-brightness-max': 0.85, 'raster-opacity': 0.72 } },
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
