// Edge Function "asistente": el cerebro del asistente de voz del hub.
//
// Pedido (POST JSON, con la sesión del usuario):
//   { pregunta: string, stream?: boolean }
// Respuesta: { respuesta, respuesta_voz, modelo, consultas }
//   respuesta: el texto completo para la pantalla; respuesta_voz: el principio (≤600 caracteres) para leer en voz alta.
// Con stream: true responde en vivo (text/event-stream), una línea "data: {json}" por evento:
//   { tipo: "texto", delta } · { tipo: "consulta", nombre } · { tipo: "nueva_vuelta" } (descartar el texto parcial)
//   { tipo: "accion", accion: { id, tipo, resumen, estado, resultado?, link? } } (preparada, hecha o cancelada)
//   { tipo: "fin", respuesta, respuesta_voz, modelo, consultas, acciones } · { tipo: "error", error }
// Botones de las acciones (sin pasar por Claude):
//   { accion: "confirmar", id } → { accion: {…} }   ·   { accion: "cancelar", id } → { mensaje }
// Las acciones sobre el hub (agendar, próxima acción, etapa, nota, cotización en borrador) se ejecutan
// recién cuando el socio las confirma.
// La conversación se guarda en asistente_mensajes (la memoria de lo que se habló) y Jarvis puede guardar
// notas en jarvis_memoria. Del resto del hub, solo lee.
//
// Usa el secret ANTHROPIC_API_KEY (el mismo que la función "grabaciones").
// La clave nunca llega al navegador: todo pasa por acá.
import { createClient } from 'npm:@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0'
import { Hub } from './datos.ts'
import { Memoria } from './memoria.ts'
import { Acciones, type AccionVisible } from './acciones.ts'
import { responder, type Evento, type Resultado } from './cerebro.ts'

const URL_SUPABASE = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(URL_SUPABASE, SERVICE, { auth: { persistSession: false } })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

const MAX_PREGUNTA = 2000

async function usuarioMiembro(req: Request): Promise<{ email: string; nombre: string } | null> {
  const auth = req.headers.get('Authorization')
  if (!auth) return null
  const cliente = createClient(URL_SUPABASE, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
  const { data: esMiembro, error } = await cliente.rpc('es_miembro')
  if (error || esMiembro !== true) return null
  const { data: user } = await cliente.auth.getUser()
  const email = user.user?.email ?? ''
  const { data: m } = await admin.from('miembros').select('nombre').ilike('email', email).maybeSingle()
  return { email, nombre: (m?.nombre as string) ?? email }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const usuario = await usuarioMiembro(req)
  if (!usuario) return json({ error: 'No autorizado' }, 401)

  let body: { pregunta?: unknown; stream?: unknown; accion?: unknown; id?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Pedido inválido' }, 400)
  }

  // Confirmar o cancelar una acción con el botón
  if (body.accion === 'confirmar' || body.accion === 'cancelar') {
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) return json({ error: 'Falta la acción.' }, 400)
    const acciones = new Acciones(admin, new Hub(admin), usuario)
    try {
      if (body.accion === 'cancelar') return json({ mensaje: await acciones.cancelar(id) })
      return json({ accion: await acciones.confirmar(id) })
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'No se pudo.' }, 400)
    }
  }

  const pregunta = typeof body.pregunta === 'string' ? body.pregunta.trim().slice(0, MAX_PREGUNTA) : ''
  if (!pregunta) return json({ error: 'Falta la pregunta' }, 400)

  if (!Deno.env.get('ANTHROPIC_API_KEY')) {
    return json({ error: 'Falta cargar la clave de Anthropic (ANTHROPIC_API_KEY) en Supabase.', falta: 'anthropic' }, 503)
  }

  const hub = new Hub(admin) // consultas de solo lectura
  const memoria = new Memoria(admin, usuario)

  /** Arma todo el contexto en paralelo, responde y guarda la charla. */
  const correr = async (avisar?: (e: Evento) => void): Promise<Resultado> => {
    const acciones = new Acciones(admin, hub, usuario, (accion: AccionVisible) => avisar?.({ tipo: 'accion', accion }))
    const [panorama, notas, historial, pendientes, personalidad] = await Promise.all([
      hub.panorama(usuario.nombre),
      memoria.notas(),
      memoria.historial(),
      acciones.pendientes(),
      admin
        .from('ajustes')
        .select('*')
        .maybeSingle()
        .then(({ data }) => (data?.jarvis_personalidad as string | null) ?? null),
    ])
    const r = await responder(hub, memoria, acciones, { panorama, notas, pendientes, personalidad }, pregunta, historial, avisar)
    await memoria.guardarTurno(pregunta, r.respuesta, r.consultas)
    return r
  }

  if (body.stream !== true) {
    try {
      return json(await correr())
    } catch (e) {
      const { mensaje, status } = errorLegible(e)
      return json({ error: mensaje }, status)
    }
  }

  // En vivo: la pantalla y la voz arrancan con la primera oración
  const codificar = new TextEncoder()
  const cuerpo = new ReadableStream({
    async start(control) {
      const enviar = (e: unknown) => control.enqueue(codificar.encode(`data: ${JSON.stringify(e)}\n\n`))
      try {
        const r = await correr(enviar)
        enviar({ tipo: 'fin', ...r })
      } catch (e) {
        enviar({ tipo: 'error', error: errorLegible(e).mensaje })
      } finally {
        control.close()
      }
    },
  })
  return new Response(cuerpo, {
    headers: { ...CORS, 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' },
  })
})

function errorLegible(e: unknown): { mensaje: string; status: number } {
  console.error('Error del asistente:', e)
  if (e instanceof Anthropic.AuthenticationError) return { mensaje: 'La clave de Anthropic no es válida.', status: 502 }
  if (e instanceof Anthropic.RateLimitError) return { mensaje: 'Anthropic está con mucho tráfico. Probá en unos segundos.', status: 503 }
  if (e instanceof Anthropic.APIError) return { mensaje: `Error de Anthropic (${e.status}).`, status: 502 }
  return { mensaje: 'No pude armar la respuesta. Probá de nuevo.', status: 500 }
}
