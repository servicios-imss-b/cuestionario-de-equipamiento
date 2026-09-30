-- Cortes del reporte: 11:25, 14:25 y 17:00 de America/Mexico_City (UTC-6).
-- Las lecturas normales nunca reconstruyen; sólo leen la última fotografía.
create or replace function public.reporte_fuente_compacta(p_forzar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '180s'
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
    raise exception 'El corte del reporte todavía no está disponible';
  end if;

  return v_payload || jsonb_build_object('generado_en', v_generado_en);
end;
$$;

grant execute on function public.reporte_fuente_compacta(boolean) to anon, authenticated, service_role;

do $$
declare
  v_job record;
begin
  for v_job in
    select jobid from cron.job
    where jobname in (
      'reporte-corte-1125-mx',
      'reporte-corte-1425-mx',
      'reporte-corte-1625-mx',
      'reporte-corte-1700-mx'
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
  'reporte-corte-1700-mx',
  '0 23 * * *',
  $$select public.refrescar_reporte_fuente_compacta();$$
);
