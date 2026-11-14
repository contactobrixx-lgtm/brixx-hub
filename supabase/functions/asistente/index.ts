// Edge Function "asistente": el cerebro del asistente de voz del hub.
//
// Pedido (POST JSON, con la sesión del usuario):
//   { pregunta: string, historial?: { rol: "usuario" | "asistente", texto: string }[] }
// Respuesta: { respuesta: string, respuesta_voz: string, modelo: string, consultas: string[] }
//   respuesta: el texto completo para la pantalla; respuesta_voz: versión corta (≤600 caracteres) para leer en voz alta.
//
// Usa el secret ANTHROPIC_API_KEY (el mismo que la función "grabaciones").
// La clave nunca llega al navegador: todo pasa por acá.
import { createClient } from 'npm:@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0'
import { Hub } from './datos.ts'
import { responder, type Turno } from './cerebro.ts'

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
const MAX_TURNOS = 10

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

  let body: { pregunta?: unknown; historial?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Pedido inválido' }, 400)
  }
  const pregunta = typeof body.pregunta === 'string' ? body.pregunta.trim().slice(0, MAX_PREGUNTA) : ''
  if (!pregunta) return json({ error: 'Falta la pregunta' }, 400)
  const historial: Turno[] = Array.isArray(body.historial)
    ? (body.historial as Turno[])
        .filter((t) => (t?.rol === 'usuario' || t?.rol === 'asistente') && typeof t.texto === 'string' && t.texto.trim())
        .slice(-MAX_TURNOS)
        .map((t) => ({ rol: t.rol, texto: t.texto.slice(0, MAX_PREGUNTA) }))
    : []

  if (!Deno.env.get('ANTHROPIC_API_KEY')) {
    return json({ error: 'Falta cargar la clave de Anthropic (ANTHROPIC_API_KEY) en Supabase.', falta: 'anthropic' }, 503)
  }

  try {
    const hub = new Hub(admin) // consultas de solo lectura
    const panorama = await hub.panorama(usuario.nombre)
    const { respuesta, respuesta_voz, modelo, consultas } = await responder(hub, panorama, pregunta, historial)
    return json({ respuesta, respuesta_voz, modelo, consultas })
  } catch (e) {
    console.error('Error del asistente:', e)
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'La clave de Anthropic no es válida.' }, 502)
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'Anthropic está con mucho tráfico. Probá en unos segundos.' }, 503)
    if (e instanceof Anthropic.APIError) return json({ error: `Error de Anthropic (${e.status}).` }, 502)
    return json({ error: 'No pude armar la respuesta. Probá de nuevo.' }, 500)
  }
})
