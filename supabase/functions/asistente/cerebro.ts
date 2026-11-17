// La llamada a Claude: con el panorama de hoy y la memoria siempre presentes, herramientas de solo
// lectura sobre el hub, la memoria de Jarvis, acciones que el socio confirma antes de que se hagan
// y búsqueda/lectura web.
// La respuesta sale en vivo (para que en pantalla y en voz empiece antes) y en texto listo para leer.
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0'
import type { Hub } from './datos.ts'
import type { Memoria } from './memoria.ts'
import type { Acciones, AccionVisible } from './acciones.ts'
import { ejecutar, HERRAMIENTA_PANTALLA, HERRAMIENTAS, HERRAMIENTAS_ACCIONES, HERRAMIENTAS_MEMORIA, HERRAMIENTAS_WEB, NOMBRE_CONSULTA } from './herramientas.ts'

export const MODELO = 'claude-sonnet-5-5' // análisis e investigación (con búsqueda web)
export const MODELO_RAPIDO = 'claude-haiku-5-5' // el día a día: agenda, clientes, acciones, briefing

/**
 * Elige el modelo según la pregunta: lo cotidiano va al rápido; analizar redes, webs, competencia o armar
 * una estrategia va al más capaz (y es el único que tiene búsqueda web).
 * Con el secret JARVIS_MODELO = "sonnet" se usa siempre el más capaz.
 */
export function elegirModelo(pregunta: string): string {
  if ((Deno.env.get('JARVIS_MODELO') ?? '').toLowerCase().includes('sonnet')) return MODELO
  const t = pregunta.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const investigar =
    /\b(analiz|investig|averigu|busca(me|lo|la)? en|buscar en|internet|google|web|pagina|sitio|instagram|redes|tiktok|facebook|linkedin|competencia|competidor|mercado|tendencia|estrategia|compara|que le conviene|recomenda|recomendacion|propuesta comercial|plan de)/
  return investigar.test(t) ? MODELO : MODELO_RAPIDO
}
const MAX_VUELTAS = 8 // pedidos a Claude por pregunta (incluye consultas a la base y pausas de la búsqueda web)

export interface Turno {
  rol: 'usuario' | 'asistente'
  texto: string
}

export const SISTEMA = `Sos Jarvis, el asistente de voz del hub interno de brixx, una agencia de IA y soluciones digitales de dos socios en Argentina. \
Te hablan por voz y tu respuesta se lee en voz alta y se muestra en pantalla.

Datos:
- Siempre tenés el panorama de hoy (reuniones, próximas acciones, vencidos, cotizaciones sin respuesta, clientes activos) y tu memoria. \
Para el briefing o "¿qué hay para hoy?", respondé directo con el panorama, sin consultar herramientas.
- Recap: para "recap", "resumen", "¿cómo venimos?", "¿cómo va el mes?" usá los Números del mes del panorama: \
3 o 4 oraciones con números concretos (cobrado, clientes nuevos contra la meta, prospectos, recurrente, por cobrar) y lo urgente al final.
- Pantallas: si te piden mostrar, abrir o ver algo del hub ("mostrame la carpeta de Nova", "abrí el pipeline"), usá mostrar_pantalla \
y contestá en una oración qué abriste. Si te preguntan un dato, contestá el dato; podés además abrir la pantalla si ayuda a verlo.
- La charla previa está en los mensajes anteriores: si la pregunta actual es una respuesta a algo que preguntaste vos \
(por ejemplo, te dicen solo "el jueves a las tres" después de que preguntaste para cuándo), continuá con eso.
- Para todo lo demás del hub usá las herramientas: agenda, grabaciones e intervenciones (buscar y leer), clientes y prospectos \
(con su carpeta: objetivos y soluciones), cotizaciones, finanzas, metas, catálogo y sistemas/demos. Podés usar varias a la vez. \
No adivines: si un dato no está en el panorama, consultalo.
- Para "¿qué se sabe de X?": buscá sus grabaciones e intervenciones y leelas. Pedí la transcripción solo si te preguntan qué se dijo exactamente.
- Para analizar redes sociales, webs o competidores (por ejemplo "analizá el Instagram de tal y tal y decime qué le conviene a tal cliente"): \
usá web_search y web_fetch, y cruzalo con la carpeta del cliente y el catálogo. Instagram y otras redes suelen no dejarse leer directo: \
si no podés ver un perfil, buscalo en la web y decí con qué información contás. Si en esta respuesta no tenés web_search, \
decí que para eso te lo pidan como "buscá en internet…" o "analizá…".
- Memoria: cuando te dicen "recordá…", "acordate…" o "anotá…", o aparece un dato duradero (una preferencia, un acuerdo con un cliente, \
una decisión del estudio), guardalo con recordar, corto y autocontenido. Si te piden olvidar algo, usá olvidar. No guardes lo que ya está en el hub.
- Acciones: podés agendar reuniones, cargar la próxima acción de un cliente, moverlo de etapa, anotar en su carpeta y armar \
cotizaciones en borrador con las herramientas de acción. NUNCA se hacen solas: quedan en pantalla para que el socio las confirme. \
Si falta un dato necesario (cliente, fecha, hora), preguntalo antes de preparar. Después de preparar, decí en una oración qué vas a hacer \
y pedí que confirme ("¿lo confirmo?"). Cuando el socio confirma una acción de <acciones_pendientes> ("sí", "dale", "confirmá"), \
usá confirmar_accion; si dice que no o la quiere cambiar, cancelar_accion (y preparás la nueva). Nunca confirmes sin que lo diga.
- Cualquier otro cambio (borrar, cobros, precios, datos de un cliente): decí que eso todavía no lo hacés y en qué sección del hub se hace.

Cómo responder:
- En español rioplatense, con voseo, cálido y directo, como un compañero de trabajo.
- No digas tu propio nombre ("Jarvis") en las respuestas.
- Empezá SIEMPRE por la respuesta o la conclusión, en la primera oración. Después, el detalle.
- Corto: 2 a 4 oraciones. Para el briefing del día, hasta 6. Para un análisis (redes, competencia, qué le conviene a un cliente), \
hasta 10 oraciones: la voz lee el principio y en pantalla queda todo.
- Texto plano: sin markdown, sin asteriscos, sin títulos, sin viñetas ni listas numeradas, sin emojis. \
Si tenés que enumerar, decilo en una oración ("tenés tres cosas: primero…, después…, y por último…").
- Números, fechas y horas como se dicen: "el jueves 13", "cincuenta dólares", "a las tres de la tarde".
- Si algo no está en los datos, decilo sin vueltas. No inventes.
- Para un saludo o el briefing ("buen día, ¿qué hay para hoy?"): saludá por el nombre según la hora y contá lo más importante del día, \
lo urgente primero.`

