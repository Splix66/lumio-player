-- Telvo Player – Playlist-Zugangsdaten verschlüsselt speichern (Nov. 2026)
--
-- Was: Passwort (Xtream) und Link (M3U, enthält oft Benutzer und Passwort) liegen in public.playlists nicht mehr
--      im Klartext, sondern verschlüsselt („enc1:…“, pgcrypto, symmetrisch). Den Schlüssel verwahrt Supabase Vault –
--      er steckt nicht in Datenbank-Kopien. Nur die bestehenden Funktionen entschlüsseln beim Ausliefern an das
--      eigene Gerät bzw. das Kundenportal (MAC + KEY oder Geräte-Token). Für App und Webseite ändert sich nichts.
-- Wie: Ein Trigger verschlüsselt bei jedem Speichern (läuft nach lumio_guard_playlist, der den Klartext prüft).
--      Bestehende Zeilen werden am Ende einmal umgestellt.
-- Wiederholbar. Einspielen: Supabase → SQL Editor → Inhalt einfügen → Run (nach server/grenzen-2026-11.sql).
-- Zurück: Funktionen aus den älteren Skripten erneut einspielen und vorher
--      update public.playlists set password = public.lumio_pw_dec(password), url = public.lumio_pw_dec(url);
--      drop trigger lumio_seal_playlist on public.playlists;

-- ---------- Schlüssel ----------
-- Ersatzablage nur für Datenbanken ohne Vault (z. B. die Test-Datenbank in GitHub Actions). Niemand darf sie lesen.
create table if not exists public.lumio_keys (name text primary key, k text not null);
alter table public.lumio_keys enable row level security;
revoke all on public.lumio_keys from public, anon, authenticated;

do $$
begin
  if to_regclass('vault.decrypted_secrets') is not null then
    if not exists (select 1 from vault.secrets where name = 'telvo_playlist_key') then
      perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'telvo_playlist_key',
                                  'Telvo: Schlüssel für Playlist-Passwörter und -Links (verschluesselung-2026-11.sql)');
    end if;
  else
    insert into public.lumio_keys(name, k) values ('telvo_playlist_key', encode(extensions.gen_random_bytes(32), 'hex'))
    on conflict (name) do nothing;
  end if;
end $$;

create or replace function public.lumio_pw_key()
returns text language plpgsql stable security definer set search_path = public, extensions as $$
declare k text;
begin
  if to_regclass('vault.decrypted_secrets') is not null then
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into k using 'telvo_playlist_key';
  else
    select lk.k into k from public.lumio_keys lk where lk.name = 'telvo_playlist_key';
  end if;
  if k is null or length(k) < 32 then
    raise exception 'Schlüssel für Playlist-Daten fehlt.' using errcode = 'P0001';   -- nie still im Klartext speichern
  end if;
  return k;
end $$;

-- ---------- Verschlüsseln / Entschlüsseln ----------
create or replace function public.lumio_pw_enc(p text)
returns text language plpgsql volatile security definer set search_path = public, extensions as $$
begin
  if p is null or p like 'enc1:%' then return p; end if;
  return 'enc1:' || translate(encode(extensions.pgp_sym_encrypt(p, public.lumio_pw_key(), 'cipher-algo=aes256'), 'base64'), E'\n', '');
end $$;

create or replace function public.lumio_pw_dec(p text)
returns text language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if p is null or p not like 'enc1:%' then return p; end if;
  return extensions.pgp_sym_decrypt(decode(substr(p, 6), 'base64'), public.lumio_pw_key());
exception when others then
  return p;   -- z. B. ein echtes Passwort, das zufällig mit „enc1:“ beginnt
end $$;

-- ---------- Beim Speichern verschlüsseln ----------
create or replace function public.lumio_seal_playlist()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  -- Längen wie bisher (die Spalten-Grenzen gelten jetzt für den verschlüsselten Text)
  if new.password is not null and new.password not like 'enc1:%' and char_length(new.password) > 200 then
    raise exception 'Das Passwort ist zu lang.' using errcode = 'P0001';
  end if;
  if new.url is not null and new.url not like 'enc1:%' and char_length(new.url) > 2000 then
    raise exception 'Der Link ist zu lang.' using errcode = 'P0001';
  end if;
  new.password := public.lumio_pw_enc(new.password);
  new.url := public.lumio_pw_enc(new.url);
  return new;
end $$;
drop trigger if exists lumio_seal_playlist on public.playlists;
-- Name mit „s“: läuft nach lumio_guard_playlist (Trigger laufen alphabetisch)
create trigger lumio_seal_playlist before insert or update on public.playlists
  for each row execute function public.lumio_seal_playlist();

