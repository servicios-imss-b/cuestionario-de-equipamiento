-- Las preguntas de cadena de frio pertenecen a la unidad, no a cada consultorio.
create table if not exists public.respuestas_equipamiento_unidad (
  unidad_clues text not null references public.unidades(clues_imb) on delete cascade,
  pregunta_id smallint not null check (pregunta_id in (33, 38, 39, 40, 44, 64, 65)),
  cantidad integer not null check (cantidad >= 0),
  usuario_id bigint references public.usuarios(id),
  fecha_registro timestamptz not null default now(),
  primary key (unidad_clues, pregunta_id)
);

-- Consolida el valor del primer consultorio como valor de unidad y elimina duplicados.
insert into public.respuestas_equipamiento_unidad (unidad_clues, pregunta_id, cantidad, fecha_registro)
select c.unidad_clues, re.pregunta_id, re.cantidad, coalesce(c.fecha_registro, now())
from public.respuestas_equipamiento re
join public.consultorios c on c.id = re.consultorio_id
where re.pregunta_id in (33, 38, 39, 40, 44, 64, 65)
  and c.numero = (
    select min(first_c.numero)
    from public.consultorios first_c
    where first_c.unidad_clues = c.unidad_clues
  )
on conflict (unidad_clues, pregunta_id) do nothing;

delete from public.respuestas_equipamiento
where pregunta_id in (33, 38, 39, 40, 44, 64, 65);

create or replace function public.guardar_respuesta_equipamiento_unidad(
  p_clues text,
  p_pregunta_id text,
  p_valor integer,
  p_usuario_email text,
  p_usuario_nombre text
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  marca_tiempo timestamptz := now();
  v_usuario_id bigint;
begin
  if nullif(trim(p_clues), '') is null
    or p_pregunta_id !~ '^[0-9]+$'
    or p_pregunta_id::integer not in (33, 38, 39, 40, 44, 64, 65)
    or p_valor < 0 then
    raise exception 'Respuesta de equipamiento de unidad invalida';
  end if;

  if nullif(trim(p_usuario_email), '') is not null then
    insert into usuarios (email, nombre)
    values (lower(trim(p_usuario_email)), p_usuario_nombre)
    on conflict (email) do update set nombre = excluded.nombre
    returning id into v_usuario_id;
  end if;

  insert into respuestas_equipamiento_unidad (unidad_clues, pregunta_id, cantidad, usuario_id, fecha_registro)
  values (upper(trim(p_clues)), p_pregunta_id::smallint, p_valor, v_usuario_id, marca_tiempo)
  on conflict (unidad_clues, pregunta_id) do update set
    cantidad = excluded.cantidad,
    usuario_id = coalesce(excluded.usuario_id, respuestas_equipamiento_unidad.usuario_id),
    fecha_registro = excluded.fecha_registro;

  return marca_tiempo;
end;
$$;

grant select, insert, update on table public.respuestas_equipamiento_unidad to anon;
grant execute on function public.guardar_respuesta_equipamiento_unidad(text, text, integer, text, text) to anon, service_role;
alter table public.respuestas_equipamiento_unidad enable row level security;

drop policy if exists respuestas_equipamiento_unidad_anon_select on public.respuestas_equipamiento_unidad;
create policy respuestas_equipamiento_unidad_anon_select on public.respuestas_equipamiento_unidad for select to anon using (true);
drop policy if exists respuestas_equipamiento_unidad_anon_insert on public.respuestas_equipamiento_unidad;
create policy respuestas_equipamiento_unidad_anon_insert on public.respuestas_equipamiento_unidad for insert to anon with check (true);
drop policy if exists respuestas_equipamiento_unidad_anon_update on public.respuestas_equipamiento_unidad;
create policy respuestas_equipamiento_unidad_anon_update on public.respuestas_equipamiento_unidad for update to anon using (true) with check (true);