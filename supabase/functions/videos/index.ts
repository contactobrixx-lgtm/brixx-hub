// Edge Function "videos": arma un video explicativo para un cliente a partir de una reunión grabada o una
// intervención (audio o texto) ya analizada: Claude escribe el guion (escenas + voz en off) y ElevenLabs
// pone la voz. El hub lo dibuja en un lienzo y lo descarga como video (src/features/videos).
//
// Pedidos (POST JSON, con la sesión del socio):
//   { accion: "config" }                                        → { anthropic, elevenlabs }
//   { accion: "crear", grabacion_id?, prospecto_id?, enfoque? }  → crea el video y lo arma en segundo plano → { id }
//   { accion: "reintentar", id }                                 → si falló: rehace lo que faltó (guion y/o voz)
//   { accion: "video_propuesta", token }  (SIN sesión: la propuesta pública /p/<token>)
//                                           → { url } link temporal al MP4 guardado que va en esa propuesta, o { url: null }
//   { accion: "automatico", grabacion_id }  (solo con firma interna, la llama "grabaciones" al terminar un análisis)
//                                           → si ajustes.videos_automaticos, arma el video para el cliente y el interno
// enfoque: "cliente" (le habla al dueño del negocio, por defecto) | "equipo" (para que se lo muestre a los suyos)
//          | "interno" (para nosotros: qué armarle y cómo, paso a paso).
// El avance queda en la tabla videos (estado guion → voz → listo | error); el hub la relee mientras trabaja.
// Secrets: ANTHROPIC_API_KEY (obligatorio), ELEVENLABS_API_KEY (sin ella, el video sale sin voz),
// VIDEO_VOZ_ID (opcional: otra voz de ElevenLabs; por defecto "Fran").
import { createClient } from 'npm:@supabase/supabase-js@2'
import { armarMaterial } from '../grabaciones/sintesis.ts'
import { armarGuion, type Enfoque, type Guion } from './guion.ts'
import { estimar, vozConfigurada, vozDeEscenas } from './voz.ts'
import { cabecerasInternas, firmaInterna } from './auto.ts'

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined

const URL_SUPABASE = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(URL_SUPABASE, SERVICE, { auth: { persistSession: false } })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-brixx-interno',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })
const claudeConfigurado = () => Boolean(Deno.env.get('ANTHROPIC_API_KEY'))

function enSegundoPlano(p: Promise<unknown>) {
  const conLog = p.catch((e) => console.error('Error en segundo plano:', e))
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(conLog)
}

