-- Trakr — lot S0 : miroir des tables utilisateur et règles d'accès.
--
-- Chaque table reprend les colonnes SQLite à l'identique (mêmes noms, mêmes
-- types de valeurs) pour que la sync n'ait aucune conversion à faire. Les
-- horodatages restent du texte ISO 8601 : l'app les compare et les trie comme
-- des chaînes, et un `timestamptz` les lui rendrait dans un autre format.
--
-- Deux colonnes de plus, propres au serveur :
--   owner_id          — l'utilisateur Supabase propriétaire, posé par défaut ;
--   server_updated_at — horloge serveur de la dernière écriture, curseur du pull.
--
-- Pas de clés étrangères entre ces tables : un envoi peut faire arriver une
-- série avant sa séance. L'intégrité est garantie par l'app, qui écrit tout
-- dans la même transaction locale.

create table if not exists public.routine (
  id                text primary key,
  owner_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name              text not null,
  color             text,
  notes             text,
  archived_at       text,
  created_at        text not null,
  updated_at        text not null,
  deleted_at        text,
  server_updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.routine_item (
  id                text primary key,
  owner_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  routine_id        text not null,
  exercise_id       text not null,
  position          integer not null,
  target_sets       integer not null default 3,
  target_reps       text,
  rest_seconds      integer,
  superset_key      text,
  notes             text,
  updated_at        text not null,
  deleted_at        text,
  server_updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.session (
  id                text primary key,
  owner_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  routine_id        text,
  routine_name      text not null,
  started_at        text not null,
  ended_at          text,
  bodyweight_kg     double precision,
  notes             text,
  updated_at        text not null,
  deleted_at        text,
  server_updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.session_exercise (
  id                text primary key,
  owner_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id        text not null,
  exercise_id       text not null,
  position          integer not null,
  target_sets       integer not null default 3,
  target_reps       text,
  rest_seconds      integer not null default 120,
  superset_key      text,
  notes             text,
  updated_at        text not null,
  deleted_at        text,
  server_updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.set_log (
  id                text primary key,
  owner_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id        text not null,
  exercise_id       text not null,
  set_index         integer not null,
  weight_kg         double precision not null,
  reps              integer not null,
  rir               integer,
  set_type          text not null default 'working',
  is_pr             integer not null default 0, -- booléen SQLite : 0 / 1
  logged_at         text not null,
  updated_at        text not null,
  deleted_at        text,
  server_updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.cardio_log (
  id                text primary key,
  owner_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id        text not null,
  activity_id       text not null,
  position          integer not null,
  duration_sec      integer not null,
  distance_m        double precision,
  calories          integer,
  level             double precision,
  logged_at         text not null,
  updated_at        text not null,
  deleted_at        text,
  server_updated_at timestamptz not null default clock_timestamp()
);

-- Last-write-wins sur l'horloge client (§3 du spec) : une ligne n'est écrasée
-- que par une version plus récente. Renvoyer NULL d'un trigger BEFORE UPDATE
-- annule la mise à jour, y compris dans un INSERT … ON CONFLICT DO UPDATE :
-- l'app peut donc envoyer de simples upserts, rejouables sans risque.
create or replace function public.sync_last_write_wins()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.updated_at <= old.updated_at then
      return null;
    end if;
    -- Une ligne ne change jamais de propriétaire.
    new.owner_id := old.owner_id;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['routine', 'routine_item', 'session', 'session_exercise', 'set_log', 'cardio_log'] loop
    execute format('create index if not exists %I on public.%I (owner_id, server_updated_at)', t || '_pull_idx', t);

    execute format('drop trigger if exists sync_last_write_wins on public.%I', t);
    execute format(
      'create trigger sync_last_write_wins before insert or update on public.%I
         for each row execute function public.sync_last_write_wins()', t);

    -- Seul le propriétaire lit et écrit ses lignes. Pas de DELETE : une
    -- suppression est un soft delete (deleted_at), qui doit se propager.
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "propriétaire : lecture" on public.%I', t);
    execute format('drop policy if exists "propriétaire : ajout" on public.%I', t);
    execute format('drop policy if exists "propriétaire : modification" on public.%I', t);
    execute format(
      'create policy "propriétaire : lecture" on public.%I for select to authenticated
         using (owner_id = (select auth.uid()))', t);
    execute format(
      'create policy "propriétaire : ajout" on public.%I for insert to authenticated
         with check (owner_id = (select auth.uid()))', t);
    execute format(
      'create policy "propriétaire : modification" on public.%I for update to authenticated
         using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);

    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end;
$$;
