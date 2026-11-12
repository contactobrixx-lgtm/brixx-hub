import { useMemo } from 'react'
import { useAjustes, useCobros, useCostos } from '../finanzas/useFinanzas'
import { useCotizaciones, useServicios } from '../cotizador/useCotizador'
import { useProspectos } from '../pipeline/useProspectos'
import { useReuniones } from '../calendario/useReuniones'
import { costoDelMes, totalesCotizacion, ultimosMeses } from '../finanzas/calculos'
import { aUSD, hoyISO, mesISO } from '../../lib/format'
import { ETAPAS_ABIERTAS, ETAPAS_ACTIVAS, ETAPAS_GANADAS } from '../../types/db'
import { useMetas } from './useMetas'
import { progresoMeta, tasasEmbudo } from './metas'

export type Periodo = 'mes' | '6m' | 'anio'

export interface Pendiente {
  tono: 'peligro' | 'aviso' | 'info'
  titulo: string
  detalle: string
  ir: string
}

function mesesDelPeriodo(p: Periodo): string[] {
  const hoy = new Date()
  if (p === 'mes') return [mesISO(hoy)]
  if (p === '6m') return ultimosMeses(6)
  return ultimosMeses(hoy.getMonth() + 1)
}

export function useDashboard(periodo: Periodo) {
  const cobros = useCobros()
  const costos = useCostos()
  const { tipoCambio, tasas: tasasIniciales, guardarTasas } = useAjustes()
  const metas = useMetas()
  const cot = useCotizaciones()
  const servicios = useServicios()
  const { prospectos, cargando: cargandoP } = useProspectos()
  const reuniones = useReuniones()

  const cargando = cobros.cargando || costos.cargando || cot.cargando || cargandoP || reuniones.cargando || metas.cargando

  const datos = useMemo(() => {
    const tc = tipoCambio
    const usd = (monto: number, moneda: 'ARS' | 'USD') => aUSD(monto, moneda, tc) ?? 0
    const meses = mesesDelPeriodo(periodo)
    const enPeriodo = cobros.filas.filter((c) => meses.includes(c.fecha.slice(0, 7)))

    const cobradoProyectos = enPeriodo.filter((c) => c.concepto !== 'abono').reduce((s, c) => s + usd(c.monto, c.moneda), 0)
    const cobradoAbonos = enPeriodo.filter((c) => c.concepto === 'abono').reduce((s, c) => s + usd(c.monto, c.moneda), 0)
    const cobrado = cobradoProyectos + cobradoAbonos

    const costoEn = (filtro: (cat: string) => boolean) =>
      meses.reduce(
        (s, m) => s + costos.filas.filter((c) => filtro(c.categoria)).reduce((t, c) => t + (costoDelMes(c, m, tc) ?? 0), 0),
        0,
      )
    const costoOperacion = costoEn((c) => c !== 'adquisicion')
    const costoAdquisicion = costoEn((c) => c === 'adquisicion')
    const costoTotal = costoOperacion + costoAdquisicion
    const margen = cobrado - costoTotal

    // Gráfico: al menos 6 meses
    const mesesGrafico = meses.length >= 6 ? meses : ultimosMeses(6)
    const grafico = mesesGrafico.map((m) => ({
      mes: m,
      cobrado: cobros.filas.filter((c) => c.fecha.startsWith(m)).reduce((s, c) => s + usd(c.monto, c.moneda), 0),
      costo: costos.filas.reduce((s, c) => s + (costoDelMes(c, m, tc) ?? 0), 0),
    }))

    // Clientes
    const activos = prospectos.filter((p) => ETAPAS_ACTIVAS.includes(p.etapa))
    const enImplementacion = activos.filter((p) => p.etapa === 'implementacion').length
    const enMantenimiento = activos.filter((p) => p.etapa === 'mantenimiento').length
    const aceptadas = cot.filas.filter((q) => q.estado === 'aceptada')
    const idsActivos = new Set(activos.map((p) => p.id))
    const mrr = aceptadas
      .filter((q) => q.prospecto_id && idsActivos.has(q.prospecto_id))
      .reduce((s, q) => s + usd(totalesCotizacion(q).mensual, q.moneda), 0)

    // Por cobrar: implementación aceptada − cobros de proyecto, por cliente
    const porCobrarCliente = new Map<string, number>()
    for (const q of aceptadas) {
      if (!q.prospecto_id) continue
      porCobrarCliente.set(q.prospecto_id, (porCobrarCliente.get(q.prospecto_id) ?? 0) + usd(totalesCotizacion(q).implementacion, q.moneda))
    }
    for (const c of cobros.filas) {
      if (c.concepto === 'abono' || !c.prospecto_id || !porCobrarCliente.has(c.prospecto_id)) continue
      porCobrarCliente.set(c.prospecto_id, porCobrarCliente.get(c.prospecto_id)! - usd(c.monto, c.moneda))
    }
    const saldos = [...porCobrarCliente.entries()].filter(([, v]) => v > 0.5)
    const porCobrar = saldos.reduce((s, [, v]) => s + v, 0)

    // Pipeline
    const abiertos = prospectos.filter((p) => ETAPAS_ABIERTAS.includes(p.etapa))
    const valorPipeline = abiertos.reduce((s, p) => s + (p.valor_estimado != null ? usd(p.valor_estimado, p.moneda) : 0), 0)
    const ganados = prospectos.filter((p) => ETAPAS_GANADAS.includes(p.etapa)).length
    const perdidos = prospectos.filter((p) => p.etapa === 'perdido').length
    const tasaCierre = ganados + perdidos ? Math.round((ganados / (ganados + perdidos)) * 100) : null

    const roas = costoAdquisicion > 0 ? cobrado / costoAdquisicion : null
    const retorno = costoTotal > 0 ? cobrado / costoTotal : null

    // Pendientes
    const hoy = hoyISO()
    const pendientes: Pendiente[] = []
    const porId = new Map(prospectos.map((p) => [p.id, p]))
    const vencidas = prospectos.filter((p) => p.etapa !== 'perdido' && p.fecha_proxima_accion && p.fecha_proxima_accion < hoy)
    for (const p of vencidas.slice(0, 4)) {
      pendientes.push({ tono: 'peligro', titulo: `${p.empresa || p.nombre}: ${p.proxima_accion || 'acción vencida'}`, detalle: 'Próxima acción vencida', ir: '/pipeline' })
    }
    const haceUnaSemana = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)
    for (const q of cot.filas.filter((q) => q.estado === 'enviada' && (q.fecha <= haceUnaSemana || (q.valida_hasta && q.valida_hasta < hoy)))) {
      const p = q.prospecto_id ? porId.get(q.prospecto_id) : undefined
      pendientes.push({
        tono: 'aviso',
        titulo: `Cotización sin respuesta: ${p ? p.empresa || p.nombre : 'sin cliente'}`,
        detalle: q.valida_hasta && q.valida_hasta < hoy ? 'Ya venció: hacé seguimiento o actualizala' : 'Enviada hace más de una semana',
        ir: '/cotizador',
      })
    }
    for (const [id, v] of saldos.slice(0, 4)) {
      const p = porId.get(id)
      pendientes.push({ tono: 'aviso', titulo: `${p ? p.empresa || p.nombre : 'Cliente'} debe USD ${Math.round(v)}`, detalle: 'Saldo de implementación sin cobrar', ir: '/finanzas' })
    }
    // Abonos del mes: cada cliente en mantenimiento con abono aceptado espera un cobro "abono" este mes
    const mesActual = mesISO(new Date())
    const nombreMesActual = new Date().toLocaleDateString('es-AR', { month: 'long' })
    for (const p of prospectos.filter((x) => x.etapa === 'mantenimiento')) {
      const abonos = aceptadas.filter((q) => q.prospecto_id === p.id).map((q) => ({ q, mensual: totalesCotizacion(q).mensual })).filter((a) => a.mensual > 0)
      if (!abonos.length) continue
      const yaCobrado = cobros.filas.some((c) => c.prospecto_id === p.id && c.concepto === 'abono' && c.fecha.startsWith(mesActual))
      if (yaCobrado) continue
      const monto = abonos.reduce((t, a) => t + a.mensual, 0)
      const moneda = abonos[0].q.moneda
      const q = new URLSearchParams({ registrar: 'abono', prospecto: p.id, monto: String(monto), moneda })
      pendientes.push({
        tono: 'aviso',
        titulo: `${p.empresa || p.nombre}: abono de ${nombreMesActual} sin cobrar`,
        detalle: `${moneda} ${monto}/mes · tocá para registrarlo`,
        ir: `/finanzas?${q}`,
      })
    }

    const sinPrecio = servicios.filas.filter((s) => s.activo && !Number(s.precio_implementacion) && !Number(s.precio_mensual)).length
    if (sinPrecio) pendientes.push({ tono: 'info', titulo: 'Cargá tus precios', detalle: `${sinPrecio} ${sinPrecio === 1 ? 'servicio sin precio' : 'servicios sin precio'}`, ir: '/cotizador?vista=servicios' })
    const hayArs = [...cobros.filas, ...costos.filas].some((x) => x.moneda === 'ARS')
    if (hayArs && !tc) pendientes.push({ tono: 'aviso', titulo: 'Falta el tipo de cambio', detalle: 'Los montos en pesos no se suman en dólares', ir: '/finanzas' })
    if (!costos.filas.length) pendientes.push({ tono: 'info', titulo: 'Cargá los costos del estudio', detalle: 'Apps, hosting, IA: con eso se calcula el margen', ir: '/finanzas?vista=costos' })
    else if (!costos.filas.some((c) => c.categoria === 'adquisicion'))
      pendientes.push({ tono: 'info', titulo: 'Cargá tus costos de adquisición', detalle: 'Publicidad, prospección: con eso se calcula el ROAS', ir: '/finanzas?vista=costos' })

    // Próximas reuniones
    const ahora = Date.now()
    const proximas = reuniones.filas.filter((r) => new Date(r.inicio).getTime() + r.duracion_min * 60000 >= ahora).slice(0, 5)

    const conAbono = aceptadas.map((q) => usd(totalesCotizacion(q).mensual, q.moneda)).filter((v) => v > 0)
    const datosMetas = {
      prospectos,
      reuniones: reuniones.filas,
      cotizaciones: cot.filas,
      metas: metas.filas,
      ingresoRecurrente: mrr,
      abonoPromedio: conAbono.length ? conAbono.reduce((a, b) => a + b, 0) / conAbono.length : 50,
      tasas: tasasEmbudo(cot.filas, reuniones.filas, { reunionPropuesta: tasasIniciales.reunionPropuesta, propuestaCierre: tasasIniciales.propuestaCierre }),
    }

    return {
      metasMes: progresoMeta('mes', datosMetas),
      metasTrimestre: progresoMeta('trimestre', datosMetas),
      cobrado,
      cobradoProyectos,
      cobradoAbonos,
      costoOperacion,
      costoAdquisicion,
      costoTotal,
      margen,
      grafico,
      activos: activos.length,
      enImplementacion,
      enMantenimiento,
      mrr,
      porCobrar,
      abiertos: abiertos.length,
      valorPipeline,
      tasaCierre,
      roas,
      retorno,
      pendientes,
      proximas,
      appsActivas: costos.filas.filter((c) => c.categoria !== 'adquisicion' && costoDelMes(c, mesISO(new Date()), tc) !== 0).length,
    }
  }, [periodo, cobros.filas, costos.filas, tipoCambio, cot.filas, servicios.filas, prospectos, reuniones.filas, metas.filas, tasasIniciales.reunionPropuesta, tasasIniciales.propuestaCierre])

  return { ...datos, prospectos, cargando, metas, tasasIniciales, guardarTasas }
}
