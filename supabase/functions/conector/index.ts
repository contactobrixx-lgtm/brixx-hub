// Edge Function "conector": conecta los chats de Claude (claude.ai / app de escritorio) con el hub.
//
// Es un servidor MCP (JSON-RPC por HTTP, sin sesión) que se agrega en Claude como "conector personalizado"
// con la URL secreta  https://<proyecto>.supabase.co/functions/v1/conector/<clave>  y "Sin inicio de sesión".
// La clave sale de la service role (HMAC), así que no hay que cargar ningún secret: el hub la muestra a los
// miembros en "Conectar con Claude", junto a la cuenta. Para cambiarla (si se filtra el enlace), cargar o cambiar el
// secret opcional CONECTOR_VERSION y volver a copiar el enlace.
//
// Herramientas (lo justo para cargar clientes nuevos y actualizar los existentes; nada de borrar ni finanzas):
//   buscar_cliente      · carpetas que coinciden con un nombre, Instagram, web, mail o teléfono
//   leer_cliente        · la carpeta: datos, síntesis e intervenciones
//   cargar_intervencion · texto + links → el mismo análisis que "Nueva intervención" del hub (crea la carpeta si no existe)
//   estado_intervencion · el resultado del análisis
//   completar_cliente   · completa datos vacíos y agrega una nota (nunca pisa lo cargado)
// Todo queda en las tablas del hub, así que Jarvis lo ve igual que lo cargado a mano.
//
// Pedido del hub (POST JSON, con la sesión del socio):  { accion: "enlace" } → { url }
import { createClient } from 'npm:@supabase/supabase-js@2'
import { Hub, normalizar, ZONA } from '../asistente/datos.ts'

const URL_SUPABASE = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const HUB_URL = (Deno.env.get('HUB_URL') ?? 'https://brixx-hub.vercel.app').replace(/\/$/, '')
const admin = createClient(URL_SUPABASE, SERVICE, { auth: { persistSession: false } })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, mcp-protocol-version, mcp-session-id',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

async function hmac(texto: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SERVICE), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(texto))
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('')
}
const claveConector = async () => (await hmac(`conector-claude:${Deno.env.get('CONECTOR_VERSION') ?? '1'}`)).slice(0, 40)

function igual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

async function esMiembro(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization')
  if (!auth) return false
  const cliente = createClient(URL_SUPABASE, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
  const { data, error } = await cliente.rpc('es_miembro')
  return !error && data === true
}

// ---------------------------------------------------------------------------
// Herramientas

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Fila = Record<string, unknown>
const corto = (s: unknown, n: number) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}
const linkCarpeta = (id: string) => `${HUB_URL}/clientes/${id}`
const nombreDe = (p: Fila) => (p.empresa ? `${p.empresa} (contacto: ${p.nombre})` : String(p.nombre))

