import { aUSD, mesISO } from '../../lib/format'
import type { Cobro, Costo, Cotizacion } from '../../types/db'

/** Lo que cuesta un ítem de costo en un mes dado ("YYYY-MM"), en USD. null = ARS sin tipo de cambio. */
export function costoDelMes(c: Costo, mes: string, tc: number | null): number | null {
  const desde = c.desde.slice(0, 7)
  const hasta = c.hasta?.slice(0, 7)
  if (mes < desde || (hasta && mes > hasta)) return 0
  let monto = 0
  if (c.frecuencia === 'mensual') monto = Number(c.monto)
  else if (c.frecuencia === 'anual') monto = Number(c.monto) / 12
  else monto = mes === desde ? Number(c.monto) : 0
  return monto ? aUSD(monto, c.moneda, tc) : 0
}

/** Equivalente mensual en USD (para listar costos). */
export function costoMensualEquivalente(c: Costo, tc: number | null): number | null {
  const base = c.frecuencia === 'anual' ? Number(c.monto) / 12 : Number(c.monto)
  return aUSD(base, c.moneda, tc)
}

export function costoVigente(c: Costo, mes = mesISO(new Date())): boolean {
  return c.desde.slice(0, 7) <= mes && (!c.hasta || c.hasta.slice(0, 7) >= mes)
}

/** Totales de una cotización (en su moneda). El descuento aplica a la implementación. */
export function totalesCotizacion(c: Pick<Cotizacion, 'descuento_pct' | 'cotizacion_items'>) {
  let implementacion = 0
  let mensual = 0
  for (const it of c.cotizacion_items) {
    implementacion += Number(it.cantidad) * Number(it.precio_implementacion)
    mensual += Number(it.cantidad) * Number(it.precio_mensual)
  }
  const descuento = implementacion * (Number(c.descuento_pct) / 100)
  return { subtotal: implementacion, descuento, implementacion: implementacion - descuento, mensual }
}

/** Suma en USD, contando aparte lo que no se pudo convertir. */
export function sumarUSD(items: { monto: number; moneda: 'ARS' | 'USD' }[], tc: number | null) {
  let total = 0
  let sinConvertir = 0
  for (const i of items) {
    const v = aUSD(i.monto, i.moneda, tc)
    if (v == null) sinConvertir++
    else total += v
  }
  return { total, sinConvertir }
}

/** Lista de meses "YYYY-MM" desde hace (n-1) meses hasta el actual. */
export function ultimosMeses(n: number, hoy = new Date()): string[] {
  const meses: string[] = []
  for (let i = n - 1; i >= 0; i--) meses.push(mesISO(new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)))
  return meses
}

export function cobrosEnMeses(cobros: Cobro[], meses: string[]) {
  return cobros.filter((c) => meses.includes(c.fecha.slice(0, 7)))
}
