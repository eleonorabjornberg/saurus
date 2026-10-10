# Saurus

**Account setup:** see [AUTH_SETUP.md](AUTH_SETUP.md) for the new extension
sign-up/login flow, persistent sessions, migration approval requirements, and
the exact test/deployment checklist. The account migration has not been deployed.

**A patient, fluent friend who lives in your browser, knows what you're
reading, remembers what you get wrong, and meets you where you're at.**

**Live demo:** https://eleonorabjornberg.github.io/saurus/ (open it, press
**Alt+S**, or ⌥S on a Mac)

## The user and the problem

People preparing for something real, like a language exam, a move abroad or a
new job, need to *speak* the language about things they actually care about.
Apps stay too basic, you never hold a real conversation, and private lessons
cost a fortune. Meanwhile hours go into reading news, newsletters and work
documents in your own language: dead time that could be practice.

This started with SIELE (Spanish exam) prep: switching every AI tool to
Spanish, having Gemini Live quiz me on exam topics. It worked, but nothing
remembered my mistakes or knew what I was reading.

## What Saurus does

Press a shortcut on any page and a small dino appears.

1. **Translates the page you're reading, at your level.** A beginner sees a
   few key words swapped in; the share grows until the page is fully in
   the target language. The original is always one press away.
2. **Talks with you about it.** Push-to-talk voice (or typing when muted).
   It speaks first, asks about the substance of the page, and answers in
   the target language at your level.
3. **Press any word** and it explains it in context; it highlights the
   words you struggle with.
4. **Remembers you** per language: level, struggle words, last session. It
   suggests a short drill when the same mistake repeats.
5. **Grows with you.** The avatar's age *is* your level (hatchling,
   juvenile, adult, elder), and it changes costume per language: beret and
   baguette for French, lederhosen for German, flamenco dress and fan for
   Spanish, with dedicated Swedish artwork as well.

No new app, no lessons to schedule: it rides along with what you already read.

## How it's built

- **Front end (this repo):** one plain-JavaScript file, `saurus.js`, injected
  into any page in a shadow DOM, as a Chrome extension (Manifest V3) or a
  `<script>` tag. It handles mic capture (16 kHz PCM), gapless playback (24 kHz
  PCM), in-place translation, highlights and avatar states.
- **Agent:** Gemini Live for real-time voice with built-in transcripts of
  both sides, calling tools while it talks (highlight a word, log a
  struggle, level up). Gemini Flash with structured output picks which
  words to swap for the page translation.
- **Memory:** the teammate Supabase flow remains authoritative for per-language
  levels, struggles, and next-action practice. The optional local Fastify server
  can add vocabulary mastery and recall evaluation when
  `enableFastifyPractice` is explicitly enabled.
- The front end talks to the backend only through `window.SaurusBackend`
  (interface below). `backend-mock.js` implements it offline with scripted
  replies, which is what the live demo runs on.

| File | What it is |
|---|---|
| `saurus.js` | The whole widget. One `<script>` tag injects it into any page (shadow DOM). |
| `config.js` | Settings: Gemini API key (empty in git, never commit one), proxy URL, models, starting language. |
| `background.js` | MV3 service worker and allow-listed bridge to the local API. |
| `backend.js` | Composes server learning features with the existing voice backend. |
| `backend-gemini.js` | The live backend: Gemini Live voice + Gemini Flash translation. Used when `config.js` has a key or `apiBase`. |
| `backend-mock.js` | A fake `SaurusBackend` with scripted replies and a synthetic voice. Used when nothing above is configured. |
| `demo.html` | An article page that loads both. |
| `manifest.json` | Chrome extension (Manifest V3) that injects both as content scripts. |
| `assets/` | Optional avatar art: `saurus-{fr,de,es,sv}-{1..4}.png`. Missing files fall back to the built-in SVG. |

## Run the complete local demo

```sh
cp backend/.env.example backend/.env
# Fill backend/.env with GEMINI_API_KEY, SUPABASE_URL and SUPABASE_SECRET_KEY.
npm --prefix backend install
npm --prefix backend start
```

Then open `chrome://extensions`, enable Developer mode, choose **Load
unpacked**, and select this repository. Reload the extension after code
changes, refresh a normal webpage, and press **Alt+S**. The demo learner must
be a Supabase `learner_profiles` row with `target_language = Spanish` and
`cefr_level = A1`.

The extension calls only `http://127.0.0.1:3000` through its MV3 service
worker. Verify the server separately with `curl http://127.0.0.1:3000/health`.
When Spanish is selected and stored vocabulary needs practice, Saurus shows an
optional typed recall prompt. Its answer is evaluated and persisted by Fastify.
Clicking a translated word and normal spoken conversation continue through the
existing Gemini Live backend.

For the standalone mock page (no server integration guarantees):

