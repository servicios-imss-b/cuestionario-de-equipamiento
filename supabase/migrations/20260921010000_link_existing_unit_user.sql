-- Vincula el capturista existente de la unidad que no tiene consultorios.
update public.unidades
set usuario_id = (
  select id
  from public.usuarios
  where lower(email) = 'martinlopez@ciencias.unam.mx'
)
where clues_imb = 'BCIMB000080';
