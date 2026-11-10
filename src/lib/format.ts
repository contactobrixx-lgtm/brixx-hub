import type { Etapa, EstadoFicha, Moneda } from '../types/db'

export const ETAPA_LABEL: Record<Etapa, string> = {
  contacto: 'Contacto',
  reunion: 'Reunión',
  demo: 'Demo',
  propuesta: 'Propuesta',
  cerrado: 'Cerrado',
  perdido: 'Perdido',
}

export const ESTADO_LABEL: Record<EstadoFicha, string> = {
  activo: 'Activo',
  en_desarrollo: 'En desarrollo',
  archivado: 'Archivado',
}

export function formatMonto(valor: number, moneda: Moneda): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: moneda,
    maximumFractionDigits: 0,
  }).format(valor)
}

export function formatFecha(iso: string): string {
  // Las fechas "date" vienen como YYYY-MM-DD: evitar el corrimiento por zona horaria.
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

export function hoyISO(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Convierte strings vacíos en null antes de guardar. */
export function vacioANull(v: string): string | null {
  const t = v.trim()
  return t === '' ? null : t
}

export function iniciales(texto: string): string {
  return texto
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

export function normalizarUrl(url: string): string {
  const t = url.trim()
  if (!t) return t
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}
