-- =====================================================================
-- Brixx Hub — 0009: prospecto Félix Café & Tapeo (San Miguel de Tucumán) y sus demos web
-- Solo datos. Carta digital + panel del local armados como demo comercial
-- todavía sin publicar en Netlify (fichas "en desarrollo" hasta subirla como felixdigital); la propuesta de una página (PDF con QR) va al dueño.
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
  select 'demo', 'Félix — Carta digital', 'Félix', 'Carta digital',
         'Carta digital con QR para Félix Café & Tapeo (San Miguel de Tucumán) con la identidad de la marca: '
         || 'favoritos de la casa, carrusel Keto Félix con platos sin fondo, carta completa (152 productos) con detalle y opciones, '
         || 'mi selección para mostrar al mozo, asistente con IA y reseñas de Google. Funciona sin JavaScript.',
         'https://felixdigital.netlify.app/', 'iframe', 'en_desarrollo',
         array['carta digital', 'qr', 'gastronomía'],
         coalesce((select max(orden) from public.fichas where seccion = 'demo'), 0) + 1
  where not exists (select 1 from public.fichas where url = 'https://felixdigital.netlify.app/');

  insert into public.fichas (seccion, nombre, cliente, categoria, descripcion, url, modo_apertura, estado, etiquetas, orden)
  select 'demo', 'Félix — Panel del local', 'Félix', 'Carta digital',
         'Panel para el dueño: edición de precios y productos al instante, agotados, favoritos, '
         || 'historial de cambios y métricas (más vistos, buscados, favoritos y preguntas al asistente). '
         || 'Demo: usuario Félix, contraseña demo.',
         'https://felixdigital.netlify.app/panel.html', 'iframe', 'en_desarrollo',
         array['carta digital', 'panel', 'métricas'],
         coalesce((select max(orden) from public.fichas where seccion = 'demo'), 0) + 1
  where not exists (select 1 from public.fichas where url = 'https://felixdigital.netlify.app/panel.html');

  select id into v_carta from public.fichas where url = 'https://felixdigital.netlify.app/' limit 1;

  -- -------------------------------------------------------------------
  -- 2. Prospecto en etapa "demo", con la carta vinculada
  -- -------------------------------------------------------------------
  if not exists (select 1 from public.prospectos where empresa ilike 'F_lix%') then
    insert into public.prospectos
      (nombre, empresa, rubro, etapa, moneda, proxima_accion, ficha_demo_id, notas, orden)
    values
      ('Félix', 'Félix Café & Tapeo',
       'Cafetería · café & tapeo · San Miguel de Tucumán (Santa Fe 307)',
       'demo', 'ARS',
       'Publicar la demo en felixdigital.netlify.app y enviar al dueño la propuesta (PDF de una página con QR a la carta)',
       v_carta,
       'Demo de carta digital + panel del local lista (falta subirla a Netlify como felixdigital). '
       || 'Instagram @felixcafe_ · 258 reseñas en Google (dato de un agregador; falta la calificación con estrellas). '
       || 'A confirmar con el dueño: precios de Pastelería (corridos en la carta impresa), precio del Verde Félix, '
       || 'Combo 1 para 4 ($72.000 escrito a mano) y precio nacional/importado de la coctelería. '
       || 'Pedir logo en vector, horarios, teléfono y fotos reales de pastelería. '
       || 'Nombre y teléfono del dueño pendientes: completarlos desde el hub.',
       coalesce((select max(orden) from public.prospectos where etapa = 'demo'), 0) + 1);
  end if;
end $$;
