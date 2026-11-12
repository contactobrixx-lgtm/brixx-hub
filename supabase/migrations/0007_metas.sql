-- =====================================================================
-- Brixx Hub — 0007: metas por mes y trimestre + fecha de cierre de clientes
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Metas
-- ---------------------------------------------------------------------
create table if not exists public.metas (
  id                  uuid primary key default gen_random_uuid(),
  tipo                text not null check (tipo in ('mes', 'trimestre')),
  periodo             date not null,          -- primer día del mes o del trimestre
  clientes_nuevos     integer check (clientes_nuevos >= 0),
  ingreso_recurrente  numeric(14, 2) check (ingreso_recurrente >= 0),  -- USD por mes, al cierre del período
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (tipo, periodo)
);

drop trigger if exists metas_updated_at on public.metas;
create trigger metas_updated_at
  before update on public.metas
  for each row execute function public.set_updated_at();

alter table public.metas enable row level security;
drop policy if exists "metas_miembros" on public.metas;
create policy "metas_miembros" on public.metas
  for all to authenticated
  using (public.es_miembro()) with check (public.es_miembro());

-- Metas iniciales (se editan desde el hub)
insert into public.metas (tipo, periodo, clientes_nuevos, ingreso_recurrente) values
  ('mes',       '2026-11-01', 2, 100),
  ('mes',       '2026-12-01', 2, 200),
  ('trimestre', '2026-10-01', 4, 200),
  ('trimestre', '2027-01-01', 8, 600)
on conflict (tipo, periodo) do nothing;

-- ---------------------------------------------------------------------
-- 2. Tasas del embudo (se usan hasta tener datos reales suficientes)
-- ---------------------------------------------------------------------
alter table public.ajustes add column if not exists tasa_reunion_propuesta numeric(4, 3) not null default 0.5
  check (tasa_reunion_propuesta > 0 and tasa_reunion_propuesta <= 1);
alter table public.ajustes add column if not exists tasa_propuesta_cierre numeric(4, 3) not null default 0.33
  check (tasa_propuesta_cierre > 0 and tasa_propuesta_cierre <= 1);

-- ---------------------------------------------------------------------
-- 3. Fecha en que un prospecto se convirtió en cliente
-- ---------------------------------------------------------------------
alter table public.prospectos add column if not exists fecha_cierre date;

create or replace function public.set_fecha_cierre()
returns trigger
language plpgsql
as $$
declare
  ganadas text[] := array['cerrado', 'implementacion', 'mantenimiento'];
begin
  if new.etapa = any (ganadas) then
    if new.fecha_cierre is null then
      new.fecha_cierre := current_date;
    end if;
  elsif new.etapa <> 'perdido' then
    -- volvió a una etapa abierta: todavía no es cliente
    new.fecha_cierre := null;
  end if;
  return new;
end;
$$;

drop trigger if exists prospectos_fecha_cierre on public.prospectos;
create trigger prospectos_fecha_cierre
  before insert or update of etapa, fecha_cierre on public.prospectos
  for each row execute function public.set_fecha_cierre();

-- Clientes que ya existían
update public.prospectos set fecha_cierre = '2026-11-04'
 where empresa ilike 'Nova%' and fecha_cierre is null
   and etapa in ('cerrado', 'implementacion', 'mantenimiento');

update public.prospectos set fecha_cierre = updated_at::date
 where fecha_cierre is null and etapa in ('cerrado', 'implementacion', 'mantenimiento');