const HERRAMIENTAS = [
  {
    name: 'buscar_cliente',
    description:
      'Busca carpetas de clientes y clientes potenciales de brixx por nombre, empresa, usuario de Instagram, web, mail o teléfono. Usala SIEMPRE antes de cargar un cliente, para no duplicar carpetas. Devuelve el id de cada carpeta.',
    inputSchema: {
      type: 'object',
      properties: { texto: { type: 'string', description: 'Nombre, marca, @usuario, dominio web, mail o teléfono.' } },
      required: ['texto'],
    },
  },
  {
    name: 'leer_cliente',
    description: 'Lee la carpeta de un cliente del hub: datos, etapa, notas, síntesis (situación, objetivos, soluciones, qué hacer) e intervenciones recientes.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Id de la carpeta (de buscar_cliente).' } }, required: ['id'] },
  },
  {
    name: 'cargar_intervencion',
    description:
      'Carga en el hub una intervención de texto (lo que se sabe del cliente: notas de la charla, datos, pedido) con sus links (Instagram, web, página de ventas). El hub la analiza con el catálogo de brixx: dolores, cuellos de botella, soluciones y un mensaje para mandarle; si no hay carpeta, la crea en el pipeline (etapa contacto) y completa sus datos. Pasá prospecto_id si el cliente ya existe. Tarda alrededor de un minuto: después consultá estado_intervencion.',
    inputSchema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Todo lo que se sabe del cliente, en texto (hasta ~15.000 caracteres).' },
        urls: { type: 'array', items: { type: 'string' }, description: 'Links del cliente (máximo 5).' },
        prospecto_id: { type: 'string', description: 'Id de la carpeta si el cliente ya existe.' },
        titulo: { type: 'string', description: 'Título corto de la intervención.' },
      },
      required: ['texto'],
    },
  },
  {
    name: 'estado_intervencion',
    description: 'Estado y resultado del análisis de una intervención cargada con cargar_intervencion (dolores, soluciones, mensaje para el cliente y la carpeta creada o actualizada).',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Id que devolvió cargar_intervencion.' } }, required: ['id'] },
  },
  {
    name: 'completar_cliente',
    description:
      'Completa datos VACÍOS de la carpeta de un cliente (nunca pisa los que ya están) y/o le agrega una nota con fecha. Para cambiar un dato ya cargado, hacelo desde el hub.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        empresa: { type: 'string' },
        rubro: { type: 'string' },
        industria: { type: 'string' },
        telefono: { type: 'string' },
        email: { type: 'string' },
        instagram: { type: 'string', description: 'Link o @usuario.' },
        web: { type: 'string' },
        nota: { type: 'string', description: 'Nota corta para la carpeta.' },
      },
      required: ['id'],
    },
  },
]

async function buscarCliente(texto: string): Promise<string> {
  const q = normalizar(String(texto ?? '')).replace(/^@/, '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').trim()
  if (q.length < 2) return 'Escribí al menos 2 letras para buscar.'
  const digitos = q.replace(/\D/g, '')
  const filas = (await new Hub(admin).prospectos()).filter((p) => {
    const campos = normalizar([p.nombre, p.empresa, p.instagram, p.web, p.email].filter(Boolean).join(' '))
    return campos.includes(q) || (digitos.length >= 6 && String(p.telefono ?? '').replace(/\D/g, '').includes(digitos))
  })
  if (!filas.length) return `No hay ninguna carpeta que coincida con "${texto}". Si es un cliente nuevo, cargalo con cargar_intervencion sin prospecto_id.`
  return filas
    .slice(0, 10)
    .map((p) =>
      [
        `- id: ${p.id}`,
        nombreDe(p),
        `etapa: ${p.etapa}`,
        p.rubro ? `rubro: ${p.rubro}` : '',
        p.instagram ? `instagram: ${p.instagram}` : '',
        p.web ? `web: ${p.web}` : '',
        p.telefono ? `tel: ${p.telefono}` : '',
        `carpeta: ${linkCarpeta(p.id as string)}`,
      ]
        .filter(Boolean)
        .join(' | '),
    )
    .join('\n')
}

