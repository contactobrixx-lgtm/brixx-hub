-- =====================================================================
-- Brixx Hub — 0028: la propuesta de Alcione va en la COT-0004
-- Hay dos carpetas de Alcione ("Alcione" y "Alcione Deco"). La 0027 tomó la
-- primera que encontró y cargó la propuesta en su cotización abierta (la de
-- tienda online y Meta Ads), no en la COT-0004 ("Bot con IA, automatizaciones
-- y panel de gestión para Alcione"), que es la que se manda.
-- Esta migración:
-- 1. Pasa los textos, las etapas y el video a la COT-0004 (si todavía no los
--    tiene) y le arma la tarjeta de cada servicio y la tienda propia opcional,
--    sin tocar sus precios ni su título.
-- 2. Deja la otra cotización como estaba antes de la 0027 (sin propuesta y sin
--    el ítem opcional que se le agregó).
-- 3. Lleva el video "para nosotros" de Alcione (0026) a la carpeta de la COT-0004.
-- Idempotente: si ya está todo en su lugar, no cambia nada.
-- =====================================================================

do $$
declare
  destino uuid;
  destino_pid uuid;
  origen uuid;
  s record;
  orden_max int;
begin
  -- La COT-0004: la cotización abierta "Bot con IA, automatizaciones…" de Alcione (la más reciente si hubiera más)
  select c.id, c.prospecto_id into destino, destino_pid
  from public.cotizaciones c
  where c.titulo ilike 'Bot con IA, automatizaciones y panel de gesti%n%' and c.estado in ('borrador', 'enviada')
  order by c.numero desc limit 1;
  if destino is null then
    return;
  end if;

  -- Donde quedó la propuesta por error (cualquier otra cotización con la propuesta de Alcione)
  select id into origen from public.cotizaciones
  where id <> destino and propuesta ->> 'subtitulo' = 'en automatización y gestión.'
  order by numero desc limit 1;

  -- 1. La propuesta en la COT-0004
  if (select propuesta from public.cotizaciones where id = destino) = '{}'::jsonb then
    if origen is not null then
      update public.cotizaciones d set
        introduccion = o.introduccion, video_url = o.video_url, etapas = o.etapas, propuesta = o.propuesta
      from public.cotizaciones o
      where d.id = destino and o.id = origen;
    else
      update public.cotizaciones set
        introduccion = 'Una propuesta en tres etapas para que Alcione atienda y venda a toda hora, opere su tienda online sin cargar nada '
          || 'a mano y tenga el control de ventas, stock y caja desde el celular, sin sumar personal.',
        video_url = '/material/propuesta-alcione-deco.html',
        etapas = jsonb_build_array(
          jsonb_build_object('titulo', 'Asistente con IA en WhatsApp', 'plazo', '3 a 4 semanas',
            'detalle', 'Atiende y vende a toda hora, entrenado con sus chats y su catálogo.'),
          jsonb_build_object('titulo', 'Tienda online automática', 'plazo', '4 a 5 semanas',
            'detalle', 'Dragonfish, Tienda Negocio y Dispac conectados: nada se carga a mano. Opcional: tienda propia con diseño.'),
          jsonb_build_object('titulo', 'Sistema de gestión integral', 'plazo', '6 a 8 semanas',
            'detalle', 'Ventas, caja, stock y conciliaciones en el celular, con las dos primeras etapas andando.')
        ),
        propuesta = jsonb_build_object('subtitulo', 'en automatización y gestión.', 'cierre', 'Empecemos por el asistente.',
          'telefono', '+54 9 381 582-3919', 'validez', 'Esta propuesta es válida por 15 días.')
      where id = destino;
    end if;
  end if;

  update public.cotizacion_items set etapa = 1,
    resumen = coalesce(resumen, 'Un asistente que atiende y vende a toda hora.'),
    incluye = case when incluye = '[]'::jsonb then '["Entrenado con los chats y el catálogo de Alcione.", "Consulta el stock y manda el link del producto.", "Sugiere combinaciones y avisa del envío gratis.", "Deriva al equipo los pedidos especiales."]'::jsonb else incluye end,
    entregable = coalesce(entregable, 'asistente activo en el WhatsApp de Alcione.')
  where cotizacion_id = destino and public.nombre_comparable(descripcion) like 'botdewhatsapp%' and etapa is null;

  update public.cotizacion_items set etapa = 2,
    resumen = coalesce(resumen, 'La tienda online se actualiza sola.'),
    incluye = case when incluye = '[]'::jsonb then '["Productos, precios y stock de Dragonfish a Tienda Negocio.", "Pedidos de la tienda enviados solos a Dispac.", "Avisos de stock bajo y de pedidos nuevos.", "Nada se carga a mano."]'::jsonb else incluye end,
    entregable = coalesce(entregable, 'tienda y envíos conectados a Dragonfish.')
  where cotizacion_id = destino and public.nombre_comparable(descripcion) like 'automatizacion%' and etapa is null;

  update public.cotizacion_items set etapa = 3,
    resumen = coalesce(resumen, 'Todo el negocio en el celular.'),
    incluye = case when incluye = '[]'::jsonb then '["Ventas del local, la tienda y WhatsApp en un panel.", "Medios de pago, caja y conciliaciones.", "Stock crítico y liquidación de la recaudadora.", "Conectado a Dragonfish, sin Excel manuales."]'::jsonb else incluye end,
    entregable = coalesce(entregable, 'panel de gestión en el celular de los socios.')
  where cotizacion_id = destino and public.nombre_comparable(descripcion) like 'sistemadegestion%' and etapa is null;

  if not exists (select 1 from public.cotizacion_items where cotizacion_id = destino and opcional) then
    select coalesce(max(orden), 0) into orden_max from public.cotizacion_items where cotizacion_id = destino;
    select id, coalesce(precio_implementacion, 0) as impl, coalesce(precio_mensual, 0) as mensual into s
    from public.servicios where public.nombre_comparable(nombre) like 'tiendaonline%' and activo order by orden limit 1;
    insert into public.cotizacion_items (cotizacion_id, servicio_id, descripcion, cantidad, precio_implementacion, precio_mensual, orden,
                                         etapa, opcional, resumen, incluye, entregable)
    values (destino, s.id, 'Tienda propia con diseño a medida', 1, coalesce(s.impl, 0), coalesce(s.mensual, 0), orden_max + 1,
            2, true, 'Si Tienda Negocio no alcanza o quieren subir de diseño.',
            '["Mockup del diseño antes de arrancar.", "Tienda a medida con la estética de Alcione.", "Conectada a Dragonfish, Mercado Pago y Dispac.", "Sin restricciones para automatizar."]'::jsonb,
            'tienda propia publicada.');
  end if;

  -- 2. La otra cotización, como estaba
  if origen is not null then
    update public.cotizaciones set introduccion = null, video_url = null, etapas = '[]'::jsonb, propuesta = '{}'::jsonb where id = origen;
    delete from public.cotizacion_items where cotizacion_id = origen and opcional and descripcion = 'Tienda propia con diseño a medida';
    update public.cotizacion_items set etapa = null, resumen = null, incluye = '[]'::jsonb, entregable = null where cotizacion_id = origen;
  end if;

  -- 3. El video "para nosotros" de Alcione, en la carpeta de la COT-0004
  if destino_pid is not null then
    update public.videos set prospecto_id = destino_pid
    where pedido_por = 'brixx' and enfoque = 'interno' and titulo ilike '%Alcione%' and prospecto_id is distinct from destino_pid;
  end if;
end $$;
