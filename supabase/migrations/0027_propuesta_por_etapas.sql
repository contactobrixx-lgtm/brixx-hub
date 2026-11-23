-- =====================================================================
-- Brixx Hub — 0027: propuestas por etapas y con video
-- - cotizaciones.introduccion: el texto de la primera hoja (para quién y por qué).
-- - cotizaciones.video_url: el video que se muestra en la segunda hoja
--   (una página del hub "/material/….html", un link de YouTube o un .mp4).
-- - cotizaciones.etapas: [{titulo, detalle}] en orden (Etapa 1, 2, 3…).
-- - cotizacion_items.etapa: a qué etapa pertenece cada ítem (1, 2, 3…; null = sin etapa).
-- - La propuesta de Alcione Deco en borrador, en tres etapas como la
--   pensamos con los socios (bot → tienda automática → sistema de gestión),
--   con los precios del catálogo y el video del setter. Solo si existe la
--   carpeta y todavía no tiene esta propuesta.
-- Idempotente.
-- =====================================================================

alter table public.cotizaciones add column if not exists introduccion text;
alter table public.cotizaciones add column if not exists video_url text;
alter table public.cotizaciones add column if not exists etapas jsonb not null default '[]';
alter table public.cotizacion_items add column if not exists etapa smallint;

do $$
declare
  pid uuid;
  cid uuid;
  s record;
  i int := 0;
begin
  select id into pid from public.prospectos
  where public.nombre_comparable(coalesce(empresa, '')) like '%alcione%' or public.nombre_comparable(nombre) like '%alcione%'
  order by created_at limit 1;
  if pid is null or exists (select 1 from public.cotizaciones where prospecto_id = pid and titulo = 'Propuesta para Alcione Deco') then
    return;
  end if;

  insert into public.cotizaciones (prospecto_id, titulo, estado, fecha, valida_hasta, moneda, descuento_pct, introduccion, video_url, etapas)
  values (
    pid,
    'Propuesta para Alcione Deco',
    'borrador',
    current_date,
    current_date + 15,
    'USD',
    0,
    'Después de nuestra charla, te armamos una propuesta en tres etapas para que Alcione no pierda ventas por consultas sin responder, '
      || 'pueda operar la tienda online sin sumar personal y tenga el control de ventas, stock y caja desde el celular. '
      || 'Arrancamos por lo que más rápido se nota en las ventas y, sobre eso, sumamos las demás etapas. '
      || 'En la página siguiente te mostramos en un video cómo funcionaría.',
    '/material/setter-alcione-deco.html',
    jsonb_build_array(
      jsonb_build_object(
        'titulo', 'Asistente con IA en WhatsApp e Instagram',
        'detalle', 'Responde al instante, entrenado con sus chats: manda el link del producto, sugiere combinaciones para subir el ticket '
          || 'y le pasa al equipo los casos especiales. Es lo primero que se pone en marcha.'),
      jsonb_build_object(
        'titulo', 'Tienda online automática',
        'detalle', 'Los productos y el stock pasan solos de Dragonfish a la tienda y los pedidos se envían a Dispac, sin cargar nada a mano. '
          || 'Si la tienda actual tiene restricciones para automatizar o hace falta mejorar el diseño, en esta etapa armamos una tienda propia para Alcione.'),
      jsonb_build_object(
        'titulo', 'Sistema de gestión integral',
        'detalle', 'Con las dos primeras etapas funcionando: un panel en el celular con ventas, medios de pago, stock, caja, conciliaciones '
          || 'y la liquidación de la recaudadora, conectado a lo que ya usan, para dejar los Excel manuales.')
    )
  )
  returning id into cid;

  -- Un ítem por etapa, con el precio del catálogo de hoy (snapshot, como cualquier cotización)
  for s in
    select e.n, e.patron, e.texto, sv.id as servicio_id, coalesce(sv.precio_implementacion, 0) as impl, coalesce(sv.precio_mensual, 0) as mensual
    from (values
      (1, 'botdewhatsapp%', 'Asistente con IA en WhatsApp e Instagram, entrenado con los chats de Alcione'),
      (2, 'automatizacion%', 'Automatización de la tienda online: productos y stock desde Dragonfish, pedidos a Dispac'),
      (3, 'sistemadegestion%', 'Sistema de gestión integral: ventas, stock, caja y conciliaciones en el celular')
    ) as e(n, patron, texto)
    left join lateral (
      select id, precio_implementacion, precio_mensual from public.servicios
      where public.nombre_comparable(nombre) like e.patron and activo
      order by orden limit 1
    ) sv on true
    order by e.n
  loop
    insert into public.cotizacion_items (cotizacion_id, servicio_id, descripcion, cantidad, precio_implementacion, precio_mensual, orden, etapa)
    values (cid, s.servicio_id, s.texto, 1, s.impl, s.mensual, i, s.n);
    i := i + 1;
  end loop;
end $$;
