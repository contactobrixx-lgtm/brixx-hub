// Edge Function "grabaciones": transcribe (AssemblyAI) y analiza (Claude) las grabaciones de reuniones
// y las intervenciones con clientes (audio subido, texto pegado y/o links).
//
// Pedidos desde el hub (POST JSON, con la sesión del usuario):
//   { accion: "config" }                    → qué claves están cargadas
//   { accion: "procesar", id }               → manda el audio a transcribir (un texto pasa directo al análisis)
//   { accion: "actualizar", id }             → consulta si la transcripción terminó (respaldo del webhook)
//   { accion: "analizar", id }               → (re)hace el análisis con Claude
//   { accion: "sintesis", prospecto_id }     → (re)arma el resumen de la carpeta del cliente
//
// Reuniones: resumen, puntos clave y propuesta (analisis.ts).
// Intervenciones (origen "audio" o "texto"): dolores, cuellos de botella, soluciones y propuesta para mandar
// (intervencion.ts); si el cliente no tiene carpeta, se crea. Después de cada análisis con cliente se
// actualiza la síntesis de su carpeta (sintesis.ts).
// Aviso de AssemblyAI cuando termina: POST ?webhook=1&id=<grabación>, con header x-brixx-token.
//
// Claves (Supabase → Edge Functions → Secrets): ASSEMBLYAI_API_KEY, ANTHROPIC_API_KEY.
// SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY las pone Supabase solo.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { assemblyConfigurado, consultarTranscripcion, enviarATranscribir, type ResultadoTranscripcion } from './transcripcion.ts'
import { analizar, claudeConfigurado, MODELO } from './analisis.ts'
import { analizarIntervencion, carpetaDelCliente, linksDeUrls } from './intervencion.ts'
import { sintetizarYGuardar } from './sintesis.ts'
import { pedirVideosAutomaticos } from '../videos/auto.ts'

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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

/** Corre trabajo largo después de responder (el webhook y el hub no esperan). */
function enSegundoPlano(p: Promise<unknown>) {
  const conLog = p.catch((e) => console.error('Error en segundo plano:', e))
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(conLog)
}

async function firma(id: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SERVICE), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`grabacion:${id}`))
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function actualizarFila(id: string, cambios: Record<string, unknown>) {
  const { error } = await admin.from('grabaciones').update(cambios).eq('id', id)
  if (error) throw new Error(`No se pudo guardar: ${error.message}`)
}

async function cargar(id: string) {
  const { data, error } = await admin.from('grabaciones').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No existe la grabación.')
  return data
}

// ---------------------------------------------------------------------------

async function procesar(id: string) {
  const g = await cargar(id)
  // Intervención de solo texto: no hay nada que transcribir, el texto es el material
  if (g.origen === 'texto') {
    const texto = String(g.texto_original ?? '').trim()
    if (!texto && !(g.urls ?? []).length) throw new Error('La intervención no tiene texto ni links.')
    const segmentos = texto ? [{ hablante: 'A', inicio_ms: 0, fin_ms: 0, texto }] : []
    if (!claudeConfigurado()) {
      await actualizarFila(id, { segmentos, estado: 'pendiente', error: null })
      return { estado: 'pendiente', falta: 'anthropic' }
    }
    await actualizarFila(id, { segmentos, estado: 'analizando', error: null })
    enSegundoPlano(analizarGrabacion(id))
    return { estado: 'analizando' }
  }
  if (!g.audio_path) throw new Error('La grabación no tiene audio (¿se borró a los 90 días?).')
  if (!assemblyConfigurado()) {
    await actualizarFila(id, { estado: 'pendiente', error: null })
    return { estado: 'pendiente', falta: 'assemblyai' }
  }
  const { data: firmada, error } = await admin.storage.from('grabaciones').createSignedUrl(g.audio_path, 60 * 60 * 24)
  if (error || !firmada) throw new Error(`No se pudo leer el audio: ${error?.message}`)

  const proveedorId = await enviarATranscribir({
    audioUrl: firmada.signedUrl,
    webhookUrl: `${URL_SUPABASE}/functions/v1/grabaciones?webhook=1&id=${encodeURIComponent(id)}`,
    webhookHeader: { nombre: 'x-brixx-token', valor: await firma(id) },
  })
  await actualizarFila(id, { estado: 'transcribiendo', proveedor_id: proveedorId, error: null })
  return { estado: 'transcribiendo' }
}

