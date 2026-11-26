// Lo común a todos los agentes: cómo piensan (Claude con las consultas de solo lectura del hub y,
// si hace falta, la web), cómo guardan su informe y la hora de Argentina.
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { Hub, ZONA } from '../asistente/datos.ts'
import { ejecutar, HERRAMIENTAS, HERRAMIENTAS_WEB } from '../asistente/herramientas.ts'

export const MODELO = 'claude-sonnet-5-5'
export const MODELO_RAPIDO = 'claude-haiku-5-5'

export const CONTEXTO_ESTUDIO = `brixx es una agencia de IA y soluciones digitales de dos socios en Argentina (sistemas de gestión, bots de WhatsApp con IA, \
tiendas y webs, automatizaciones, campañas de Meta Ads). Español rioplatense con voseo. Texto plano: sin asteriscos, sin #, sin tablas; \
títulos cortos en MAYÚSCULAS y guiones para las listas.`

export type Fila = Record<string, unknown>

export interface Contexto {
  db: SupabaseClient
  hub: Hub
  ia: Anthropic
  /** email del socio que lo pidió, o null si lo corrió el programador */
  socio: string | null
}

export function nuevoContexto(db: SupabaseClient, socio: string | null): Contexto {
  return { db, hub: new Hub(db), ia: new Anthropic(), socio }
}

/** Fecha (AAAA-MM-DD), hora (0-23) y día de la semana (0 = domingo) en Argentina */
export function ahoraAR(d = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  )
  const dias = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return { fecha: `${partes.year}-${partes.month}-${partes.day}`, hora: Number(partes.hour), dia: dias.indexOf(partes.weekday) }
}

export const horaCorta = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

export interface Informe {
  titulo: string
  resumen?: string | null
  contenido?: string | null
  datos?: Fila
  prospecto_id?: string | null
  reunion_id?: string | null
}

/**
 * Crea el informe en "trabajando" (con su clave, para no repetirlo). Devuelve el id,
 * o null si ya existía uno con esa clave (otro aviso del programador lo está haciendo o ya lo hizo).
 */
export async function empezarInforme(ctx: Contexto, agente: string, clave: string | null, base: Informe): Promise<string | null> {
  const { data, error } = await ctx.db
    .from('agentes_informes')
    .insert({ agente, clave, estado: 'trabajando', pedido_por: ctx.socio, ...base })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') return null // clave repetida
    throw new Error(error.message)
  }
  return data.id as string
}

export async function terminarInforme(ctx: Contexto, id: string, informe: Informe) {
  await ctx.db.from('agentes_informes').update({ estado: 'lista', error: null, ...informe }).eq('id', id)
}

export async function fallarInforme(ctx: Contexto, id: string, e: unknown) {
  await ctx.db
    .from('agentes_informes')
    .update({ estado: 'error', error: e instanceof Error ? e.message : String(e) })
    .eq('id', id)
}

/** Corre un trabajo dentro de un informe: si falla, el error queda guardado en el informe. */
export async function conInforme(ctx: Contexto, id: string, trabajo: () => Promise<Informe>) {
  try {
    await terminarInforme(ctx, id, await trabajo())
  } catch (e) {
    console.error('Agente con error:', e)
    await fallarInforme(ctx, id, e)
  }
}

export async function marcarCorrida(ctx: Contexto, agente: string, estado: string) {
  await ctx.db.from('agentes_config').update({ ultima_corrida: new Date().toISOString(), ultimo_estado: estado.slice(0, 300) }).eq('agente', agente)
}

