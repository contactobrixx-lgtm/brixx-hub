// Cálculo de metas: avance, cuenta regresiva, ritmo y "embudo al revés".
// Funciones puras (sin React ni Supabase) para poder probarlas.
import { ETAPAS_GANADAS, type Cotizacion, type Meta, type Prospecto, type Reunion, type TipoMeta } from '../../types/db'
import { MESES, isoLocal } from '../../lib/format'

export type EstadoMeta = 'cumplida' | 'en_camino' | 'justo' | 'atrasado' | 'empezando' | 'sin_meta'

export interface Periodo {
  tipo: TipoMeta
  inicio: Date
  fin: Date // último día, inclusive
  iso: string // primer día YYYY-MM-DD (clave de la meta)
  etiqueta: string
}

const DIA = 864e5
const inicioDelDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

export function periodoDe(tipo: TipoMeta, fecha = new Date()): Periodo {
  const y = fecha.getFullYear()
  const m0 = tipo === 'mes' ? fecha.getMonth() : Math.floor(fecha.getMonth() / 3) * 3
  const inicio = new Date(y, m0, 1)
  const fin = new Date(y, m0 + (tipo === 'mes' ? 1 : 3), 0)
  const etiqueta =
    tipo === 'mes'
      ? `${MESES[m0].replace(/^./, (c) => c.toUpperCase())} ${y}`
      : `${m0 / 3 + 1}.º trimestre ${y} (${MESES[m0].slice(0, 3)}–${MESES[m0 + 2].slice(0, 3)})`
  return { tipo, inicio, fin, iso: isoLocal(inicio), etiqueta }
}

/** El período siguiente (para cargar metas a futuro). */
export function periodoSiguiente(p: Periodo): Periodo {
  const d = new Date(p.fin)
  d.setDate(d.getDate() + 1)
  return periodoDe(p.tipo, d)
}

export interface Tasas {
  reunionPropuesta: number
  propuestaCierre: number
  reales: boolean // true = calculadas con datos propios
}

/** Tasas del embudo: las reales si hay al menos 5 casos, si no las iniciales de Ajustes. */
export function tasasEmbudo(
  cotizaciones: Cotizacion[],
  reuniones: Reunion[],
  iniciales: { reunionPropuesta: number; propuestaCierre: number },
): Tasas {
  const decididas = cotizaciones.filter((c) => c.estado === 'aceptada' || c.estado === 'rechazada')
  const conReunion = new Set(reuniones.map((r) => r.prospecto_id).filter((x): x is string => !!x))
  const conPropuesta = new Set(
    cotizaciones.filter((c) => c.estado !== 'borrador' && c.prospecto_id).map((c) => c.prospecto_id!),
  )
  const realCierre = decididas.length >= 5
  const realReunion = conReunion.size >= 5
  const acotar = (x: number) => Math.min(1, Math.max(0.05, x))
  return {
    propuestaCierre: realCierre
      ? acotar(decididas.filter((c) => c.estado === 'aceptada').length / decididas.length)
      : iniciales.propuestaCierre,
    reunionPropuesta: realReunion
      ? acotar([...conReunion].filter((id) => conPropuesta.has(id)).length / conReunion.size)
      : iniciales.reunionPropuesta,
    reales: realCierre && realReunion,
  }
}

export interface ProgresoMeta {
  periodo: Periodo
  meta: Meta | undefined
  diasRestantes: number // incluye hoy
  avanceTiempo: number // 0..1
  clientes: {
    actual: number
    nombres: string[]
    objetivo: number | null
    proyeccion: number
    estado: EstadoMeta
  }
  ingreso: {
    actual: number
    objetivo: number | null
    faltante: number
    clientesEquivalentes: number // cuántos abonos promedio faltan
    estado: EstadoMeta
  }
  plan: {
    faltanClientes: number
    propuestas: number
    reuniones: number
    semanas: number
    porSemana: { propuestas: number; reuniones: number }
    estaSemana: { propuestas: number; reuniones: number }
    tasas: Tasas
  }
}

interface Datos {
  prospectos: Prospecto[]
  reuniones: Reunion[]
  cotizaciones: Cotizacion[]
  metas: Meta[]
  ingresoRecurrente: number // USD/mes actual
  abonoPromedio: number // USD/mes
  tasas: Tasas
}

