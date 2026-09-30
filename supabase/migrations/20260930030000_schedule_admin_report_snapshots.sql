-- Fotografias compartidas del reporte administrativo.
-- Los horarios cron estan en UTC y equivalen a 11:25, 14:25 y 16:25
-- de America/Mexico_City (UTC-6).
create table if not exists public.reporte_admin_snapshot (
  id smallint primary key default 1 check (id = 1),
  payload jsonb not null,
  generado_en timestamptz not null
);

alter table public.reporte_admin_snapshot enable row level security;
revoke all on table public.reporte_admin_snapshot from anon, authenticated;

create or replace function public.construir_reporte_fuente_compacta()
returns jsonb
language sql
stable
security definer
set search_path = public
set statement_timeout = '60s'
as $$
  with equipment_by_office as (
    select
      re.consultorio_id,
      jsonb_object_agg(re.pregunta_id::text, re.cantidad order by re.pregunta_id) as equipamiento
    from public.respuestas_equipamiento re
    group by re.consultorio_id
  )
  select jsonb_build_object(
    'unidades', coalesce((
      select jsonb_agg(to_jsonb(unit_row) order by unit_row.clues_imb)
      from (
        select
          u.*,
          case when usr.id is null then null else jsonb_build_object(
            'email', usr.email,
            'nombre', usr.nombre
          ) end as usuarios
        from public.unidades u
        left join public.usuarios usr on usr.id = u.usuario_id
      ) unit_row
    ), '[]'::jsonb),
    'consultorios', coalesce((
      select jsonb_agg(to_jsonb(office_row) order by office_row.unidad_clues, office_row.numero)
      from (
        select
          c.*,
          case when usr.id is null then null else jsonb_build_object(
            'email', usr.email,
            'nombre', usr.nombre
          ) end as usuarios,
          coalesce(eq.equipamiento, '{}'::jsonb) as equipamiento
        from public.consultorios c
        left join public.usuarios usr on usr.id = c.usuario_id
        left join equipment_by_office eq on eq.consultorio_id = c.id
      ) office_row
    ), '[]'::jsonb)
  );
$$;

create or replace function public.refrescar_reporte_fuente_compacta()
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '60s'
as $$
declare
  v_payload jsonb;
  v_generado_en timestamptz := clock_timestamp();
begin
  perform pg_advisory_xact_lock(hashtext('reporte_admin_snapshot'));
  v_payload := public.construir_reporte_fuente_compacta();

  insert into public.reporte_admin_snapshot (id, payload, generado_en)
  values (1, v_payload, v_generado_en)
  on conflict (id) do update
    set payload = excluded.payload,
        generado_en = excluded.generado_en;

  return v_payload || jsonb_build_object('generado_en', v_generado_en);
end;
$$;

create or replace function public.reporte_fuente_compacta(p_forzar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '60s'
as $$
declare
  v_payload jsonb;
  v_generado_en timestamptz;
begin
  if p_forzar then
    return public.refrescar_reporte_fuente_compacta();
  end if;

  select payload, generado_en
  into v_payload, v_generado_en
  from public.reporte_admin_snapshot
  where id = 1;

  if v_payload is null then
    return public.refrescar_reporte_fuente_compacta();
  end if;

  return v_payload || jsonb_build_object('generado_en', v_generado_en);
end;
$$;

grant execute on function public.reporte_fuente_compacta(boolean) to anon, authenticated, service_role;
grant execute on function public.refrescar_reporte_fuente_compacta() to service_role, postgres;
revoke execute on function public.construir_reporte_fuente_compacta() from public, anon, authenticated;

create extension if not exists pg_cron with schema extensions;

do $$
declare
  v_job record;
begin
  for v_job in
    select jobid from cron.job
    where jobname in (
      'reporte-corte-1125-mx',
      'reporte-corte-1425-mx',
      'reporte-corte-1625-mx'
    )
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end $$;

select cron.schedule(
  'reporte-corte-1125-mx',
  '25 17 * * *',
  $$select public.refrescar_reporte_fuente_compacta();$$
);
select cron.schedule(
  'reporte-corte-1425-mx',
  '25 20 * * *',
  $$select public.refrescar_reporte_fuente_compacta();$$
);
select cron.schedule(
  'reporte-corte-1625-mx',
  '25 22 * * *',
  $$select public.refrescar_reporte_fuente_compacta();$$
);
