-- Las respuestas de cadena de frio son propiedades de la unidad completa.
-- Se almacenan como columnas p_<id> en public.unidades, nunca por consultorio.
create table if not exists public.respuestas_equipamiento_unidad (
  unidad_clues text not null references public.unidades(clues_imb) on delete cascade,
  pregunta_id smallint not null check (pregunta_id in (33, 38, 39, 40, 44, 64, 65)),
  cantidad integer not null check (cantidad >= 0),
  usuario_id bigint references public.usuarios(id),
  fecha_registro timestamptz not null default now(),
  primary key (unidad_clues, pregunta_id)
);

alter table public.unidades
  add column if not exists p_33 integer check (p_33 is null or p_33 >= 0),
  add column if not exists p_38 integer check (p_38 is null or p_38 >= 0),
  add column if not exists p_39 integer check (p_39 is null or p_39 >= 0),
  add column if not exists p_40 integer check (p_40 is null or p_40 >= 0),
  add column if not exists p_44 integer check (p_44 is null or p_44 >= 0),
  add column if not exists p_64 integer check (p_64 is null or p_64 >= 0),
  add column if not exists p_65 integer check (p_65 is null or p_65 >= 0);

-- Conserva el valor que ya se haya guardado en la tabla intermedia.
update public.unidades u
set
  p_33 = coalesce(u.p_33, (select cantidad from public.respuestas_equipamiento_unidad r where r.unidad_clues = u.clues_imb and r.pregunta_id = 33)),
  p_38 = coalesce(u.p_38, (select cantidad from public.respuestas_equipamiento_unidad r where r.unidad_clues = u.clues_imb and r.pregunta_id = 38)),
  p_39 = coalesce(u.p_39, (select cantidad from public.respuestas_equipamiento_unidad r where r.unidad_clues = u.clues_imb and r.pregunta_id = 39)),
  p_40 = coalesce(u.p_40, (select cantidad from public.respuestas_equipamiento_unidad r where r.unidad_clues = u.clues_imb and r.pregunta_id = 40)),
  p_44 = coalesce(u.p_44, (select cantidad from public.respuestas_equipamiento_unidad r where r.unidad_clues = u.clues_imb and r.pregunta_id = 44)),
  p_64 = coalesce(u.p_64, (select cantidad from public.respuestas_equipamiento_unidad r where r.unidad_clues = u.clues_imb and r.pregunta_id = 64)),
  p_65 = coalesce(u.p_65, (select cantidad from public.respuestas_equipamiento_unidad r where r.unidad_clues = u.clues_imb and r.pregunta_id = 65));

-- Si la tabla intermedia no tenia el dato, toma el primer consultorio.
update public.unidades u
set p_33 = coalesce(u.p_33, first_values.p_33), p_38 = coalesce(u.p_38, first_values.p_38),
    p_39 = coalesce(u.p_39, first_values.p_39), p_40 = coalesce(u.p_40, first_values.p_40),
    p_44 = coalesce(u.p_44, first_values.p_44), p_64 = coalesce(u.p_64, first_values.p_64),
    p_65 = coalesce(u.p_65, first_values.p_65)
from (
  select c.unidad_clues,
    max(re.cantidad) filter (where re.pregunta_id = 33) as p_33,
    max(re.cantidad) filter (where re.pregunta_id = 38) as p_38,
    max(re.cantidad) filter (where re.pregunta_id = 39) as p_39,
    max(re.cantidad) filter (where re.pregunta_id = 40) as p_40,
    max(re.cantidad) filter (where re.pregunta_id = 44) as p_44,
    max(re.cantidad) filter (where re.pregunta_id = 64) as p_64,
    max(re.cantidad) filter (where re.pregunta_id = 65) as p_65
  from public.consultorios c
  join public.respuestas_equipamiento re on re.consultorio_id = c.id
  where c.numero = (select min(c2.numero) from public.consultorios c2 where c2.unidad_clues = c.unidad_clues)
    and re.pregunta_id in (33, 38, 39, 40, 44, 64, 65)
  group by c.unidad_clues
) first_values
where first_values.unidad_clues = u.clues_imb;

delete from public.respuestas_equipamiento
where pregunta_id in (33, 38, 39, 40, 44, 64, 65);

create or replace function public.guardar_equipamiento_unidad(
  p_clues text, p_pregunta_id text, p_valor integer,
  p_usuario_email text, p_usuario_nombre text
)
returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare
  marca_tiempo timestamptz := now();
  v_usuario_id bigint;
begin
  if nullif(trim(p_clues), '') is null or p_pregunta_id !~ '^[0-9]+$'
    or p_pregunta_id::integer not in (33, 38, 39, 40, 44, 64, 65) or p_valor < 0 then
    raise exception 'Respuesta de equipamiento de unidad invalida';
  end if;

  if nullif(trim(p_usuario_email), '') is not null then
    insert into usuarios (email, nombre) values (lower(trim(p_usuario_email)), p_usuario_nombre)
    on conflict (email) do update set nombre = excluded.nombre returning id into v_usuario_id;
  end if;

  update unidades
  set p_33 = case when p_pregunta_id = '33' then p_valor else p_33 end,
      p_38 = case when p_pregunta_id = '38' then p_valor else p_38 end,
      p_39 = case when p_pregunta_id = '39' then p_valor else p_39 end,
      p_40 = case when p_pregunta_id = '40' then p_valor else p_40 end,
      p_44 = case when p_pregunta_id = '44' then p_valor else p_44 end,
      p_64 = case when p_pregunta_id = '64' then p_valor else p_64 end,
      p_65 = case when p_pregunta_id = '65' then p_valor else p_65 end,
      usuario_id = coalesce(v_usuario_id, usuario_id), fecha_registro = marca_tiempo
  where clues_imb = upper(trim(p_clues));

  if not found then raise exception 'La unidad no existe'; end if;
  return marca_tiempo;
end;
$$;

grant execute on function public.guardar_equipamiento_unidad(text, text, integer, text, text) to anon, service_role;
drop function if exists public.guardar_respuesta_equipamiento_unidad(text, text, integer, text, text);
drop table if exists public.respuestas_equipamiento_unidad;