/** Lunes de la semana de `d`. */
function lunes(d: Date) {
  const x = inicioDelDia(d)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

export function progresoMeta(tipo: TipoMeta, datos: Datos, hoy = new Date()): ProgresoMeta {
  const periodo = periodoDe(tipo, hoy)
  const meta = datos.metas.find((m) => m.tipo === tipo && m.periodo.slice(0, 10) === periodo.iso)
  const h = inicioDelDia(hoy)
  const diasTotales = Math.round((periodo.fin.getTime() - periodo.inicio.getTime()) / DIA) + 1
  const diasRestantes = Math.round((periodo.fin.getTime() - h.getTime()) / DIA) + 1
  const transcurridos = Math.max(1, diasTotales - diasRestantes + 1)
  const avanceTiempo = Math.min(1, transcurridos / diasTotales)

  // --- Clientes nuevos del período
  const desde = periodo.iso
  const hasta = isoLocal(periodo.fin)
  const nuevos = datos.prospectos.filter(
    (p) => ETAPAS_GANADAS.includes(p.etapa) && p.fecha_cierre && p.fecha_cierre >= desde && p.fecha_cierre <= hasta,
  )
  const actual = nuevos.length
  const objetivoC = meta?.clientes_nuevos ?? null
  const proyeccion = actual + (actual / transcurridos) * Math.max(0, diasRestantes - 1)
  const estadoClientes = (): EstadoMeta => {
    if (objetivoC == null) return 'sin_meta'
    if (actual >= objetivoC) return 'cumplida'
    if (actual === 0 && avanceTiempo < 1 / 3) return 'empezando'
    if (proyeccion >= objetivoC) return 'en_camino'
    if (proyeccion >= objetivoC * 0.7) return 'justo'
    return 'atrasado'
  }

  // --- Ingreso recurrente (foto de hoy contra la meta al cierre)
  const objetivoI = meta?.ingreso_recurrente != null ? Number(meta.ingreso_recurrente) : null
  const faltante = objetivoI != null ? Math.max(0, objetivoI - datos.ingresoRecurrente) : 0
  const estadoIngreso = (): EstadoMeta => {
    if (objetivoI == null) return 'sin_meta'
    if (datos.ingresoRecurrente >= objetivoI) return 'cumplida'
    const fraccion = objetivoI ? datos.ingresoRecurrente / objetivoI : 0
    if (fraccion >= avanceTiempo) return 'en_camino'
    if (avanceTiempo < 1 / 3) return 'empezando'
    return fraccion >= avanceTiempo * 0.7 ? 'justo' : 'atrasado'
  }

  // --- Embudo al revés
  const t = datos.tasas
  const faltanClientes = objetivoC != null ? Math.max(0, objetivoC - actual) : 0
  // Redondeo a 1 decimal antes de subir: con 0,33 → 1 cliente = 3 propuestas (no 4)
  const arriba = (x: number) => Math.ceil(Number(x.toFixed(1)))
  const propuestas = arriba(faltanClientes / t.propuestaCierre)
  const reuniones = arriba(propuestas / t.reunionPropuesta)
  const semanas = Math.max(1, Math.ceil(diasRestantes / 7))
  const ini = lunes(hoy)
  const fin = new Date(ini.getTime() + 7 * DIA)
  const iniISO = isoLocal(ini)
  const finISO = isoLocal(fin)

  return {
    periodo,
    meta,
    diasRestantes,
    avanceTiempo,
    clientes: {
      actual,
      nombres: nuevos.map((p) => p.empresa || p.nombre),
      objetivo: objetivoC,
      proyeccion,
      estado: estadoClientes(),
    },
    ingreso: {
      actual: datos.ingresoRecurrente,
      objetivo: objetivoI,
      faltante,
      clientesEquivalentes: faltante > 0 ? Math.ceil(faltante / Math.max(1, datos.abonoPromedio)) : 0,
      estado: estadoIngreso(),
    },
    plan: {
      faltanClientes,
      propuestas,
      reuniones,
      semanas,
      porSemana: { propuestas: Math.ceil(propuestas / semanas), reuniones: Math.ceil(reuniones / semanas) },
      estaSemana: {
        reuniones: datos.reuniones.filter((r) => {
          const d = new Date(r.inicio)
          return d >= ini && d < fin
        }).length,
        propuestas: datos.cotizaciones.filter((c) => c.estado !== 'borrador' && c.fecha >= iniISO && c.fecha < finISO).length,
      },
      tasas: t,
    },
  }
}
