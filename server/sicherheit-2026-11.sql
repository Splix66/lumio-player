-- Telvo Player – Sicherheits-Update (November 2026)
-- Einmal im Supabase SQL-Editor ausführen. Kann gefahrlos wiederholt werden.
-- Voraussetzung: server/supabase.sql (und für den Verwaltungsbereich server/admin.sql) liefen bereits.
--
-- Was sich ändert:
-- 1. Fehlversuche werden lückenlos gezählt (auch bei vielen gleichzeitigen Anfragen) und ein erfolgreicher
--    Abgleich setzt den Zähler nicht mehr zurück: höchstens 20 falsche KEYs pro Stunde und Gerät.
--    Vorher konnte man durch gleichzeitige Anfragen und das Zurücksetzen bei jedem App-Abgleich deutlich mehr probieren.
-- 2. Die App bekommt einen eigenen, langen Geheimschlüssel (Token). Darüber gleicht sie ab – ohne Sperre nach
--    Fehlversuchen. Wer fremde MACs mit falschen KEYs bombardiert, sperrt damit nur noch die Webseite für eine Stunde,
--    nicht mehr die App. Alte App-Versionen funktionieren unverändert weiter (über MAC + KEY).
-- 3. Neue Funktionen für die App: KEY erneuern und Gerät samt Online-Daten löschen.
-- 4. Automatisches Aufräumen: erledigte Support-Nachrichten nach 30 Tagen, Geräte nach 12 Monaten ohne Verbindung
--    (mit ihren Playlists), Protokoll des Verwaltungsbereichs nach 12 Monaten.
--    Läuft täglich, wenn die Erweiterung „pg_cron“ aktiv ist (Supabase → Database → Extensions → pg_cron).

-- ---------- Neue Spalten ----------
alter table public.devices add column if not exists fail_since timestamptz;   -- Beginn des aktuellen Fehlversuch-Fensters
alter table public.devices add column if not exists token_hash text;          -- Prüfwert des App-Tokens

-- ---------- 1. Fehlversuche: atomar, festes Zeitfenster ----------
create or replace function public.lumio_check(p_mac text, p_key text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare d public.devices; v_mac text := upper(coalesce(p_mac, '')); v_fails int; v_fresh boolean;
begin
  -- „for update“: gleichzeitige Anfragen für dasselbe Gerät warten aufeinander → jeder Fehlversuch zählt
  select * into d from public.devices where mac = v_mac for update;
  if not found then return 'unknown'; end if;
  if d.locked_until is not null and d.locked_until > now() then return 'locked'; end if;
  v_fresh := d.fail_since is null or d.fail_since < now() - interval '1 hour';
  if d.key_hash = public.lumio_hash(v_mac, coalesce(p_key, '')) then
    -- richtiger KEY: Fehlversuche im laufenden Fenster bleiben bestehen (kein Zurücksetzen durch die App)
    update public.devices set last_seen = now(), locked_until = null,
           fails = case when v_fresh then 0 else fails end,
           fail_since = case when v_fresh then null else fail_since end
     where mac = v_mac;
    return 'ok';
  end if;
  update public.devices set
         fails = case when v_fresh then 1 else fails + 1 end,
         fail_since = case when v_fresh then now() else fail_since end
   where mac = v_mac
   returning fails into v_fails;
  if v_fails >= 20 then
    update public.devices set locked_until = now() + interval '1 hour', fails = 0, fail_since = null where mac = v_mac;
  end if;
  return 'wrong';
end $$;

-- ---------- 2. App-Token ----------
create or replace function public.lumio_token_hash(p_mac text, p_token text)
returns text language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest('lumio-token:' || upper(p_mac) || ':' || lower(p_token), 'sha256'), 'hex');
$$;

