-- =====================================================================
-- Brixx Hub — 0017: misiones de Jarvis (varios agentes en paralelo)
-- - jarvis_misiones: un pedido grande ("prepará la reunión con Nova") que un
--   planificador divide entre 2 y 5 agentes. Al final, un resultado combinado.
-- - jarvis_agentes: cada agente de una misión, con su rol, su tarea, el
--   avance (0-100), el registro de lo que va haciendo y su resultado.
-- Las escribe la Edge Function "misiones". Los agentes solo LEEN el hub
-- (y la web): no modifican datos. Las ven los dos socios. Idempotente.
-- =====================================================================

create table if not exists public.jarvis_misiones (
  id           uuid primary key default gen_random_uuid(),
  usuario      text not null,                 -- email del socio que la pidió
  pedido       text not null,
  titulo       text,
  estado       text not null default 'planificando'
               check (estado in ('planificando', 'trabajando', 'combinando', 'lista', 'error', 'cancelada')),
  resultado    text,                          -- el resultado combinado (texto para pantalla y voz)
  resumen      text,                          -- 1 o 2 oraciones para decir en voz alta
  error        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists jarvis_misiones_created_idx on public.jarvis_misiones (created_at desc);

create table if not exists public.jarvis_agentes (
  id           uuid primary key default gen_random_uuid(),
  mision_id    uuid not null references public.jarvis_misiones (id) on delete cascade,
  orden        integer not null default 0,
  nombre       text not null,                 -- "Investigador", "Redactor"…
  rol          text not null,                 -- qué tipo de trabajo hace
  tarea        text not null,                 -- lo que le toca en esta misión
  usa_web      boolean not null default false,
  estado       text not null default 'esperando'
               check (estado in ('esperando', 'trabajando', 'listo', 'error')),
  progreso     integer not null default 0 check (progreso between 0 and 100),
  registro     jsonb not null default '[]'::jsonb,  -- [{t: ISO, texto}]
  resultado    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists jarvis_agentes_mision_idx on public.jarvis_agentes (mision_id, orden);

do $$
declare t text;
begin
  foreach t in array array['jarvis_misiones', 'jarvis_agentes'] loop
    execute format('drop trigger if exists %1$s_updated_at on public.%1$s', t);
    execute format('create trigger %1$s_updated_at before update on public.%1$s for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('drop policy if exists "%1$s_miembros" on public.%1$s', t);
    execute format('create policy "%1$s_miembros" on public.%1$s for select to authenticated using (public.es_miembro())', t);
  end loop;
end $$;
