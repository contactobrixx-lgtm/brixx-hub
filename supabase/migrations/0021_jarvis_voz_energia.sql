-- =====================================================================
-- Brixx Hub — 0021: energía de la voz de Jarvis
-- - ajustes.jarvis_voz_energia: 'calmo' | 'animado' | 'energico'
--   (vacío = calmo). Cambia expresividad y velocidad de ElevenLabs.
--   Se edita en /jarvis → Voz.
-- - Deja elegida la voz "Luis" (español neutro) con el modelo rápido y
--   energía alta, como pidieron los socios; solo donde todavía no había
--   nada elegido, así no pisa un cambio hecho desde el hub.
-- Idempotente.
-- =====================================================================

alter table public.ajustes add column if not exists jarvis_voz_energia text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ajustes_jarvis_voz_energia_check'
  ) then
    alter table public.ajustes
      add constraint ajustes_jarvis_voz_energia_check
      check (jarvis_voz_energia is null or jarvis_voz_energia in ('calmo', 'animado', 'energico'));
  end if;
end $$;

update public.ajustes
set jarvis_voz_id = 'KuCuu213C5LmCbAvbEb8',
    jarvis_voz_modelo = coalesce(jarvis_voz_modelo, 'eleven_flash_v2_5')
where jarvis_voz_id is null or btrim(jarvis_voz_id) = '';

update public.ajustes
set jarvis_voz_energia = 'energico'
where jarvis_voz_energia is null;
