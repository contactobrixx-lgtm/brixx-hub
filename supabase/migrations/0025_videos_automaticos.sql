-- =====================================================================
-- Brixx Hub — 0025: videos automáticos y video "para nosotros"
-- - videos.enfoque: para quién es el video. "cliente" (le habla al dueño
--   del negocio), "equipo" (para que el cliente se lo muestre a los suyos)
--   o "interno" (para brixx: qué vamos a armar y cómo, paso a paso).
-- - ajustes.videos_automaticos: si está prendido (por defecto), cuando
--   termina el análisis de una intervención o reunión con cliente, la
--   función "grabaciones" pide solos el video para el cliente y el
--   interno (uno de cada uno por grabación).
-- Idempotente.
-- =====================================================================

alter table public.videos add column if not exists enfoque text not null default 'cliente';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'videos_enfoque_check') then
    alter table public.videos add constraint videos_enfoque_check check (enfoque in ('cliente', 'equipo', 'interno'));
  end if;
end $$;

create index if not exists videos_grabacion_enfoque_idx on public.videos (grabacion_id, enfoque);
-- Los automáticos, uno por grabación y enfoque (si dos avisos llegan juntos, el segundo no lo repite)
create unique index if not exists videos_automatico_unico on public.videos (grabacion_id, enfoque) where pedido_por = 'automático';

alter table public.ajustes add column if not exists videos_automaticos boolean not null default true;
