// Точка входа MCP: https://<домен>/mcp/<MCP_TOKEN>
// Этот адрес добавляется в Claude как кастомный коннектор.
import { timingSafeEqual } from "node:crypto";
import { makeStore } from "../lib/store.js";
import { handleRpc } from "../lib/mcp.js";

function tokenOk(given) {
  const want = process.env.MCP_TOKEN || "";
  if (want.length < 24 || typeof given !== "string") return false;
  const a = Buffer.from(given), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readBody(req) {
  if (req.body !== undefined && typeof req.body !== "string") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return JSON.parse(raw || "null");
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!tokenOk(req.query?.token)) { res.statusCode = 404; return res.end("Not found"); }
  if (req.method === "GET" || req.method === "DELETE") { res.statusCode = 405; res.setHeader("Allow", "POST"); return res.end(); }
  if (req.method !== "POST") { res.statusCode = 405; return res.end(); }

  let body;
  try { body = await readBody(req); } catch {
    res.statusCode = 400; res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }));
  }

  const store = makeStore({ url: process.env.SUPABASE_URL, secret: process.env.SUPABASE_SECRET_KEY });
  const msgs = Array.isArray(body) ? body : [body];
  const out = (await Promise.all(msgs.map((m) => handleRpc(store, m)))).filter(Boolean);

  if (!out.length) { res.statusCode = 202; return res.end(); }
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(Array.isArray(body) ? out : out[0]));
}
