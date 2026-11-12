-- =====================================================================
-- Brixx Hub — 0006: La Griega y Pedidos de frascos pasan a Sistemas,
-- y se agrega la app de Doña Martu. Solo datos, idempotente.
-- Se busca cada ficha por URL; el resto de lo que se haya editado en el hub no se toca.
-- =====================================================================

update public.fichas
   set seccion = 'sistema',
       nombre  = case when nombre = 'La Griega — Demo' then 'La Griega' else nombre end
 where url in ('https://la-griega-demo.vercel.app/', 'https://pedidos-frascos.vercel.app/')
   and seccion <> 'sistema';

insert into public.fichas (seccion, nombre, cliente, categoria, descripcion, url, modo_apertura, estado, etiquetas, orden)
select 'sistema', 'Doña Martu', 'Doña Martu', 'POS',
       'Sistema de Doña Martu.',
       'https://dona-martu-app.vercel.app/', 'iframe', 'activo', array[]::text[],
       coalesce((select max(orden) from public.fichas where seccion = 'sistema'), 0) + 1
where not exists (select 1 from public.fichas where url = 'https://dona-martu-app.vercel.app/');
