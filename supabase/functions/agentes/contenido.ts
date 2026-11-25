// Agente "contenido" (Competencia y contenido): compara el Instagram del cliente con los referentes de su rubro
// (los que le pasa el socio, por ejemplo @ganga.home, y los que encuentra el agente), con datos REALES de la API
// de Meta, y devuelve qué les funciona a los otros, tendencias, lo que hacen ellos y el cliente no, y
// publicaciones listas para hacer con un calendario. Dos pasos en dos llamadas (por el tope de tiempo):
//   1) leer las cuentas con Meta (en código) + investigar con Claude (otros referentes, tendencias, fechas)
//   2) armar la estrategia con esquema (ideas, brechas, calendario)
// Solo lee: nunca publica ni escribe a nadie.
import { conInforme, empezarInforme, investigar, marcarCorrida, nombreCliente, pensarJSON, type Contexto, type Fila } from './comun.ts'
import { metaConfigurado, usuarioInstagram, type PerfilInstagram } from '../asistente/meta.ts'

export interface ParametrosContenido {
  referentes: string[]
  objetivo: string
}

export function leerParametrosContenido(p: Fila): ParametrosContenido {
  const lista = Array.isArray(p.referentes) ? p.referentes.map(String) : String(p.referentes ?? '').split(/[\s,;]+/)
  const referentes = [...new Set(lista.map((r) => usuarioInstagram(r)).filter((r): r is string => !!r))].slice(0, 6)
  return { referentes, objetivo: String(p.objetivo ?? '').slice(0, 500) }
}

/** Lo que se guarda de cada cuenta para la tabla y para Claude (sin las 30 publicaciones completas) */
interface Cuenta {
  usuario: string
  es_cliente: boolean
  error?: string
  seguidores?: number
  publicaciones?: number
  por_semana?: number | null
  dias_desde_ultima?: number | null
  interaccion_pct?: number | null
  promedio_me_gusta?: number | null
  formatos?: Record<string, number>
  interaccion_por_formato?: Record<string, number>
  hashtags?: string[]
  bio?: string | null
  mejores?: { link: string | null; tipo: string; interaccion: number; texto: string }[]
}

const resumirPerfil = (p: PerfilInstagram, esCliente: boolean): Cuenta => ({
  usuario: p.usuario.toLowerCase(),
  es_cliente: esCliente,
  seguidores: p.seguidores,
  publicaciones: p.publicaciones,
  por_semana: p.metricas.por_semana,
  dias_desde_ultima: p.metricas.dias_desde_ultima,
  interaccion_pct: p.metricas.interaccion_pct,
  promedio_me_gusta: p.metricas.promedio_me_gusta,
  formatos: p.metricas.formatos,
  interaccion_por_formato: p.metricas.interaccion_por_formato,
  hashtags: p.metricas.hashtags,
  bio: p.biografia,
  mejores: p.metricas.mejores,
})

async function leerCuentas(ctx: Contexto, usuarios: { usuario: string; es_cliente: boolean }[], prospectoId: string | null): Promise<Cuenta[]> {
  return Promise.all(
    usuarios.map(async ({ usuario, es_cliente }) => {
      try {
        const r = await ctx.hub.instagramPerfil(usuario, es_cliente ? prospectoId : null)
        return resumirPerfil(r.perfil, es_cliente)
      } catch (e) {
        return { usuario, es_cliente, error: e instanceof Error ? e.message : String(e) }
      }
    }),
  )
}

