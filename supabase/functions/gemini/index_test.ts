// Tests for the free-tier checks, run against local stand-ins for Supabase
// and Gemini (no real services, no real keys):
//   deno test --allow-net --allow-env supabase/functions/gemini/index_test.ts
import { assertEquals } from "jsr:@std/assert@1";

const MOCK = 8791;
const LIVE = "/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
type Left = { user_id: string; voice_left: number; pages_left: number; calls_left: number };
const users: Record<string, Left> = {};
const passes: Record<string, string> = {}; // ticket -> user
const added: { p_user: string; p_voice: number; p_pages: number; p_calls: number }[] = [];
let checks = 0;
const drain = new Set<string>(); // users whose other sessions use up the day on the next add
function user(ticket: string, left: Partial<Left> = {}) {
  users[ticket] = { user_id: ticket, voice_left: 300, pages_left: 30, calls_left: 300, ...left };
  passes[ticket] = ticket;
}

// Supabase RPCs and Gemini (REST and Live) in one stand-in.
const mock = Deno.serve({ port: MOCK, onListen() {} }, async (req) => {
  const path = new URL(req.url).pathname;
  if (path === "/rest/v1/rpc/saurus_usage_check") {
    checks++;
    const { p_ticket } = await req.json();
    return Response.json(passes[p_ticket] ? { ...users[passes[p_ticket]] } : null);
  }
  if (path === "/rest/v1/rpc/saurus_usage_add") {
    const a = await req.json();
    added.push(a);
    const u = users[a.p_user];
    if (drain.has(a.p_user)) u.voice_left = a.p_voice;
    u.voice_left -= a.p_voice; u.pages_left -= a.p_pages; u.calls_left -= a.p_calls;
    return Response.json({ ...u });
  }
  if (path.endsWith(":generateContent")) return Response.json({ candidates: [] });
  if (path === LIVE) {
    const { socket, response } = Deno.upgradeWebSocket(req);
    socket.onmessage = (ev) => {
      if (String(ev.data).includes("setup")) socket.send(JSON.stringify({ setupComplete: {} }));
      else socket.send("x".repeat(96_000)); // about 1.5 s of Saurus's voice
    };
    return response;
  }
  return new Response("not found", { status: 404 });
});

Deno.env.set("GEMINI_API_KEY", "test");
Deno.env.set("GEMINI_UPSTREAM", `http://localhost:${MOCK}`);
Deno.env.set("SUPABASE_URL", `http://localhost:${MOCK}`);
Deno.env.set("SAURUS_SERVICE_KEY", "test");
await import("./index.ts"); // serves on :8000
const FN = "http://localhost:8000/gemini";

const text = (ticket?: string, page = false) => fetch(`${FN}/v1beta/models/gemini-3.5-flash-lite:generateContent`, {
  method: "POST",
  headers: { ...(ticket ? { "x-saurus-ticket": ticket } : {}), ...(page ? { "x-saurus-page": "1" } : {}) },
  body: "{}",
}).then(async (r) => ({ status: r.status, body: await r.json() }));

// Opens a Live session, sends `speak` turns, resolves to the close code.
function live(ticket: string | null, speak = 0, modalities: unknown = ["AUDIO"]): Promise<number> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:8000/gemini${LIVE}${ticket ? "?ticket=" + ticket : ""}`);
    ws.onopen = () => ws.send(JSON.stringify({ setup: { model: "models/gemini-3.8-live", generationConfig: { responseModalities: modalities } } }));
    ws.onmessage = (ev) => {
      if (String(ev.data).includes("setupComplete")) {
        for (let i = 0; i < speak; i++) {
          setTimeout(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ clientContent: { turns: [], turnComplete: true } })), i * 20);
        }
        if (!speak) ws.close(1000);
      }
    };
    ws.onclose = (ev) => resolve(ev.code);
    setTimeout(() => { ws.close(1000); }, 3000);
  });
}
const settle = () => new Promise((r) => setTimeout(r, 100));

Deno.test({ name: "text: no pass is 401, a pass counts one call", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  user("t1");
  assertEquals((await text()).status, 401);
  assertEquals((await text("unknown")).status, 401);
  assertEquals((await text("t1")).status, 200);
  await settle();
  assertEquals(added.filter((a) => a.p_user === "t1"), [{ p_user: "t1", p_voice: 0, p_pages: 0, p_calls: 1 }]);
} });

Deno.test({ name: "text: page limit refuses pages only, with SAURUS_LIMIT", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  user("t2", { pages_left: 0 });
  const r = await text("t2", true);
  assertEquals([r.status, r.body.error.status], [429, "SAURUS_LIMIT"]);
  assertEquals((await text("t2")).status, 200);
  user("t3", { calls_left: 0 });
  assertEquals((await text("t3")).status, 429);
} });

Deno.test({ name: "text: a pass is looked up once for a burst, and counted locally", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  user("t4", { pages_left: 1 });
  const before = checks;
  assertEquals((await text("t4", true)).status, 200);
  assertEquals((await text("t4")).status, 200);
  assertEquals((await text("t4", true)).status, 429); // the cached copy knows the page was used
  assertEquals(checks - before, 1);
} });

Deno.test({ name: "voice: refusals close with 4001 / 4002 / 1008", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  user("v1", { voice_left: 0 });
  user("v2");
  assertEquals(await live(null), 4001);
  assertEquals(await live("v1"), 4002);
  assertEquals(await live("v2", 0, ["TEXT"]), 1008);
  assertEquals([1000, 1005].includes(await live("v2")), true); // a normal close
} });

Deno.test({ name: "voice: closes at the day's allowance", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  user("v3", { voice_left: 4 });
  assertEquals(await live("v3", 5), 4002);
  await settle();
  const spent = added.filter((a) => a.p_user === "v3").reduce((s, a) => s + a.p_voice, 0);
  assertEquals(spent > 4 && spent < 7, true);
} });

Deno.test({ name: "voice: stops when another session used the allowance", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  user("v4", { voice_left: 100 });
  drain.add("v4"); // the user's other tab spends the rest meanwhile
  assertEquals(await live("v4", 30), 4002); // ~45 s of audio; the first flush is at 15 s
  const spent = added.filter((a) => a.p_user === "v4").reduce((s, a) => s + a.p_voice, 0);
  assertEquals(spent < 20, true);
  await mock.shutdown();
} });