async function socio(req: Request): Promise<string | null> {
  const interno = req.headers.get('x-brixx-interno')
  if (interno) return interno === (await firmaInterna()) ? 'automático' : null
  const auth = req.headers.get('Authorization')
  if (!auth) return null
  const cliente = createClient(URL_SUPABASE, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
  const [{ data: ok, error }, { data: user }] = await Promise.all([cliente.rpc('es_miembro'), cliente.auth.getUser()])
  return !error && ok === true ? (user.user?.email ?? 'socio') : null
}

/** El MP4 guardado que va en la propuesta con ese token público (link temporal de 12 h), o null */
async function videoDePropuestaPublica(token: unknown): Promise<string | null> {
  if (typeof token !== 'string' || !/^[0-9a-f-]{36}$/i.test(token)) return null
  const { data: c } = await admin.from('cotizaciones').select('id').eq('token_publico', token).maybeSingle()
  if (!c) return null
  const { data: videoId } = await admin.rpc('video_de_cotizacion', { cot: c.id })
  if (!videoId) return null
  const { data: v } = await admin.from('videos').select('archivo_path').eq('id', videoId).maybeSingle()
  if (!v?.archivo_path) return null
  const { data } = await admin.storage.from('videos').createSignedUrl(v.archivo_path, 12 * 3600)
  return data?.signedUrl ?? null
}

async function guardar(id: string, cambios: Record<string, unknown>) {
  const { error } = await admin.from('videos').update(cambios).eq('id', id)
  if (error) throw new Error(`No se pudo guardar el video: ${error.message}`)
}

const recortar = (t: string, max: number) => (t.length > max ? `${t.slice(0, max)}…` : t)

/** Lo que Claude necesita: la carpeta del cliente (si hay) + la intervención o reunión de la que sale el video. */
async function material(prospectoId: string | null, grabacionId: string | null): Promise<string> {
  const partes: string[] = []
  if (prospectoId) partes.push((await armarMaterial(admin, prospectoId)).material)
  if (prospectoId) {
    const { data: p } = await admin.from('prospectos').select('sintesis').eq('id', prospectoId).maybeSingle()
    if (p?.sintesis) partes.push(`<sintesis_de_la_carpeta>\n${JSON.stringify(p.sintesis)}\n</sintesis_de_la_carpeta>`)
  }
  if (grabacionId) {
    const { data: g } = await admin.from('grabaciones').select('titulo, origen, created_at, analisis, segmentos, texto_original').eq('id', grabacionId).maybeSingle()
    if (g) {
      const transcripcion = ((g.segmentos ?? []) as { texto: string }[]).map((s) => s.texto).join(' ') || String(g.texto_original ?? '')
      partes.push(`<de_donde_sale_el_video>
${g.origen === 'reunion' ? 'Reunión grabada' : g.origen === 'audio' ? 'Audio del cliente' : 'Texto del cliente'} del ${String(g.created_at).slice(0, 10)}: "${g.titulo}"
Análisis: ${recortar(JSON.stringify(g.analisis ?? {}), 8000)}
Cómo habla el cliente (fragmento de la transcripción, para el tono y los casos reales): ${recortar(transcripcion, 4000)}
</de_donde_sale_el_video>`)
    }
  }
  return partes.join('\n\n')
}

/**
 * Arma todo lo que falte: guion (Claude) y voz (ElevenLabs). Si recién escribió el guion, la voz la hace otra llamada
 * a esta misma función (con la sesión del socio o la firma interna): cada llamada tiene su propio tope de tiempo.
 */
async function armar(id: string, cabeceras: Record<string, string> | null = null) {
  const { data: v, error } = await admin.from('videos').select('*').eq('id', id).maybeSingle()
  if (error || !v) throw new Error(error?.message ?? 'No existe el video.')
  const enfoque = (['cliente', 'equipo', 'interno'].includes(v.enfoque) ? v.enfoque : 'cliente') as Enfoque
  try {
    let guion = v.guion as Guion | null
    if (!guion) {
      await guardar(id, { estado: 'guion', error: null })
      const r = await armarGuion(await material(v.prospecto_id, v.grabacion_id), enfoque)
      guion = r.guion
      await guardar(id, { guion, titulo: Array.from(guion.titulo).slice(0, 140).join(''), estado: 'voz' })
      if (cabeceras && vozConfigurada()) {
        const r = await fetch(`${URL_SUPABASE}/functions/v1/videos`, {
          method: 'POST',
          headers: cabeceras,
          body: JSON.stringify({ accion: 'reintentar', id }),
        }).catch(() => null)
        if (r?.ok) return // la voz sigue en la otra llamada
      }
    } else await guardar(id, { estado: 'voz', error: null })

    const narraciones = guion.escenas.map((e) => e.narracion.trim())
    if (!vozConfigurada()) {
      await guardar(id, { audios: narraciones.map((t, i) => estimar(i, t)), con_voz: false, estado: 'listo' })
      return
    }
    // Si se rehace la voz, se borran los audios anteriores
    const previos = ((v.audios ?? []) as { path: string | null }[]).map((a) => a.path).filter((p): p is string => !!p)
    if (previos.length) await admin.storage.from('videos').remove(previos)
    const audios = await vozDeEscenas(narraciones, async (i, mp3) => {
      const path = `${id}/escena-${i}-${Date.now()}.mp3`
      const { error: e } = await admin.storage.from('videos').upload(path, new Blob([mp3], { type: 'audio/mpeg' }), { contentType: 'audio/mpeg', upsert: true })
      if (e) throw new Error(`No se pudo guardar la voz: ${e.message}`)
      return path
    })
    await guardar(id, { audios, con_voz: true, estado: 'listo', error: null })
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e)
    console.error('Video', id, mensaje)
    await guardar(id, { estado: 'error', error: mensaje }).catch(() => {})
  }
}

