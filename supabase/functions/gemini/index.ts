// Supabase Edge Function "gemini": calls Gemini for Saurus with the API key
// kept server-side, so the extension and the repo never hold it.
//
//   POST {fn}/v1beta/models/{model}:generateContent        (page translation)
//   WS   {fn}/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent
//                                                         (Gemini Live voice)
//
// Secrets (Dashboard > Edge Functions > Secrets):
//   GEMINI_API_KEY   required
//   GEMINI_MODELS    optional, comma-separated allow-list
//                    (default "gemini-3.8-live,gemini-3.8-flash")
//   ALLOWED_ORIGINS  optional, comma-separated; empty allows any origin
//
// JWT verification must be off for this function: browsers cannot send an
// Authorization header when opening a WebSocket (see supabase/config.toml).

const UPSTREAM = (Deno.env.get("GEMINI_UPSTREAM") ?? "https://generativelanguage.googleapis.com").replace(/\/$/, "");
const KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const MODELS = (Deno.env.get("GEMINI_MODELS") ?? "gemini-3.8-live,gemini-3.8-flash")
  .split(",").map((m) => m.trim()).filter(Boolean);
const ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((o) => o.trim()).filter(Boolean);
const LIVE_PATH = "/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

function cors(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function json(status: number, body: unknown, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}
const allowedModel = (name: string) => MODELS.includes(name.replace(/^models\//, ""));

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (ORIGINS.length && origin && !ORIGINS.includes(origin)) return json(403, { error: { message: "origin not allowed" } }, null);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
  if (!KEY) return json(500, { error: { message: "GEMINI_API_KEY secret is not set" } }, origin);

  // The path arrives as /gemini/... (or /functions/v1/gemini/...): keep the Gemini part.
  const url = new URL(req.url);
  const at = Math.max(url.pathname.indexOf("/v1beta/"), url.pathname.indexOf("/ws/"));
  const path = at >= 0 ? url.pathname.slice(at) : "";

  // Gemini Live: a WebSocket relayed both ways, model checked on setup.
  if (path === LIVE_PATH) {
    if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") return json(400, { error: { message: "expected a WebSocket" } }, origin);
    const { socket: client, response } = Deno.upgradeWebSocket(req);
    const upstream = new WebSocket(`${UPSTREAM.replace(/^http/, "ws")}${LIVE_PATH}?key=${encodeURIComponent(KEY)}`);
    const queue: (string | ArrayBuffer)[] = [];
    let checked = false;
    const closeBoth = (code = 1000, reason = "") => {
      for (const s of [client, upstream]) {
        if (s.readyState === WebSocket.OPEN || s.readyState === WebSocket.CONNECTING) {
          try { s.close(code, reason.slice(0, 120)); } catch { /* already closing */ }
        }
      }
    };
    client.onmessage = (ev) => {
      if (!checked) {
        checked = true;
        try {
          const model = String(JSON.parse(typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data)).setup?.model ?? "");
          if (!allowedModel(model)) return closeBoth(1008, `model not allowed: ${model}`);
        } catch {
          return closeBoth(1008, "first message must be a setup message");
        }
      }
      if (upstream.readyState === WebSocket.OPEN) upstream.send(ev.data);
      else queue.push(ev.data);
    };
    upstream.onopen = () => { for (const m of queue.splice(0)) upstream.send(m); };
    upstream.onmessage = (ev) => { if (client.readyState === WebSocket.OPEN) client.send(ev.data); };
    upstream.onclose = (ev) => closeBoth(ev.code === 1005 ? 1000 : ev.code, ev.reason);
    upstream.onerror = () => closeBoth(1011, "Gemini connection failed");
    client.onclose = () => closeBoth();
    return response;
  }

  // Page translation: generateContent, passed through.
  const m = path.match(/^\/v1beta\/models\/([^/:]+):generateContent$/);
  if (m && req.method === "POST") {
    if (!allowedModel(m[1])) return json(403, { error: { message: `model not allowed: ${m[1]}` } }, origin);
    const res = await fetch(`${UPSTREAM}${path}?key=${encodeURIComponent(KEY)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await req.text(),
    });
    return new Response(res.body, { status: res.status, headers: { ...cors(origin), "Content-Type": "application/json" } });
  }

  return json(404, { error: { message: "not found" } }, origin);
});
