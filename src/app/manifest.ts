import type { MetadataRoute } from "next";
import { PWA_BACKGROUND_COLOR, PWA_ICON_VARIANTS, PWA_THEME_COLOR, pwaIconPath } from "@/lib/pwa";
import { SITE } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: `${SITE.name} — Wedding Planner`,
    short_name: SITE.name,
    description: SITE.description,
    lang: "id",
    dir: "ltr",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: PWA_BACKGROUND_COLOR,
    theme_color: PWA_THEME_COLOR,
    categories: ["lifestyle", "productivity"],
    icons: [
      { src: pwaIconPath("192"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: pwaIconPath("512"), sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: pwaIconPath("maskable-512"),
        sizes: `${PWA_ICON_VARIANTS["maskable-512"].size}x${PWA_ICON_VARIANTS["maskable-512"].size}`,
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Checklist", url: "/checklist", icons: [{ src: pwaIconPath("192"), sizes: "192x192" }] },
      { name: "Budget", url: "/budget", icons: [{ src: pwaIconPath("192"), sizes: "192x192" }] },
      { name: "Tamu", url: "/guests", icons: [{ src: pwaIconPath("192"), sizes: "192x192" }] },
    ],
  };
}
