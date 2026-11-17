// El motor de las misiones: planificar (dividir el pedido en 2 a 5 agentes), correr los agentes en
// paralelo (cada uno con las consultas de solo lectura del hub y, si le toca, búsqueda web) y combinar
// lo que encontraron en un resultado. Va dejando todo en jarvis_misiones / jarvis_agentes para que el
// hub lo muestre en vivo. Los agentes NO modifican datos del hub.
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { Hub } from '../asistente/datos.ts'
import { ejecutar, HERRAMIENTAS, HERRAMIENTAS_WEB, NOMBRE_CONSULTA } from '../asistente/herramientas.ts'

export const MODELO = 'claude-sonnet-5-5'
const MAX_AGENTES = 5
const VUELTAS_AGENTE = 5
// Las Edge Functions tienen un tope de tiempo: los agentes cortan antes para que siempre quede resultado
const TOPE_AGENTES_MS = 95_000
const TOPE_TOTAL_MS = 135_000

const texto = { type: 'string' }
const ESQUEMA_PLAN = {
  type: 'object',
  properties: {
    titulo: texto,
    agentes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { nombre: texto, rol: texto, tarea: texto, usa_web: { type: 'boolean' } },
        required: ['nombre', 'rol', 'tarea', 'usa_web'],
        additionalProperties: false,
      },
    },
  },
  required: ['titulo', 'agentes'],
  additionalProperties: false,
}
const ESQUEMA_RESULTADO = {
  type: 'object',
  properties: { resumen: texto, resultado: texto },
  required: ['resumen', 'resultado'],
  additionalProperties: false,
}

const CONTEXTO_ESTUDIO = `brixx es una agencia de IA y soluciones digitales de dos socios en Argentina (sistemas de gestión, bots de WhatsApp con IA, \
tiendas y webs, automatizaciones). Español rioplatense con voseo.`

type Fila = Record<string, unknown>

export class Motor {
  private client = new Anthropic() // lee ANTHROPIC_API_KEY
  private hub: Hub
  private inicio = Date.now()

  constructor(
    private db: SupabaseClient,
    private misionId: string,
  ) {
    this.hub = new Hub(db)
  }

  private quedan = (tope: number) => tope - (Date.now() - this.inicio)

  private async mision(cambios: Fila) {
    await this.db.from('jarvis_misiones').update(cambios).eq('id', this.misionId)
  }

  private async cancelada(): Promise<boolean> {
    const { data } = await this.db.from('jarvis_misiones').select('estado').eq('id', this.misionId).maybeSingle()
    return data?.estado === 'cancelada'
  }

  /** Corre la misión completa. Nunca lanza: los errores quedan guardados en la misión. */
  async correr(pedido: string) {
    try {
      const plan = await this.planificar(pedido)
      if (await this.cancelada()) return
      const { data: agentes, error } = await this.db
        .from('jarvis_agentes')
        .insert(plan.agentes.map((a, i) => ({ mision_id: this.misionId, orden: i, ...a })))
        .select('*')
      if (error) throw new Error(error.message)
      await this.mision({ titulo: plan.titulo, estado: 'trabajando' })

      const resultados = await Promise.allSettled((agentes ?? []).map((a) => this.agente(a as Fila, pedido, plan.titulo)))
      if (await this.cancelada()) return

      await this.mision({ estado: 'combinando' })
      const partes = (agentes ?? []).map((a, i) => {
        const r = resultados[i]
        return `### ${a.nombre} (${a.rol})\nTarea: ${a.tarea}\n${r.status === 'fulfilled' ? r.value : `No terminó: ${r.reason instanceof Error ? r.reason.message : r.reason}`}`
      })
      const final = await this.combinar(pedido, plan.titulo, partes.join('\n\n'))
      await this.mision({ estado: 'lista', resultado: final.resultado, resumen: final.resumen })
    } catch (e) {
      console.error('Misión con error:', e)
      await this.mision({ estado: 'error', error: e instanceof Error ? e.message : String(e) })
    }
  }

