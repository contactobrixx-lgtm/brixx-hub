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
// Precalentar (al abrir Jarvis, para que la primera pregunta no espere el arranque en frío):
//   { accion: "calentar" } → { ok: true }   (no lee ningún dato, no hace falta sesión)
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
  // En paralelo: cada consulta es un viaje a la base
  const [{ data: esMiembro, error }, { data: user }] = await Promise.all([cliente.rpc('es_miembro'), cliente.auth.getUser()])
  if (error || esMiembro !== true) return null
  const email = user.user?.email ?? ''
  const { data: m } = await admin.from('miembros').select('nombre').ilike('email', email).maybeSingle()
  return { email, nombre: (m?.nombre as string) ?? email }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
  const t0 = Date.now()
  const recibida = new Date()

  let body: { pregunta?: unknown; stream?: unknown; accion?: unknown; id?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Pedido inválido' }, 400)
  }
  // Solo despierta la función: no lee datos
  if (body.accion === 'calentar') return json({ ok: true })

  const usuario = await usuarioMiembro(req)
  if (!usuario) return json({ error: 'No autorizado' }, 401)
  const tAuth = Date.now() - t0

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

  /** Arma todo el contexto en paralelo y responde. Devuelve también cuánto tardó cada parte. */
  const correr = async (avisarAfuera?: (e: Evento) => void): Promise<Resultado & { tiempos: Record<string, number> }> => {
    let primeraPalabra = 0
    const avisar = (e: Evento) => {
      if (e.tipo === 'texto' && !primeraPalabra) primeraPalabra = Date.now() - t0
      avisarAfuera?.(e)
    }
    const acciones = new Acciones(admin, hub, usuario, (accion: AccionVisible) => avisar({ tipo: 'accion', accion }))
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
    const tContexto = Date.now() - t0
    // Misión: se crea acá y la corre la función "misiones" en segundo plano (con la misma sesión del socio)
    const lanzarMision = async (pedidoMision: string): Promise<string> => {
      const pedidoLimpio = pedidoMision.trim().slice(0, 2000)
      if (!pedidoLimpio) throw new Error('Falta el pedido de la misión.')
      const { data, error } = await admin.from('jarvis_misiones').insert({ usuario: usuario.email, pedido: pedidoLimpio }).select('id').single()
      if (error) throw new Error(`No se pudo crear la misión: ${error.message}`)
      const res = await fetch(`${URL_SUPABASE}/functions/v1/misiones`, {
        method: 'POST',
        headers: { Authorization: req.headers.get('Authorization') ?? '', apikey: ANON, 'content-type': 'application/json' },
        body: JSON.stringify({ accion: 'correr', id: data.id }),
      })
      if (!res.ok) {
        await admin.from('jarvis_misiones').update({ estado: 'error', error: `No arrancó (${res.status}).` }).eq('id', data.id)
        throw new Error('No pude arrancar la misión (¿está publicada la función "misiones"?).')
      }
      return data.id as string
    }
    const r = await responder(hub, memoria, acciones, { panorama, notas, pendientes, personalidad }, pregunta, historial, avisar, lanzarMision)
    const tiempos = { sesion_ms: tAuth, contexto_ms: tContexto, primera_palabra_ms: primeraPalabra, total_ms: Date.now() - t0, consultas: r.consultas.length }
    console.log('Tiempos de Jarvis:', JSON.stringify(tiempos)) // visible en Supabase → Edge Functions → asistente → Logs
    return { ...r, tiempos }
  }
  /** La charla se guarda después de responder: no hace esperar a nadie. */
  const guardar = (r: Resultado) => memoria.guardarTurno(pregunta, r.respuesta, r.consultas, recibida)

  if (body.stream !== true) {
    try {
      const r = await correr()
      await guardar(r)
      return json(r)
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
        await guardar(r)
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
