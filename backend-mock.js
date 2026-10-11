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
  // Tiny dictionary used to "translate" pages. English -> fr / de / es / sv / hi
  // (it / pt / zh in DICT_MORE below).
  // ---------------------------------------------------------------------
  const DICT = {
    mountain: ["montagne", "Berg", "montaña", "berg", "पहाड़"], mountains: ["montagnes", "Berge", "montañas", "berg", "पहाड़"],
    village: ["village", "Dorf", "pueblo", "by", "गाँव"], morning: ["matin", "Morgen", "mañana", "morgon", "सुबह"],
    day: ["jour", "Tag", "día", "dag", "दिन"], night: ["nuit", "Nacht", "noche", "natt", "रात"],
    sun: ["soleil", "Sonne", "sol", "sol", "सूरज"], snow: ["neige", "Schnee", "nieve", "snö", "बर्फ़"],
    water: ["eau", "Wasser", "agua", "vatten", "पानी"], river: ["rivière", "Fluss", "río", "flod", "नदी"],
    lake: ["lac", "See", "lago", "sjö", "झील"], bread: ["pain", "Brot", "pan", "bröd", "रोटी"],
    coffee: ["café", "Kaffee", "café", "kaffe", "कॉफ़ी"], cheese: ["fromage", "Käse", "queso", "ost", "पनीर"],
    house: ["maison", "Haus", "casa", "hus", "घर"], road: ["route", "Straße", "camino", "väg", "सड़क"],
    path: ["sentier", "Pfad", "sendero", "stig", "रास्ता"], friend: ["ami", "Freund", "amigo", "vän", "दोस्त"],
    friends: ["amis", "Freunde", "amigos", "vänner", "दोस्त"], family: ["famille", "Familie", "familia", "familj", "परिवार"],
    train: ["train", "Zug", "tren", "tåg", "ट्रेन"], station: ["gare", "Bahnhof", "estación", "station", "स्टेशन"],
    tree: ["arbre", "Baum", "árbol", "träd", "पेड़"], trees: ["arbres", "Bäume", "árboles", "träd", "पेड़"],
    bird: ["oiseau", "Vogel", "pájaro", "fågel", "चिड़िया"], birds: ["oiseaux", "Vögel", "pájaros", "fåglar", "चिड़ियाँ"],
    dog: ["chien", "Hund", "perro", "hund", "कुत्ता"], cat: ["chat", "Katze", "gato", "katt", "बिल्ली"],
    book: ["livre", "Buch", "libro", "bok", "किताब"], window: ["fenêtre", "Fenster", "ventana", "fönster", "खिड़की"],
    door: ["porte", "Tür", "puerta", "dörr", "दरवाज़ा"], market: ["marché", "Markt", "mercado", "marknad", "बाज़ार"],
    food: ["nourriture", "Essen", "comida", "mat", "खाना"], dinner: ["dîner", "Abendessen", "cena", "middag", "रात का खाना"],
    breakfast: ["petit-déjeuner", "Frühstück", "desayuno", "frukost", "नाश्ता"], weekend: ["week-end", "Wochenende", "fin de semana", "helg", "सप्ताहांत"],
    summer: ["été", "Sommer", "verano", "sommar", "गर्मी"], winter: ["hiver", "Winter", "invierno", "vinter", "सर्दी"],
    weather: ["météo", "Wetter", "tiempo", "väder", "मौसम"], cold: ["froid", "kalt", "frío", "kall", "ठंडा"],
    warm: ["chaud", "warm", "cálido", "varm", "गरम"], beautiful: ["beau", "schön", "hermoso", "vacker", "सुंदर"],
    small: ["petit", "klein", "pequeño", "liten", "छोटा"], big: ["grand", "groß", "grande", "stor", "बड़ा"],
    old: ["vieux", "alt", "viejo", "gammal", "पुराना"], new: ["nouveau", "neu", "nuevo", "ny", "नया"],
    happy: ["heureux", "glücklich", "feliz", "glad", "ख़ुश"], quiet: ["calme", "ruhig", "tranquilo", "tyst", "शांत"],
    green: ["vert", "grün", "verde", "grön", "हरा"], blue: ["bleu", "blau", "azul", "blå", "नीला"],
    white: ["blanc", "weiß", "blanco", "vit", "सफ़ेद"], red: ["rouge", "rot", "rojo", "röd", "लाल"],
    walk: ["marcher", "wandern", "caminar", "gå", "चलना"], eat: ["manger", "essen", "comer", "äta", "खाना"],
    drink: ["boire", "trinken", "beber", "dricka", "पीना"], sleep: ["dormir", "schlafen", "dormir", "sova", "सोना"],
    read: ["lire", "lesen", "leer", "läsa", "पढ़ना"], always: ["toujours", "immer", "siempre", "alltid", "हमेशा"],
    today: ["aujourd'hui", "heute", "hoy", "idag", "आज"], tomorrow: ["demain", "morgen", "mañana", "imorgon", "कल"],
    slowly: ["lentement", "langsam", "despacio", "långsamt", "धीरे"], city: ["ville", "Stadt", "ciudad", "stad", "शहर"],
    hotel: ["hôtel", "Hotel", "hotel", "hotell", "होटल"], room: ["chambre", "Zimmer", "habitación", "rum", "कमरा"],
    garden: ["jardin", "Garten", "jardín", "trädgård", "बगीचा"], flowers: ["fleurs", "Blumen", "flores", "blommor", "फूल"],
    church: ["église", "Kirche", "iglesia", "kyrka", "चर्च"], bridge: ["pont", "Brücke", "puente", "bro", "पुल"],
    music: ["musique", "Musik", "música", "musik", "संगीत"], time: ["temps", "Zeit", "tiempo", "tid", "समय"],
    week: ["semaine", "Woche", "semana", "vecka", "हफ़्ता"], people: ["gens", "Leute", "gente", "människor", "लोग"],
    child: ["enfant", "Kind", "niño", "barn", "बच्चा"], children: ["enfants", "Kinder", "niños", "barn", "बच्चे"],
    wine: ["vin", "Wein", "vino", "vin", "शराब"], apple: ["pomme", "Apfel", "manzana", "äpple", "सेब"],
    apples: ["pommes", "Äpfel", "manzanas", "äpplen", "सेब"], hill: ["colline", "Hügel", "colina", "kulle", "पहाड़ी"],
    valley: ["vallée", "Tal", "valle", "dal", "घाटी"], sky: ["ciel", "Himmel", "cielo", "himmel", "आसमान"],
    cake: ["gâteau", "Kuchen", "pastel", "kaka", "केक"],
    law: ["loi", "Gesetz", "ley", "lag", "क़ानून"], laws: ["lois", "Gesetze", "leyes", "lagar", "क़ानून"],
    rules: ["règles", "Regeln", "reglas", "regler", "नियम"], company: ["entreprise", "Unternehmen", "empresa", "företag", "कंपनी"],
    companies: ["entreprises", "Unternehmen", "empresas", "företag", "कंपनियाँ"], risk: ["risque", "Risiko", "riesgo", "risk", "जोखिम"],
    data: ["données", "Daten", "datos", "data", "डेटा"], court: ["tribunal", "Gericht", "tribunal", "domstol", "अदालत"],
    money: ["argent", "Geld", "dinero", "pengar", "पैसा"], bank: ["banque", "Bank", "banco", "bank", "बैंक"],
    banks: ["banques", "Banken", "bancos", "banker", "बैंक"], work: ["travail", "Arbeit", "trabajo", "arbete", "काम"],
    government: ["gouvernement", "Regierung", "gobierno", "regering", "सरकार"], year: ["année", "Jahr", "año", "år", "साल"],
    years: ["années", "Jahre", "años", "år", "साल"], country: ["pays", "Land", "país", "land", "देश"],
    countries: ["pays", "Länder", "países", "länder", "देश"], important: ["important", "wichtig", "importante", "viktig", "ज़रूरी"],
    question: ["question", "Frage", "pregunta", "fråga", "सवाल"], decision: ["décision", "Entscheidung", "decisión", "beslut", "फ़ैसला"],
    price: ["prix", "Preis", "precio", "pris", "क़ीमत"], customers: ["clients", "Kunden", "clientes", "kunder", "ग्राहक"],
    report: ["rapport", "Bericht", "informe", "rapport", "रिपोर्ट"], team: ["équipe", "Team", "equipo", "team", "टीम"],
    future: ["avenir", "Zukunft", "futuro", "framtid", "भविष्य"], world: ["monde", "Welt", "mundo", "värld", "दुनिया"],
    simple: ["simple", "einfach", "sencillo", "enkel", "आसान"], free: ["libre", "frei", "libre", "fri", "आज़ाद"],
    fine: ["amende", "Geldstrafe", "multa", "böter", "जुर्माना"], fines: ["amendes", "Geldstrafen", "multas", "böter", "जुर्माने"],
    loan: ["prêt", "Kredit", "préstamo", "lån", "क़र्ज़"], job: ["emploi", "Job", "empleo", "jobb", "नौकरी"],
    jobs: ["emplois", "Jobs", "empleos", "jobb", "नौकरियाँ"], human: ["humain", "Mensch", "humano", "människa", "इंसान"],
    reason: ["raison", "Grund", "razón", "anledning", "कारण"], machine: ["machine", "Maschine", "máquina", "maskin", "मशीन"],
  };
  // Italian, Brazilian Portuguese and Mandarin (characters + pinyin) for the
  // same words, kept apart so the five original columns stay as they were.
  const DICT_MORE = {
    mountain: ["montagna", "montanha", "山", "shān"],
    mountains: ["montagne", "montanhas", "山", "shān"],
    village: ["villaggio", "vila", "村庄", "cūnzhuāng"],
    morning: ["mattina", "manhã", "早上", "zǎoshang"],
    day: ["giorno", "dia", "天", "tiān"],
    night: ["notte", "noite", "夜晚", "yèwǎn"],
    sun: ["sole", "sol", "太阳", "tàiyáng"],
    snow: ["neve", "neve", "雪", "xuě"],
    water: ["acqua", "água", "水", "shuǐ"],
    river: ["fiume", "rio", "河", "hé"],
    lake: ["lago", "lago", "湖", "hú"],
    bread: ["pane", "pão", "面包", "miànbāo"],
    coffee: ["caffè", "café", "咖啡", "kāfēi"],
    cheese: ["formaggio", "queijo", "奶酪", "nǎilào"],
    house: ["casa", "casa", "房子", "fángzi"],
    road: ["strada", "estrada", "路", "lù"],
    path: ["sentiero", "trilha", "小路", "xiǎolù"],
    friend: ["amico", "amigo", "朋友", "péngyou"],
    friends: ["amici", "amigos", "朋友们", "péngyoumen"],
    family: ["famiglia", "família", "家人", "jiārén"],
    train: ["treno", "trem", "火车", "huǒchē"],
    station: ["stazione", "estação", "车站", "chēzhàn"],
    tree: ["albero", "árvore", "树", "shù"],
    trees: ["alberi", "árvores", "树", "shù"],
    bird: ["uccello", "pássaro", "鸟", "niǎo"],
    birds: ["uccelli", "pássaros", "鸟", "niǎo"],
    dog: ["cane", "cachorro", "狗", "gǒu"],
    cat: ["gatto", "gato", "猫", "māo"],
    book: ["libro", "livro", "书", "shū"],
    window: ["finestra", "janela", "窗户", "chuānghu"],
    door: ["porta", "porta", "门", "mén"],
    market: ["mercato", "mercado", "市场", "shìchǎng"],
    food: ["cibo", "comida", "食物", "shíwù"],
    dinner: ["cena", "jantar", "晚饭", "wǎnfàn"],
    breakfast: ["colazione", "café da manhã", "早饭", "zǎofàn"],
    weekend: ["fine settimana", "fim de semana", "周末", "zhōumò"],
    summer: ["estate", "verão", "夏天", "xiàtiān"],
    winter: ["inverno", "inverno", "冬天", "dōngtiān"],
    weather: ["tempo", "tempo", "天气", "tiānqì"],
    cold: ["freddo", "frio", "冷", "lěng"],
    warm: ["caldo", "quente", "暖和", "nuǎnhuo"],
    beautiful: ["bello", "bonito", "美丽", "měilì"],
    small: ["piccolo", "pequeno", "小", "xiǎo"],
    big: ["grande", "grande", "大", "dà"],
    old: ["vecchio", "velho", "老", "lǎo"],
    new: ["nuovo", "novo", "新", "xīn"],
    happy: ["felice", "feliz", "快乐", "kuàilè"],
    quiet: ["tranquillo", "tranquilo", "安静", "ānjìng"],
    green: ["verde", "verde", "绿色", "lǜsè"],
    blue: ["blu", "azul", "蓝色", "lánsè"],
    white: ["bianco", "branco", "白色", "báisè"],
    red: ["rosso", "vermelho", "红色", "hóngsè"],
    walk: ["camminare", "caminhar", "散步", "sànbù"],
    eat: ["mangiare", "comer", "吃", "chī"],
    drink: ["bere", "beber", "喝", "hē"],
    sleep: ["dormire", "dormir", "睡觉", "shuìjiào"],
    read: ["leggere", "ler", "读", "dú"],
    always: ["sempre", "sempre", "总是", "zǒngshì"],
    today: ["oggi", "hoje", "今天", "jīntiān"],
    tomorrow: ["domani", "amanhã", "明天", "míngtiān"],
    slowly: ["lentamente", "devagar", "慢慢地", "mànmàn de"],
    city: ["città", "cidade", "城市", "chéngshì"],
    hotel: ["albergo", "hotel", "酒店", "jiǔdiàn"],
    room: ["stanza", "quarto", "房间", "fángjiān"],
    garden: ["giardino", "jardim", "花园", "huāyuán"],
    flowers: ["fiori", "flores", "花", "huā"],
    church: ["chiesa", "igreja", "教堂", "jiàotáng"],
    bridge: ["ponte", "ponte", "桥", "qiáo"],
    music: ["musica", "música", "音乐", "yīnyuè"],
    time: ["tempo", "tempo", "时间", "shíjiān"],
    week: ["settimana", "semana", "星期", "xīngqī"],
    people: ["gente", "pessoas", "人们", "rénmen"],
    child: ["bambino", "criança", "孩子", "háizi"],
    children: ["bambini", "crianças", "孩子们", "háizimen"],
    wine: ["vino", "vinho", "葡萄酒", "pútaojiǔ"],
    apple: ["mela", "maçã", "苹果", "píngguǒ"],
    apples: ["mele", "maçãs", "苹果", "píngguǒ"],
    hill: ["collina", "colina", "小山", "xiǎoshān"],
    valley: ["valle", "vale", "山谷", "shāngǔ"],
    sky: ["cielo", "céu", "天空", "tiānkōng"],
    cake: ["torta", "bolo", "蛋糕", "dàngāo"],
    law: ["legge", "lei", "法律", "fǎlǜ"],
    laws: ["leggi", "leis", "法律", "fǎlǜ"],
    rules: ["regole", "regras", "规则", "guīzé"],
    company: ["azienda", "empresa", "公司", "gōngsī"],
    companies: ["aziende", "empresas", "公司", "gōngsī"],
    risk: ["rischio", "risco", "风险", "fēngxiǎn"],
    data: ["dati", "dados", "数据", "shùjù"],
    court: ["tribunale", "tribunal", "法院", "fǎyuàn"],
    money: ["soldi", "dinheiro", "钱", "qián"],
    bank: ["banca", "banco", "银行", "yínháng"],
    banks: ["banche", "bancos", "银行", "yínháng"],
    work: ["lavoro", "trabalho", "工作", "gōngzuò"],
    government: ["governo", "governo", "政府", "zhèngfǔ"],
    year: ["anno", "ano", "年", "nián"],
    years: ["anni", "anos", "年", "nián"],
    country: ["paese", "país", "国家", "guójiā"],
    countries: ["paesi", "países", "国家", "guójiā"],
    important: ["importante", "importante", "重要", "zhòngyào"],
    question: ["domanda", "pergunta", "问题", "wèntí"],
    decision: ["decisione", "decisão", "决定", "juédìng"],
    price: ["prezzo", "preço", "价格", "jiàgé"],
    customers: ["clienti", "clientes", "顾客", "gùkè"],
    report: ["rapporto", "relatório", "报告", "bàogào"],
    team: ["squadra", "equipe", "团队", "tuánduì"],
    future: ["futuro", "futuro", "未来", "wèilái"],
    world: ["mondo", "mundo", "世界", "shìjiè"],
    simple: ["semplice", "simples", "简单", "jiǎndān"],
    free: ["libero", "livre", "自由", "zìyóu"],
    fine: ["multa", "multa", "罚款", "fákuǎn"],
    fines: ["multe", "multas", "罚款", "fákuǎn"],
    loan: ["prestito", "empréstimo", "贷款", "dàikuǎn"],
    job: ["lavoro", "emprego", "工作", "gōngzuò"],
    jobs: ["lavori", "empregos", "工作", "gōngzuò"],
    human: ["umano", "humano", "人类", "rénlèi"],
    reason: ["ragione", "razão", "原因", "yuányīn"],
    machine: ["macchina", "máquina", "机器", "jīqì"],
  };
  const LANG_INDEX = { fr: 0, de: 1, es: 2, sv: 3, hi: 4, it: 5, pt: 6, zh: 7 };
  const LANG_NAME = { fr: "French", de: "German", es: "Spanish", sv: "Swedish", hi: "Hindi", it: "Italian", pt: "Portuguese", zh: "Mandarin" };
  // The word for an English entry in a language; Mandarin at levels 1-2
  // also gets its pinyin.
  function wordIn(en, language) {
    const li = LANG_INDEX[language] ?? 0;
    if (li < 5) return { word: DICT[en][li], pinyin: null };
    const m = DICT_MORE[en];
    return { word: m[li - 5], pinyin: language === "zh" ? m[3] : null };
  }
  const DENSITY = { 1: 0.25, 2: 0.5, 3: 0.8, 4: 1 };

  // Reverse lookup: foreign word (lower case) -> English
  const REVERSE = {};
  for (const [en, tr] of Object.entries(DICT)) {
    for (const w of tr) REVERSE[w.toLowerCase()] = en;
  }
  for (const [en, tr] of Object.entries(DICT_MORE)) {
    for (const w of tr.slice(0, 3)) REVERSE[w.toLowerCase()] = en;
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
    hi: {
      hello: "नमस्ते! Now in Hindi. आपको यह लेख कैसा लगा?",
      heard: ["Mountain को हिंदी में क्या कहते हैं?", "मुझे चाय पसंद है।", "आज मौसम अच्छा है।"],
      replies: [
        "बहुत अच्छे! In Hindi the verb usually comes at the end of the sentence.",
        "शाबाश! You're getting the sounds right.",
        "बढ़िया! Let's keep going.",
      ],
      drillTopic: "food words",
      drill: [["bread", "रोटी"], ["water", "पानी"], ["apple", "सेब"]],
      yes: "चलो!", no: "कोई बात नहीं, later!", correct: "बिल्कुल सही!",
    },
    it: {
      hello: "Ciao! Ora in italiano. Che ne pensi di questo articolo?",
      heard: ["Come si dice mountain in italiano?", "Mi piace molto il caffè.", "Oggi il tempo è bello."],
      replies: [
        "Molto bene! Most Italian nouns end in -o or -a.",
        "Bravo! Your Italian sounds more natural already.",
        "Ottimo! Let's keep going.",
      ],
      drillTopic: "café words",
      drill: [["coffee", "caffè"], ["bread", "pane"], ["cake", "torta"]],
      yes: "Andiamo!", no: "Va bene, later!", correct: "Perfetto!",
    },
    pt: {
      hello: "Oi! Agora em português. O que você achou deste artigo?",
      heard: ["Como se diz mountain em português?", "Eu gosto muito de café.", "O tempo está bonito hoje."],
      replies: [
        "Muito bem! In Brazil, \u201cvocê\u201d is the everyday \u201cyou\u201d.",
        "Mandou bem! Your Portuguese is getting stronger.",
        "Ótimo! Let's keep going.",
      ],
      drillTopic: "food words",
      drill: [["bread", "pão"], ["cheese", "queijo"], ["apple", "maçã"]],
      yes: "Bora!", no: "Tudo bem, later!", correct: "Isso aí!",
    },
    zh: {
      hello: "你好 (nǐ hǎo)! Now in Mandarin. 你觉得这篇文章怎么样 (nǐ juéde zhè piān wénzhāng zěnmeyàng)?",
      heard: ["Mountain 用中文怎么说?", "我很喜欢喝咖啡。", "今天天气很好。"],
      replies: [
        "很好 (hěn hǎo)! Mandarin has four tones; listen for them.",
        "太棒了 (tài bàng le)! Your tones are getting clearer.",
        "不错 (bú cuò)! Let's keep going.",
      ],
      drillTopic: "food words",
      drill: [["bread", "面包"], ["water", "水"], ["apple", "苹果"]],
      yes: "我们开始吧 (wǒmen kāishǐ ba)!", no: "没关系 (méi guānxi), later!", correct: "对了 (duì le)!",
    },
  };

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  const handlers = {};
  let timers = [];
  let lang = (window.SAURUS_CONFIG && window.SAURUS_CONFIG.language) || "de";
  const levels = { fr: 1, de: 1, es: 1, sv: 1, hi: 1, it: 1, pt: 1, zh: 1 };
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
  // Mandarin lines carry pinyin in brackets; it shows only at levels 1-2.
  const PINYIN = /\s*\([a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü' ]+\)/g;
  function speak(text, after) {
    cancelSpeech();
    if (lang === "zh" && levels.zh > 2) text = text.replace(PINYIN, "");
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
      const { word, pinyin } = wordIn(part.toLowerCase(), language);
      let f = word;
      if (part[0] === part[0].toUpperCase()) f = f[0].toUpperCase() + f.slice(1);
      used.push({ foreign: f, en: part.toLowerCase() });
      return `<mark>${escapeHtml(f)}</mark>` + (pinyin && level <= 2 ? ` (${escapeHtml(pinyin)})` : "");
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
          emit("transcript", { who: "saurus", text: "Offline demo mode: Gemini isn't set up (no key in config.js, and gemini isn't true in supabase-config.js), so my voice is a placeholder and I can't really hear you.", final: true });
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
          const { word: f, pinyin } = wordIn(word.toLowerCase(), lang);
          speak(`In ${LANG_NAME[lang]}, “${word}” is « ${f} »${pinyin ? ` (${pinyin})` : ""}.`);
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
