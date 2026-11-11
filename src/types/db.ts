// Tipos de las tablas de Supabase. Mantener en sincronía con supabase/migrations/.

export type Seccion = 'sistema' | 'demo'
export type ModoApertura = 'iframe' | 'pestana'
export type EstadoFicha = 'activo' | 'en_desarrollo' | 'archivado'

export interface Ficha {
  id: string
  seccion: Seccion
  nombre: string
  cliente: string | null
  categoria: string | null
  descripcion: string | null
  url: string
  imagen_path: string | null
  modo_apertura: ModoApertura
  estado: EstadoFicha
  etiquetas: string[]
  orden: number
  created_at: string
  updated_at: string
}

export type FichaInput = Omit<Ficha, 'id' | 'created_at' | 'updated_at'>

export const ETAPAS = [
  'contacto',
  'reunion',
  'demo',
  'propuesta',
  'cerrado',
  'implementacion',
  'mantenimiento',
  'perdido',
] as const
export type Etapa = (typeof ETAPAS)[number]
export type Moneda = 'ARS' | 'USD'

/** Etapas antes de cerrar (pipeline abierto). */
export const ETAPAS_ABIERTAS: readonly Etapa[] = ['contacto', 'reunion', 'demo', 'propuesta']
/** Etapas de un cliente ganado. */
export const ETAPAS_GANADAS: readonly Etapa[] = ['cerrado', 'implementacion', 'mantenimiento']
/** Clientes activos (pagan o están en curso). */
export const ETAPAS_ACTIVAS: readonly Etapa[] = ['implementacion', 'mantenimiento']

export interface Prospecto {
  id: string
  nombre: string
  empresa: string | null
  rubro: string | null
  telefono: string | null
  email: string | null
  etapa: Etapa
  valor_estimado: number | null
  moneda: Moneda
  responsable: string | null
  proxima_accion: string | null
  fecha_proxima_accion: string | null
  ficha_demo_id: string | null
  motivo_perdida: string | null
  notas: string | null
  orden: number
  created_at: string
  updated_at: string
}

export type ProspectoInput = Omit<Prospecto, 'id' | 'created_at' | 'updated_at'>

export interface Miembro {
  email: string
  nombre: string
}

export interface Ajustes {
  id: boolean
  tipo_cambio_usd: number | null
}

export interface Servicio {
  id: string
  nombre: string
  descripcion: string | null
  precio_implementacion: number
  precio_mensual: number
  activo: boolean
  orden: number
}
export type ServicioInput = Omit<Servicio, 'id'>

export type EstadoCotizacion = 'borrador' | 'enviada' | 'aceptada' | 'rechazada'

export interface CotizacionItem {
  id: string
  cotizacion_id: string
  servicio_id: string | null
  descripcion: string
  cantidad: number
  precio_implementacion: number
  precio_mensual: number
  orden: number
}
export type CotizacionItemInput = Omit<CotizacionItem, 'id' | 'cotizacion_id'>

export interface Cotizacion {
  id: string
  numero: number
  prospecto_id: string | null
  titulo: string | null
  estado: EstadoCotizacion
  fecha: string
  valida_hasta: string | null
  moneda: Moneda
  descuento_pct: number
  notas: string | null
  created_at: string
  updated_at: string
  cotizacion_items: CotizacionItem[]
}
export type CotizacionInput = Omit<Cotizacion, 'id' | 'numero' | 'created_at' | 'updated_at' | 'cotizacion_items'>

export type ConceptoCobro = 'anticipo' | 'saldo' | 'abono' | 'extra'

export interface Cobro {
  id: string
  fecha: string
  monto: number
  moneda: Moneda
  concepto: ConceptoCobro
  prospecto_id: string | null
  cotizacion_id: string | null
  notas: string | null
}
export type CobroInput = Omit<Cobro, 'id'>

export type CategoriaCosto = 'apps' | 'ia' | 'hosting' | 'dominios' | 'fees' | 'adquisicion'
export type FrecuenciaCosto = 'mensual' | 'anual' | 'unico'

export interface Costo {
  id: string
  nombre: string
  categoria: CategoriaCosto
  monto: number
  moneda: Moneda
  frecuencia: FrecuenciaCosto
  desde: string
  hasta: string | null
  notas: string | null
}
export type CostoInput = Omit<Costo, 'id'>

export interface Reunion {
  id: string
  titulo: string
  inicio: string
  duracion_min: number
  prospecto_id: string | null
  lugar_o_link: string | null
  responsable: string | null
  notas: string | null
}
export type ReunionInput = Omit<Reunion, 'id'>

export type EstadoGrabacion = 'pendiente' | 'transcribiendo' | 'analizando' | 'lista' | 'error'

export interface Segmento {
  hablante: string
  inicio_ms: number
  fin_ms: number
  texto: string
}

export type TipoPuntoClave = 'necesidad' | 'dolor' | 'presupuesto' | 'plazo' | 'objecion' | 'oportunidad' | 'decision' | 'otro'

/** Respuesta de Claude. Mantener en sincronía con ESQUEMA en supabase/functions/grabaciones/analisis.ts. */
export interface Analisis {
  resumen: string
  puntos_clave: { titulo: string; detalle: string; tipo: TipoPuntoClave; cita: string; segundo: number | null }[]
  decisiones: string[]
  proximos_pasos: { accion: string; responsable: string | null; fecha: string | null }[]
  propuesta: {
    enfoque: string
    servicios: { servicio_id: string | null; nombre: string; motivo: string; etapa: 1 | 2 | 3 }[]
    riesgos: string[]
  }
  preguntas_pendientes: string[]
}

export interface Grabacion {
  id: string
  titulo: string
  reunion_id: string | null
  prospecto_id: string | null
  audio_path: string | null
  audio_mime: string | null
  duracion_seg: number | null
  estado: EstadoGrabacion
  error: string | null
  proveedor: string
  proveedor_id: string | null
  segmentos: Segmento[] | null
  hablantes: Record<string, string>
  analisis: Analisis | null
  modelo: string | null
  grabado_por: string | null
  created_at: string
  updated_at: string
}