```sh
python3 -m http.server 8000
# open http://localhost:8000/demo.html
```

As an extension: `chrome://extensions` → Developer mode → **Load unpacked** →
pick this folder. Press Alt+S on any page.

## Use the real Gemini backend

Load order: `config.js` → `supabase-config.js` → `backend-gemini.js` →
`backend-mock.js` → `backend.js` → `saurus.js`. `backend.js` captures and delegates to the voice
backend, then adds the server-backed learning operations. This ordering is
intentional: do not move `backend.js` ahead of Gemini Live.

Do not place a private Gemini key in `config.js` or `supabase-config.js`.
`supabase-config.js` selects the `gemini` Edge Function and contains only the
browser-safe project URL and publishable key. The function proxies two paths:

- `POST /v1beta/models/{model}:generateContent` (page translation)
- the WebSocket `/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent` (Gemini Live)

It checks the project publishable key, restricts models, applies CORS, bounds
request/queue sizes, and keeps the WebSocket worker alive. The browser reconnects
up to three times and carries recent conversation text into the new session.

Deploy it to the project referenced by `supabase/config.toml`:

```sh
supabase login
supabase link --project-ref hwsiplosbvlsktxxsmxd
# Put GEMINI_API_KEY, GEMINI_MODELS and (optionally) ALLOWED_ORIGINS in
# supabase/functions/.env, which is ignored by git, then upload them:
supabase secrets set --env-file supabase/functions/.env
supabase secrets list
supabase functions deploy gemini --no-verify-jwt
```

`GEMINI_API_KEY` is required. `GEMINI_MODELS` and `ALLOWED_ORIGINS` are
optional; use `GEMINI_MODELS=gemini-3.8-live,gemini-3.8-flash`. For a fixed
demo site, set `ALLOWED_ORIGINS=https://your-demo.example`; omit it only when
Saurus must run across arbitrary pages. WebSocket clients cannot attach the normal authorization header, so
JWT verification is disabled for this one function; the function validates the
browser-safe project publishable key itself. After deploying, reload the
extension in `chrome://extensions` and refresh the page.

What `backend-gemini.js` does:
- **Voice:** one Gemini Live session per summon, with push-to-talk (manual
  activity detection), transcripts of both sides, and the page text in the
  system instructions. Tools the model calls while talking: `highlight`,
  `celebrate`, `level_up`, `level_down`, `offer_drill`.
- **Translation:** Gemini Flash with structured JSON output, level 1 (a few
  swapped words) to level 4 (natural full translation).
- **Memory:** level per language and the last language, in `localStorage`
  (move to Supabase to share across devices).

## Controls

| Key / action | Does |
|---|---|
| **Alt+S** | Summon / dismiss Saurus. Dismissing calls `stop()` and restores the page. |
| Hold the mic button, or hold **Space** | Push to talk (Space is ignored while a text field is focused). |
| Mute button | No mic, no sound; your bubble becomes a text box (Enter sends). |
| Click a word on the page | `sendContext({type: "word_pressed", word, sentence})` |
| Press and hold a translated paragraph | Shows the original text while held. |
| Drag the avatar | Snaps to the nearest corner; remembered in `localStorage`. |
| Click a bubble | Expands / collapses it. Scroll the bubbles to see older ones. |
| Alt+↑ / Alt+↓ | Demo: level up / down (`SaurusBackend.demo.levelUp/levelDown`). |
| Alt+D | Demo: drill offer (`SaurusBackend.demo.drillOffer`). |
| Alt+1 / 2 / 3 / 4 | Switch to French / German / Spanish / Swedish (`setLanguage`). |

Mock only: typing `/error` makes the mock emit an `error` event.

## Tests

```sh
npm test                    # extension/service-worker contracts
npm --prefix backend test   # Fastify, domain, and Gemini service tests
npm run test:all            # both suites
```

---

## Backend interface (for the backend)

`saurus.js` never calls an API. It only uses `window.SaurusBackend`, which
must exist by the time the user presses Alt+S.

### Adding the real backend

1. Put your code in `backend.js` (replace the placeholder). It must set
   `window.SaurusBackend` **synchronously** when the file runs; connect to
   Supabase / Gemini later, inside `start()`.
2. That's it: `demo.html` and `manifest.json` already load `backend.js`
   before `backend-mock.js`, and the mock only installs itself when
   `window.SaurusBackend` is not set yet. No other file needs to change.
3. Extra files (for example the Supabase client): Chrome extensions can't
   load scripts from a CDN, so save them in the repo (e.g.
   `vendor/supabase.js`, the UMD build from `@supabase/supabase-js`) and add
   them **before** `backend.js` in both `demo.html` and
   `manifest.json` → `content_scripts.js`.
4. Supabase Edge Functions are called from the page's origin, so they must
   answer `OPTIONS` and send `Access-Control-Allow-Origin: *` (plus
   `Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type`).

