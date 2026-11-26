-- =====================================================================
-- Brixx Hub — 0030: precios y condiciones de la propuesta de Alcione (COT-0004)
-- Los precios que acordamos para Alcione (sin descuento):
--   Etapa 1 · Bot de WhatsApp con IA ........ USD 840   + USD 100/mes
--   Etapa 2 · Automatizaciones .............. USD 1.050 + USD 60/mes
--   Etapa 2 · Tienda propia (opcional) ...... USD 840   + USD 30/mes
--   Etapa 3 · Sistema de gestión integral .... USD 2.100 + USD 120/mes
-- Forma de pago: 50% al aprobar cada etapa y 50% a la entrega. El abono de
-- cada etapa empieza cuando está funcionando. Se propone arrancar por la etapa 1.
-- Solo toca la COT-0004 ("Bot con IA, automatizaciones y panel de gestión para
-- Alcione"). Idempotente: vuelve a dejar los mismos valores.
-- =====================================================================

do $$
declare
  cid uuid;
begin
  select id into cid from public.cotizaciones
  where titulo ilike 'Bot con IA, automatizaciones y panel de gesti%n%' and estado in ('borrador', 'enviada')
  order by numero desc limit 1;
  if cid is null then
    return;
  end if;

  update public.cotizacion_items set precio_implementacion = 840, precio_mensual = 100
  where cotizacion_id = cid and etapa = 1 and not opcional;
  update public.cotizacion_items set precio_implementacion = 1050, precio_mensual = 60
  where cotizacion_id = cid and etapa = 2 and not opcional;
  update public.cotizacion_items set precio_implementacion = 840, precio_mensual = 30
  where cotizacion_id = cid and etapa = 2 and opcional;
  update public.cotizacion_items set precio_implementacion = 2100, precio_mensual = 120
  where cotizacion_id = cid and etapa = 3 and not opcional;

  update public.cotizaciones set
    moneda = 'USD',
    descuento_pct = 0,
    propuesta = propuesta || jsonb_build_object(
      'plan_texto', 'Cada etapa funciona por sí sola y suma sobre la anterior. Te proponemos arrancar solo con la etapa 1: '
        || 'en pocas semanas ves los resultados en las ventas y, con el asistente andando, seguimos con la tienda y la gestión.',
      'pago', '50% al aprobar cada etapa y 50% a la entrega. Cada etapa se aprueba y se paga por separado.',
      'mantenimiento_nota', 'El abono de cada etapa empieza recién cuando está funcionando: en la etapa 1 son USD 100/mes. Sin permanencia mínima.',
      'aviso', jsonb_build_object('titulo', 'Costos de terceros, a cargo de Alcione',
        'texto', 'Los mensajes que cobra Meta por WhatsApp y el consumo de la IA (unos USD 20 a 60 por mes, según el volumen) y las '
          || 'plataformas que ya usan (Tienda Negocio, Dispac, Dragonfish) se pagan directamente a cada proveedor. Antes de arrancar les pasamos una estimación.'),
      'cierre', 'Empecemos por el asistente: USD 840 + USD 100/mes.'
    )
  where id = cid;
end $$;
