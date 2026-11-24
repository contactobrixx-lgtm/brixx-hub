// Agente "auditor": diagnóstico de la web y las redes de un cliente (o cliente potencial), con puntaje,
// lo que está bien, lo que conviene mejorar y qué le ofreceríamos. Termina con un mensaje para mandarle
// el diagnóstico como "regalo" para abrir la conversación. Mira la web; no publica ni manda nada.
import { conInforme, empezarInforme, investigar, marcarCorrida, nombreCliente, separarResumen, type Contexto } from './comun.ts'

/** Separa la sección final "MENSAJE PARA EL CLIENTE" del resto */
function separarMensaje(texto: string): { cuerpo: string; mensaje: string | null } {
  const m = texto.match(/\n\s*MENSAJE PARA EL CLIENTE:?\s*\n([\s\S]+)$/i)
  if (!m) return { cuerpo: texto, mensaje: null }
  return { cuerpo: texto.slice(0, m.index).trim(), mensaje: m[1].trim() }
}

export async function auditar(ctx: Contexto, prospectoId: string): Promise<{ id: string; trabajo: Promise<void> }> {
  const p = (await ctx.hub.prospectos()).find((x) => x.id === prospectoId)
  if (!p) throw new Error('No encontré ese cliente.')
  const cliente = nombreCliente(p)
  const id = await empezarInforme(ctx, 'auditor', null, { titulo: `Auditoría de redes y web: ${cliente}`, prospecto_id: prospectoId })
  if (!id) throw new Error('No se pudo crear el informe.')

  const trabajo = conInforme(ctx, id, async () => {
    const texto = await investigar(ctx, {
      web: true,
      vueltas: 6,
      topeMs: 120_000,
      sistema: `Sos el auditor digital de brixx. Hacé un diagnóstico honesto y útil de la presencia digital del negocio: su web, su Instagram \
(y otras redes si aparecen), cómo atiende (WhatsApp, respuesta, turnos o pedidos online) y cómo vende online.
Primero mirá la carpeta del cliente en el hub (clientes_y_prospectos). Después la web: abrí su sitio y buscá su Instagram y reseñas. \
Para Instagram usá la herramienta instagram (datos reales de la API de Meta: seguidores, frecuencia, interacción, formatos y mejores \
publicaciones): esos números son los que valen y van en el informe. Si la cuenta es personal o la API no está conectada, usá lo que aparezca en buscadores y decilo. No inventes seguidores, precios ni datos: lo que no pudiste ver, se aclara.
Formato (texto plano, máximo 45 líneas):
RESUMEN: una o dos oraciones con lo más importante.
PUNTAJE (0 a 10, con una frase de por qué)
- Web:
- Instagram y redes:
- Atención y respuesta:
- Venta online:
LO QUE ESTÁ BIEN
LO QUE CONVIENE MEJORAR (de más a menos impacto)
3 MEJORAS RÁPIDAS (que puede hacer esta semana, sin nosotros)
QUÉ LE OFRECERÍAMOS (servicios del catálogo de brixx, con precio)
MENSAJE PARA EL CLIENTE:
Un WhatsApp corto y generoso: le contás 2 o 3 hallazgos concretos y las mejoras rápidas, sin vender de entrada, y le ofrecés charlar. Voseo, firmado "brixx".`,
      pedido: `<cliente>${cliente} (contacto ${p.nombre}; rubro ${p.rubro || p.industria || 'sin cargar'})</cliente>
<web>${p.web || 'no cargada: buscala'}</web>
<instagram>${p.instagram || 'no cargado: buscalo'}</instagram>`,
    })
    const { resumen, contenido } = separarResumen(texto)
    const { cuerpo, mensaje } = separarMensaje(contenido)
    await marcarCorrida(ctx, 'auditor', `Auditoría de ${cliente}.`)
    return {
      titulo: `Auditoría de redes y web: ${cliente}`,
      resumen,
      contenido: cuerpo,
      prospecto_id: prospectoId,
      datos: mensaje ? { mensajes: [{ prospecto_id: prospectoId, cliente, contacto: p.nombre, telefono: p.telefono ?? null, tipo: 'auditoria', texto: mensaje }] } : {},
    }
  })
  return { id, trabajo }
}