To push it (from the repo folder):

```sh
git pull origin main
git add backend.js            # plus vendor/ or anything else you added
git commit -m "Add real Supabase backend"
git push origin main
```

### Methods

```js
window.SaurusBackend = {
  start({ pageUrl, pageText })            // -> Promise<{ language, level }>
  translatePage({ blocks, language, level }) // -> Promise<[{ id, html }]>
  sendAudio(pcm)                          // Int16Array, 16 kHz mono
  endOfSpeech()
  sendText(text)
  sendContext({ type: "word_pressed", word, sentence })
  setLanguage(code)                       // "fr" | "de" | "es" | "sv"
  stop()
  on(eventName, handler)

  // optional, demo shortcuts only
  demo: { levelUp(), levelDown(), drillOffer() }
}
```

| Method | Called when | Details |
|---|---|---|
| `start({pageUrl, pageText})` | Alt+S | `pageText` is the article text (paragraphs, headings, list items; max 20 000 chars). Resolve with the user's current `{language, level}`. If it rejects, the error shows in Saurus's bubble. |
| `translatePage({blocks, language, level})` | After `start()` resolves, and again after every `language` or `level` event | `blocks` is `[{id, text}]`, plain text. Resolve with `[{id, html}]` for the blocks you want changed (omit or echo the rest). `html` may contain only text and `<mark>…</mark>` around target-language words; any other tag is stripped. Escape `&`, `<`, `>`. |
| `sendAudio(pcm)` | Every ~40 ms while the talk button or Space is held | `Int16Array`, 16 kHz, mono, signed 16-bit. If Saurus is speaking, the front end has already stopped playback: treat the first chunk as a barge-in and stop sending audio. |
| `endOfSpeech()` | Button / Space released | Only called if at least one chunk was sent. |
| `sendText(text)` | Muted mode, Enter; also the drill buttons send `"Yes"` / `"Not now"` | The front end shows the user's bubble itself; **do not** echo typed text back as a `transcript`. |
| `sendContext({type, word, sentence})` | A word on the page is clicked | `sentence` is the sentence around the word, as currently shown (translated or not). |
| `setLanguage(code)` | Alt+1/2/3/4 | Reply with a `language` event (and a `level` event for that language). |
| `stop()` | Alt+S (dismiss) | Close the session. Events emitted after this are ignored. |
| `on(name, handler)` | Once per backend object | Keep a list of handlers per event. No `off` needed. |
| `demo.*` | Alt+↑, Alt+↓, Alt+D | Optional. If missing, Saurus says the shortcut isn't supported. Fire the same events you would normally (`level` + `celebrate`, `drill_offer`). |

### Events

| Event | Payload | Front end does |
|---|---|---|
| `state` | `"idle" \| "listening" \| "thinking" \| "speaking"` | Avatar animation. |
| `transcript` | `{who: "saurus" \| "user", text, final}` | `text` is the **whole utterance so far**, not a delta. Non-final updates the live bubble; `final: true` closes it, so the next transcript starts a new bubble. |
| `audio` | `Int16Array` (or `ArrayBuffer`), 24 kHz mono | Played gaplessly, back-to-back. Dropped while muted or while the user is talking. |
| `highlight` | `{text}` | Outlines the first match on the page (whole word preferred, case-insensitive). One highlight at a time. |
| `level` | `{language, level}` (1 hatchling, 2 juvenile, 3 adult, 4 elder) | Avatar size and details; page re-translated at the new level. Ignored if `language` isn't the current one. |
| `language` | `{code}` | Costume-change puff, then page re-translated. |
| `drill_offer` | `{topic}` | Saurus bubble "Want a quick drill on {topic}?" with **Yes** / **Not now**, sent back via `sendText`. |
| `celebrate` | none | Hop. |
| `error` | `{message}` | Shown in Saurus's bubble; the UI switches to muted (typing) mode. |

### Expected flow

```
Alt+S → start() → {language, level} → translatePage() → [{id, html}]
        backend speaks first: state "speaking", transcript…, audio…, state "idle"
Hold  → state "listening", user transcript (final: false)…
Release → endOfSpeech() → user transcript (final: true) → "thinking" → "speaking" …
```

## Notes

- Everything renders inside a shadow DOM on a `<saurus-widget>` element. The
  only things added to the page itself are a `<style id="saurus-page-style">`
  (for translated words and highlights), the Google Fonts link for the
  mock-up's fonts, and the `data-saurus-id` / wrapper spans on translated
  blocks, all removed on dismiss.
- `prefers-reduced-motion`: no breathing, bounce, hop, bob or puff; the
  costume swaps instantly.
- Avatar art: drop `assets/saurus-de-3.png` (etc.) in and it replaces the SVG
  for that language and level. Missing files show as 404s in the console;
  that's expected.
