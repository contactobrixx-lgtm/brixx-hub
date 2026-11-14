-- =====================================================================
-- Brixx Hub — 0008: prospecto Paradisi (Yerba Buena) y sus demos web
-- Solo datos. Carta digital + panel del local armados como demo comercial
-- y publicados en Netlify; la propuesta de una página (PDF con QR) va al dueño.
-- Idempotente: cada ficha se busca por URL y el prospecto por empresa;
-- no duplica ni pisa lo que se haya editado en el hub.
-- =====================================================================

do $$
declare
  v_carta uuid;
begin
  -- -------------------------------------------------------------------
  -- 1. Fichas en Demos web: la carta y el panel del local
  -- -------------------------------------------------------------------
  insert into public.fichas (seccion, nombre, cliente, categoria, descripcion, url, modo_apertura, estado, etiquetas, orden)
  select 'demo', 'Paradisi — Carta digital', 'Paradisi', 'Carta digital',
         'Carta digital con QR para la cafetería-panadería Paradisi (Yerba Buena): favoritos de la casa, '
         || 'productos de elaboración propia en video, carta completa con detalle y opciones, '
         || 'mi selección para mostrar al mozo, asistente con IA y reseñas de Google.',
         'https://paradisidigital.netlify.app/', 'iframe', 'activo',
         array['carta digital', 'qr', 'gastronomía'],
         coalesce((select max(orden) from public.fichas where seccion = 'demo'), 0) + 1
  where not exists (select 1 from public.fichas where url = 'https://paradisidigital.netlify.app/');

  insert into public.fichas (seccion, nombre, cliente, categoria, descripcion, url, modo_apertura, estado, etiquetas, orden)
  select 'demo', 'Paradisi — Panel del local', 'Paradisi', 'Carta digital',
         'Panel para el dueño: edición de precios y productos al instante, agotados, '
         || 'historial de cambios y métricas (más vistos, buscados, favoritos y preguntas al asistente). '
         || 'Demo: usuario paradisi, contraseña demo.',
         'https://paradisidigital.netlify.app/panel.html', 'iframe', 'activo',
         array['carta digital', 'panel', 'métricas'],
         coalesce((select max(orden) from public.fichas where seccion = 'demo'), 0) + 1
  where not exists (select 1 from public.fichas where url = 'https://paradisidigital.netlify.app/panel.html');

  select id into v_carta from public.fichas where url = 'https://paradisidigital.netlify.app/' limit 1;

  -- -------------------------------------------------------------------
  -- 2. Prospecto en etapa "demo", con la carta vinculada
  -- -------------------------------------------------------------------
  if not exists (select 1 from public.prospectos where empresa ilike 'Paradisi%') then
    insert into public.prospectos
      (nombre, empresa, rubro, telefono, etapa, moneda, proxima_accion, ficha_demo_id, notas, orden)
    values
      ('Paradisi', 'Paradisi',
       'Cafetería · panadería y pastelería · Yerba Buena (Bascary 291)',
       '+54 381 674-9305',
       'demo', 'ARS',
       'Enviar al dueño la propuesta (PDF de una página con QR a la carta)',
       v_carta,
       'Demo de carta digital + panel del local lista y publicada en paradisidigital.netlify.app. '
       || 'Instagram @paradisiok · 4,5 ★ con 691 reseñas en Google. '
       || 'La carta física tiene precios desactualizados: pedir la lista vigente y fotos reales si avanza. '
       || 'Nombre del dueño pendiente: completarlo desde el hub.',
       coalesce((select max(orden) from public.prospectos where etapa = 'demo'), 0) + 1);
  end if;
end $$;
