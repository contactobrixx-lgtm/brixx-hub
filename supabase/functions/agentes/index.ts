// Edge Function "agentes": los agentes de Jarvis que trabajan solos (programados) o a pedido.
//
// Pedidos (POST JSON):
//   { accion: "tic" }                          → corre lo que toque ahora (lo llama el programador de la base
//                                                cada 15 min con su token, o el hub al abrirse) → { ok, corridos }
//   { accion: "correr", agente, reunion_id?, prospecto_id?, grabacion_id?, parametros? }
//                                              → corre un agente ya (a pedido de un socio) → { ok, id?, resumen? }
//   { accion: "textos_propuesta", id, fondo? } → escribe los textos de la propuesta de esa cotización (formato Alcione);
//                                              con fondo: true responde enseguida y lo hace en segundo plano
//   { accion: "meta_diagnostico", usuario? } → qué permisos tiene el token, qué ve y si puede leer cuentas (sin mostrar el token)
//   { accion: "instagram", prospecto_id?, usuario? } → lee la cuenta de Instagram (API de Meta), guarda la foto del momento → { perfil }
//   { accion: "continuar_meta", id }           → segundo paso de la campaña de Meta Ads (se llama sola)
//   { accion: "estado" }                       → agentes, última corrida y si el programador está andando
//
// Programados: preparador (brief antes de cada reunión), postventa (semanal), monitor (cada hora),
// cobranzas (diario), financiero y ventas (mensuales). A pedido, desde la carpeta del cliente: propuesta (cotización en borrador +
// mensaje), auditor (redes y web) y meta_ads (propuesta de campaña). Solo LEEN el hub y escriben su
// informe (la propuesta, además, deja la cotización en BORRADOR): nunca le mandan nada a un cliente ni
// tocan Meta. Usa ANTHROPIC_API_KEY (el monitor no la necesita).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { ahoraAR, nuevoContexto, type Contexto } from './comun.ts'
import { correrMonitor } from './monitor.ts'
import { correrCobranzas } from './cobranzas.ts'
import { correrPostventa } from './postventa.ts'
import { prepararReunion, proximaReunion, reunionesPorPreparar } from './preparador.ts'
import { armarPropuesta } from './propuesta.ts'
import { armarTextosPropuesta } from './textos.ts'
import { diagnosticoMeta, ErrorMeta, metaConfigurado, usuarioInstagram } from '../asistente/meta.ts'
import { auditar } from './auditor.ts'
import { armarMeta, empezarMeta, leerParametros } from './meta.ts'
import { correrFinanciero } from './financiero.ts'
import { correrVentas } from './ventas.ts'

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined

const URL_SUPABASE = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin: SupabaseClient = createClient(URL_SUPABASE, SERVICE, { auth: { persistSession: false } })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

const AGENTES = ['preparador', 'postventa', 'monitor', 'cobranzas', 'propuesta', 'auditor', 'meta_ads', 'financiero', 'ventas'] as const
type Agente = (typeof AGENTES)[number]
/** Los que necesitan Claude (el monitor no) */
const CON_IA: Agente[] = ['preparador', 'postventa', 'cobranzas', 'propuesta', 'auditor', 'meta_ads', 'financiero', 'ventas']
/** Los que trabajan sobre un cliente puntual */
const POR_CLIENTE: Agente[] = ['propuesta', 'auditor', 'meta_ads']

