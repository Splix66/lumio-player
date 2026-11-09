-- ==========================================================
-- Lumio Player – Verwaltungsbereich (Webseite docs/admin.html)
--
-- Voraussetzung: server/supabase.sql wurde bereits ausgeführt.
-- Einmal im Supabase SQL-Editor ausführen (kann gefahrlos wiederholt werden).
-- Bestehende Tabellen und Funktionen der App bleiben unverändert – nur Ergänzungen.
--
-- Sicherheit:
--  * Zugriff nur für angemeldete Supabase-Benutzer, die in public.admins eingetragen sind.
--  * Alle Tabellen bleiben per RLS gesperrt; gelesen/geändert wird nur über die Funktionen unten.
--  * Die Funktionen geben KEINE Zugangsdaten der Kunden heraus (kein Benutzername, kein Passwort,
--    keine vollständige M3U-Adresse) – nur Playlist-Name, Typ und Server-Host.
--  * Jede ändernde Aktion wird in public.admin_log protokolliert (wer, was, wann).
--
-- Ersten Administrator anlegen:
--  1. Supabase → Authentication → Users → „Add user“ → E-Mail + sicheres Passwort, „Auto Confirm User“.
--  2. Hier im SQL-Editor ausführen (E-Mail anpassen):
--       insert into public.admins(user_id, email)
--       select id, email from auth.users where email = 'admin@example.com'
--       on conflict (user_id) do nothing;
--  3. Empfohlen: Authentication → Sign In / Providers → „Allow new users to sign up“ AUSSCHALTEN.
--     (Selbst registrierte Konten hätten ohnehin keinen Zugriff, sind aber unnötig.)
-- ==========================================================

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create table if not exists public.admin_log (
  id bigint generated always as identity primary key,
  admin_id uuid,
  admin_email text,
  action text not null,
  target text,
  detail text,
  at timestamptz not null default now()
);
create index if not exists admin_log_at_idx on public.admin_log(at desc);
alter table public.admin_log enable row level security;
revoke all on public.admin_log from anon, authenticated;

-- Support-Nachrichten: interne Notiz und Bearbeitungsstand
alter table public.support_messages add column if not exists admin_note text
  check (admin_note is null or char_length(admin_note) <= 2000);
alter table public.support_messages add column if not exists handled_at timestamptz;
alter table public.support_messages add column if not exists handled_by text;
create index if not exists support_messages_open_idx on public.support_messages(done, created_at desc);
create index if not exists devices_last_seen_idx on public.devices(last_seen desc);
create index if not exists devices_created_idx on public.devices(created_at desc);

-- ---------- Hilfsfunktionen (nicht von außen aufrufbar) ----------

create or replace function public.lumio_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.lumio_admin_email()
returns text language sql stable security definer set search_path = public as $$
  select email from auth.users where id = auth.uid();
$$;

create or replace function public.lumio_denied()
returns json language sql immutable as $$
  select json_build_object('ok', false, 'error', 'Keine Berechtigung. Bitte als Administrator anmelden.');
$$;