const textoCuenta = (c: Cuenta) =>
  c.error
    ? `@${c.usuario}${c.es_cliente ? ' (CLIENTE)' : ''}: no se pudo leer (${c.error})`
    : [
        `@${c.usuario}${c.es_cliente ? ' (CLIENTE)' : ''}: ${c.seguidores?.toLocaleString('es-AR')} seguidores · ${c.por_semana ?? 's/d'} publicaciones/semana · última hace ${c.dias_desde_ultima ?? 's/d'} días · interacción ${c.interaccion_pct ?? 's/d'}% · ${c.promedio_me_gusta ?? 's/d'} me gusta prom.`,
        `  formatos: ${Object.entries(c.formatos ?? {}).map(([t, n]) => `${t} ${n} (interacción prom. ${c.interaccion_por_formato?.[t] ?? 's/d'})`).join(', ')}`,
        `  hashtags: ${(c.hashtags ?? []).join(' ') || 'ninguno'}`,
        c.bio ? `  bio: ${c.bio}` : '',
        '  mejores publicaciones:',
        ...(c.mejores ?? []).map((m) => `   - ${m.tipo}, ${m.interaccion} interacciones: "${m.texto}" ${m.link ?? ''}`),
      ]
        .filter(Boolean)
        .join('\n')

/** Paso 1: lee las cuentas con Meta, investiga y dispara el paso 2 */
export async function empezarContenido(
  ctx: Contexto,
  prospectoId: string,
  m: ParametrosContenido,
  continuar: (id: string) => Promise<void>,
): Promise<{ id: string; trabajo: Promise<void> }> {
  const p = (await ctx.hub.prospectos()).find((x) => x.id === prospectoId)
  if (!p) throw new Error('No encontré ese cliente.')
  const propio = p.instagram ? usuarioInstagram(String(p.instagram)) : null
  if (!propio) throw new Error('Cargá el Instagram del cliente en su carpeta para comparar.')
  if (!metaConfigurado()) throw new Error('Falta conectar la API de Meta para leer los Instagram.')
  const cliente = nombreCliente(p)
  const id = await empezarInforme(ctx, 'contenido', null, { titulo: `Competencia y contenido: ${cliente}`, prospecto_id: prospectoId, datos: { parametros: m } })
  if (!id) throw new Error('No se pudo crear el informe.')

  const trabajo = (async () => {
    try {
      const cuentas = await leerCuentas(
        ctx,
        [{ usuario: propio, es_cliente: true }, ...m.referentes.filter((r) => r !== propio).map((usuario) => ({ usuario, es_cliente: false }))],
        prospectoId,
      )
      const investigacion = await investigar(ctx, {
        web: true,
        vueltas: 6,
        topeMs: 100_000,
        sistema: `Sos el analista de competencia y contenido de brixx. Ya tenés los datos REALES de Instagram (API de Meta) del cliente y de \
los referentes que pasó el socio. Tu trabajo:
1. Encontrá 2 a 4 referentes MÁS del mismo rubro en Argentina (las cuentas más grandes y que mejor les va), buscando en la web. \
Leé cada uno con la herramienta instagram (datos reales); si alguno no se puede leer, probá otro.
2. Mirá qué les funciona: formatos (reels, carruseles), temas, ganchos de los primeros segundos, promociones, frecuencia, cómo muestran \
el producto, si muestran precio, envíos, cuotas, sorteos, colaboraciones, UGC, tendencias de audio o estética.
3. Tendencias del rubro en Argentina ahora (web) y las fechas comerciales que vienen.
4. Mirá la carpeta del cliente en el hub (clientes_y_prospectos) para saber qué vende y qué quiere lograr.
No inventes números: los números son los de la herramienta instagram. Entregá texto plano ordenado (hasta 70 líneas): una sección por \
referente nuevo con sus datos y qué le funciona, después TENDENCIAS y FECHAS.`,
        pedido: `<cliente>${cliente} (rubro ${p.rubro || p.industria || 'sin cargar'})</cliente>
<objetivo>${m.objetivo || 'vender más por Instagram'}</objetivo>
<cuentas_leidas_con_meta>
${cuentas.map(textoCuenta).join('\n\n')}
</cuentas_leidas_con_meta>`,
      })
      await ctx.db.from('agentes_informes').update({ datos: { parametros: m, cuentas, investigacion } }).eq('id', id)
      await continuar(id)
    } catch (e) {
      console.error(e)
      await ctx.db.from('agentes_informes').update({ estado: 'error', error: e instanceof Error ? e.message : String(e) }).eq('id', id)
    }
  })()
  return { id, trabajo }
}

