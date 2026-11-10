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

export const ETAPAS = ['contacto', 'reunion', 'demo', 'propuesta', 'cerrado', 'perdido'] as const
export type Etapa = (typeof ETAPAS)[number]
export type Moneda = 'ARS' | 'USD'

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