async function guardarTranscripcion(id: string, r: ResultadoTranscripcion) {
  if (r.estado === 'procesando') return 'transcribiendo'
  if (r.estado === 'error') {
    await actualizarFila(id, { estado: 'error', error: r.error })
    return 'error'
  }
  const siguiente = claudeConfigurado() ? 'analizando' : 'lista'
  await actualizarFila(id, { segmentos: r.segmentos, duracion_seg: r.duracion_seg, estado: siguiente, error: null })
  if (siguiente === 'analizando') await analizarGrabacion(id)
  return siguiente
}

async function actualizar(id: string) {
  const g = await cargar(id)
  if (g.estado !== 'transcribiendo' || !g.proveedor_id) return { estado: g.estado }
  if (!assemblyConfigurado()) return { estado: g.estado, falta: 'assemblyai' }
  const r = await consultarTranscripcion(g.proveedor_id)
  if (r.estado === 'lista' && claudeConfigurado()) {
    // Guardar la transcripción ya, y analizar en segundo plano.
    await actualizarFila(id, { segmentos: r.segmentos, duracion_seg: r.duracion_seg, estado: 'analizando', error: null })
    enSegundoPlano(analizarGrabacion(id))
    return { estado: 'analizando' }
  }
  return { estado: await guardarTranscripcion(id, r) }
}

/** Re-arma la síntesis de la carpeta del cliente (si falla, no rompe el análisis que ya se guardó). */
async function actualizarSintesis(prospectoId: string | null) {
  if (!prospectoId) return
  try {
    await sintetizarYGuardar(admin, prospectoId)
  } catch (e) {
    console.error('No se pudo actualizar la síntesis del cliente:', e)
  }
}

async function analizarGrabacion(id: string) {
  const g = await cargar(id)
  if (g.origen === 'audio' || g.origen === 'texto') return await analizarComoIntervencion(g)
  if (!g.segmentos?.length) {
    await actualizarFila(id, { estado: 'error', error: 'La transcripción salió vacía: no hay nada para analizar.' })
    return
  }
  try {
    let prospectoId: string | null = g.prospecto_id
    let fecha: string = String(g.created_at).slice(0, 10)
    if (g.reunion_id) {
      const { data: r } = await admin.from('reuniones').select('inicio, prospecto_id').eq('id', g.reunion_id).maybeSingle()
      if (r) {
        fecha = String(r.inicio).slice(0, 10)
        prospectoId = prospectoId ?? r.prospecto_id
      }
    }
    const { data: prospecto } = prospectoId
      ? await admin.from('prospectos').select('nombre, empresa, rubro, etapa, notas').eq('id', prospectoId).maybeSingle()
      : { data: null }
    const { data: servicios } = await admin
      .from('servicios')
      .select('id, nombre, descripcion, precio_implementacion, precio_mensual')
      .eq('activo', true)
      .order('orden')

    const { analisis, modelo } = await analizar({
      titulo: g.titulo,
      fecha,
      segmentos: g.segmentos,
      hablantes: g.hablantes ?? {},
      servicios: servicios ?? [],
      prospecto: prospecto ?? null,
    })
    await actualizarFila(id, { analisis, modelo, estado: 'lista', error: null })
    await actualizarSintesis(prospectoId)
    // Videos para el cliente y para nosotros (si están prendidos en el hub y la reunión es de un cliente)
    if (prospectoId) await pedirVideosAutomaticos(id)
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e)
    await actualizarFila(id, { estado: 'error', error: `No se pudo analizar con Claude: ${mensaje}` })
  }
}