const T = { type: 'string' }
const LISTA = { type: 'array', items: T }
const obj = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })

const ESQUEMA = obj({
  resumen: T,
  referentes_nuevos: LISTA,
  que_les_funciona: { type: 'array', items: obj({ usuario: T, que: T, ejemplo: T }) },
  tendencias: { type: 'array', items: obj({ titulo: T, detalle: T }) },
  brechas: { type: 'array', items: obj({ que_hacen_ellos: T, que_hace_el_cliente: T, oportunidad: T }) },
  ideas: {
    type: 'array',
    items: obj({
      titulo: T,
      formato: { type: 'string', enum: ['reel', 'carrusel', 'foto', 'historia'] },
      pilar: T,
      gancho: T,
      guion: LISTA,
      caption: T,
      cta: T,
      hashtags: LISTA,
      inspirado_en: T,
      por_que: T,
    }),
  },
  calendario: { type: 'array', items: obj({ dia: T, idea: T }) },
  recomendaciones: LISTA,
  que_ofrecerle: T,
})

export interface Estrategia {
  resumen: string
  referentes_nuevos: string[]
  que_les_funciona: { usuario: string; que: string; ejemplo: string }[]
  tendencias: { titulo: string; detalle: string }[]
  brechas: { que_hacen_ellos: string; que_hace_el_cliente: string; oportunidad: string }[]
  ideas: {
    titulo: string
    formato: 'reel' | 'carrusel' | 'foto' | 'historia'
    pilar: string
    gancho: string
    guion: string[]
    caption: string
    cta: string
    hashtags: string[]
    inspirado_en: string
    por_que: string
  }[]
  calendario: { dia: string; idea: string }[]
  recomendaciones: string[]
  que_ofrecerle: string
}

