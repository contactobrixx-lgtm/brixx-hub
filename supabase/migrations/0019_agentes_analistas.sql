-- =====================================================================
-- Brixx Hub — 0019: agentes analistas (financiero y aprendizaje de ventas)
-- Corren solos una vez por mes (desde el día 1, a la hora elegida) y a pedido.
-- Solo agregan su fila de configuración. Idempotente.
-- =====================================================================

insert into public.agentes_config (agente, hora) values ('financiero', 9), ('ventas', 9)
on conflict (agente) do nothing;
