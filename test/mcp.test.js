import { test } from "node:test";
import assert from "node:assert/strict";
import { makeStore } from "../lib/store.js";
import { handleRpc } from "../lib/mcp.js";

// Подменный Supabase REST в памяти.
function fakeFetch() {
  const rows = new Map();
  return async (url, init = {}) => {
    const u = new URL(url); const m = init.method || "GET";
    const body = init.body ? JSON.parse(init.body) : null;
    const eq = (k) => u.searchParams.get(k)?.replace(/^eq\./, "");
    const resp = (s, v) => ({ ok: s < 300, status: s, text: async () => (v === undefined ? "" : JSON.stringify(v)) });
    if (u.pathname.endsWith("/rpc/doc_merge")) {
      const k = body.c + "/" + body.i; const r = rows.get(k);
      if (!r) return resp(200, null);
      r.data = { ...r.data, ...body.patch }; return resp(200, r.data);
    }
    const c = eq("collection"), i = eq("id");
    const sel = [...rows.values()].filter((r) => (!c || r.collection === c) && (!i || r.id === i));
    if (m === "GET") return resp(200, sel.map((r) => ({ id: r.id, data: r.data })));
    if (m === "POST") { rows.set(body.collection + "/" + body.id, { ...body }); return resp(201); }
    if (m === "DELETE") { sel.forEach((r) => rows.delete(r.collection + "/" + r.id)); return resp(200, sel); }
  };
}

const call = (store, name, args, id = 1) => handleRpc(store, { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
const parse = (r) => JSON.parse(r.result.content[0].text);

test("initialize и tools/list", async () => {
  const store = makeStore({ url: "https://x.supabase.co", secret: "sb_secret_x", fetchImpl: fakeFetch() });
  const init = await handleRpc(store, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
  assert.equal(init.result.protocolVersion, "2025-06-18");
  assert.equal(await handleRpc(store, { jsonrpc: "2.0", method: "notifications/initialized" }), null);
  const list = await handleRpc(store, { jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.ok(list.result.tools.find((t) => t.name === "add_task"));
});

test("set, update, add_task, delete", async () => {
  const store = makeStore({ url: "https://x.supabase.co", secret: "sb_secret_x", fetchImpl: fakeFetch() });
  await call(store, "set", { collection: "tasks", id: "t01", data: { title: "A", status: "todo", order: 5 } });
  await call(store, "set", { collection: "tasks", id: "t02", data: { title: "B", status: "done", done: true, order: 9 } });
  const u = parse(await call(store, "update", { collection: "tasks", id: "t01", data: { description: "d" } }));
  assert.equal(u.title, "A"); assert.equal(u.description, "d");
  const miss = await call(store, "update", { collection: "tasks", id: "nope", data: { a: 1 } });
  assert.equal(miss.result.isError, true);
  const t = parse(await call(store, "add_task", { title: "C", due: "2026-11-24", source: "Granola" }));
  assert.equal(t.order, 6); assert.equal(t.status, "todo"); assert.equal(t.addedBy, "claude");
  assert.equal(parse(await call(store, "list", { collection: "tasks" })).length, 3);
  const b = parse(await call(store, "batch", { ops: [{ op: "delete", collection: "tasks", id: "t02" }, { op: "set", collection: "meta", id: "summary", data: { bullets: ["x"] } }] }));
  assert.equal(b.ok, 2);
  assert.equal(parse(await call(store, "get", { collection: "tasks", id: "t02" })), null);
  const bad = await call(store, "list", { collection: "Bad Name" });
  assert.equal(bad.result.isError, true);
});
