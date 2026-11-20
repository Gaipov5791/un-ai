import { useMemo, useState } from "react";
import {
  BarVisualizer,
  RoomAudioRenderer,
  SessionProvider,
  useSession,
  useVoiceAssistant,
} from "@livekit/components-react";
import { TokenSource } from "livekit-client";
import "@livekit/components-styles";

const AGENT_NAME = "un-ai-receptionist";

type AgentLanguage = "ky" | "ru";

const COPY = {
  ky: {
    ready: "Чалууга даяр. Кыргызча сүйлөңүз.",
    call: "Чалуу",
    calling: "Туташууда…",
    end: "Аяктоо",
    disconnected: "Линияда эмес",
    connecting: "Туташууда…",
    initializing: "Жардамчы кирип жатат…",
    listening: "Угуп жатат. Кыргызча сүйлөңүз.",
    thinking: "Ойлонууда…",
    speaking: "Сүйлөп жатат",
    writing: "Жазып жатат",
    captionEmpty: "Жооп ушул жерде чыгат.",
    hints: [
      "Кыргызча сүйлөңүз. Үн жок болсо, жооп экранда жазылат.",
      "Кыргызча гана: «эртең саат ондо каралга жаздырыңыз».",
      "Веха B: бул чалуу кыргызча. Орусча аралаштыруу кабыл алынбайт.",
    ],
  },
  ru: {
    ready: "Готов к тестовому звонку. Говорите по-русски.",
    call: "Позвонить",
    calling: "Соединяем…",
    end: "Завершить",
    disconnected: "Не в линии",
    connecting: "Соединяем…",
    initializing: "Ассистент подключается…",
    listening: "Слушает. Говорите по-русски.",
    thinking: "Думает…",
    speaking: "Говорит",
    hints: [
      "Только по-русски: «записаться на осмотр завтра в десять, меня зовут Айбек».",
      "Веха B: этот звонок только на русском. Смесь не принимаем.",
      "Нужны ключи LiveKit Cloud в корневом .env и запущенные api + agent.",
    ],
  },
};

function writtenReply(segments: { id: string; text: string }[]): string {
  const byId = new Map<string, string>();
  for (const segment of segments) {
    const text = segment.text.trim();
    if (text) byId.set(segment.id, text);
  }
  return [...byId.values()].join("\n\n");
}

function CallStatus({ language }: { language: AgentLanguage }) {
  const { state, audioTrack, agentTranscriptions, agentAttributes } = useVoiceAssistant();
  const copy = COPY[language];
  const captions = language === "ky" && agentAttributes?.["unai.reply"] === "text";
  const label: Record<string, string> = {
    disconnected: copy.disconnected,
    connecting: copy.connecting,
    initializing: copy.initializing,
    listening: copy.listening,
    thinking: copy.thinking,
    speaking: captions && "writing" in copy ? copy.writing : copy.speaking,
  };
  const reply = writtenReply(agentTranscriptions);

  return (
    <>
      <p className="status">{label[state] ?? state}</p>
      {captions ? (
        <p className="caption">{reply || ("captionEmpty" in copy ? copy.captionEmpty : "")}</p>
      ) : (
        <div className="visualizer">
          <BarVisualizer state={state} trackRef={audioTrack} barCount={16} />
        </div>
      )}
    </>
  );
}

function LanguageSwitch({
  language,
  disabled,
  onChange,
}: {
  language: AgentLanguage;
  disabled: boolean;
  onChange: (next: AgentLanguage) => void;
}) {
  return (
    <div className="lang-switch" role="group" aria-label="Язык звонка">
      <button
        type="button"
        className={language === "ky" ? "lang active" : "lang"}
        disabled={disabled}
        onClick={() => onChange("ky")}
      >
        Кыргызча
      </button>
      <button
        type="button"
        className={language === "ru" ? "lang active" : "lang"}
        disabled={disabled}
        onClick={() => onChange("ru")}
      >
        Русский
      </button>
    </div>
  );
}

function TalkBooth() {
  const [language, setLanguage] = useState<AgentLanguage>("ky");
  const tokenSource = useMemo(
    () => TokenSource.endpoint("/api/token"),
    [],
  );
  const session = useSession(tokenSource, {
    agentName: AGENT_NAME,
    agentMetadata: language,
    participantAttributes: { language },
    agentConnectTimeoutMilliseconds: 25_000,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const copy = COPY[language];

  async function startCall() {
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
        setError(
          "Ассистент не вошёл в комнату за 20 секунд. Проверьте окно agent-node: должна появиться строка «received job request».",
        );
      } else if (/503|500|LIVEKIT|Failed to fetch|NetworkError|token/i.test(message)) {
        setError(
          "Нет ключей LiveKit или не запущен API на порту 8000. Скопируйте .env.example в .env и запустите apps/api и apps/agent-node.",
        );
      } else {
        setError(message);
      }
    } finally {
      window.clearTimeout(timer);
      setBusy(false);
    }
  }

  async function endCall() {
    await session.end();
    setConnected(false);
  }

  return (
    <SessionProvider session={session}>
      <RoomAudioRenderer />
      <div className="panel">
        <LanguageSwitch
          language={language}
          disabled={connected || busy}
          onChange={setLanguage}
        />
        {connected ? <CallStatus language={language} /> : <p className="status">{copy.ready}</p>}
        {error ? <p className="status error">{error}</p> : null}
        <div className="actions">
          {connected ? (
            <button className="ghost" type="button" onClick={endCall}>
              {copy.end}
            </button>
          ) : (
            <button className="primary" type="button" disabled={busy} onClick={startCall}>
              {busy ? copy.calling : copy.call}
            </button>
          )}
        </div>
      </div>
      <ul className="hints">
        {copy.hints.map((hint) => (
          <li key={hint}>{hint}</li>
        ))}
      </ul>
    </SessionProvider>
  );
}

export default function App() {
  return (
    <div className="page">
      <div className="brand">un-ai</div>
      <section className="hero">
        <span className="badge">Веха B · тестовый звонок</span>
        <h1>Ресепшен, который говорит по-кыргызски</h1>
        <p>
          Сначала выберите язык, потом звоните. Правило вехи B: один язык на весь звонок — кыргызский
          или русский. Смесь в одной фразе в эту веху не входит.
        </p>
      </section>
      <TalkBooth />
    </div>
  );
}
