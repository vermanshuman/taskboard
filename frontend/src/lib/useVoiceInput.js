"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Click-to-talk speech input on top of the browser's Web Speech API
 * (Chrome, Edge, Safari; not Firefox). start() listens until the speaker
 * pauses (or stop() is called), then hands the final transcript to onFinal.
 * No server involved.
 *
 *   const voice = useVoiceInput({ onTranscript, onFinal, onError });
 *   voice.supported   // false → hide the mic button
 *   voice.listening
 *   voice.start() / voice.stop()
 */
export function useVoiceInput({ onTranscript, onFinal, onError, lang } = {}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const finalRef = useRef("");
  const cbs = useRef({ onTranscript, onFinal, onError });
  useEffect(() => {
    cbs.current = { onTranscript, onFinal, onError };
  });

  useEffect(() => {
    // Feature-detect after mount so SSR and the first client render agree.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
    return () => recRef.current?.abort?.();
  }, []);

  const start = useCallback(() => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor || recRef.current) return;
    const rec = new Ctor();
    rec.lang = lang || navigator.language || "en-US";
    rec.continuous = false; // ends by itself after the first pause in speech
    rec.interimResults = true;
    finalRef.current = "";

    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript + " ";
        else interim += r[0].transcript;
      }
      cbs.current.onTranscript?.((finalRef.current + interim).trim());
    };
    rec.onerror = (e) => {
      // "aborted" and "no-speech" are routine (released early / silence).
      if (e.error !== "aborted" && e.error !== "no-speech") cbs.current.onError?.(e.error);
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      const text = finalRef.current.trim();
      if (text) cbs.current.onFinal?.(text);
    };

    try {
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch (err) {
      cbs.current.onError?.(String(err));
    }
  }, [lang]);

  const stop = useCallback(() => {
    recRef.current?.stop(); // onend fires after the last final result
  }, []);

  return { supported, listening, start, stop };
}
