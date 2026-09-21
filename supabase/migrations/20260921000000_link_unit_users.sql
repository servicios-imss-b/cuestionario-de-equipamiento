-- Permite conservar el capturista de una unidad aunque tenga cero consultorios.

alter table public.unidades
  add column if not exists usuario_id bigint references public.usuarios(id);

create index if not exists unidades_usuario_id_idx on public.unidades (usuario_id);
