-- =====================================================================
-- Brixx Hub — 0013: sección Clientes (carpeta por cliente) e intervenciones
--
-- Carpeta del cliente (sobre la misma tabla prospectos: un cliente es un
-- prospecto ganado, un cliente potencial es uno abierto):
-- - instagram, web, industria: datos del negocio.
-- - sintesis: lo que arma Claude juntando todo lo del cliente (objetivos,
--   soluciones que le proponemos, qué hacer ahora, qué falta saber).
--   sintesis_at: cuándo se armó.
--
-- Intervenciones (lo que se carga después de hablar con un cliente):
-- - grabaciones.origen suma 'texto' (chat o notas pegadas, sin audio).
-- - grabaciones.texto_original: el texto pegado.
-- - grabaciones.urls: links que se cargaron con la intervención (Instagram, web…).
-- Idempotente.
-- =====================================================================

alter table public.prospectos add column if not exists instagram   text;
alter table public.prospectos add column if not exists web         text;
alter table public.prospectos add column if not exists industria   text;
alter table public.prospectos add column if not exists sintesis    jsonb;
alter table public.prospectos add column if not exists sintesis_at timestamptz;

alter table public.grabaciones add column if not exists texto_original text;
alter table public.grabaciones add column if not exists urls text[] not null default '{}';

alter table public.grabaciones drop constraint if exists grabaciones_origen_check;
alter table public.grabaciones
  add constraint grabaciones_origen_check check (origen in ('reunion', 'audio', 'texto'));
