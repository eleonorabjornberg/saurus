const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("manifest loads voice before the composing API facade", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.service_worker, "background.js");
  assert.deepEqual(manifest.host_permissions, ["http://127.0.0.1:3000/*", "https://hwsiplosbvlsktxxsmxd.supabase.co/*"]);
  assert.deepEqual(manifest.content_scripts[0].js, [
    "config.js", "supabase-config.js", "auth-bridge.js", "backend-gemini.js", "backend-mock.js", "backend.js", "saurus.js",
  ]);
});

test("public extension config contains no secret", () => {
  const config = fs.readFileSync(path.join(__dirname, "..", "config.js"), "utf8");
  assert.match(config, /geminiApiKey:\s*""/);
  assert.match(config, /language:\s*"es"/);
  assert.match(config, /enableFastifyPractice:\s*false/);
  assert.doesNotMatch(config, /SUPABASE_(?:SECRET|SERVICE_ROLE)/);
});

test("live, mock, and UI expose French, German, Spanish, and Swedish", () => {
  const root = path.join(__dirname, "..");
  const live = fs.readFileSync(path.join(root, "backend-gemini.js"), "utf8");
  const mock = fs.readFileSync(path.join(root, "backend-mock.js"), "utf8");
  const ui = fs.readFileSync(path.join(root, "saurus.js"), "utf8");
  for (const [code, name] of [["fr", "French"], ["de", "German"], ["es", "Spanish"], ["sv", "Swedish"]]) {
    assert.match(live, new RegExp(`${code}: "${name}"`));
    assert.match(mock, new RegExp(`${code}: "${name}"`));
    assert.match(ui, new RegExp(`${code}: "${name}"`));
  }
  assert.match(ui, /ArrowUp:\s*\(\) => demo\("levelUp"\)/);
  assert.match(ui, /ArrowDown:\s*\(\) => demo\("levelDown"\)/);
  assert.match(ui, /Digit4:\s*\(\) => call\("setLanguage", "sv"\)/);
  assert.match(ui, /e\.altKey && !e\.ctrlKey && !e\.metaKey/);
  assert.match(ui, /e\.code === "KeyS"/);
});

test("every language and age has authoritative artwork", () => {
  const root = path.join(__dirname, "..");
  for (const language of ["fr", "de", "es", "sv"]) {
    for (const level of [1, 2, 3, 4]) {
      assert.equal(fs.existsSync(path.join(root, "assets", `saurus-${language}-${level}.png`)), true);
    }
  }
  const ui = fs.readFileSync(path.join(root, "saurus.js"), "utf8");
  assert.match(ui, /assets\/saurus-\$\{l\}-\$\{lv\}\$\{suffix\}\.png/);
});

test("Supabase Gemini proxy is selected without exposing the private Gemini key", () => {
  const root = path.join(__dirname, "..");
  const supabaseConfig = fs.readFileSync(path.join(root, "supabase-config.js"), "utf8");
  const live = fs.readFileSync(path.join(root, "backend-gemini.js"), "utf8");
  assert.match(supabaseConfig, /gemini:\s*true/);
  assert.match(live, /\/functions\/v1\/gemini/);
  assert.match(live, /apikey=\$\{encodeURIComponent\(PROXY_KEY\)\}/);
  assert.match(live, /PROXY_KEY \? \{ apikey: PROXY_KEY \}/);
  assert.doesNotMatch(supabaseConfig, /GEMINI_API_KEY\s*[:=]\s*["'][^"']+/);
});

test("Gemini Edge Function enforces its proxy contract and retains WebSockets", () => {
  const root = path.join(__dirname, "..");
  const edge = fs.readFileSync(path.join(root, "supabase/functions/gemini/index.ts"), "utf8");
  const live = fs.readFileSync(path.join(root, "backend-gemini.js"), "utf8");
  assert.match(edge, /PUBLIC_KEYS\.has\(suppliedKey\)/);
  assert.match(edge, /ALLOWED_ORIGINS/);
  assert.match(edge, /allowedModel/);
  assert.match(edge, /EdgeRuntime\?\.waitUntil\(lifetime\)/);
  assert.match(edge, /MAX_BODY_BYTES/);
  assert.match(live, /reconnects >= 3/);
  assert.match(live, /Conversation so far/);
});
