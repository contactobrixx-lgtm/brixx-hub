import { isoLocal } from '../../lib/format'
import type { Prospecto, Reunion } from '../../types/db'

export type Evento =
  | { tipo: 'reunion'; id: string; fecha: string; inicio: Date; titulo: string; reunion: Reunion; prospecto?: Prospecto }
  | { tipo: 'accion'; id: string; fecha: string; titulo: string; prospecto: Prospecto }

/** Une reuniones y "próximas acciones" del pipeline en una lista de eventos por día. */
export function armarEventos(reuniones: Reunion[], prospectos: Prospecto[]): Evento[] {
  const porId = new Map(prospectos.map((p) => [p.id, p]))
  const eventos: Evento[] = reuniones.map((r) => {
    const inicio = new Date(r.inicio)
    return {
      tipo: 'reunion',
      id: r.id,
      fecha: isoLocal(inicio),
      inicio,
      titulo: r.titulo,
      reunion: r,
      prospecto: r.prospecto_id ? porId.get(r.prospecto_id) : undefined,
    }
  })
  for (const p of prospectos) {
    if (p.fecha_proxima_accion && p.proxima_accion && p.etapa !== 'perdido') {
      eventos.push({ tipo: 'accion', id: `acc-${p.id}`, fecha: p.fecha_proxima_accion, titulo: p.proxima_accion, prospecto: p })
    }
  }
  return eventos.sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1
    if (a.tipo !== b.tipo) return a.tipo === 'reunion' ? -1 : 1
    return a.tipo === 'reunion' && b.tipo === 'reunion' ? a.inicio.getTime() - b.inicio.getTime() : 0
  })
}

export const nombreProspecto = (p?: Prospecto) => (p ? p.empresa || p.nombre : null)

export function esLink(texto: string | null): texto is string {
  return !!texto && /^https?:\/\//i.test(texto.trim())
}
