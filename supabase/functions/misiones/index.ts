// Edge Function "misiones": Jarvis divide un pedido grande entre varios agentes que trabajan en paralelo.
//
// Pedidos (POST JSON, con la sesión del socio):
//   { accion: "crear", pedido }   → crea la misión y la corre en segundo plano → { id }
//   { accion: "correr", id }      → corre una misión ya creada (la usa la función "asistente") → { ok }
//   { accion: "cancelar", id }    → la frena (los agentes cortan en la próxima vuelta) → { ok }
// El avance queda en jarvis_misiones / jarvis_agentes: el hub lo lee mientras trabaja.
// Usa ANTHROPIC_API_KEY (el mismo secret que las otras funciones).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { Motor } from './motor.ts'

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined

const URL_SUPABASE = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(URL_SUPABASE, SERVICE, { auth: { persistSession: false } })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

async function socio(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization')
  if (!auth) return null
  const cliente = createClient(URL_SUPABASE, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
  const [{ data: ok, error }, { data: user }] = await Promise.all([cliente.rpc('es_miembro'), cliente.auth.getUser()])
  return !error && ok === true ? (user.user?.email ?? null) : null
}

/** Corre la misión después de responder (el hub no espera). */
function enSegundoPlano(id: string, pedido: string) {
  const trabajo = new Motor(admin, id).correr(pedido)
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(trabajo)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
  const email = await socio(req)
  if (!email) return json({ error: 'No autorizado' }, 401)
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return json({ error: 'Falta cargar la clave de Anthropic.', falta: 'anthropic' }, 503)

  let body: { accion?: string; pedido?: unknown; id?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Pedido inválido' }, 400)
  }

  if (body.accion === 'crear') {
    const pedido = typeof body.pedido === 'string' ? Array.from(body.pedido.trim()).slice(0, 2000).join('') : ''
    if (!pedido) return json({ error: 'Falta el pedido.' }, 400)
    const { data, error } = await admin.from('jarvis_misiones').insert({ usuario: email, pedido }).select('id').single()
    if (error) return json({ error: error.message }, 500)
    enSegundoPlano(data.id as string, pedido)
    return json({ id: data.id })
  }

  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return json({ error: 'Falta la misión.' }, 400)
  const { data: m } = await admin.from('jarvis_misiones').select('id, pedido, estado').eq('id', id).maybeSingle()
  if (!m) return json({ error: 'No existe esa misión.' }, 404)

  if (body.accion === 'correr') {
    if (m.estado !== 'planificando') return json({ ok: true, estado: m.estado })
    enSegundoPlano(id, m.pedido as string)
    return json({ ok: true })
  }
  if (body.accion === 'cancelar') {
    await admin.from('jarvis_misiones').update({ estado: 'cancelada' }).eq('id', id).in('estado', ['planificando', 'trabajando', 'combinando'])
    await admin.from('jarvis_agentes').update({ estado: 'error' }).eq('mision_id', id).in('estado', ['esperando', 'trabajando'])
    return json({ ok: true })
  }
  return json({ error: 'Acción desconocida' }, 400)
})
