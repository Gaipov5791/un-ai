import { useMemo, useState, useEffect, useRef } from "react";
import {
  BarVisualizer,
  RoomAudioRenderer,
  SessionProvider,
  useSession,
  useVoiceAssistant,
} from "@livekit/components-react";
import { TokenSource } from "livekit-client";
import "@livekit/components-styles";
import "./styles.css";
import { AgentLanguage, CockpitMode, MobileTab, ChatMessage, ExtractedData, OrbState } from "./types";

const AGENT_NAME = "un-ai-receptionist";

const PILOT_CLINIC = {
  nameKy: "«Ак-Жол» стоматологиялык клиникасы",
  nameRu: "Стоматологическая клиника «Ак-Жол»",
  address: "Бишкек ш., Джал кичи району, Ахунбаев көчөсү 142",
  hours: "Дүйшөмбү – Ишемби: 09:00 – 20:00 (Жекшемби: дем алыш)",
  phone: "+996 (555) 01-02-03",
  services: [
    { nameKy: "Карал / консультация", nameRu: "Осмотр / консультация", price: "акысыз (бесплатно)" },
    { nameKy: "Тиш тазалоо (гигиена)", nameRu: "Чистка зубов (гигиена)", price: "2 500 сом" },
    { nameKy: "Пломба коюу", nameRu: "Установка пломбы", price: "1 800 - 3 500 сом" },
  ],
};

interface SuggestionItem {
  category: "all" | "booking" | "prices" | "address" | "transfer";
  icon: string;
  textKy: string;
  textRu: string;
}

const DEMO_SUGGESTIONS: SuggestionItem[] = [
  {
    category: "booking",
    icon: "📅",
    textKy: "«Саламатсызбы, эртең саат онго каралга жазып коёсузбу?»",
    textRu: "«Здравствуйте! Хочу записаться на осмотр на завтра в 10:00»",
  },
  {
    category: "prices",
    icon: "🦷",
    textKy: "«Тиш тазалоо канча турат жана канча убакыт алат?»",
    textRu: "«Сколько стоит профессиональная чистка зубов?»",
  },
  {
    category: "prices",
    icon: "💎",
    textKy: "«Пломба коюунун баасы кандай, кепилдик барбы?»",
    textRu: "«Сколько стоит поставить пломбу и есть ли гарантия?»",
  },
  {
    category: "address",
    icon: "📍",
    textKy: "«Сиздердин дарегиңиздер каерде, Джалдагы филиалбы?»",
    textRu: "«Подскажите ваш точный адрес в Джале и как доехать»",
  },
  {
    category: "transfer",
    icon: "📞",
    textKy: "«Врач же администратор менен түз сүйлөшсөм болобу?»",
    textRu: "«Соедините, пожалуйста, с дежурным администратором»",
  },
];

