-- =====================================================================
-- Brixx Hub — 0015: acciones de Jarvis y su personalidad
-- - jarvis_acciones: lo que Jarvis propone hacer (agendar una reunión,
--   cargar la próxima acción, mover de etapa, anotar en la carpeta, armar
--   una cotización en borrador). Queda "pendiente" hasta que el socio la
--   confirma (botón o "sí, dale"); recién ahí se ejecuta. Vencen a los 30 min.
-- - ajustes.jarvis_personalidad: cómo quieren que sea Jarvis (tono, reglas,
--   prioridades). Se edita desde /jarvis y se suma a sus instrucciones.
-- Las acciones las escribe y ejecuta la Edge Function "asistente". Idempotente.
-- =====================================================================

create table if not exists public.jarvis_acciones (
  id          uuid primary key default gen_random_uuid(),
  usuario     text not null,                 -- email del socio que la pidió
  tipo        text not null check (tipo in ('agendar_reunion', 'proxima_accion', 'mover_etapa', 'nota_cliente', 'cotizacion_borrador')),
  datos       jsonb not null,                -- lo necesario para ejecutarla, ya validado
  resumen     text not null,                 -- lo que se muestra para confirmar
  estado      text not null default 'pendiente' check (estado in ('pendiente', 'hecha', 'cancelada', 'error')),
  resultado   text,                          -- qué pasó al ejecutarla
  link        text,                          -- dónde verla en el hub (ej. /calendario)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists jarvis_acciones_usuario_idx on public.jarvis_acciones (lower(usuario), created_at desc);

drop trigger if exists jarvis_acciones_updated_at on public.jarvis_acciones;
create trigger jarvis_acciones_updated_at
  before update on public.jarvis_acciones
  for each row execute function public.set_updated_at();

alter table public.jarvis_acciones enable row level security;
drop policy if exists "jarvis_acciones_propias" on public.jarvis_acciones;
create policy "jarvis_acciones_propias" on public.jarvis_acciones
  for select to authenticated
  using (public.es_miembro() and lower(usuario) = lower(coalesce(auth.jwt() ->> 'email', '')));

alter table public.ajustes add column if not exists jarvis_personalidad text;
