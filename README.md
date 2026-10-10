# Saurus

A language-learning tutor that lives in the browser as a small floating
avatar. This repo is the **front end**: it runs fully on its own against a
mock backend, and talks to the real backend through one object,
`window.SaurusBackend`.

| File | What it is |
|---|---|
| `saurus.js` | The whole widget. One `<script>` tag injects it into any page (shadow DOM). |
| `backend-mock.js` | A fake `SaurusBackend` with scripted replies, timers and a synthetic voice. |
| `demo.html` | An article page that loads both. |
| `manifest.json` | Chrome extension (Manifest V3) that injects both as content scripts. |
| `assets/` | Optional avatar art: `saurus-{fr,de,es}-{1..4}.png`. Missing files fall back to the built-in SVG. |

## Run it

```sh
python3 -m http.server 8000
# open http://localhost:8000/demo.html and press Alt+S
```

Use `localhost` (not `file://`) so the browser allows the microphone.

As an extension: `chrome://extensions` → Developer mode → **Load unpacked** →
pick this folder. Press Alt+S on any page.

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
| Alt+1 / 2 / 3 | Switch to French / German / Spanish (`setLanguage`). |

Mock only: typing `/error` makes the mock emit an `error` event.

---

## Backend interface (for the backend)

`saurus.js` never calls an API. It only uses `window.SaurusBackend`, which
must exist by the time the user presses Alt+S. To plug in the real backend,
load your script instead of `backend-mock.js` (in `demo.html` and in
`manifest.json` → `content_scripts.js`). In the extension it runs as a
content script in the same isolated world as `saurus.js`.

### Methods

```js
window.SaurusBackend = {
  start({ pageUrl, pageText })            // -> Promise<{ language, level }>
  translatePage({ blocks, language, level }) // -> Promise<[{ id, html }]>
  sendAudio(pcm)                          // Int16Array, 16 kHz mono
  endOfSpeech()
  sendText(text)
  sendContext({ type: "word_pressed", word, sentence })
  setLanguage(code)                       // "fr" | "de" | "es"
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
| `setLanguage(code)` | Alt+1/2/3 | Reply with a `language` event (and a `level` event for that language). |
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