const UI_TEXT = {
  ky: {
    heroBadge: "Веха B · Слышимый диалог & Тексттик ресепшен",
    heroTitle: "Кыргыз жана орус тилиндеги акылдуу үн жардамчысы",
    heroSub: "Бизнес үчүн жасалма интеллект. Кардардын үнүн тааныйт, маалыматты тактайт жана кезекке жазат.",
    langKy: "Кыргызча",
    langRu: "Русский",
    modeLive: "LiveKit Сервер",
    modeDemo: "Интерактивдүү Демо",
    tabCockpit: "🎙️ Кокпит & Диалог",
    tabHud: "📋 Ресепшен тактасы",
    callReady: "Чалууга даяр",
    calling: "Туташууда…",
    callBtn: "Чалууну баштоо",
    endBtn: "Чалууну аяктоо",
    micListening: "Сизди угуп жатат… Сүйлөңүз",
    aiThinking: "Жооп даярдалууда…",
    aiWriting: "Текст түрүндө жооп берүүдө (KY)",
    aiSpeaking: "Ассистент сүйлөп жатат (RU)",
    disconnected: "Байланыш бош",
    voiceNotice: "Кыргызча үн модели (KaniTTS) машыгууда. Ассистент үнүңүздү угуп, экранга текст менен заматта жооп берет.",
    hintsHeader: "Даяр суроолор (бир басуу менен текшериңиз):",
    transcriptHeader: "Сүйлөшүү тарыхы (Live Transcript)",
    hudHeader: "Ресепшен тактасы",
    pilotInfo: "Пилоттук маалыматтар",
    detectedIntent: "Таанылган ниет:",
    detectedService: "Кызмат:",
    detectedTime: "Убактысы:",
    detectedClient: "Кардар:",
    notSpecified: "Аныктала элек",
    intentBooking: "Кезекке жазылуу",
    intentFaq: "Баа / Дарек маалыматы",
    intentTransfer: "Кызматкерге которуу",
    systemStatus: "Система статусу",
    sttModel: "Gemini 3.5 Live (ky-KG)",
    ttsModel: "Экрандагы тексттик ресепшен",
    categories: {
      all: "Баары",
      booking: "Жазылуу",
      prices: "Баалар",
      address: "Дарек",
      transfer: "Оператор",
    },
    inputPlaceholder: "Сурооңузду жазыңыз же сунушталган баскычты басыңыз…",
    sendBtn: "Жөнөтүү",
    clearDialog: "Диалогду тазалоо",
    sphereIdle: "Кокпит даяр · Суроо бериңиз",
    mobileHudAlert: "⚡ Жаңы маалымат аныкталды: тактаны көрүү",
  },
  ru: {
    heroBadge: "Веха B · Слышимый диалог & Текстовый ресепшен",
    heroTitle: "Интеллектуальный голосовой ресепшен для бизнеса",
    heroSub: "un-ai принимает звонки клиентов, консультирует по услугам клиники и автоматически бронирует слоты.",
    langKy: "Кыргызча",
    langRu: "Русский",
    modeLive: "LiveKit Сервер",
    modeDemo: "Интерактивное Демо",
    tabCockpit: "🎙️ Кокпит и Диалог",
    tabHud: "📋 Пульт ресепшена",
    callReady: "Готов к тестовому звонку",
    calling: "Соединение с ассистентом…",
    callBtn: "Позвонить",
    endBtn: "Завершить звонок",
    micListening: "Слушает вас… Говорите в микрофон",
    aiThinking: "ИИ анализирует фразу…",
    aiWriting: "Печатает ответ на экране (KY)",
    aiSpeaking: "Ассистент говорит в эфир (RU)",
    disconnected: "Линия свободна",
    voiceNotice: "Кыргызский голос (KaniTTS) в активной разработке. Ассистент распознает ваш голос и выводит ответы в чат.",
    hintsHeader: "Примеры фраз (нажмите для проверки):",
    transcriptHeader: "Живой диалог (Live Transcript)",
    hudHeader: "Пульт ресепшена",
    pilotInfo: "Контекст пилота",
    detectedIntent: "Определено намерение:",
    detectedService: "Услуга:",
    detectedTime: "Время записи:",
    detectedClient: "Пациент:",
    notSpecified: "Не указано",
    intentBooking: "Запись на приём",
    intentFaq: "Вопрос / FAQ",
    intentTransfer: "Перевод на сотрудника",
    systemStatus: "Статус компонентов",
    sttModel: "Deepgram Nova-3 (ru)",
    ttsModel: "Cartesia Sonic-3 (ru)",
    categories: {
      all: "Все",
      booking: "Запись",
      prices: "Цены",
      address: "Адрес",
      transfer: "Оператор",
    },
    inputPlaceholder: "Напишите вопрос или выберите фразу ниже…",
    sendBtn: "Отправить",
    clearDialog: "Очистить чат",
    sphereIdle: "Кокпит готов к диалогу",
    mobileHudAlert: "⚡ Извлечены данные записи: открыть пульт",
  },
};

