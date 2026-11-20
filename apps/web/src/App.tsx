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

const AGENT_NAME = "un-ai-receptionist";
type AgentLanguage = "ky" | "ru";

interface ChatMessage {
  id: string;
  sender: "user" | "agent";
  text: string;
  time: string;
  lang: AgentLanguage;
}

interface ExtractedData {
  service: string | null;
  time: string | null;
  name: string | null;
  intent: "booking" | "faq" | "transfer" | "idle";
}

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

const PROMPT_SUGGESTIONS = {
  ky: [
    "«Саламатсызбы, эртең саат онго каралга жазып коёсузбу?»",
    "«Тиш тазалоо канча турат жана канча убакыт алат?»",
    "«Сиздердин дарегиңиздер каерде, Джалдагы филиалбы?»",
    "«Врач менен түз сүйлөшсөм болобу?»",
  ],
  ru: [
    "«Здравствуйте! Хочу записаться на осмотр на завтра в 10:00»",
    "«Сколько стоит профессиональная чистка зубов?»",
    "«Подскажите ваш точный адрес в Джале»",
    "«Соедините, пожалуйста, с администратором»",
  ],
};

const UI_TEXT = {
  ky: {
    heroBadge: "Веха B · Слышимый диалог & Тексттик ресепшен",
    heroTitle: "Кыргыз жана орус тилиндеги акылдуу үн жардамчысы",
    heroSub: "Бизнес үчүн жасалма интеллект. Кардардын үнүн тааныйт, маалыматты тактайт жана кезекке жазат.",
    langKy: "Кыргызча",
    langKyDesc: "Үн ➔ Текст (KaniTTS иштеп чыгууда)",
    langRu: "Русский",
    langRuDesc: "Үн ➔ Үн (Cartesia Sonic-3)",
    modeLive: "LiveKit Сервер",
    modeDemo: "Интерактивдүү Демо",
    callReady: "Чалууга даяр",
    calling: "Туташууда…",
    callBtn: "Чалууну баштоо",
    endBtn: "Чалууну аяктоо",
    micListening: "Сизди угуп жатат… Кыргызча сүйлөңүз",
    aiThinking: "Жооп даярдалууда…",
    aiWriting: "Текст түрүндө жооп берүүдө",
    aiSpeaking: "Ассистент сүйлөп жатат",
    disconnected: "Байланыш жок",
    voiceNotice: "Кыргызча үн модели (KaniTTS) машыгууда. Ассистент үнүңүздү угуп, экранга текст менен заматта жооп берет.",
    hintsHeader: "Сунушталган суроолор:",
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
  },
  ru: {
    heroBadge: "Веха B · Слышимый диалог & Текстовый ресепшен",
    heroTitle: "Интеллектуальный голосовой ресепшен для бизнеса",
    heroSub: "un-ai принимает звонки клиентов, консультирует по услугам клиники и автоматически бронирует слоты.",
    langKy: "Кыргызча",
    langKyDesc: "Голос ➔ Текст (KaniTTS в обучении)",
    langRu: "Русский",
    langRuDesc: "Голос ➔ Голос (Cartesia Sonic-3)",
    modeLive: "LiveKit Сервер",
    modeDemo: "Интерактивное Демо",
    callReady: "Готов к тестовому звонку",
    calling: "Соединение с ассистентом…",
    callBtn: "Позвонить",
    endBtn: "Завершить звонок",
    micListening: "Слушает вас… Говорите в микрофон",
    aiThinking: "ИИ думает…",
    aiWriting: "Печатает ответ на экране",
    aiSpeaking: "Ассистент говорит в эфир",
    disconnected: "Линия свободна",
    voiceNotice: "Кыргызский голос (KaniTTS) в активной разработке. Ассистент распознает ваш голос и выводит ответы в чат.",
    hintsHeader: "Примеры фраз для проверки:",
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
  },
};

