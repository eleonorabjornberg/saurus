/*
 * backend-mock.js — a fake SaurusBackend for offline demos.
 *
 * Implements the interface documented in README.md with scripted replies,
 * timers and a synthesized "voice" (a soft hum, 24 kHz mono Int16 PCM) so
 * every front-end feature can be demoed without a server.
 *
 * Mock-only tricks (not part of the real interface):
 *   sendText("/error")  -> emits an "error" event (to demo the error path)
 */
(function () {
  "use strict";
  if (window.SaurusBackend) return; // a real backend is already present

  // ---------------------------------------------------------------------
  // Tiny dictionary used to "translate" pages. English -> fr / de / es.
  // ---------------------------------------------------------------------
  const DICT = {
    mountain: ["montagne", "Berg", "montaña"], mountains: ["montagnes", "Berge", "montañas"],
    village: ["village", "Dorf", "pueblo"], morning: ["matin", "Morgen", "mañana"],
    day: ["jour", "Tag", "día"], night: ["nuit", "Nacht", "noche"],
    sun: ["soleil", "Sonne", "sol"], snow: ["neige", "Schnee", "nieve"],
    water: ["eau", "Wasser", "agua"], river: ["rivière", "Fluss", "río"],
    lake: ["lac", "See", "lago"], bread: ["pain", "Brot", "pan"],
    coffee: ["café", "Kaffee", "café"], cheese: ["fromage", "Käse", "queso"],
    house: ["maison", "Haus", "casa"], road: ["route", "Straße", "camino"],
    path: ["sentier", "Pfad", "sendero"], friend: ["ami", "Freund", "amigo"],
    friends: ["amis", "Freunde", "amigos"], family: ["famille", "Familie", "familia"],
    train: ["train", "Zug", "tren"], station: ["gare", "Bahnhof", "estación"],
    tree: ["arbre", "Baum", "árbol"], trees: ["arbres", "Bäume", "árboles"],
    bird: ["oiseau", "Vogel", "pájaro"], birds: ["oiseaux", "Vögel", "pájaros"],
    dog: ["chien", "Hund", "perro"], cat: ["chat", "Katze", "gato"],
    book: ["livre", "Buch", "libro"], window: ["fenêtre", "Fenster", "ventana"],
    door: ["porte", "Tür", "puerta"], market: ["marché", "Markt", "mercado"],
    food: ["nourriture", "Essen", "comida"], dinner: ["dîner", "Abendessen", "cena"],
    breakfast: ["petit-déjeuner", "Frühstück", "desayuno"], weekend: ["week-end", "Wochenende", "fin de semana"],
    summer: ["été", "Sommer", "verano"], winter: ["hiver", "Winter", "invierno"],
    weather: ["météo", "Wetter", "tiempo"], cold: ["froid", "kalt", "frío"],
    warm: ["chaud", "warm", "cálido"], beautiful: ["beau", "schön", "hermoso"],
    small: ["petit", "klein", "pequeño"], big: ["grand", "groß", "grande"],
    old: ["vieux", "alt", "viejo"], new: ["nouveau", "neu", "nuevo"],
    happy: ["heureux", "glücklich", "feliz"], quiet: ["calme", "ruhig", "tranquilo"],
    green: ["vert", "grün", "verde"], blue: ["bleu", "blau", "azul"],
    white: ["blanc", "weiß", "blanco"], red: ["rouge", "rot", "rojo"],
    walk: ["marcher", "wandern", "caminar"], eat: ["manger", "essen", "comer"],
    drink: ["boire", "trinken", "beber"], sleep: ["dormir", "schlafen", "dormir"],
    read: ["lire", "lesen", "leer"], always: ["toujours", "immer", "siempre"],
    today: ["aujourd'hui", "heute", "hoy"], tomorrow: ["demain", "morgen", "mañana"],
    slowly: ["lentement", "langsam", "despacio"], city: ["ville", "Stadt", "ciudad"],
    hotel: ["hôtel", "Hotel", "hotel"], room: ["chambre", "Zimmer", "habitación"],
    garden: ["jardin", "Garten", "jardín"], flowers: ["fleurs", "Blumen", "flores"],
    church: ["église", "Kirche", "iglesia"], bridge: ["pont", "Brücke", "puente"],
    music: ["musique", "Musik", "música"], time: ["temps", "Zeit", "tiempo"],
    week: ["semaine", "Woche", "semana"], people: ["gens", "Leute", "gente"],
    child: ["enfant", "Kind", "niño"], children: ["enfants", "Kinder", "niños"],
    wine: ["vin", "Wein", "vino"], apple: ["pomme", "Apfel", "manzana"],
    apples: ["pommes", "Äpfel", "manzanas"], hill: ["colline", "Hügel", "colina"],
    valley: ["vallée", "Tal", "valle"], sky: ["ciel", "Himmel", "cielo"],
    cake: ["gâteau", "Kuchen", "pastel"],
    law: ["loi", "Gesetz", "ley"], laws: ["lois", "Gesetze", "leyes"],
    rules: ["règles", "Regeln", "reglas"], company: ["entreprise", "Unternehmen", "empresa"],
    companies: ["entreprises", "Unternehmen", "empresas"], risk: ["risque", "Risiko", "riesgo"],
    data: ["données", "Daten", "datos"], court: ["tribunal", "Gericht", "tribunal"],
    money: ["argent", "Geld", "dinero"], bank: ["banque", "Bank", "banco"],
    banks: ["banques", "Banken", "bancos"], work: ["travail", "Arbeit", "trabajo"],
    government: ["gouvernement", "Regierung", "gobierno"], year: ["année", "Jahr", "año"],
    years: ["années", "Jahre", "años"], country: ["pays", "Land", "país"],
    countries: ["pays", "Länder", "países"], important: ["important", "wichtig", "importante"],
    question: ["question", "Frage", "pregunta"], decision: ["décision", "Entscheidung", "decisión"],
    price: ["prix", "Preis", "precio"], customers: ["clients", "Kunden", "clientes"],
    report: ["rapport", "Bericht", "informe"], team: ["équipe", "Team", "equipo"],
    future: ["avenir", "Zukunft", "futuro"], world: ["monde", "Welt", "mundo"],
    simple: ["simple", "einfach", "sencillo"], free: ["libre", "frei", "libre"],
    fine: ["amende", "Geldstrafe", "multa"], fines: ["amendes", "Geldstrafen", "multas"],
    loan: ["prêt", "Kredit", "préstamo"], job: ["emploi", "Job", "empleo"],
    jobs: ["emplois", "Jobs", "empleos"], human: ["humain", "Mensch", "humano"],
    reason: ["raison", "Grund", "razón"], machine: ["machine", "Maschine", "máquina"],
  };
  const LANG_INDEX = { fr: 0, de: 1, es: 2 };
  const LANG_NAME = { fr: "French", de: "German", es: "Spanish" };
  const DENSITY = { 1: 0.25, 2: 0.5, 3: 0.8, 4: 1 };

  // Reverse lookup: foreign word (lower case) -> English
  const REVERSE = {};
  for (const [en, tr] of Object.entries(DICT)) {
    for (const w of tr) REVERSE[w.toLowerCase()] = en;
  }

  const SCRIPT = {
    fr: {
      hello: "Bonjour ! I'm Saurus. I put some French into this page for you. Tap any word you don't know. Alors, qu'en penses-tu ?",
      heard: ["Comment dit-on mountain en français ?", "J'aime beaucoup le fromage.", "Je voudrais un café, s'il vous plaît."],
      replies: [
        "Très bien ! Your French is getting stronger.",
        "Bravo ! Remember: « le » for masculine words, « la » for feminine ones.",
        "Pas mal ! Try to say it again, a little slower.",
      ],
      drillTopic: "food words",
      drill: [["cheese", "fromage"], ["bread", "pain"], ["apple", "pomme"]],
      yes: "C'est parti !", no: "D'accord, later then!", correct: "Parfait !",
    },
    de: {
      hello: "Hallo! Jetzt auf Deutsch. Was ist die wichtigste Idee hier?",
      heard: ["Wie sagt man mountain auf Deutsch?", "Ich trinke gern Kaffee.", "Das Wetter ist heute schön."],
      replies: [
        "Sehr gut! German nouns always start with a capital letter.",
        "Prima! You're sounding more natural already.",
        "Gut gemacht! Let's keep going.",
      ],
      drillTopic: "weather words",
      drill: [["snow", "Schnee"], ["sun", "Sonne"], ["cold", "kalt"]],
      yes: "Los geht's!", no: "Kein Problem, maybe later!", correct: "Genau!",
    },
    es: {
      hello: "¡Hola! Ahora en español. ¿Qué te parece este artículo?",
      heard: ["¿Cómo se dice mountain en español?", "Me gusta mucho el queso.", "Quiero un café, por favor."],
      replies: [
        "¡Muy bien! Your Spanish is improving.",
        "¡Genial! Remember to roll that R.",
        "¡Bien hecho! Let's try another one.",
      ],
      drillTopic: "travel words",
      drill: [["train", "tren"], ["road", "camino"], ["hotel", "hotel"]],
      yes: "¡Vamos!", no: "¡No pasa nada! Later.", correct: "¡Perfecto!",
    },
  };

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  const handlers = {};
  let timers = [];
  let lang = (window.SAURUS_CONFIG && window.SAURUS_CONFIG.language) || "de";
  const levels = { fr: 1, de: 1, es: 1 };
  let running = false;
  let state = "idle";
  let pageWords = []; // [{foreign, en}] words the last translation used
  let replyIdx = 0, heardIdx = 0;
  let listening = null; // {samples, words, lastPartial}
  let speech = null; // {words, said, partial}
  let drill = null; // {step, items}

  function emit(name, data) {
    for (const h of handlers[name] || []) {
      try { h(data); } catch (e) { console.error("[saurus-mock] handler error", e); }
    }
  }
  function later(ms, fn) {
    const t = setTimeout(() => { timers = timers.filter((x) => x !== t); fn(); }, ms);
    timers.push(t);
    return t;
  }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function setState(s) { if (s !== state) { state = s; emit("state", s); } }

  // ---------------------------------------------------------------------
  // Fake voice: a syllabic hum so the avatar has something to bob to.
  // ---------------------------------------------------------------------
  const RATE = 24000;
  const WORD_MS = 300;
  function synth(seconds) {
    const n = Math.floor(seconds * RATE);
    const out = new Int16Array(n);
    const sylLen = 0.17 * RATE;
    let phase = 0;
    let pitch = 200, amp = 0.2;
    for (let i = 0; i < n; i++) {
      const sylPos = (i % sylLen) / sylLen;
      if (i % sylLen === 0) {
        pitch = 170 + Math.random() * 80;
        amp = Math.random() < 0.15 ? 0 : 0.12 + Math.random() * 0.12; // occasional pause
      }
      phase += (2 * Math.PI * (pitch + 6 * Math.sin(i / 900))) / RATE;
      const env = Math.sin(Math.PI * sylPos) ** 1.5;
      const v = (Math.sin(phase) + 0.45 * Math.sin(2 * phase) + 0.2 * Math.sin(3 * phase)) / 1.65;
      out[i] = Math.max(-32767, Math.min(32767, v * env * amp * 32767));
    }
    return out;
  }

  // Speak a line: state "speaking", transcript revealed word by word,
  // audio streamed in 100 ms chunks, then "idle". `after` runs when done.
  function speak(text, after) {
    cancelSpeech();
    const words = text.split(/\s+/).filter(Boolean);
    const total = words.length * WORD_MS + 300;
    speech = { words, said: 0 };
    setState("speaking");
    // audio: 100 ms chunks, delivered a little faster than real time
    const pcm = synth(total / 1000);
    const chunk = RATE / 10;
    for (let off = 0, k = 0; off < pcm.length; off += chunk, k++) {
      const piece = pcm.slice(off, off + chunk);
      speech.timers = speech.timers || [];
      speech.timers.push(later(k * 80, () => emit("audio", piece)));
    }
    // transcript
    words.forEach((_, i) => {
      speech.timers.push(later(i * WORD_MS + 60, () => {
        speech.said = i + 1;
        emit("transcript", { who: "saurus", text: words.slice(0, i + 1).join(" "), final: false });
      }));
    });
    speech.timers.push(later(total, () => {
      emit("transcript", { who: "saurus", text, final: true });
      speech = null;
      setState("idle");
      if (after) after();
    }));
  }
  function cancelSpeech() {
    if (!speech) return;
    for (const t of speech.timers || []) clearTimeout(t);
    timers = timers.filter((t) => !(speech.timers || []).includes(t));
    if (speech.said > 0) {
      emit("transcript", { who: "saurus", text: speech.words.slice(0, speech.said).join(" ") + " —", final: true });
    }
    speech = null;
  }

  function think(ms, fn) {
    setState("thinking");
    later(ms, fn);
  }

  // ---------------------------------------------------------------------
  // Replies
  // ---------------------------------------------------------------------
  function pickPageWord() {
    if (!pageWords.length) return null;
    return pageWords[Math.floor(Math.random() * pageWords.length)];
  }

  function reply(userText) {
    const s = SCRIPT[lang];
    const t = userText.trim().toLowerCase();

    if (drill) return drillAnswer(t);
    if (/^(yes|yeah|sure|ok|okay|oui|ja|sí|si)\b/.test(t) && drill === null && lastOffer) {
      lastOffer = null;
      return startDrill();
    }
    if (/^(not now|no|nope|non|nein)\b/.test(t) && lastOffer) {
      lastOffer = null;
      return think(500, () => speak(s.no));
    }
    lastOffer = null;

    think(900, () => {
      const w = pickPageWord();
      let line = s.replies[replyIdx++ % s.replies.length];
      if (w && Math.random() < 0.7) {
        emit("highlight", { text: w.foreign });
        line += ` Look at « ${w.foreign} » on the page: it means “${w.en}”.`;
      }
      speak(line);
    });
  }

  let lastOffer = null;
  function offerDrill() {
    lastOffer = SCRIPT[lang].drillTopic;
    emit("drill_offer", { topic: lastOffer });
  }
  function startDrill() {
    drill = { step: 0, items: SCRIPT[lang].drill, score: 0 };
    think(500, () => speak(`${SCRIPT[lang].yes} How do you say “${drill.items[0][0]}” in ${LANG_NAME[lang]}?`));
  }
  function drillAnswer(t) {
    const s = SCRIPT[lang];
    const [en, answer] = drill.items[drill.step];
    const ok = t.includes(answer.toLowerCase());
    if (ok) drill.score++;
    drill.step++;
    const verdict = ok ? s.correct : `Almost! “${en}” is « ${answer} ».`;
    think(700, () => {
      if (ok) emit("celebrate");
      if (drill.step < drill.items.length) {
        speak(`${verdict} Next: how do you say “${drill.items[drill.step][0]}”?`);
      } else {
        const score = drill.score;
        drill = null;
        speak(`${verdict} Drill done: ${score} out of 3!`, () => {
          if (score >= 2) changeLevel(+1);
        });
      }
    });
  }

  function changeLevel(delta) {
    const next = Math.max(1, Math.min(4, levels[lang] + delta));
    if (next === levels[lang]) return;
    levels[lang] = next;
    emit("level", { language: lang, level: next });
    if (delta > 0) emit("celebrate");
  }

  // ---------------------------------------------------------------------
  // Translation
  // ---------------------------------------------------------------------
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967295;
  }
  function translateText(text, language, level) {
    const li = LANG_INDEX[language] ?? 0;
    const density = DENSITY[level] ?? 0.25;
    const used = [];
    let any = false;
    const parts = text.split(/(\p{L}+)/u);
    const html = parts.map((part, i) => {
      if (i % 2 === 0) return escapeHtml(part);
      const tr = DICT[part.toLowerCase()];
      if (!tr) return escapeHtml(part);
      if (hash(part + i + text.length) > density && !(level === 1 && !any && i > parts.length / 2)) {
        return escapeHtml(part);
      }
      any = true;
      let f = tr[li];
      if (part[0] === part[0].toUpperCase()) f = f[0].toUpperCase() + f.slice(1);
      used.push({ foreign: f, en: part.toLowerCase() });
      return `<mark>${escapeHtml(f)}</mark>`;
    }).join("");
    return { html, used };
  }

  // ---------------------------------------------------------------------
  // The interface
  // ---------------------------------------------------------------------
  window.SaurusBackend = {
    start({ pageUrl, pageText } = {}) {
      clearTimers();
      running = true;
      drill = null; lastOffer = null; listening = null; speech = null;
      console.info("[saurus-mock] start", pageUrl, (pageText || "").length, "chars");
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({ language: lang, level: levels[lang] });
          setState("idle");
          later(900, () => running && speak(SCRIPT[lang].hello));
        }, 500);
      });
    },

    translatePage({ blocks = [], language = lang, level = 1 } = {}) {
      return new Promise((resolve) => {
        setTimeout(() => {
          pageWords = [];
          const out = blocks.map(({ id, text }) => {
            const { html, used } = translateText(text, language, level);
            pageWords.push(...used);
            return { id, html };
          });
          resolve(out);
        }, 700);
      });
    },

    sendAudio(pcm) {
      if (!running) return;
      if (!listening) {
        cancelSpeech(); // barge-in
        clearTimers();
        listening = { samples: 0, words: SCRIPT[lang].heard[heardIdx++ % SCRIPT[lang].heard.length].split(" "), shown: 0 };
        setState("listening");
      }
      listening.samples += pcm.length;
      // reveal one "recognized" word per 350 ms of audio
      const shown = Math.min(listening.words.length, Math.floor(listening.samples / 16000 / 0.35));
      if (shown > listening.shown) {
        listening.shown = shown;
        emit("transcript", { who: "user", text: listening.words.slice(0, shown).join(" "), final: false });
      }
    },

    endOfSpeech() {
      if (!running || !listening) return;
      const l = listening;
      listening = null;
      if (l.samples < 16000 * 0.3) {
        emit("transcript", { who: "user", text: "…", final: true });
        think(400, () => speak("Sorry, I didn't catch that. Hold the button a bit longer."));
        return;
      }
      const text = l.words.join(" ");
      emit("transcript", { who: "user", text, final: true });
      reply(text);
    },

    sendText(text) {
      if (!running) return;
      cancelSpeech();
      if (String(text).trim() === "/error") {
        later(300, () => { setState("idle"); emit("error", { message: "Mock backend: simulated server error." }); });
        return;
      }
      reply(String(text));
    },

    sendContext(ctx) {
      if (!running || !ctx || ctx.type !== "word_pressed") return;
      cancelSpeech();
      const word = String(ctx.word || "");
      const en = REVERSE[word.toLowerCase()];
      think(600, () => {
        emit("highlight", { text: word });
        if (en) {
          speak(`« ${word} » means “${en}”. Try using it out loud: “${capitalize(ctx.sentence || word)}”`);
        } else if (DICT[word.toLowerCase()]) {
          const f = DICT[word.toLowerCase()][LANG_INDEX[lang]];
          speak(`In ${LANG_NAME[lang]}, “${word}” is « ${f} ».`);
        } else {
          speak(`“${word}”: that one stays in English for now. Want to hear it in a sentence?`);
        }
      });
    },

    setLanguage(code) {
      if (!(code in LANG_INDEX) || !running) return;
      cancelSpeech();
      clearTimers();
      drill = null; lastOffer = null;
      lang = code;
      emit("language", { code });
      emit("level", { language: code, level: levels[code] });
      later(900, () => speak(SCRIPT[code].hello));
    },

    stop() {
      running = false;
      clearTimers();
      speech = null; listening = null; drill = null; lastOffer = null;
      state = "idle";
    },

    on(name, handler) {
      (handlers[name] = handlers[name] || []).push(handler);
    },

    // Optional demo hooks (Alt+ArrowUp / Alt+ArrowDown / Alt+D in saurus.js)
    demo: {
      levelUp() { if (running) changeLevel(+1); },
      levelDown() { if (running) changeLevel(-1); },
      drillOffer() {
        if (!running) return;
        cancelSpeech();
        setState("idle");
        offerDrill();
      },
    },
  };

  function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
})();
