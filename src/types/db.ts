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
  /** Último chequeo del agente monitor (null = nunca se revisó) */
  en_linea?: boolean | null
  chequeo_at?: string | null
  chequeo_detalle?: string | null
  created_at: string
  updated_at: string
}

export type FichaInput = Omit<Ficha, 'id' | 'created_at' | 'updated_at' | 'en_linea' | 'chequeo_at' | 'chequeo_detalle'>

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
  /** Cuándo pasó a cliente (lo completa la base al entrar en una etapa ganada). */
  fecha_cierre: string | null
  instagram: string | null
  web: string | null
  industria: string | null
  /** Lo de arriba de la carpeta del cliente: lo arma Claude con todo lo que se sabe de él. */
  sintesis: Sintesis | null
  sintesis_at: string | null
  created_at: string
  updated_at: string
}

/** Mantener en sincronía con ESQUEMA_SINTESIS en supabase/functions/grabaciones/sintesis.ts. */
export interface Sintesis {
  situacion: string
  objetivos: string[]
  soluciones: { solucion: string; servicio_id: string | null; servicio: string }[]
  hacer_ahora: { accion: string; fecha: string | null }[]
  falta_saber: string[]
}

export type ProspectoInput = Omit<
  Prospecto,
  'id' | 'created_at' | 'updated_at' | 'fecha_cierre' | 'sintesis' | 'sintesis_at' | 'instagram' | 'web' | 'industria'
> &
  Partial<Pick<Prospecto, 'instagram' | 'web' | 'industria'>>

export interface Miembro {
  email: string
  nombre: string
}

export interface Ajustes {
  id: boolean
  tipo_cambio_usd: number | null
  /** Tasas iniciales del embudo (se usan hasta tener datos reales). */
  tasa_reunion_propuesta: number
  tasa_propuesta_cierre: number
  /** Cómo quieren los socios que sea Jarvis (tono, reglas, prioridades). Se edita en /jarvis. */
  jarvis_personalidad?: string | null
  /** Voice ID de ElevenLabs elegido en /jarvis (vacío = el del secret o la voz por defecto) */
  jarvis_voz_id?: string | null
  /** 'eleven_flash_v2_5' (rápida) | 'eleven_multilingual_v2' (más natural) */
  jarvis_voz_modelo?: string | null
  /** 'calmo' | 'animado' | 'energico' (vacío = calmo): expresividad y velocidad de la voz */
  jarvis_voz_energia?: EnergiaVoz | null
  /** Clave pública de MapTiler para el mapa de Jarvis (satélite, relieve y edificios). Vacío = mapa sin satélite. */
  mapa_clave?: string | null
}

export type EnergiaVoz = 'calmo' | 'animado' | 'energico'

/** Una acción que Jarvis preparó y espera confirmación (o ya se hizo). Ver supabase/functions/asistente/acciones.ts. */
export interface AccionJarvis {
  id: string
  tipo: 'agendar_reunion' | 'proxima_accion' | 'mover_etapa' | 'nota_cliente' | 'cotizacion_borrador'
  resumen: string
  estado: 'pendiente' | 'hecha' | 'cancelada' | 'error'
  resultado?: string | null
  link?: string | null
}

export type TipoMeta = 'mes' | 'trimestre'

export interface Meta {
  id: string
  tipo: TipoMeta
  periodo: string // YYYY-MM-DD, primer día del período
  clientes_nuevos: number | null
  ingreso_recurrente: number | null
}
export type MetaInput = Omit<Meta, 'id'>

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
  /** Solo en audios subidos: qué quiere la persona */
  lo_que_quiere?: string
  /** Solo en audios subidos: mensaje sugerido para contestarle */
  respuesta_sugerida?: string
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

/** reunion = grabada con el micrófono; audio = archivo subido (por ejemplo, de WhatsApp); texto = chat o notas pegadas */
export type OrigenGrabacion = 'reunion' | 'audio' | 'texto'

/**
 * Análisis de una intervención (audio o texto de un cliente, con sus links).
 * Mantener en sincronía con ESQUEMA_INTERVENCION en supabase/functions/grabaciones/intervencion.ts.
 */
export interface AnalisisIntervencion {
  tipo: 'intervencion'
  cliente: {
    nombre: string | null
    empresa: string | null
    email: string | null
    telefono: string | null
    instagram: string | null
    web: string | null
    rubro: string | null
    industria: string | null
  }
  en_una_linea: string
  dolores: string[]
  cuellos_de_botella: string[]
  soluciones: { solucion: string; servicio_id: string | null; servicio: string }[]
  falta_saber: string[]
  propuesta: { asunto: string; mensaje: string }
  /** true si el hub creó la carpeta del cliente con esta intervención */
  carpeta_creada?: boolean
}

