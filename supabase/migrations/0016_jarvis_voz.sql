-- =====================================================================
-- Brixx Hub — 0016: voz de Jarvis elegida desde el hub
-- - ajustes.jarvis_voz_id: Voice ID de ElevenLabs (por ejemplo, una voz
--   argentina de la Voice Library). Vacío = la del secret o la por defecto.
-- - ajustes.jarvis_voz_modelo: 'eleven_flash_v2_5' (rápida) o
--   'eleven_multilingual_v2' (más natural, tarda más). Vacío = rápida.
-- Se editan en /jarvis → Voz. Idempotente.
-- =====================================================================

alter table public.ajustes add column if not exists jarvis_voz_id text;
alter table public.ajustes add column if not exists jarvis_voz_modelo text;
