// Публичные настройки Supabase (адрес и publishable-ключ можно хранить в коде: доступ к данным
// закрыт политиками RLS и токеном агента). Переменные окружения Vercel их переопределяют.
export const SUPABASE_URL = process.env.SUPABASE_URL || "https://cnhuhipnxwfshnxrsouj.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_GXvEqmZgPGhArblXQAg7mw_n8VqoBPY";