/** Para quién es (y qué cliente) a partir de la grabación */
async function deLaGrabacion(grabacionId: string): Promise<{ prospectoId: string | null; analizada: boolean } | null> {
  const { data: g } = await admin.from('grabaciones').select('prospecto_id, reunion_id, analisis').eq('id', grabacionId).maybeSingle()
  if (!g) return null
  let prospectoId: string | null = g.prospecto_id
  if (!prospectoId && g.reunion_id) {
    const { data: r } = await admin.from('reuniones').select('prospecto_id').eq('id', g.reunion_id).maybeSingle()
    prospectoId = r?.prospecto_id ?? null
  }
  return { prospectoId, analizada: !!g.analisis }
}

async function nuevo(prospectoId: string | null, grabacionId: string | null, enfoque: Enfoque, email: string): Promise<string> {
  const { data, error } = await admin
    .from('videos')
    .insert({ prospecto_id: prospectoId, grabacion_id: grabacionId, enfoque, estado: 'guion', pedido_por: email })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
  let body: { accion?: string; id?: string; grabacion_id?: string; prospecto_id?: string; enfoque?: string; token?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Pedido inválido' }, 400)
  }
  // La propuesta pública: quien tiene el link puede ver el video que va en ella (y nada más)
  if (body.accion === 'video_propuesta') {
    try {
      return json({ url: await videoDePropuestaPublica(body.token) })
    } catch (e) {
      console.error(e)
      return json({ url: null })
    }
  }
  const email = await socio(req)
  if (!email) return json({ error: 'No autorizado' }, 401)
  const enfoque: Enfoque = body.enfoque === 'equipo' || body.enfoque === 'interno' ? body.enfoque : 'cliente'
  // Para que la voz siga en otra llamada: la misma sesión del socio o la firma interna
  const cabeceras: Record<string, string> =
    email === 'automático' ? await cabecerasInternas() : { Authorization: req.headers.get('Authorization') ?? '', apikey: ANON, 'content-type': 'application/json' }

  try {
    switch (body.accion) {
      case 'config':
        return json({ anthropic: claudeConfigurado(), elevenlabs: vozConfigurada() })
      case 'crear': {
        if (!claudeConfigurado()) return json({ error: 'Falta cargar la clave de Anthropic (Claude).', falta: 'anthropic' }, 503)
        let prospectoId = body.prospecto_id ?? null
        const grabacionId = body.grabacion_id ?? null
        if (!prospectoId && !grabacionId) return json({ error: 'Falta la intervención o el cliente.' }, 400)
        if (grabacionId) {
          const g = await deLaGrabacion(grabacionId)
          if (!g) return json({ error: 'No encontré esa grabación.' }, 404)
          if (!g.analizada) return json({ error: 'Primero hay que analizar la grabación.' }, 400)
          prospectoId = prospectoId ?? g.prospectoId
        }
        const id = await nuevo(prospectoId, grabacionId, enfoque, email)
        enSegundoPlano(armar(id, cabeceras))
        return json({ id })
      }
      case 'reintentar': {
        if (!body.id) return json({ error: 'Falta el video.' }, 400)
        enSegundoPlano(armar(body.id, cabeceras))
        return json({ ok: true })
      }
      case 'automatico': {
        // Solo la llaman las otras funciones (firma interna), al terminar el análisis de una grabación con cliente
        if (email !== 'automático') return json({ error: 'No autorizado' }, 401)
        if (!claudeConfigurado() || !body.grabacion_id) return json({ ok: false })
        const { data: aj } = await admin.from('ajustes').select('*').maybeSingle()
        if (aj && aj.videos_automaticos === false) return json({ ok: false, motivo: 'apagados' })
        const g = await deLaGrabacion(body.grabacion_id)
        if (!g?.analizada || !g.prospectoId) return json({ ok: false, motivo: 'sin cliente' })
        // Uno de cada uno por grabación: si se vuelve a analizar, no se repiten
        const { data: ya } = await admin.from('videos').select('enfoque').eq('grabacion_id', body.grabacion_id)
        const hechos = new Set((ya ?? []).map((v) => v.enfoque as string))
        const ids: string[] = []
        for (const e of ['cliente', 'interno'] as Enfoque[]) {
          if (hechos.has(e)) continue
          const id = await nuevo(g.prospectoId, body.grabacion_id, e, 'automático').catch((err) => {
            if (/duplicate|unique/i.test(String(err))) return null // ya lo pidió otro aviso
            throw err
          })
          if (!id) continue
          ids.push(id)
          enSegundoPlano(armar(id, cabeceras))
        }
        return json({ ok: true, ids })
      }
      default:
        return json({ error: 'Acción desconocida' }, 400)
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
