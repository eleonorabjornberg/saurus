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
  // Tiny dictionary used to "translate" pages. English -> fr / de / es / sv.
  // ---------------------------------------------------------------------
  const DICT = {
    mountain: ["montagne", "Berg", "montaña", "berg"], mountains: ["montagnes", "Berge", "montañas", "berg"],
    village: ["village", "Dorf", "pueblo", "by"], morning: ["matin", "Morgen", "mañana", "morgon"],
    day: ["jour", "Tag", "día", "dag"], night: ["nuit", "Nacht", "noche", "natt"],
    sun: ["soleil", "Sonne", "sol", "sol"], snow: ["neige", "Schnee", "nieve", "snö"],
    water: ["eau", "Wasser", "agua", "vatten"], river: ["rivière", "Fluss", "río", "flod"],
    lake: ["lac", "See", "lago", "sjö"], bread: ["pain", "Brot", "pan", "bröd"],
    coffee: ["café", "Kaffee", "café", "kaffe"], cheese: ["fromage", "Käse", "queso", "ost"],
    house: ["maison", "Haus", "casa", "hus"], road: ["route", "Straße", "camino", "väg"],
    path: ["sentier", "Pfad", "sendero", "stig"], friend: ["ami", "Freund", "amigo", "vän"],
    friends: ["amis", "Freunde", "amigos", "vänner"], family: ["famille", "Familie", "familia", "familj"],
    train: ["train", "Zug", "tren", "tåg"], station: ["gare", "Bahnhof", "estación", "station"],
    tree: ["arbre", "Baum", "árbol", "träd"], trees: ["arbres", "Bäume", "árboles", "träd"],
    bird: ["oiseau", "Vogel", "pájaro", "fågel"], birds: ["oiseaux", "Vögel", "pájaros", "fåglar"],
    dog: ["chien", "Hund", "perro", "hund"], cat: ["chat", "Katze", "gato", "katt"],
    book: ["livre", "Buch", "libro", "bok"], window: ["fenêtre", "Fenster", "ventana", "fönster"],
    door: ["porte", "Tür", "puerta", "dörr"], market: ["marché", "Markt", "mercado", "marknad"],
    food: ["nourriture", "Essen", "comida", "mat"], dinner: ["dîner", "Abendessen", "cena", "middag"],
    breakfast: ["petit-déjeuner", "Frühstück", "desayuno", "frukost"], weekend: ["week-end", "Wochenende", "fin de semana", "helg"],
    summer: ["été", "Sommer", "verano", "sommar"], winter: ["hiver", "Winter", "invierno", "vinter"],
    weather: ["météo", "Wetter", "tiempo", "väder"], cold: ["froid", "kalt", "frío", "kall"],
    warm: ["chaud", "warm", "cálido", "varm"], beautiful: ["beau", "schön", "hermoso", "vacker"],
    small: ["petit", "klein", "pequeño", "liten"], big: ["grand", "groß", "grande", "stor"],
    old: ["vieux", "alt", "viejo", "gammal"], new: ["nouveau", "neu", "nuevo", "ny"],
    happy: ["heureux", "glücklich", "feliz", "glad"], quiet: ["calme", "ruhig", "tranquilo", "tyst"],
    green: ["vert", "grün", "verde", "grön"], blue: ["bleu", "blau", "azul", "blå"],
    white: ["blanc", "weiß", "blanco", "vit"], red: ["rouge", "rot", "rojo", "röd"],
    walk: ["marcher", "wandern", "caminar", "gå"], eat: ["manger", "essen", "comer", "äta"],
    drink: ["boire", "trinken", "beber", "dricka"], sleep: ["dormir", "schlafen", "dormir", "sova"],
    read: ["lire", "lesen", "leer", "läsa"], always: ["toujours", "immer", "siempre", "alltid"],
    today: ["aujourd'hui", "heute", "hoy", "idag"], tomorrow: ["demain", "morgen", "mañana", "imorgon"],
    slowly: ["lentement", "langsam", "despacio", "långsamt"], city: ["ville", "Stadt", "ciudad", "stad"],
    hotel: ["hôtel", "Hotel", "hotel", "hotell"], room: ["chambre", "Zimmer", "habitación", "rum"],
    garden: ["jardin", "Garten", "jardín", "trädgård"], flowers: ["fleurs", "Blumen", "flores", "blommor"],
    church: ["église", "Kirche", "iglesia", "kyrka"], bridge: ["pont", "Brücke", "puente", "bro"],
    music: ["musique", "Musik", "música", "musik"], time: ["temps", "Zeit", "tiempo", "tid"],
    week: ["semaine", "Woche", "semana", "vecka"], people: ["gens", "Leute", "gente", "människor"],
    child: ["enfant", "Kind", "niño", "barn"], children: ["enfants", "Kinder", "niños", "barn"],
    wine: ["vin", "Wein", "vino", "vin"], apple: ["pomme", "Apfel", "manzana", "äpple"],
    apples: ["pommes", "Äpfel", "manzanas", "äpplen"], hill: ["colline", "Hügel", "colina", "kulle"],
    valley: ["vallée", "Tal", "valle", "dal"], sky: ["ciel", "Himmel", "cielo", "himmel"],
    cake: ["gâteau", "Kuchen", "pastel", "kaka"],
    law: ["loi", "Gesetz", "ley", "lag"], laws: ["lois", "Gesetze", "leyes", "lagar"],
    rules: ["règles", "Regeln", "reglas", "regler"], company: ["entreprise", "Unternehmen", "empresa", "företag"],
    companies: ["entreprises", "Unternehmen", "empresas", "företag"], risk: ["risque", "Risiko", "riesgo", "risk"],
    data: ["données", "Daten", "datos", "data"], court: ["tribunal", "Gericht", "tribunal", "domstol"],
    money: ["argent", "Geld", "dinero", "pengar"], bank: ["banque", "Bank", "banco", "bank"],
    banks: ["banques", "Banken", "bancos", "banker"], work: ["travail", "Arbeit", "trabajo", "arbete"],
    government: ["gouvernement", "Regierung", "gobierno", "regering"], year: ["année", "Jahr", "año", "år"],
    years: ["années", "Jahre", "años", "år"], country: ["pays", "Land", "país", "land"],
    countries: ["pays", "Länder", "países", "länder"], important: ["important", "wichtig", "importante", "viktig"],
    question: ["question", "Frage", "pregunta", "fråga"], decision: ["décision", "Entscheidung", "decisión", "beslut"],
    price: ["prix", "Preis", "precio", "pris"], customers: ["clients", "Kunden", "clientes", "kunder"],
    report: ["rapport", "Bericht", "informe", "rapport"], team: ["équipe", "Team", "equipo", "team"],
    future: ["avenir", "Zukunft", "futuro", "framtid"], world: ["monde", "Welt", "mundo", "värld"],
    simple: ["simple", "einfach", "sencillo", "enkel"], free: ["libre", "frei", "libre", "fri"],
    fine: ["amende", "Geldstrafe", "multa", "böter"], fines: ["amendes", "Geldstrafen", "multas", "böter"],
    loan: ["prêt", "Kredit", "préstamo", "lån"], job: ["emploi", "Job", "empleo", "jobb"],
    jobs: ["emplois", "Jobs", "empleos", "jobb"], human: ["humain", "Mensch", "humano", "människa"],
    reason: ["raison", "Grund", "razón", "anledning"], machine: ["machine", "Maschine", "máquina", "maskin"],
  };
  const LANG_INDEX = { fr: 0, de: 1, es: 2, sv: 3 };
  const LANG_NAME = { fr: "French", de: "German", es: "Spanish", sv: "Swedish" };
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
    sv: {
      hello: "Hej! Nu på svenska. Vad tycker du om artikeln?",
      heard: ["Hur säger man mountain på svenska?", "Jag dricker gärna kaffe.", "Vädret är fint idag."],
      replies: [
        "Mycket bra! In Swedish the verb comes second in the sentence.",
        "Snyggt! You're getting the melody of Swedish.",
        "Bra jobbat! Let's keep going.",
      ],
      drillTopic: "fika words",
      drill: [["coffee", "kaffe"], ["cake", "kaka"], ["bread", "bröd"]],
      yes: "Kör!", no: "Inga problem, later!", correct: "Precis!",
    },
  };

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  const handlers = {};
  let timers = [];
  let lang = (window.SAURUS_CONFIG && window.SAURUS_CONFIG.language) || "de";
  const levels = { fr: 1, de: 1, es: 1, sv: 1 };
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
    if (window.SaurusAccount) window.SaurusAccount.memory("level", { language: lang, level: next }).catch((e) => emit("error", { message: e.message }));
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
    async restoreAccount(profile) {
      lang = profile.language || "es";
      for (const code of Object.keys(levels)) levels[code] = 1;
      if (window.SaurusAccount) {
        const memory = await window.SaurusAccount.memory("memory", { language: lang });
        levels[lang] = memory.level || 1;
      }
    },
    start({ pageUrl, pageText } = {}) {
      clearTimers();
      running = true;
      drill = null; lastOffer = null; listening = null; speech = null;
      console.info("[saurus-mock] start", pageUrl, (pageText || "").length, "chars");
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({ language: lang, level: levels[lang] });
          setState("idle");
          emit("transcript", { who: "saurus", text: "Offline demo mode: no Gemini key in config.js, so my voice is a placeholder and I can't really hear you.", final: true });
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

    async setLanguage(code) {
      if (!(code in LANG_INDEX) || !running) return;
      if (window.SaurusAccount) {
        await window.SaurusAccount.memory("preferences", { language: code });
        const memory = await window.SaurusAccount.memory("memory", { language: code });
        levels[code] = memory.level || 1;
      }
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
