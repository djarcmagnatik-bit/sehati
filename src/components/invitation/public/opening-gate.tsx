"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

/** Fired when the guest opens the invitation; the music player starts on it (a user gesture). */
export const INVITATION_OPEN_EVENT = "sehati:invitation-open";

const noSubscription = () => () => undefined;

export function readOpened(storageKey: string): boolean {
  try {
    return sessionStorage.getItem(storageKey) === "1";
  } catch {
    // Storage can be unavailable (private mode, blocked site data): just show the cover.
    return false;
  }
}

/**
 * Full-screen opening cover: the guest taps "Buka Undangan" before the invitation shows, which also
 * lets the music start (browsers only allow sound after an interaction). Opening it once per tab is
 * enough; reloading the same invitation in that tab skips it.
 *
 * Server-rendered as a dialog over the page. Without JavaScript a <noscript> style hides it (see
 * InvitationView), so the invitation stays readable.
 */
export function OpeningGate({
  storageKey,
  backdrop,
  children,
  buttonLabel = "Buka Undangan",
}: {
  storageKey: string;
  backdrop: ReactNode;
  children: ReactNode;
  buttonLabel?: string;
}) {
  const [state, setState] = useState<"closed" | "closing" | "open">("closed");
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Read from this tab's storage after hydration; the server always renders the cover.
  const alreadyOpened = useSyncExternalStore(
    noSubscription,
    () => readOpened(storageKey),
    () => false,
  );
  // Stays up while it slides away, even though this tab now counts as opened.
  const showing = state === "closing" || (!alreadyOpened && state !== "open");

  useEffect(() => {
    if (!showing || state !== "closed") return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    // Holds the invitation's entrance animations (.inv-after-open) until the guest opens it.
    root.dataset.invGate = "closed";
    buttonRef.current?.focus({ preventScroll: true });
    return () => {
      root.style.overflow = previous;
      delete root.dataset.invGate;
    };
  }, [showing, state]);

  function open() {
    window.dispatchEvent(new Event(INVITATION_OPEN_EVENT));
    window.scrollTo({ top: 0 });
    setState("closing");
    // Safety net if animationend never fires (e.g. the element is hidden).
    window.setTimeout(finish, 1200);
  }

  function finish() {
    // Remembered only now: writing it on tap would make the next render drop the cover mid-slide.
    try {
      sessionStorage.setItem(storageKey, "1");
    } catch {
      // Not remembering is fine.
    }
    setState("open");
    document.getElementById("isi-undangan")?.focus({ preventScroll: true });
  }

  if (!showing) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sampul-pembuka-judul"
      className={`inv-gate fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden px-6 py-12 text-center ${state === "closing" ? "inv-gate-closing" : ""}`}
      style={{ background: "var(--inv-accent-soft)", color: "var(--inv-ink)" }}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && state === "closing") finish();
      }}
    >
      {backdrop}
      <div className="relative mx-auto w-full max-w-md">
        {children}
        <button
          ref={buttonRef}
          type="button"
          onClick={open}
          className="inv-rise mt-8 inline-flex min-h-12 items-center gap-2 rounded-full px-7 text-sm font-semibold tracking-wide shadow-lg"
          style={{ background: "var(--inv-accent)", color: "var(--inv-surface)", animationDelay: "0.75s" }}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
            <rect x="3" y="5.5" width="18" height="13" rx="2" />
            <path d="m3.5 7 8.5 6 8.5-6" />
          </svg>
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
