// Слой данных: тот же API, что у базы артефакта (collection/doc/onSnapshot/update/add),
// но поверх Supabase (таблица public.docs + realtime). Перед загрузкой просит войти.
(function () {
  const cfg = window.RADAR_CONFIG || {};
  const docs = new Map(); // "collection/id" -> {collection, id, data}
  const listeners = new Set(); // {match(collection,id), fire()}
  let sb = null;
  let loaded = false;

  // Кэш последних данных: при запуске сразу показываем его, потом сверяем с базой.
  const CACHE_KEY = "radar-cache-v1";
  let saveTimer = null;
  function saveCache() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(CACHE_KEY, JSON.stringify([...docs.values()])); } catch {}
    }, 300);
  }
  function readCache() {
    try { const a = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); return Array.isArray(a) ? a : null; } catch { return null; }
  }
  function clearCache() { try { localStorage.removeItem(CACHE_KEY); } catch {} }

  const key = (c, i) => c + "/" + i;
  const snapDocs = (c) =>
    [...docs.values()]
      .filter((d) => d.collection === c)
      .map((d) => ({ id: d.id, data: () => d.data }));

  function notify(c, i) {
    for (const l of listeners) if (l.collection === c && (l.id == null || l.id === i)) l.fire();
  }
  function put(row) {
    const k = key(row.collection, row.id), data = row.data || {};
    const prev = docs.get(k);
    if (prev && JSON.stringify(prev.data) === JSON.stringify(data)) return; // не перерисовывать без изменений
    docs.set(k, { collection: row.collection, id: row.id, data });
    saveCache();
    if (loaded) notify(row.collection, row.id);
  }
  function drop(c, i) {
    if (docs.delete(key(c, i))) { saveCache(); if (loaded) notify(c, i); }
  }

  async function loadAll() {
    const { data, error } = await sb.from("docs").select("collection,id,data");
    if (error) throw error;
    const seen = new Set();
    const first = !loaded;
    for (const r of data) { seen.add(key(r.collection, r.id)); put(r); }
    for (const k of [...docs.keys()]) if (!seen.has(k)) { const d = docs.get(k); drop(d.collection, d.id); }
    loaded = true;
    if (first) for (const l of listeners) l.fire();
  }

  function subscribe() {
    sb.channel("docs")
      .on("postgres_changes", { event: "*", schema: "public", table: "docs" }, (p) => {
        if (p.eventType === "DELETE") drop(p.old.collection, p.old.id);
        else put(p.new);
      })
      .subscribe((status) => { if (status === "SUBSCRIBED" && loaded) loadAll().catch(() => {}); });
  }

  const rid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/-/g, "").slice(0, 20);

  function docRef(c, i) {
    return {
      id: i,
      onSnapshot(cb, err) {
        const l = { collection: c, id: i, fire: () => {
          if (!loaded) return;
          const d = docs.get(key(c, i));
          try { cb({ exists: !!d, id: i, data: () => (d ? d.data : undefined), metadata: { fromCache: false } }); } catch (e) { err && err(e); }
        } };
        listeners.add(l); l.fire();
        return () => listeners.delete(l);
      },
      async get() { const d = docs.get(key(c, i)); return { exists: !!d, id: i, data: () => d && d.data }; },
      async update(patch) {
        const { data, error } = await sb.rpc("doc_merge", { c, i, patch });
        if (error) throw error;
        if (data == null) throw new Error("not found");
        put({ collection: c, id: i, data });
      },
      async set(value) {
        const { error } = await sb.from("docs").upsert({ collection: c, id: i, data: value, updated_at: new Date().toISOString() });
        if (error) throw error;
        put({ collection: c, id: i, data: value });
      },
      async delete() {
        const { error } = await sb.from("docs").delete().eq("collection", c).eq("id", i);
        if (error) throw error;
        drop(c, i);
      },
    };
  }

  const api = {
    collection(c) {
      return {
        doc: (i) => docRef(c, i),
        onSnapshot(cb, err) {
          const l = { collection: c, id: null, fire: () => {
            if (!loaded) return;
            try { cb({ docs: snapDocs(c), metadata: { fromCache: false } }); } catch (e) { err && err(e); }
          } };
          listeners.add(l); l.fire();
          return () => listeners.delete(l);
        },
        async add(value) { const i = rid(); await docRef(c, i).set(value); return { id: i }; },
      };
    },
    doc(path) { const [c, i] = path.split("/"); return docRef(c, i); },
  };

  // ---------- Вход ----------
  function loginForm() {
    return new Promise((resolve) => {
      const box = document.createElement("div");
      box.id = "login";
      box.innerHTML = `
        <form>
          <img src="/icon-180.png" alt="" width="56" height="56">
          <h1>Дизайн-радар</h1>
          <input type="email" name="email" placeholder="Почта" autocomplete="username" required>
          <input type="password" name="password" placeholder="Пароль" autocomplete="current-password" required>
          <button type="submit">Войти</button>
          <p class="err" hidden></p>
        </form>`;
      const st = document.createElement("style");
      st.textContent = `#login{position:fixed;inset:0;z-index:50;background:var(--bg);display:grid;place-items:center;padding:16px}
        #login form{width:100%;max-width:320px;display:flex;flex-direction:column;gap:10px;align-items:stretch}
        #login img{border-radius:14px;align-self:center}#login h1{font-size:20px;font-weight:600;text-align:center;margin:4px 0 8px}
        #login input{font:inherit;color:var(--fg);background:var(--raised);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
        #login button{font:inherit;font-weight:500;color:#fff;background:var(--accent);border:0;border-radius:10px;padding:10px 12px;cursor:pointer}
        #login .err{color:var(--bad);font-size:13px;text-align:center;margin:0}`;
      document.head.appendChild(st);
      document.body.appendChild(box);
      const f = box.querySelector("form"), e = box.querySelector(".err");
      f.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        e.hidden = true;
        const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
        if (error) { e.textContent = "Не получилось войти. Проверь почту и пароль."; e.hidden = false; return; }
        box.remove(); st.remove(); resolve();
      });
    });
  }

  window.radarDB = async function () {
    if (!window.supabase || !cfg.url || !cfg.key) return null;
    sb = window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data } = await sb.auth.getSession();
    const cached = data.session ? readCache() : null;
    if (!data.session) { clearCache(); ready(); await loginForm(); }
    if (cached && cached.length) {
      // Сразу показываем кэш, а свежие данные подтягиваем в фоне.
      for (const r of cached) docs.set(key(r.collection, r.id), r);
      loaded = true;
      loadAll().catch(() => {});
    } else {
      try { await loadAll(); } catch { return null; }
    }
    subscribe();
    // Вернулись в приложение: подтянуть свежие данные, а если сменился день, перезагрузить (секции «Сегодня/Завтра»).
    const day = new Date().toDateString();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      if (new Date().toDateString() !== day) location.reload();
      else loadAll().catch(() => {});
    });
    return api;
  };
  // Снять экран загрузки: интерфейс показывается только когда есть что показать (или форма входа).
  function ready() { document.documentElement.classList.remove("booting"); }
  window.radarReady = ready;
  window.radarSignOut = async () => { if (sb) { clearCache(); await sb.auth.signOut(); location.reload(); } };
})();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
