-- Telvo Player – Bewertung: eine pro Gerät (MAC), später änderbar (November 2026)
-- Einmal im Supabase SQL-Editor ausführen. Kann gefahrlos wiederholt werden.
-- Voraussetzung: server/supabase.sql, server/admin.sql und server/sicherheit-2026-11.sql liefen bereits.
--
-- Was sich ändert:
-- 1. Neue Tabelle device_ratings: höchstens EINE Bewertung (1–5 Sterne) pro Gerät. Bewertet ein Gerät erneut,
--    wird die alte Bewertung ersetzt (nicht doppelt gezählt); „changes“ zählt, wie oft sie geändert wurde.
-- 2. Funktionen für die App: app_set_rating / app_get_rating (mit App-Token) und set_rating / get_rating
--    (ältere Apps mit MAC + KEY). Ohne diese Datei schickt die App die Sterne wie bisher als Feedback-Nachricht.
-- 3. Verwaltungsbereich: neue Funktion admin_ratings liefert Anzahl, Durchschnitt und Verteilung der Bewertungen.
-- Lob/Kritik als Text kommt weiterhin als Support-Nachricht (Thema „Feedback“) an.

create table if not exists public.device_ratings (
  mac text primary key references public.devices(mac) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  changes int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.device_ratings enable row level security;
revoke all on public.device_ratings from anon, authenticated;

-- gemeinsamer Teil: speichern oder ersetzen, höchstens 10 Änderungen pro Tag
create or replace function public.lumio_set_rating(p_mac text, p_stars int)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare old_stars smallint; old_at timestamptz; n int;
begin
  if p_stars is null or p_stars < 1 or p_stars > 5 then return public.lumio_error('Bitte 1 bis 5 Sterne wählen.'); end if;
  select stars, updated_at, changes into old_stars, old_at, n from public.device_ratings where mac = upper(p_mac);
  if old_stars is not null and old_at > now() - interval '1 day' and n >= 10 then
    return public.lumio_error('Maximal 10 Änderungen pro Tag.');
  end if;
  insert into public.device_ratings(mac, stars) values (upper(p_mac), p_stars)
  on conflict (mac) do update set stars = excluded.stars, changes = public.device_ratings.changes + 1, updated_at = now();
  return json_build_object('ok', true, 'stars', p_stars, 'previous', old_stars);
end $$;

create or replace function public.app_set_rating(p_mac text, p_token text, p_stars int)
returns json language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.lumio_app_ok(p_mac, p_token) then return public.lumio_error('wrong'); end if;
  return public.lumio_set_rating(p_mac, p_stars);
end $$;

create or replace function public.set_rating(p_mac text, p_key text, p_stars int)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare st text;
begin
  st := public.lumio_check(p_mac, p_key);
  if st <> 'ok' then return public.lumio_error(st); end if;
  return public.lumio_set_rating(p_mac, p_stars);
end $$;

create or replace function public.app_get_rating(p_mac text, p_token text)
returns json language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not public.lumio_app_ok(p_mac, p_token) then return public.lumio_error('wrong'); end if;
  return json_build_object('ok', true, 'stars', (select stars from public.device_ratings where mac = upper(p_mac)),
    'at', (select updated_at from public.device_ratings where mac = upper(p_mac)));
end $$;

create or replace function public.get_rating(p_mac text, p_key text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare st text;
begin
  st := public.lumio_check(p_mac, p_key);
  if st <> 'ok' then return public.lumio_error(st); end if;
  return json_build_object('ok', true, 'stars', (select stars from public.device_ratings where mac = upper(p_mac)),
    'at', (select updated_at from public.device_ratings where mac = upper(p_mac)));
end $$;

revoke all on function public.lumio_set_rating(text, int) from public, anon, authenticated;
revoke all on function public.app_set_rating(text, text, int) from public;
revoke all on function public.set_rating(text, text, int) from public;
revoke all on function public.app_get_rating(text, text) from public;
revoke all on function public.get_rating(text, text) from public;
grant execute on function public.app_set_rating(text, text, int) to anon;
grant execute on function public.set_rating(text, text, int) to anon;
grant execute on function public.app_get_rating(text, text) to anon;
grant execute on function public.get_rating(text, text) to anon;

-- Verwaltungsbereich: Bewertungen zusammengefasst (nur für Admins)
create or replace function public.admin_ratings()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.lumio_is_admin() then return public.lumio_denied(); end if;
  return json_build_object('ok', true,
    'count', (select count(*) from public.device_ratings),
    'avg', (select round(avg(stars)::numeric, 2) from public.device_ratings),
    'byStars', (select json_object_agg(s, coalesce(c, 0)) from (
      select g.s, r.c from generate_series(1, 5) g(s)
      left join (select stars as s, count(*) as c from public.device_ratings group by stars) r on r.s = g.s) x));
end $$;
revoke all on function public.admin_ratings() from public, anon;
grant execute on function public.admin_ratings() to authenticated;
