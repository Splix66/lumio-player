-- Telvo Player – automatische Fehlerberichte (November 2026)
-- Einmal im Supabase SQL-Editor ausführen. Kann gefahrlos wiederholt werden.
-- Voraussetzung: server/supabase.sql, server/admin.sql und server/sicherheit-2026-11.sql liefen bereits.
--
-- Was sich ändert:
-- 1. Neue Tabelle app_errors: gleiche Fehler werden zusammengefasst (gleiche Stelle + Meldung + Version + Gerätetyp)
--    und nur gezählt – wie oft und auf wie vielen Geräten, wann zuerst und zuletzt.
-- 2. Die App schickt nur, was ihr Fehlerprotokoll ohnehin enthält: Stelle („Wiedergabe“, „TV-Player“, „Absturz“ …)
--    und Meldung – Links, Benutzernamen, Passwörter und Token sind vorher entfernt. Keine Sender, keine Playlist.
--    Welches Gerät einen Fehler hatte, wird nur als Hash gespeichert (zum Zählen der Geräte), nicht die MAC selbst.
-- 3. Schutz: höchstens 60 Meldungen pro Gerät und Tag; Einträge älter als 90 Tage werden gelöscht.
-- 4. Verwaltungsbereich: admin_errors liefert die häufigsten Fehler der letzten 30 Tage.
-- Ohne diese Datei schickt die App nichts (sie merkt sich, dass die Funktion fehlt) – es geht nichts kaputt.

create table if not exists public.app_errors (
  fp text primary key,                       -- Fingerabdruck: md5(Stelle | Meldung | Version | Gerätetyp)
  w text not null,                           -- Stelle
  m text not null,                           -- Meldung (bereits bereinigt)
  version text not null default '',
  platform text not null default '',
  hits int not null default 0,               -- wie oft insgesamt
  devices int not null default 0,            -- auf wie vielen Geräten
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create table if not exists public.app_error_devices (
  fp text not null references public.app_errors(fp) on delete cascade,
  dev text not null,                         -- md5 der MAC – nur zum Zählen
  primary key (fp, dev)
);
create table if not exists public.app_error_limits (
  dev text primary key,
  day_start timestamptz not null default now(),
  n int not null default 0
);
alter table public.app_errors enable row level security;
alter table public.app_error_devices enable row level security;
alter table public.app_error_limits enable row level security;
revoke all on public.app_errors, public.app_error_devices, public.app_error_limits from anon, authenticated;

-- gemeinsamer Teil: Liste von { w, m, n } speichern
create or replace function public.lumio_report_errors(p_mac text, p_items json, p_version text, p_platform text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_dev text := md5('telvo:' || upper(coalesce(p_mac, '')));
  v_day timestamptz; v_n int; it json; v_w text; v_m text; v_cnt int; v_fp text; v_new boolean; v_saved int := 0;
  v_ver text := left(coalesce(p_version, ''), 20);
  v_pf text := left(coalesce(p_platform, ''), 20);
begin
  if p_items is null or json_typeof(p_items) <> 'array' then return public.lumio_error('items'); end if;
  -- Tageszähler pro Gerät
  select day_start, n into v_day, v_n from public.app_error_limits where dev = v_dev for update;
  if v_day is null or v_day <= now() - interval '1 day' then v_day := now(); v_n := 0; end if;
  for it in select * from json_array_elements(p_items) loop
    exit when v_n >= 60 or v_saved >= 20;
    v_w := left(trim(coalesce(it->>'w', '')), 20);
    -- Sicherheitsnetz: Links nochmals entfernen, falls eine alte App-Version sie nicht bereinigt hat
    v_m := left(regexp_replace(trim(coalesce(it->>'m', '')), '[a-zA-Z][a-zA-Z0-9+.-]*://\S+', '[Link]', 'g'), 240);
    v_cnt := least(greatest(coalesce((it->>'n')::int, 1), 1), 1000);
    continue when v_w = '' or v_m = '';
    v_fp := md5(v_w || '|' || v_m || '|' || v_ver || '|' || v_pf);
    insert into public.app_errors(fp, w, m, version, platform, hits, devices) values (v_fp, v_w, v_m, v_ver, v_pf, 0, 0)
      on conflict (fp) do nothing;
    insert into public.app_error_devices(fp, dev) values (v_fp, v_dev) on conflict do nothing;
    v_new := found;
    update public.app_errors set hits = hits + v_cnt, devices = devices + (case when v_new then 1 else 0 end), last_seen = now()
      where fp = v_fp;
    v_n := v_n + 1; v_saved := v_saved + 1;
  end loop;
  insert into public.app_error_limits(dev, day_start, n) values (v_dev, v_day, v_n)
    on conflict (dev) do update set day_start = excluded.day_start, n = excluded.n;
  -- ab und zu aufräumen: alles, was 90 Tage nicht mehr vorkam
  if random() < 0.02 then
    delete from public.app_errors where last_seen < now() - interval '90 days';
    delete from public.app_error_limits where day_start < now() - interval '2 days';
  end if;
  return json_build_object('ok', true, 'saved', v_saved);
end $$;

create or replace function public.app_report_errors(p_mac text, p_token text, p_items json, p_version text, p_platform text)
returns json language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.lumio_app_ok(p_mac, p_token) then return public.lumio_error('wrong'); end if;
  return public.lumio_report_errors(p_mac, p_items, p_version, p_platform);
end $$;

create or replace function public.report_errors(p_mac text, p_key text, p_items json, p_version text, p_platform text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare st text;
begin
  st := public.lumio_check(p_mac, p_key);
  if st <> 'ok' then return public.lumio_error(st); end if;
  return public.lumio_report_errors(p_mac, p_items, p_version, p_platform);
end $$;

revoke all on function public.lumio_report_errors(text, json, text, text) from public, anon, authenticated;
revoke all on function public.app_report_errors(text, text, json, text, text) from public;
revoke all on function public.report_errors(text, text, json, text, text) from public;
grant execute on function public.app_report_errors(text, text, json, text, text) to anon;
grant execute on function public.report_errors(text, text, json, text, text) to anon;

-- Verwaltungsbereich: häufigste Fehler der letzten 30 Tage (nur für Admins)
create or replace function public.admin_errors()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.lumio_is_admin() then return public.lumio_denied(); end if;
  return json_build_object('ok', true, 'items', coalesce((select json_agg(x) from (
    select w, m, version, platform, hits, devices, first_seen, last_seen from public.app_errors
    where last_seen > now() - interval '30 days' order by devices desc, hits desc limit 100) x), '[]'::json));
end $$;
revoke all on function public.admin_errors() from public, anon;
grant execute on function public.admin_errors() to authenticated;
