-- Telvo Player – Sichern & Wiederherstellen (November 2026)
-- Einmal im Supabase SQL-Editor ausführen. Kann gefahrlos wiederholt werden.
-- Voraussetzung: server/supabase.sql und server/sicherheit-2026-11.sql liefen bereits.
--
-- Was es macht:
-- 1. Pro Gerät eine Sicherung (Einstellungen, Favoriten, Weiterschauen, Verlauf, Kategorien, ausgeblendete Sender)
--    als JSON, höchstens 512 KB. KEINE Passwörter oder Playlist-Adressen – die App erkennt Playlists über einen
--    Fingerabdruck (Prüfwert) wieder.
-- 2. Speichern, Abfragen und Löschen nur mit dem App-Token des Geräts.
-- 3. Wiederherstellen mit MAC + KEY (auch auf einem neuen Gerät) – mit derselben Sperre nach Fehlversuchen wie die
--    Webseite. Liefert zusätzlich die Playlists, die auf der Webseite verwaltet werden (wie list_playlists).
-- 4. Die Sicherung wird mit dem Gerät gelöscht: über „Alles zurücksetzen“, „Sicherung löschen“ oder automatisch nach
--    12 Monaten ohne Verbindung (lumio_purge löscht das Gerät, die Sicherung folgt über „on delete cascade“).

create table if not exists public.backups (
  mac text primary key references public.devices(mac) on delete cascade,
  data jsonb not null,
  bytes int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.backups enable row level security;
revoke all on public.backups from public, anon, authenticated;

-- ---------- App: Sicherung speichern ----------
create or replace function public.app_save_backup(p_mac text, p_token text, p_data jsonb)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  if not public.lumio_app_ok(p_mac, p_token) then return public.lumio_error('wrong'); end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then return public.lumio_error('Ungültige Sicherung.'); end if;
  n := octet_length(p_data::text);
  if n > 524288 then return public.lumio_error('Die Sicherung ist zu groß.'); end if;
  insert into public.backups(mac, data, bytes, updated_at) values (upper(p_mac), p_data, n, now())
  on conflict (mac) do update set data = excluded.data, bytes = excluded.bytes, updated_at = now();
  return json_build_object('ok', true, 'at', now());
end $$;

-- ---------- App: Stand der Sicherung (Zeitpunkt, Größe) ----------
create or replace function public.app_backup_info(p_mac text, p_token text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare b public.backups;
begin
  if not public.lumio_app_ok(p_mac, p_token) then return public.lumio_error('wrong'); end if;
  select * into b from public.backups where mac = upper(p_mac);
  return json_build_object('ok', true, 'at', b.updated_at, 'bytes', b.bytes);
end $$;

-- ---------- App: Sicherung löschen ----------
create or replace function public.app_delete_backup(p_mac text, p_token text)
returns json language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.lumio_app_ok(p_mac, p_token) then return public.lumio_error('wrong'); end if;
  delete from public.backups where mac = upper(p_mac);
  return json_build_object('ok', true);
end $$;

-- ---------- Wiederherstellen mit MAC + KEY (dieses oder ein anderes Gerät) ----------
create or replace function public.restore_backup(p_mac text, p_key text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare st text; b public.backups;
begin
  st := public.lumio_check(p_mac, p_key);           -- zählt Fehlversuche, sperrt nach 20 pro Stunde
  if st <> 'ok' then return public.lumio_error(st); end if;
  select * into b from public.backups where mac = upper(p_mac);
  return json_build_object('ok', true,
    'backup', b.data,
    'at', b.updated_at,
    'playlists', coalesce((
      select json_agg(json_build_object('name', p.name, 'type', p.type, 'url', p.url, 'server', p.server,
        'username', p.username, 'password', p.password) order by p.created_at)
      from public.playlists p where p.mac = upper(p_mac)), '[]'::json));
end $$;

-- ---------- Rechte ----------
revoke all on function public.app_save_backup(text, text, jsonb) from public;
revoke all on function public.app_backup_info(text, text) from public;
revoke all on function public.app_delete_backup(text, text) from public;
revoke all on function public.restore_backup(text, text) from public;
grant execute on function public.app_save_backup(text, text, jsonb) to anon;
grant execute on function public.app_backup_info(text, text) to anon;
grant execute on function public.app_delete_backup(text, text) to anon;
grant execute on function public.restore_backup(text, text) to anon;