/** Paso 2: con las cuentas y la investigación, arma la estrategia y las publicaciones */
export async function armarContenido(ctx: Contexto, id: string): Promise<void> {
  const { data: inf } = await ctx.db.from('agentes_informes').select('id, prospecto_id, datos, estado').eq('id', id).maybeSingle()
  if (!inf || inf.estado !== 'trabajando') return
  const datos = (inf.datos ?? {}) as { parametros?: Fila; cuentas?: Cuenta[]; investigacion?: string }
  const m = leerParametrosContenido(datos.parametros ?? {})
  const p = ((await ctx.hub.prospectos()).find((x) => x.id === inf.prospecto_id) ?? {}) as Fila
  const cliente = nombreCliente(p)
  let cuentas = datos.cuentas ?? []

  await conInforme(ctx, id, async () => {
    const { data: catalogo } = await ctx.db.from('servicios').select('nombre, descripcion, precio_implementacion, precio_mensual').eq('activo', true).order('orden')
    const r = await pensarJSON<Estrategia>(ctx, {
      esquema: ESQUEMA,
      timeoutMs: 110_000,
      maxTokens: 12_000,
      sistema: `Sos el estratega de contenido de brixx. Con los datos reales de Instagram (API de Meta) del cliente y de sus referentes, \
y la investigación, armá una estrategia concreta para que el cliente venda más por Instagram. Todo para ESTE cliente y su rubro, en \
español rioplatense con voseo, sin inventar números (los números son los de las cuentas leídas).
- resumen: 2 oraciones para decir en voz alta (dónde está el cliente frente a los referentes y la jugada principal).
- referentes_nuevos: los @usuarios que encontró la investigación (sin @, en minúscula).
- que_les_funciona: 4 a 6 cosas concretas que hacen los referentes y les dan resultado, con un ejemplo real (link o descripción de la publicación).
- tendencias: 3 a 5 del rubro en Argentina ahora (formatos, estética, temas, fechas).
- brechas: 4 a 6 "lo que hacen ellos y el cliente no", con la oportunidad.
- ideas: EXACTAMENTE 8 publicaciones listas para producir, variadas en formato (mayoría reels, que es lo que más rinde) y en pilar \
(producto, inspiración/ambientación, precio/promo, detrás de escena, comunidad/UGC, educativo). Cada una: gancho de los primeros 2 segundos, \
guion paso a paso (escenas del reel o slides del carrusel, 3 a 6), caption listo para pegar (con emojis medidos), CTA (WhatsApp, link, \
guardar, comentar), 5 a 10 hashtags, en qué publicación o cuenta de la competencia se inspira (@usuario o link) y por qué va a funcionar.
- calendario: las próximas 2 semanas, 4 a 5 publicaciones por semana, usando las ideas por su título y las fechas comerciales que vengan.
- recomendaciones: 4 a 6 cambios de fondo (bio, destacadas, frecuencia, horarios, respuesta a comentarios y mensajes).
- que_ofrecerle: qué servicio de brixx le sumaría (del catálogo, con precio), en 2 oraciones. Si responder comentarios y mensajes es un \
cuello de botella, el asistente de IA en Instagram y WhatsApp.`,
      pedido: `<cliente>${cliente} (rubro ${p.rubro || p.industria || 'sin cargar'})</cliente>
<objetivo>${m.objetivo || 'vender más por Instagram'}</objetivo>
<cuentas_leidas_con_meta>
${cuentas.map(textoCuenta).join('\n\n')}
</cuentas_leidas_con_meta>
<investigacion>
${datos.investigacion ?? '(sin investigación)'}
</investigacion>
<catalogo_brixx>
${(catalogo ?? []).map((s) => `- ${s.nombre}: ${s.descripcion ?? ''} (USD ${s.precio_implementacion} + USD ${s.precio_mensual}/mes)`).join('\n')}
</catalogo_brixx>`,
    })

    // Los referentes que encontró el agente, con sus números reales para la tabla (los que ya están, no se releen)
    const ya = new Set(cuentas.map((c) => c.usuario))
    const nuevos = [...new Set(r.referentes_nuevos.map((u) => usuarioInstagram(u)).filter((u): u is string => !!u && !ya.has(u)))].slice(0, 4)
    if (nuevos.length) cuentas = [...cuentas, ...(await leerCuentas(ctx, nuevos.map((usuario) => ({ usuario, es_cliente: false })), null))]

    await marcarCorrida(ctx, 'contenido', `Competencia y contenido de ${cliente}.`)
    const leidas = cuentas.filter((c) => !c.error)
    return {
      titulo: `Competencia y contenido: ${cliente}`,
      resumen: r.resumen,
      contenido: [
        'COMPARACIÓN (API de Meta)',
        ...leidas.map(
          (c) =>
            `- @${c.usuario}${c.es_cliente ? ' (cliente)' : ''}: ${c.seguidores?.toLocaleString('es-AR')} seguidores · ${c.por_semana ?? 's/d'}/semana · interacción ${c.interaccion_pct ?? 's/d'}%`,
        ),
        '',
        'LO QUE LES FUNCIONA',
        ...r.que_les_funciona.map((x) => `- @${x.usuario.replace(/^@/, '')}: ${x.que} (${x.ejemplo})`),
        '',
        'TENDENCIAS',
        ...r.tendencias.map((x) => `- ${x.titulo}: ${x.detalle}`),
        '',
        'LO QUE HACEN ELLOS Y EL CLIENTE NO',
        ...r.brechas.map((x) => `- ${x.que_hacen_ellos} → ${x.oportunidad}`),
        '',
        'PUBLICACIONES PARA HACER',
        ...r.ideas.map((x, i) => `${i + 1}. [${x.formato}] ${x.titulo} · gancho: "${x.gancho}" · inspirado en ${x.inspirado_en}`),
        '',
        'CALENDARIO (2 SEMANAS)',
        ...r.calendario.map((x) => `- ${x.dia}: ${x.idea}`),
        '',
        'RECOMENDACIONES',
        ...r.recomendaciones.map((x) => `- ${x}`),
        '',
        'QUÉ LE OFRECEMOS',
        r.que_ofrecerle,
      ].join('\n'),
      prospecto_id: (inf.prospecto_id as string) ?? null,
      datos: { parametros: m, cuentas, investigacion: datos.investigacion, estrategia: r },
    }
  })
}
