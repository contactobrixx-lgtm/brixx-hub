// Línea de tiempo del video: cuándo empieza y termina cada escena, cuándo suena su voz y cuándo se dice
// cada palabra (para los subtítulos). Sale de los audios de ElevenLabs (o de la estimación sin voz).
import type { AudioEscenaVideo, GuionVideo } from '../../types/db'

const INICIO = 0.5 // silencio antes de la primera palabra
const PAUSA = 0.45 // entre escena y escena
const FINAL = 1.4 // el cierre queda un rato en pantalla

export interface TramoEscena {
  /** Desde cuándo se ve la escena (segundos) */
  inicio: number
  /** Cuándo arranca su voz */
  audio: number
  /** Hasta cuándo se ve */
  fin: number
}
export interface PalabraVideo {
  w: string
  s: number
  e: number
  escena: number
}
export interface Linea {
  escenas: TramoEscena[]
  palabras: PalabraVideo[]
  total: number
}

/** Tiempo mínimo en pantalla por escena, para que se lea lo que aparece aunque la voz sea corta */
function minimo(e: GuionVideo['escenas'][number]): number {
  if (e.tipo === 'chat') return 1.2 + e.mensajes.length * 1.5
  if (e.tipo === 'agenda') return 2 + (e.cambios?.length ?? 0) * 2
  if (e.tipo === 'beneficios' || e.tipo === 'panel' || e.tipo === 'flujo') return 1.5 + e.items.length * 0.9
  return 3
}

export function armarLinea(guion: GuionVideo, audios: AudioEscenaVideo[]): Linea {
  const escenas: TramoEscena[] = []
  const palabras: PalabraVideo[] = []
  let t = INICIO
  guion.escenas.forEach((e, i) => {
    const a = audios.find((x) => x.escena === i)
    const dur = a?.duracion ?? e.narracion.length * 0.066
    for (const p of a?.palabras ?? []) palabras.push({ w: p.w, s: t + p.s, e: t + p.e, escena: i })
    const visible = Math.max(dur, minimo(e))
    escenas.push({ inicio: i === 0 ? 0 : t - 0.2, audio: t, fin: t + visible })
    t += visible + PAUSA
  })
  const total = (escenas.at(-1)?.fin ?? 0) + FINAL
  if (escenas.length) escenas[escenas.length - 1].fin = total
  return { escenas, palabras, total }
}

/** La escena que se ve en el segundo t */
export function escenaEn(linea: Linea, t: number): number {
  for (let i = linea.escenas.length - 1; i >= 0; i--) if (t >= linea.escenas[i].inicio) return i
  return 0
}
