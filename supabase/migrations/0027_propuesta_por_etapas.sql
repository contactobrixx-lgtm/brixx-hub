-- =====================================================================
-- Brixx Hub — 0027: propuestas por etapas y con video
-- - cotizaciones.introduccion: el texto de la primera hoja (para quién y por qué).
-- - cotizaciones.video_url: el video que se muestra en la segunda hoja
--   (una página del hub "/material/….html", un link de YouTube o un .mp4).
-- - cotizaciones.etapas: [{titulo, detalle, plazo}] en orden (Etapa 1, 2, 3…).
-- - cotizacion_items.etapa: a qué etapa pertenece cada ítem (1, 2, 3…; null = sin etapa).
-- - cotizacion_items.opcional: se ofrece aparte; se muestra con su precio pero no suma al total.
-- - La propuesta de Alcione Deco en borrador, en tres etapas como la
--   pensamos con los socios (bot de WhatsApp → automatización con Tienda
--   Negocio, con la opción de una tienda propia con diseño → sistema de
--   gestión integral), con plazos, los precios del catálogo y el video de la
--   propuesta. Solo si existe la carpeta y todavía no tiene esta propuesta.
-- Idempotente.
-- =====================================================================

alter table public.cotizaciones add column if not exists introduccion text;
alter table public.cotizaciones add column if not exists video_url text;
alter table public.cotizaciones add column if not exists etapas jsonb not null default '[]';
alter table public.cotizacion_items add column if not exists etapa smallint;
alter table public.cotizacion_items add column if not exists opcional boolean not null default false;

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
      || 'pueda operar la tienda online sin cargar nada a mano ni sumar personal, y tenga el control de ventas, stock y caja desde el celular. '
      || 'Arrancamos por lo que más rápido se nota en las ventas y, sobre eso, sumamos las demás etapas. '
      || 'En la página siguiente te mostramos en un video cómo funcionaría todo junto.',
    '/material/propuesta-alcione-deco.html',
    jsonb_build_array(
      jsonb_build_object(
        'titulo', 'Asistente con IA en WhatsApp',
        'plazo', '3 a 4 semanas',
        'detalle', 'Responde al instante y a toda hora, entrenado con sus chats: consulta el stock, manda el link del producto, sugiere combinaciones '
          || 'para subir el ticket y le pasa al equipo los casos especiales. Incluye relevamiento, entrenamiento, conexión con WhatsApp y una semana de prueba con el equipo.'),
      jsonb_build_object(
        'titulo', 'Tienda online automática',
        'plazo', '4 a 5 semanas',
        'detalle', 'Conectamos la tienda que ya tienen en Tienda Negocio: los productos, precios y stock pasan solos de Dragonfish a la tienda y los pedidos se envían a Dispac, '
          || 'sin cargar nada a mano. Opcional: si Tienda Negocio tiene restricciones para automatizar o quieren subir de nivel el diseño, '
          || 'les armamos una tienda propia con diseño a medida (primero les mostramos el mockup).'),
      jsonb_build_object(
        'titulo', 'Sistema de gestión integral',
        'plazo', '6 a 8 semanas',
        'detalle', 'Con las dos primeras etapas funcionando: un panel en el celular con ventas, medios de pago, stock, caja, conciliaciones '
          || 'y la liquidación de la recaudadora, conectado a Dragonfish y a la tienda, para dejar los Excel manuales.')
    )
  )
  returning id into cid;

  -- Un ítem por etapa, con el precio del catálogo de hoy (snapshot, como cualquier cotización)
  for s in
    select e.n, e.patron, e.texto, e.opcional, sv.id as servicio_id, coalesce(sv.precio_implementacion, 0) as impl, coalesce(sv.precio_mensual, 0) as mensual
    from (values
      (1, 'botdewhatsapp%', 'Asistente con IA en WhatsApp, entrenado con los chats de Alcione', false),
      (2, 'automatizacion%', 'Automatización con Tienda Negocio: productos y stock desde Dragonfish, pedidos a Dispac', false),
      (2, 'tiendaonline%', 'Opcional: tienda propia con diseño a medida (si Tienda Negocio no alcanza o quieren subir de diseño)', true),
      (3, 'sistemadegestion%', 'Sistema de gestión integral: ventas, stock, caja y conciliaciones en el celular', false)
    ) as e(n, patron, texto, opcional)
    left join lateral (
      select id, precio_implementacion, precio_mensual from public.servicios
      where public.nombre_comparable(nombre) like e.patron and activo
      order by orden limit 1
    ) sv on true
    order by e.n, e.opcional
  loop
    insert into public.cotizacion_items (cotizacion_id, servicio_id, descripcion, cantidad, precio_implementacion, precio_mensual, orden, etapa, opcional)
    values (cid, s.servicio_id, s.texto, 1, s.impl, s.mensual, i, s.n, s.opcional);
    i := i + 1;
  end loop;
end $$;
