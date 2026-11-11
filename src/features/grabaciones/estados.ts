import type { EstadoGrabacion } from '../../types/db'

export const ESTADO_GRABACION: Record<EstadoGrabacion, { label: string; tono: 'neutro' | 'acento' | 'violeta' | 'ok' | 'peligro' }> = {
  pendiente: { label: 'Pendiente de transcribir', tono: 'neutro' },
  transcribiendo: { label: 'Transcribiendo…', tono: 'acento' },
  analizando: { label: 'Analizando…', tono: 'violeta' },
  lista: { label: 'Lista', tono: 'ok' },
  error: { label: 'Con error', tono: 'peligro' },
}
