-- Prüft server/schutz-2026-11.sql: Grenzen je IP und insgesamt, nur http(s)-Adressen, bekannte Geräte nicht gezählt.
\set ON_ERROR_STOP 1
set role anon;

-- IP 1.2.3.4 für diese Sitzung (so gibt PostgREST/Supabase die Kopfzeilen weiter)
select set_config('request.headers', '{"x-forwarded-for":"1.2.3.4, 10.0.0.1"}', false);

do $$ declare i int; r json; begin
  -- 10 neue Geräte von einer IP gehen, das 11. nicht
  for i in 1..10 loop
    assert (public.register_device('EE:00:00:00:00:' || lpad(i::text, 2, '0'), 'KEYEE1')->>'ok') = 'true', 'Gerät ' || i;
  end loop;
  begin
    perform public.register_device('EE:00:00:00:00:11', 'KEYEE1');
    assert false, '11. neues Gerät hätte abgelehnt werden müssen';
  exception when raise_exception then null;   -- erwartet: P0001
  end;
  -- bekannte Geräte melden sich bei jedem App-Start erneut an: das darf nicht zählen und nicht scheitern
  for i in 1..30 loop
    assert (public.register_device('EE:00:00:00:00:01', 'KEYEE1')->>'ok') = 'true', 'erneute Anmeldung ' || i;
  end loop;
end $$;

-- andere IP: wieder frei
select set_config('request.headers', '{"x-forwarded-for":"5.6.7.8"}', false);
do $$ begin
  assert (public.register_device('EE:00:00:00:00:12', 'KEYEE2')->>'ok') = 'true', 'andere IP darf';
  -- nur http(s)-Adressen
  begin
    perform public.add_playlist('EE:00:00:00:00:12', 'KEYEE2', 'X', 'xtream', null, 'javascript:alert(1)//', 'u', 'p');
    assert false, 'javascript:-Server hätte abgelehnt werden müssen';
  exception when raise_exception then null;
  end;
  assert (public.add_playlist('EE:00:00:00:00:12', 'KEYEE2', 'Gut', 'm3u', 'http://x.de/a.m3u', null, null, null)->>'ok') = 'true', 'normale M3U geht';
  -- Support: 5 je Gerät und Tag (bestehende Regel) bleibt
  assert (public.send_support('EE:00:00:00:00:12', 'KEYEE2', 'Frage', 'Hallo, eine Frage zur App')->>'ok') = 'true', 'Support geht';
end $$;

-- ohne IP (SQL-Editor, Cron): nur Gesamtgrenzen, kein Fehler
select set_config('request.headers', '', false);
do $$ begin
  assert (public.register_device('EE:00:00:00:00:13', 'KEYEE3')->>'ok') = 'true', 'ohne IP';
end $$;

reset role;
-- niemand darf die Helfer direkt aufrufen
do $$ begin
  assert not has_function_privilege('anon', 'public.lumio_rate_hit(text, int, text)', 'execute'), 'anon darf lumio_rate_hit nicht';
  assert not has_function_privilege('anon', 'public.lumio_client_ip()', 'execute'), 'anon darf lumio_client_ip nicht';
  assert not has_table_privilege('anon', 'public.lumio_rate', 'select'), 'anon darf lumio_rate nicht lesen';
end $$;
\echo 'Schutz: alle Prüfungen bestanden'

-- Support mit Token geht auch, wenn der KEY-Zugang durch Fehlversuche gesperrt ist
set role anon;
select set_config('request.headers', '{"x-forwarded-for":"9.9.9.9"}', false);
do $$ declare t text := 'abcdefabcdefabcdefabcdefabcdef09'; i int; begin
  assert (public.app_register('EE:00:00:00:00:20', 'KEYEE9', t)->>'ok') = 'true', 'app_register';
  for i in 1..21 loop perform public.list_playlists('EE:00:00:00:00:20', 'FALSCH'); end loop;
  assert (public.send_support('EE:00:00:00:00:20', 'KEYEE9', 'Frage', 'Nachricht mit KEY')->>'ok') = 'false', 'KEY-Weg ist gesperrt';
  assert (public.app_send_support('EE:00:00:00:00:20', t, 'Frage', 'Nachricht mit Token')->>'ok') = 'true', 'Token-Weg geht trotzdem';
  assert (public.app_send_support('EE:00:00:00:00:20', 'ffffffffffffffffffffffffffffffff', 'Frage', 'falscher Token')->>'ok') = 'false', 'falscher Token abgelehnt';
end $$;
reset role;
\echo 'Schutz (Support mit Token): bestanden'
