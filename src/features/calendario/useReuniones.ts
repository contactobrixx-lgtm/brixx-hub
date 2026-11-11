import { useTabla } from '../../lib/useTabla'
import type { Reunion, ReunionInput } from '../../types/db'

export function useReuniones() {
  return useTabla<Reunion, ReunionInput>('reuniones', { orden: [{ columna: 'inicio' }] })
}
