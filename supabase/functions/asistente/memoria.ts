// Memoria de Jarvis: la libreta de notas del estudio (jarvis_memoria) y la conversación
// de cada socio (asistente_mensajes). Es lo único que Jarvis puede escribir.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { Turno } from './cerebro.ts'

const MAX_NOTAS = 60
const MAX_NOTA = 500
const TURNOS_HISTORIAL = 12

const fechaAR = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

export class Memoria {
  constructor(
    private db: SupabaseClient,
    private usuario: { email: string; nombre: string },
  ) {}

  /** Las notas guardadas, para incluirlas en cada pregunta (con su id, para poder borrarlas). */
  async notas(): Promise<string> {
    const { data, error } = await this.db
      .from('jarvis_memoria')
      .select('id, contenido, creado_por, created_at')
      .order('created_at', { ascending: false })
      .limit(MAX_NOTAS)
    if (error) return '(no se pudo leer la memoria)'
    if (!data?.length) return '(todavía no hay nada guardado)'
    return data
      .reverse()
      .map((n) => `- [${n.id}] ${n.contenido} (${new Date(n.created_at as string).toLocaleDateString('es-AR')}${n.creado_por ? `, ${n.creado_por}` : ''})`)
      .join('\n')
  }

  async recordar(nota: string): Promise<string> {
    const contenido = nota.trim().slice(0, MAX_NOTA)
    if (!contenido) return 'No había nada para guardar.'
    const { error } = await this.db.from('jarvis_memoria').insert({ contenido, creado_por: this.usuario.nombre })
    if (error) throw new Error(`No se pudo guardar: ${error.message}`)
    return 'Guardado en la memoria.'
  }

  async olvidar(id: string): Promise<string> {
    const { data, error } = await this.db.from('jarvis_memoria').delete().eq('id', id).select('id')
    if (error) throw new Error(`No se pudo borrar: ${error.message}`)
    return data?.length ? 'Borrado de la memoria.' : 'No encontré esa nota (ya estaba borrada).'
  }

  /** Lo último que se habló con este socio (de cualquier día), con fecha, para que Claude tenga contexto. */
  async historial(): Promise<Turno[]> {
    const { data, error } = await this.db
      .from('asistente_mensajes')
      .select('rol, texto, created_at')
      .eq('usuario', this.usuario.email)
      .order('created_at', { ascending: false })
      .limit(TURNOS_HISTORIAL)
    if (error || !data) return []
    return data.reverse().map((m) => ({
      rol: m.rol as Turno['rol'],
      // La fecha ayuda a entender "lo que hablamos ayer"
      texto: m.rol === 'usuario' ? `[${fechaAR(m.created_at as string)}] ${m.texto}` : (m.texto as string),
    }))
  }

  /** Guarda la pregunta y la respuesta (si falla, no rompe la respuesta). */
  async guardarTurno(pregunta: string, respuesta: string, consultas: string[]) {
    const { error } = await this.db.from('asistente_mensajes').insert([
      { usuario: this.usuario.email, rol: 'usuario', texto: pregunta },
      { usuario: this.usuario.email, rol: 'asistente', texto: respuesta, consultas },
    ])
    if (error) console.error('No se pudo guardar la conversación:', error.message)
  }
}
