import { test } from "node:test";
import assert from "node:assert/strict";
import { makeStore } from "../lib/store.js";
import { handleRpc } from "../lib/mcp.js";

// Подменный radar_op в памяти.
function fakeFetch() {
  const rows = new Map();
  return async (url, init = {}) => {
    const b = JSON.parse(init.body);
    const resp = (s, v) => ({ ok: s < 300, status: s, text: async () => JSON.stringify(v) });
    if (b.p_token !== "tok") return resp(400, { message: "unauthorized" });
    const k = b.p_collection + "/" + b.p_id;
    switch (b.p_op) {
      case "list": return resp(200, [...rows.entries()].filter(([kk]) => kk.startsWith(b.p_collection + "/")).map(([kk, d]) => ({ id: kk.split("/")[1], ...d })));
      case "get": return resp(200, rows.has(k) ? { id: b.p_id, ...rows.get(k) } : null);
      case "set": rows.set(k, b.p_data); return resp(200, { id: b.p_id, ...b.p_data });
      case "update": if (!rows.has(k)) return resp(200, null); rows.set(k, { ...rows.get(k), ...b.p_data }); return resp(200, { id: b.p_id, ...rows.get(k) });
      case "delete": return resp(200, { deleted: rows.delete(k) ? 1 : 0 });
    }
  };
}
const mk = () => makeStore({ url: "https://x.supabase.co", key: "sb_publishable_x", token: "tok", fetchImpl: fakeFetch() });

const call = (store, name, args, id = 1) => handleRpc(store, { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
const parse = (r) => JSON.parse(r.result.content[0].text);

test("initialize и tools/list", async () => {
  const store = mk();
  const init = await handleRpc(store, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
  assert.equal(init.result.protocolVersion, "2025-06-18");
  assert.equal(await handleRpc(store, { jsonrpc: "2.0", method: "notifications/initialized" }), null);
  const list = await handleRpc(store, { jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.ok(list.result.tools.find((t) => t.name === "add_task"));
});

test("set, update, add_task, delete", async () => {
  const store = mk();
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
