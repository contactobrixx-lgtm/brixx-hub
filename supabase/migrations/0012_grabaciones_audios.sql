-- =====================================================================
-- Brixx Hub — 0012: audios subidos (por ejemplo, de WhatsApp) en Grabaciones
-- - grabaciones.origen: 'reunion' (grabada con el micrófono) | 'audio' (archivo subido).
--   Con 'audio' el análisis se enfoca en qué quiere la persona y sugiere una respuesta.
-- - El bucket acepta también audio/opus (las notas de voz de WhatsApp).
-- Idempotente.
-- =====================================================================

alter table public.grabaciones
  add column if not exists origen text not null default 'reunion';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'grabaciones_origen_check' and conrelid = 'public.grabaciones'::regclass
  ) then
    alter table public.grabaciones
      add constraint grabaciones_origen_check check (origen in ('reunion', 'audio'));
  end if;
end $$;

update storage.buckets
set allowed_mime_types = array[
  'audio/webm', 'audio/ogg', 'audio/opus', 'audio/mp4', 'audio/mpeg',
  'audio/aac', 'audio/x-m4a', 'audio/m4a', 'audio/wav', 'audio/x-wav'
]
where id = 'grabaciones';
