// Доступ к таблице public.docs через REST API Supabase с секретным ключом (только на сервере).

const COLL = /^[a-z][a-z0-9_]{0,40}$/;

export function makeStore({ url, secret, fetchImpl = fetch } = {}) {
  if (!url || !secret) throw new Error("SUPABASE_URL и SUPABASE_SECRET_KEY не заданы");
  const base = url.replace(/\/+$/, "") + "/rest/v1";
  const headers = { apikey: secret, "Content-Type": "application/json" };
  // Старые ключи service_role это JWT, их нужно передавать и в Authorization.
  if (secret.startsWith("eyJ")) headers.Authorization = "Bearer " + secret;

  async function call(path, { method = "GET", body, prefer } = {}) {
    const h = { ...headers };
    if (prefer) h.Prefer = prefer;
    const r = await fetchImpl(base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  }

  const checkColl = (c) => { if (!COLL.test(c || "")) throw new Error(`Неверное имя коллекции: ${c}`); };
  const checkId = (i) => { if (typeof i !== "string" || !i || i.length > 120) throw new Error("Нужен id документа (строка до 120 символов)"); };
  const q = encodeURIComponent;

  return {
    async list(collection) {
      checkColl(collection);
      const rows = await call(`/docs?collection=eq.${q(collection)}&select=id,data&order=id`);
      return rows.map((r) => ({ id: r.id, ...r.data }));
    },
    async get(collection, id) {
      checkColl(collection); checkId(id);
      const rows = await call(`/docs?collection=eq.${q(collection)}&id=eq.${q(id)}&select=id,data`);
      return rows[0] ? { id: rows[0].id, ...rows[0].data } : null;
    },
    async set(collection, id, data) {
      checkColl(collection); checkId(id);
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("data должен быть объектом");
      await call(`/docs?on_conflict=collection,id`, {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=minimal",
        body: { collection, id, data, updated_at: new Date().toISOString() },
      });
      return { id, ...data };
    },
    async update(collection, id, patch) {
      checkColl(collection); checkId(id);
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("data должен быть объектом");
      const merged = await call(`/rpc/doc_merge`, { method: "POST", body: { c: collection, i: id, patch } });
      if (merged == null) throw new Error(`Документ ${collection}/${id} не найден`);
      return { id, ...merged };
    },
    async remove(collection, id) {
      checkColl(collection); checkId(id);
      const rows = await call(`/docs?collection=eq.${q(collection)}&id=eq.${q(id)}`, { method: "DELETE", prefer: "return=representation" });
      return { deleted: rows.length };
    },
  };
}