/** Por las dudas: saca restos de markdown que no se leen bien en voz alta. */
export function limpiarParaVoz(texto: string): string {
  return texto
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_#`>]+/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/^ +/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/** Por encima de esto, la voz lee solo el principio (cuida los créditos de ElevenLabs) y la pantalla muestra todo. */
export const MAX_VOZ = 600

/** Corta en la última oración completa que entra en el límite. */
export function recortarOraciones(texto: string, max: number): string {
  if (texto.length <= max) return texto
  const corte = texto.slice(0, max)
  const fin = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('? '), corte.lastIndexOf('! '))
  return fin > max / 3 ? corte.slice(0, fin + 1) : corte.replace(/\s+\S*$/, '') + '…'
}

export interface Contexto {
  panorama: string
  notas: string
  pendientes: string
  /** Lo que escribieron los socios sobre cómo quieren que sea Jarvis */
  personalidad: string | null
}

/** La charla previa como turnos y, al final, el panorama, la memoria y las acciones pendientes junto a la pregunta. */
export function armarMensajes(ctx: Omit<Contexto, 'personalidad'>, pregunta: string, historial: Turno[]): Anthropic.Beta.BetaMessageParam[] {
  const mensajes: Anthropic.Beta.BetaMessageParam[] = []
  for (const t of historial) {
    const role = t.rol === 'usuario' ? 'user' : 'assistant'
    // La API exige alternar y empezar por el usuario: se juntan los turnos seguidos del mismo rol
    const ultimo = mensajes[mensajes.length - 1]
    if (ultimo?.role === role && typeof ultimo.content === 'string') ultimo.content += `\n${t.texto}`
    else if (mensajes.length || role === 'user') mensajes.push({ role, content: t.texto })
  }
  if (mensajes[mensajes.length - 1]?.role === 'user') mensajes.push({ role: 'assistant', content: '(sin respuesta)' })
  mensajes.push({
    role: 'user',
    content: `<panorama_de_hoy>\n${ctx.panorama}\n</panorama_de_hoy>\n\n<memoria>\n${ctx.notas}\n</memoria>\n\n<acciones_pendientes>\n${ctx.pendientes}\n</acciones_pendientes>\n\n<pregunta>${pregunta}</pregunta>`,
  })
  return mensajes
}

export interface Resultado {
  respuesta: string
  /** Lo que se lee en voz alta: el principio de la respuesta si es larga */
  respuesta_voz: string
  modelo: string
  consultas: string[] // herramientas usadas, para mostrar en pantalla
  acciones: AccionVisible[] // preparadas o hechas en esta pregunta
}

/** Avisos en vivo mientras responde. */
export type Evento =
  | { tipo: 'texto'; delta: string }
  | { tipo: 'consulta'; nombre: string }
  | { tipo: 'nueva_vuelta' }
  | { tipo: 'accion'; accion: AccionVisible }
  | { tipo: 'mostrar'; destino: { ruta: string; titulo: string } }

