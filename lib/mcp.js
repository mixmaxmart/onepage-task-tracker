// MCP-сервер дизайн-радара (Streamable HTTP, без состояния, JSON-ответы).
// Инструменты повторяют базу артефакта: коллекции tasks, projects, meta.

export const SERVER_INFO = { name: "design-radar", version: "1.0.0" };
const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

export const INSTRUCTIONS = `Дизайн-радар Макса (OnePage). Данные: коллекции
- tasks/<id>: {title, project, projectId (slug проекта), due YYYY-MM-DD, source, url, description, links[{label,url}], status: todo|progress|done|canceled|removed, done (= status done), doneAt, addedBy: claude|max, order, createdAt}
- projects/<slug>: {order, name, state: active|waiting|blocked|done, now[], design[], members[{name,role,does,avatar}], refs{slack,linear,space:{label,url}}, links[{label,url}], updated}
- meta/summary: {date, time, sources, bullets[]}; meta/people: {avatars{}}
Правила: статус, срок (due) и порядок (order) у существующих задач меняет только Макс, если он сам не попросил. Задачи со status "removed" Макс отметил как не свои: не добавлять похожие снова. Новые задачи добавлять через add_task (он ставит status todo и order в конец). Перед добавлением проверь list, чтобы не было дублей.`;

const S = (props, required = []) => ({ type: "object", properties: props, required, additionalProperties: false });
const coll = { type: "string", description: "Коллекция: tasks, projects или meta" };
const id = { type: "string", description: "id документа" };
const obj = { type: "object", description: "Поля документа" };

export const TOOLS = [
  { name: "list", description: "Все документы коллекции.", inputSchema: S({ collection: coll }, ["collection"]), annotations: { readOnlyHint: true } },
  { name: "get", description: "Один документ.", inputSchema: S({ collection: coll, id }, ["collection", "id"]), annotations: { readOnlyHint: true } },
  { name: "set", description: "Создать или полностью заменить документ.", inputSchema: S({ collection: coll, id, data: obj }, ["collection", "id", "data"]) },
  { name: "update", description: "Изменить отдельные поля существующего документа (остальные поля сохраняются).", inputSchema: S({ collection: coll, id, data: obj }, ["collection", "id", "data"]) },
  { name: "delete", description: "Удалить документ.", inputSchema: S({ collection: coll, id }, ["collection", "id"]), annotations: { destructiveHint: true } },
  {
    name: "batch",
    description: "Несколько операций set/update/delete за один вызов (по порядку).",
    inputSchema: S({
      ops: {
        type: "array",
        items: S({ op: { type: "string", enum: ["set", "update", "delete"] }, collection: coll, id, data: obj }, ["op", "collection", "id"]),
      },
    }, ["ops"]),
  },
  {
    name: "add_task",
    description: "Добавить новую задачу Максу: status todo, addedBy claude, order в конец открытых.",
    inputSchema: S({
      title: { type: "string" },
      due: { type: "string", description: "YYYY-MM-DD, если срок известен" },
      project: { type: "string", description: "Название проекта для подписи" },
      projectId: { type: "string", description: "slug проекта из коллекции projects" },
      description: { type: "string" },
      source: { type: "string", description: "Откуда задача: Granola, Linear, Slack…" },
      url: { type: "string" },
      links: { type: "array", items: S({ label: { type: "string" }, url: { type: "string" } }, ["url"]) },
    }, ["title"]),
  },
];

const OPEN = new Set(["todo", "progress", undefined]);

async function runTool(store, name, a = {}) {
  switch (name) {
    case "list": return store.list(a.collection);
    case "get": return store.get(a.collection, a.id);
    case "set": return store.set(a.collection, a.id, a.data);
    case "update": return store.update(a.collection, a.id, a.data);
    case "delete": return store.remove(a.collection, a.id);
    case "batch": {
      if (!Array.isArray(a.ops) || !a.ops.length) throw new Error("ops пустой");
      if (a.ops.length > 200) throw new Error("Не больше 200 операций за раз");
      const out = [];
      for (const o of a.ops) {
        if (o.op === "set") await store.set(o.collection, o.id, o.data);
        else if (o.op === "update") await store.update(o.collection, o.id, o.data);
        else if (o.op === "delete") await store.remove(o.collection, o.id);
        else throw new Error(`Неизвестная операция ${o.op}`);
        out.push(`${o.op} ${o.collection}/${o.id}`);
      }
      return { ok: out.length, ops: out };
    }
    case "add_task": {
      const title = String(a.title || "").trim();
      if (!title) throw new Error("Нужен title");
      if (a.due && !/^\d{4}-\d{2}-\d{2}$/.test(a.due)) throw new Error("due в формате YYYY-MM-DD");
      const tasks = await store.list("tasks");
      const open = tasks.filter((t) => OPEN.has(t.status) && !t.done);
      const order = Math.max(0, ...open.map((t) => (typeof t.order === "number" ? t.order : 0))) + 1;
      const tid = "t" + Date.now().toString(36);
      const data = { title, status: "todo", done: false, addedBy: "claude", order, createdAt: new Date().toISOString() };
      for (const k of ["due", "project", "projectId", "description", "source", "url", "links"]) if (a[k] !== undefined && a[k] !== "") data[k] = a[k];
      return store.set("tasks", tid, data);
    }
    default: throw Object.assign(new Error(`Неизвестный инструмент ${name}`), { code: -32602 });
  }
}

const ok = (idv, result) => ({ jsonrpc: "2.0", id: idv, result });
const fail = (idv, code, message) => ({ jsonrpc: "2.0", id: idv ?? null, error: { code, message } });

export async function handleRpc(store, msg) {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return fail(msg?.id, -32600, "Invalid Request");
  const isNote = msg.id === undefined || msg.id === null;
  if (isNote) return null; // notifications/initialized и прочие уведомления
  const p = msg.params || {};
  switch (msg.method) {
    case "initialize": {
      const v = PROTOCOLS.includes(p.protocolVersion) ? p.protocolVersion : PROTOCOLS[0];
      return ok(msg.id, { protocolVersion: v, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
    }
    case "ping": return ok(msg.id, {});
    case "tools/list": return ok(msg.id, { tools: TOOLS });
    case "tools/call": {
      if (!TOOLS.some((t) => t.name === p.name)) return fail(msg.id, -32602, `Неизвестный инструмент ${p.name}`);
      try {
        const res = await runTool(store, p.name, p.arguments || {});
        return ok(msg.id, { content: [{ type: "text", text: JSON.stringify(res ?? null) }] });
      } catch (e) {
        return ok(msg.id, { content: [{ type: "text", text: String(e.message || e) }], isError: true });
      }
    }
    default: return fail(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}