function formatCurrentTime(): string {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

  const statusLabel = useMemo(() => {
    switch (state) {
      case "connecting":
      case "initializing":
        return text.calling;
      case "listening":
        return text.micListening;
      case "thinking":
        return text.aiThinking;
      case "speaking":
        return isKyTextOnly ? text.aiWriting : text.aiSpeaking;
      default:
        return text.disconnected;
    }
  }, [state, text, isKyTextOnly]);

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
      {/* Visual sound sphere */}
      <div className={`sound-orb-wrapper state-${state}`}>
        <div className="orb-ambient-glow" />
        <div className="orb-core">
          <div className="orb-inner-wave" />
          <div className="orb-center-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          </div>
        </div>
      </div>

      <div className="call-status-pill">
        <span className={`status-dot dot-${state}`} />
        <span className="status-text">{statusLabel}</span>
      </div>

      {/* Voice visualizer when audio is streaming */}
      {!isKyTextOnly && (
        <div className="livekit-visualizer-box">
          <BarVisualizer state={state} trackRef={audioTrack} barCount={20} />
        </div>
      )}

      {/* Real-time transcribed text stream (especially for Kyrgyz text fallback) */}
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

// Interactive Sandbox / Simulation Component
function DemoSimulator({
  language,
  onExtract,
}: {
  language: AgentLanguage;
  onExtract: (data: Partial<ExtractedData>) => void;
}) {
  const text = UI_TEXT[language];
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset conversation on language change
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
  }, [messages, isSimulating]);

  const handleSimulatePhrase = (phrase: string) => {
    if (isSimulating) return;

    // 1. Add user message
    const userMsg: ChatMessage = {
      id: "u-" + Date.now(),
      sender: "user",
      text: phrase.replace(/^«|»$/g, ""),
      time: formatCurrentTime(),
      lang: language,
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsSimulating(true);

    // Analyze phrase to simulate backend data extraction
    setTimeout(() => {
      let aiResponse = "";
      if (language === "ky") {
        if (phrase.includes("каралга") || phrase.includes("онго")) {
          aiResponse = "Эртең саат 10:00го каралга жазып коё алам. Аты-жөнүңүз ким болот?";
          onExtract({ service: "Карал / Консультация", time: "Эртең, 10:00", intent: "booking" });
        } else if (phrase.includes("тазалоо")) {
          aiResponse = "Тиш тазалоо (комплекстүү гигиена) 2 500 сом болот, болжол менен 45 мүнөт алат. Сизди жазып коёюнбу?";
          onExtract({ service: "Тиш тазалоо (гигиена)", intent: "faq" });
        } else if (phrase.includes("дарегиңиздер") || phrase.includes("Джал")) {
          aiResponse = "Биздин дарек: Бишкек ш., Джал кичи району, Ахунбаев көчөсү 142. Саат 09:00дөн 20:00гө чейин иштейбиз.";
          onExtract({ intent: "faq" });
        } else if (phrase.includes("Врач менен")) {
          aiResponse = "Түшүндүм, чалууну администраторго которуп жатам, бир мүнөт күтө туруңуз…";
          onExtract({ intent: "transfer" });
        } else {
          aiResponse = "Маалыматыңыз кабыл алынды. Дагы кандай суроолоруңуз бар?";
        }
      } else {
        if (phrase.includes("осмотр") || phrase.includes("10:00")) {
          aiResponse = "Отлично! Завтра в 10:00 есть свободное окно на осмотр. Подскажите, как вас зовут?";
          onExtract({ service: "Осмотр / консультация", time: "Завтра, 10:00", intent: "booking" });
        } else if (phrase.includes("чистка")) {
          aiResponse = "Профессиональная ультразвуковая чистка стоит 2 500 сом. Занимает около 45 минут. Записать вас?";
          onExtract({ service: "Чистка зубов", intent: "faq" });
        } else if (phrase.includes("адрес")) {
          aiResponse = "Мы находимся в микрорайоне Джал, ул. Ахунбаева 142. Работаем с 9:00 до 20:00 ежедневно, кроме воскресенья.";
          onExtract({ intent: "faq" });
        } else if (phrase.includes("администратором")) {
          aiResponse = "Перевожу звонок на дежурного администратора клиники, пожалуйста, оставайтесь на линии.";
          onExtract({ intent: "transfer" });
        } else {
          aiResponse = "Спасибо за вопрос! Чем еще я могу вам помочь?";
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
      setIsSimulating(false);
    }, 1200);
  };

  return (
    <div className="demo-simulator-wrapper">
      <div className="demo-header-notice">
        <span className="demo-chip">ДЕМО-СИМУЛЯТОР</span>
        <span>Тестирование логики диалога без необходимости запуска локального LiveKit сервера</span>
      </div>

      <div className="chat-window" ref={chatScrollRef}>
        {messages.map((m) => (
          <div key={m.id} className={`chat-message-row ${m.sender === "user" ? "user-row" : "agent-row"}`}>
            <div className="chat-avatar">
              {m.sender === "user" ? "👤" : "🎙️"}
            </div>
            <div className={`chat-bubble ${m.sender === "user" ? "user-msg" : "agent-msg"}`}>
              <div className="bubble-header">
                <span className="bubble-author">{m.sender === "user" ? "Кардар / Клиент" : "un-ai"}</span>
                {m.sender === "agent" && language === "ky" && (
                  <span className="badge-ky-reply">🇰🇬 Тексттик жооп</span>
                )}
                <span className="bubble-time">{m.time}</span>
              </div>
              <div className="bubble-text">{m.text}</div>
            </div>
          </div>
        ))}

        {isSimulating && (
          <div className="chat-message-row agent-row">
            <div className="chat-avatar">🎙️</div>
            <div className="chat-bubble agent-msg typing-bubble">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-label">{language === "ky" ? "Жооп жазылууда…" : "Ассистент печатает…"}</span>
            </div>
          </div>
        )}
      </div>

      <div className="demo-suggestions-panel">
        <p className="suggestions-title">{text.hintsHeader}</p>
        <div className="suggestions-grid">
          {PROMPT_SUGGESTIONS[language].map((phrase, i) => (
            <button
              key={i}
              type="button"
              className="suggestion-chip"
              disabled={isSimulating}
              onClick={() => handleSimulatePhrase(phrase)}
            >
              {phrase}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [language, setLanguage] = useState<AgentLanguage>("ky");
  const [mode, setMode] = useState<"live" | "demo">("demo");
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
                ✨ Демо-режим
              </button>
              <button
                type="button"
                className={`mode-btn ${mode === "live" ? "active" : ""}`}
                onClick={() => setMode("live")}
              >
                🔴 LiveKit Звонок
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
                🇰🇬 Кыргызча
              </button>
              <button
                type="button"
                className={`lang-pill ${language === "ru" ? "active" : ""}`}
                onClick={() => setLanguage("ru")}
                disabled={connected}
              >
                🇷🇺 Русский
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
                <strong>Кыргыз тили боюнча маалымат:</strong> {text.voiceNotice}
              </div>
            </div>
          )}
        </section>

        {/* Cockpit Layout */}
        <div className="cockpit-grid">
          {/* Main Stage: Call Booth or Demo Simulator */}
          <div className="stage-card">
            {mode === "live" ? (
              <SessionProvider session={session}>
                <RoomAudioRenderer />
                {connected ? (
                  <ActiveCallRoom language={language} onEndCall={handleEndLiveCall} />
                ) : (
                  <div className="call-ready-booth">
                    <div className="ready-icon-halo">
                      <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                      </svg>
                    </div>

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
            <div className="hud-card">
              <div className="hud-card-header">
                <span className="hud-icon">📋</span>
                <span className="hud-title">{text.hudHeader}</span>
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