-- Prüft MAC + Token (keine Sperre nötig: 128 Bit Zufall lassen sich nicht erraten)
create or replace function public.lumio_app_ok(p_mac text, p_token text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{32,64}$' then return false; end if;
  update public.devices set last_seen = now()
   where mac = upper(coalesce(p_mac, '')) and token_hash is not null
     and token_hash = public.lumio_token_hash(p_mac, p_token);
  return found;
end $$;

-- App meldet sich an. Neues Gerät: mit KEY und Token anlegen. Bestehendes Gerät ohne Token (ältere App-Version):
-- Token einmalig mit richtigem KEY hinterlegen.
create or replace function public.app_register(p_mac text, p_key text, p_token text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare d public.devices; v_mac text := upper(coalesce(p_mac, '')); st text;
begin
  if v_mac !~ '^([0-9A-F]{2}:){5}[0-9A-F]{2}$' or coalesce(p_key, '') !~ '^[A-Za-z0-9]{6,12}$'
     or coalesce(p_token, '') !~ '^[0-9a-f]{32,64}$' then
    return public.lumio_error('Ungültige Geräte-Daten.');
  end if;
  insert into public.devices(mac, key_hash, token_hash)
  values (v_mac, public.lumio_hash(v_mac, p_key), public.lumio_token_hash(v_mac, p_token))
  on conflict (mac) do nothing;
  select * into d from public.devices where mac = v_mac;
  if d.token_hash = public.lumio_token_hash(v_mac, p_token) then
    update public.devices set last_seen = now() where mac = v_mac;
    return json_build_object('ok', true);
  end if;
  if d.token_hash is null then
    st := public.lumio_check(v_mac, p_key);
    if st <> 'ok' then return public.lumio_error(st); end if;
    update public.devices set token_hash = public.lumio_token_hash(v_mac, p_token) where mac = v_mac;
    return json_build_object('ok', true);
  end if;
  return public.lumio_error('wrong');
end $$;

create or replace function public.app_list_playlists(p_mac text, p_token text)
returns json language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.lumio_app_ok(p_mac, p_token) then return public.lumio_error('wrong'); end if;
  return json_build_object('ok', true, 'items', coalesce((
    select json_agg(json_build_object('id', p.id, 'name', p.name, 'type', p.type, 'url', p.url,
      'server', p.server, 'username', p.username, 'password', p.password, 'created_at', p.created_at) order by p.created_at)
    from public.playlists p where p.mac = upper(p_mac)), '[]'::json));
end $$;

create or replace function public.app_add_playlist(
  p_mac text, p_token text, p_name text, p_type text,
  p_url text default null, p_server text default null, p_username text default null, p_password text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare new_id uuid;
begin
  if not public.lumio_app_ok(p_mac, p_token) then return public.lumio_error('wrong'); end if;
  if p_type not in ('m3u', 'xtream') then return public.lumio_error('Unbekannter Playlist-Typ.'); end if;
  if (select count(*) from public.playlists where mac = upper(p_mac)) >= 20 then
    return public.lumio_error('Maximal 20 Playlists pro Gerät.');
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

create or replace function public.app_delete_playlist(p_mac text, p_token text, p_id uuid)
returns json language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.lumio_app_ok(p_mac, p_token) then return public.lumio_error('wrong'); end if;
  delete from public.playlists where id = p_id and mac = upper(p_mac);
  return json_build_object('ok', true);
end $$;

-- ---------- 3. KEY erneuern, Gerät löschen ----------
-- Neuer KEY: Wer den alten kannte (z. B. von einem Foto des Bildschirms), kommt nicht mehr an die Playlists.
create or replace function public.app_rotate_key(p_mac text, p_token text, p_new_key text)
returns json language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.lumio_app_ok(p_mac, p_token) then return public.lumio_error('wrong'); end if;
  if coalesce(p_new_key, '') !~ '^[A-Za-z0-9]{6,12}$' then return public.lumio_error('Ungültige Geräte-Daten.'); end if;
  update public.devices set key_hash = public.lumio_hash(p_mac, p_new_key), fails = 0, fail_since = null, locked_until = null
   where mac = upper(p_mac);
  return json_build_object('ok', true);
end $$;

-- „Alles zurücksetzen“ in der App: Gerät mit allen Playlists und Support-Nachrichten löschen
create or replace function public.app_delete_device(p_mac text, p_token text)
returns json language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.lumio_app_ok(p_mac, p_token) then return public.lumio_error('wrong'); end if;
  delete from public.devices where mac = upper(p_mac);   -- Playlists und Support-Nachrichten: on delete cascade
  return json_build_object('ok', true);
end $$;

-- ---------- 4. Aufräumen ----------
create or replace function public.lumio_purge()
returns json language plpgsql security definer set search_path = public, extensions as $$
declare n_sup int := 0; n_dev int := 0; n_log int := 0;
begin
  delete from public.support_messages where done and created_at < now() - interval '30 days';
  get diagnostics n_sup = row_count;
  delete from public.devices where last_seen < now() - interval '12 months';
  get diagnostics n_dev = row_count;
  if to_regclass('public.admin_log') is not null then
    execute 'delete from public.admin_log where at < now() - interval ''12 months''';
    get diagnostics n_log = row_count;
  end if;
  return json_build_object('ok', true, 'support', n_sup, 'devices', n_dev, 'log', n_log);
end $$;

-- ---------- Rechte ----------
revoke all on function public.lumio_check(text, text) from public, anon, authenticated;
revoke all on function public.lumio_token_hash(text, text) from public, anon, authenticated;
revoke all on function public.lumio_app_ok(text, text) from public, anon, authenticated;
revoke all on function public.lumio_purge() from public, anon, authenticated;
revoke all on function public.app_register(text, text, text) from public;
revoke all on function public.app_list_playlists(text, text) from public;
revoke all on function public.app_add_playlist(text, text, text, text, text, text, text, text) from public;
revoke all on function public.app_delete_playlist(text, text, uuid) from public;
revoke all on function public.app_rotate_key(text, text, text) from public;
revoke all on function public.app_delete_device(text, text) from public;
grant execute on function public.app_register(text, text, text) to anon;
grant execute on function public.app_list_playlists(text, text) to anon;
grant execute on function public.app_add_playlist(text, text, text, text, text, text, text, text) to anon;
grant execute on function public.app_delete_playlist(text, text, uuid) to anon;
grant execute on function public.app_rotate_key(text, text, text) to anon;
grant execute on function public.app_delete_device(text, text) to anon;

-- ---------- Tägliches Aufräumen (nur wenn pg_cron aktiv ist) ----------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('telvo-aufraeumen', '17 3 * * *', 'select public.lumio_purge()');
  else
    raise notice 'pg_cron ist nicht aktiv: Aufräumen läuft nicht automatisch. Supabase → Database → Extensions → pg_cron einschalten und dieses Skript erneut ausführen.';
  end if;
end $$;
