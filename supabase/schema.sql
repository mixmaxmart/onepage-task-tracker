-- Дизайн-радар: одна таблица документов, как в базе артефакта.
-- Коллекции: tasks, projects, meta. Поле data хранит документ целиком (jsonb).
-- Запустить один раз: Supabase → SQL Editor → вставить файл → Run.

create table if not exists public.docs (
  collection text not null check (collection ~ '^[a-z][a-z0-9_]{0,40}$'),
  id         text not null check (length(id) between 1 and 120),
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);

-- Слияние полей (как update в базе артефакта). Возвращает null, если документа нет.
create or replace function public.doc_merge(c text, i text, patch jsonb)
returns jsonb
language sql
security invoker
as $$
  update public.docs
     set data = data || patch, updated_at = now()
   where collection = c and id = i
  returning data;
$$;

alter table public.docs enable row level security;

-- Доступ из приложения: только вошедший пользователь.
-- Регистрацию новых пользователей нужно выключить (см. README), тогда это только ты.
drop policy if exists "owner full access" on public.docs;
create policy "owner full access" on public.docs
  for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on public.docs to authenticated;
grant execute on function public.doc_merge(text, text, jsonb) to authenticated;
revoke all on public.docs from anon;
revoke execute on function public.doc_merge(text, text, jsonb) from anon, public;

-- Realtime: приложение получает изменения сразу.
alter table public.docs replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'docs'
  ) then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;
