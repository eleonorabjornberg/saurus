// Supabase Edge Function "gemini": calls Gemini for Saurus with the API key
// kept server-side, so the extension and the repo never hold it.
//
//   POST {fn}/v1beta/models/{model}:generateContent        (page translation)
//   WS   {fn}/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent
//                                                         (Gemini Live voice)
//
// Secrets (Dashboard > Edge Functions > Secrets):
//   GEMINI_API_KEY   required; used for voice
//   GEMINI_TEXT_API_KEY  optional second key, used first for page translation
//                    so it doesn't share a rate limit with voice; on a 429
//                    the other key is tried
//   GEMINI_MODELS    optional, comma-separated allow-list
//                    (default "gemini-3.8-live,gemini-3.8-flash,gemini-3.5-flash-lite")
//   ALLOWED_ORIGINS  optional, comma-separated; empty allows any origin
//   SAURUS_OPEN      optional escape hatch: "1" turns sign-in and the free-tier
//                    limits off (the function is then open to anyone again)
//   SAURUS_SERVICE_KEY  optional; the service-role / secret key, if your project
//                    doesn't provide SUPABASE_SERVICE_ROLE_KEY to functions
//
// Free tier: every call must carry a pass from saurus_gemini_ticket() (the
// signed-in extension gets one from Supabase). Voice sends it as ?ticket=,
// text as the x-saurus-ticket header. Usage is counted per account per UTC
// day; limits live in saurus_limits() (migration 20261011030000).
//   voice: closes with 4001 (no valid pass) or 4002 (daily limit reached)
//   text:  401 (no valid pass) or 429 (daily limit reached)
//
// JWT verification must be off for this function: browsers cannot send an
// Authorization header when opening a WebSocket (see supabase/config.toml).

const UPSTREAM = (Deno.env.get("GEMINI_UPSTREAM") ?? "https://generativelanguage.googleapis.com").replace(/\/$/, "");
const KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const TEXT_KEYS = [Deno.env.get("GEMINI_TEXT_API_KEY") ?? "", KEY].filter(Boolean)
  .filter((k, i, a) => a.indexOf(k) === i);
const MODELS = (Deno.env.get("GEMINI_MODELS") ?? "gemini-3.8-live,gemini-3.8-flash,gemini-3.5-flash-lite")
  .split(",").map((m) => m.trim()).filter(Boolean);
const ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((o) => o.trim()).filter(Boolean);
const OPEN = Deno.env.get("SAURUS_OPEN") === "1";
const SB_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
const SB_KEY = Deno.env.get("SAURUS_SERVICE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

type Pass = { user_id: string; voice_left: number; pages_left: number; calls_left: number };
async function rpc(fn: string, args: unknown) {
  const headers: Record<string, string> = { "Content-Type": "application/json", apikey: SB_KEY };
  if (SB_KEY.startsWith("eyJ")) headers.Authorization = `Bearer ${SB_KEY}`; // legacy service-role JWT
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(args) });
  if (!res.ok) throw new Error(`${fn}: ${res.status}`);
  return res.status === 204 ? null : await res.json();
}
// Who is calling, and what they have left today. Null: no valid pass. Throws if the check itself fails.
async function passOf(ticket: string | null): Promise<Pass | null> {
  if (!ticket || ticket.length > 100) return null;
  return (await rpc("saurus_usage_check", { p_ticket: ticket })) as Pass | null;
}
function record(who: Pass, voice: number, pages: number, calls: number) {
  const p = rpc("saurus_usage_add", { p_user: who.user_id, p_voice: voice, p_pages: pages, p_calls: calls })
    .catch((e) => console.error("usage not recorded:", e));
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil?.(p); // let it finish after the response
}

const LIVE_PATH = "/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

