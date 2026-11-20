export type AgentLanguage = "ky" | "ru";
export type CockpitMode = "demo" | "live";
export type MobileTab = "cockpit" | "hud";

export interface ChatMessage {
  id: string;
  sender: "user" | "agent";
  text: string;
  time: string;
  lang: AgentLanguage;
  serviceTag?: string;
}

export interface ExtractedData {
  service: string | null;
  time: string | null;
  name: string | null;
  intent: "booking" | "faq" | "transfer" | "idle";
}

export type OrbState = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "writing";