create or replace function public.lumio_admin_log(p_action text, p_target text, p_detail text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.admin_log(admin_id, admin_email, action, target, detail)
  values (auth.uid(), public.lumio_admin_email(), p_action, p_target, left(p_detail, 500));
$$;

-- Nur den Server-Namen einer Adresse zeigen – ohne Benutzer:Passwort@, Port, Pfad und Parameter
create or replace function public.lumio_host(p_url text)
returns text language sql immutable as $$
  select substring(coalesce(p_url, '') from '^[A-Za-z][A-Za-z0-9+.-]*://(?:[^/?#@]*@)?([^/?#:]+)');
$$;

-- ---------- Funktionen für die Verwaltungsseite ----------

-- Wer bin ich? (prüft gleichzeitig die Admin-Berechtigung)
create or replace function public.admin_whoami()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.lumio_is_admin() then return public.lumio_denied(); end if;
  return json_build_object('ok', true, 'email', public.lumio_admin_email());
end $$;

-- Kennzahlen für die Übersicht
create or replace function public.admin_stats()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.lumio_is_admin() then return public.lumio_denied(); end if;
  return json_build_object('ok', true,
    'devices',     (select count(*) from public.devices),
    'active1',     (select count(*) from public.devices where last_seen > now() - interval '1 day'),
    'active7',     (select count(*) from public.devices where last_seen > now() - interval '7 days'),
    'new7',        (select count(*) from public.devices where created_at > now() - interval '7 days'),
    'locked',      (select count(*) from public.devices where locked_until > now()),
    'playlists',   (select count(*) from public.playlists),
    'xtream',      (select count(*) from public.playlists where type = 'xtream'),
    'm3u',         (select count(*) from public.playlists where type = 'm3u'),
    'supportOpen', (select count(*) from public.support_messages where not done),
    'support7',    (select count(*) from public.support_messages where created_at > now() - interval '7 days'),
    'daily', (
      select json_agg(json_build_object('day', d.day, 'n', coalesce(c.n, 0)) order by d.day)
      from (select generate_series((current_date - 13)::timestamp, current_date::timestamp, interval '1 day')::date as day) d
      left join (
        select created_at::date as day, count(*) as n from public.devices
        where created_at >= current_date - 13 group by 1
      ) c on c.day = d.day));
end $$;

-- Support-Postfach. p_filter: open | done | all
create or replace function public.admin_list_support(
  p_filter text default 'open', p_search text default null, p_limit int default 50, p_offset int default 0)
returns json language plpgsql stable security definer set search_path = public as $$
declare q text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not public.lumio_is_admin() then return public.lumio_denied(); end if;
  return (
    with f as (
      select s.id, s.mac, s.topic, s.message, s.contact, s.created_at, s.done, s.admin_note, s.handled_at, s.handled_by
      from public.support_messages s
      where (p_filter = 'all' or (p_filter = 'done' and s.done) or (coalesce(p_filter, 'open') = 'open' and not s.done))
        and (q is null or s.mac ilike '%' || q || '%' or s.message ilike '%' || q || '%'
             or s.topic ilike '%' || q || '%' or coalesce(s.contact, '') ilike '%' || q || '%')
    ), page as (
      select * from f order by done, created_at desc
      limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
    )
    select json_build_object('ok', true,
      'total', (select count(*) from f),
      'items', coalesce((select json_agg(to_json(page) order by page.done, page.created_at desc) from page), '[]'::json)));
end $$;

-- Support-Nachricht erledigen / wieder öffnen / Notiz speichern (null = unverändert lassen)
create or replace function public.admin_update_support(p_id uuid, p_done boolean default null, p_note text default null)
returns json language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if not public.lumio_is_admin() then return public.lumio_denied(); end if;
  who := public.lumio_admin_email();
  update public.support_messages set
    done       = coalesce(p_done, done),
    admin_note = case when p_note is null then admin_note else nullif(left(trim(p_note), 2000), '') end,
    handled_at = case when p_done is true and not done then now() when p_done is false then null else handled_at end,
    handled_by = case when p_done is true and not done then who when p_done is false then null else handled_by end
  where id = p_id;
  if not found then return json_build_object('ok', false, 'error', 'Nachricht nicht gefunden.'); end if;
  perform public.lumio_admin_log(
    case when p_done is true then 'support_done' when p_done is false then 'support_reopen' else 'support_note' end,
    (select mac from public.support_messages where id = p_id), 'Nachricht ' || p_id::text);
  return json_build_object('ok', true);
end $$;

-- Geräteliste. p_filter: all | active (7 Tage) | inactive (30+ Tage) | locked
create or replace function public.admin_list_devices(
  p_search text default null, p_filter text default 'all', p_limit int default 50, p_offset int default 0)
returns json language plpgsql stable security definer set search_path = public as $$
declare q text := nullif(upper(trim(coalesce(p_search, ''))), '');
begin
  if not public.lumio_is_admin() then return public.lumio_denied(); end if;
  return (
    with f as (
      select d.mac, d.created_at, d.last_seen, d.fails, d.locked_until,
        (select count(*) from public.playlists p where p.mac = d.mac) as playlists,
        (select count(*) from public.support_messages s where s.mac = d.mac and not s.done) as support_open
      from public.devices d
      where (q is null or d.mac like '%' || q || '%' or replace(d.mac, ':', '') like '%' || replace(q, ':', '') || '%')
        and (coalesce(p_filter, 'all') = 'all'
             or (p_filter = 'active' and d.last_seen > now() - interval '7 days')
             or (p_filter = 'inactive' and d.last_seen <= now() - interval '30 days')
             or (p_filter = 'locked' and (d.locked_until > now() or d.fails > 0)))
    ), page as (
      select * from f order by last_seen desc
      limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
    )
    select json_build_object('ok', true,
      'total', (select count(*) from f),
      'items', coalesce((select json_agg(to_json(page) order by page.last_seen desc) from page), '[]'::json)));
end $$;

-- Ein Gerät im Detail: Playlists (ohne Zugangsdaten) und Support-Nachrichten
create or replace function public.admin_device(p_mac text)
returns json language plpgsql stable security definer set search_path = public as $$
declare d public.devices;
begin
  if not public.lumio_is_admin() then return public.lumio_denied(); end if;
  select * into d from public.devices where mac = upper(coalesce(p_mac, ''));
  if not found then return json_build_object('ok', false, 'error', 'Gerät nicht gefunden.'); end if;
  return json_build_object('ok', true,
    'device', json_build_object('mac', d.mac, 'created_at', d.created_at, 'last_seen', d.last_seen,
                                'fails', d.fails, 'locked_until', d.locked_until),
    'playlists', coalesce((
      select json_agg(json_build_object('id', p.id, 'name', p.name, 'type', p.type,
               'host', public.lumio_host(coalesce(p.url, p.server)), 'created_at', p.created_at) order by p.created_at)
      from public.playlists p where p.mac = d.mac), '[]'::json),
    'support', coalesce((
      select json_agg(json_build_object('id', s.id, 'topic', s.topic, 'created_at', s.created_at, 'done', s.done)
               order by s.created_at desc)
      from public.support_messages s where s.mac = d.mac), '[]'::json));
end $$;

-- Sperre nach zu vielen falschen Schlüsseln aufheben
create or replace function public.admin_unlock_device(p_mac text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not public.lumio_is_admin() then return public.lumio_denied(); end if;
  update public.devices set fails = 0, locked_until = null where mac = upper(coalesce(p_mac, ''));
  if not found then return json_build_object('ok', false, 'error', 'Gerät nicht gefunden.'); end if;
  perform public.lumio_admin_log('device_unlock', upper(p_mac), null);
  return json_build_object('ok', true);
end $$;

-- Gerät mit allen Playlists und Support-Nachrichten löschen.
-- Achtung: Beim nächsten Abgleich verschwinden die online gespeicherten Playlists auch auf dem Gerät.
create or replace function public.admin_delete_device(p_mac text)
returns json language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.lumio_is_admin() then return public.lumio_denied(); end if;
  select count(*) into n from public.playlists where mac = upper(coalesce(p_mac, ''));
  delete from public.devices where mac = upper(coalesce(p_mac, ''));
  if not found then return json_build_object('ok', false, 'error', 'Gerät nicht gefunden.'); end if;
  perform public.lumio_admin_log('device_delete', upper(p_mac), n || ' Playlist(s)');
  return json_build_object('ok', true);
end $$;

-- Protokoll der Admin-Aktionen
create or replace function public.admin_list_log(p_limit int default 100, p_offset int default 0)
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.lumio_is_admin() then return public.lumio_denied(); end if;
  return json_build_object('ok', true, 'items', coalesce((
    select json_agg(to_json(x) order by x.at desc) from (
      select l.id, l.admin_email, l.action, l.target, l.detail, l.at from public.admin_log l
      order by l.at desc
      limit least(greatest(coalesce(p_limit, 100), 1), 500) offset greatest(coalesce(p_offset, 0), 0)) x), '[]'::json));
end $$;

-- ---------- Rechte ----------
-- Hilfsfunktionen: niemand von außen
revoke all on function public.lumio_is_admin() from public, anon, authenticated;
revoke all on function public.lumio_admin_email() from public, anon, authenticated;
revoke all on function public.lumio_denied() from public, anon, authenticated;
revoke all on function public.lumio_admin_log(text, text, text) from public, anon, authenticated;
revoke all on function public.lumio_host(text) from public, anon, authenticated;

-- Verwaltungsfunktionen: nur angemeldete Benutzer (jede Funktion prüft zusätzlich die Admin-Liste)
revoke all on function public.admin_whoami() from public, anon;
revoke all on function public.admin_stats() from public, anon;
revoke all on function public.admin_list_support(text, text, int, int) from public, anon;
revoke all on function public.admin_update_support(uuid, boolean, text) from public, anon;
revoke all on function public.admin_list_devices(text, text, int, int) from public, anon;
revoke all on function public.admin_device(text) from public, anon;
revoke all on function public.admin_unlock_device(text) from public, anon;
revoke all on function public.admin_delete_device(text) from public, anon;
revoke all on function public.admin_list_log(int, int) from public, anon;
grant execute on function public.admin_whoami() to authenticated;
grant execute on function public.admin_stats() to authenticated;
grant execute on function public.admin_list_support(text, text, int, int) to authenticated;
grant execute on function public.admin_update_support(uuid, boolean, text) to authenticated;
grant execute on function public.admin_list_devices(text, text, int, int) to authenticated;
grant execute on function public.admin_device(text) to authenticated;
grant execute on function public.admin_unlock_device(text) to authenticated;
grant execute on function public.admin_delete_device(text) to authenticated;
grant execute on function public.admin_list_log(int, int) to authenticated;
