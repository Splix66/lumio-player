-- Prüft server/online-2026-11.sql: „Gerade online“ (3 Minuten) und „letzte Stunde“ in admin_stats, Filter 'online' in admin_list_devices.
\set ON_ERROR_STOP 1
insert into auth.users(id, email) values ('00000000-0000-0000-0000-0000000000a1', 'admin@example.com');
insert into public.admins(user_id, email) values ('00000000-0000-0000-0000-0000000000a1', 'admin@example.com');
insert into public.devices(mac, key_hash, last_seen) values
  ('0E:00:00:00:00:01', 'x', now() - interval '1 minute'),
  ('0E:00:00:00:00:02', 'x', now() - interval '30 minutes'),
  ('0E:00:00:00:00:03', 'x', now() - interval '2 days');

-- Vergleichszahlen als Superuser ermitteln (die Rolle authenticated darf devices nicht direkt lesen)
select set_config('t.on', (select count(*) from public.devices where last_seen > now() - interval '3 minutes')::text, false),
       set_config('t.h1', (select count(*) from public.devices where last_seen > now() - interval '1 hour')::text, false);
select set_config('request.jwt.claim.sub', '', false);
set role authenticated;
-- ohne Admin-Anmeldung: keine Zahlen
do $$ begin
  assert (public.admin_stats()->>'ok') = 'false', 'ohne Anmeldung verweigert';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
do $$ declare s json := public.admin_stats(); l json; begin
  assert (s->>'ok') = 'true', 'admin_stats ok';
  -- Geräte aus früheren Tests zählen mit: darum mit den vorher ermittelten Zahlen vergleichen
  assert (s->>'online')::int = current_setting('t.on')::int, 'online = letzte 3 Minuten';
  assert (s->>'active1h')::int = current_setting('t.h1')::int, 'active1h = letzte Stunde';
  assert (s->>'online')::int < (s->>'active1h')::int, 'online kleiner als letzte Stunde';
  l := public.admin_list_devices('0E:00:00:00:00', 'online', 50, 0);
  assert (l->>'total')::int = 1, 'Filter online: nur das Gerät von vor 1 Minute';
  assert (l->'items'->0->>'mac') = '0E:00:00:00:00:01', 'richtiges Gerät';
  assert (public.admin_list_devices('0E:00:00:00:00', 'all', 50, 0)->>'total')::int = 3, 'Filter all unverändert';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
\echo 'online: alle Prüfungen bestanden'
