-- Alertas de almacenamiento por correo (Resend) via pg_cron + pg_net.
-- La API key de Resend vive en Supabase Vault (secreto 'resend_api_key'), nunca en este archivo.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Evita reenviar el correo en cada corrida del cron; solo una vez cada 24h mientras siga por encima del umbral.
create table if not exists public.alertas_almacenamiento (
  id boolean primary key default true,
  ultimo_envio timestamptz,
  constraint alertas_almacenamiento_single_row check (id)
);
insert into public.alertas_almacenamiento (id) values (true) on conflict (id) do nothing;

create or replace function public.verificar_alerta_almacenamiento()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  limite_bytes bigint := 500 * 1024 * 1024;
  umbral_pct numeric := 80;
  bytes_actuales bigint;
  pct_actual numeric;
  api_key text;
  ultimo_envio timestamptz;
  destinatario text := 'martinlopez@ciencias.unam.mx';
begin
  select pg_database_size(current_database()) into bytes_actuales;
  pct_actual := round((bytes_actuales::numeric / limite_bytes) * 100, 1);

  if pct_actual < umbral_pct then
    return;
  end if;

  select a.ultimo_envio into ultimo_envio from public.alertas_almacenamiento a where a.id = true;
  if ultimo_envio is not null and ultimo_envio > now() - interval '24 hours' then
    return;
  end if;

  select decrypted_secret into api_key
  from vault.decrypted_secrets
  where name = 'resend_api_key';

  if api_key is null then
    raise warning 'resend_api_key no configurada en Vault';
    return;
  end if;

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || api_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'from', 'IMSS Bienestar <onboarding@resend.dev>',
      'to', array[destinatario],
      'subject', format('Alerta: almacenamiento al %s%% (limite 500 MB)', pct_actual),
      'html', format(
        '<p>La base de datos de <b>nuevo-formu</b> esta usando <b>%s%%</b> del limite gratuito de Supabase (500 MB).</p><p>Uso actual: %s MB.</p><p>Considera limpiar datos o subir de plan si sigue creciendo.</p>',
        pct_actual,
        round(bytes_actuales::numeric / 1024 / 1024, 1)
      )
    )
  );

  update public.alertas_almacenamiento set ultimo_envio = now() where id = true;
end;
$$;

revoke all on function public.verificar_alerta_almacenamiento() from public, authenticated, anon;

select cron.schedule(
  'chequeo-almacenamiento',
  '0 */6 * * *',
  $$select public.verificar_alerta_almacenamiento();$$
);
