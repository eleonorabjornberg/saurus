/*
 * saurus.js — the Saurus language-tutor widget.
 *
 * Drop into any page with one <script src="saurus.js"></script>. Everything
 * renders inside a shadow DOM. The only link to the backend is the object
 * window.SaurusBackend (see README.md). Alt+S summons / dismisses.
 */
(function () {
  "use strict";
  // One Saurus per page, even when both the page and the extension load it
  // (they run in separate JS worlds, so the flag lives on the shared DOM).
  const root = document.documentElement;
  if (window.__saurusLoaded || root.hasAttribute("data-saurus-loaded")) return;
  window.__saurusLoaded = true;
  root.setAttribute("data-saurus-loaded", "");

  // ---------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------
  const LANG_NAME = { fr: "French", de: "German", es: "Spanish", sv: "Swedish", hi: "Hindi" };
  const LEVEL_NAME = { 1: "hatchling", 2: "juvenile", 3: "adult", 4: "elder" };
  const LEVEL_SIZE = { 1: 80, 2: 92, 3: 104, 4: 112 }; // px: desktop-pet sized, grows with level
  const CORNER_KEY = "saurus.corner";
  const FONT_URL = "https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,800&family=DM+Mono:wght@400;500&display=swap";
  const BLOCK_SEL = "p, h1, h2, h3, h4, h5, h6, li";
  const SKIP_SEL = "nav, aside, footer, form, button, input, textarea, select, label, script, style, noscript, pre, code, svg, [contenteditable=''], [contenteditable='true'], [aria-hidden='true'], saurus-widget";
  const PEEK_MS = 450;
  const calm = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // Where to load assets/ from: the extension package, or next to this script.
  const SCRIPT_SRC = document.currentScript && document.currentScript.src;
  function assetUrl(path) {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id && chrome.runtime.getURL) {
        return chrome.runtime.getURL(path);
      }
    } catch (_) { /* not an extension */ }
    return SCRIPT_SRC ? new URL(path, SCRIPT_SRC).href : path;
  }

  // Trusted Types-safe innerHTML for our own static markup.
  let ttPolicy = null;
  try {
    if (window.trustedTypes && trustedTypes.createPolicy) {
      ttPolicy = trustedTypes.createPolicy("saurus", { createHTML: (s) => s });
    }
  } catch (_) { /* policy name not allowed; fall back to strings */ }
  function setHTML(el, html) { el.innerHTML = ttPolicy ? ttPolicy.createHTML(html) : html; }

  // ---------------------------------------------------------------------
  // Art (from saurus-pitch.html)
  // ---------------------------------------------------------------------
  // The Saurus brontosaurus (redrawn from the reference art), facing right.
  // Costumes from saurus-pitch.html, refitted to this silhouette.
  function avatarSVG(lang, level) {
    const costume = {
      fr: `<g class="costume"><ellipse class="d-beret" cx="45" cy="5" rx="13" ry="5" transform="rotate(-10 45 5)"/><circle class="d-beret" cx="45" cy="-1" r="2.4"/>
        <g transform="rotate(-22 66 82)"><rect class="d-bread" x="46" y="78" width="40" height="9" rx="4.5"/>
        <path class="d-score" d="M55 80 l3 5 M64 80 l3 5 M73 80 l3 5"/></g></g>`,
      de: `<g class="costume"><path class="d-strap" d="M29 64 L32 88 M50 59 L49 90"/><path class="d-leder" d="M21 78 Q56 94 90 79 L87 99 L72 100 Q60 92 46 100 L31 98 Q23 90 21 78 Z"/><circle class="d-dot" cx="32" cy="88" r="1.6"/><circle class="d-dot" cx="49" cy="90" r="1.6"/>
        <ellipse class="d-hat" cx="45" cy="8" rx="16" ry="3.6"/><path class="d-hat" d="M36 8 Q36 -5 45 -5 Q54 -5 54 8 Z"/><path class="d-feather" d="M52 -1 L60 -10"/></g>`,
      es: `<g class="costume"><path class="d-dress" d="M22 78 Q56 64 90 78 L95 101 q-6 -5 -12 1 q-6 -6 -12 0 q-6 -6 -12 0 q-6 -6 -12 0 q-6 -6 -12 0 q-6 -5 -12 -1 Z"/>
        <circle class="d-dot" cx="40" cy="84" r="1.8"/><circle class="d-dot" cx="56" cy="80" r="1.8"/><circle class="d-dot" cx="72" cy="86" r="1.8"/><circle class="d-dot" cx="50" cy="93" r="1.8"/><circle class="d-dot" cx="80" cy="94" r="1.8"/>
        <path class="d-fan" d="M24 82 L4 68 A25 25 0 0 1 20 57 Z"/><path class="d-rib" d="M24 82 L9 61 M24 82 L14 58"/>
        <circle class="d-dress" cx="34" cy="7" r="5.5"/><circle class="d-fan" cx="34" cy="7" r="2"/></g>`,
      sv: `<g class="costume"><path class="d-sweater" d="M21 72 Q56 54 92 74 L90 93 Q56 101 22 92 Z"/>
        <path class="d-zig" d="M27 82 l5 -4 l5 4 l5 -4 l5 4 l5 -4 l5 4 l5 -4 l5 4 l5 -4 l5 4 l5 -4 l5 4"/>
        <path class="d-dala" d="M6 94 L8 80 Q4 76 6 72 L10 70 L12 64 L16 68 Q22 70 22 76 L24 94 L19 94 L17 84 L12 84 L11 94 Z"/>
        <path class="d-leaf" d="M32 9 Q45 -1 58 9"/><circle class="d-fl1" cx="33" cy="9" r="3"/><circle class="d-fl2" cx="39" cy="4.5" r="3"/>
        <circle class="d-fl3" cx="45.5" cy="3" r="3"/><circle class="d-fl1" cx="52" cy="4.5" r="3"/><circle class="d-fl2" cx="57.5" cy="9" r="3"/></g>`,
      hi: `<g class="costume"><path class="d-kurta" d="M21 70 Q56 54 92 74 L91 96 Q56 103 22 95 Z"/>
        <path class="d-trim" d="M24 88 Q56 96 90 89"/>
        <g class="d-garland"><circle cx="24" cy="62" r="3.4"/><circle cx="27" cy="68" r="3.4"/><circle cx="31" cy="73" r="3.4"/>
        <circle cx="36" cy="77" r="3.4"/><circle cx="41" cy="73" r="3.4"/><circle cx="43" cy="67" r="3.4"/><circle cx="42" cy="61" r="3.4"/></g></g>`,
    }[lang] || "";
    const specs = level >= 4
      ? `<g><circle class="d-specs" cx="40" cy="16" r="5.5"/><line class="d-specs" x1="34.5" y1="15" x2="27" y2="12"/></g>` : "";
    const egg = level <= 1
      ? `<path class="d-shell" d="M16 94 L24 86 L32 94 L40 86 L48 94 L56 86 L64 94 L72 86 L80 94 L88 86 L96 94 Q96 117 56 117 Q16 117 16 94 Z"/>` : "";
    return `<svg class="dino" viewBox="0 -13 120 132" aria-hidden="true">
      <rect class="d-leg2" x="24" y="92" width="9" height="17" rx="4"/><rect class="d-leg2" x="66" y="92" width="9" height="17" rx="4"/>
      <path class="d-body" d="M30 22 C30 10 44 5 52 9 C61 13 61 26 50 28 C44 29 40 30 38 34 L37 66 C42 60 52 57 62 57 C76 57 84 67 90 73 C96 71 102 63 104 54 C107 70 103 86 88 91 L87 104 Q87 110 81 110 L78 110 Q72 110 72 104 L72 99 L46 99 L46 104 Q46 110 40 110 L37 110 Q31 110 31 104 L31 97 C22 91 20 80 20 66 L20 36 C20 28 24 24 30 22 Z"/>
      <path class="d-belly" d="M46 99 Q59 90 72 99 Z"/>
      <circle class="d-spot" cx="58" cy="66" r="2.6"/><circle class="d-spot" cx="65" cy="63.5" r="2.2"/><circle class="d-spot" cx="72" cy="66" r="4.6"/>
      <circle class="d-spot" cx="80" cy="66" r="2.2"/><circle class="d-spot" cx="70" cy="75" r="3.4"/><circle class="d-spot" cx="78" cy="73" r="2.2"/>
      <g class="eye"><circle class="d-pupil" cx="40" cy="16" r="1.7"/></g>
      <path class="d-line" d="M47 15 Q50 12 53 15"/>
      <g class="mouth"><path class="d-line" d="M43 21 Q46 23.5 49 21"/><ellipse class="d-mouth" cx="46" cy="22.5" rx="2.6" ry="2"/></g>
      ${specs}${costume}${egg}
    </svg>`;
  }

  const ICON_MUTE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"/><path d="M17.5 3.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>`;
  const ICON_MIC = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="10" x2="4" y2="14"/><line x1="8" y1="7" x2="8" y2="17"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="16" y1="7" x2="16" y2="17"/><line x1="20" y1="10" x2="20" y2="14"/></svg>`;
  const PUFF = `<i style="--x:0%;--y:0%"></i><i style="--x:-55%;--y:-35%"></i><i style="--x:55%;--y:-35%"></i><i style="--x:-60%;--y:30%"></i><i style="--x:60%;--y:30%"></i><i style="--x:0%;--y:-60%"></i><i style="--x:0%;--y:55%"></i>`;

  // ---------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------
  const TOKENS_LIGHT = `--bg:#EEF3EC; --surface:#FFFFFF; --fg:#14251C; --muted:#56695D; --line:#C9D6CC;
    --accent:#1F7A4D; --accent-ink:#FFFFFF; --belly:#BFE3CB; --mark:#FFDD55; --mark-ink:#2A2200;
    --dino:#8CC8F2; --dino-line:#2D5E9E; --dino-spot:#5D9FDB;
    --glass:rgba(255,255,255,.94); --glass-u:rgba(242,247,251,.96); --glass-edge:rgba(255,255,255,.7); --glass-shadow:rgba(20,37,60,.22);
    --beret:#C8322B; --bread:#D9A24A; --shell:#FFFDF6; --puff:#FFFFFF; --leder:#7A4A21; --hat:#2F5D3A; --dress:#D0312D; --fan:#F2C94C;`;
  const TOKENS_DARK = `--bg:#0F1A14; --surface:#18271F; --fg:#E6EFE8; --muted:#9DB3A5; --line:#2C4035;
    --accent:#5FD08F; --accent-ink:#06170D; --belly:#1F5A3A; --mark:#E8C63A; --mark-ink:#1C1700;
    --dino:#8CC8F2; --dino-line:#2D5E9E; --dino-spot:#5D9FDB;
    --glass:rgba(30,36,44,.94); --glass-u:rgba(40,48,58,.96); --glass-edge:rgba(255,255,255,.12); --glass-shadow:rgba(0,0,0,.45);
    --beret:#E2554D; --bread:#E0B060; --shell:#F3F0E4; --puff:#DCE8DF; --leder:#A66A35; --hat:#3F7A4E; --dress:#E2554D; --fan:#F2C94C;`;

  const CSS = `
:host{all:initial}
:host{${TOKENS_LIGHT}
  --display:"Bricolage Grotesque","Trebuchet MS",system-ui,sans-serif;
  --body:"Atkinson Hyperlegible",Verdana,system-ui,sans-serif;
  --mono:"DM Mono",ui-monospace,Menlo,monospace;}
@media (prefers-color-scheme: dark){:host{${TOKENS_DARK}}}
*{box-sizing:border-box}
[hidden]{display:none !important}
button{font:inherit;color:inherit;cursor:pointer}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px}

.saurus{position:fixed;z-index:2147483647;width:min(320px,calc(100vw - 32px));display:flex;flex-direction:column;gap:10px;
  align-items:center;font-family:var(--body);font-size:15px;line-height:1.45;color:var(--fg);pointer-events:none;
  animation:arrive .35s ease-out both}
.saurus > *{pointer-events:auto}
.saurus[data-corner="br"]{right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px))}
.saurus[data-corner="bl"]{left:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px))}
.saurus[data-corner="tr"]{right:16px;top:16px}
.saurus[data-corner="tl"]{left:16px;top:16px}
.saurus.dragging{animation:none;transition:none}
@keyframes arrive{from{opacity:0;transform:translateY(8px) scale(.96)}to{opacity:1;transform:none}}

/* frosted glass, like a desktop pet's controls and cards */
.glass{background:var(--glass);-webkit-backdrop-filter:blur(18px) saturate(1.5);backdrop-filter:blur(18px) saturate(1.5);
  border:1px solid var(--glass-edge);box-shadow:0 10px 30px -8px var(--glass-shadow),0 1px 2px var(--glass-shadow)}

/* pet, then the control pill, then the cards */
.dock{display:flex;flex-direction:column;align-items:center;gap:8px}
.pill{display:flex;align-items:center;gap:2px;padding:4px;border-radius:999px}
.pill .sep{width:1px;height:18px;background:var(--line);margin:0 2px}
.ctl{width:40px;height:32px;border-radius:999px;border:0;background:transparent;display:grid;place-items:center;color:var(--fg);
  padding:0;touch-action:none;-webkit-user-select:none;user-select:none;transition:background .15s,color .15s,transform .15s}
.ctl:hover{background:color-mix(in srgb,var(--fg) 8%,transparent)}
.ctl svg{width:20px;height:20px}
.mute[aria-pressed="true"]{background:var(--accent);color:var(--accent-ink)}
.ctl.held{background:var(--accent);color:var(--accent-ink);transform:scale(1.06)}
.ctl.held svg{animation:wave .6s ease-in-out infinite alternate}
@keyframes wave{from{transform:scaleY(.8)}to{transform:scaleY(1.15)}}

/* cards: a scrollable log sized to show only the latest two */
.bubbles{display:grid;gap:8px;width:100%}
.log{position:relative;display:grid;gap:8px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;
  scroll-behavior:smooth;transition:height .2s ease-out;padding:2px 2px 12px;margin:-2px -2px -12px;scroll-padding-top:2px}
.log::-webkit-scrollbar{display:none}
.bubble{border-radius:22px;padding:11px 16px 12px;width:100%;cursor:pointer;overflow-wrap:anywhere;margin:0;color:var(--fg)}
.bubble small{display:block;font-weight:700;font-size:14px;line-height:1.3;color:var(--fg);margin-bottom:1px}
.bubble .text{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;color:var(--muted)}
.bubble.s .text{color:var(--fg)}
.bubble.expanded .text{-webkit-line-clamp:unset;display:block}
.bubble.u{background:var(--glass-u)}
.bubble.err{border-color:var(--beret)}
.bubble.err small{color:var(--beret)}
.caret::after{content:"";display:inline-block;width:.5em;height:1em;margin-left:.15em;background:var(--accent);vertical-align:-.15em;border-radius:2px;animation:blink 1s steps(2) infinite}
@keyframes blink{50%{opacity:0}}
.choices{display:flex;gap:6px;margin-top:8px}
.choices button{border:1px solid var(--line);background:transparent;border-radius:999px;padding:4px 14px;font-size:14px}
.choices button.yes{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:700}
.choices button:disabled{opacity:.5;cursor:default}
.typebox{cursor:text}
.typebox input{all:unset;display:block;width:100%;font-family:var(--body);font-size:15px;line-height:1.45;color:var(--fg)}
.typebox input::placeholder{color:var(--muted)}

/* avatar: floats freely, no frame */
.dino-wrap{position:relative;display:inline-flex;flex:none;width:var(--size,96px);height:var(--size,96px);
  transition:width .3s ease-out,height .3s ease-out;cursor:grab;touch-action:none;-webkit-user-select:none;user-select:none;
  filter:drop-shadow(0 6px 8px var(--glass-shadow))}
.dragging .dino-wrap{cursor:grabbing}
.float{display:block;width:100%;height:100%;animation:float 4.2s ease-in-out infinite}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
.hop,.mover,.art{width:100%;height:100%;display:block;transform-origin:50% 100%}
.art{position:relative}
.art svg,.art img{width:100%;height:100%;display:block}
.art img{position:absolute;inset:0}
/* frame swaps: blink and mouth-open overlays on the base picture */
.art .f-blink,.art .f-talk{opacity:0}
.art.blink .f-blink{opacity:1}
.art.talking .f-talk{opacity:1}
.art.talking .f-blink{opacity:0}
.speak-fallback[data-state="speaking"] .art .f-talk{animation:flap .36s steps(1) infinite}
@keyframes flap{0%{opacity:1}50%{opacity:0}}
.d-body{fill:var(--dino);stroke:var(--dino-line);stroke-width:3;stroke-linejoin:round}
.d-leg2{fill:var(--dino-spot);stroke:var(--dino-line);stroke-width:3}
.d-belly{fill:var(--dino-spot);stroke:var(--dino-line);stroke-width:2;stroke-linejoin:round}
.d-spot{fill:var(--dino-spot);stroke:var(--dino-line);stroke-width:1.4}
.d-pupil{fill:var(--dino-line)}
.d-line{fill:none;stroke:var(--dino-line);stroke-width:2;stroke-linecap:round}
.d-mouth{fill:var(--dino-line);transform-box:fill-box;transform-origin:50% 0;transform:scaleY(var(--m,0))}
.costume > *:not(g),.costume g > *{stroke:var(--dino-line);stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.d-beret{fill:var(--beret)}.d-bread{fill:var(--bread)}.d-score{fill:none;stroke-width:1.5 !important}
.d-shell{fill:var(--shell);stroke:var(--dino-line);stroke-width:2.5;stroke-linejoin:round}
.d-specs{fill:none;stroke:var(--dino-line);stroke-width:2}
.d-leder{fill:var(--leder)}.d-strap{fill:none;stroke:var(--leder) !important;stroke-width:4 !important}
.d-hat{fill:var(--hat)}.d-feather{fill:none;stroke:var(--beret) !important;stroke-width:3 !important}
.d-dress{fill:var(--dress)}.d-dot{fill:var(--shell);stroke:none !important}
.d-sweater{fill:#2F5DA8}.d-zig{fill:none;stroke:var(--fan) !important;stroke-width:2.2 !important}.d-dala{fill:var(--beret)}
.d-leaf{fill:none;stroke:#3F8A4A !important;stroke-width:3 !important}.d-fl1{fill:#fff}.d-fl2{fill:var(--fan)}.d-fl3{fill:#F2A7C3}
.d-kurta{fill:#E8873A}.d-trim{fill:none;stroke:var(--fan) !important;stroke-width:2.6 !important}.d-garland circle{fill:#F5A623}
.d-fan{fill:var(--fan)}.d-rib{fill:none;stroke-width:1.2 !important}
.eye{transform-box:fill-box;transform-origin:center;transition:transform .07s}
.blink .eye{transform:scaleY(.1)}

/* states: springy, desktop-pet style squash and stretch */
[data-state="idle"] .mover{animation:breathe 3.2s ease-in-out infinite}
[data-state="listening"] .mover{transform:rotate(6deg) translateX(2px) scale(1.04,.98);transition:transform .3s cubic-bezier(.3,1.6,.5,1)}
[data-state="thinking"] .mover{animation:think .5s ease-in-out infinite alternate}
[data-state="speaking"] .mover{transition:transform .08s linear}
.speak-fallback[data-state="speaking"] .mover{animation:talk .32s ease-in-out infinite alternate}
.speak-fallback[data-state="speaking"] .d-mouth{animation:mouth .22s ease-in-out infinite alternate}
.celebrating .hop{animation:hop .9s cubic-bezier(.3,.7,.4,1)}
@keyframes breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.03,.97)}}
@keyframes think{from{transform:rotate(-5deg) translateY(0)}to{transform:rotate(-5deg) translateY(-4px) scale(.98,1.03)}}
@keyframes talk{from{transform:translateY(0) scale(1,1)}to{transform:translateY(-2px) scale(.985,1.03)}}
@keyframes mouth{from{transform:scaleY(.1)}to{transform:scaleY(1)}}
@keyframes hop{0%{transform:scale(1,1)}12%{transform:scale(1.12,.86)}35%{transform:translateY(-26px) scale(.92,1.1)}
  55%{transform:translateY(0) scale(1.14,.84)}68%{transform:translateY(-9px) scale(.96,1.04)}82%{transform:scale(1.05,.95)}100%{transform:scale(1,1)}}

/* costume-change puff */
.puff{position:absolute;inset:0;pointer-events:none;z-index:2}
.puff i{position:absolute;left:50%;top:50%;width:64%;height:64%;border-radius:50%;background:var(--puff);
  box-shadow:0 0 0 1px var(--line);opacity:0;transform:translate(-50%,-50%) scale(.2)}
.puffing .puff i{animation:puff .65s ease-out both}
.puffing .art{animation:pop .65s ease-out both}
@keyframes puff{
  0%{opacity:0;transform:translate(-50%,-50%) scale(.2)}
  30%{opacity:1;transform:translate(calc(-50% + var(--x)),calc(-50% + var(--y))) scale(1.05)}
  100%{opacity:0;transform:translate(calc(-50% + var(--x) * 1.7),calc(-50% + var(--y) * 1.7)) scale(1.35)}}
@keyframes pop{0%{transform:scale(1)}30%{transform:scale(.7)}62%{transform:scale(1.12)}100%{transform:scale(1)}}

@media (prefers-reduced-motion: reduce){
  .saurus,.caret::after,.puffing .puff i,.puffing .art,.mover,.hop,.celebrating .hop,.d-mouth,.float,.ctl.held svg,.art .f-talk{animation:none !important}
  [data-state="listening"] .mover{transform:none}
  .log{scroll-behavior:auto;transition:none}
  .dino-wrap{transition:none}
}
`;

  // Styles that must live in the page (translated blocks and highlights).
  const PAGE_CSS = `
:root{--saurus-mark:#FFDD55;--saurus-mark-ink:#2A2200;--saurus-accent:#1F7A4D}
@media (prefers-color-scheme: dark){:root{--saurus-mark:#E8C63A;--saurus-mark-ink:#1C1700;--saurus-accent:#5FD08F}}
[data-saurus-id].saurus-pending{opacity:.55;transition:opacity .3s}
[data-saurus-id] > .saurus-orig[hidden]{display:none !important}
[data-saurus-id].saurus-peek > .saurus-tr{display:none !important}
[data-saurus-id].saurus-peek > .saurus-orig{display:inline !important}
[data-saurus-id].saurus-peek{outline:2px dashed var(--saurus-accent);outline-offset:3px;border-radius:2px}
[data-saurus-id] > .saurus-tr{cursor:pointer}
[data-saurus-id] mark.saurus-target{background:var(--saurus-mark);color:var(--saurus-mark-ink);padding:0 .14em;border-radius:.14em}
mark.saurus-hl{background:transparent;color:inherit;border-radius:.14em;box-shadow:0 0 0 3px var(--saurus-accent);padding:0 .1em}
@media (prefers-reduced-motion: no-preference){mark.saurus-hl{animation:saurus-hl 1.2s ease-out}}
@keyframes saurus-hl{0%{box-shadow:0 0 0 10px transparent}100%{box-shadow:0 0 0 3px var(--saurus-accent)}}
`;

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  let host, shadow, ui = null;
  let active = false;
  let session = 0;
  let muted = false;
  let lang = null, level = 1;           // what the backend says
  let shownLang = null, shownLevel = 1; // what the avatar shows
  let avatarState = "idle";
  let blocks = [];                      // [{id, el, text, tr, orig}]
  let byId = new Map();
  let trToken = 0;
  let translated = false;
  const live = { s: null, u: null };    // in-progress transcript bubbles
  const wired = new WeakSet();

  function backend() { return window.SaurusBackend || null; }

  // Call a backend method; any throw is reported in Saurus's bubble.
  function call(name, ...args) {
    const be = backend();
    if (!be || typeof be[name] !== "function") {
      problem(be ? `The backend has no ${name}() method.` : "No backend found (window.SaurusBackend is missing).");
      return undefined;
    }
    try { return be[name](...args); } catch (err) { problem(`Backend error in ${name}(): ${errText(err)}`); return undefined; }
  }
  function callAsync(name, ...args) {
    const be = backend();
    if (!be || typeof be[name] !== "function") {
      return Promise.reject(new Error(be ? `the backend has no ${name}() method` : "no backend found (window.SaurusBackend is missing)"));
    }
    return Promise.resolve().then(() => be[name](...args));
  }
  function errText(err) { return (err && (err.message || err.name)) || String(err); }

  // ---------------------------------------------------------------------
  // UI construction
  // ---------------------------------------------------------------------
  function build() {
    if (ui) return;
    host = document.createElement("saurus-widget");
    host.style.cssText = "all:initial !important;position:fixed !important;display:block !important;z-index:2147483647 !important;top:0 !important;left:0 !important;width:0 !important;height:0 !important;";
    shadow = host.attachShadow({ mode: "open" });
    setHTML(shadow, `<style>${CSS}</style>
      <aside class="saurus" data-corner="br" data-state="idle" aria-label="Saurus" hidden>
        <div class="dock">
          <span class="dino-wrap" role="img" aria-label="Saurus">
            <span class="puff" aria-hidden="true">${PUFF}</span>
            <span class="float"><span class="hop"><span class="mover"><span class="art"></span></span></span></span>
          </span>
          <div class="pill glass" role="toolbar" aria-label="Saurus controls">
            <button class="ctl mute" type="button" aria-pressed="false" aria-label="Mute: switch to typing" title="Mute: type instead">${ICON_MUTE}</button>
            <span class="sep" aria-hidden="true"></span>
            <button class="ctl mic" type="button" aria-pressed="true" aria-label="Hold to talk" title="Hold to talk (or hold Space)">${ICON_MIC}</button>
          </div>
        </div>
        <div class="bubbles">
          <div class="log" role="log" aria-live="polite"></div>
          <form class="bubble u glass typebox" hidden><small>You</small><input type="text" enterkeyhint="send" autocomplete="off" placeholder="Type to Saurus, press Enter" aria-label="Message to Saurus"></form>
        </div>
      </aside>`);
    (document.body || document.documentElement).appendChild(host);
    const $ = (s) => shadow.querySelector(s);
    ui = {
      root: $(".saurus"), log: $(".log"), typebox: $(".typebox"), input: $(".typebox input"),
      mute: $(".mute"), mic: $(".mic"), wrap: $(".dino-wrap"),
      mover: $(".mover"), art: $(".art"),
    };
    ui.root.dataset.corner = loadCorner();

    ui.mute.addEventListener("click", () => setMuted(!muted, true));
    ui.typebox.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = ui.input.value.trim();
      if (!text) return;
      ui.input.value = "";
      finishLive("u");
      addBubble("u", text, { label: "You, typing" });
      call("sendText", text);
    });
    // push-to-talk button
    ui.mic.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      if (muted) { setMuted(false); return; }
      try { ui.mic.setPointerCapture(e.pointerId); } catch (_) {}
      startTalk();
    });
    const release = () => stopTalk();
    ui.mic.addEventListener("pointerup", release);
    ui.mic.addEventListener("pointercancel", release);
    ui.mic.addEventListener("lostpointercapture", release);
    ui.mic.addEventListener("contextmenu", (e) => e.preventDefault());

    initDrag();
    injectPageAssets();
  }

  function injectPageAssets() {
    if (!document.getElementById("saurus-page-style")) {
      const st = document.createElement("style");
      st.id = "saurus-page-style";
      st.textContent = PAGE_CSS;
      (document.head || document.documentElement).appendChild(st);
    }
    // Fonts must be declared in the document for the shadow DOM to use them.
    if (!document.getElementById("saurus-fonts")) {
      const link = document.createElement("link");
      link.id = "saurus-fonts";
      link.rel = "stylesheet";
      link.href = FONT_URL;
      (document.head || document.documentElement).appendChild(link);
    }
  }

  // ---------------------------------------------------------------------
  // Bubbles
  // ---------------------------------------------------------------------
  function addBubble(who, text, opts = {}) {
    const el = document.createElement("div");
    el.className = `bubble glass ${who}` + (opts.error ? " err" : "");
    const label = document.createElement("small");
    label.textContent = opts.label || (who === "s" ? (opts.error ? "Saurus · problem" : "Saurus") : "You, live transcript");
    const t = document.createElement("span");
    t.className = "text" + (opts.live ? " caret" : "");
    t.textContent = text;
    el.append(label, t);
    el.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      el.classList.toggle("expanded");
      fit();
    });
    ui.log.appendChild(el);
    while (ui.log.children.length > 60) ui.log.firstElementChild.remove();
    fit();
    return el;
  }

  function setBubbleText(el, text) {
    el.querySelector(".text").textContent = text;
    fit();
  }

  function finishLive(who) {
    const el = live[who];
    if (!el) return;
    el.querySelector(".text").classList.remove("caret");
    live[who] = null;
  }

  // Size the log so only the latest bubbles are visible (two in total,
  // counting the text input when muted); older ones scroll up out of view.
  function fit() {
    if (!ui) return;
    const items = ui.log.children;
    const n = muted ? 1 : 2;
    if (!items.length) { ui.log.style.height = "0px"; ui.log.hidden = true; return; }
    ui.log.hidden = false;
    const first = items[Math.max(0, items.length - n)];
    const last = items[items.length - 1];
    const h = last.offsetTop + last.offsetHeight - first.offsetTop + 16; // room for the card shadow
    ui.log.style.height = Math.min(h, window.innerHeight * 0.6) + "px";
    ui.log.scrollTop = ui.log.scrollHeight;
  }

  function problem(msg) {
    if (!ui) return;
    const fallback = !muted;
    addBubble("s", msg + (fallback ? " Switching to typing." : ""), { error: true });
    if (fallback) setMuted(true);
    console.warn("[saurus]", msg);
  }

  function drillOffer(topic) {
    const el = addBubble("s", `Want a quick drill on ${topic || "this"}?`);
    const row = document.createElement("div");
    row.className = "choices";
    const yes = document.createElement("button");
    yes.type = "button"; yes.className = "yes"; yes.textContent = "Yes";
    const no = document.createElement("button");
    no.type = "button"; no.textContent = "Not now";
    const choose = (answer) => {
      yes.disabled = no.disabled = true;
      finishLive("u");
      addBubble("u", answer, { label: muted ? "You, typing" : "You" });
      call("sendText", answer);
    };
    yes.addEventListener("click", () => choose("Yes"));
    no.addEventListener("click", () => choose("Not now"));
    row.append(yes, no);
    el.appendChild(row);
    fit();
  }

  // ---------------------------------------------------------------------
  // Mute / typed chat
  // ---------------------------------------------------------------------
  function setMuted(m, focus) {
    muted = m;
    if (!ui) return;
    if (m) { stopTalk(); releaseMic(); stopPlayback(); }
    ui.mute.setAttribute("aria-pressed", String(m));
    ui.mic.setAttribute("aria-pressed", String(!m));
    ui.mic.setAttribute("aria-label", m ? "Turn audio back on" : "Hold to talk");
    ui.typebox.hidden = !m;
    ui.root.classList.toggle("speak-fallback", m);
    if (m && focus) ui.input.focus();
    fit();
  }

  // ---------------------------------------------------------------------
  // Audio: playback (24 kHz Int16 chunks, scheduled gaplessly)
  // ---------------------------------------------------------------------
  let ctx = null, outNode = null, analyser = null, playHead = 0;
  const sources = new Set();

  function audioCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      outNode = ctx.createGain();
      outNode.connect(analyser);
      analyser.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }

  function toInt16(data) {
    if (data instanceof Int16Array) return data;
    if (data instanceof ArrayBuffer) return new Int16Array(data);
    if (ArrayBuffer.isView(data)) return new Int16Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 2));
    if (Array.isArray(data)) return Int16Array.from(data);
    return null;
  }

  function playChunk(data) {
    if (!active || muted || talking) return;
    const pcm = toInt16(data);
    const c = audioCtx();
    if (!pcm || !pcm.length || !c) return;
    const buf = c.createBuffer(1, pcm.length, 24000);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(outNode);
    const now = c.currentTime;
    if (playHead < now + 0.02) playHead = now + 0.06; // small jitter buffer after a gap
    src.start(playHead);
    playHead += buf.duration;
    sources.add(src);
    src.onended = () => sources.delete(src);
  }

  function stopPlayback() {
    for (const s of sources) { try { s.stop(); } catch (_) {} }
    sources.clear();
    playHead = 0;
  }

  // ---------------------------------------------------------------------
  // Audio: push-to-talk capture -> 16 kHz Int16 mono
  // ---------------------------------------------------------------------
  let micStream = null, micSource = null, micProc = null, micSink = null, micPromise = null;
  let talking = false, capturing = false, sentAudio = false, resampler = null;

  class Downsampler {
    constructor(inRate, outRate) { this.ratio = inRate / outRate; this.pos = 0; this.rest = new Float32Array(0); }
    push(input) {
      const data = new Float32Array(this.rest.length + input.length);
      data.set(this.rest); data.set(input, this.rest.length);
      const out = [];
      const r = this.ratio;
      while (this.pos + r <= data.length) {
        const a = Math.floor(this.pos);
        const b = Math.max(a + 1, Math.floor(this.pos + r));
        let sum = 0;
        for (let i = a; i < b; i++) sum += data[i];
        const v = Math.max(-1, Math.min(1, sum / (b - a)));
        out.push(v < 0 ? v * 32768 : v * 32767);
        this.pos += r;
      }
      const keep = Math.floor(this.pos);
      this.rest = data.slice(keep);
      this.pos -= keep;
      return Int16Array.from(out);
    }
  }

  function ensureMic() {
    if (micStream) return Promise.resolve();
    if (micPromise) return micPromise;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error("microphone access needs a secure page (https or localhost)"));
    }
    micPromise = navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    }).then((stream) => {
      micPromise = null;
      if (!active || muted) { stream.getTracks().forEach((t) => t.stop()); throw new Error("cancelled"); }
      const c = audioCtx();
      micStream = stream;
      micSource = c.createMediaStreamSource(stream);
      micProc = c.createScriptProcessor(2048, 1, 1);
      micSink = c.createGain();
      micSink.gain.value = 0;
      micProc.onaudioprocess = (e) => {
        if (!capturing || !resampler) return;
        const pcm = resampler.push(e.inputBuffer.getChannelData(0));
        if (pcm.length) { sentAudio = true; call("sendAudio", pcm); }
      };
      micSource.connect(micProc);
      micProc.connect(micSink);
      micSink.connect(c.destination);
    }, (err) => { micPromise = null; throw err; });
    return micPromise;
  }

  function releaseMic() {
    capturing = false;
    if (micProc) { micProc.onaudioprocess = null; try { micProc.disconnect(); } catch (_) {} }
    if (micSource) { try { micSource.disconnect(); } catch (_) {} }
    if (micSink) { try { micSink.disconnect(); } catch (_) {} }
    if (micStream) micStream.getTracks().forEach((t) => t.stop());
    micStream = micSource = micProc = micSink = null;
  }

  function startTalk() {
    if (!active || muted || talking) return;
    talking = true;
    sentAudio = false;
    stopPlayback();
    ui.mic.classList.add("held");
    audioCtx();
    ensureMic().then(() => {
      if (!talking) return; // released before the mic was ready
      resampler = new Downsampler(ctx.sampleRate, 16000);
      capturing = true;
    }, (err) => {
      talking = false;
      ui.mic.classList.remove("held");
      if (errText(err) === "cancelled") return;
      const denied = err && (err.name === "NotAllowedError" || err.name === "SecurityError");
      const missing = err && err.name === "NotFoundError";
      problem(denied ? "I can't hear you: microphone access was denied."
        : missing ? "I can't hear you: no microphone was found."
        : `I can't hear you: ${errText(err)}.`);
    });
  }

  function stopTalk() {
    if (!talking) return;
    talking = false;
    capturing = false;
    if (ui) ui.mic.classList.remove("held");
    if (sentAudio) { sentAudio = false; call("endOfSpeech"); }
  }

  // ---------------------------------------------------------------------
  // Avatar
  // ---------------------------------------------------------------------
  const pngCache = new Map();
  function pngExists(url) {
    if (!pngCache.has(url)) {
      pngCache.set(url, new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
      }));
    }
    return pngCache.get(url);
  }

  let artToken = 0;
  function renderArt() {
    if (!ui) return;
    const l = shownLang, lv = shownLevel, my = ++artToken;
    ui.wrap.style.setProperty("--size", LEVEL_SIZE[lv] + "px");
    setHTML(ui.art, avatarSVG(l, lv));
    const who = l ? `${LANG_NAME[l]} · ${LEVEL_NAME[lv]}` : "Waking up…";
    ui.wrap.title = who;
    ui.wrap.setAttribute("aria-label", `Saurus, ${who}`);
    if (!l) return;
    // Optional frames next to the base art: -blink (eyes closed), -talk (mouth open).
    const url = (suffix) => assetUrl(`assets/saurus-${l}-${lv}${suffix}.png`);
    Promise.all(["", "-blink", "-talk"].map((sfx) => pngExists(url(sfx)))).then(([base, blink, talk]) => {
      if (!base || my !== artToken) return;
      const frame = (sfx, cls) => {
        const img = document.createElement("img");
        img.src = url(sfx);
        img.alt = "";
        img.draggable = false;
        img.className = cls;
        return img;
      };
      ui.art.replaceChildren(frame("", "f-base"),
        ...(blink ? [frame("-blink", "f-blink")] : []),
        ...(talk ? [frame("-talk", "f-talk")] : []));
    });
  }

  let puffTimers = [];
  function puffSwap(apply) {
    puffTimers.forEach(clearTimeout);
    puffTimers = [];
    if (calm || !ui) { apply(); return; }
    ui.wrap.classList.remove("puffing");
    void ui.wrap.offsetWidth;
    ui.wrap.classList.add("puffing");
    puffTimers.push(setTimeout(apply, 200)); // mid-puff, as in the mock-up
    puffTimers.push(setTimeout(() => ui.wrap.classList.remove("puffing"), 700));
  }

  function setAvatarState(s) {
    avatarState = s;
    if (!ui) return;
    ui.root.dataset.state = s;
    if (s !== "speaking") { ui.mover.style.transform = ""; ui.art.style.setProperty("--m", "0"); ui.art.classList.remove("talking"); }
  }

  let celebrateTimer = 0;
  function celebrate() {
    if (!ui || calm) return;
    clearTimeout(celebrateTimer);
    ui.root.classList.remove("celebrating");
    void ui.root.offsetWidth;
    ui.root.classList.add("celebrating");
    celebrateTimer = setTimeout(() => ui.root.classList.remove("celebrating"), 950);
  }

  // Irregular blinks.
  let blinkTimer = 0;
  function scheduleBlink() {
    clearTimeout(blinkTimer);
    if (!active) return;
    blinkTimer = setTimeout(() => {
      const art = ui.art;
      art.classList.add("blink");
      setTimeout(() => {
        art.classList.remove("blink");
        if (Math.random() < 0.25) { // occasional double blink
          setTimeout(() => { art.classList.add("blink"); setTimeout(() => art.classList.remove("blink"), 110); }, 160);
        }
      }, 120);
      scheduleBlink();
    }, 1800 + Math.random() * 4500);
  }

  // Speaking: bob in time with playback loudness.
  let rafId = 0, loud = 0;
  const tdBuf = new Float32Array(512);
  function animateLoop() {
    rafId = requestAnimationFrame(animateLoop);
    if (calm || avatarState !== "speaking" || muted || !analyser) return;
    analyser.getFloatTimeDomainData(tdBuf);
    let sum = 0;
    for (let i = 0; i < tdBuf.length; i++) sum += tdBuf[i] * tdBuf[i];
    const rms = Math.sqrt(sum / tdBuf.length);
    loud += (Math.min(1, rms * 5) - loud) * 0.35;
    ui.mover.style.transform = `translateY(${(-loud * 6).toFixed(2)}px) scale(${(1 - loud * 0.03).toFixed(3)},${(1 + loud * 0.05).toFixed(3)})`;
    ui.art.style.setProperty("--m", Math.min(1, loud * 1.6).toFixed(2));
    // mouth-open frame while the voice is loud (with a little hysteresis)
    const open = ui.art.classList.contains("talking");
    if (!open && loud > 0.14) ui.art.classList.add("talking");
    else if (open && loud < 0.08) ui.art.classList.remove("talking");
  }

  // ---------------------------------------------------------------------
  // Dragging to a corner
  // ---------------------------------------------------------------------
  function loadCorner() {
    try { const c = localStorage.getItem(CORNER_KEY); if (/^[tb][lr]$/.test(c)) return c; } catch (_) {}
    return "br";
  }
  function saveCorner(c) { try { localStorage.setItem(CORNER_KEY, c); } catch (_) {} }

  function initDrag() {
    let drag = null;
    ui.wrap.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const r = ui.root.getBoundingClientRect();
      drag = { x: e.clientX, y: e.clientY, left: r.left, top: r.top, moved: false, id: e.pointerId };
      try { ui.wrap.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    });
    ui.wrap.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      drag.moved = true;
      ui.root.classList.add("dragging");
      Object.assign(ui.root.style, { left: drag.left + dx + "px", top: drag.top + dy + "px", right: "auto", bottom: "auto" });
    });
    const end = (e) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (!d.moved) return;
      const cx = e.clientX, cy = e.clientY;
      const corner = (cy < window.innerHeight / 2 ? "t" : "b") + (cx < window.innerWidth / 2 ? "l" : "r");
      ui.root.classList.remove("dragging");
      Object.assign(ui.root.style, { left: "", top: "", right: "", bottom: "" });
      ui.root.dataset.corner = corner;
      saveCorner(corner);
      fit();
    };
    ui.wrap.addEventListener("pointerup", end);
    ui.wrap.addEventListener("pointercancel", end);
  }

  // ---------------------------------------------------------------------
  // Page text: collect, translate in place, restore
  // ---------------------------------------------------------------------
  function articleRoot() {
    const cands = [...document.querySelectorAll("article, main, [role='main']")];
    let best = null, bestLen = 0;
    for (const c of cands) {
      const len = (c.innerText || "").length;
      if (len > bestLen) { best = c; bestLen = len; }
    }
    return best || document.body;
  }

  function collectBlocks() {
    const root = articleRoot();
    const all = [...root.querySelectorAll(BLOCK_SEL)];
    const out = [];
    let n = 0;
    for (const el of all) {
      if (el.closest(SKIP_SEL)) continue;
      if (el.querySelector(BLOCK_SEL)) continue; // take the innermost blocks only
      if (!el.getClientRects().length) continue;  // hidden
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (text.length < 2 || !/\p{L}/u.test(text)) continue;
      // list items that are just a link are navigation, not article text
      const links = el.querySelectorAll("a");
      if (el.tagName === "LI" && links.length === 1 && links[0].textContent.replace(/\s+/g, " ").trim() === text) continue;
      const id = "b" + n++;
      el.setAttribute("data-saurus-id", id);
      out.push({ id, el, text, tr: null, orig: null, hadClass: el.hasAttribute("class") });
    }
    blocks = out;
    byId = new Map(out.map((b) => [b.id, b]));
    return out;
  }

  // Backend HTML may only contain text and <mark>. Parsed by hand (no
  // innerHTML) so it is safe and works on Trusted Types pages.
  function decodeEntities(s) {
    const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
    return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === "#") {
        const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        try { return String.fromCodePoint(cp); } catch (_) { return m; }
      }
      return named[e.toLowerCase()] ?? m;
    });
  }
  function htmlToFragment(html) {
    const frag = document.createDocumentFragment();
    let cur = frag;
    const parts = String(html).split(/(<\/?mark\b[^>]*>|<br\s*\/?>|<[^>]*>)/i);
    for (const p of parts) {
      if (!p) continue;
      if (/^<mark\b/i.test(p)) {
        if (cur !== frag) continue;
        const m = document.createElement("mark");
        m.className = "saurus-target";
        frag.appendChild(m);
        cur = m;
      } else if (/^<\/mark/i.test(p)) {
        cur = frag;
      } else if (/^<br/i.test(p)) {
        cur.appendChild(document.createElement("br"));
      } else if (p[0] === "<" && p[p.length - 1] === ">") {
        // any other tag is dropped
      } else {
        cur.appendChild(document.createTextNode(decodeEntities(p)));
      }
    }
    return frag;
  }

  // Translate in small batches, what's on screen first, and show each batch
  // as soon as it arrives (long pages would otherwise sit grey for ages).
  const FIRST_BATCH = 4, BATCH = 8, PARALLEL = 5, MAX_BLOCKS = 150;
  function translateAll() {
    if (!active || !lang || !blocks.length) return;
    const my = ++trToken;
    const vh = window.innerHeight;
    const dist = (b) => {
      const r = b.el.getBoundingClientRect();
      return r.bottom < 0 ? -r.bottom + vh : r.top > vh ? r.top - vh : 0; // 0 = on screen
    };
    const order = blocks.map((b, i) => ({ b, d: dist(b), i }))
      .sort((x, y) => x.d - y.d || x.i - y.i).slice(0, MAX_BLOCKS).map((x) => x.b);
    const queue = [];
    // a small first batch (what's on screen) comes back fastest
    queue.push(order.slice(0, FIRST_BATCH));
    for (let i = FIRST_BATCH; i < order.length; i += BATCH) queue.push(order.slice(i, i + BATCH));
    clearHighlights();
    for (const b of order) b.el.classList.add("saurus-pending");
    let failed = false;
    const apply = (res) => {
      if (!Array.isArray(res)) throw new Error("translatePage() did not return an array");
      for (const item of res) {
        const b = item && byId.get(item.id);
        if (!b || typeof item.html !== "string") continue;
        if (!b.tr) {
          b.orig = document.createElement("span");
          b.orig.className = "saurus-orig";
          b.orig.hidden = true;
          b.orig.append(...b.el.childNodes);
          b.tr = document.createElement("span");
          b.tr.className = "saurus-tr";
          b.el.append(b.tr, b.orig);
        }
        b.tr.replaceChildren(htmlToFragment(item.html));
        b.el.classList.remove("saurus-pending");
      }
      translated = true;
    };
    const worker = async () => {
      while (queue.length && my === trToken && active) {
        const batch = queue.shift();
        try {
          const res = await callAsync("translatePage", { blocks: batch.map(({ id, text }) => ({ id, text })), language: lang, level });
          if (my !== trToken || !active) return;
          apply(res);
        } catch (err) {
          if (my !== trToken || !active) return;
          if (!failed) { failed = true; problem(`I couldn't translate part of this page: ${errText(err)}.`); }
        } finally {
          for (const b of batch) b.el.classList.remove("saurus-pending");
        }
      }
    };
    for (let i = 0; i < PARALLEL; i++) worker();
  }

  let retranslateTimer = 0;
  function retranslateSoon() {
    clearTimeout(retranslateTimer);
    retranslateTimer = setTimeout(translateAll, 60);
  }

  function restorePage() {
    trToken++;
    clearHighlights();
    for (const b of blocks) {
      if (b.tr) b.el.replaceChildren(...b.orig.childNodes);
      b.el.classList.remove("saurus-pending", "saurus-peek");
      if (!b.hadClass && !b.el.classList.length) b.el.removeAttribute("class");
      b.el.removeAttribute("data-saurus-id");
    }
    blocks = [];
    byId = new Map();
    translated = false;
  }

  // ---------------------------------------------------------------------
  // Highlights
  // ---------------------------------------------------------------------
  function textNodes(scope) {
    const w = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    const out = [];
    while (w.nextNode()) out.push(w.currentNode);
    return out;
  }
  function highlight(text) {
    clearHighlights();
    const needle = String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!needle) return;
    const isL = (c) => !!c && /[\p{L}\p{N}]/u.test(c);
    let fallback = null;
    for (const b of blocks) {
      const scope = b.tr || b.el;
      const nodes = textNodes(scope);
      const full = nodes.map((n) => n.data).join("").toLowerCase();
      let idx = full.indexOf(needle);
      while (idx >= 0) {
        const whole = !isL(full[idx - 1]) && !isL(full[idx + needle.length]);
        if (whole) { wrapRange(nodes, idx, idx + needle.length); return; }
        if (!fallback) fallback = { nodes, idx };
        idx = full.indexOf(needle, idx + 1);
      }
    }
    if (fallback) wrapRange(fallback.nodes, fallback.idx, fallback.idx + needle.length);
  }
  function wrapRange(nodes, start, end) {
    const range = document.createRange();
    let pos = 0;
    for (const n of nodes) {
      const len = n.data.length;
      if (start >= pos && start <= pos + len) range.setStart(n, start - pos);
      if (end >= pos && end <= pos + len) { range.setEnd(n, end - pos); break; }
      pos += len;
    }
    const mark = document.createElement("mark");
    mark.className = "saurus-hl";
    mark.appendChild(range.extractContents());
    range.insertNode(mark);
  }
  function clearHighlights() {
    for (const m of document.querySelectorAll("mark.saurus-hl")) {
      const p = m.parentNode;
      if (!p) continue;
      while (m.firstChild) p.insertBefore(m.firstChild, m);
      p.removeChild(m);
      p.normalize();
    }
  }

  // ---------------------------------------------------------------------
  // Word press (sendContext) and press-and-hold to peek at the original
  // ---------------------------------------------------------------------
  let press = null;
  function onPageDown(e) {
    if (!active || e.button !== 0 || !e.isPrimary) return;
    if (host && e.composedPath().includes(host)) return;
    const el = e.target && e.target.closest && e.target.closest("[data-saurus-id]");
    if (!el) return;
    const b = byId.get(el.getAttribute("data-saurus-id"));
    if (!b) return;
    press = { b, x: e.clientX, y: e.clientY, peeked: false, timer: 0 };
    if (b.tr) {
      press.timer = setTimeout(() => {
        if (!press) return;
        press.peeked = true;
        b.el.classList.add("saurus-peek");
      }, PEEK_MS);
    }
  }
  function onPageMove(e) {
    if (!press || press.peeked) return;
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) { clearTimeout(press.timer); press = null; }
  }
  function onPageUp(e) {
    if (!press) return;
    const p = press;
    press = null;
    clearTimeout(p.timer);
    if (p.peeked) { p.b.el.classList.remove("saurus-peek"); return; }
    const sel = window.getSelection && window.getSelection();
    if (sel && !sel.isCollapsed) return;
    const hit = wordAt(e.clientX, e.clientY, p.b);
    if (hit) call("sendContext", { type: "word_pressed", word: hit.word, sentence: hit.sentence });
  }
  function onPageCancel() {
    if (!press) return;
    clearTimeout(press.timer);
    press.b.el.classList.remove("saurus-peek");
    press = null;
  }

  function wordAt(x, y, b) {
    let node = null, offset = 0;
    if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y);
      if (p) { node = p.offsetNode; offset = p.offset; }
    } else if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(x, y);
      if (r) { node = r.startContainer; offset = r.startOffset; }
    }
    if (!node || node.nodeType !== 3) return null;
    const scope = b.tr || b.el;
    if (!scope.contains(node)) return null;
    const t = node.data;
    const isW = (c) => /[\p{L}\p{M}\p{N}'’-]/u.test(c);
    let s = offset, en = offset;
    if (s > 0 && !isW(t[s] || " ") && isW(t[s - 1])) s--; // clicked just after a word
    while (s > 0 && isW(t[s - 1])) s--;
    while (en < t.length && isW(t[en])) en++;
    const raw = t.slice(s, en);
    const word = raw.replace(/^['’-]+|['’-]+$/g, "");
    if (!word || !/\p{L}/u.test(word)) return null;
    // the sentence around it, within the block
    const r = document.createRange();
    r.setStart(scope, 0);
    r.setEnd(node, s);
    const at = r.toString().length;
    const full = scope.textContent;
    let a = at;
    while (a > 0 && !/[.!?…]/.test(full[a - 1])) a--;
    let z = at;
    while (z < full.length && !/[.!?…]/.test(full[z])) z++;
    const sentence = full.slice(a, Math.min(full.length, z + 1)).replace(/\s+/g, " ").trim();
    return { word, sentence };
  }

  // ---------------------------------------------------------------------
  // Backend events
  // ---------------------------------------------------------------------
  function wire(be) {
    if (wired.has(be)) return;
    if (typeof be.on !== "function") throw new Error("the backend has no on() method");
    wired.add(be);
    const on = (name, fn) => be.on(name, (data) => {
      if (!active || backend() !== be) return;
      try { fn(data); } catch (err) { console.error("[saurus] error handling", name, err); }
    });
    on("state", (s) => setAvatarState(String(s)));
    on("transcript", (d) => {
      if (!d) return;
      const who = d.who === "user" ? "u" : "s";
      const text = String(d.text ?? "");
      if (live[who]) setBubbleText(live[who], text);
      else live[who] = addBubble(who, text, { live: !d.final });
      if (d.final) finishLive(who);
    });
    on("audio", playChunk);
    on("highlight", (d) => highlight(d && d.text));
    on("level", (d) => {
      if (!d) return;
      const lv = Math.max(1, Math.min(4, Number(d.level) || 1));
      if (d.language && lang && d.language !== lang) return;
      if (lv === level) return;
      level = lv;
      shownLevel = lv;
      renderArt();
      if (translated) retranslateSoon();
    });
    on("language", (d) => {
      const code = d && d.code;
      if (!code || code === lang) return;
      lang = code;
      puffSwap(() => { shownLang = code; shownLevel = level; renderArt(); });
      if (translated) retranslateSoon();
    });
    on("drill_offer", (d) => drillOffer(d && d.topic));
    on("celebrate", celebrate);
    on("error", (d) => problem(`Something went wrong: ${String((d && d.message) || "unknown error").replace(/[.!\s]+$/, "")}.`));
  }

  // ---------------------------------------------------------------------
  // Summon / dismiss
  // ---------------------------------------------------------------------
  function summon() {
    build();
    active = true;
    const my = ++session;
    ui.root.hidden = false;
    ui.log.replaceChildren();
    live.s = live.u = null;
    lang = shownLang = null;
    level = shownLevel = 1;
    setAvatarState("idle");
    setMuted(muted);
    renderArt();
    audioCtx(); // created inside the key gesture so playback is allowed
    scheduleBlink();
    cancelAnimationFrame(rafId);
    animateLoop();
    document.addEventListener("pointerdown", onPageDown, true);
    document.addEventListener("pointermove", onPageMove, true);
    document.addEventListener("pointerup", onPageUp, true);
    document.addEventListener("pointercancel", onPageCancel, true);

    const be = backend();
    if (!be) { problem("No backend found (window.SaurusBackend is missing)."); return; }
    try { wire(be); } catch (err) { problem(`I can't connect: ${errText(err)}.`); return; }

    collectBlocks();
    const pageText = blocks.map((b) => b.text).join("\n").slice(0, 20000);
    callAsync("start", { pageUrl: location.href, pageText })
      .then((info) => {
        if (my !== session) return;
        lang = (info && info.language) || "fr";
        level = Math.max(1, Math.min(4, Number(info && info.level) || 1));
        puffSwap(() => { shownLang = lang; shownLevel = level; renderArt(); });
        translateAll();
      })
      .catch((err) => {
        if (my !== session) return;
        problem(`I couldn't start: ${errText(err)}.`);
      });
  }

  function dismiss() {
    if (!active) return;
    active = false;
    session++;
    stopTalk();
    releaseMic();
    stopPlayback();
    const be = backend();
    if (be && typeof be.stop === "function") { try { be.stop(); } catch (err) { console.warn("[saurus] stop() failed", err); } }
    restorePage();
    onPageCancel();
    document.removeEventListener("pointerdown", onPageDown, true);
    document.removeEventListener("pointermove", onPageMove, true);
    document.removeEventListener("pointerup", onPageUp, true);
    document.removeEventListener("pointercancel", onPageCancel, true);
    clearTimeout(blinkTimer);
    cancelAnimationFrame(rafId);
    puffTimers.forEach(clearTimeout);
    if (ui) { ui.root.hidden = true; ui.wrap.classList.remove("puffing"); }
  }

  // ---------------------------------------------------------------------
  // Keyboard: Alt+S, Space push-to-talk, hidden demo controls
  // ---------------------------------------------------------------------
  function focusedIsInput() {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
    if (!el) return false;
    if (el.isContentEditable) return true;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return true;
    // a page button would be "clicked" by Space; our own buttons are fine
    if (el.tagName === "BUTTON" && el.getRootNode() !== shadow) return true;
    return false;
  }

  function demo(name) {
    const be = backend();
    const fn = be && be.demo && be.demo[name];
    if (typeof fn !== "function") { problem(`This backend has no demo.${name}() hook.`); return; }
    try { fn.call(be.demo); } catch (err) { problem(`Demo control failed: ${errText(err)}.`); }
  }

  window.addEventListener("keydown", (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      if (e.code === "KeyS") {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) (active ? dismiss : summon)();
        return;
      }
      if (!active) return;
      const action = {
        ArrowUp: () => demo("levelUp"),
        ArrowDown: () => demo("levelDown"),
        KeyD: () => demo("drillOffer"),
        Digit1: () => call("setLanguage", "fr"),
        Digit2: () => call("setLanguage", "de"),
        Digit3: () => call("setLanguage", "es"),
        Digit4: () => call("setLanguage", "sv"),
        Digit5: () => call("setLanguage", "hi"),
      }[e.code];
      if (action) {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) action();
      }
      return;
    }
    if (e.code === "Space" && active && !muted && !e.ctrlKey && !e.metaKey && !focusedIsInput()) {
      e.preventDefault();
      if (!e.repeat) startTalk();
    }
  }, true);

  window.addEventListener("keyup", (e) => {
    if (e.code === "Space" && talking) { e.preventDefault(); stopTalk(); }
  }, true);
  window.addEventListener("blur", () => stopTalk());
  window.addEventListener("resize", () => fit());
})();
