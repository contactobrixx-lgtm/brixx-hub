// Agente "meta_ads": el skill campanas-meta-ads llevado al hub. Investiga la marca, la competencia, las
// ofertas y la página de ventas, y arma la propuesta de campaña de validación (3 a 5 productos u ofertas,
// 3 ángulos cada uno, cortes y plan por día) con la misma estructura que el PDF del skill
// (plugins/brixx/skills/campanas-meta-ads/ejemplo-datos.json). El hub la muestra lista para imprimir.
// REGLA DE ORO: nunca crea, activa ni toca campañas en Meta. La carga la hace un socio a mano.
//
// Va en dos pasos (cada uno en su propia llamada a la función, por el tope de tiempo):
//   1. investigar (con la web)  → guarda la investigación en el informe
//   2. armar (JSON con esquema) → calcula los techos (CPA, máx. por evento, CPC, CPM) y deja la campaña
import { ahoraAR, conInforme, empezarInforme, investigar, marcarCorrida, nombreCliente, pensarJSON, type Contexto, type Fila } from './comun.ts'

export interface ParametrosMeta {
  tipo: 'fisico' | 'infoproducto'
  presupuesto_dia: number
  dias: number
  moneda: 'ARS' | 'USD'
  temporada: string
  productos: string
  pagina: string
  notas: string
}

export function leerParametros(e: Fila): ParametrosMeta {
  const n = (v: unknown, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d)
  const s = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 1500) : '')
  return {
    tipo: e.tipo === 'infoproducto' ? 'infoproducto' : 'fisico',
    presupuesto_dia: n(e.presupuesto_dia, 20000),
    dias: Math.min(14, Math.round(n(e.dias, 3))),
    moneda: e.moneda === 'USD' ? 'USD' : 'ARS',
    temporada: s(e.temporada),
    productos: s(e.productos),
    pagina: s(e.pagina),
    notas: s(e.notas),
  }
}

const texto = { type: 'string' }
const ESQUEMA = {
  type: 'object',
  properties: {
    resumen: texto,
    subtitulo: texto,
    descripcion: texto,
    productos_titulo: texto,
    columna_promo: texto,
    nota_supuestos: texto,
    productos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nombre: texto,
          codigo: texto,
          costo: { type: 'number' },
          venta: { type: 'number' },
          comision_pct: { type: 'number' },
          promo_label: texto,
          promo: texto,
          angulos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                tipo: { type: 'string', enum: ['video', 'imagen'] },
                pack: { type: 'boolean' },
                bg: texto,
                nombre: texto,
                overlay: texto,
                brief: texto,
                texto: texto,
                titulo: texto,
              },
              required: ['tipo', 'pack', 'bg', 'nombre', 'overlay', 'brief', 'texto', 'titulo'],
              additionalProperties: false,
            },
          },
        },
        required: ['nombre', 'codigo', 'costo', 'venta', 'comision_pct', 'promo_label', 'promo', 'angulos'],
        additionalProperties: false,
      },
    },
    antes_de_lanzar: { type: 'array', items: texto },
    reglas: { type: 'array', items: texto },
    auditoria_titulo: texto,
    auditoria: { type: 'array', items: texto },
  },
  required: ['resumen', 'subtitulo', 'descripcion', 'productos_titulo', 'columna_promo', 'nota_supuestos', 'productos', 'antes_de_lanzar', 'reglas', 'auditoria_titulo', 'auditoria'],
  additionalProperties: false,
}

interface Producto {
  nombre: string
  codigo: string
  costo: number
  venta: number
  comision_pct: number
  promo_label: string
  promo: string
  angulos: Fila[]
}

const pedidoTexto = (cliente: string, p: Fila, m: ParametrosMeta) => `<cliente>${cliente} (rubro ${p.rubro || p.industria || 'sin cargar'})</cliente>
<web>${p.web || 'no cargada'}</web> <instagram>${p.instagram || 'no cargado'}</instagram>
<tipo>${m.tipo === 'infoproducto' ? 'infoproducto' : 'productos físicos'}</tipo>
<presupuesto>${m.moneda === 'USD' ? 'US$' : '$'} ${m.presupuesto_dia} por día × ${m.dias} días</presupuesto>
<temporada_u_objetivo>${m.temporada || 'la fecha comercial más cercana'}</temporada_u_objetivo>
<productos_costos_y_precios>${m.productos || 'no los pasaron: investigalos en la web o tienda'}</productos_costos_y_precios>
<pagina_de_ventas>${m.pagina || p.web || 'no la pasaron'}</pagina_de_ventas>
<notas>${m.notas || '—'}</notas>`

