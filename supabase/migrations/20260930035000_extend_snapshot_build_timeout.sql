-- El plan gratuito necesita más tiempo para serializar e insertar ~8 MB.
alter function public.construir_reporte_fuente_compacta()
  set statement_timeout = '180s';
alter function public.refrescar_reporte_fuente_compacta()
  set statement_timeout = '180s';
alter function public.reporte_fuente_compacta(boolean)
  set statement_timeout = '180s';
