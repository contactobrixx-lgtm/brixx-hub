-- =====================================================================
-- Brixx Hub — 0027: propuestas comerciales por etapas, con video
-- Una cotización con estos datos se imprime como propuesta (el diseño de la
-- propuesta de Nova: portada, video, punto de partida, servicios e inversión):
-- - cotizaciones.introduccion: el texto de la portada.
-- - cotizaciones.video_url: el video de la segunda hoja ("/material/….html",
--   YouTube o un .mp4).
-- - cotizaciones.etapas: [{titulo, detalle, plazo}] en orden (Etapa 1, 2, 3…).
-- - cotizaciones.propuesta: el resto de los textos {subtitulo, punto_texto,
--   puntos: [{titulo, detalle}], objetivos: [], plan_titulo, plan_texto,
--   mantenimiento: [], mantenimiento_nota, aviso: {titulo, texto}, pago,
--   moneda_texto, validez, cierre, telefono}.
-- - cotizacion_items.etapa: a qué etapa pertenece (null = sin etapa).
-- - cotizacion_items.opcional: se ofrece aparte; se muestra con su precio pero
--   no suma a ningún total.
-- - cotizacion_items.resumen / incluye ([]) / entregable: la tarjeta de cada servicio.
-- Además, la propuesta de Alcione en 3 etapas (como la pensaron los socios):
-- bot de WhatsApp → automatización con Tienda Negocio (tienda propia con diseño
-- como opcional) → sistema de gestión integral, con el video de la propuesta.
-- Se aplica a su cotización abierta más reciente (la COT-0004) sin tocar los
-- precios ni el título; si no tiene ninguna, crea una con los del catálogo.
-- Solo si la carpeta existe y la cotización todavía no tiene propuesta.
-- Idempotente.
-- =====================================================================

alter table public.cotizaciones add column if not exists introduccion text;
alter table public.cotizaciones add column if not exists video_url text;
alter table public.cotizaciones add column if not exists etapas jsonb not null default '[]';
alter table public.cotizaciones add column if not exists propuesta jsonb not null default '{}';
alter table public.cotizacion_items add column if not exists etapa smallint;
alter table public.cotizacion_items add column if not exists opcional boolean not null default false;
alter table public.cotizacion_items add column if not exists resumen text;
alter table public.cotizacion_items add column if not exists incluye jsonb not null default '[]';
alter table public.cotizacion_items add column if not exists entregable text;

do $$
declare
  pid uuid;
  cid uuid;
  s record;
  orden_max int;
