-- Telvo Player – Obergrenzen pro Gerät (Entscheidung Eray, 12.11.2026)
--   * höchstens 10 Playlists pro Gerät (vorher 20) – App, Kundenportal und Online-Dienst prüfen dieselbe Zahl
--   * Online-Sicherung bis 1 MB (vorher 512 KB), weil jetzt 8 statt 6 Benutzer eigene Favoriten und Verläufe haben
-- Bestehende Playlists bleiben erhalten; nur neue werden ab 10 abgelehnt. Am 12.11.2026 hatte kein Gerät mehr als 10.
-- Wiederholbar. Einspielen in Supabase: SQL Editor → Inhalt einfügen → Run (erst nach Erays OK, gehört zur nächsten Version).

-- ---------- Kundenportal: Playlist anlegen (mit MAC + KEY) ----------
create or replace function public.add_playlist(
  p_mac text, p_key text, p_name text, p_type text,
  p_url text default null, p_server text default null, p_username text default null, p_password text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare st text; new_id uuid;
begin
  st := public.lumio_check(p_mac, p_key);
  if st <> 'ok' then return public.lumio_error(st); end if;
  if (select count(*) from public.playlists where mac = upper(p_mac)) >= 10 then
    return public.lumio_error('Maximal 10 Playlists pro Gerät.');
  end if;
  if p_type = 'm3u' and coalesce(p_url, '') !~* '^https?://' then
    return public.lumio_error('Bitte einen gültigen M3U-Link (http:// oder https://) eingeben.');
  end if;
  if p_type = 'xtream' and (coalesce(p_server, '') = '' or coalesce(p_username, '') = '' or coalesce(p_password, '') = '') then
    return public.lumio_error('Bitte Server, Benutzername und Passwort eingeben.');
  end if;
  if p_type not in ('m3u', 'xtream') then return public.lumio_error('Unbekannter Playlist-Typ.'); end if;
  insert into public.playlists(mac, name, type, url, server, username, password)
  values (upper(p_mac), left(coalesce(nullif(trim(p_name), ''), 'Playlist'), 60), p_type,
          case when p_type = 'm3u' then p_url end,
          case when p_type = 'xtream' then p_server end,
          case when p_type = 'xtream' then p_username end,
          case when p_type = 'xtream' then p_password end)
  returning id into new_id;
  return json_build_object('ok', true, 'id', new_id);
end $$;

-- ---------- App: Playlist anlegen (mit Geräte-Token) ----------
create or replace function public.app_add_playlist(
  p_mac text, p_token text, p_name text, p_type text,
  p_url text default null, p_server text default null, p_username text default null, p_password text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare new_id uuid;
begin
  if not public.lumio_app_ok(p_mac, p_token) then return public.lumio_error('wrong'); end if;
  if p_type not in ('m3u', 'xtream') then return public.lumio_error('Unbekannter Playlist-Typ.'); end if;
  if (select count(*) from public.playlists where mac = upper(p_mac)) >= 10 then
    return public.lumio_error('Maximal 10 Playlists pro Gerät.');
  end if;
  if p_type = 'm3u' and coalesce(p_url, '') !~* '^https?://' then
    return public.lumio_error('Bitte einen gültigen M3U-Link (http:// oder https://) eingeben.');
  end if;
  if p_type = 'xtream' and (coalesce(p_server, '') = '' or coalesce(p_username, '') = '' or coalesce(p_password, '') = '') then
    return public.lumio_error('Bitte Server, Benutzername und Passwort eingeben.');
  end if;
  insert into public.playlists(mac, name, type, url, server, username, password)
  values (upper(p_mac), left(coalesce(nullif(trim(p_name), ''), 'Playlist'), 60), p_type,
          case when p_type = 'm3u' then p_url end,
          case when p_type = 'xtream' then p_server end,
          case when p_type = 'xtream' then p_username end,
          case when p_type = 'xtream' then p_password end)
  returning id into new_id;
  return json_build_object('ok', true, 'id', new_id);
end $$;

-- ---------- App: Sicherung speichern (bis 1 MB) ----------
create or replace function public.app_save_backup(p_mac text, p_token text, p_data jsonb)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  if not public.lumio_app_ok(p_mac, p_token) then return public.lumio_error('wrong'); end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then return public.lumio_error('Ungültige Sicherung.'); end if;
  n := octet_length(p_data::text);
  if n > 1048576 then return public.lumio_error('Die Sicherung ist zu groß.'); end if;
  insert into public.backups(mac, data, bytes, updated_at) values (upper(p_mac), p_data, n, now())
  on conflict (mac) do update set data = excluded.data, bytes = excluded.bytes, updated_at = now();
  return json_build_object('ok', true, 'at', now());
end $$;
-- Rechte bleiben unverändert (create or replace behält revoke/grant der bestehenden Funktionen).
