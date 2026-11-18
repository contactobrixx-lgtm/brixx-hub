import { BellRing, BriefcaseBusiness, HeartHandshake, Radar, type LucideIcon } from 'lucide-react'
import type { IdAgente } from '../../types/db'

export interface DescripcionAgente {
  id: IdAgente
  nombre: string
  icono: LucideIcon
  queHace: string
  cuando: string
  /** Tiene hora elegible (los diarios y semanales) */
  conHora: boolean
  /** Qué hace el botón "Correr ahora" */
  correrAhora: string
}

/** Los agentes de la tanda 1, en el orden en que se muestran. */
export const AGENTES: DescripcionAgente[] = [
  {
    id: 'preparador',
    nombre: 'Preparador de reuniones',
    icono: BriefcaseBusiness,
    queHace: 'Antes de cada reunión arma el brief: quién es, qué le duele, qué ofrecerle con precios, preguntas, objeciones y competencia.',
    cuando: 'Solo, una hora antes de cada reunión del calendario',
    conHora: false,
    correrAhora: 'Preparar la próxima reunión',
  },
  {
    id: 'cobranzas',
    nombre: 'Cobranzas',
    icono: BellRing,
    queHace: 'Junta los abonos del mes sin cobrar y los saldos de implementación, y te redacta un recordatorio amable para cada cliente.',
    cuando: 'Todos los días',
    conHora: true,
    correrAhora: 'Revisar cobros ahora',
  },
  {
    id: 'postventa',
    nombre: 'Postventa',
    icono: HeartHandshake,
    queHace: 'Revisa a cada cliente activo: si está en riesgo (no paga, hace mucho no hablan) y qué otro servicio le serviría, con un mensaje sugerido.',
    cuando: 'Una vez por semana',
    conHora: true,
    correrAhora: 'Revisar clientes ahora',
  },
  {
    id: 'monitor',
    nombre: 'Monitor de sistemas y demos',
    icono: Radar,
    queHace: 'Revisa que respondan los sistemas entregados y las demos web, y te avisa si alguno se cae (y cuando vuelve).',
    cuando: 'Cada hora',
    conHora: false,
    correrAhora: 'Revisar ahora',
  },
]

export const DESCRIPCION = Object.fromEntries(AGENTES.map((a) => [a.id, a])) as Record<IdAgente, DescripcionAgente>