-- Spalten-Grenzen für den verschlüsselten Text vergrößern
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.playlists'::regclass and contype = 'c'
             and (pg_get_constraintdef(oid) ilike '%char_length(password)%' or pg_get_constraintdef(oid) ilike '%char_length(url)%')
  loop
    execute format('alter table public.playlists drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.playlists add constraint playlists_password_len check (password is null or char_length(password) <= 1000);
alter table public.playlists add constraint playlists_url_len check (url is null or char_length(url) <= 6000);

-- Adress-Prüfung: verschlüsselte, unveränderte Links nicht erneut prüfen
create or replace function public.lumio_guard_playlist()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'xtream' and (new.server is null or new.server !~* '^https?://[^\s]+$') then
    raise exception 'Bitte eine gültige Server-Adresse (http:// oder https://) eingeben.' using errcode = 'P0001';
  end if;
  if new.type = 'm3u' and coalesce(new.url, '') not like 'enc1:%' and (new.url is null or new.url !~* '^https?://[^\s]+$') then
    raise exception 'Bitte einen gültigen Link (http:// oder https://) eingeben.' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ---------- Beim Ausliefern entschlüsseln ----------
create or replace function public.list_playlists(p_mac text, p_key text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare st text;
begin
  st := public.lumio_check(p_mac, p_key);
  if st <> 'ok' then return public.lumio_error(st); end if;
  return json_build_object('ok', true, 'items', coalesce((
    select json_agg(json_build_object('id', p.id, 'name', p.name, 'type', p.type, 'url', public.lumio_pw_dec(p.url),
      'server', p.server, 'username', p.username, 'password', public.lumio_pw_dec(p.password), 'created_at', p.created_at) order by p.created_at)
    from public.playlists p where p.mac = upper(p_mac)), '[]'::json));
end $$;

create or replace function public.app_list_playlists(p_mac text, p_token text)
returns json language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.lumio_app_ok(p_mac, p_token) then return public.lumio_error('wrong'); end if;
  return json_build_object('ok', true, 'items', coalesce((
    select json_agg(json_build_object('id', p.id, 'name', p.name, 'type', p.type, 'url', public.lumio_pw_dec(p.url),
      'server', p.server, 'username', p.username, 'password', public.lumio_pw_dec(p.password), 'created_at', p.created_at) order by p.created_at)
    from public.playlists p where p.mac = upper(p_mac)), '[]'::json));
end $$;

do $$ begin
  if to_regclass('public.backups') is not null then
    execute $f$
create or replace function public.restore_backup(p_mac text, p_key text)
returns json language plpgsql security definer set search_path = public, extensions as $b$
declare st text; b public.backups;
begin
  st := public.lumio_check(p_mac, p_key);           -- zählt Fehlversuche, sperrt nach 20 pro Stunde
  if st <> 'ok' then return public.lumio_error(st); end if;
  select * into b from public.backups where mac = upper(p_mac);
  return json_build_object('ok', true,
    'backup', b.data,
    'at', b.updated_at,
    'playlists', coalesce((
      select json_agg(json_build_object('name', p.name, 'type', p.type, 'url', public.lumio_pw_dec(p.url), 'server', p.server,
        'username', p.username, 'password', public.lumio_pw_dec(p.password)) order by p.created_at)
      from public.playlists p where p.mac = upper(p_mac)), '[]'::json));
end $b$;
$f$;
  end if;
end $$;

-- Verwaltungsseite: zeigt weiter nur den Server-Namen, nie Zugangsdaten
do $$ begin
  if to_regprocedure('public.admin_device(text)') is not null then
    execute $f$
create or replace function public.admin_device(p_mac text)
returns json language plpgsql stable security definer set search_path = public as $b$
declare d public.devices;
begin
  if not public.lumio_is_admin() then return public.lumio_denied(); end if;
  select * into d from public.devices where mac = upper(coalesce(p_mac, ''));
  if not found then return json_build_object('ok', false, 'error', 'Gerät nicht gefunden.'); end if;
  return json_build_object('ok', true,
    'device', json_build_object('mac', d.mac, 'created_at', d.created_at, 'last_seen', d.last_seen,
                                'fails', d.fails, 'locked_until', d.locked_until),
    'playlists', coalesce((
      select json_agg(json_build_object('id', p.id, 'name', p.name, 'type', p.type,
               'host', public.lumio_host(coalesce(public.lumio_pw_dec(p.url), p.server)), 'created_at', p.created_at) order by p.created_at)
      from public.playlists p where p.mac = d.mac), '[]'::json),
    'support', coalesce((
      select json_agg(json_build_object('id', s.id, 'topic', s.topic, 'created_at', s.created_at, 'done', s.done)
               order by s.created_at desc)
      from public.support_messages s where s.mac = d.mac), '[]'::json));
end $b$;
$f$;
  end if;
end $$;

-- ---------- Rechte: Helfer darf niemand direkt aufrufen ----------
revoke all on function public.lumio_pw_key() from public, anon, authenticated;
revoke all on function public.lumio_pw_enc(text) from public, anon, authenticated;
revoke all on function public.lumio_pw_dec(text) from public, anon, authenticated;
revoke all on function public.lumio_seal_playlist() from public, anon, authenticated;

-- ---------- Bestehende Zeilen einmal verschlüsseln ----------
update public.playlists set password = password, url = url
where (password is not null and password not like 'enc1:%') or (url is not null and url not like 'enc1:%');