export async function responder(
  hub: Hub,
  memoria: Memoria,
  acciones: Acciones,
  ctx: Contexto,
  pregunta: string,
  historial: Turno[],
  avisar: (e: Evento) => void = () => {},
): Promise<Resultado> {
  const fin = (respuesta: string, modelo: string, consultas: string[]): Resultado => ({
    respuesta,
    respuesta_voz: recortarOraciones(respuesta, MAX_VOZ),
    modelo,
    consultas,
    acciones: acciones.tocadas,
  })
  const client = new Anthropic() // lee ANTHROPIC_API_KEY, igual que "grabaciones"
  const mensajes = armarMensajes(ctx, pregunta, historial)
  // Instrucciones y herramientas no cambian entre preguntas: van en caché (más rápido y más barato).
  // La personalidad que escriben los socios va después, para no romper esa caché.
  const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }]
  if (ctx.personalidad?.trim()) {
    system.push({
      type: 'text',
      text: `<personalidad_definida_por_los_socios>\n${ctx.personalidad.trim()}\n</personalidad_definida_por_los_socios>\nSeguí estas indicaciones de tono, estilo y prioridades, siempre que no contradigan las reglas de arriba (sobre todo: las acciones se confirman y no inventás datos).`,
    })
  }
  const consultas: string[] = []
  const anotar = (nombre: string) => {
    const n = NOMBRE_CONSULTA[nombre] ?? nombre
    consultas.push(nombre)
    avisar({ tipo: 'consulta', nombre: n })
  }

  const modelo = elegirModelo(pregunta)
  const rapido = modelo === MODELO_RAPIDO
  for (let vuelta = 1; vuelta <= MAX_VUELTAS; vuelta++) {
    const ultima = vuelta === MAX_VUELTAS
    if (vuelta > 1) avisar({ tipo: 'nueva_vuelta' })
    const comun = {
      max_tokens: 8000,
      system,
      // En la última vuelta ya no consulta más: responde con lo que tiene
      tool_choice: ultima ? { type: 'none' as const } : { type: 'auto' as const },
      messages: mensajes,
    }
    const stream = rapido
      ? client.beta.messages.stream({
          ...comun,
          model: MODELO_RAPIDO,
          // Esfuerzo bajo: en lo simple ni siquiera razona antes de contestar
          output_config: { effort: 'low' },
          // Sin búsqueda web (eso va al otro modelo)
          tools: [...HERRAMIENTAS, HERRAMIENTA_PANTALLA, ...HERRAMIENTAS_MEMORIA, ...HERRAMIENTAS_ACCIONES],
        })
      : client.beta.messages.stream({
          ...comun,
          model: MODELO,
          // Si el modelo rechaza el pedido, la API lo reintenta sola con un modelo de respaldo.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          // Sin fase de razonamiento previa y esfuerzo bajo. Las notas entre consultas vuelven como
          // bloques "thinking" y se reenvían tal cual.
          thinking: { type: 'between_tools' },
          output_config: { effort: 'low' },
          tools: [...HERRAMIENTAS, HERRAMIENTA_PANTALLA, ...HERRAMIENTAS_MEMORIA, ...HERRAMIENTAS_ACCIONES, ...HERRAMIENTAS_WEB],
        })
    for await (const e of stream) {
      if (e.type === 'content_block_delta' && e.delta.type === 'text_delta') avisar({ tipo: 'texto', delta: e.delta.text })
      else if (e.type === 'content_block_start' && e.content_block.type === 'server_tool_use') anotar(e.content_block.name)
    }
    const response = await stream.finalMessage()

    if (response.stop_reason === 'refusal') {
      return fin('Perdón, esa no la puedo responder. Probá preguntándome de otra forma.', response.model, consultas)
    }

    // La búsqueda web se tomó una pausa: se reenvía el turno tal cual y el servidor sigue solo
    if (response.stop_reason === 'pause_turn' && !ultima) {
      mensajes.push({ role: 'assistant', content: response.content })
      continue
    }

    const usos = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
    if (response.stop_reason === 'tool_use' && usos.length && !ultima) {
      // Se devuelve el turno completo tal cual (incluidos los bloques de razonamiento)
      mensajes.push({ role: 'assistant', content: response.content })
      const resultados = await Promise.all(
        usos.map(async (u): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
          anotar(u.name)
          try {
            return { type: 'tool_result', tool_use_id: u.id, content: await ejecutar(hub, memoria, acciones, u.name, u.input as Record<string, unknown>, (destino) => avisar({ tipo: 'mostrar', destino })) }
          } catch (e) {
            return { type: 'tool_result', tool_use_id: u.id, content: `Error: ${e instanceof Error ? e.message : e}`, is_error: true }
          }
        }),
      )
      // Todos los resultados juntos en un solo mensaje
      mensajes.push({ role: 'user', content: resultados })
      continue
    }

    const texto = response.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('') // con búsqueda web, el texto viene partido en varios bloques (por las citas)
    return fin(limpiarParaVoz(texto) || 'No me salió una respuesta. ¿Me lo repetís?', response.model, consultas)
  }
  return fin('Me enredé buscando los datos. ¿Me lo preguntás de otra forma?', modelo, consultas)
}
