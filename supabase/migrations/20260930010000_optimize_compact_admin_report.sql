-- Evita una subconsulta correlacionada por consultorio: agrega toda la tabla EAV
-- una sola vez y une el resultado compacto.
create or replace function public.reporte_fuente_compacta()
returns jsonb
language sql
stable
security definer
set search_path = public
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

grant execute on function public.reporte_fuente_compacta() to anon, authenticated, service_role;
