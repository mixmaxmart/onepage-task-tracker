# OnePage дизайн-радар

Личный трекер Макса: дайджест по проектам и задачи. Перенесён из Claude-артефакта в отдельное приложение.

- **Приложение**: PWA в `public/` (ставится на iPhone и Mac), хостинг Vercel.
- **Данные**: Supabase, таблица `public.docs` (коллекции `tasks`, `projects`, `meta`), realtime.
- **Агенты Claude**: MCP-сервер `api/mcp.js` по адресу `/mcp/<MCP_TOKEN>`, подключается в Claude как кастомный коннектор.

## Настройка

### 1. Supabase
1. SQL Editor → выполнить `supabase/schema.sql`, затем `supabase/agent_access.sql`.
   Добавить токен агентов: `insert into private.agent_tokens (token_hash) values (encode(extensions.digest('<MCP_TOKEN>','sha256'),'hex'));`
2. Authentication → Users → Add user → Create new user: почта и пароль, галочка Auto Confirm.
3. Authentication → Sign In / Providers → выключить **Allow new users to sign up**. Тогда войти можешь только ты.
4. Project Settings → API Keys: понадобятся Project URL и publishable key. Секретный ключ не нужен: MCP-сервер ходит через функцию `radar_op`, которая проверяет токен.

### 2. Vercel
Add New → Project → импорт этого репозитория → Deploy. Переменные окружения не нужны:
адрес Supabase и publishable-ключ лежат в `lib/config.js` (они публичные), а токен агента
передаётся в адресе коннектора и проверяется базой.

### 3. Установка
- iPhone: открыть адрес в Safari → Поделиться → «На экран Домой».
- Mac: Chrome → значок установки в адресной строке, или Safari → Файл → «Добавить в Dock».

### 4. Коннектор в Claude
Settings → Connectors → Add custom connector. Название «Дизайн-радар», URL: `https://<домен>/mcp/<токен>`, где токен тот, чей sha256 лежит в `private.agent_tokens`.

Инструменты: `list`, `get`, `set`, `update`, `delete`, `batch`, `add_task`.

## Разработка
`npm test` проверяет MCP-сервер на подменном Supabase.
