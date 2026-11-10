#!/usr/bin/env bash
# Spielt server/*.sql in eine leere PostgreSQL-Datenbank (Supabase-Grundlagen nachgebildet) und prüft das Verhalten.
# Verbindung über die üblichen Umgebungsvariablen (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE).
set -euo pipefail
cd "$(dirname "$0")/../.."
Q="psql -v ON_ERROR_STOP=1 -q"
$Q <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema extensions; create extension pgcrypto schema extensions;
create schema auth; create table auth.users(id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
SQL
$Q -f server/supabase.sql
$Q -f server/admin.sql > /dev/null
$Q -f server/sicherheit-2026-11.sql
$Q -f server/sicherheit-2026-11.sql   # muss wiederholbar sein
$Q -f tests/sql/sicherheit.test.sql
$Q -f server/sicherung-2026-11.sql
$Q -f server/sicherung-2026-11.sql   # muss wiederholbar sein
$Q -f tests/sql/sicherung.test.sql
$Q -f server/bewertung-2026-11.sql
$Q -f server/bewertung-2026-11.sql   # muss wiederholbar sein
$Q -f tests/sql/bewertung.test.sql
$Q -f server/schutz-2026-11.sql
$Q -f server/schutz-2026-11.sql   # muss wiederholbar sein
$Q -f tests/sql/schutz.test.sql