async function leerCliente(id: string): Promise<string> {
  if (!UUID.test(id)) return 'Id de carpeta inválido.'
  const { data: p } = await admin.from('prospectos').select('*').eq('id', id).maybeSingle()
  if (!p) return 'No existe esa carpeta.'
  const s = p.sintesis as {
    situacion?: string
    objetivos?: string[]
    soluciones?: { solucion: string; servicio: string }[]
    hacer_ahora?: { accion: string; fecha: string | null }[]
    falta_saber?: string[]
  } | null
  const { data: gs } = await admin
    .from('grabaciones')
    .select('id, titulo, origen, estado, created_at, analisis')
    .eq('prospecto_id', id)
    .order('created_at', { ascending: false })
    .limit(6)
  const lineas = [
    `${nombreDe(p)} · etapa: ${p.etapa} · carpeta: ${linkCarpeta(id)}`,
    ...['rubro', 'industria', 'telefono', 'email', 'instagram', 'web', 'responsable', 'proxima_accion', 'fecha_proxima_accion'].map((k) =>
      p[k] ? `${k}: ${p[k]}` : '',
    ),
    p.notas ? `notas: ${corto(p.notas, 1200)}` : '',
    s?.situacion ? `situación: ${s.situacion}` : '',
    s?.objetivos?.length ? `objetivos: ${s.objetivos.join('; ')}` : '',
    s?.soluciones?.length ? `soluciones que le proponemos: ${s.soluciones.map((x) => `${x.solucion} (${x.servicio})`).join('; ')}` : '',
    s?.hacer_ahora?.length ? `hacer ahora: ${s.hacer_ahora.map((x) => x.accion + (x.fecha ? ` (${x.fecha})` : '')).join('; ')}` : '',
    s?.falta_saber?.length ? `falta saber: ${s.falta_saber.join('; ')}` : '',
    gs?.length ? 'intervenciones recientes:' : 'Sin intervenciones todavía.',
    ...(gs ?? []).map(
      (g) =>
        `- ${String(g.created_at).slice(0, 10)} · ${g.titulo} (${g.origen}, ${g.estado})${(g.analisis as Fila | null)?.en_una_linea ? ` · ${(g.analisis as Fila).en_una_linea}` : ''}`,
    ),
  ]
  return lineas.filter(Boolean).join('\n')
}

