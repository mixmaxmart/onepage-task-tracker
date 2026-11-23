// Доступ агентов к данным: функция public.radar_op в Supabase.
// Сервер вызывает её с публичным ключом и токеном MCP; токен проверяется в базе по хэшу,
// поэтому секретный ключ Supabase серверу не нужен.

const COLL = /^[a-z][a-z0-9_]{0,40}$/;

export function makeStore({ url, key, token, fetchImpl = fetch } = {}) {
  if (!url || !key || !token) throw new Error("SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY или MCP_TOKEN не заданы");
  const endpoint = url.replace(/\/+$/, "") + "/rest/v1/rpc/radar_op";
  const headers = { apikey: key, "Content-Type": "application/json" };
  if (key.startsWith("eyJ")) headers.Authorization = "Bearer " + key; // старый anon-ключ

  async function op(p_op, p_collection, p_id = null, p_data = null) {
    if (!COLL.test(p_collection || "")) throw new Error(`Неверное имя коллекции: ${p_collection}`);
    if (p_op !== "list" && (typeof p_id !== "string" || !p_id || p_id.length > 120)) throw new Error("Нужен id документа (строка до 120 символов)");
    if ((p_op === "set" || p_op === "update") && (!p_data || typeof p_data !== "object" || Array.isArray(p_data))) throw new Error("data должен быть объектом");
    const r = await fetchImpl(endpoint, { method: "POST", headers, body: JSON.stringify({ p_token: token, p_op, p_collection, p_id, p_data }) });
    const text = await r.text();
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  }

  return {
    list: (c) => op("list", c),
    get: (c, i) => op("get", c, i),
    set: (c, i, d) => op("set", c, i, d),
    async update(c, i, d) {
      const r = await op("update", c, i, d);
      if (r == null) throw new Error(`Документ ${c}/${i} не найден`);
      return r;
    },
    remove: (c, i) => op("delete", c, i),
  };
}