function formatCurrentTime(): string {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Prominent Acoustic Sound Sphere Component
function SoundOrb({
  state,
  language,
  subtext,
  interactive = false,
  onTap,
}: {
  state: OrbState;
  language: AgentLanguage;
  subtext?: string;
  interactive?: boolean;
  onTap?: () => void;
}) {
  const text = UI_TEXT[language];

  const stateLabel = useMemo(() => {
    switch (state) {
      case "connecting":
        return text.calling;
      case "listening":
        return text.micListening;
      case "thinking":
        return text.aiThinking;
      case "speaking":
        return text.aiSpeaking;
      case "writing":
        return text.aiWriting;
      default:
        return subtext || text.sphereIdle;
    }
  }, [state, text, subtext]);

  return (
    <div
      className={`sound-orb-hero state-${state} ${interactive ? "interactive-orb" : ""}`}
      onClick={onTap}
      title={interactive ? (language === "ky" ? "Үн сферасын басыңыз" : "Нажмите на акустическую сферу") : undefined}
    >
      <div className="orb-ripple-ring ring-1" />
      <div className="orb-ripple-ring ring-2" />
      <div className="orb-ambient-glow" />

      <div className="orb-core">
        <div className="orb-inner-wave" />
        <div className="orb-center-icon">
          {state === "speaking" ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          ) : state === "writing" ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <line x1="9" y1="10" x2="15" y2="10" />
            </svg>
          ) : state === "thinking" ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="spin-slow">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          )}
        </div>
      </div>

      {/* Dynamic Animated Sound Wave Bars */}
      <div className="orb-soundwave-bars" aria-hidden="true">
        <span className="wave-bar bar-1" />
        <span className="wave-bar bar-2" />
        <span className="wave-bar bar-3" />
        <span className="wave-bar bar-4" />
        <span className="wave-bar bar-5" />
        <span className="wave-bar bar-6" />
        <span className="wave-bar bar-7" />
      </div>

      <div className="call-status-pill">
        <span className={`status-dot dot-${state}`} />
        <span className="status-text">{stateLabel}</span>
      </div>
    </div>
  );
}

