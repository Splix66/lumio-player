-- Prüft server/sicherung-2026-11.sql gegen eine echte PostgreSQL-Datenbank (nach sicherheit.test.sql).
\set ON_ERROR_STOP 1
set role anon;

do $$ declare t text := 'abcdefabcdefabcdefabcdefabcdef01'; r json; begin
  -- Gerät mit Token anlegen, eine Playlist auf der „Webseite“ verwalten
  assert (public.app_register('CC:00:00:00:00:01', 'KEYCC1', t)->>'ok') = 'true', 'app_register';
  assert (public.app_add_playlist('CC:00:00:00:00:01', t, 'Web', 'm3u', 'http://x/c.m3u')->>'ok') = 'true', 'Playlist';

  -- noch keine Sicherung
  assert (public.app_backup_info('CC:00:00:00:00:01', t)->>'at') is null, 'ohne Sicherung kein Zeitpunkt';

  -- speichern (mit Token), falscher Token abgelehnt
  assert (public.app_save_backup('CC:00:00:00:00:01', t, '{"v":1,"lists":[{"fp":"abc","fav":{"live":[]}}]}'::jsonb)->>'ok') = 'true', 'speichern';
  assert (public.app_save_backup('CC:00:00:00:00:01', 'ffffffffffffffffffffffffffffffff', '{"v":1}'::jsonb)->>'ok') = 'false', 'falscher Token';
  assert (public.app_backup_info('CC:00:00:00:00:01', t)->>'at') is not null, 'Zeitpunkt nach dem Speichern';

  -- zu groß und kein Objekt → abgelehnt, alte Sicherung bleibt
  assert (public.app_save_backup('CC:00:00:00:00:01', t, jsonb_build_object('x', repeat('a', 600000)))->>'error') = 'Die Sicherung ist zu groß.', 'Größengrenze';
  assert (public.app_save_backup('CC:00:00:00:00:01', t, '[1,2]'::jsonb)->>'ok') = 'false', 'nur Objekte';

  -- wiederherstellen mit MAC + KEY: Sicherung und Webseiten-Playlists
  r := public.restore_backup('CC:00:00:00:00:01', 'KEYCC1');
  assert (r->>'ok') = 'true', 'restore ok';
  assert (r->'backup'->>'v') = '1', 'Sicherung zurück';
  assert json_array_length(r->'playlists') = 1, 'Playlists dabei';
  assert (public.restore_backup('CC:00:00:00:00:01', 'FALSCH')->>'error') like 'MAC-Adresse oder%', 'falscher KEY';
  assert (public.restore_backup('CC:00:00:00:00:99', 'KEYCC1')->>'error') like 'Gerät nicht gefunden%', 'unbekanntes Gerät';

  -- Gerät ohne Sicherung: ok, aber leer
  assert (public.register_device('CC:00:00:00:00:02', 'KEYCC2')->>'ok') = 'true', 'zweites Gerät';
  r := public.restore_backup('CC:00:00:00:00:02', 'KEYCC2');
  assert (r->>'ok') = 'true' and (r->>'backup') is null, 'ohne Sicherung leer';

  -- löschen
  assert (public.app_delete_backup('CC:00:00:00:00:01', t)->>'ok') = 'true', 'löschen';
  assert (public.app_backup_info('CC:00:00:00:00:01', t)->>'at') is null, 'gelöscht';

  -- Gerät löschen nimmt die Sicherung mit
  assert (public.app_save_backup('CC:00:00:00:00:01', t, '{"v":1}'::jsonb)->>'ok') = 'true', 'erneut speichern';
  assert (public.app_delete_device('CC:00:00:00:00:01', t)->>'ok') = 'true', 'Gerät löschen';
end $$;

-- Tabelle ist für anonyme Besucher gesperrt
do $$ begin
  begin
    perform count(*) from public.backups;
    assert false, 'anon darf backups nicht lesen';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
do $$ begin
  assert (select count(*) from public.backups where mac = 'CC:00:00:00:00:01') = 0, 'Sicherung mit Gerät gelöscht';
end $$;
\echo 'Sicherung: alle Prüfungen bestanden'
