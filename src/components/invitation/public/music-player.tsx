"use client";

import { useEffect, useRef, useState } from "react";
import { INVITATION_OPEN_EVENT, readOpened } from "./opening-gate";

type PlayerState = "idle" | "playing" | "paused" | "blocked";

/**
 * Background music for the public invitation. It tries to start on its own, but browsers usually
 * block sound until the visitor interacts — then the button says so plainly instead of failing
 * silently. The first tap anywhere on the page also starts it, since that counts as interaction.
 *
 * Behind an opening cover (`openingKey`, the cover's storage key) nothing plays until the guest taps
 * "Buka Undangan": taps elsewhere on the cover do not count. A tab that already opened the cover
 * behaves as if there were none.
 */
export function MusicPlayer({ src, volume, openingKey }: { src: string; volume: number; openingKey?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<PlayerState>("idle");

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = Math.min(1, Math.max(0, volume / 100));

    let cancelled = false;
    const start = () => {
      audio
        .play()
        .then(() => {
          if (!cancelled) setState("playing");
        })
        .catch(() => {
          if (!cancelled) setState("blocked");
        });
    };
    // Autoplay was refused: the first real interaction is allowed to start the music.
    const onFirstInteraction = () => {
      if (audio.paused && !cancelled) start();
    };
    const begin = () => {
      start();
      document.addEventListener("pointerdown", onFirstInteraction, { once: true });
      document.addEventListener("keydown", onFirstInteraction, { once: true });
    };

    const waiting = openingKey !== undefined && !readOpened(openingKey);
    if (waiting) window.addEventListener(INVITATION_OPEN_EVENT, begin, { once: true });
    else begin();
    return () => {
      cancelled = true;
      document.removeEventListener("pointerdown", onFirstInteraction);
      document.removeEventListener("keydown", onFirstInteraction);
      window.removeEventListener(INVITATION_OPEN_EVENT, begin);
    };
  }, [volume, openingKey]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio
        .play()
        .then(() => setState("playing"))
        .catch(() => setState("blocked"));
    } else {
      audio.pause();
      setState("paused");
    }
  }

  const playing = state === "playing";
  const label = playing ? "Jeda musik" : "Putar musik";

  return (
    <>
      <audio ref={audioRef} src={src} loop preload="none" onPause={() => setState((s) => (s === "playing" ? "paused" : s))} />
      <button
        type="button"
        onClick={(event) => {
          // Keep the page-level "first interaction" listener from toggling it right back.
          event.stopPropagation();
          toggle();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        aria-pressed={playing}
        className="fixed right-4 bottom-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-sm font-semibold shadow-lg"
        style={{ background: "var(--inv-accent)", color: "var(--inv-surface)" }}
      >
        <span aria-hidden="true">{playing ? "❚❚" : "▶"}</span>
        <span>{label}</span>
      </button>
    </>
  );
}
