export type AgentLanguage = "ky" | "ru";

export interface MessageItem {
  id: string;
  sender: "user" | "agent";
  text: string;
  time: string;
  status?: "speaking" | "sent" | "typing";
}

export interface BookingSlot {
  service?: string;
  doctor?: string;
  datetime?: string;
  clientName?: string;
  phone?: string;
  status: "idle" | "collecting" | "confirmed";
}
