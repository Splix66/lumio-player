-- Prüft server/bewertung-2026-11.sql gegen eine echte PostgreSQL-Datenbank (nach sicherheit.test.sql).
\set ON_ERROR_STOP 1
set role anon;

do $$ declare t text := 'abcdefabcdefabcdefabcdefabcdef02'; r json; i int; begin
  assert (public.app_register('DD:00:00:00:00:01', 'KEYDD1', t)->>'ok') = 'true', 'app_register';

  -- erste Bewertung, dann ersetzen (nicht doppelt)
  assert (public.app_set_rating('DD:00:00:00:00:01', t, 4)->>'ok') = 'true', 'erste Bewertung';
  r := public.app_set_rating('DD:00:00:00:00:01', t, 5);
  assert (r->>'ok') = 'true' and (r->>'previous') = '4', 'ersetzt, alte Sterne zurück';
  assert (public.app_get_rating('DD:00:00:00:00:01', t)->>'stars') = '5', 'app_get_rating liest (darf nicht „stable“ sein)';
  assert (public.get_rating('DD:00:00:00:00:01', 'KEYDD1')->>'stars') = '5', 'get_rating mit KEY';

  -- ungültig und falscher Token
  assert (public.app_set_rating('DD:00:00:00:00:01', t, 6)->>'ok') = 'false', 'nur 1–5 Sterne';
  assert (public.app_set_rating('DD:00:00:00:00:01', 'ffffffffffffffffffffffffffffffff', 3)->>'ok') = 'false', 'falscher Token';

  -- höchstens 10 Änderungen in 24 Stunden (1 schon oben)
  for i in 1..9 loop
    assert (public.app_set_rating('DD:00:00:00:00:01', t, 1 + i % 5)->>'ok') = 'true', 'Änderung ' || i;
  end loop;
  assert (public.app_set_rating('DD:00:00:00:00:01', t, 3)->>'error') = 'Maximal 10 Änderungen pro Tag.', 'elfte Änderung gesperrt';
end $$;

-- einen Tag später: Zähler beginnt neu (Zeit zurückdrehen geht nur als Besitzer der Tabelle)
reset role;
update public.device_ratings set day_start = now() - interval '25 hours' where mac = 'DD:00:00:00:00:01';
set role anon;

do $$ declare t text := 'abcdefabcdefabcdefabcdefabcdef02'; begin
  assert (public.app_set_rating('DD:00:00:00:00:01', t, 2)->>'ok') = 'true', 'nach einem Tag wieder möglich';
  assert (public.app_get_rating('DD:00:00:00:00:01', t)->>'stars') = '2', 'neue Sterne gespeichert';
end $$;

reset role;
\echo 'Bewertung: alle Prüfungen bestanden'
