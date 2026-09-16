"use client";

import { useEffect, useState } from "react";

type Remaining = { days: number; hours: number; minutes: number; seconds: number; passed: boolean };

function remainingAt(targetMs: number, nowMs: number): Remaining {
  const diff = Math.max(0, targetMs - nowMs);
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1000),
    passed: targetMs <= nowMs,
  };
}

const UNITS: Array<[keyof Omit<Remaining, "passed">, string]> = [
  ["days", "Hari"],
  ["hours", "Jam"],
  ["minutes", "Menit"],
  ["seconds", "Detik"],
];

/**
 * Server-rendered with the values at request time, then ticks in the browser. `initial` keeps the
 * first paint correct even before hydration.
 */
export function CountdownTimer({ targetMs, initialNowMs }: { targetMs: number; initialNowMs: number }) {
  const [remaining, setRemaining] = useState(() => remainingAt(targetMs, initialNowMs));

  useEffect(() => {
    const update = () => setRemaining(remainingAt(targetMs, Date.now()));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [targetMs]);

  if (remaining.passed) {
    return <p className="text-lg font-medium">Hari bahagia telah tiba. Terima kasih atas doa dan kehadirannya.</p>;
  }

  return (
    <ul className="flex flex-wrap justify-center gap-3 sm:gap-4">
      {UNITS.map(([key, label]) => (
        <li
          key={key}
          className="min-w-18 rounded-[var(--inv-radius)] px-4 py-3 text-center"
          style={{ background: "var(--inv-accent-soft)", border: "1px solid var(--inv-border)" }}
        >
          <span className="block font-[family-name:var(--inv-display-font)] text-2xl font-semibold tabular-nums sm:text-3xl">
            {String(remaining[key]).padStart(2, "0")}
          </span>
          <span className="text-xs tracking-wide uppercase" style={{ color: "var(--inv-muted)" }}>
            {label}
          </span>
        </li>
      ))}
    </ul>
  );
}
