-- =====================================================================
-- Brixx Hub — 0020: ficha del video "Setter con IA · Alcione Deco"
--
-- El video vive en public/material/ (lo sirve Vercel junto con el hub) y
-- la ficha lo muestra en Demos web. Va sin "cliente" a propósito: con el
-- cliente cargado, el trigger de la 0011 movería a Alcione a la etapa
-- "demo" del pipeline. Si se quiere vincular, se completa desde el hub.
-- Idempotente: no la vuelve a crear si ya existe una ficha con esa URL.
-- =====================================================================
insert into public.fichas (seccion, nombre, categoria, descripcion, url, modo_apertura, estado, etiquetas)
select
  'demo',
  'Video · Setter con IA para Alcione Deco',
  'Video',
  'Video explicativo (1:35, 16:9) de un setter con IA en WhatsApp para un bazar y deco: charla de venta, cómo funciona, reglas y beneficios. Productos y precios de ejemplo.',
  '/material/setter-alcione-deco.html',
  'iframe',
  'activo',
  array['video', 'setter', 'whatsapp']
where not exists (select 1 from public.fichas where url = '/material/setter-alcione-deco.html');
