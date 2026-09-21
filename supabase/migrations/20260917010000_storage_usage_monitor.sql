-- Monitoreo de uso de almacenamiento (para alertar antes de tocar el limite del free tier de Supabase).

create or replace function public.obtener_uso_almacenamiento()
returns table (
  tabla text,
  bytes bigint,
  tamano_legible text
)
language sql
stable
security definer
set search_path = public
as $$
  select 'total_base'::text as tabla,
         pg_database_size(current_database()) as bytes,
         pg_size_pretty(pg_database_size(current_database())) as tamano_legible
  union all
  select relname::text,
         pg_total_relation_size(relid),
         pg_size_pretty(pg_total_relation_size(relid))
  from pg_stat_user_tables
  where schemaname = 'public'
    and relname in ('unidades', 'usuarios', 'consultorios', 'respuestas_equipamiento', 'respuestas')
  order by bytes desc;
$$;

revoke all on function public.obtener_uso_almacenamiento() from public, authenticated;
grant execute on function public.obtener_uso_almacenamiento() to anon, service_role;
