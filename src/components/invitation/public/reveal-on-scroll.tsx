"use client";

import { useEffect } from "react";

/**
 * Lets each invitation section fade up once as it scrolls into view. Only elements that start below
 * the fold are hidden first, so nothing already on screen blinks; without JavaScript, without
 * IntersectionObserver or with reduced motion requested, everything simply stays visible.
 */
export function RevealOnScroll() {
  useEffect(() => {
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const element = entry.target as HTMLElement;
          if (entry.isIntersecting) {
            element.classList.add("inv-reveal-in");
            requestAnimationFrame(() => element.classList.remove("inv-reveal-pending"));
            observer.unobserve(element);
            continue;
          }
          // The observer measures after layout, so this is the first reliable moment to tell which
          // sections start off screen; only those are hidden, and only once.
          if (entry.boundingClientRect.top >= window.innerHeight) element.classList.add("inv-reveal-pending");
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    for (const element of document.querySelectorAll<HTMLElement>("[data-inv-reveal]")) observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return null;
}
