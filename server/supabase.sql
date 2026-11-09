-- Telvo Player – Datenbank für "Playlist per MAC-Adresse hochladen"
-- Einmal im Supabase SQL-Editor ausführen (kann gefahrlos wiederholt werden).
-- Sicherheit: Die Tabellen sind von außen NICHT direkt lesbar (RLS ohne Regeln).
-- Zugriff gibt es nur über die Funktionen unten, und nur mit MAC + Geräteschlüssel.
-- Nach 20 falschen Schlüsseln wird ein Gerät für 1 Stunde gesperrt.

create table if not exists public.devices (
  mac text primary key check (mac ~ '^([0-9A-F]{2}:){5}[0-9A-F]{2}$'),
  key_hash text not null,
  fails int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  mac text not null references public.devices(mac) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  type text not null check (type in ('m3u', 'xtream')),
  url text check (url is null or char_length(url) <= 2000),
  server text check (server is null or char_length(server) <= 500),
  username text check (username is null or char_length(username) <= 200),
  password text check (password is null or char_length(password) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists playlists_mac_idx on public.playlists(mac);

alter table public.devices enable row level security;
alter table public.playlists enable row level security;
revoke all on public.devices, public.playlists from anon, authenticated;

create or replace function public.lumio_hash(p_mac text, p_key text)
returns text language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest('lumio:' || upper(p_mac) || ':' || upper(p_key), 'sha256'), 'hex');
$$;

-- Prüft MAC + Schlüssel. Ergebnis: ok | wrong | unknown | locked (wirft keine Fehler,
-- damit gezählte Fehlversuche gespeichert bleiben)
create or replace function public.lumio_check(p_mac text, p_key text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare d public.devices;
begin
  select * into d from public.devices where mac = upper(coalesce(p_mac, ''));
  if not found then return 'unknown'; end if;
  if d.locked_until is not null and d.locked_until > now() then return 'locked'; end if;
  if d.key_hash = public.lumio_hash(p_mac, coalesce(p_key, '')) then
    update public.devices set fails = 0, locked_until = null, last_seen = now() where mac = d.mac;
    return 'ok';
  end if;
  update public.devices
     set fails = d.fails + 1,
         locked_until = case when d.fails + 1 >= 20 then now() + interval '1 hour' else null end
   where mac = d.mac;
  return 'wrong';
end $$;

create or replace function public.lumio_error(p_status text)
returns json language sql immutable as $$
  select json_build_object('ok', false, 'error', case p_status
    when 'unknown' then 'Gerät nicht gefunden. Öffne die App einmal mit Internetverbindung.'
    when 'locked' then 'Zu viele Fehlversuche. Bitte in einer Stunde erneut versuchen.'
    when 'wrong' then 'MAC-Adresse oder Geräteschlüssel falsch.'
    else p_status end);
$$;

-- Die App meldet ihr Gerät an (beim Start)
create or replace function public.register_device(p_mac text, p_key text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare st text;
begin
  if upper(coalesce(p_mac, '')) !~ '^([0-9A-F]{2}:){5}[0-9A-F]{2}$' or coalesce(p_key, '') !~ '^[A-Za-z0-9]{6,12}$' then
    return public.lumio_error('Ungültige Geräte-Daten.');
  end if;
  insert into public.devices(mac, key_hash) values (upper(p_mac), public.lumio_hash(p_mac, p_key))
  on conflict (mac) do nothing;
  st := public.lumio_check(p_mac, p_key);
  if st <> 'ok' then return public.lumio_error(st); end if;
  return json_build_object('ok', true);
end $$;

-- App und Webseite: Playlists eines Geräts abrufen
create or replace function public.list_playlists(p_mac text, p_key text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare st text;
begin
  st := public.lumio_check(p_mac, p_key);
  if st <> 'ok' then return public.lumio_error(st); end if;
  return json_build_object('ok', true, 'items', coalesce((
    select json_agg(json_build_object('id', p.id, 'name', p.name, 'type', p.type, 'url', p.url,
      'server', p.server, 'username', p.username, 'password', p.password, 'created_at', p.created_at) order by p.created_at)
    from public.playlists p where p.mac = upper(p_mac)), '[]'::json));
end $$;

-- Webseite: Playlist für ein Gerät hinzufügen
create or replace function public.add_playlist(
  p_mac text, p_key text, p_name text, p_type text,
  p_url text default null, p_server text default null, p_username text default null, p_password text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare st text; new_id uuid;
begin
  st := public.lumio_check(p_mac, p_key);
  if st <> 'ok' then return public.lumio_error(st); end if;
  if (select count(*) from public.playlists where mac = upper(p_mac)) >= 20 then
    return public.lumio_error('Maximal 20 Playlists pro Gerät.');
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

-- Webseite: Playlist löschen
create or replace function public.delete_playlist(p_mac text, p_key text, p_id uuid)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare st text;
begin
  st := public.lumio_check(p_mac, p_key);
  if st <> 'ok' then return public.lumio_error(st); end if;
  delete from public.playlists where id = p_id and mac = upper(p_mac);
  return json_build_object('ok', true);
end $$;

revoke all on function public.lumio_hash(text, text) from public, anon, authenticated;
revoke all on function public.lumio_check(text, text) from public, anon, authenticated;
revoke all on function public.lumio_error(text) from public, anon, authenticated;
revoke all on function public.register_device(text, text) from public;
revoke all on function public.list_playlists(text, text) from public;
revoke all on function public.add_playlist(text, text, text, text, text, text, text, text) from public;
revoke all on function public.delete_playlist(text, text, uuid) from public;
grant execute on function public.register_device(text, text) to anon;
grant execute on function public.list_playlists(text, text) to anon;
grant execute on function public.add_playlist(text, text, text, text, text, text, text, text) to anon;
grant execute on function public.delete_playlist(text, text, uuid) to anon;

-- ==========================================================
-- Erweiterung (Kunden-Webseite): Playlist bearbeiten + Support-Nachrichten
-- Nur Ergänzungen – bestehende Tabellen und Funktionen bleiben unverändert.
-- ==========================================================

-- Webseite: Playlist bearbeiten. Die ID bleibt gleich, damit Favoriten und
-- "Weiterschauen" in der App erhalten bleiben.
create or replace function public.update_playlist(
  p_mac text, p_key text, p_id uuid, p_name text, p_type text,
  p_url text default null, p_server text default null, p_username text default null, p_password text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare st text;
begin
  st := public.lumio_check(p_mac, p_key);
  if st <> 'ok' then return public.lumio_error(st); end if;
  if p_type not in ('m3u', 'xtream') then return public.lumio_error('Unbekannter Playlist-Typ.'); end if;
  if p_type = 'm3u' and coalesce(p_url, '') !~* '^https?://' then
    return public.lumio_error('Bitte einen gültigen M3U-Link (http:// oder https://) eingeben.');
  end if;
  if p_type = 'xtream' and (coalesce(p_server, '') = '' or coalesce(p_username, '') = '' or coalesce(p_password, '') = '') then
    return public.lumio_error('Bitte Server, Benutzername und Passwort eingeben.');
  end if;
  update public.playlists set
    name = left(coalesce(nullif(trim(p_name), ''), name), 60),
    type = p_type,
    url = case when p_type = 'm3u' then p_url end,
    server = case when p_type = 'xtream' then p_server end,
    username = case when p_type = 'xtream' then p_username end,
    password = case when p_type = 'xtream' then p_password end
  where id = p_id and mac = upper(p_mac);
  if not found then return public.lumio_error('Playlist nicht gefunden.'); end if;
  return json_build_object('ok', true, 'id', p_id);
end $$;

-- Support-Nachrichten von der Webseite. Lesen: Supabase → Table Editor → support_messages
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  mac text not null references public.devices(mac) on delete cascade,
  topic text not null check (char_length(topic) between 1 and 60),
  message text not null check (char_length(message) between 5 and 2000),
  contact text check (contact is null or char_length(contact) <= 200),
  created_at timestamptz not null default now(),
  done boolean not null default false
);
create index if not exists support_messages_mac_idx on public.support_messages(mac, created_at);
alter table public.support_messages enable row level security;
revoke all on public.support_messages from anon, authenticated;

create or replace function public.send_support(p_mac text, p_key text, p_topic text, p_message text, p_contact text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare st text;
begin
  st := public.lumio_check(p_mac, p_key);
  if st <> 'ok' then return public.lumio_error(st); end if;
  if char_length(trim(coalesce(p_message, ''))) < 5 then
    return public.lumio_error('Bitte beschreibe dein Anliegen etwas genauer.');
  end if;
  if (select count(*) from public.support_messages where mac = upper(p_mac) and created_at > now() - interval '1 day') >= 5 then
    return public.lumio_error('Maximal 5 Nachrichten pro Tag.');
  end if;
  insert into public.support_messages(mac, topic, message, contact)
  values (upper(p_mac), left(coalesce(nullif(trim(p_topic), ''), 'Sonstiges'), 60), left(trim(p_message), 2000),
          nullif(left(trim(coalesce(p_contact, '')), 200), ''));
  return json_build_object('ok', true);
end $$;

revoke all on function public.update_playlist(text, text, uuid, text, text, text, text, text, text) from public;
revoke all on function public.send_support(text, text, text, text, text) from public;
grant execute on function public.update_playlist(text, text, uuid, text, text, text, text, text, text) to anon;
grant execute on function public.send_support(text, text, text, text, text) to anon;
