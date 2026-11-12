-- Prüft server/verschluesselung-2026-11.sql: Passwörter und Links liegen verschlüsselt in der Tabelle,
-- App und Kundenportal bekommen sie unverändert im Klartext, Fremde kommen nicht an Schlüssel oder Helfer.
\set ON_ERROR_STOP 1

-- Bestandsdaten von vor dem Skript wurden beim Einspielen umgestellt (kein Klartext mehr in der Tabelle)
do $$ begin
  assert not exists (select 1 from public.playlists where password is not null and password not like 'enc1:%'), 'alte Passwörter verschlüsselt';
  assert not exists (select 1 from public.playlists where url is not null and url not like 'enc1:%'), 'alte Links verschlüsselt';
end $$;

set role anon;
do $$ declare t text := 'abcdefabcdefabcdefabcdefabcdef03'; r json; id1 uuid; id2 uuid; begin
  assert (public.app_register('EE:00:00:00:00:01', 'KEYEE1', t)->>'ok') = 'true', 'app_register';
  id1 := (public.app_add_playlist('EE:00:00:00:00:01', t, 'M3U', 'm3u', 'http://u:geheim@x.example/get.php?username=u&password=geheim')->>'id')::uuid;
  id2 := (public.add_playlist('EE:00:00:00:00:01', 'KEYEE1', 'Xtream', 'xtream', null, 'http://srv.example:8080', 'nutzer', 'Pa§wort-ÄÖÜ!')->>'id')::uuid;
  assert id1 is not null and id2 is not null, 'anlegen';

  -- App (Token) bekommt Klartext
  r := public.app_list_playlists('EE:00:00:00:00:01', t);
  assert (r->'items'->0->>'url') = 'http://u:geheim@x.example/get.php?username=u&password=geheim', 'App: Link im Klartext';
  assert (r->'items'->1->>'password') = 'Pa§wort-ÄÖÜ!', 'App: Passwort im Klartext (mit Umlauten)';
  assert (r->'items'->1->>'username') = 'nutzer', 'App: Benutzername';

  -- Kundenportal (MAC + KEY) bekommt Klartext
  r := public.list_playlists('EE:00:00:00:00:01', 'KEYEE1');
  assert (r->'items'->1->>'password') = 'Pa§wort-ÄÖÜ!', 'Portal: Passwort';

  -- Ändern über das Portal: neues Passwort kommt wieder richtig zurück
  assert (public.update_playlist('EE:00:00:00:00:01', 'KEYEE1', id2, 'Xtream 2', 'xtream', null, 'http://srv.example:8080', 'nutzer', 'neu-123')->>'ok') = 'true', 'ändern';
  r := public.list_playlists('EE:00:00:00:00:01', 'KEYEE1');
  assert (r->'items'->1->>'password') = 'neu-123', 'Portal: geändertes Passwort';

  -- Wiederherstellen liefert Klartext
  r := public.restore_backup('EE:00:00:00:00:01', 'KEYEE1');
  assert (r->'playlists'->0->>'url') like 'http://u:geheim@%', 'Wiederherstellen: Link';
  assert (r->'playlists'->1->>'password') = 'neu-123', 'Wiederherstellen: Passwort';

  -- Prüfungen wie bisher: ungültiger Link, zu langes Passwort
  assert (public.app_add_playlist('EE:00:00:00:00:01', t, 'Kaputt', 'm3u', 'ftp://x')->>'ok') = 'false', 'ungültiger Link abgelehnt';

  -- Fremde kommen nicht an Helfer oder Schlüssel
  begin perform public.lumio_pw_dec('enc1:abc'); assert false, 'anon darf nicht entschlüsseln'; exception when insufficient_privilege then null; end;
  begin perform public.lumio_pw_key(); assert false, 'anon darf den Schlüssel nicht holen'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.lumio_keys; assert false, 'anon darf lumio_keys nicht lesen'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- In der Tabelle selbst steht kein Klartext
do $$ declare pw text; u text; begin
  select password into pw from public.playlists where mac = 'EE:00:00:00:00:01' and type = 'xtream';
  select url into u from public.playlists where mac = 'EE:00:00:00:00:01' and type = 'm3u';
  assert pw like 'enc1:%' and pw not like '%neu-123%', 'Passwort verschlüsselt gespeichert';
  assert u like 'enc1:%' and u not like '%geheim%', 'Link verschlüsselt gespeichert';
  assert public.lumio_pw_dec(pw) = 'neu-123', 'entschlüsselt wieder';
  -- Zweimal verschlüsseln schadet nicht; Umbenennen ohne neuen Link scheitert nicht an der Adress-Prüfung
  assert public.lumio_pw_enc(pw) = pw, 'nicht doppelt verschlüsselt';
  update public.playlists set name = 'Umbenannt' where mac = 'EE:00:00:00:00:01' and type = 'm3u';
  assert public.lumio_pw_dec((select url from public.playlists where mac = 'EE:00:00:00:00:01' and type = 'm3u')) like 'http://u:geheim@%', 'nach Umbenennen unverändert';
  -- Zu langes Passwort wird wie früher abgelehnt
  begin
    update public.playlists set password = repeat('x', 201) where mac = 'EE:00:00:00:00:01' and type = 'xtream';
    assert false, 'zu langes Passwort';
  exception when raise_exception then null; end;
end $$;
\echo 'verschluesselung: alle Prüfungen bestanden'
