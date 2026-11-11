import type { Etapa } from '../../types/db'

/** Colores por etapa (tokens de index.css). */
export const ESTILO_ETAPA: Record<Etapa, { fondo: string; texto: string; punto: string }> = {
  contacto: { fondo: 'bg-elevada', texto: 'text-suave', punto: 'bg-suave' },
  reunion: { fondo: 'bg-acento-tenue', texto: 'text-acento-texto', punto: 'bg-acento-texto' },
  demo: { fondo: 'bg-violeta-tenue', texto: 'text-violeta', punto: 'bg-violeta' },
  propuesta: { fondo: 'bg-aviso-tenue', texto: 'text-aviso', punto: 'bg-aviso' },
  cerrado: { fondo: 'bg-turquesa-tenue', texto: 'text-turquesa', punto: 'bg-turquesa' },
  implementacion: { fondo: 'bg-naranja-tenue', texto: 'text-naranja', punto: 'bg-naranja' },
  mantenimiento: { fondo: 'bg-ok-tenue', texto: 'text-ok', punto: 'bg-ok' },
  perdido: { fondo: 'bg-peligro-tenue', texto: 'text-peligro', punto: 'bg-peligro' },
}
