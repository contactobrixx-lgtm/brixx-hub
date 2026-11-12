import type { CategoriaCosto, ConceptoCobro, Etapa, EstadoCotizacion, EstadoFicha, FrecuenciaCosto, Moneda } from '../types/db'

export const ETAPA_LABEL: Record<Etapa, string> = {
  contacto: 'Contacto',
  reunion: 'Reunión',
  demo: 'Demo',
  propuesta: 'Propuesta',
  cerrado: 'Cerrado',
  implementacion: 'Implementación',
  mantenimiento: 'Mantenimiento',
  perdido: 'Perdido',
}

export const ESTADO_COTIZACION_LABEL: Record<EstadoCotizacion, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
}

export const CONCEPTO_LABEL: Record<ConceptoCobro, string> = {
  anticipo: 'Anticipo',
  saldo: 'Saldo del proyecto',
  abono: 'Abono mensual',
  extra: 'Trabajo extra',
}

export const CATEGORIA_COSTO_LABEL: Record<CategoriaCosto, string> = {
  apps: 'Apps y software',
  ia: 'API keys e IA',
  hosting: 'Hosting e infraestructura',
  dominios: 'Dominios',
  fees: 'Fees y comisiones',
  adquisicion: 'Adquisición de clientes',
}

export const FRECUENCIA_LABEL: Record<FrecuenciaCosto, string> = {
  mensual: 'Mensual',
  anual: 'Anual',
  unico: 'Pago único',
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

/** USD compacto para el dashboard: USD 1.250 */
export function formatUSD(valor: number): string {
  return `USD ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(valor))}`
}

/**
 * Convierte a USD. tipoCambio = cuántos ARS vale 1 USD.
 * Devuelve null si es ARS y no hay tipo de cambio cargado.
 */
export function aUSD(monto: number, moneda: Moneda, tipoCambio: number | null): number | null {
  if (moneda === 'USD') return Number(monto)
  return tipoCambio ? Number(monto) / tipoCambio : null
}

export const numeroCotizacion = (n: number) => `COT-${String(n).padStart(4, '0')}`

export function formatFecha(iso: string): string {
  // Las fechas "date" vienen como YYYY-MM-DD: evitar el corrimiento por zona horaria.
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

export function hoyISO(): string {
  return isoLocal(new Date())
}

/** Convierte strings vacíos en null antes de guardar. */
export function vacioANull(v: string): string | null {
  const t = v.trim()
  return t === '' ? null : t
}

export function iniciales(texto: string): string {
  return texto
    .split(/\s+/)
    .filter((p) => /^[\p{L}\p{N}]/u.test(p)) // ignora guiones y símbolos sueltos
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

export function normalizarUrl(url: string): string {
  const t = url.trim()
  if (!t) return t
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}

export function formatFechaLarga(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function formatHora(fecha: Date): string {
  return fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** YYYY-MM-DD de una fecha local. */
export function isoLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "2026-11" */
export const mesISO = (d: Date) => isoLocal(d).slice(0, 7)

export const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function parseNumero(texto: string): number | null {
  const t = texto.trim()
  if (!t) return null
  // Acepta "1.250,50" y "1250.50"
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const n = Number(normal)
  return Number.isNaN(n) ? null : n
}

/** 3725 → "1:02:05", 125 → "2:05" */
export function formatDuracion(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