function cors(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info, x-saurus-ticket, x-saurus-page",
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
  if (!OPEN && (!SB_URL || !SB_KEY)) return json(500, { error: { message: "service key is not available to this function" } }, origin);

  // The path arrives as /gemini/... (or /functions/v1/gemini/...): keep the Gemini part.
  const url = new URL(req.url);
  const at = Math.max(url.pathname.indexOf("/v1beta/"), url.pathname.indexOf("/ws/"));
  const path = at >= 0 ? url.pathname.slice(at) : "";

  // Gemini Live: a WebSocket relayed both ways, model checked on setup.
  if (path === LIVE_PATH) {
    if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") return json(400, { error: { message: "expected a WebSocket" } }, origin);
    // Check the pass before relaying anything. A refusal is sent as a close
    // code, because a browser can't read the body of a failed WebSocket handshake.
    let who: Pass | null = null;
    let refuse: [number, string] | null = null;
    if (!OPEN) {
      try { who = await passOf(url.searchParams.get("ticket")); }
      catch (e) { console.error("usage check failed:", e); refuse = [1011, "usage check unavailable"]; }
      if (!refuse && !who) refuse = [4001, "sign in required"];
      else if (!refuse && who!.voice_left <= 0) refuse = [4002, "daily voice limit reached"];
    }
    const { socket: client, response } = Deno.upgradeWebSocket(req);
    if (refuse) {
      const [code, reason] = refuse;
      client.onopen = () => { try { client.close(code, reason); } catch { /* gone */ } };
      return response;
    }
    // Seconds of audio relayed in this session, estimated from message sizes
    // (base64 PCM: 16 kHz in, 24 kHz out, 16-bit mono).
    let used = 0, recorded = 0;
    const flush = () => {
      if (!who || used - recorded < 0.5) return;
      record(who, used - recorded, 0, 0);
      recorded = used;
    };
    const count = (seconds: number) => {
      if (!who) return;
      used += seconds;
      if (used - recorded >= 15) flush();
      if (used >= who.voice_left) closeBoth(4002, "daily voice limit reached");
    };
    const upstream = new WebSocket(`${UPSTREAM.replace(/^http/, "ws")}${LIVE_PATH}?key=${encodeURIComponent(KEY)}`);
    const queue: (string | ArrayBuffer)[] = [];
    let checked = false;
    const closeBoth = (code = 1000, reason = "") => {
      flush();
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
      if (typeof ev.data === "string" && ev.data.length > 200 && ev.data.includes("ealtimeInput")) {
        count(ev.data.length * 0.75 / 32000); // the learner's microphone
      }
      if (upstream.readyState === WebSocket.OPEN) upstream.send(ev.data);
      else queue.push(ev.data);
    };
    upstream.onopen = () => { for (const m of queue.splice(0)) upstream.send(m); };
    upstream.onmessage = (ev) => {
      if (client.readyState === WebSocket.OPEN) client.send(ev.data);
      const d = ev.data;
      const size = typeof d === "string" ? d.length : d instanceof ArrayBuffer ? d.byteLength : (d as Blob).size ?? 0;
      if (size > 2000) count(size * 0.75 / 48000); // Saurus's voice (transcripts and tool calls are smaller)
    };
    upstream.onclose = (ev) => closeBoth(ev.code === 1005 ? 1000 : ev.code, ev.reason);
    upstream.onerror = () => closeBoth(1011, "Gemini connection failed");
    client.onclose = () => closeBoth();
    return response;
  }

  // Page translation: generateContent, passed through.
  const m = path.match(/^\/v1beta\/models\/([^/:]+):generateContent$/);
  if (m && req.method === "POST") {
    if (!allowedModel(m[1])) return json(403, { error: { message: `model not allowed: ${m[1]}` } }, origin);
    if (Number(req.headers.get("content-length") ?? 0) > 300_000) return json(413, { error: { message: "request too large" } }, origin);
    const body = await req.text();
    if (body.length > 300_000) return json(413, { error: { message: "request too large" } }, origin);
    if (!OPEN) {
      let who: Pass | null = null;
      try { who = await passOf(req.headers.get("x-saurus-ticket")); }
      catch (e) { console.error("usage check failed:", e); return json(503, { error: { message: "usage check unavailable" } }, origin); }
      if (!who) return json(401, { error: { message: "Please sign in to Saurus to continue" } }, origin);
      const page = req.headers.get("x-saurus-page") === "1";
      if (who.calls_left <= 0 || (page && who.pages_left <= 0)) {
        return json(429, { error: { message: "You've used today's free page translations. They're back tomorrow", status: "SAURUS_LIMIT" } }, origin);
      }
      record(who, 0, page ? 1 : 0, 1);
    }
    let res!: Response;
    for (const key of TEXT_KEYS) {
      res = await fetch(`${UPSTREAM}${path}?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (res.status !== 429) break; // rate-limited: try the next key
    }
    return new Response(res.body, { status: res.status, headers: { ...cors(origin), "Content-Type": "application/json" } });
  }

  return json(404, { error: { message: "not found" } }, origin);
});