/** Quién llama: un socio (con su sesión) o el programador de la base (con el token interno) */
async function quien(req: Request): Promise<{ socio: string | null } | null> {
  const token = req.headers.get('x-agentes-token')
  if (token) {
    const { data } = await admin.rpc('agentes_token_valido', { t: token })
    return data === true ? { socio: null } : null
  }
  const auth = req.headers.get('Authorization')
  if (!auth) return null
  const cliente = createClient(URL_SUPABASE, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
  const [{ data: ok, error }, { data: user }] = await Promise.all([cliente.rpc('es_miembro'), cliente.auth.getUser()])
  if (error || ok !== true || !user.user?.email) return null
  // Deja anotada la dirección de las funciones, para que el programador de la base sepa a dónde llamar
  admin.rpc('agentes_guardar_url', { u: `${URL_SUPABASE}/functions/v1` }).then(() => {}, () => {})
  return { socio: user.user.email }
}

const enSegundoPlano = (p: Promise<unknown>) => {
  const seguro = p.catch((e) => console.error('Agente con error:', e))
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(seguro)
  return seguro
}

const hayClaude = () => Boolean(Deno.env.get('ANTHROPIC_API_KEY'))

/**
 * Se queda con la corrida de un agente si ya le toca (marca la hora antes de correr, así dos avisos
 * juntos no lo corren dos veces). `desde`: solo si la última corrida fue antes de esa fecha.
 */
async function tomarTurno(agente: Agente, desde: Date): Promise<boolean> {
  const { data } = await admin
    .from('agentes_config')
    .update({ ultima_corrida: new Date().toISOString(), ultimo_estado: 'Trabajando…' })
    .eq('agente', agente)
    .eq('activo', true)
    .or(`ultima_corrida.is.null,ultima_corrida.lt.${desde.toISOString()}`)
    .select('agente')
  return Boolean(data?.length)
}

/** Corre lo que toque ahora. Devuelve qué arrancó. */
async function tic(ctx: Contexto): Promise<string[]> {
  const { data: config } = await admin.from('agentes_config').select('agente, activo, hora, ultima_corrida')
  const cfg = new Map((config ?? []).map((c) => [c.agente as string, c]))
  const { fecha, hora } = ahoraAR()
  const inicioDeHoy = new Date(`${fecha}T00:00:00-03:00`)
  const corridos: string[] = []

  // Monitor: cada hora
  if (cfg.get('monitor')?.activo && (await tomarTurno('monitor', new Date(Date.now() - 55 * 60_000)))) {
    corridos.push('monitor')
    enSegundoPlano(correrMonitor(ctx))
  }
  if (!hayClaude()) return corridos

  // Preparador: las reuniones que arrancan en la próxima hora y media (hasta 2 por aviso)
  if (cfg.get('preparador')?.activo) {
    for (const r of (await reunionesPorPreparar(ctx)).slice(0, 2)) {
      const p = await prepararReunion(ctx, r, false)
      if (p) {
        corridos.push(`preparador:${r.id}`)
        enSegundoPlano(p.trabajo)
      }
    }
  }
  // Cobranzas: una vez por día, desde la hora elegida
  const cob = cfg.get('cobranzas')
  if (cob?.activo && hora >= Number(cob.hora ?? 8) && (await tomarTurno('cobranzas', inicioDeHoy))) {
    corridos.push('cobranzas')
    enSegundoPlano(correrCobranzas(ctx, false))
  }
  // Postventa: una vez por semana, desde la hora elegida
  const pv = cfg.get('postventa')
  if (pv?.activo && hora >= Number(pv.hora ?? 8) && (await tomarTurno('postventa', new Date(inicioDeHoy.getTime() - 6 * 864e5)))) {
    corridos.push('postventa')
    enSegundoPlano(correrPostventa(ctx, false))
  }
  // Analistas: una vez por mes, desde el día 1 a la hora elegida
  const inicioDelMes = new Date(`${fecha.slice(0, 7)}-01T00:00:00-03:00`)
  for (const [agente, correr] of [
    ['financiero', correrFinanciero],
    ['ventas', correrVentas],
  ] as const) {
    const c = cfg.get(agente)
    if (c?.activo && hora >= Number(c.hora ?? 9) && (await tomarTurno(agente, inicioDelMes))) {
      corridos.push(agente)
      enSegundoPlano(correr(ctx, false))
    }
  }
  return corridos
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
  const llamador = await quien(req)
  if (!llamador) return json({ error: 'No autorizado' }, 401)

  let body: { accion?: string; agente?: string; reunion_id?: string; prospecto_id?: string; grabacion_id?: string; parametros?: Record<string, unknown>; id?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Pedido inválido' }, 400)
  }
  const ctx = nuevoContexto(admin, llamador.socio)

  try {
    if (body.accion === 'tic') return json({ ok: true, corridos: await tic(ctx) })

    if (body.accion === 'estado') {
      const [{ data: config }, programados] = await Promise.all([
        admin.from('agentes_config').select('*'),
        createClient(URL_SUPABASE, ANON, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } })
          .rpc('agentes_programados')
          .then((r) => r.data === true),
      ])
      return json({ agentes: config ?? [], programados, claude: hayClaude(), meta: metaConfigurado() })
    }

    if (body.accion === 'meta_diagnostico') {
      if (!llamador.socio) return json({ error: 'Solo a pedido de un socio.' }, 403)
      const b = body as { usuario?: string }
      return json({ ok: true, lineas: await diagnosticoMeta(b.usuario ? usuarioInstagram(b.usuario) : null) })
    }

    if (body.accion === 'instagram') {
      if (!llamador.socio) return json({ error: 'Solo a pedido de un socio.' }, 403)
      if (!metaConfigurado()) return json({ error: 'Falta conectar la API de Meta.', falta: 'meta' }, 503)
      const b = body as { prospecto_id?: string; usuario?: string }
      let usuario = b.usuario ?? null
      if (!usuario && b.prospecto_id) {
        const { data: p } = await admin.from('prospectos').select('instagram').eq('id', b.prospecto_id).maybeSingle()
        usuario = (p?.instagram as string | null) ?? null
      }
      if (!usuario) return json({ error: 'Este cliente no tiene Instagram cargado en su carpeta.' }, 400)
      try {
        const r = await ctx.hub.instagramPerfil(usuario, b.prospecto_id ?? null)
        return json({ ok: true, perfil: r.perfil })
      } catch (e) {
        const motivo = e instanceof ErrorMeta ? e.motivo : 'meta'
        return json({ error: e instanceof Error ? e.message : String(e), motivo }, motivo === 'no_encontrada' ? 404 : 502)
      }
    }

    if (body.accion === 'textos_propuesta') {
      if (!llamador.socio || !body.id) return json({ error: 'Pedido inválido.' }, 400)
      if (!hayClaude()) return json({ error: 'Falta cargar la clave de Anthropic.', falta: 'anthropic' }, 503)
      const trabajo = armarTextosPropuesta(ctx, body.id)
      if ((body as { fondo?: boolean }).fondo) {
        enSegundoPlano(trabajo)
        return json({ ok: true })
      }
      await trabajo
      return json({ ok: true })
    }

    if (body.accion === 'continuar_meta') {
      if (!llamador.socio || !body.id) return json({ error: 'Pedido inválido.' }, 400)
      enSegundoPlano(ctx.hub.tipoCambio().then((tc) => armarMeta(ctx, body.id!, tc)))
      return json({ ok: true })
    }

    if (body.accion === 'correr') {
      if (!llamador.socio) return json({ error: 'Solo a pedido de un socio.' }, 403)
      const agente = body.agente as Agente
      if (!AGENTES.includes(agente)) return json({ error: 'Agente desconocido.' }, 400)
      if (CON_IA.includes(agente) && !hayClaude()) return json({ error: 'Falta cargar la clave de Anthropic.', falta: 'anthropic' }, 503)
      if (POR_CLIENTE.includes(agente)) {
        if (!body.prospecto_id) return json({ error: 'Falta el cliente.' }, 400)
        let p
        const auth = req.headers.get('Authorization') ?? ''
        if (agente === 'propuesta') {
          // Los textos de la propuesta van en otra llamada a la función (con la misma sesión), por el tope de tiempo
          const textos = async (id: string) => {
            const r = await fetch(`${URL_SUPABASE}/functions/v1/agentes`, {
              method: 'POST',
              headers: { Authorization: auth, apikey: ANON, 'content-type': 'application/json' },
              body: JSON.stringify({ accion: 'textos_propuesta', id, fondo: true }),
            })
            if (!r.ok) console.error(`No arrancaron los textos de la propuesta (${r.status}).`)
          }
          p = await armarPropuesta(ctx, body.prospecto_id, body.grabacion_id ?? null, textos)
        }
        else if (agente === 'auditor') p = await auditar(ctx, body.prospecto_id)
        else {
          // El segundo paso va en otra llamada a la función (con la misma sesión del socio), por el tope de tiempo
          const continuar = async (id: string) => {
            const r = await fetch(`${URL_SUPABASE}/functions/v1/agentes`, {
              method: 'POST',
              headers: { Authorization: auth, apikey: ANON, 'content-type': 'application/json' },
              body: JSON.stringify({ accion: 'continuar_meta', id }),
            })
            if (!r.ok) throw new Error(`No arrancó el segundo paso (${r.status}).`)
          }
          p = await empezarMeta(ctx, body.prospecto_id, leerParametros(body.parametros ?? {}), continuar)
        }
        enSegundoPlano(p.trabajo)
        return json({ ok: true, id: p.id })
      }

      if (agente === 'monitor') return json({ ok: true, resumen: await correrMonitor(ctx) })
      if (agente === 'preparador') {
        let reunion = null
        if (body.reunion_id) {
          const { data } = await admin.from('reuniones').select('id, titulo, inicio, prospecto_id, lugar_o_link, notas').eq('id', body.reunion_id).maybeSingle()
          reunion = data
        } else reunion = await proximaReunion(ctx)
        if (!reunion) return json({ error: 'No hay reuniones próximas para preparar.' }, 404)
        const p = await prepararReunion(ctx, reunion, true)
        if (!p) return json({ error: 'Ya se está preparando.' }, 409)
        enSegundoPlano(p.trabajo)
        return json({ ok: true, id: p.id })
      }
      // Cobranzas, postventa y analistas: en segundo plano (el informe aparece al terminar)
      const corredores = { cobranzas: correrCobranzas, postventa: correrPostventa, financiero: correrFinanciero, ventas: correrVentas } as const
      enSegundoPlano(corredores[agente as keyof typeof corredores](ctx, true))
      return json({ ok: true })
    }
    return json({ error: 'Acción desconocida' }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