async function cargarIntervencion(a: { texto?: string; urls?: unknown; prospecto_id?: string; titulo?: string }): Promise<string> {
  const texto = String(a.texto ?? '').trim().slice(0, 15000)
  const urls = (Array.isArray(a.urls) ? a.urls : [])
    .map((u) => String(u).trim())
    .filter((u) => u && u.length < 500)
    .slice(0, 5)
  if (!texto && !urls.length) return 'Falta el texto o algún link para cargar.'
  let prospectoId: string | null = null
  if (a.prospecto_id) {
    if (!UUID.test(a.prospecto_id)) return 'prospecto_id inválido: buscalo con buscar_cliente.'
    const { data } = await admin.from('prospectos').select('id').eq('id', a.prospecto_id).maybeSingle()
    if (!data) return 'No existe esa carpeta: buscala con buscar_cliente o cargá sin prospecto_id.'
    prospectoId = a.prospecto_id
  }
  const titulo = corto(a.titulo || `Desde Claude: ${texto || urls[0]}`, 90)
  const { data, error } = await admin
    .from('grabaciones')
    .insert({ titulo, prospecto_id: prospectoId, grabado_por: 'Claude (conector)', origen: 'texto', estado: 'pendiente', texto_original: texto || null, urls })
    .select('id')
    .single()
  if (error) return `No se pudo cargar: ${error.message}`
  const id = data.id as string
  // Mismo procesamiento que el botón del hub (función "grabaciones"), firmado con la clave del servidor.
  const r = await fetch(`${URL_SUPABASE}/functions/v1/grabaciones`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${ANON}`, 'x-brixx-token': await hmac(`grabacion:${id}`) },
    body: JSON.stringify({ accion: 'procesar', id }),
  }).catch((e) => ({ ok: false, statusText: String(e) }) as Response)
  const estado = r.ok ? ((await r.json().catch(() => ({}))) as { estado?: string; falta?: string }) : null
  if (!estado) return `Intervención guardada (id: ${id}), pero no se pudo arrancar el análisis. Se puede procesar desde ${HUB_URL}/grabaciones/${id}.`
  if (estado.falta) return `Intervención guardada (id: ${id}) y pendiente: falta cargar la clave de ${estado.falta} en el hub.`
  return `Intervención cargada (id: ${id}). El hub la está analizando: consultá estado_intervencion en alrededor de un minuto.`
}

async function estadoIntervencion(id: string): Promise<string> {
  if (!UUID.test(id)) return 'Id inválido.'
  const { data: g } = await admin.from('grabaciones').select('id, estado, error, analisis, prospecto_id').eq('id', id).maybeSingle()
  if (!g) return 'No existe esa intervención.'
  if (g.estado === 'error') return `El análisis falló: ${g.error ?? 'sin detalle'}. Se puede reintentar desde ${HUB_URL}/grabaciones/${id}.`
  if (g.estado !== 'lista') return `Todavía está en "${g.estado}". Volvé a consultar en unos segundos.`
  const a = (g.analisis ?? {}) as {
    en_una_linea?: string
    dolores?: string[]
    cuellos_de_botella?: string[]
    soluciones?: { solucion: string; servicio: string }[]
    falta_saber?: string[]
    propuesta?: { asunto: string; mensaje: string }
    carpeta_creada?: boolean
  }
  let carpeta = ''
  if (g.prospecto_id) {
    const { data: p } = await admin.from('prospectos').select('nombre, empresa, etapa').eq('id', g.prospecto_id).maybeSingle()
    if (p) carpeta = `${a.carpeta_creada ? 'Carpeta NUEVA creada' : 'Carpeta actualizada'}: ${nombreDe(p)} (etapa ${p.etapa}) · id ${g.prospecto_id} · ${linkCarpeta(g.prospecto_id)}`
  }
  return [
    carpeta,
    a.en_una_linea ? `En una línea: ${a.en_una_linea}` : '',
    a.dolores?.length ? `Dolores: ${a.dolores.join('; ')}` : '',
    a.cuellos_de_botella?.length ? `Cuellos de botella: ${a.cuellos_de_botella.join('; ')}` : '',
    a.soluciones?.length ? `Soluciones: ${a.soluciones.map((s) => `${s.solucion} (${s.servicio})`).join('; ')}` : '',
    a.falta_saber?.length ? `Falta saber: ${a.falta_saber.join('; ')}` : '',
    a.propuesta?.mensaje ? `Mensaje para el cliente (${a.propuesta.asunto}):\n${a.propuesta.mensaje}` : '',
    `Intervención: ${HUB_URL}/grabaciones/${id}`,
  ]
    .filter(Boolean)
    .join('\n')
}

async function completarCliente(a: Record<string, unknown>): Promise<string> {
  const id = String(a.id ?? '')
  if (!UUID.test(id)) return 'Id de carpeta inválido.'
  const { data: p } = await admin.from('prospectos').select('*').eq('id', id).maybeSingle()
  if (!p) return 'No existe esa carpeta.'
  const cambios: Record<string, string> = {}
  const ignorados: string[] = []
  const poner = (campo: string, valor: unknown) => {
    const v = String(valor ?? '').trim().slice(0, 300)
    if (!v) return
    if (p[campo]) ignorados.push(campo)
    else cambios[campo] = v
  }
  poner('empresa', a.empresa)
  poner('rubro', a.rubro)
  poner('industria', a.industria)
  poner('telefono', a.telefono)
  poner('email', a.email)
  const ig = String(a.instagram ?? '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/.*$/, '')
  if (ig) poner('instagram', `https://www.instagram.com/${ig}/`)
  const web = String(a.web ?? '').trim()
  if (web) poner('web', /^https?:\/\//i.test(web) ? web : `https://${web}`)
  const nota = String(a.nota ?? '').trim().slice(0, 1000)
  if (nota) {
    const fecha = new Date().toLocaleDateString('es-AR', { timeZone: ZONA, day: '2-digit', month: '2-digit' })
    const linea = `[${fecha} · Claude] ${nota}`
    cambios.notas = p.notas ? `${p.notas}\n${linea}` : linea
  }
  if (!Object.keys(cambios).length) return `No había nada para completar${ignorados.length ? ` (ya cargado: ${ignorados.join(', ')})` : ''}.`
  const { error } = await admin.from('prospectos').update(cambios).eq('id', id)
  if (error) return `No se pudo guardar: ${error.message}`
  return `Listo: ${Object.keys(cambios).join(', ')} en ${nombreDe(p)}.${ignorados.length ? ` No se tocó lo ya cargado: ${ignorados.join(', ')}.` : ''} ${linkCarpeta(id)}`
}

async function llamar(nombre: string, a: Record<string, unknown>): Promise<string> {
  switch (nombre) {
    case 'buscar_cliente':
      return await buscarCliente(String(a.texto ?? ''))
    case 'leer_cliente':
      return await leerCliente(String(a.id ?? ''))
    case 'cargar_intervencion':
      return await cargarIntervencion(a as { texto?: string; urls?: unknown; prospecto_id?: string; titulo?: string })
    case 'estado_intervencion':
      return await estadoIntervencion(String(a.id ?? ''))
    case 'completar_cliente':
      return await completarCliente(a)
    default:
      throw new Error(`Herramienta desconocida: ${nombre}`)
  }
}

// ---------------------------------------------------------------------------
// MCP (JSON-RPC 2.0 por HTTP, respuestas JSON, sin sesión)

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }

async function rpc(m: Rpc): Promise<Record<string, unknown> | null> {
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id: m.id, result })
  const err = (code: number, message: string) => ({ jsonrpc: '2.0', id: m.id ?? null, error: { code, message } })
  if (m.id === undefined || m.id === null) return null // notificación
  switch (m.method) {
    case 'initialize':
      return ok({
        protocolVersion: typeof m.params?.protocolVersion === 'string' ? m.params.protocolVersion : '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'brixx-hub', version: '1.0.0' },
        instructions:
          'Hub de gestión de brixx (agencia de soluciones digitales e IA). Para un cliente nuevo o una actualización: buscar_cliente primero; si no existe, cargar_intervencion sin prospecto_id (crea la carpeta); si existe, con su prospecto_id. Después estado_intervencion para traer el análisis. completar_cliente solo completa datos vacíos.',
      })
    case 'ping':
      return ok({})
    case 'tools/list':
      return ok({ tools: HERRAMIENTAS })
    case 'tools/call': {
      const nombre = String(m.params?.name ?? '')
      if (!HERRAMIENTAS.some((h) => h.name === nombre)) return err(-32602, `Herramienta desconocida: ${nombre}`)
      try {
        const texto = await llamar(nombre, (m.params?.arguments ?? {}) as Record<string, unknown>)
        return ok({ content: [{ type: 'text', text: texto }] })
      } catch (e) {
        return ok({ content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }], isError: true })
      }
    }
    default:
      return err(-32601, `Método no soportado: ${m.method}`)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const partes = new URL(req.url).pathname.split('/').filter(Boolean)
  const i = partes.lastIndexOf('conector')
  const clave = i >= 0 ? (partes[i + 1] ?? '') : ''

  // Hub: el socio pide el enlace para pegar en Claude
  if (!clave) {
    if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
    if (!(await esMiembro(req))) return json({ error: 'No autorizado' }, 401)
    const body = await req.json().catch(() => ({}))
    if (body?.accion !== 'enlace') return json({ error: 'Acción desconocida' }, 400)
    return json({ url: `${URL_SUPABASE}/functions/v1/conector/${await claveConector()}` })
  }

  if (!igual(clave, await claveConector())) return json({ error: 'No autorizado' }, 401)
  if (req.method === 'GET') return new Response('Método no permitido', { status: 405, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  let cuerpo: Rpc | Rpc[]
  try {
    cuerpo = await req.json()
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido' } }, 400)
  }
  if (Array.isArray(cuerpo)) {
    const respuestas = (await Promise.all(cuerpo.map(rpc))).filter(Boolean)
    return respuestas.length ? json(respuestas) : new Response(null, { status: 202, headers: CORS })
  }
  const r = await rpc(cuerpo)
  return r ? json(r) : new Response(null, { status: 202, headers: CORS })
})
