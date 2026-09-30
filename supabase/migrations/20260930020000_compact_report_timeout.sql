-- La serializacion del reporte completo puede superar el timeout corto de la API.
-- El limite se amplía sólo para esta función; no afecta otras consultas.
alter function public.reporte_fuente_compacta()
  set statement_timeout = '60s';
