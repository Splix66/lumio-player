-- Prüft server/sicherheit-2026-11.sql gegen eine echte PostgreSQL-Datenbank.
-- Aufruf: tests/sql/run.sh (lokal oder auf GitHub, siehe .github/workflows/sql-tests.yml)
-- Jede Prüfung bricht mit einer Fehlermeldung ab, wenn etwas nicht stimmt.
\set ON_ERROR_STOP 1
set role anon;

-- 1. Bisheriger Weg (ältere App-Versionen, Webseite) funktioniert unverändert
do $$ begin
  assert (public.register_device('AA:00:00:00:00:01', 'KEY111')->>'ok') = 'true', 'register_device';
  assert (public.add_playlist('AA:00:00:00:00:01', 'KEY111', 'Web', 'm3u', 'http://x/a.m3u')->>'ok') = 'true', 'add_playlist';
  assert json_array_length(public.list_playlists('AA:00:00:00:00:01', 'KEY111')->'items') = 1, 'list_playlists';
end $$;

-- 2. Zeitfenster: ein richtiger KEY zwischendurch setzt die Fehlversuche nicht zurück (getrennte Anfragen)
select public.list_playlists('AA:00:00:00:00:01', 'FALSCH') from generate_series(1, 1);
\o /dev/null
select public.list_playlists('AA:00:00:00:00:01', 'FALSCH'); select public.list_playlists('AA:00:00:00:00:01', 'FALSCH');
select public.list_playlists('AA:00:00:00:00:01', 'FALSCH'); select public.list_playlists('AA:00:00:00:00:01', 'FALSCH');
select public.list_playlists('AA:00:00:00:00:01', 'FALSCH'); select public.list_playlists('AA:00:00:00:00:01', 'FALSCH');
select public.list_playlists('AA:00:00:00:00:01', 'FALSCH'); select public.list_playlists('AA:00:00:00:00:01', 'FALSCH');
select public.list_playlists('AA:00:00:00:00:01', 'FALSCH');
select public.list_playlists('AA:00:00:00:00:01', 'KEY111');
select public.list_playlists('AA:00:00:00:00:01', 'FALSCH'); select public.list_playlists('AA:00:00:00:00:01', 'FALSCH');
select public.list_playlists('AA:00:00:00:00:01', 'FALSCH'); select public.list_playlists('AA:00:00:00:00:01', 'FALSCH');
select public.list_playlists('AA:00:00:00:00:01', 'FALSCH'); select public.list_playlists('AA:00:00:00:00:01', 'FALSCH');
select public.list_playlists('AA:00:00:00:00:01', 'FALSCH'); select public.list_playlists('AA:00:00:00:00:01', 'FALSCH');
select public.list_playlists('AA:00:00:00:00:01', 'FALSCH'); select public.list_playlists('AA:00:00:00:00:01', 'FALSCH');
\o
do $$ begin
  assert (public.list_playlists('AA:00:00:00:00:01', 'KEY111')->>'error') like 'Zu viele Fehlversuche%', 'nach 20 Fehlversuchen im Fenster gesperrt';
end $$;

-- 3. Token-Weg der App: anlegen, hochladen, abrufen; falscher Token abgelehnt; Sperre der Webseite stört die App nicht
do $$ declare t text := '0123456789abcdef0123456789abcdef'; begin
  assert (public.app_register('BB:00:00:00:00:01', 'KEYBB1', t)->>'ok') = 'true', 'app_register neu';
  assert (public.app_add_playlist('BB:00:00:00:00:01', t, 'App', 'xtream', null, 'http://s', 'u', 'p')->>'ok') = 'true', 'app_add_playlist';
  assert json_array_length(public.app_list_playlists('BB:00:00:00:00:01', t)->'items') = 1, 'app_list_playlists';
  assert (public.app_list_playlists('BB:00:00:00:00:01', 'ffffffffffffffffffffffffffffffff')->>'ok') = 'false', 'falscher Token';
end $$;
reset role; update public.devices set locked_until = now() + interval '1 hour' where mac = 'BB:00:00:00:00:01'; set role anon;
do $$ begin
  assert (public.list_playlists('BB:00:00:00:00:01', 'KEYBB1')->>'ok') = 'false', 'Webseite gesperrt';
  assert (public.app_list_playlists('BB:00:00:00:00:01', '0123456789abcdef0123456789abcdef')->>'ok') = 'true', 'App trotz Sperre';
end $$;

-- 4. Bestehendes Gerät (alte App) bekommt den Token nur mit richtigem KEY; fremder Token danach abgelehnt
do $$ declare t text := 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; begin
  assert (public.register_device('CC:00:00:00:00:01', 'KEYCC1')->>'ok') = 'true', 'altes Gerät';
  assert (public.app_register('CC:00:00:00:00:01', 'FALSCH', t)->>'ok') = 'false', 'ohne richtigen KEY kein Token';
  assert (public.app_register('CC:00:00:00:00:01', 'KEYCC1', t)->>'ok') = 'true', 'Token mit richtigem KEY';
  assert (public.app_register('CC:00:00:00:00:01', 'KEYCC1', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')->>'ok') = 'false', 'fremder Token';
  -- 5. KEY erneuern
  assert (public.app_rotate_key('CC:00:00:00:00:01', t, 'NEUKEY')->>'ok') = 'true', 'app_rotate_key';
  assert (public.list_playlists('CC:00:00:00:00:01', 'KEYCC1')->>'ok') = 'false', 'alter KEY ungültig';
  assert (public.list_playlists('CC:00:00:00:00:01', 'NEUKEY')->>'ok') = 'true', 'neuer KEY gültig';
  -- 6. Gerät löschen
  assert (public.add_playlist('CC:00:00:00:00:01', 'NEUKEY', 'X', 'm3u', 'http://x/b.m3u')->>'ok') = 'true', 'Playlist vor dem Löschen';
  assert (public.app_delete_device('CC:00:00:00:00:01', t)->>'ok') = 'true', 'app_delete_device';
end $$;

-- 7. Interne Funktionen sind von außen nicht aufrufbar
do $$ begin
  begin perform public.lumio_purge(); raise exception 'lumio_purge darf nicht aufrufbar sein';
  exception when insufficient_privilege then null; end;
  begin perform public.lumio_check('AA:00:00:00:00:01', 'x'); raise exception 'lumio_check darf nicht aufrufbar sein';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
do $$ begin
  assert (select count(*) from public.playlists where mac = 'CC:00:00:00:00:01') = 0, 'Playlists des gelöschten Geräts';
end $$;

-- 8. Aufräumen: alte erledigte Nachrichten und lange inaktive Geräte weg, offene und neue bleiben
insert into public.devices(mac, key_hash, last_seen) values ('DD:00:00:00:00:01', 'x', now() - interval '13 months');
insert into public.support_messages(mac, topic, message, done, created_at) values
  ('AA:00:00:00:00:01', 'T', 'alte erledigte', true, now() - interval '40 days'),
  ('AA:00:00:00:00:01', 'T', 'alte offene', false, now() - interval '40 days'),
  ('AA:00:00:00:00:01', 'T', 'neue erledigte', true, now());
select public.lumio_purge();
do $$ begin
  assert (select string_agg(message, ', ' order by message) from public.support_messages where mac = 'AA:00:00:00:00:01') = 'alte offene, neue erledigte', 'Support aufgeräumt';
  assert (select count(*) from public.devices where mac = 'DD:00:00:00:00:01') = 0, 'inaktives Gerät gelöscht';
end $$;

\echo 'Alle Datenbank-Prüfungen bestanden.'
