-- Telvo Player – Schutz vor Massen-Anmeldungen und Spam (November 2026)
-- Einmal im Supabase SQL-Editor ausführen (nach supabase.sql, admin.sql, sicherheit-, sicherung- und bewertung-2026-11.sql).
-- Kann gefahrlos wiederholt werden und ändert keine vorhandenen Daten.
--
-- Hintergrund (QA November 2026): Alle bisherigen Grenzen galten je Gerät (MAC). Wer sich laufend neue MACs ausdenkt,
-- konnte unbegrenzt Geräte anlegen, das Support-Postfach fluten, Bewertungen fälschen und mit Sicherungen den
-- Speicher der Datenbank füllen (bei Supabase Free ist sie dann nur noch lesbar – die App ginge für alle nicht mehr).
--
-- Was diese Datei macht (über Trigger – die bestehenden Funktionen bleiben unverändert):
-- 1. Neue Geräte:          höchstens 10 je Internet-Anschluss (IP) und Stunde, insgesamt 2000 je Stunde.
-- 2. Support-Nachrichten:  höchstens 10 je IP und Stunde, insgesamt 300 je Stunde (zusätzlich zu 5 je Gerät und Tag).
-- 3. Bewertungen:          höchstens 20 neue oder geänderte je IP und Stunde.
-- 4. Sicherungen:          alle zusammen höchstens 300 MB.
-- 5. Playlists:            Adressen nur mit http:// oder https:// (vorher z. B. „javascript:…“ möglich).
-- 6. Zählfolge des Protokolls: keine Rechte mehr für anon/authenticated (Supabase-Standard gab sie frei).
-- Die IP kommt aus den Anfrage-Kopfzeilen, die Supabase mitgibt. Ohne IP (z. B. SQL-Editor) gelten nur die Gesamtgrenzen.

create table if not exists public.lumio_rate (
  kind text not null,
  ip text not null,
  at timestamptz not null default now()
);
create index if not exists lumio_rate_idx on public.lumio_rate(kind, ip, at);
alter table public.lumio_rate enable row level security;
revoke all on public.lumio_rate from public, anon, authenticated;

-- IP der aktuellen Anfrage (erste Adresse aus X-Forwarded-For bzw. CF-Connecting-IP), sonst null
create or replace function public.lumio_client_ip()
returns text language plpgsql stable security definer set search_path = public as $$
declare h json; v text;
begin
  begin h := nullif(current_setting('request.headers', true), '')::json; exception when others then h := null; end;
  if h is null then return null; end if;
  v := coalesce(h->>'cf-connecting-ip', split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1), h->>'x-real-ip');
  v := nullif(trim(v), '');
  return left(v, 64);
end $$;

-- Zählt und prüft: zu viel → Fehler (bricht die Anfrage ab, nichts wird gespeichert)
create or replace function public.lumio_rate_hit(p_kind text, p_per_ip int, p_msg text)
returns void language plpgsql security definer set search_path = public as $$
declare v_ip text := public.lumio_client_ip();
begin
  if v_ip is null then return; end if;
  delete from public.lumio_rate where kind = p_kind and ip = v_ip and at < now() - interval '1 hour';
  if (select count(*) from public.lumio_rate where kind = p_kind and ip = v_ip and at > now() - interval '1 hour') >= p_per_ip then
    raise exception '%', p_msg using errcode = 'P0001';
  end if;
  insert into public.lumio_rate(kind, ip) values (p_kind, v_ip);
end $$;

-- 1. Neue Geräte
create or replace function public.lumio_guard_device()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Die App meldet sich bei jedem Start mit „insert … on conflict do nothing“ an – der Trigger läuft dann auch für
  -- bekannte Geräte. Nur wirklich neue zählen, sonst wären Haushalte/Mobilfunk mit einer gemeinsamen IP schnell gesperrt.
  if exists (select 1 from public.devices where mac = new.mac) then return new; end if;
  if (select count(*) from public.devices where created_at > now() - interval '1 hour') >= 2000 then
    raise exception 'Gerade melden sich sehr viele neue Geräte an. Bitte später erneut versuchen.' using errcode = 'P0001';
  end if;
  perform public.lumio_rate_hit('device', 10, 'Zu viele neue Geräte von dieser Internetverbindung. Bitte in einer Stunde erneut versuchen.');
  return new;
end $$;
drop trigger if exists lumio_guard_device on public.devices;
create trigger lumio_guard_device before insert on public.devices for each row execute function public.lumio_guard_device();

-- 2. Support-Nachrichten
create or replace function public.lumio_guard_support()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.support_messages where created_at > now() - interval '1 hour') >= 300 then
    raise exception 'Der Support ist gerade stark ausgelastet. Bitte später erneut versuchen.' using errcode = 'P0001';
  end if;
  perform public.lumio_rate_hit('support', 10, 'Zu viele Nachrichten von dieser Internetverbindung. Bitte in einer Stunde erneut versuchen.');
  return new;