/** Paso 1: arranca el informe e investiga. `continuar` dispara el paso 2 (otra llamada a la función). */
export async function empezarMeta(ctx: Contexto, prospectoId: string, m: ParametrosMeta, continuar: (id: string) => Promise<void>): Promise<{ id: string; trabajo: Promise<void> }> {
  const p = (await ctx.hub.prospectos()).find((x) => x.id === prospectoId)
  if (!p) throw new Error('No encontré ese cliente.')
  const cliente = nombreCliente(p)
  const id = await empezarInforme(ctx, 'meta_ads', null, { titulo: `Campaña Meta Ads: ${cliente}`, prospecto_id: prospectoId, datos: { parametros: m } })
  if (!id) throw new Error('No se pudo crear el informe.')

  const trabajo = (async () => {
    try {
      const investigacion = await investigar(ctx, {
        web: true,
        vueltas: 6,
        topeMs: 105_000,
        sistema: `Sos el investigador de campañas de Meta Ads de brixx. Prepará la base para una campaña de VALIDACIÓN de 3 a 5 productos u ofertas.
Consultá primero la carpeta del cliente en el hub (clientes_y_prospectos). Después la web:
- La marca: web o tienda, Instagram, tono de voz, colores (códigos hex si los ves), productos destacados y sus precios.
- Competencia: 3 a 5 competidores directos (tiendas, Mercado Libre, Hotmart, Instagram): precios, ofertas, bonus, garantías, envío, cuotas.
- Anuncios validados: si podés, la Biblioteca de anuncios de Meta (facebook.com/ads/library); si no se deja leer, decilo. Ángulos, ganchos y ofertas que se repiten.
- Ofertas del mercado (packs, 2x, % por transferencia, envío gratis) y la fecha comercial que aplica.
- Auditoría de la página de ventas a la que va a llegar el anuncio: promesa arriba, oferta, prueba, objeciones, botón de compra, coherencia con el Instagram.
- Candidatos: 3 a 5 productos u ofertas con alto poder visual, margen que aguante el costo de adquisición y demanda; con costo y precio si los hay.
No inventes precios ni métricas: lo que no verificaste, marcalo como "supuesto". Entregá todo en texto plano, ordenado, hasta 60 líneas.`,
        pedido: pedidoTexto(cliente, p, m),
      })
      await ctx.db.from('agentes_informes').update({ datos: { parametros: m, investigacion } }).eq('id', id)
      await continuar(id)
    } catch (e) {
      console.error(e)
      await ctx.db.from('agentes_informes').update({ estado: 'error', error: e instanceof Error ? e.message : String(e) }).eq('id', id)
    }
  })()
  return { id, trabajo }
}

const redondeo = (n: number, moneda: string) => (moneda === 'USD' ? Math.round(n) : Math.round(n / 50) * 50)
const plata = (n: number, moneda: string) => `${moneda === 'USD' ? 'US$ ' : '$'}${Math.max(0, redondeo(n, moneda)).toLocaleString('es-AR')}`

