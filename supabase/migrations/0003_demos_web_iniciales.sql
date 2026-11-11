-- =====================================================================
-- Brixx Hub — 0003: carga inicial de demos web
-- Solo datos. Inserta cada ficha si todavía no existe una con la misma URL,
-- así se puede volver a correr sin duplicar. Después se editan desde el hub.
-- =====================================================================

insert into public.fichas (seccion, nombre, cliente, categoria, descripcion, url, modo_apertura, estado, etiquetas, orden)
select v.seccion, v.nombre, v.cliente, v.categoria, v.descripcion, v.url, v.modo_apertura, 'activo', v.etiquetas, v.orden
from (values
  ('demo', 'Nova — Catálogo mayorista', 'Nova Distribuidora', 'Catálogo',
   'Catálogo online de tecnología, hogar, cuidado personal y energía solar, con carrito y compra por mayor confirmada por WhatsApp.',
   'https://nova-catalogo-mayorista.netlify.app/', 'iframe', array['mayorista', 'whatsapp'], 101),

  ('demo', 'Nova — Prototipo del catálogo', 'Nova Distribuidora', 'Catálogo',
   'Primera versión del catálogo de Nova armada como artifact en Claude.',
   'https://claude.ai/artifact/7tkBjmdsiVeTgErtLY5r6U', 'pestana', array['prototipo'], 102),

  ('demo', 'Pedidos de frascos', null, 'Pedidos',
   'Web para tomar pedidos de frascos.',
   'https://pedidos-frascos.vercel.app/', 'iframe', array[]::text[], 103),

  ('demo', 'Propacking — Web', 'Propacking', 'Web institucional',
   'Sitio web de Propacking.',
   'https://propackingweb.vercel.app/', 'iframe', array[]::text[], 104),

  ('demo', 'La Griega — Demo', 'La Griega', null,
   'Demo web para La Griega.',
   'https://la-griega-demo.vercel.app/', 'iframe', array[]::text[], 105)
) as v(seccion, nombre, cliente, categoria, descripcion, url, modo_apertura, etiquetas, orden)
where not exists (select 1 from public.fichas f where f.url = v.url);
