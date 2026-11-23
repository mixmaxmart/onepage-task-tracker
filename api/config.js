// Публичные настройки для браузера: адрес Supabase и публичный (publishable/anon) ключ.
// Секретный ключ сюда не попадает.
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../lib/config.js";

export default function handler(req, res) {
  const cfg = { url: SUPABASE_URL, key: SUPABASE_PUBLISHABLE_KEY };
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(`window.RADAR_CONFIG=${JSON.stringify(cfg)};`);
}