  private async planificar(pedido: string): Promise<{ titulo: string; agentes: { nombre: string; rol: string; tarea: string; usa_web: boolean }[] }> {
    const clientes = (await this.hub.prospectos()).map((p) => `${p.empresa || p.nombre} (${p.etapa})`).join(', ')
    const r = await this.client.beta.messages.create(
      {
        model: MODELO,
        max_tokens: 3000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'between_tools' },
        output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA_PLAN } },
        system: `Sos el coordinador de un equipo de agentes de IA de brixx. ${CONTEXTO_ESTUDIO}
Dividí el pedido del socio en entre 2 y ${MAX_AGENTES} agentes que trabajen EN PARALELO (sin depender uno de otro), cada uno con una parte concreta.
- nombre: corto y claro (por ejemplo "Investigador", "Analista del cliente", "Redactor", "Cotizador", "Estratega").
- rol: qué tipo de trabajo hace, en pocas palabras.
- tarea: lo que tiene que entregar, concreto y autocontenido (el agente no ve las tareas de los otros).
- usa_web: true solo si necesita buscar en internet (redes, webs, competencia, mercado, prospectos nuevos).
Los agentes pueden consultar todo el hub (clientes, carpetas, grabaciones, cotizaciones, catálogo, finanzas, metas, agenda) pero no modificar nada.
Para pedidos chicos usá 2 o 3 agentes; no inventes trabajo de más. titulo: el nombre de la misión, de 3 a 6 palabras.`,
        messages: [{ role: 'user', content: `<clientes_del_hub>${clientes || '(ninguno)'}</clientes_del_hub>\n\n<pedido>${pedido}</pedido>` }],
      },
      { signal: AbortSignal.timeout(40_000) },
    )
    const bloque = r.content.find((b) => b.type === 'text')
    if (r.stop_reason === 'refusal' || !bloque || bloque.type !== 'text') throw new Error('No se pudo planificar la misión.')
    const plan = JSON.parse(bloque.text)
    plan.agentes = (plan.agentes ?? []).slice(0, MAX_AGENTES)
    if (!plan.agentes.length) throw new Error('El plan salió sin agentes.')
    return plan
  }

  /** Un agente: hasta 5 vueltas con herramientas, dejando registro de cada paso. Devuelve lo que encontró. */
  private async agente(a: Fila, pedido: string, titulo: string): Promise<string> {
    const id = a.id as string
    const registro: { t: string; texto: string }[] = []
    const anotar = async (txt: string, progreso: number, extra: Fila = {}) => {
      registro.push({ t: new Date().toISOString(), texto: txt })
      await this.db.from('jarvis_agentes').update({ registro: registro.slice(-30), progreso, ...extra }).eq('id', id)
    }
    await anotar('Arranco.', 5, { estado: 'trabajando' })

    const tools: Anthropic.Beta.BetaToolUnion[] = [...HERRAMIENTAS, ...(a.usa_web ? HERRAMIENTAS_WEB : [])]
    const mensajes: Anthropic.Beta.BetaMessageParam[] = [
      {
        role: 'user',
        content: `<mision>${titulo}</mision>\n<pedido_del_socio>${pedido}</pedido_del_socio>\n<tu_tarea>${a.tarea}</tu_tarea>`,
      },
    ]
    const sistema = `Sos "${a.nombre}", un agente de brixx (${a.rol}). ${CONTEXTO_ESTUDIO}
Trabajás en paralelo con otros agentes; vos hacés SOLO tu tarea. Usá las herramientas para consultar el hub${a.usa_web ? ' y la web' : ''}: no inventes datos.
No podés modificar nada del hub. Sé eficiente: pocas consultas, las justas.
Entregá al final tu resultado: concreto, con datos y nombres, en texto plano (podés usar guiones para listas), de hasta 15 líneas.`

    let ultimoTexto = ''
    for (let vuelta = 1; vuelta <= VUELTAS_AGENTE; vuelta++) {
      if (this.quedan(TOPE_AGENTES_MS) < 8_000 || (await this.cancelada())) break
      const ultima = vuelta === VUELTAS_AGENTE || this.quedan(TOPE_AGENTES_MS) < 25_000
      const r = await this.client.beta.messages.create(
        {
          model: MODELO,
          max_tokens: 4000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          thinking: { type: 'between_tools' },
          output_config: { effort: 'low' },
          system: sistema,
          tools,
          tool_choice: ultima ? { type: 'none' } : { type: 'auto' },
          messages: mensajes,
        },
        { signal: AbortSignal.timeout(Math.max(10_000, this.quedan(TOPE_AGENTES_MS))) },
      )
      // Lo que hizo del lado de Anthropic (búsquedas web)
      for (const b of r.content) {
        if (b.type === 'server_tool_use') {
          const q = (b.input as { query?: string; url?: string }) ?? {}
          await anotar(`${NOMBRE_CONSULTA[b.name] ?? b.name}${q.query ? `: ${q.query}` : q.url ? `: ${q.url}` : ''}`, Math.min(90, 10 + vuelta * 16))
        }
      }
      ultimoTexto = r.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim() || ultimoTexto
      if (r.stop_reason === 'pause_turn') {
        mensajes.push({ role: 'assistant', content: r.content })
        continue
      }
      const usos = r.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
      if (r.stop_reason === 'tool_use' && usos.length && !ultima) {
        mensajes.push({ role: 'assistant', content: r.content })
        const resultados = await Promise.all(
          usos.map(async (u): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
            await anotar(`Consulto ${NOMBRE_CONSULTA[u.name] ?? u.name}`, Math.min(90, 10 + vuelta * 16))
            try {
              // Solo herramientas de lectura: ejecutar() no recibe memoria ni acciones
              const salida = await ejecutar(this.hub, null as never, null as never, u.name, u.input as Record<string, unknown>)
              return { type: 'tool_result', tool_use_id: u.id, content: salida }
            } catch (e) {
              return { type: 'tool_result', tool_use_id: u.id, content: `Error: ${e instanceof Error ? e.message : e}`, is_error: true }
            }
          }),
        )
        mensajes.push({ role: 'user', content: resultados })
        continue
      }
      break
    }
    if (!ultimoTexto) {
      await anotar('No llegué a terminar a tiempo.', 100, { estado: 'error' })
      throw new Error('No llegó a terminar a tiempo.')
    }
    await anotar('Listo.', 100, { estado: 'listo', resultado: ultimoTexto })
    return ultimoTexto
  }

  private async combinar(pedido: string, titulo: string, partes: string): Promise<{ resumen: string; resultado: string }> {
    const r = await this.client.beta.messages.create(
      {
        model: MODELO,
        max_tokens: 6000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'between_tools' },
        output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA_RESULTADO } },
        system: `Sos Jarvis, el asistente de brixx. ${CONTEXTO_ESTUDIO}
Juntá lo que entregaron los agentes de una misión en un resultado útil para los socios, sin repetir.
- resumen: 1 o 2 oraciones para decir en voz alta (la conclusión), sin markdown.
- resultado: el entregable completo, ordenado y accionable, en texto plano con títulos cortos en mayúsculas y guiones para las listas \
(sin asteriscos ni #). Al final, "PRÓXIMOS PASOS" con 2 a 4 acciones concretas. Si algún agente no terminó, decilo.`,
        messages: [{ role: 'user', content: `<mision>${titulo}</mision>\n<pedido>${pedido}</pedido>\n\n<lo_que_entregaron_los_agentes>\n${partes}\n</lo_que_entregaron_los_agentes>` }],
      },
      { signal: AbortSignal.timeout(Math.max(15_000, this.quedan(TOPE_TOTAL_MS))) },
    )
    const bloque = r.content.find((b) => b.type === 'text')
    if (r.stop_reason === 'refusal' || !bloque || bloque.type !== 'text') throw new Error('No se pudo combinar el resultado.')
    return JSON.parse(bloque.text)
  }
}
