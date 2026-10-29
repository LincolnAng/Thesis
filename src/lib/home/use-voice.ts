"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Voice for the chat, using what the browser already has — nothing is sent to us or to the AI
 * until the message itself is sent.
 *
 *   useDictation  talk instead of typing: the words land in the message box to check, then send
 *   speak         read one of BAi's replies out loud
 *
 * Speech to text works in Chrome, Edge and Safari (phones included); not in Firefox, where the
 * mic simply isn't offered.
 */

/** The bits of the Web Speech API used here — TypeScript's DOM types don't include it. */
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** What the mic listens for. Filipino copes with Taglish; Bisaya has no browser model yet. */
export const VOICE_LANGS = [
  { value: "en-PH", label: "EN" },
  { value: "fil-PH", label: "FIL" },
] as const;
export type VoiceLang = (typeof VOICE_LANGS)[number]["value"];

const LANG_KEY = "bai-voice-lang";

// The language choice, remembered on this device and shared by every message box.
const langListeners = new Set<() => void>();
function readLang(): VoiceLang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (VOICE_LANGS.some((l) => l.value === saved)) return saved as VoiceLang;
  } catch {
    // No storage (private window): English it is.
  }
  return "en-PH";
}
function writeLang(l: VoiceLang) {
  try {
    localStorage.setItem(LANG_KEY, l);
  } catch {
    // Remembering is a convenience only.
  }
  langListeners.forEach((f) => f());
}
const subscribeLang = (f: () => void) => {
  langListeners.add(f);
  return () => langListeners.delete(f);
};
const noSubscribe = () => () => {};

/** Whether this browser can hear (speech to text) and speak (text to speech). False on the server. */
export function useVoiceSupport(): { hear: boolean; speak: boolean } {
  const hear = useSyncExternalStore(noSubscribe, () => recognitionCtor() !== null, () => false);
  const say = useSyncExternalStore(noSubscribe, canSpeak, () => false);
  return { hear, speak: say };
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Allow the microphone for this site, then tap the mic again.",
  "service-not-allowed": "Allow the microphone for this site, then tap the mic again.",
  "audio-capture": "No microphone found.",
  network: "Voice needs the internet — check the connection.",
};

/**
 * Talking into the message box. Whatever was already typed stays; what's said is added after
 * it, live, as it's heard. Tap again to stop — it also stops by itself after a pause.
 */
export function useDictation(value: string, onChange: (v: string) => void) {
  const supported = useVoiceSupport().hear;
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lang = useSyncExternalStore(subscribeLang, readLang, () => "en-PH" as VoiceLang);
  const rec = useRef<Recognition | null>(null);
  const latest = useRef({ value, onChange });
  useEffect(() => {
    latest.current = { value, onChange };
  });
  useEffect(() => () => rec.current?.abort(), []);

  function start() {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    setError(null);
    const base = latest.current.value.trimEnd();
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let heard = "";
      for (let i = 0; i < e.results.length; i++) heard += e.results[i][0].transcript;
      latest.current.onChange([base, heard.trim()].filter(Boolean).join(" "));
    };
    r.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") setError(ERRORS[e.error] ?? "The mic stopped — tap it to try again.");
    };
    r.onend = () => {
      setListening(false);
      rec.current = null;
    };
    rec.current = r;
    r.start();
    setListening(true);
  }

  function stop() {
    rec.current?.stop();
  }

  return { supported, listening, error, lang, setLang: writeLang, toggle: () => (listening ? stop() : start()), stop };
}

/** Markdown and links read out loud as symbols; this leaves just the words. */
function speakable(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`#>|~]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/₱\s?([\d,.]+)/g, "$1 pesos")
    .replace(/\n{2,}/g, ". ")
    .trim();
}

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Reads `text` aloud, stopping anything already being read. `onEnd` runs when it finishes or is stopped. */
export function speak(text: string, onEnd: () => void) {
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(speakable(text));
  const voices = synth.getVoices();
  const voice = voices.find((v) => v.lang === "en-PH") ?? voices.find((v) => v.lang === "fil-PH") ?? voices.find((v) => v.lang.startsWith("en"));
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? "en-PH";
  u.onend = onEnd;
  u.onerror = onEnd;
  synth.speak(u);
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}
