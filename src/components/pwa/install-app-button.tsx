"use client";

import { useEffect, useState } from "react";
import { buttonClassName } from "@/components/ui/button";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

type State = "unknown" | "installed" | "available" | "manual";

/**
 * Chrome/Edge/Android offer an install prompt; Safari does not, so iPhone users get the manual steps.
 */
export function InstallAppButton() {
  const [state, setState] = useState<State>("unknown");
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
      setState("available");
    };
    const onInstalled = () => {
      setPrompt(null);
      setState("installed");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // Decide after the current task so a synchronously dispatched prompt event wins.
    const timer = window.setTimeout(() => setState((current) => (current === "unknown" ? (standalone ? "installed" : "manual") : current)), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (state === "unknown") return null;
  if (state === "installed") return <p className="text-sm text-ink-700">Aplikasi sudah terpasang di perangkat ini.</p>;
  if (state === "available" && prompt) {
    return (
      <button
        type="button"
        className={buttonClassName("secondary")}
        onClick={async () => {
          await prompt.prompt();
          const choice = await prompt.userChoice;
          setPrompt(null);
          setState(choice.outcome === "accepted" ? "installed" : "manual");
        }}
      >
        Pasang aplikasi
      </button>
    );
  }
  return (
    <p className="text-sm text-ink-700">
      Pasang dari menu browser: di Chrome pilih <strong>Instal aplikasi</strong>, di Safari iPhone ketuk <strong>Bagikan</strong> lalu{" "}
      <strong>Tambah ke Layar Utama</strong>.
    </p>
  );
}
