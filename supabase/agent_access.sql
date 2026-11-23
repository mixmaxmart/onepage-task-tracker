-- Доступ агентов (MCP-сервер) без секретного ключа Supabase:
-- сервер вызывает radar_op с публичным ключом и токеном; токен сверяется по хэшу.
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from anon, authenticated, public;

create table if not exists private.agent_tokens (
  token_hash text primary key,
  label text,
  created_at timestamptz not null default now()
);

create or replace function public.radar_op(p_token text, p_op text, p_collection text, p_id text default null, p_data jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r jsonb; n int;
begin
  if p_token is null or not exists (
    select 1 from private.agent_tokens
     where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  ) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  if p_collection !~ '^[a-z][a-z0-9_]{0,40}$' then
    raise exception 'bad collection';
  end if;

  if p_op = 'list' then
    select coalesce(jsonb_agg(jsonb_build_object('id', id) || data order by id), '[]'::jsonb) into r
      from docs where collection = p_collection;
  elsif p_op = 'get' then
    select jsonb_build_object('id', id) || data into r from docs where collection = p_collection and id = p_id;
  elsif p_op = 'set' then
    insert into docs (collection, id, data) values (p_collection, p_id, p_data)
      on conflict (collection, id) do update set data = excluded.data, updated_at = now();
    r := jsonb_build_object('id', p_id) || p_data;
  elsif p_op = 'update' then
    update docs set data = data || p_data, updated_at = now()
     where collection = p_collection and id = p_id
     returning jsonb_build_object('id', id) || data into r;
  elsif p_op = 'delete' then
    delete from docs where collection = p_collection and id = p_id;
    get diagnostics n = row_count;
    r := jsonb_build_object('deleted', n);
  else
    raise exception 'bad op %', p_op;
  end if;
  return r;
end $$;

revoke all on function public.radar_op(text, text, text, text, jsonb) from public;
grant execute on function public.radar_op(text, text, text, text, jsonb) to anon, authenticated;

-- Только владелец (Макс) видит и меняет данные, даже если регистрация открыта.
-- Добавить владельца: insert into private.owners values ('<auth.users.id>');
create table if not exists private.owners (user_id uuid primary key);
create or replace function public.is_radar_owner()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select 1 from private.owners where user_id = auth.uid()) $$;
grant execute on function public.is_radar_owner() to authenticated;
alter policy "owner full access" on public.docs using (public.is_radar_owner()) with check (public.is_radar_owner());
