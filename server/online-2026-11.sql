-- Telvo – „Gerade online“ im Verwaltungsbereich (16.11.2026, Erays Freigabe des Entwurfs)
--   * admin_stats liefert zusätzlich online (last_seen jünger als 3 Minuten) und active1h (letzte Stunde)
--   * admin_list_devices kennt den Filter 'online'
-- Nur lesende Kennzahlen, keine Tabellen- oder Datenänderung. Rechte bleiben (create or replace behält sie).
-- Wiederholbar. Einspielen in Supabase: SQL Editor → Inhalt einfügen → Run (erst nach Erays OK).
-- Ohne dieses Skript zeigt die Kachel „–“ und „Datenbank-Update fehlt“; alles andere läuft wie bisher.

-- Kennzahlen für die Übersicht
create or replace function public.admin_stats()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.lumio_is_admin() then return public.lumio_denied(); end if;
  return json_build_object('ok', true,
    'devices',     (select count(*) from public.devices),
    'online',      (select count(*) from public.devices where last_seen > now() - interval '3 minutes'),
    'active1h',    (select count(*) from public.devices where last_seen > now() - interval '1 hour'),
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

-- Geräteliste. p_filter: all | online (3 Minuten) | active (7 Tage) | inactive (30+ Tage) | locked
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
             or (p_filter = 'online' and d.last_seen > now() - interval '3 minutes')
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