/** Paso 2: con la investigación guardada, arma la campaña (estructura del PDF del skill) y calcula los techos. */
export async function armarMeta(ctx: Contexto, id: string, tipoDeCambio: number | null): Promise<void> {
  const { data: inf } = await ctx.db.from('agentes_informes').select('id, prospecto_id, datos, estado').eq('id', id).maybeSingle()
  if (!inf || inf.estado !== 'trabajando') return
  const datos = (inf.datos ?? {}) as { parametros?: Fila; investigacion?: string }
  const m = leerParametros(datos.parametros ?? {})
  const p = (await ctx.hub.prospectos()).find((x) => x.id === inf.prospecto_id) ?? {}
  const cliente = nombreCliente(p as Fila)

  await conInforme(ctx, id, async () => {
    const r = await pensarJSON<{
      resumen: string
      subtitulo: string
      descripcion: string
      productos_titulo: string
      columna_promo: string
      nota_supuestos: string
      productos: Producto[]
      antes_de_lanzar: string[]
      reglas: string[]
      auditoria_titulo: string
      auditoria: string[]
    }>(ctx, {
      esquema: ESQUEMA,
      maxTokens: 12000,
      timeoutMs: 125_000,
      sistema: `Sos el estratega de campañas de Meta Ads de brixx. Con la investigación, armá la propuesta de campaña de validación.
- productos: 3 a 5 productos u ofertas (infoproducto: pueden ser ofertas del mismo producto). costo y venta en números (${m.moneda}); \
físico: precio sugerido ≈ 2 a 2,2 × costo, redondeado a $X.900 y comparado con la competencia; infoproducto: costo 0 y comision_pct = la comisión real de la plataforma (físico: 0). \
codigo: modelo o SKU si lo hay (si no, vacío). promo_label corto ("Pack x2", "Navidad") y promo (precio o beneficio, ej. "$99.900" o "10% OFF transferencia").
- angulos: EXACTAMENTE 3 por producto, en este orden: 1) Dolor / solución (infoproducto: dolor / transformación), tipo video; \
2) Oferta / pack / urgencia (infoproducto: oferta, bonus, garantía), tipo imagen (pack true si son 2 unidades); 3) Curiosidad / demostración, tipo video.
  overlay: máx. 7 palabras. texto: gancho en las 2 primeras líneas, beneficios con ✔ y CTA, máx. ~330 caracteres, con saltos de línea (\\n). titulo: máx. 40 caracteres. \
En la oferta escribí {promo} y {venta} donde va el precio. brief: 1 línea de qué se ve. bg: color hex de la marca para el fondo de la maqueta.
- Reglas: sin precios tachados si nunca se vendió a ese precio; "envío gratis" solo donde aplica; sin promesas médicas, de ingresos ni resultados garantizados; \
lo no verificado va a antes_de_lanzar.
- descripcion: una línea común a todos los anuncios (envíos o acceso inmediato + cuotas). subtitulo: la temporada (ej. "Navidad 2026"). productos_titulo: "N productos a validar".
- columna_promo: título de la columna de promos (ej. "Promo Navidad"). nota_supuestos: qué es supuesto y falta confirmar (1 o 2 oraciones).
- antes_de_lanzar: 3 a 5 ítems. reglas: 3 a 5 ítems de la promo.
- auditoria: 4 a 6 ajustes de la página de ventas; si está bien hecha, lo que hay que mantener igual en el anuncio ("Coincidencia anuncio–página"). auditoria_titulo acorde.
- resumen: 1 o 2 oraciones para decir en voz alta.`,
      pedido: `${pedidoTexto(cliente, p as Fila, m)}\n\n<investigacion>\n${datos.investigacion ?? '(sin investigación)'}\n</investigacion>`,
    })

    const mon = m.moneda
    const productos = r.productos.slice(0, 5)
    if (productos.length < 3) throw new Error('La campaña salió con menos de 3 productos.')
    const n = productos.length
    const porConjunto = m.presupuesto_dia / n
    const porConjuntoUSD = mon === 'USD' ? porConjunto : tipoDeCambio ? porConjunto / tipoDeCambio : porConjunto / 1200
    const info = m.tipo === 'infoproducto'
    const presupuestoBajo = porConjuntoUSD < 10
    const evento = presupuestoBajo ? (info ? 'Iniciar pago' : 'Agregar al carrito') : 'Compra'
    const corto = presupuestoBajo ? (info ? 'pago' : 'carrito') : 'compra'

    const filas = productos.map((pr, i) => {
      const venta = Number(pr.venta) || 0
      const costo = info ? 0 : Number(pr.costo) || 0
      const cpa = venta - costo - venta * 0.1 - venta * ((Number(pr.comision_pct) || 0) / 100)
      const maxEvento = cpa * 0.25
      const cpc = maxEvento * 0.05
      return {
        key: `p${i + 1}`,
        nombre: pr.nombre,
        codigo: pr.codigo,
        costo: info ? '—' : plata(costo, mon),
        venta: plata(venta, mon),
        promo_label: pr.promo_label,
        promo: pr.promo,
        cpa: plata(cpa, mon),
        max_evento: plata(maxEvento, mon),
        cpc: plata(cpc, mon),
        cpm: plata(cpc * 10, mon),
        angulos: pr.angulos.slice(0, 3).map((a) => ({ ...a, bg: /^#[0-9a-f]{6}$/i.test(String(a.bg)) ? a.bg : '#1B1B1F' })),
      }
    })
    const total = m.presupuesto_dia * m.dias
    const campana = {
      cliente,
      fecha: new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'long', year: 'numeric' }),
      contacto: '+54 9 381 582-3919',
      titulo: 'Campaña de validación Meta Ads',
      subtitulo: r.subtitulo,
      descripcion: r.descripcion,
      cta: info ? 'Más información ›' : 'Comprar ›',
      leyenda_video: info ? 'video editado (clase, testimonio o vista previa)' : 'video del proveedor editado',
      leyenda_imagen: 'pieza fija (ChatGPT / diseño)',
      campos: {
        presupuesto_dia: plata(m.presupuesto_dia, mon),
        dias: String(m.dias),
        total: plata(total, mon),
        anuncios: String(presupuestoBajo ? n : n * 3),
        por_anuncio_dia: plata(porConjunto, mon),
      },
      kpis: [
        { label: 'Tipo de campaña', valor: 'Ventas · ABO', nota: 'Presupuesto por conjunto' },
        { label: 'Objetivo', valor: evento, nota: 'Evento de optimización' },
        { label: 'Presupuesto disponible', valor: '{presupuesto_dia} / día', nota: '× {dias} días = {total}' },
        { label: 'Anuncios por campaña', valor: '{anuncios} anuncios', nota: presupuestoBajo ? '1 por producto · 3 ángulos c/u' : '3 por producto (uno por ángulo)' },
        { label: 'Budget por conjunto', valor: '{por_anuncio_dia} / día', nota: `Igual para los ${n} productos` },
        { label: 'Público', valor: 'Advantage+', nota: 'Argentina · 18–65+ · ubicaciones auto.' },
      ],
      productos_titulo: r.productos_titulo,
      columna_promo: r.columna_promo,
      columna_evento: `Máx. ${corto}`,
      nota_productos: `Los valores con fondo azul son editables. CPA de equilibrio = precio − costo − 10% de costos de cobro${info ? ' − comisión de la plataforma' : ''}. Máx. por ${corto} = CPA × 25%; CPC máx. = máx. por ${corto} × 5%; CPM máx. = CPC máx. × 10 (CTR 1%): techos para que los números cierren, no promedios del mercado. ${r.nota_supuestos}`,
      cortes: [
        ['Gancho (vistas 3 s / impr.)', '≥ 25%', '< 15%'],
        ['CPM (por 1.000 impr.)', '≤ CPM máx.', '> 2 × máx.'],
        ['CTR del enlace', '≥ 1%', '< 0,6% con gasto suficiente'],
        ['CPC del enlace', '≤ CPC máx.', '> 2 × máx.'],
        ['Visitas página / clics', '≥ 70%', '< 50%'],
        [`Tasa de ${corto}`, '≥ 5%', '0 con 40 visitas'],
        [`Costo por ${corto}`, `≤ máx. ${corto}`, '> 2 × máx.'],
      ],
      nota_cortes: `Gana el producto con menor costo por ${corto} que pase los cortes. Umbrales de trabajo: el día 1 muestra los números reales de la cuenta.`,
      pasos: [
        ['Día 1', 'No tocar nada: Meta necesita unas 24 h para repartir el presupuesto.'],
        ['Día 2', `Apagar el conjunto con CTR < 0,6% y ningún ${corto}. El resto sigue igual.`],
        ['Día 3', `Ordenar por costo por ${corto}, ver qué ángulo ganó y elegir 1 o 2 productos.`],
        ['Día 4 +', 'Campaña nueva con los ganadores, optimizada por Compra.'],
      ],
      antes_de_lanzar: r.antes_de_lanzar.slice(0, 5),
      reglas: r.reglas.slice(0, 5),
      auditoria: r.auditoria.length ? { titulo: r.auditoria_titulo || 'Página de ventas · ajustes antes de lanzar', items: r.auditoria.slice(0, 6) } : null,
      productos: filas,
    }
    await marcarCorrida(ctx, 'meta_ads', `Campaña para ${cliente} (${n} productos).`)
    const { fecha } = ahoraAR()
    return {
      titulo: `Campaña Meta Ads: ${cliente} · ${r.subtitulo || fecha}`,
      resumen: r.resumen,
      contenido: [
        `${n} productos a validar · objetivo ${evento} · ${plata(m.presupuesto_dia, mon)} por día × ${m.dias} días.`,
        '',
        ...filas.map((f) => `- ${f.nombre}: precio ${f.venta}, promo ${f.promo_label} ${f.promo}, CPA ${f.cpa}`),
        '',
        'Abrí la propuesta para verla, editar precios e imprimirla o guardarla en PDF. La campaña la cargás vos a mano en Meta: el hub nunca la crea.',
      ].join('\n'),
      prospecto_id: (inf.prospecto_id as string) ?? null,
      datos: { parametros: m, investigacion: datos.investigacion, campana },
    }
  })
}