begin
  select id into pid from public.prospectos
  where public.nombre_comparable(coalesce(empresa, '')) like '%alcione%' or public.nombre_comparable(nombre) like '%alcione%'
  order by created_at limit 1;
  if pid is null then
    return;
  end if;

  -- Su cotización abierta más reciente (la que mandamos); si no hay, una nueva con los servicios del catálogo
  select id into cid from public.cotizaciones
  where prospecto_id = pid and estado in ('borrador', 'enviada')
  order by numero desc limit 1;

  if cid is null then
    insert into public.cotizaciones (prospecto_id, titulo, estado, fecha, valida_hasta, moneda, descuento_pct)
    values (pid, 'Bot con IA, automatizaciones y panel de gestión para Alcione', 'borrador', current_date, current_date + 15, 'USD', 0)
    returning id into cid;
    insert into public.cotizacion_items (cotizacion_id, servicio_id, descripcion, cantidad, precio_implementacion, precio_mensual, orden)
    select cid, sv.id, case when sv.descripcion is not null then sv.nombre || ' — ' || sv.descripcion else sv.nombre end, 1,
           sv.precio_implementacion, sv.precio_mensual, e.n
    from (values (0, 'botdewhatsapp%'), (1, 'automatizacion%'), (2, 'sistemadegestion%')) as e(n, patron)
    join lateral (
      select * from public.servicios where public.nombre_comparable(nombre) like e.patron and activo order by orden limit 1
    ) sv on true;
  end if;

  if exists (select 1 from public.cotizaciones where id = cid and propuesta <> '{}'::jsonb) then
    return; -- ya tiene su propuesta: no se pisa
  end if;

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
    propuesta = jsonb_build_object(
      'subtitulo', 'en automatización y gestión.',
      'punto_texto', 'Alcione vende en el local, en Instagram, en WhatsApp y en su tienda de Tienda Negocio. El negocio crece, '
        || 'pero buena parte del trabajo sigue siendo manual y depende del tiempo de los socios.',
      'puntos', jsonb_build_array(
        jsonb_build_object('titulo', 'Consultas sin responder', 'detalle', 'Mensajes de Instagram y WhatsApp que llegan fuera de horario o se acumulan, y ventas que se pierden.'),
        jsonb_build_object('titulo', 'Carga manual de productos', 'detalle', 'Productos y stock se pasan a mano de Dragonfish a la tienda, y los pedidos a Dispac.'),
        jsonb_build_object('titulo', 'Caja y reportes en Excel', 'detalle', 'Ventas, medios de pago, conciliaciones y la liquidación de la recaudadora se arman a mano.'),
        jsonb_build_object('titulo', 'Poco control desde el celular', 'detalle', 'Para saber cómo va el negocio hay que estar en el local o frente a la compu.')
      ),
      'objetivos', jsonb_build_array(
        'Que ninguna consulta quede sin respuesta.',
        'Operar la tienda online sin sumar personal.',
        'Sacarles a los socios la carga, la caja y los reportes.',
        'Tener ventas, stock y caja en el celular.'
      ),
      'plan_titulo', 'Arrancamos por lo que más rápido se nota en las ventas',
      'plan_texto', 'Cada etapa funciona por sí sola y suma sobre la anterior: primero el asistente de WhatsApp; con él andando, '
        || 'automatizamos la tienda, y por último integramos la gestión.',
      'mantenimiento', jsonb_build_array('Soporte y mejoras del asistente.', 'Ajustes de las automatizaciones.', 'Seguimiento mensual de resultados.'),
      'mantenimiento_nota', 'Comienza al terminar la etapa 1. Sin permanencia mínima.',
      'aviso', jsonb_build_object('titulo', 'Costos de terceros, a cargo de Alcione',
        'texto', 'Los mensajes que cobra Meta por WhatsApp y las plataformas que ya usan (Tienda Negocio, Dispac, Dragonfish) se pagan '
          || 'directamente a cada proveedor. Antes de arrancar les pasamos una estimación.'),
      'pago', '50% al aprobar cada etapa y 50% a la entrega.',
      'moneda_texto', 'Valores en USD, se pueden abonar en pesos al cambio del día de pago.',
      'validez', 'Esta propuesta es válida por 15 días.',
      'cierre', 'Empecemos por el asistente.',
      'telefono', '+54 9 381 582-3919'
    )
  where id = cid;

  -- Cada servicio, en su etapa y con su tarjeta (sin tocar descripción ni precios)
  update public.cotizacion_items set etapa = 1,
    resumen = 'Un asistente que atiende y vende a toda hora.',
    incluye = '["Entrenado con los chats y el catálogo de Alcione.", "Consulta el stock y manda el link del producto.", "Sugiere combinaciones y avisa del envío gratis.", "Deriva al equipo los pedidos especiales."]'::jsonb,
    entregable = 'asistente activo en el WhatsApp de Alcione.'
  where cotizacion_id = cid and public.nombre_comparable(descripcion) like 'botdewhatsapp%';

  update public.cotizacion_items set etapa = 2,
    resumen = 'La tienda online se actualiza sola.',
    incluye = '["Productos, precios y stock de Dragonfish a Tienda Negocio.", "Pedidos de la tienda enviados solos a Dispac.", "Avisos de stock bajo y de pedidos nuevos.", "Nada se carga a mano."]'::jsonb,
    entregable = 'tienda y envíos conectados a Dragonfish.'
  where cotizacion_id = cid and public.nombre_comparable(descripcion) like 'automatizacion%';

  update public.cotizacion_items set etapa = 3,
    resumen = 'Todo el negocio en el celular.',
    incluye = '["Ventas del local, la tienda y WhatsApp en un panel.", "Medios de pago, caja y conciliaciones.", "Stock crítico y liquidación de la recaudadora.", "Conectado a Dragonfish, sin Excel manuales."]'::jsonb,
    entregable = 'panel de gestión en el celular de los socios.'
  where cotizacion_id = cid and public.nombre_comparable(descripcion) like 'sistemadegestion%';

  -- La tienda propia con diseño, como opcional de la etapa 2 (precio del servicio "Tienda online" del catálogo)
  if not exists (select 1 from public.cotizacion_items where cotizacion_id = cid and opcional) then
    select coalesce(max(orden), 0) into orden_max from public.cotizacion_items where cotizacion_id = cid;
    select id, coalesce(precio_implementacion, 0) as impl, coalesce(precio_mensual, 0) as mensual into s
    from public.servicios where public.nombre_comparable(nombre) like 'tiendaonline%' and activo order by orden limit 1;
    insert into public.cotizacion_items (cotizacion_id, servicio_id, descripcion, cantidad, precio_implementacion, precio_mensual, orden,
                                         etapa, opcional, resumen, incluye, entregable)
    values (cid, s.id, 'Tienda propia con diseño a medida', 1, coalesce(s.impl, 0), coalesce(s.mensual, 0), orden_max + 1,
            2, true, 'Si Tienda Negocio no alcanza o quieren subir de diseño.',
            '["Mockup del diseño antes de arrancar.", "Tienda a medida con la estética de Alcione.", "Conectada a Dragonfish, Mercado Pago y Dispac.", "Sin restricciones para automatizar."]'::jsonb,
            'tienda propia publicada.');
  end if;
end $$;