// LiveKit Call Room View
function ActiveCallRoom({
  language,
  onEndCall,
}: {
  language: AgentLanguage;
  onEndCall: () => void;
}) {
  const { state, audioTrack, agentTranscriptions, agentAttributes } = useVoiceAssistant();
  const text = UI_TEXT[language];
  const isKyTextOnly = language === "ky" || agentAttributes?.["unai.reply"] === "text";

  const mappedOrbState: OrbState = useMemo(() => {
    switch (state) {
      case "connecting":
      case "initializing":
        return "connecting";
      case "listening":
        return "listening";
      case "thinking":
        return "thinking";
      case "speaking":
        return isKyTextOnly ? "writing" : "speaking";
      default:
        return "idle";
    }
  }, [state, isKyTextOnly]);

  const recentReplies = useMemo(() => {
    const list: string[] = [];
    for (const t of agentTranscriptions) {
      const clean = t.text.trim();
      if (clean && !list.includes(clean)) {
        list.push(clean);
      }
    }
    return list;
  }, [agentTranscriptions]);

  return (
    <div className="call-active-container">
      {/* Visual sound sphere with multi-layer acoustic waves */}
      <SoundOrb state={mappedOrbState} language={language} />

      {/* Voice visualizer when audio is streaming */}
      {!isKyTextOnly && (
        <div className="livekit-visualizer-box">
          <BarVisualizer state={state} trackRef={audioTrack} barCount={24} />
        </div>
      )}

      {/* Real-time transcribed text stream */}
      <div className="transcript-live-box">
        <div className="transcript-box-header">
          <div className="flex-center gap-2">
            <span className="badge-agent">un-ai</span>
            <span className="transcript-title">{text.transcriptHeader}</span>
          </div>
          {isKyTextOnly && (
            <span className="tag-ky-text">
              <span className="pulse-cyan" /> Тексттик режим
            </span>
          )}
        </div>

        <div className="transcript-messages-area">
          {recentReplies.length === 0 ? (
            <div className="empty-dialogue">
              <p>«{language === "ky" ? "Саламатсызбы! Ак-Жол клиникасы. Угуп жатам…" : "Здравствуйте! Клиника Ак-Жол. Чем помочь?"}»</p>
            </div>
          ) : (
            recentReplies.map((reply, idx) => (
              <div key={idx} className="message-bubble agent-bubble">
                <div className="message-author">
                  <span className="name">un-ai</span>
                  <span className="time">{formatCurrentTime()}</span>
                </div>
                <div className="message-content">{reply}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="call-actions-row">
        <button type="button" className="btn-end-call" onClick={onEndCall}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.996.996 0 0 1 0-1.41C3.28 8.77 7.42 7 12 7s8.72 1.77 11.71 4.67c.39.39.39 1.02 0 1.41l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
          </svg>
          {text.endBtn}
        </button>
      </div>
    </div>
  );
}

// Interactive Sandbox / Simulation Component with Prominent Acoustic Sphere & Full Mobile Controls
function DemoSimulator({
  language,
  onExtract,
}: {
  language: AgentLanguage;
  onExtract: (data: Partial<ExtractedData>) => void;
}) {
  const text = UI_TEXT[language];
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [customInput, setCustomInput] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<"all" | "booking" | "prices" | "address" | "transfer">("all");
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset conversation on language change
    setOrbState("idle");
    if (language === "ky") {
      setMessages([
        {
          id: "m0",
          sender: "agent",
          text: "Саламатсызбы! «Ак-Жол» стоматологиялык клиникасы. Кандай жардам бере алам?",
          time: formatCurrentTime(),
          lang: "ky",
        },
      ]);
    } else {
      setMessages([
        {
          id: "m0",
          sender: "agent",
          text: "Здравствуйте! Стоматология «Ак-Жол». Чем могу вам помочь?",
          time: formatCurrentTime(),
          lang: "ru",
        },
      ]);
    }
  }, [language]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, orbState]);

  const handleSimulatePhrase = (phrase: string) => {
    if (orbState !== "idle") return;

    const cleanPhrase = phrase.replace(/^«|»$/g, "");
    const userMsg: ChatMessage = {
      id: "u-" + Date.now(),
      sender: "user",
      text: cleanPhrase,
      time: formatCurrentTime(),
      lang: language,
    };

    setMessages((prev) => [...prev, userMsg]);
    setOrbState("listening");

    // Phase 1: Listening -> Thinking
    setTimeout(() => {
      setOrbState("thinking");

      // Phase 2: Thinking -> Responding (Writing for KY, Speaking for RU)
      setTimeout(() => {
        let aiResponse = "";
        const lower = cleanPhrase.toLowerCase();

        if (language === "ky") {
          setOrbState("writing");
          if (lower.includes("карал") || lower.includes("онго") || lower.includes("жазып")) {
            aiResponse = "Эртең саат 10:00го каралга жазып коё алам. Аты-жөнүңүз ким болот?";
            onExtract({ service: "Карал / Консультация", time: "Эртең, 10:00", intent: "booking" });
          } else if (lower.includes("тазалоо") || lower.includes("гигиена")) {
            aiResponse = "Тиш тазалоо (комплекстүү гигиена) 2 500 сом болот, болжол менен 45 мүнөт алат. Сизди жазып коёюнбу?";
            onExtract({ service: "Тиш тазалоо (гигиена)", intent: "faq" });
          } else if (lower.includes("пломба")) {
            aiResponse = "Пломба коюу 1 800дөн 3 500 сомго чейин. 1 жыл кепилдик беребиз. Кайсы тишиңиз ооруп жатат?";
            onExtract({ service: "Пломба коюу", intent: "faq" });
          } else if (lower.includes("дарек") || lower.includes("джал")) {
            aiResponse = "Биздин дарек: Бишкек ш., Джал кичи району, Ахунбаев көчөсү 142. Саат 09:00дөн 20:00гө чейин иштейбиз.";
            onExtract({ intent: "faq" });
          } else if (lower.includes("врач") || lower.includes("администратор")) {
            aiResponse = "Түшүндүм, чалууну администраторго которуп жатам, бир мүнөт күтө туруңуз…";
            onExtract({ intent: "transfer" });
          } else {
            aiResponse = "Маалыматыңыз кабыл алынды. Клиникабыз боюнча дагы кандай суроолоруңуз бар?";
          }
        } else {
          setOrbState("speaking");
          if (lower.includes("осмотр") || lower.includes("10:00") || lower.includes("запис")) {
            aiResponse = "Отлично! Завтра в 10:00 есть свободное окно на осмотр. Подскажите, как вас зовут?";
            onExtract({ service: "Осмотр / консультация", time: "Завтра, 10:00", intent: "booking" });
          } else if (lower.includes("чистк") || lower.includes("гигиен")) {
            aiResponse = "Профессиональная ультразвуковая чистка стоит 2 500 сом. Занимает около 45 минут. Записать вас?";
            onExtract({ service: "Чистка зубов", intent: "faq" });
          } else if (lower.includes("пломб")) {
            aiResponse = "Установка световой пломбы стоит от 1 800 до 3 500 сом с гарантией 1 год. Беспокоит зуб?";
            onExtract({ service: "Пломба коюу / Пломба", intent: "faq" });
          } else if (lower.includes("адрес") || lower.includes("джал")) {
            aiResponse = "Мы находимся в микрорайоне Джал, ул. Ахунбаева 142. Работаем с 9:00 до 20:00 ежедневно, кроме воскресенья.";
            onExtract({ intent: "faq" });
          } else if (lower.includes("администратор") || lower.includes("соедините")) {
            aiResponse = "Перевожу звонок на дежурного администратора клиники, пожалуйста, оставайтесь на линии.";
            onExtract({ intent: "transfer" });
          } else {
            aiResponse = "Спасибо за вопрос! Я могу проконсультировать по ценам, графику или записать вас на приём.";
          }
        }

        setMessages((prev) => [
          ...prev,
          {
            id: "a-" + Date.now(),
            sender: "agent",
            text: aiResponse,
            time: formatCurrentTime(),
            lang: language,
          },
        ]);

        // Phase 3: Finish response after 1.4s
        setTimeout(() => {
          setOrbState("idle");
        }, 1400);
      }, 700);
    }, 600);
  };

  const handleSubmitCustom = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!customInput.trim() || orbState !== "idle") return;
    handleSimulatePhrase(customInput.trim());
    setCustomInput("");
  };

  const handleClear = () => {
    setOrbState("idle");
    setMessages([
      {
        id: "m0",
        sender: "agent",
        text:
          language === "ky"
            ? "Саламатсызбы! «Ак-Жол» стоматологиялык клиникасы. Кандай жардам бере алам?"
            : "Здравствуйте! Стоматология «Ак-Жол». Чем могу вам помочь?",
        time: formatCurrentTime(),
        lang: language,
      },
    ]);
  };

  const filteredSuggestions = useMemo(() => {
    if (selectedCategory === "all") return DEMO_SUGGESTIONS;
    return DEMO_SUGGESTIONS.filter((s) => s.category === selectedCategory);
  }, [selectedCategory]);

  return (
    <div className="demo-simulator-wrapper">
      {/* Prominent Acoustic Sphere in Demo Mode */}
      <div className="demo-sphere-container">
        <SoundOrb
          state={orbState}
          language={language}
          interactive={orbState === "idle"}
          onTap={() => {
            if (orbState === "idle") {
              const random = DEMO_SUGGESTIONS[Math.floor(Math.random() * DEMO_SUGGESTIONS.length)];
              handleSimulatePhrase(language === "ky" ? random.textKy : random.textRu);
            }
          }}
        />
      </div>

      {/* Demo Controls Header */}
      <div className="demo-toolbar">
        <div className="demo-tag-group">
          <span className="demo-chip">ДЕМО-СИМУЛЯТОР</span>
          <span className="demo-subline">
            {language === "ky" ? "Интерактивдүү маек" : "Тестирование реплик"}
          </span>
        </div>
        <button type="button" className="btn-clear-chat" onClick={handleClear} title={text.clearDialog}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          <span className="btn-clear-text">{text.clearDialog}</span>
        </button>
      </div>

      {/* Chat Dialogue Window */}
      <div className="chat-window" ref={chatScrollRef}>
        {messages.map((m) => (
          <div key={m.id} className={`chat-message-row ${m.sender === "user" ? "user-row" : "agent-row"}`}>
            <div className="chat-avatar">
              {m.sender === "user" ? "👤" : "🎙️"}
            </div>
            <div className={`chat-bubble ${m.sender === "user" ? "user-msg" : "agent-msg"}`}>
              <div className="bubble-header">
                <span className="bubble-author">{m.sender === "user" ? (language === "ky" ? "Кардар" : "Клиент") : "un-ai"}</span>
                {m.sender === "agent" && language === "ky" && (
                  <span className="badge-ky-reply">🇰🇬 Тексттик жооп</span>
                )}
                <span className="bubble-time">{m.time}</span>
              </div>
              <div className="bubble-text">{m.text}</div>
            </div>
          </div>
        ))}

        {orbState === "thinking" && (
          <div className="chat-message-row agent-row">
            <div className="chat-avatar">🎙️</div>
            <div className="chat-bubble agent-msg typing-bubble">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-label">{text.aiThinking}</span>
            </div>
          </div>
        )}

        {orbState === "writing" && (
          <div className="chat-message-row agent-row">
            <div className="chat-avatar">🎙️</div>
            <div className="chat-bubble agent-msg typing-bubble">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-label">{text.aiWriting}</span>
            </div>
          </div>
        )}
      </div>

      {/* Input Bar: Type custom question or tap quick phrases */}
      <form className="demo-input-bar" onSubmit={handleSubmitCustom}>
        <input
          type="text"
          className="demo-text-input"
          placeholder={text.inputPlaceholder}
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          disabled={orbState !== "idle"}
        />
        <button
          type="submit"
          className="btn-demo-send"
          disabled={!customInput.trim() || orbState !== "idle"}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
          <span className="send-text-label">{text.sendBtn}</span>
        </button>
      </form>

      {/* Quick Category Filters for Mobile and Desktop */}
      <div className="demo-category-scroll">
        {(["all", "booking", "prices", "address", "transfer"] as const).map((cat) => (
          <button
            key={cat}
            type="button"
            className={`cat-pill ${selectedCategory === cat ? "active" : ""}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {text.categories[cat]}
          </button>
        ))}
      </div>

      {/* Suggestions Chips Carousel / Grid */}
      <div className="demo-suggestions-panel">
        <p className="suggestions-title">{text.hintsHeader}</p>
        <div className="suggestions-grid">
          {filteredSuggestions.map((item, i) => {
            const phrase = language === "ky" ? item.textKy : item.textRu;
            return (
              <button
                key={i}
                type="button"
                className="suggestion-chip"
                disabled={orbState !== "idle"}
                onClick={() => handleSimulatePhrase(phrase)}
              >
                <span className="chip-icon">{item.icon}</span>
                <span className="chip-text">{phrase}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [language, setLanguage] = useState<AgentLanguage>("ky");
  const [mode, setMode] = useState<CockpitMode>("demo");
  const [mobileTab, setMobileTab] = useState<MobileTab>("cockpit");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [extractedData, setExtractedData] = useState<ExtractedData>({
    service: null,
    time: null,
    name: null,
    intent: "idle",
  });

  const text = UI_TEXT[language];

  const tokenSource = useMemo(() => TokenSource.endpoint("/api/token"), []);
  const session = useSession(tokenSource, {
    agentName: AGENT_NAME,
    agentMetadata: language,
    participantAttributes: { language },
    agentConnectTimeoutMilliseconds: 25_000,
  });

  const handleStartLiveCall = async () => {
    setError(null);
    setBusy(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20_000);
    try {
      await session.start({ signal: controller.signal });
      setConnected(true);
    } catch (err) {
      await session.end().catch(() => undefined);
      setConnected(false);
      const message = err instanceof Error ? err.message : "Не удалось начать звонок";
      if (controller.signal.aborted || /abort/i.test(message)) {
        setError("Ассистент не вошел в комнату за 20 секунд. Проверьте apps/agent-node.");
      } else {
        setError(message + " — Проверьте apps/api на порту 8000 и .env с ключами LiveKit.");
      }
    } finally {
      window.clearTimeout(timer);
      setBusy(false);
    }
  };

  const handleEndLiveCall = async () => {
    await session.end();
    setConnected(false);
  };

  const hasExtractedInfo = Boolean(extractedData.service || extractedData.time || extractedData.intent !== "idle");

  return (
    <div className="unai-app">
      {/* Top Navbar */}
      <header className="unai-navbar">
        <div className="navbar-container">
          <div className="brand-group">
            <div className="brand-logo-mark">
              <span className="logo-pulse" />
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2v20M17 5v14M7 5v14M22 9v6M2 9v6" strokeLinecap="round" />
              </svg>
            </div>
            <div className="brand-text">
              <span className="brand-title">ün-ai</span>
              <span className="brand-badge">Кыргызстан</span>
            </div>
          </div>

          <div className="nav-controls">
            {/* Mode switch */}
            <div className="mode-toggle-group">
              <button
                type="button"
                className={`mode-btn ${mode === "demo" ? "active" : ""}`}
                onClick={() => setMode("demo")}
              >
                ✨ Демо
              </button>
              <button
                type="button"
                className={`mode-btn ${mode === "live" ? "active" : ""}`}
                onClick={() => setMode("live")}
              >
                🔴 LiveKit
              </button>
            </div>

            {/* Language toggle */}
            <div className="lang-pill-selector">
              <button
                type="button"
                className={`lang-pill ${language === "ky" ? "active" : ""}`}
                onClick={() => setLanguage("ky")}
                disabled={connected}
              >
                🇰🇬 KY
              </button>
              <button
                type="button"
                className={`lang-pill ${language === "ru" ? "active" : ""}`}
                onClick={() => setLanguage("ru")}
                disabled={connected}
              >
                🇷🇺 RU
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="main-content">
        {/* Hero Section */}
        <section className="hero-section">
          <div className="hero-badge-tag">{text.heroBadge}</div>
          <h1 className="hero-heading">{text.heroTitle}</h1>
          <p className="hero-description">{text.heroSub}</p>

          {language === "ky" && (
            <div className="ky-voice-banner">
              <div className="banner-icon">ℹ️</div>
              <div className="banner-body">
                <strong>Кыргыз тили:</strong> {text.voiceNotice}
              </div>
            </div>
          )}
        </section>

        {/* Mobile View Switcher (Visible on mobile/tablet screens <= 860px) */}
        <div className="mobile-tab-bar" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === "cockpit"}
            className={`mobile-tab-btn ${mobileTab === "cockpit" ? "active" : ""}`}
            onClick={() => setMobileTab("cockpit")}
          >
            {text.tabCockpit}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === "hud"}
            className={`mobile-tab-btn ${mobileTab === "hud" ? "active" : ""}`}
            onClick={() => setMobileTab("hud")}
          >
            {text.tabHud}
            {hasExtractedInfo && <span className="tab-notify-dot" />}
          </button>
        </div>

        {/* Mobile Floating HUD Alert when intent is detected and in Cockpit tab */}
        {hasExtractedInfo && mobileTab === "cockpit" && (
          <button
            type="button"
            className="mobile-hud-pill-alert"
            onClick={() => setMobileTab("hud")}
          >
            <span className="hud-pill-pulse" />
            <span className="hud-pill-text">
              <strong>{extractedData.intent === "booking" ? "📅 " + text.intentBooking : "💬 " + text.intentFaq}:</strong>{" "}
              {extractedData.service || extractedData.time || "Маалымат такталды"}
            </span>
            <span className="hud-pill-arrow">➔</span>
          </button>
        )}

        {/* Cockpit Grid */}
        <div className={`cockpit-grid mobile-view-${mobileTab}`}>
          {/* Main Stage: Call Booth or Demo Simulator */}
          <div className="stage-card">
            {mode === "live" ? (
              <SessionProvider session={session}>
                <RoomAudioRenderer />
                {connected ? (
                  <ActiveCallRoom language={language} onEndCall={handleEndLiveCall} />
                ) : (
                  <div className="call-ready-booth">
                    <SoundOrb state="idle" language={language} subtext={text.callReady} />

                    <h2 className="booth-title">{text.callReady}</h2>
                    <p className="booth-subtitle">
                      {language === "ky"
                        ? "Микрофон аркылуу сүйлөшүү жүргүзүлөт. Жооптор экранда реалдуу убакытта чыгат."
                        : "Полноценный двусторонний голосовой диалог на русском языке."}
                    </p>

                    {error && <div className="call-error-alert">{error}</div>}

                    <button
                      type="button"
                      className="btn-primary-call"
                      disabled={busy}
                      onClick={handleStartLiveCall}
                    >
                      {busy ? (
                        <span className="flex-center gap-2">
                          <span className="spinner-sm" /> {text.calling}
                        </span>
                      ) : (
                        <span className="flex-center gap-2">
                          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                            <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-1.57 1.97c-2.83-1.35-5.43-3.9-6.83-6.84l1.97-1.56a1 1 0 0 0 .27-1.01A12.72 12.72 0 0 1 8.74 4c0-.55-.45-1-1-1H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.44c0-.55-.45-1-.99-1z"/>
                          </svg>
                          {text.callBtn}
                        </span>
                      )}
                    </button>
                  </div>
                )}
              </SessionProvider>
            ) : (
              <DemoSimulator
                language={language}
                onExtract={(data) => setExtractedData((prev) => ({ ...prev, ...data }))}
              />
            )}
          </div>

          {/* Right Sidebar: Smart Reception HUD & Pilot Info */}
          <aside className="hud-sidebar">
            {/* Extracted Booking Entities */}
            <div className="hud-card highlight-card">
              <div className="hud-card-header">
                <span className="hud-icon">📋</span>
                <span className="hud-title">{text.hudHeader}</span>
                {hasExtractedInfo && <span className="hud-badge-live">Live</span>}
              </div>

              <div className="hud-body">
                <div className="hud-field-row">
                  <span className="hud-field-label">{text.detectedIntent}</span>
                  <span className={`hud-intent-tag intent-${extractedData.intent}`}>
                    {extractedData.intent === "booking"
                      ? text.intentBooking
                      : extractedData.intent === "faq"
                      ? text.intentFaq
                      : extractedData.intent === "transfer"
                      ? text.intentTransfer
                      : text.notSpecified}
                  </span>
                </div>

                <div className="hud-field-row">
                  <span className="hud-field-label">{text.detectedService}</span>
                  <span className="hud-field-value">{extractedData.service || text.notSpecified}</span>
                </div>

                <div className="hud-field-row">
                  <span className="hud-field-label">{text.detectedTime}</span>
                  <span className="hud-field-value">{extractedData.time || text.notSpecified}</span>
                </div>
              </div>
            </div>

            {/* Pilot Clinic Context */}
            <div className="hud-card">
              <div className="hud-card-header">
                <span className="hud-icon">🏥</span>
                <span className="hud-title">{text.pilotInfo}</span>
              </div>

              <div className="hud-body clinic-info-body">
                <div className="clinic-name">{language === "ky" ? PILOT_CLINIC.nameKy : PILOT_CLINIC.nameRu}</div>
                <div className="clinic-meta">
                  <p>📍 {PILOT_CLINIC.address}</p>
                  <p>🕒 {PILOT_CLINIC.hours}</p>
                  <p>📞 {PILOT_CLINIC.phone}</p>
                </div>

                <div className="services-mini-list">
                  <span className="services-header">Прейскурант пилота:</span>
                  {PILOT_CLINIC.services.map((s, idx) => (
                    <div key={idx} className="service-row">
                      <span>{language === "ky" ? s.nameKy : s.nameRu}</span>
                      <span className="service-price">{s.price}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* System Engine Status */}
            <div className="hud-card sys-card">
              <div className="hud-card-header">
                <span className="hud-icon">⚡</span>
                <span className="hud-title">{text.systemStatus}</span>
              </div>
              <div className="hud-body">
                <div className="sys-engine-row">
                  <span className="engine-name">STT (Таануу):</span>
                  <span className="engine-val">{text.sttModel}</span>
                </div>
                <div className="sys-engine-row">
                  <span className="engine-name">TTS (Синтез):</span>
                  <span className="engine-val">{text.ttsModel}</span>
                </div>
                <div className="sys-engine-row">
                  <span className="engine-name">Оркестрация:</span>
                  <span className="engine-val">LiveKit Agents v1.6</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
