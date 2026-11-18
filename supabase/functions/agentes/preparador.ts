// Agente "preparador": antes de cada reunión arma el brief: quién es el cliente, qué le duele,
// qué ofrecerle, preguntas para hacer, objeciones probables y competencia (si tiene web o Instagram, mira la web).
import { conInforme, empezarInforme, horaCorta, investigar, marcarCorrida, nombreCliente, separarResumen, type Contexto, type Fila } from './comun.ts'

/** Reuniones que arrancan entre 10 y 100 minutos desde ahora y todavía no tienen brief */
export async function reunionesPorPreparar(ctx: Contexto): Promise<Fila[]> {
  const desde = new Date(Date.now() + 10 * 60_000).toISOString()
  const hasta = new Date(Date.now() + 100 * 60_000).toISOString()
  const { data } = await ctx.db.from('reuniones').select('id, titulo, inicio, prospecto_id, lugar_o_link, notas').gte('inicio', desde).lte('inicio', hasta).order('inicio')
  if (!data?.length) return []
  const { data: hechos } = await ctx.db.from('agentes_informes').select('reunion_id').eq('agente', 'preparador').in('reunion_id', data.map((r) => r.id))
  const listos = new Set((hechos ?? []).map((h) => h.reunion_id))
  return data.filter((r) => !listos.has(r.id))
}

/** La próxima reunión (de ahora en adelante), para "preparame la próxima" */
export async function proximaReunion(ctx: Contexto): Promise<Fila | null> {
  const { data } = await ctx.db
    .from('reuniones')
    .select('id, titulo, inicio, prospecto_id, lugar_o_link, notas')
    .gte('inicio', new Date(Date.now() - 30 * 60_000).toISOString())
    .order('inicio')
    .limit(1)
  return data?.[0] ?? null
}

/**
 * Arma el brief de una reunión. Crea el informe enseguida (en "trabajando") y devuelve su id;
 * el trabajo sigue en `trabajo` (para correrlo en segundo plano). null si ya estaba armado.
 */
export async function prepararReunion(ctx: Contexto, reunion: Fila, manual: boolean): Promise<{ id: string; trabajo: Promise<void> } | null> {
  if (manual) await ctx.db.from('agentes_informes').delete().eq('clave', `preparador:${reunion.id}`)
  const prospecto = reunion.prospecto_id ? (await ctx.hub.prospectos()).find((p) => p.id === reunion.prospecto_id) : null
  const cliente = prospecto ? nombreCliente(prospecto) : null
  const hora = horaCorta(String(reunion.inicio))
  const titulo = `Brief: ${reunion.titulo} (${hora})`
  const id = await empezarInforme(ctx, 'preparador', `preparador:${reunion.id}`, {
    titulo,
    reunion_id: String(reunion.id),
    prospecto_id: (reunion.prospecto_id as string) ?? null,
  })
  if (!id) return null

  const conWeb = !prospecto || Boolean(prospecto.web || prospecto.instagram)
  const trabajo = conInforme(ctx, id, async () => {
    const texto = await investigar(ctx, {
      web: conWeb,
      vueltas: 5,
      topeMs: 100_000,
      sistema: `Sos el agente que prepara las reuniones de brixx. Armá un brief para que el socio entre a la reunión sabiendo todo.
Primero consultá el hub: la carpeta del cliente (clientes_y_prospectos con su nombre), sus grabaciones e intervenciones, cotizaciones y el catálogo.
${conWeb ? 'Si tiene web o Instagram (o no está en el hub), mirá la web para entender el negocio y a 2 o 3 competidores.' : ''}
Formato (texto plano, conciso, máximo 40 líneas):
RESUMEN: una o dos oraciones con lo clave para decir en voz alta (qué quiere y qué le ofrecemos).
QUIÉN ES
QUÉ LE DUELE
QUÉ OFRECERLE (servicios del catálogo, con precios)
PREGUNTAS PARA HACER (3 a 5)
OBJECIONES PROBABLES Y CÓMO RESPONDER
${conWeb ? 'COMPETENCIA (lo que hacen y en qué les ganamos)\n' : ''}OBJETIVO DE LA REUNIÓN (qué tiene que pasar para que sea un éxito)`,
      pedido: `<reunion>${reunion.titulo} · ${hora} hs${reunion.lugar_o_link ? ` · ${reunion.lugar_o_link}` : ''}${reunion.notas ? ` · notas: ${reunion.notas}` : ''}</reunion>
<cliente>${cliente ? `${cliente} (contacto ${prospecto?.nombre}, etapa ${prospecto?.etapa}${prospecto?.web ? `, web ${prospecto.web}` : ''}${prospecto?.instagram ? `, Instagram ${prospecto.instagram}` : ''})` : 'no está vinculada a un cliente del hub: deducilo del título'}</cliente>`,
    })
    const { resumen, contenido } = separarResumen(texto)
    return { titulo, resumen, contenido, reunion_id: String(reunion.id), prospecto_id: (reunion.prospecto_id as string) ?? null }
  }).then(() => marcarCorrida(ctx, 'preparador', `Brief listo: ${reunion.titulo}.`))
  return { id, trabajo }
}
