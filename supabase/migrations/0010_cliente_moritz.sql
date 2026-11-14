-- =====================================================================
-- Brixx Hub — 0010: prospecto Moritz Social Club (Yerba Buena) y su demo web
-- Solo datos. Carta digital armada como demo comercial, todavía sin publicar
-- en Netlify (ficha "en desarrollo" hasta subirla como moritzdigital).
-- Idempotente: la ficha se busca por URL y el prospecto por empresa;
-- no duplica ni pisa lo que se haya editado en el hub.
-- =====================================================================

do $$
declare
  v_carta uuid;
begin
  -- -------------------------------------------------------------------
  -- 1. Ficha en Demos web: la carta digital
  -- -------------------------------------------------------------------
  insert into public.fichas (seccion, nombre, cliente, categoria, descripcion, url, modo_apertura, estado, etiquetas, orden)
  select 'demo', 'Moritz — Carta digital', 'Moritz', 'Carta digital',
         'Carta digital con QR para Moritz Social Club (lounge bar, restaurant y café, Yerba Buena) con la identidad de la marca: '
         || 'header con la barra de mármol y escena flotante, favoritos de la casa, carta completa (59 productos en 9 categorías) '
         || 'con detalle a pantalla completa, etiquetas de ingredientes y opciones, platos en video (croissant de pistacho y bife), '
         || 'favoritos, mi selección para mostrar al mozo y asistente con IA. Funciona sin JavaScript.',
         'https://moritzdigital.netlify.app/', 'iframe', 'en_desarrollo',
         array['carta digital', 'qr', 'gastronomía'],
         coalesce((select max(orden) from public.fichas where seccion = 'demo'), 0) + 1
  where not exists (select 1 from public.fichas where url = 'https://moritzdigital.netlify.app/');

  select id into v_carta from public.fichas where url = 'https://moritzdigital.netlify.app/' limit 1;

  -- -------------------------------------------------------------------
  -- 2. Prospecto en etapa "demo", con la carta vinculada
  -- -------------------------------------------------------------------
  if not exists (select 1 from public.prospectos where empresa ilike 'Moritz%') then
    insert into public.prospectos
      (nombre, empresa, rubro, etapa, moneda, proxima_accion, ficha_demo_id, notas, orden)
    values
      ('Moritz', 'Moritz Social Club',
       'Lounge bar · restaurant · café · Yerba Buena',
       'demo', 'ARS',
       'Publicar la demo en moritzdigital.netlify.app y enviar al dueño la propuesta (PDF de una página con QR a la carta)',
       v_carta,
       'Demo de carta digital lista (falta subirla a Netlify como moritzdigital; todavía sin panel del local). '
       || 'Instagram @moritzedition. '
       || 'A confirmar con el dueño: precios de Salmón Croissant, Proteico Lounge y French Omelette (tachados en la carta), '
       || 'de los tés en hebras salvo Herbal Delight, de Sprite y del bife con papas rústicas; nombre del bife; '
       || 'menú de cena y de bar para sumar una categoría Bar. '
       || 'Pedir fotos reales de los productos (hoy imágenes ilustrativas y prompts pendientes). '
       || 'Nombre y teléfono del dueño pendientes: completarlos desde el hub.',
       coalesce((select max(orden) from public.prospectos where etapa = 'demo'), 0) + 1);
  end if;
end $$;
