-- Prüft server/grenzen-2026-11.sql: höchstens 10 Playlists pro Gerät (App und Kundenportal), Sicherung bis 1 MB.
\set ON_ERROR_STOP 1
set role anon;

do $$ declare t text := 'abcdefabcdefabcdefabcdefabcdef02'; i int; begin
  assert (public.app_register('DD:00:00:00:00:01', 'KEYDD1', t)->>'ok') = 'true', 'app_register';
  for i in 1..9 loop
    assert (public.app_add_playlist('DD:00:00:00:00:01', t, 'App ' || i, 'm3u', 'http://x/' || i || '.m3u')->>'ok') = 'true', 'Playlist ' || i;
  end loop;
  -- die 10. über das Kundenportal (MAC + KEY) geht noch
  assert (public.add_playlist('DD:00:00:00:00:01', 'KEYDD1', 'Web 10', 'm3u', 'http://x/10.m3u')->>'ok') = 'true', 'Playlist 10 (Portal)';
  -- die 11. wird überall abgelehnt
  assert (public.app_add_playlist('DD:00:00:00:00:01', t, 'App 11', 'm3u', 'http://x/11.m3u')->>'error') = 'Maximal 10 Playlists pro Gerät.', 'App: 11. abgelehnt';
  assert (public.add_playlist('DD:00:00:00:00:01', 'KEYDD1', 'Web 11', 'm3u', 'http://x/11.m3u')->>'error') = 'Maximal 10 Playlists pro Gerät.', 'Portal: 11. abgelehnt';

  -- Sicherung: 600 KB jetzt erlaubt, über 1 MB abgelehnt
  assert (public.app_save_backup('DD:00:00:00:00:01', t, jsonb_build_object('x', repeat('a', 600000)))->>'ok') = 'true', '600 KB erlaubt';
  assert (public.app_save_backup('DD:00:00:00:00:01', t, jsonb_build_object('x', repeat('a', 1100000)))->>'error') = 'Die Sicherung ist zu groß.', 'über 1 MB abgelehnt';
  -- Rechte unverändert: anon darf die Tabellen nicht direkt lesen
  begin perform 1 from public.playlists; assert false, 'anon darf playlists nicht lesen'; exception when insufficient_privilege then null; end;
end $$;
reset role;
\echo 'grenzen: alle Prüfungen bestanden'
