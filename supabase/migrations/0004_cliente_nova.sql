-- =====================================================================
-- Brixx Hub — 0004: primer cliente (Nova Distribuidora) y precios del catálogo
-- Solo datos, sacados de la "Propuesta de inicio" del 4/11/2026.
-- Nova aceptó Tienda online + Análisis de mercado + Meta Ads (USD 420)
-- + mantenimiento USD 50/mes. Instagram de marca (USD 80) quedó afuera.
-- Idempotente: no duplica nada y no pisa precios que ya se hayan cargado a mano.
-- =====================================================================

do $$
declare
  v_nova   uuid;
  v_cot    uuid;
  v_ficha  uuid;
  s_tienda uuid;
  s_analisis uuid;
  s_meta   uuid;
  s_mant   uuid;
begin
  -- -------------------------------------------------------------------
  -- 1. Catálogo de servicios con los precios de la propuesta
  -- -------------------------------------------------------------------
  -- Tienda online y mantenimiento ya existen (0002): se completan solo si siguen sin precio.
  update public.servicios
     set precio_implementacion = 200,
         descripcion = 'Portada, categorías y fichas de producto, carga del catálogo, medios de pago, envíos, botón de WhatsApp y diseño para celular'
   where nombre = 'Tienda online' and precio_implementacion = 0 and precio_mensual = 0;

  update public.servicios
     set precio_mensual = 50,
         descripcion = 'Soporte y actualizaciones, carga de productos y promociones, seguimiento de redes y campañas'
   where nombre = 'Hosting, soporte y mejoras' and precio_implementacion = 0 and precio_mensual = 0;

  insert into public.servicios (nombre, descripcion, precio_implementacion, precio_mensual, orden)
  select v.nombre, v.descripcion, v.impl, 0, v.orden
  from (values
    ('Análisis de mercado',
     'Demanda en Mercado Libre y Google, competencia y precios, margen estimado y ranking de productos recomendados',
     120, 9),
    ('Meta Ads',
     'Cuenta publicitaria y píxel, campañas de prueba, anuncios (imágenes y textos) y reporte de resultados. La inversión en anuncios la paga el cliente a Meta',
     100, 10),
    ('Instagram de marca',
     'Perfil optimizado, historias destacadas, 9 publicaciones diseñadas con sus textos y grilla coherente con la tienda',
     80, 11)
  ) as v(nombre, descripcion, impl, orden)
  where not exists (select 1 from public.servicios s where lower(s.nombre) = lower(v.nombre));

  select id into s_tienda   from public.servicios where nombre = 'Tienda online' limit 1;
  select id into s_analisis from public.servicios where nombre = 'Análisis de mercado' limit 1;
  select id into s_meta     from public.servicios where nombre = 'Meta Ads' limit 1;
  select id into s_mant     from public.servicios where nombre = 'Hosting, soporte y mejoras' limit 1;

  -- -------------------------------------------------------------------
  -- 2. Cliente: Nova Distribuidora (si no se cargó ya a mano)
  -- -------------------------------------------------------------------
  select id into v_ficha from public.fichas where url = 'https://nova-catalogo-mayorista.netlify.app/' limit 1;

  select id into v_nova from public.prospectos where empresa ilike 'Nova%' order by created_at limit 1;
  if v_nova is null then
    insert into public.prospectos
      (nombre, empresa, rubro, etapa, valor_estimado, moneda, proxima_accion, ficha_demo_id, notas, orden)
    values
      ('José María Salvatierra', 'Nova Distribuidora',
       'Distribuidora · tecnología, hogar y energía solar',
       'implementacion', 420, 'USD',
       'Publicar la tienda (arranca el mantenimiento de USD 50/mes)',
       v_ficha,
       'Primer cliente activo. Contrató Tienda online, Análisis de mercado y Meta Ads (USD 420). '
       || 'No tomó Instagram de marca (USD 80): ofrecerlo en la etapa 2. '
       || 'La inversión en Meta Ads la paga Nova directo a Meta.',
       coalesce((select max(orden) from public.prospectos where etapa = 'implementacion'), 0) + 1)
    returning id into v_nova;
  end if;

  -- -------------------------------------------------------------------
  -- 3. Cotización aceptada (solo lo que contrató)
  -- -------------------------------------------------------------------
  select id into v_cot from public.cotizaciones
   where prospecto_id = v_nova and titulo = 'Propuesta de inicio' limit 1;
  if v_cot is null then
    insert into public.cotizaciones (prospecto_id, titulo, estado, fecha, valida_hasta, moneda, descuento_pct, notas)
    values (v_nova, 'Propuesta de inicio', 'aceptada', '2026-11-04', '2026-11-19', 'USD', 0,
            'Forma de pago: 50% al aprobar la propuesta y 50% a la entrega. '
            || 'Valores en USD; se pueden abonar en pesos al cambio del día de pago. '
            || 'El mantenimiento mensual comienza al publicar la tienda, sin permanencia mínima. '
            || 'La inversión publicitaria en Meta Ads no está incluida: la paga Nova directo a Meta.')
    returning id into v_cot;

    insert into public.cotizacion_items (cotizacion_id, servicio_id, descripcion, cantidad, precio_implementacion, precio_mensual, orden)
    values
      (v_cot, s_tienda,   'Tienda online — portada, categorías y fichas de producto, carga del catálogo inicial, medios de pago, envíos, botón de WhatsApp y diseño para celular', 1, 200, 0, 0),
      (v_cot, s_analisis, 'Análisis de mercado — demanda en Mercado Libre y Google, competencia y precios, margen estimado y ranking de productos recomendados', 1, 120, 0, 1),
      (v_cot, s_meta,     'Meta Ads — cuenta publicitaria y píxel, campañas de prueba, anuncios y reporte de resultados', 1, 100, 0, 2),
      (v_cot, s_mant,     'Mantenimiento mensual — soporte y actualizaciones de la tienda, carga de productos nuevos y promociones, seguimiento de las campañas', 1, 0, 50, 3);
  end if;

  -- -------------------------------------------------------------------
  -- 4. Cobro: pagó los USD 420 de la implementación
  -- -------------------------------------------------------------------
  if not exists (select 1 from public.cobros where prospecto_id = v_nova and monto = 420) then
    insert into public.cobros (fecha, monto, moneda, concepto, prospecto_id, cotizacion_id, notas)
    values ('2026-11-11', 420, 'USD', 'anticipo', v_nova, v_cot,
            'Pago total de la implementación (Tienda, Análisis de mercado y Meta Ads). Revisar la fecha real del pago.');
  end if;
end $$;
