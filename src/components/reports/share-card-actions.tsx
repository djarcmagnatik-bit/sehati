"use client";

import { useState } from "react";
import { buttonClassName } from "@/components/ui/button";

/** Download always works; "Bagikan" uses the system share sheet where the browser can share files. */
export function ShareCardActions({ imageUrl }: { imageUrl: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function share() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(imageUrl, { credentials: "same-origin" });
      if (!response.ok) throw new Error("image");
      const file = new File([await response.blob()], "sehati-progres.png", { type: "image/png" });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Progres persiapan pernikahan" });
      } else {
        setMessage("Browser ini belum bisa membagikan gambar langsung. Unduh gambarnya lalu bagikan dari galeri.");
      }
    } catch (error) {
      // Closing the share sheet is not an error worth showing.
      if (!(error instanceof DOMException && error.name === "AbortError")) setMessage("Gambar belum bisa dibagikan. Coba unduh saja.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <a href={imageUrl} download="sehati-progres.png" className={buttonClassName("primary")}>
          Unduh PNG
        </a>
        <button type="button" onClick={share} disabled={busy} className={buttonClassName("secondary")}>
          {busy ? "Menyiapkan…" : "Bagikan"}
        </button>
      </div>
      {message ? (
        <p role="status" className="text-sm text-ink-700">
          {message}
        </p>
      ) : null}
    </div>
  );
}