export const esIntervencion = (a: unknown): a is AnalisisIntervencion =>
  !!a && typeof a === 'object' && (a as { tipo?: string }).tipo === 'intervencion'

export interface Grabacion {
  id: string
  origen: OrigenGrabacion
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
  analisis: Analisis | AnalisisIntervencion | null
  /** Texto pegado en una intervención (chat, mail o notas) */
  texto_original: string | null
  /** Links cargados con la intervención (Instagram, web…) */
  urls: string[]
  modelo: string | null
  grabado_por: string | null
  created_at: string
  updated_at: string
}

/** Agentes de Jarvis que trabajan solos (0018). */
export type IdAgente = 'preparador' | 'postventa' | 'monitor' | 'cobranzas' | 'propuesta' | 'auditor' | 'meta_ads' | 'financiero' | 'ventas'

export interface AgenteConfig {
  agente: IdAgente
  activo: boolean
  hora: number
  ultima_corrida: string | null
  ultimo_estado: string | null
}

export interface MensajeAgente {
  prospecto_id: string
  cliente: string
  contacto?: string
  telefono: string | null
  tipo?: string
  detalle?: string
  texto: string
}

export interface ClientePostventa {
  prospecto_id: string
  cliente: string
  telefono: string | null
  salud: 'bien' | 'atencion' | 'riesgo'
  motivo: string
  oportunidad: string
  mensaje: string
}

export interface InformeAgente {
  id: string
  agente: IdAgente
  titulo: string
  resumen: string | null
  contenido: string | null
  datos: { mensajes?: MensajeAgente[]; clientes?: ClientePostventa[]; url?: string; detalle?: string; cotizacion_id?: string; numero?: string; campana?: CampanaMeta }
  prospecto_id: string | null
  reunion_id: string | null
  estado: 'trabajando' | 'lista' | 'error'
  error: string | null
  leido: boolean
  pedido_por: string | null
  created_at: string
}

/** Propuesta de campaña de Meta Ads (misma estructura que ejemplo-datos.json del skill campanas-meta-ads). */
export interface AnguloMeta {
  tipo: 'video' | 'imagen'
  pack?: boolean
  bg: string
  nombre: string
  overlay: string
  brief: string
  texto: string
  titulo: string
}
export interface ProductoMeta {
  key: string
  nombre: string
  codigo: string
  costo: string
  venta: string
  promo_label: string
  promo: string
  cpa: string
  max_evento: string
  cpc: string
  cpm: string
  angulos: AnguloMeta[]
}
export interface CampanaMeta {
  cliente: string
  fecha: string
  contacto: string
  titulo: string
  subtitulo: string
  descripcion: string
  cta: string
  leyenda_video: string
  leyenda_imagen: string
  campos: Record<string, string>
  kpis: { label: string; valor: string; nota: string }[]
  productos_titulo: string
  columna_promo: string
  columna_evento: string
  nota_productos: string
  cortes: [string, string, string][]
  nota_cortes: string
  pasos: [string, string][]
  antes_de_lanzar: string[]
  reglas: string[]
  auditoria: { titulo: string; items: string[] } | null
  productos: ProductoMeta[]
}

/** Un negocio que Jarvis encontró en una búsqueda por zona (jarvis_busquedas.lugares). */
export interface LugarBusqueda {
  nombre: string
  lat: number | null
  lng: number | null
  direccion?: string | null
  telefono?: string | null
  web?: string | null
  instagram?: string | null
  horario?: string | null
  nota?: string | null
  fuente: 'google' | 'osm' | 'web'
  /** De Google Maps: puntaje, cantidad de reseñas y link a la ficha */
  rating?: number | null
  resenas?: number | null
  maps?: string | null
  osm?: string
  /** Si ya se sumó al pipeline */
  prospecto_id?: string | null
}

/** "Buscame hamburgueserías en Yerba Buena": lo que encontró Jarvis (lo escribe la función asistente). */
export interface BusquedaJarvis {
  id: string
  usuario: string
  rubro: string
  zona: string
  centro: { lat: number; lng: number; bbox?: [number, number, number, number] } | null
  lugares: LugarBusqueda[]
  created_at: string
}

/** Lo que Jarvis le pide al mapa: abrir una búsqueda o volar a un lugar. */
export interface AvisoMapa {
  busqueda_id?: string
  centro?: { lat: number; lng: number; zoom?: number }
  titulo?: string
}
