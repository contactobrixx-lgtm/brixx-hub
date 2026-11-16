import { esIntervencion, type EstadoGrabacion, type Grabacion, type OrigenGrabacion } from '../../types/db'

export const ESTADO_GRABACION: Record<EstadoGrabacion, { label: string; tono: 'neutro' | 'acento' | 'violeta' | 'ok' | 'peligro' }> = {
  pendiente: { label: 'Pendiente de transcribir', tono: 'neutro' },
  transcribiendo: { label: 'Transcribiendo…', tono: 'acento' },
  analizando: { label: 'Analizando…', tono: 'violeta' },
  lista: { label: 'Lista', tono: 'ok' },
  error: { label: 'Con error', tono: 'peligro' },
}

/** Una línea para listas: qué quiere (intervenciones y audios) o el resumen (reuniones). */
export function lineaDeAnalisis(a: Grabacion['analisis']): string | null {
  if (!a) return null
  if (esIntervencion(a)) return a.en_una_linea
  return a.lo_que_quiere || a.resumen || null
}

export const ORIGEN_GRABACION: Record<OrigenGrabacion, string> = {
  reunion: 'Reunión',
  audio: 'Audio',
  texto: 'Texto',
}
