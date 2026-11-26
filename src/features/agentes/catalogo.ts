import { BellRing, BriefcaseBusiness, ChartLine, FileSignature, HeartHandshake, Lightbulb, Megaphone, Radar, ScanSearch, TrendingUp, type LucideIcon } from 'lucide-react'
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
  /** Se corre a pedido desde la carpeta de un cliente (no tiene programación) */
  porCliente?: boolean
}

/** Los agentes, en el orden en que se muestran: primero los que trabajan solos, después los de cada cliente. */
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
  {
    id: 'financiero',
    nombre: 'Analista financiero',
    icono: ChartLine,
    queHace: 'Cobrado, costos y margen de los últimos 6 meses, cuánto se va en IA, de qué clientes dependen, cuánto cubre el recurrente y la proyección del mes, con recomendaciones.',
    cuando: 'Una vez por mes',
    conHora: true,
    correrAhora: 'Analizar ahora',
  },
  {
    id: 'ventas',
    nombre: 'Aprendizaje de ventas',
    icono: Lightbulb,
    queHace: 'Compara lo ganado contra lo perdido por servicio, rubro y precio, junta los motivos de pérdida y las objeciones que se repiten, y te dice qué cambiar.',
    cuando: 'Una vez por mes',
    conHora: true,
    correrAhora: 'Analizar ahora',
  },
  {
    id: 'propuesta',
    nombre: 'Armador de propuestas',
    icono: FileSignature,
    queHace: 'Con todo lo que se sabe del cliente elige servicios del catálogo, deja la cotización en borrador y te redacta el mensaje para mandarla.',
    cuando: 'A pedido, desde la carpeta del cliente',
    conHora: false,
    correrAhora: 'Armar propuesta',
    porCliente: true,
  },
  {
    id: 'auditor',
    nombre: 'Auditor de redes y web',
    icono: ScanSearch,
    queHace: 'Diagnóstico de la web, el Instagram, la atención y la venta online, con puntaje, mejoras rápidas y un mensaje para regalárselo al cliente.',
    cuando: 'A pedido, desde la carpeta del cliente',
    conHora: false,
    correrAhora: 'Auditar redes y web',
    porCliente: true,
  },
  {
    id: 'contenido',
    nombre: 'Competencia y contenido',
    icono: TrendingUp,
    queHace:
      'Compara su Instagram con los referentes del rubro (datos reales de Meta), busca más referentes y tendencias, y te da lo que hacen ellos y el cliente no, 8 publicaciones listas para hacer y un calendario de 2 semanas.',
    cuando: 'A pedido, desde la carpeta del cliente',
    conHora: false,
    correrAhora: 'Analizar competencia y contenido',
    porCliente: true,
  },
  {
    id: 'meta_ads',
    nombre: 'Campaña de Meta Ads',
    icono: Megaphone,
    queHace: 'Investiga marca, competencia y ofertas, y arma la propuesta de campaña de validación (productos, 3 ángulos, cortes y plan) lista para imprimir. Nunca toca Meta.',
    cuando: 'A pedido, desde la carpeta del cliente',
    conHora: false,
    correrAhora: 'Armar campaña',
    porCliente: true,
  },
]

export const DESCRIPCION = Object.fromEntries(AGENTES.map((a) => [a.id, a])) as Record<IdAgente, DescripcionAgente>
