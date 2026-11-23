# OnePage дизайн-радар

Личный трекер Макса: дайджест по проектам и задачи. Перенесён из Claude-артефакта в отдельное приложение.

- **Приложение**: PWA в `public/` (ставится на iPhone и Mac), хостинг Vercel.
- **Данные**: Supabase, таблица `public.docs` (коллекции `tasks`, `projects`, `meta`), realtime.
- **Агенты Claude**: MCP-сервер `api/mcp.js` по адресу `/mcp/<MCP_TOKEN>`, подключается в Claude как кастомный коннектор.

## Настройка

### 1. Supabase
1. SQL Editor → вставить `supabase/schema.sql` (или `setup.sql` с данными) → Run.
2. Authentication → Users → Add user → Create new user: почта и пароль, галочка Auto Confirm.
3. Authentication → Sign In / Providers → выключить **Allow new users to sign up**. Тогда войти можешь только ты.
4. Project Settings → API Keys: понадобятся Project URL, publishable key и secret key.

### 2. Vercel
Add New → Project → импорт этого репозитория. В Environment Variables:

| Переменная | Что это |
|---|---|
| `SUPABASE_URL` | Project URL, например `https://xxxx.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | publishable (или anon) ключ, он публичный |
| `SUPABASE_SECRET_KEY` | secret (или service_role) ключ, только для сервера |
| `MCP_TOKEN` | случайная строка от 24 символов: `openssl rand -hex 24` |

Deploy.

### 3. Установка
- iPhone: открыть адрес в Safari → Поделиться → «На экран Домой».
- Mac: Chrome → значок установки в адресной строке, или Safari → Файл → «Добавить в Dock».

### 4. Коннектор в Claude
Settings → Connectors → Add custom connector. Название «Дизайн-радар», URL: `https://<домен>/mcp/<MCP_TOKEN>`.

Инструменты: `list`, `get`, `set`, `update`, `delete`, `batch`, `add_task`.

## Разработка
`npm test` проверяет MCP-сервер на подменном Supabase.
