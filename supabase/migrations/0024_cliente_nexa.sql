-- =====================================================================
-- Brixx Hub — 0024: el cliente se llama "Nexa Gestión Humana", no "Nena"
-- La transcripción del primer audio entendió "Nena" y la carpeta se creó
-- con ese nombre. Se corrige en la carpeta (nombre, empresa, notas y
-- síntesis), en sus intervenciones (título y análisis) y en sus videos.
-- Solo toca la carpeta de "Nena Gestión Humana". Idempotente: si ya dice
-- Nexa, no cambia nada.
-- =====================================================================

do $$
declare
  ids uuid[];
begin
  select coalesce(array_agg(id), '{}') into ids
  from public.prospectos
  where nombre ilike 'nena gesti_n humana%' or empresa ilike 'nena gesti_n humana%'
     or nombre ilike 'nexa gesti_n humana%' or empresa ilike 'nexa gesti_n humana%';

  if array_length(ids, 1) is null then
    return;
  end if;

  update public.prospectos set
    nombre   = regexp_replace(nombre, '\mNena\M', 'Nexa', 'g'),
    empresa  = regexp_replace(empresa, '\mNena\M', 'Nexa', 'g'),
    notas    = regexp_replace(notas, '\mNena\M', 'Nexa', 'g'),
    sintesis = case when sintesis is null then null
                    else regexp_replace(sintesis::text, '\mNena\M', 'Nexa', 'g')::jsonb end
  where id = any (ids)
    and (nombre ~ '\mNena\M' or coalesce(empresa, '') ~ '\mNena\M' or coalesce(notas, '') ~ '\mNena\M'
         or coalesce(sintesis::text, '') ~ '\mNena\M');

  update public.grabaciones set
    titulo   = regexp_replace(titulo, '\mNena\M', 'Nexa', 'g'),
    analisis = case when analisis is null then null
                    else regexp_replace(analisis::text, '\mNena\M', 'Nexa', 'g')::jsonb end
  where prospecto_id = any (ids)
    and (titulo ~ '\mNena\M' or coalesce(analisis::text, '') ~ '\mNena\M');

  if to_regclass('public.videos') is not null then
    execute $q$
      update public.videos set
        titulo = regexp_replace(titulo, '\mNena\M', 'Nexa', 'g'),
        guion  = case when guion is null then null
                      else regexp_replace(guion::text, '\mNena\M', 'Nexa', 'g')::jsonb end
      where prospecto_id = any ($1)
        and (titulo ~ '\mNena\M' or coalesce(guion::text, '') ~ '\mNena\M')
    $q$ using ids;
  end if;
end $$;