// deno-lint-ignore no-explicit-any
async function analizarComoIntervencion(g: any) {
  const id = g.id as string
  const urls = (g.urls ?? []) as string[]
  if (!g.segmentos?.length && !String(g.texto_original ?? '').trim() && !urls.length) {
    await actualizarFila(id, { estado: 'error', error: 'La intervención salió vacía: no hay nada para analizar.' })
    return
  }
  try {
    const [{ data: prospecto }, { data: servicios }] = await Promise.all([
      g.prospecto_id
        ? admin.from('prospectos').select('nombre, empresa, rubro, etapa, notas').eq('id', g.prospecto_id).maybeSingle()
        : Promise.resolve({ data: null }),
      admin.from('servicios').select('id, nombre, descripcion, precio_implementacion, precio_mensual').eq('activo', true).order('orden'),
    ])
    const { analisis, modelo } = await analizarIntervencion({
      fecha: String(g.created_at).slice(0, 10),
      titulo: g.titulo,
      segmentos: g.segmentos ?? null,
      texto: g.texto_original ?? null,
      urls,
      servicios: servicios ?? [],
      prospecto: prospecto ?? null,
    })
    // Carpeta del cliente: la elegida, una que coincida o una nueva. Los links cargados completan Instagram y web.
    const c = (analisis.cliente ?? {}) as Record<string, string | null>
    const links = linksDeUrls(urls)
    const carpeta = await carpetaDelCliente(admin, g.prospecto_id ?? null, {
      nombre: c.nombre ?? null,
      empresa: c.empresa ?? null,
      email: c.email ?? null,
      telefono: c.telefono ?? null,
      instagram: links.instagram ?? c.instagram ?? null,
      web: links.web ?? c.web ?? null,
      rubro: c.rubro ?? null,
      industria: c.industria ?? null,
    })
    await actualizarFila(id, {
      analisis: { ...analisis, carpeta_creada: carpeta.creado },
      modelo,
      prospecto_id: carpeta.id,
      estado: 'lista',
      error: null,
    })
    await actualizarSintesis(carpeta.id)
    await pedirVideosAutomaticos(id)
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e)
    await actualizarFila(id, { estado: 'error', error: `No se pudo analizar con Claude: ${mensaje}` })
  }
}

async function pedirAnalisis(id: string) {
  if (!claudeConfigurado()) return { estado: 'lista', falta: 'anthropic' }
  const g = await cargar(id)
  if (g.origen === 'texto') return await procesar(id)
  if (!g.segmentos?.length) throw new Error('Primero hay que transcribir la grabación.')
  await actualizarFila(id, { estado: 'analizando', error: null })
  enSegundoPlano(analizarGrabacion(id))
  return { estado: 'analizando' }
}

// ---------------------------------------------------------------------------

async function esMiembro(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization')
  if (!auth) return false
  const cliente = createClient(URL_SUPABASE, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
  const { data, error } = await cliente.rpc('es_miembro')
  return !error && data === true
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
  const url = new URL(req.url)

  // Aviso de AssemblyAI
  if (url.searchParams.get('webhook')) {
    const id = url.searchParams.get('id') ?? ''
    if (!id || req.headers.get('x-brixx-token') !== (await firma(id))) return json({ error: 'No autorizado' }, 401)
    enSegundoPlano(
      (async () => {
        const g = await cargar(id)
        if (g.estado === 'transcribiendo' && g.proveedor_id) await guardarTranscripcion(id, await consultarTranscripcion(g.proveedor_id))
      })(),
    )
    return json({ ok: true })
  }

  let body: { accion?: string; id?: string; prospecto_id?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Pedido inválido' }, 400)
  }
  // El conector de Claude (función "conector") pide procesar la intervención que acaba de cargar,
  // firmado con la clave del servidor y solo para ese id.
  const delConector =
    body.accion === 'procesar' && !!body.id && req.headers.get('x-brixx-token') === (await firma(body.id))
  if (!delConector && !(await esMiembro(req))) return json({ error: 'No autorizado' }, 401)

  try {
    switch (body.accion) {
      case 'config':
        return json({ assemblyai: assemblyConfigurado(), anthropic: claudeConfigurado(), modelo: MODELO })
      case 'procesar':
        return json(await procesar(body.id!))
      case 'actualizar':
        return json(await actualizar(body.id!))
      case 'analizar':
        return json(await pedirAnalisis(body.id!))
      case 'sintesis': {
        if (!claudeConfigurado()) return json({ error: 'Falta cargar la clave de Anthropic.', falta: 'anthropic' }, 503)
        if (!body.prospecto_id) return json({ error: 'Falta el cliente.' }, 400)
        return json({ sintesis: await sintetizarYGuardar(admin, body.prospecto_id) })
      }
      default:
        return json({ error: 'Acción desconocida' }, 400)
    }
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e)
    if (body.id) await actualizarFila(body.id, { estado: 'error', error: mensaje }).catch(() => {})
    return json({ error: mensaje }, 500)
  }
})