end $$;
drop trigger if exists lumio_guard_support on public.support_messages;
create trigger lumio_guard_support before insert on public.support_messages for each row execute function public.lumio_guard_support();

-- 3. Bewertungen (nur wenn die Tabelle aus bewertung-2026-11.sql schon da ist)
create or replace function public.lumio_guard_rating()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.lumio_rate_hit('rating', 20, 'Zu viele Bewertungen von dieser Internetverbindung. Bitte später erneut versuchen.');
  return new;
end $$;
do $$ begin
  if to_regclass('public.device_ratings') is not null then
    execute 'drop trigger if exists lumio_guard_rating on public.device_ratings';
    -- nur „before insert“: set_rating nutzt „insert … on conflict do update“ – das löst den Insert-Trigger immer aus (einmal zählen)
    execute 'create trigger lumio_guard_rating before insert on public.device_ratings for each row execute function public.lumio_guard_rating()';
  end if;
end $$;

-- 4. Sicherungen: Gesamtspeicher begrenzen
create or replace function public.lumio_guard_backup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select coalesce(sum(bytes), 0) from public.backups where mac <> new.mac) + coalesce(new.bytes, 0) > 300 * 1024 * 1024 then
    raise exception 'Der Speicher für Sicherungen ist gerade voll. Bitte später erneut versuchen.' using errcode = 'P0001';
  end if;
  return new;
end $$;
do $$ begin
  if to_regclass('public.backups') is not null then
    execute 'drop trigger if exists lumio_guard_backup on public.backups';
    execute 'create trigger lumio_guard_backup before insert or update on public.backups for each row execute function public.lumio_guard_backup()';
  end if;
end $$;

-- 5. Playlists: nur http(s)-Adressen
create or replace function public.lumio_guard_playlist()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'xtream' and (new.server is null or new.server !~* '^https?://[^\s]+$') then
    raise exception 'Bitte eine gültige Server-Adresse (http:// oder https://) eingeben.' using errcode = 'P0001';
  end if;
  if new.type = 'm3u' and (new.url is null or new.url !~* '^https?://[^\s]+$') then
    raise exception 'Bitte einen gültigen Link (http:// oder https://) eingeben.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists lumio_guard_playlist on public.playlists;
create trigger lumio_guard_playlist before insert or update on public.playlists for each row execute function public.lumio_guard_playlist();

-- Helfer sind nur für die Trigger da – niemand darf sie direkt aufrufen
revoke all on function public.lumio_client_ip() from public, anon, authenticated;
revoke all on function public.lumio_rate_hit(text, int, text) from public, anon, authenticated;
revoke all on function public.lumio_guard_device() from public, anon, authenticated;
revoke all on function public.lumio_guard_support() from public, anon, authenticated;
revoke all on function public.lumio_guard_rating() from public, anon, authenticated;
revoke all on function public.lumio_guard_backup() from public, anon, authenticated;
revoke all on function public.lumio_guard_playlist() from public, anon, authenticated;

-- 6. Zählfolge des Admin-Protokolls (Supabase gibt Folgen standardmäßig an anon/authenticated frei)
do $$ begin
  if to_regclass('public.admin_log_id_seq') is not null then
    execute 'revoke all on sequence public.admin_log_id_seq from anon, authenticated';
  end if;
end $$;

-- 7. Support mit App-Token: Wer nur die MAC eines Geräts kennt, kann mit 20 falschen KEYs dessen KEY-Zugang für eine
--    Stunde sperren. „Problem melden“ und „Feedback“ in der App gingen dann auch nicht mehr. Mit dem langen App-Token
--    (sicherheit-2026-11.sql) bleibt der Weg offen. Gleiche Regeln wie send_support.
create or replace function public.app_send_support(p_mac text, p_token text, p_topic text, p_message text, p_contact text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.lumio_app_ok(p_mac, p_token) then return public.lumio_error('wrong'); end if;
  if char_length(trim(coalesce(p_message, ''))) < 5 then
    return public.lumio_error('Bitte beschreibe dein Anliegen etwas genauer.');
  end if;
  if (select count(*) from public.support_messages where mac = upper(p_mac) and created_at > now() - interval '1 day') >= 5 then
    return public.lumio_error('Maximal 5 Nachrichten pro Tag.');
  end if;
  insert into public.support_messages(mac, topic, message, contact)
  values (upper(p_mac), left(coalesce(nullif(trim(p_topic), ''), 'Sonstiges'), 60), left(trim(p_message), 2000),
          nullif(left(trim(coalesce(p_contact, '')), 200), ''));
  return json_build_object('ok', true);
end $$;
revoke all on function public.app_send_support(text, text, text, text, text) from public;
grant execute on function public.app_send_support(text, text, text, text, text) to anon;