/** Pide una respuesta JSON con esquema (sin herramientas). */
export async function pensarJSON<T>(ctx: Contexto, o: { modelo?: string; sistema: string; pedido: string; esquema: Fila; maxTokens?: number; timeoutMs?: number }): Promise<T> {
  const rapido = o.modelo === MODELO_RAPIDO
  const r = await ctx.ia.beta.messages.create(
    {
      model: o.modelo ?? MODELO,
      max_tokens: o.maxTokens ?? 6000,
      ...(rapido ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', thinking: { type: 'between_tools' } }),
      output_config: { effort: 'low', format: { type: 'json_schema', schema: o.esquema } },
      system: `${o.sistema}\n\n${CONTEXTO_ESTUDIO}`,
      messages: [{ role: 'user', content: o.pedido }],
    } as Anthropic.Beta.MessageCreateParamsNonStreaming,
    { signal: AbortSignal.timeout(o.timeoutMs ?? 90_000) },
  )
  const bloque = r.content.find((b) => b.type === 'text')
  if (r.stop_reason === 'refusal' || !bloque || bloque.type !== 'text') throw new Error('Claude no devolvió una respuesta.')
  return JSON.parse(bloque.text) as T
}

/**
 * Un agente que investiga: hasta `vueltas` idas y vueltas usando las consultas de solo lectura del hub
 * (y la web si `web`). Devuelve el texto final. Nunca modifica el hub.
 */
export async function investigar(ctx: Contexto, o: { sistema: string; pedido: string; web: boolean; vueltas?: number; topeMs?: number }): Promise<string> {
  const inicio = Date.now()
  const tope = o.topeMs ?? 100_000
  const quedan = () => tope - (Date.now() - inicio)
  const vueltas = o.vueltas ?? 5
  const tools: Anthropic.Beta.BetaToolUnion[] = [...HERRAMIENTAS, ...(o.web ? HERRAMIENTAS_WEB : [])]
  const mensajes: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: o.pedido }]
  let texto = ''
  for (let vuelta = 1; vuelta <= vueltas; vuelta++) {
    if (quedan() < 8_000) break
    const ultima = vuelta === vueltas || quedan() < 30_000
    const r = await ctx.ia.beta.messages.create(
      {
        model: MODELO,
        max_tokens: 6000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'between_tools' },
        output_config: { effort: 'low' },
        system: `${o.sistema}\n\n${CONTEXTO_ESTUDIO}\nUsá las herramientas para consultar el hub${o.web ? ' y la web' : ''}: no inventes datos. No podés modificar nada. Pocas consultas, las justas.`,
        tools,
        tool_choice: ultima ? { type: 'none' } : { type: 'auto' },
        messages: mensajes,
      } as Anthropic.Beta.MessageCreateParamsNonStreaming,
      { signal: AbortSignal.timeout(Math.max(10_000, quedan())) },
    )
    texto = r.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim() || texto
    if (r.stop_reason === 'pause_turn') {
      mensajes.push({ role: 'assistant', content: r.content })
      continue
    }
    const usos = r.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
    if (r.stop_reason === 'tool_use' && usos.length && !ultima) {
      mensajes.push({ role: 'assistant', content: r.content })
      const resultados = await Promise.all(
        usos.map(async (u): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
          try {
            // Solo lectura: ejecutar() sin memoria ni acciones
            const salida = await ejecutar(ctx.hub, null as never, null as never, u.name, u.input as Fila)
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
  if (!texto) throw new Error('El agente no llegó a terminar a tiempo.')
  return texto
}

/** Separa "RESUMEN: …" (primera línea) del resto del texto. */
export function separarResumen(texto: string): { resumen: string; contenido: string } {
  const m = texto.match(/^\s*RESUMEN:\s*(.+?)\n+([\s\S]*)$/i)
  if (m) return { resumen: m[1].trim(), contenido: m[2].trim() }
  const primera = texto.split('\n').find((l) => l.trim()) ?? ''
  return { resumen: primera.slice(0, 280), contenido: texto }
}

/** Totales de una cotización (en su moneda); el descuento aplica a la implementación */
export function totales(c: Fila): { impl: number; mes: number } {
  let impl = 0
  let mes = 0
  for (const it of (c.cotizacion_items as Fila[]) ?? []) {
    if (it.opcional) continue // los ítems opcionales no suman al total
    impl += Number(it.cantidad) * Number(it.precio_implementacion)
    mes += Number(it.cantidad) * Number(it.precio_mensual)
  }
  return { impl: impl * (1 - Number(c.descuento_pct ?? 0) / 100), mes }
}

export const nombreCliente = (p: Fila | undefined | null) => (p ? String(p.empresa || p.nombre || 'Sin nombre') : 'Sin cliente')
